const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    const { contact_id, lead_id, client_id } = req.query || {};
    let query = db
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (contact_id) query = query.eq('contact_id', contact_id);
    if (lead_id) query = query.eq('lead_id', lead_id);
    if (client_id) query = query.eq('client_id', client_id);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  }

  if (req.method === 'POST') {
    const { contact_id, lead_id, client_id, type, title, body } = req.body || {};
    if (!type || !title) return res.status(400).json({ error: 'type and title required' });
    const { data, error } = await db.from('activities').insert({
      contact_id: contact_id || null,
      lead_id: lead_id || null,
      client_id: client_id || null,
      type,
      title,
      body: body || null,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  res.status(405).json({ error: 'Method not allowed' });
};
