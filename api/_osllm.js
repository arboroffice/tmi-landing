// TMI OS - the single place agent model calls go through, so every call is
// costed and (optionally) traced. Wrapping messages.create here means token
// usage, dollar cost, and latency are captured for the COO, the workers, the
// builder, and the brain without each caller reinventing it. Two capabilities
// fall out of one wrapper: observability (a span per model call) and cost
// optimization (real dollars attributed to a tenant, worker, and workflow).

const db = require('./_db');

// Dollars per 1,000,000 tokens as [input, output]. Unknown model ids fall back
// to Opus-tier pricing so cost is never silently zero.
const PRICES = {
  'claude-opus-4-8': [5, 25], 'claude-opus-4-7': [5, 25], 'claude-opus-4-6': [5, 25],
  'claude-sonnet-5': [3, 15], 'claude-sonnet-4-6': [3, 15],
  'claude-haiku-4-5': [1, 5], 'claude-fable-5': [10, 50],
};

function costOf(model, tokensIn, tokensOut) {
  const p = PRICES[model] || [5, 25];
  return (Number(tokensIn || 0) * p[0] + Number(tokensOut || 0) * p[1]) / 1e6;
}

// Run an Anthropic messages.create call and capture usage, cost, and latency.
// opts: { tenantId, label, trace, workflow, worker_id }.
// Always logs usage to os_llm_usage (best-effort) and, if a trace is passed,
// records a span on it. Never lets logging break the underlying call.
async function create(client, params, opts = {}) {
  const t0 = Date.now();
  let msg = null, err = null;
  try {
    msg = await client.messages.create(params);
  } catch (e) {
    err = e;
  }
  const ms = Date.now() - t0;
  const u = (msg && msg.usage) || {};
  const tokensIn = u.input_tokens || 0;
  const tokensOut = u.output_tokens || 0;
  const cacheRead = u.cache_read_input_tokens || 0;
  const cost = costOf(params.model, tokensIn, tokensOut);
  const label = String(opts.label || opts.kind || 'call').slice(0, 80);

  // Always-on cost capture. One small doc per model call, so cost can be rolled
  // up per tenant, worker, and workflow later.
  try {
    await db.insert('os_llm_usage', {
      tenant_id: opts.tenantId != null ? String(opts.tenantId) : null,
      model: params.model || null,
      label,
      workflow: opts.workflow || null,
      worker_id: opts.worker_id || null,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cache_read: cacheRead,
      cost_usd: cost,
      ms,
      ok: !err,
      created_at: new Date().toISOString(),
    });
  } catch (_e) { /* usage logging must never break a model call */ }

  // Trace span, if a trace was threaded in.
  if (opts.trace) {
    try {
      require('./_ostrace').addSpan(opts.trace, {
        name: label, kind: 'llm', model: params.model, ms,
        tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: cost,
        error: err ? String(err.message || err).slice(0, 200) : null,
      });
    } catch (_e) { /* tracing must never break a model call */ }
  }

  if (err) throw err;
  return msg;
}

module.exports = { create, costOf, PRICES };
