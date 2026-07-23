// TMI OS — the connector framework. SERVER-ONLY.
//
// A connector is a named external system (QuickBooks, Stripe, Slack, ...) plus
// the set of actions a worker can take against it. This module holds the
// REGISTRY of what exists, and execute() actually performs the call for the
// connectors that are wired live. Everything a worker does to the outside world
// flows through here so it can be policy-gated and audited one level up
// (_ostools). Secrets are passed in by the caller; this module never reads the
// vault itself and never returns secret contents.
//
// Honesty rule: never invent fake success. A connector that is not wired live
// returns { ok:false, staged:true, note } so the caller can hold it, and a real
// call that fails returns { ok:false, error } with the real reason.

const { safeFetch } = require('./_osnet');

// -------------------------------------------------------------------------
// REGISTRY: provider key -> { label, auth, actions:[{key,label,writes,params}] }
// -------------------------------------------------------------------------
const REGISTRY = {
  http: {
    label: 'Generic HTTP',
    auth: 'http',
    actions: [
      { key: 'request', label: 'HTTP request', writes: true, params: ['method', 'url', 'headers', 'body'] },
      { key: 'webhook', label: 'Post to webhook', writes: true, params: ['url', 'payload'] },
    ],
  },
  quickbooks: {
    label: 'QuickBooks',
    auth: 'oauth',
    actions: [
      { key: 'create_invoice', label: 'Create invoice', writes: true, params: ['customer_id', 'line_items', 'amount', 'due_date'] },
      { key: 'get_invoice', label: 'Get invoice', writes: false, params: ['invoice_id'] },
      { key: 'mark_paid', label: 'Mark invoice paid', writes: true, params: ['invoice_id', 'amount'] },
      { key: 'list_customers', label: 'List customers', writes: false, params: ['limit'] },
      { key: 'create_customer', label: 'Create customer', writes: true, params: ['name', 'email', 'phone'] },
    ],
  },
  servicetitan: {
    label: 'ServiceTitan',
    auth: 'oauth',
    actions: [
      { key: 'book_job', label: 'Book a job', writes: true, params: ['customer_id', 'job_type', 'start', 'summary'] },
      { key: 'get_job', label: 'Get a job', writes: false, params: ['job_id'] },
      { key: 'list_jobs', label: 'List jobs', writes: false, params: ['status', 'limit'] },
      { key: 'update_customer', label: 'Update customer', writes: true, params: ['customer_id', 'fields'] },
    ],
  },
  stripe: {
    label: 'Stripe',
    auth: 'apikey',
    actions: [
      { key: 'create_payment_link', label: 'Create payment link', writes: true, params: ['line_items', 'amount', 'currency'] },
      { key: 'get_balance', label: 'Get balance', writes: false, params: [] },
      { key: 'list_charges', label: 'List charges', writes: false, params: ['limit'] },
      { key: 'refund', label: 'Refund a charge', writes: true, params: ['charge', 'payment_intent', 'amount'] },
    ],
  },
  google: {
    label: 'Google Workspace',
    auth: 'oauth',
    actions: [
      { key: 'send_email', label: 'Send email', writes: true, params: ['to', 'subject', 'body'] },
      { key: 'create_calendar_event', label: 'Create calendar event', writes: true, params: ['title', 'start', 'end', 'attendees'] },
      { key: 'list_calendar_events', label: 'List calendar events', writes: false, params: ['start', 'end'] },
    ],
  },
  slack: {
    label: 'Slack',
    auth: 'oauth',
    actions: [
      { key: 'post_message', label: 'Post a message', writes: true, params: ['channel', 'text'] },
    ],
  },
};

function getConnector(provider) {
  return REGISTRY[provider] || null;
}

function listConnectors() {
  return Object.keys(REGISTRY).map((provider) => {
    const c = REGISTRY[provider];
    return { provider, label: c.label, auth: c.auth, actions: c.actions };
  });
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

// Pull a bearer/api key out of a secret object under any of the common names.
function pickKey(secret) {
  if (!secret || typeof secret !== 'object') return '';
  return String(
    secret.api_key || secret.secret_key || secret.token ||
    secret.access_token || secret.bot_token || secret.key || ''
  ).trim();
}

// Read a fetch Response as parsed json when possible, else raw text.
async function readBody(r) {
  const ct = r.headers.get('content-type') || '';
  const text = await r.text();
  if (ct.includes('application/json')) {
    try { return JSON.parse(text); } catch (_e) { return text; }
  }
  try { return JSON.parse(text); } catch (_e) { return text; }
}

// Flatten a params object into Stripe's bracketed form encoding.
function toStripeForm(obj, prefix, out) {
  out = out || new URLSearchParams();
  if (obj == null) return out;
  for (const k of Object.keys(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    const v = obj[k];
    if (v == null) continue;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item != null && typeof item === 'object') toStripeForm(item, `${key}[${i}]`, out);
        else out.append(`${key}[${i}]`, String(item));
      });
    } else if (typeof v === 'object') {
      toStripeForm(v, key, out);
    } else {
      out.append(key, String(v));
    }
  }
  return out;
}

const NOT_WIRED = { ok: false, staged: true, note: 'connector not yet wired live' };

// -------------------------------------------------------------------------
// execute(provider, actionKey, params, secret) -> {ok, result, staged?, error?}
// -------------------------------------------------------------------------
async function execute(provider, actionKey, params, secret) {
  const p = params || {};
  try {
    switch (provider) {
      case 'http':
        return await executeHttp(actionKey, p);
      case 'stripe':
        return await executeStripe(actionKey, p, secret);
      case 'slack':
        return await executeSlack(actionKey, p, secret);
      case 'quickbooks':
      case 'servicetitan':
      case 'google':
        // No native call yet. Hold as staged rather than faking a result.
        return Object.assign({}, NOT_WIRED);
      default:
        return { ok: false, error: `Unknown provider: ${provider}` };
    }
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

// --- http: the generic, fully working fallback connector ---
async function executeHttp(actionKey, p) {
  if (actionKey === 'request') {
    if (!p.url) return { ok: false, error: 'url is required' };
    const method = String(p.method || 'GET').toUpperCase();
    const headers = (p.headers && typeof p.headers === 'object') ? p.headers : {};
    const init = { method, headers: Object.assign({}, headers) };
    if (!['GET', 'HEAD'].includes(method) && p.body != null) {
      if (typeof p.body === 'object') {
        init.body = JSON.stringify(p.body);
        if (!Object.keys(init.headers).some((h) => h.toLowerCase() === 'content-type')) {
          init.headers['Content-Type'] = 'application/json';
        }
      } else {
        init.body = String(p.body);
      }
    }
    try {
      const r = await safeFetch(String(p.url), init);   // SSRF-guarded
      const body = await readBody(r);
      return { ok: r.ok, result: { status: r.status, ok: r.ok, body } };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  }
  if (actionKey === 'webhook') {
    if (!p.url) return { ok: false, error: 'url is required' };
    try {
      const r = await safeFetch(String(p.url), {           // SSRF-guarded
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p.payload != null ? p.payload : {}),
      });
      const body = await readBody(r);
      return { ok: r.ok, result: { status: r.status, ok: r.ok, body } };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  }
  return { ok: false, error: `Unknown http action: ${actionKey}` };
}

// --- stripe: real REST calls with a Bearer secret key ---
async function executeStripe(actionKey, p, secret) {
  const key = pickKey(secret);
  if (!key) return Object.assign({}, NOT_WIRED, { note: 'Stripe key not connected' });
  const base = 'https://api.stripe.com';
  const authHeaders = { Authorization: `Bearer ${key}` };

  async function get(path) {
    const r = await fetch(base + path, { method: 'GET', headers: authHeaders });
    const body = await readBody(r);
    return { ok: r.ok, result: r.ok ? body : undefined, error: r.ok ? undefined : `Stripe returned ${r.status}` };
  }
  async function post(path, form) {
    const r = await fetch(base + path, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded' }, authHeaders),
      body: toStripeForm(form).toString(),
    });
    const body = await readBody(r);
    return { ok: r.ok, result: r.ok ? body : undefined, error: r.ok ? undefined : `Stripe returned ${r.status}` };
  }

  try {
    switch (actionKey) {
      case 'get_balance':
        return await get('/v1/balance');
      case 'list_charges': {
        const limit = Math.max(1, Math.min(100, Number(p.limit) || 10));
        return await get(`/v1/charges?limit=${limit}`);
      }
      case 'create_payment_link': {
        const form = {};
        if (p.line_items) form.line_items = p.line_items;
        // Allow an ad-hoc price when no line_items are supplied.
        if (!p.line_items && (p.amount || p.price)) {
          form.line_items = [{ price: p.price, quantity: p.quantity || 1 }];
        }
        Object.keys(p).forEach((k) => {
          if (!['line_items', 'amount', 'price', 'quantity'].includes(k)) form[k] = p[k];
        });
        return await post('/v1/payment_links', form);
      }
      case 'refund': {
        const form = {};
        if (p.charge) form.charge = p.charge;
        if (p.payment_intent) form.payment_intent = p.payment_intent;
        if (p.amount != null) form.amount = p.amount;
        return await post('/v1/refunds', form);
      }
      default:
        return { ok: false, error: `Unknown stripe action: ${actionKey}` };
    }
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

// --- slack: post via an incoming webhook or a bot token ---
async function executeSlack(actionKey, p, secret) {
  if (actionKey !== 'post_message') return { ok: false, error: `Unknown slack action: ${actionKey}` };
  const text = String(p.text || '');
  const webhookUrl = secret && (secret.webhook_url || secret.webhook);
  try {
    if (webhookUrl) {
      const r = await fetch(String(webhookUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, channel: p.channel || undefined }),
      });
      if (!r.ok) return { ok: false, error: `Slack webhook returned ${r.status}` };
      return { ok: true, result: { delivered: true, via: 'webhook' } };
    }
    const token = pickKey(secret);
    if (!token) return Object.assign({}, NOT_WIRED, { note: 'Slack not connected' });
    if (!p.channel) return { ok: false, error: 'channel is required' };
    const r = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ channel: p.channel, text }),
    });
    const body = await readBody(r);
    if (!r.ok) return { ok: false, error: `Slack returned ${r.status}` };
    if (body && body.ok === false) return { ok: false, error: `Slack error: ${body.error || 'unknown'}`, result: body };
    return { ok: true, result: body };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

module.exports = { REGISTRY, getConnector, listConnectors, execute };
