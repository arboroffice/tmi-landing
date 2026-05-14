const { requireAuth, cors } = require('./_auth');
const { getSupabase } = require('./_supabase');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  const db = getSupabase();

  if (req.method === 'GET') {
    let q = db.from('content_ideas').select('*').order('created_at', { ascending: false });
    const { world, status, series, format, search } = req.query || {};
    if (world)  q = q.eq('world', world);
    if (status) q = q.eq('status', status);
    if (series) q = q.eq('series', series);
    if (format) q = q.contains('formats', [format]);
    if (search) q = q.ilike('title', `%${search}%`);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { title, hook, notes, world, territory, formats, series, status, platforms, post_url, scheduled_at, posted_at } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });
    const { data, error } = await db.from('content_ideas').insert({
      title, hook: hook || null, notes: notes || null,
      world: world || null, territory: territory || null,
      formats: formats?.length ? formats : null,
      series: series || null,
      status: status || 'idea',
      platforms: platforms?.length ? platforms : null,
      post_url: post_url || null,
      scheduled_at: scheduled_at || null,
      posted_at: posted_at || null,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'PUT') {
    const { id, title, hook, notes, world, territory, formats, series, status, platforms, post_url, scheduled_at, posted_at } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const { data, error } = await db.from('content_ideas').update({
      title, hook: hook || null, notes: notes || null,
      world: world || null, territory: territory || null,
      formats: formats?.length ? formats : null,
      series: series || null, status,
      platforms: platforms?.length ? platforms : null,
      post_url: post_url || null,
      scheduled_at: scheduled_at || null,
      posted_at: posted_at || null,
    }).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await db.from('content_ideas').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
};
