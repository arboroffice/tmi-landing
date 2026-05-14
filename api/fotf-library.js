const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    const { id, category, audience } = req.query;

    if (id) {
      const { data, error } = await db
        .from('fotf_library')
        .select('*')
        .eq('id', id)
        .single();
      if (error) return res.status(404).json({ error: error.message });
      return res.json(data);
    }

    let query = db
      .from('fotf_library')
      .select('*')
      .order('created_at', { ascending: false });

    if (category) query = query.eq('category', category);
    if (audience) query = query.eq('audience', audience);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const { data, error } = await db
      .from('fotf_library')
      .insert({ ...body, updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'PUT') {
    const { id, ...fields } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });

    fields.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from('fotf_library')
      .update(fields)
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await db
      .from('fotf_library')
      .delete()
      .eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
