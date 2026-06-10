const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

// Ops Machine — singleton JSON documents (vision, flywheel, strategy_ladder, strategy_offers)
// GET  /api/os-kv?key=vision            -> { key, value }
// PUT  /api/os-kv  { key, value }        -> upsert
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      const { key } = req.query;
      if (!key) return res.status(400).json({ error: 'key required' });
      const data = await db.findOne('os_kv', 'key', key);
      return res.json(data || { key, value: {} });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const { key, value } = req.body || {};
      if (!key) return res.status(400).json({ error: 'key required' });
      const data = await db.upsertByField('os_kv', 'key', key, {
        value: value || {},
        updated_at: new Date().toISOString(),
      });
      return res.json(data);
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
