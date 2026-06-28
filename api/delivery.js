// Delivery deliverables API — list and manage the build artifacts the Delivery
// agent drafts for active clients, and trigger a delivery run on demand.
//
//   GET  /api/delivery                    -> deliverables, newest first
//   GET  /api/delivery?summary=1          -> counts by status
//   GET  /api/delivery?client_id=<id>     -> deliverables for one client
//   PATCH/POST { id, status, ...fields }  -> update a deliverable
//   PATCH/POST { trigger: true, limit }   -> fire the Delivery agent

const { cors, requireAuth } = require('./_auth');
const dbx = require('./_db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    try {
      // Summary: counts by status.
      if (req.query.summary) {
        const rows = await dbx.list('deliverables', {});
        const byStatus = {};
        for (const r of rows) {
          const s = r.status || 'unknown';
          byStatus[s] = (byStatus[s] || 0) + 1;
        }
        return res.json({ total: rows.length, byStatus });
      }

      const where = [];
      if (req.query.client_id) where.push(['client_id', '==', req.query.client_id]);

      const rows = await dbx.list('deliverables', {
        where,
        order: 'created_at',
        ascending: false,
      });
      await dbx.hydrateMany(rows, 'client_id', 'clients', 'client');
      return res.json(rows || []);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'PATCH' || req.method === 'POST') {
    const body = req.body || {};

    // Trigger a delivery run.
    if (body.trigger) {
      try {
        const { runDelivery } = await import('../agents/gtm/delivery.js');
        const limit = parseInt(body.limit, 10) || 5;
        const stats = await runDelivery({ limit });
        return res.json({ ok: true, stats });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    // Update a deliverable.
    const { id, ...updates } = body;
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      updates.updated_at = new Date().toISOString();
      const data = await dbx.update('deliverables', id, updates);
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
};
