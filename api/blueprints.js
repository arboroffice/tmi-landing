// Admin: generated build blueprints/plans.
const { cors, requireAuth } = require('./_auth');
const db = require('./_db');
module.exports = async function handler(req, res) {
  cors(res); if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;
  try {
    const where = req.query.lead_id ? [['lead_id', '==', req.query.lead_id]] : [];
    return res.json(await db.list('blueprints', { where, order: 'created_at', ascending: false, limit: 300 }));
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
