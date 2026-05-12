const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  // GET — list or single
  if (req.method === 'GET') {
    const { id } = req.query;
    if (id) {
      const { data, error } = await db.from('contacts').select('*').eq('id', id).single();
      if (error) return res.status(404).json({ error: error.message });
      return res.json(data);
    }
    const { data, error } = await db
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  // POST — create
  if (req.method === 'POST') {
    const body = req.body || {};
    const { data, error } = await db
      .from('contacts')
      .insert({
        first_name: body.first_name,
        last_name: body.last_name || null,
        email: body.email || null,
        phone: body.phone || null,
        company: body.company || null,
        title: body.title || null,
        audience: body.audience || null,
        niche: body.niche || null,
        notes: body.notes || null
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // PUT — update
  if (req.method === 'PUT') {
    const body = req.body || {};
    const { id } = body;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { data, error } = await db
      .from('contacts')
      .update({
        first_name: body.first_name,
        last_name: body.last_name || null,
        email: body.email || null,
        phone: body.phone || null,
        company: body.company || null,
        title: body.title || null,
        audience: body.audience || null,
        niche: body.niche || null,
        notes: body.notes || null
      })
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  // DELETE
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await db.from('contacts').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
