// Admin: per-client onboarding checklist items. Filter by ?client_id= or ?lead_id=.
const { cors, requireAuth } = require('./_auth');
const db = require('./_db');
module.exports = async function handler(req, res) {
  cors(res); if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;
  try {
    const where = [];
    if (req.query.client_id) where.push(['client_id', '==', req.query.client_id]);
    if (req.query.lead_id) where.push(['lead_id', '==', req.query.lead_id]);
    if (req.method === 'PATCH' || req.method === 'POST') {
      const { id, ...f } = req.body || {}; if (!id) return res.status(400).json({ error: 'id required' });
      await db.update('onboarding_tasks', id, f); return res.json({ ok: true });
    }
    return res.json(await db.list('onboarding_tasks', { where, order: 'created_at', ascending: true, limit: 500 }));
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
