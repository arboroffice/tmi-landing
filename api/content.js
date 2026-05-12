const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    const { data, error } = await db
      .from('content_items')
      .select('*')
      .order('publish_date', { ascending: true, nullsFirst: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  }

  if (req.method === 'POST') {
    const { title, category, status, publish_date, filename, notes } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });
    const { data, error } = await db.from('content_items').insert({
      title,
      category: category || null,
      status: status || 'idea',
      publish_date: publish_date || null,
      filename: filename || null,
      notes: notes || null,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'PUT') {
    const { id, ...updates } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const { data, error } = await db.from('content_items').update(updates).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    await db.from('content_items').delete().eq('id', id);
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
