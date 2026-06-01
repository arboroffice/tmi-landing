const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

// Ops Machine — Level 10 scorecard.
// GET returns { metrics, entries, crm } where crm holds live numbers pulled
// from the existing CRM tables for metrics with source='crm'.
// POST/PUT/DELETE handle both metrics and weekly entries via body discriminator.
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    const [metricsRes, entriesRes] = await Promise.all([
      db.from('os_scorecard_metrics').select('*').order('sort', { ascending: true }),
      db.from('os_scorecard_entries').select('*').order('week_of', { ascending: false }).limit(800)
    ]);
    if (metricsRes.error) return res.status(500).json({ error: metricsRes.error.message });
    const metrics = metricsRes.data || [];
    const entries = entriesRes.data || [];

    // Live CRM numbers for source='crm' metrics
    const crm = {};
    const needsCrm = metrics.some(m => m.source === 'crm');
    if (needsCrm) {
      try {
        const [clients, leads, proposals, invoices] = await Promise.all([
          db.from('clients').select('status, mrr').then(r => r.data || []),
          db.from('leads').select('status').then(r => r.data || []),
          db.from('proposals').select('status').then(r => r.data || []).catch(() => []),
          db.from('invoices').select('status, amount').then(r => r.data || []).catch(() => [])
        ]);
        const active = clients.filter(c => c.status === 'active');
        crm.active_clients = active.length;
        crm.mrr = active.reduce((s, c) => s + (parseFloat(c.mrr) || 0), 0);
        crm.total_leads = leads.length;
        crm.open_proposals = (proposals || []).filter(p => ['sent', 'viewed', 'draft'].includes(p.status)).length;
        crm.overdue_invoices = (invoices || []).filter(i => i.status === 'overdue').length;
      } catch { /* CRM pull best-effort */ }
    }

    return res.json({ metrics, entries, crm });
  }

  if (req.method === 'POST') {
    const { metric, entry } = req.body || {};
    if (entry) {
      if (!entry.metric_id || !entry.week_of) return res.status(400).json({ error: 'metric_id and week_of required' });
      // Upsert by metric+week so re-entering a week overwrites
      const existing = await db.from('os_scorecard_entries').select('id')
        .eq('metric_id', entry.metric_id).eq('week_of', entry.week_of).maybeSingle();
      if (existing.data) {
        const { data, error } = await db.from('os_scorecard_entries').update({ value: entry.value }).eq('id', existing.data.id).select().single();
        if (error) return res.status(500).json({ error: error.message });
        return res.json(data);
      }
      const { data, error } = await db.from('os_scorecard_entries').insert(entry).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }
    if (metric) {
      if (!metric.name) return res.status(400).json({ error: 'name required' });
      const { data, error } = await db.from('os_scorecard_metrics').insert(metric).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }
    return res.status(400).json({ error: 'metric or entry required' });
  }

  if (req.method === 'PUT') {
    const { metric } = req.body || {};
    if (!metric?.id) return res.status(400).json({ error: 'metric.id required' });
    const { id, ...fields } = metric;
    const { data, error } = await db.from('os_scorecard_metrics').update(fields).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const { id, type } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const table = type === 'entry' ? 'os_scorecard_entries' : 'os_scorecard_metrics';
    const { error } = await db.from(table).delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
