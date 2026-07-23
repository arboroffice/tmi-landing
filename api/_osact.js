// TMI OS — the action layer. This is what turns a worker from a dashboard into
// staff: it takes an output's proposed action (a message meant for a specific
// recipient) and actually delivers it through a real channel, records a
// permanent audit entry in os_actions, and reports delivery status. Policy lives
// on the worker (autonomy) and the tenant (which channels are connected and
// whether autopilot is on); this module only executes what policy already allows.
//
// deliver() is intentionally tenant-agnostic so the same rails serve the OS, the
// admin internal agents, and the city-reps copilot.

const db = require('./_db');
const policy = require('./_ospolicy');

// Push through a real provider. Returns { status, detail }.
//   'sent'   -> delivered through a provider
//   'filed'  -> internal action, nothing to send (recorded as handled)
//   'staged' -> valid external action but no provider/channel configured (safe no-op)
//   'failed' -> provider returned an error
async function deliver({ channel, to, from, subject, body }) {
  const ch = String(channel || 'internal');
  if (ch === 'internal' || !to) return { status: 'filed', detail: 'Filed internally.' };

  if (ch === 'email') {
    const key = process.env.RESEND_API_KEY;
    if (!key || !from) return { status: 'staged', detail: 'Email channel not connected.' };
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject: subject || '(no subject)', text: body }),
      });
      if (!r.ok) return { status: 'failed', detail: `Email provider returned ${r.status}` };
      return { status: 'sent', detail: `Emailed ${to}.` };
    } catch (e) { return { status: 'failed', detail: e.message }; }
  }

  if (ch === 'sms') {
    const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !tok || !from) return { status: 'staged', detail: 'SMS channel not connected.' };
    try {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
      });
      if (!r.ok) return { status: 'failed', detail: `SMS provider returned ${r.status}` };
      return { status: 'sent', detail: `Texted ${to}.` };
    } catch (e) { return { status: 'failed', detail: e.message }; }
  }

  return { status: 'staged', detail: `Channel ${ch} is not connected.` };
}

// Normalize a proposed action (from a worker or an output) into a clean spec, or
// null if there is nothing deliverable.
function normalizeAction(a) {
  if (!a || typeof a !== 'object') return null;
  let channel = ['email', 'sms', 'internal'].includes(a.channel) ? a.channel : (a.to ? 'email' : 'internal');
  const to = a.to ? String(a.to).slice(0, 200).trim() : '';
  if (channel !== 'internal' && !to) return null;
  return {
    channel,
    to,
    subject: a.subject ? String(a.subject).slice(0, 200) : '',
    body: a.body ? String(a.body).slice(0, 8000) : '',
  };
}

// The channel this tenant has turned on, with its verified from-identity, or null.
function tenantChannel(tenant, channel) {
  const ch = (tenant && tenant.channels && tenant.channels[channel]) || null;
  return ch && ch.enabled && ch.from ? ch : null;
}

// Whether this action can fire without a human clicking approve. This is now
// governed by the full policy engine: the kill switch (tenant.paused), explicit
// per-action rules (os_policies, attached as tenant._policies), spend limits, and
// the autonomy + autopilot defaults. Only an 'auto' decision fires unattended;
// 'approve' holds for a human and 'deny' blocks. Callers that want per-action
// rules enforced must attach tenant._policies first (executeWorker does).
function canAutoFire(tenant, worker, action) {
  if (!action) return false;
  const type = action.channel === 'internal' ? 'internal' : String(action.channel || 'external_write');
  const amount = typeof action.amount === 'number' ? action.amount : undefined;
  return policy.evaluate(tenant, worker, type, amount).mode === 'auto';
}

// Execute an action for a tenant and write a permanent audit entry.
// ctx = { tenant, output?, worker_name?, actor }. rawAction may be a spec or null.
async function runAction(ctx, rawAction) {
  const action = normalizeAction(rawAction);
  if (!action) return null;
  const tid = ctx.tenant.id;

  let from = '';
  if (action.channel !== 'internal') {
    const ch = tenantChannel(ctx.tenant, action.channel);
    from = ch ? ch.from : '';
  }
  const body = action.body || (ctx.output && ctx.output.body) || '';
  const result = await deliver({ channel: action.channel, to: action.to, from, subject: action.subject, body });

  const rec = await db.insert('os_actions', {
    tenant_id: tid,
    output_id: (ctx.output && ctx.output.id) || null,
    worker_name: ctx.worker_name || (ctx.output && ctx.output.worker_name) || null,
    channel: action.channel, to: action.to, subject: action.subject,
    body: body.slice(0, 4000),
    status: result.status, detail: result.detail,
    actor: ctx.actor || 'system', created_at: new Date().toISOString(),
  });
  return rec;
}

// A short human summary of what an action will do, for the inbox card.
function describeAction(a) {
  const action = normalizeAction(a);
  if (!action) return null;
  if (action.channel === 'internal') return 'Files internally';
  const verb = action.channel === 'sms' ? 'Text' : 'Email';
  return `${verb} ${action.to}`;
}

module.exports = { deliver, normalizeAction, tenantChannel, canAutoFire, runAction, describeAction };
