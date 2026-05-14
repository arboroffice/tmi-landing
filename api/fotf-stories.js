const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    const { member_id } = req.query;

    let query = db
      .from('fotf_stories')
      .select('*, fotf_members(id,name,email,founder_number)')
      .order('submitted_at', { ascending: false });

    if (member_id) query = query.eq('member_id', member_id);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (!body.member_id) return res.status(400).json({ error: 'member_id required' });
    if (!body.story_text) return res.status(400).json({ error: 'story_text required' });

    const { data, error } = await db
      .from('fotf_stories')
      .insert({ member_id: body.member_id, story_text: body.story_text })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await db
      .from('fotf_stories')
      .delete()
      .eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
