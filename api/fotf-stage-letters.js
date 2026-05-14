const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    const { stage } = req.query;

    if (stage) {
      const { data, error } = await db
        .from('fotf_stage_letters')
        .select('*')
        .eq('stage', stage)
        .single();
      if (error) return res.status(404).json({ error: error.message });
      return res.json(data);
    }

    const { data, error } = await db
      .from('fotf_stage_letters')
      .select('*')
      .order('stage', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'PUT') {
    const { id, subject, body: letterBody } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });

    const { data, error } = await db
      .from('fotf_stage_letters')
      .update({ subject, body: letterBody, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  res.status(405).json({ error: 'Method not allowed' });
};
