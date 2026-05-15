const { requireAuth, cors } = require('./_auth');
const { getSupabase } = require('./_supabase');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    let q = db.from('content_posts')
      .select('*, content_ideas(title, world, series)')
      .order('created_at', { ascending: false });

    const { status, platform, month } = req.query || {};
    if (status) q = q.eq('status', status);
    if (platform) q = q.eq('platform', platform);
    if (month) {
      const start = new Date(month + '-01');
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      q = q.gte('scheduled_at', start.toISOString()).lt('scheduled_at', end.toISOString());
    }

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  }

  if (req.method === 'POST') {
    const { idea_id, platform, format, content_body, image_url, status, scheduled_at, posted_at, notes } = req.body || {};
    const { data, error } = await db.from('content_posts').insert({
      idea_id: idea_id || null,
      platform: platform || null,
      format: format || null,
      content_body: content_body || null,
      image_url: image_url || null,
      status: status || 'draft',
      scheduled_at: scheduled_at || null,
      posted_at: posted_at || null,
      notes: notes || null,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'PUT') {
    const { id, ...updates } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const { data, error } = await db.from('content_posts').update(updates).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await db.from('content_posts').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  return res.status(405).end();
};
