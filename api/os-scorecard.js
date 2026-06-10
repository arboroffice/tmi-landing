const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

// Ops Machine — Level 10 scorecard.
// GET returns { metrics, entries, crm } where crm holds live numbers pulled
// from the existing CRM tables for metrics with source='crm'.
// POST/PUT/DELETE handle both metrics and weekly entries via body discriminator.
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
  if (req.method === 'GET') {
    const [metricsRaw, entriesRaw] = await Promise.all([
      db.list('os_scorecard_metrics', { order: 'sort', ascending: true }),
      db.list('os_scorecard_entries', { order: 'week_of', ascending: false, limit: 800 })
    ]);
    const metrics = metricsRaw || [];
    const entries = entriesRaw || [];

    // Live CRM numbers for source='crm' metrics
    const crm = {};
    const needsCrm = metrics.some(m => m.source === 'crm');
    if (needsCrm) {
      try {
        const [clients, leads, proposals, invoices] = await Promise.all([
          db.list('clients', {}),
          db.list('leads', {}),
          db.list('proposals', {}).catch(() => []),
          db.list('invoices', {}).catch(() => [])
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
      const matches = await db.list('os_scorecard_entries', { where: [['metric_id', '==', entry.metric_id], ['week_of', '==', entry.week_of]] });
      const existing = matches[0];
      if (existing) {
        const data = await db.update('os_scorecard_entries', existing.id, { value: entry.value });
        return res.json(data);
      }
      const data = await db.insert('os_scorecard_entries', entry);
      return res.status(201).json(data);
    }
    if (metric) {
      if (!metric.name) return res.status(400).json({ error: 'name required' });
      const data = await db.insert('os_scorecard_metrics', metric);
      return res.status(201).json(data);
    }
    return res.status(400).json({ error: 'metric or entry required' });
  }

  if (req.method === 'PUT') {
    const { metric } = req.body || {};
    if (!metric?.id) return res.status(400).json({ error: 'metric.id required' });
    const { id, ...fields } = metric;
    const data = await db.update('os_scorecard_metrics', id, fields);
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const { id, type } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const table = type === 'entry' ? 'os_scorecard_entries' : 'os_scorecard_metrics';
    await db.remove(table, id);
    return res.json({ ok: true });
  }

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
