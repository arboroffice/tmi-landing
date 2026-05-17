const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    const { id, tier, industry } = req.query;

    if (id) {
      const { data, error } = await db
        .from('audit_submissions')
        .select('*')
        .eq('id', id)
        .single();
      if (error) return res.status(404).json({ error: error.message });
      return res.json(data);
    }

    let query = db
      .from('audit_submissions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (tier)     query = query.eq('tier', tier);
    if (industry) query = query.ilike('industry', `%${industry}%`);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'PATCH') {
    const { id, status, notes } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const fields = {};
    if (status !== undefined) fields.status = status;
    if (notes  !== undefined) fields.notes  = notes;
    const { data, error } = await db
      .from('audit_submissions')
      .update(fields)
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  res.status(405).json({ error: 'Method not allowed' });
};
