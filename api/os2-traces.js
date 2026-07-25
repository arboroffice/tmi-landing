// TMI OS - observability read API. Two things the owner (and we) can finally
// see: what an agent run actually did (traces, with every step and model call),
// and what it costs (real dollars rolled up from every model call). Scoped to
// the caller's tenant.
//
// POST { action }
//   'list'  { kind?, limit? }   -> { traces }   recent runs, newest first
//   'get'   { trace_id }        -> { trace }     one run with all its spans
//   'cost'  { days? }           -> { cost }      dollar + token rollup

const db = require('./_db');
const { requireTenant, cors } = require('./_tenant-auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;
  const tid = t.tenant_id;
  const b = req.body || {};
  const action = String(b.action || 'list');

  try {
    if (action === 'get') {
      const traceId = String(b.trace_id || '');
      if (!traceId) return res.status(400).json({ error: 'trace_id required' });
      const rows = await db.list('os_traces', { where: [['tenant_id', '==', tid], ['trace_id', '==', traceId]], limit: 1 }).catch(() => []);
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json({ trace: rows[0] });
    }

    if (action === 'cost') {
      const days = Math.max(1, Math.min(90, Number(b.days) || 30));
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      const rows = (await db.list('os_llm_usage', { where: [['tenant_id', '==', tid]], limit: 5000 }).catch(() => []))
        .filter(r => String(r.created_at || '') >= cutoff);
      const out = { days, calls: rows.length, total_usd: 0, tokens_in: 0, tokens_out: 0, by_workflow: {}, by_day: {} };
      for (const r of rows) {
        const c = Number(r.cost_usd) || 0;
        out.total_usd += c;
        out.tokens_in += Number(r.tokens_in) || 0;
        out.tokens_out += Number(r.tokens_out) || 0;
        const wf = r.workflow || r.label || 'other';
        out.by_workflow[wf] = (out.by_workflow[wf] || 0) + c;
        const day = String(r.created_at || '').slice(0, 10);
        if (day) out.by_day[day] = (out.by_day[day] || 0) + c;
      }
      out.total_usd = Math.round(out.total_usd * 1e4) / 1e4;
      for (const k of Object.keys(out.by_workflow)) out.by_workflow[k] = Math.round(out.by_workflow[k] * 1e4) / 1e4;
      for (const k of Object.keys(out.by_day)) out.by_day[k] = Math.round(out.by_day[k] * 1e4) / 1e4;
      return res.status(200).json({ cost: out });
    }

    // default: list recent traces
    const limit = Math.max(1, Math.min(200, Number(b.limit) || 60));
    let rows = await db.list('os_traces', { where: [['tenant_id', '==', tid]], limit: 800 }).catch(() => []);
    if (b.kind) rows = rows.filter(r => r.kind === String(b.kind));
    rows.sort((a, c) => String(c.started_at || '').localeCompare(String(a.started_at || '')));
    // trim span bodies out of the list view; the detail view (get) carries them
    const traces = rows.slice(0, limit).map(r => ({
      trace_id: r.trace_id, kind: r.kind, label: r.label, status: r.status,
      error: r.error || null, span_count: r.span_count || (r.spans || []).length,
      tokens_in: r.tokens_in || 0, tokens_out: r.tokens_out || 0,
      cost_usd: r.cost_usd || 0, ms: r.ms || 0,
      started_at: r.started_at, meta: r.meta || {},
    }));
    return res.status(200).json({ traces });
  } catch (e) {
    console.error('os2-traces:', e.message);
    return res.status(500).json({ error: 'Could not load traces' });
  }
};
