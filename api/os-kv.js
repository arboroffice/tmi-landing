const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

// Ops Machine — singleton JSON documents (vision, flywheel, strategy_ladder, strategy_offers)
// GET  /api/os-kv?key=vision            -> { key, value }
// PUT  /api/os-kv  { key, value }        -> upsert
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: 'key required' });
    const { data, error } = await db.from('os_kv').select('*').eq('key', key).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || { key, value: {} });
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    const { key, value } = req.body || {};
    if (!key) return res.status(400).json({ error: 'key required' });
    const { data, error } = await db
      .from('os_kv')
      .upsert({ key, value: value || {}, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  res.status(405).json({ error: 'Method not allowed' });
};
