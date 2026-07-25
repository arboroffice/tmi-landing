// TMI OS - agent tracing. A run (the COO answering, a worker producing, the
// builder designing a company) opens a trace; every model call and notable step
// becomes a span with latency, tokens, cost, and any error. The whole tree
// persists to os_traces so that when something goes wrong you can see exactly
// what happened, when, and why, instead of guessing from a flat log.
//
// Best-effort by design: tracing must never break the thing it is tracing. A
// trace is a plain object threaded through a run; spans accumulate on it and it
// is written once at the end.

const db = require('./_db');

// Open a trace. kind: 'coo' | 'worker' | 'intake' | 'brain' | 'cascade' | ...
function startTrace(tenantId, opts = {}) {
  return {
    tenant_id: tenantId != null ? String(tenantId) : null,
    trace_id: 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    kind: String(opts.kind || 'run').slice(0, 40),
    label: String(opts.label || '').slice(0, 120),
    status: 'running',
    spans: [],
    tokens_in: 0, tokens_out: 0, cost_usd: 0,
    started_at: new Date().toISOString(),
    _t0: Date.now(),
    meta: (opts.meta && typeof opts.meta === 'object') ? opts.meta : {},
  };
}

// Record a span on a trace and roll its totals up. Safe on a null trace.
function addSpan(trace, span) {
  if (!trace) return null;
  const s = {
    name: String(span.name || 'step').slice(0, 80),
    kind: String(span.kind || 'step').slice(0, 24),
    ms: span.ms != null ? Math.round(span.ms) : null,
    tokens_in: span.tokens_in || 0,
    tokens_out: span.tokens_out || 0,
    cost_usd: span.cost_usd || 0,
    error: span.error || null,
    at: new Date().toISOString(),
  };
  if (span.model) s.model = String(span.model).slice(0, 40);
  if (span.meta && typeof span.meta === 'object') s.meta = span.meta;
  trace.spans = trace.spans || [];
  trace.spans.push(s);
  trace.tokens_in += s.tokens_in;
  trace.tokens_out += s.tokens_out;
  trace.cost_usd += s.cost_usd;
  if (s.error) trace.status = 'error';
  // Cap so a runaway loop can never bloat the doc.
  if (trace.spans.length > 200) trace.spans = trace.spans.slice(-200);
  return s;
}

// Convenience: time an async step and record it as a span (captures errors).
async function step(trace, name, fn, meta) {
  const t0 = Date.now();
  try {
    const out = await fn();
    addSpan(trace, { name, kind: 'step', ms: Date.now() - t0, meta });
    return out;
  } catch (e) {
    addSpan(trace, { name, kind: 'step', ms: Date.now() - t0, error: String(e.message || e).slice(0, 200), meta });
    throw e;
  }
}

// Close a trace and persist it. opts: { status, error }. Best-effort write.
async function finishTrace(trace, opts = {}) {
  if (!trace) return null;
  trace.ms = Date.now() - (trace._t0 || Date.now());
  trace.ended_at = new Date().toISOString();
  if (opts.error) {
    trace.status = 'error';
    trace.error = String(opts.error.message || opts.error).slice(0, 300);
  } else if (trace.status !== 'error') {
    trace.status = opts.status || 'ok';
  }
  trace.cost_usd = Math.round(trace.cost_usd * 1e6) / 1e6;
  const doc = {
    tenant_id: trace.tenant_id, trace_id: trace.trace_id, kind: trace.kind, label: trace.label,
    status: trace.status, error: trace.error || null,
    spans: trace.spans || [], span_count: (trace.spans || []).length,
    tokens_in: trace.tokens_in, tokens_out: trace.tokens_out, cost_usd: trace.cost_usd,
    ms: trace.ms, started_at: trace.started_at, ended_at: trace.ended_at,
    meta: trace.meta || {},
  };
  try { await db.insert('os_traces', doc); } catch (_e) { /* never break the run */ }
  return doc;
}

module.exports = { startTrace, addSpan, step, finishTrace };
