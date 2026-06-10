const { requireAuth, cors } = require('./_auth');
const db = require('./_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
  if (req.method === 'GET') {
    const { status, platform, month } = req.query || {};
    const where = [];
    if (status) where.push(['status', '==', status]);
    if (platform) where.push(['platform', '==', platform]);
    let rows = await db.list('content_posts', { where, order: 'created_at', ascending: false });

    if (month) {
      const start = new Date(month + '-01');
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      const startIso = start.toISOString();
      const endIso = end.toISOString();
      rows = rows.filter(r => r.scheduled_at && r.scheduled_at >= startIso && r.scheduled_at < endIso);
    }

    // Embedded join: content_posts.idea_id -> content_ideas
    await db.hydrateMany(rows, 'idea_id', 'content_ideas', 'content_ideas');
    return res.json(rows || []);
  }

  if (req.method === 'POST') {
    const { idea_id, platform, format, content_body, image_url, status, scheduled_at, posted_at, notes } = req.body || {};
    const row = await db.insert('content_posts', {
      idea_id: idea_id || null,
      platform: platform || null,
      format: format || null,
      content_body: content_body || null,
      image_url: image_url || null,
      status: status || 'draft',
      scheduled_at: scheduled_at || null,
      posted_at: posted_at || null,
      notes: notes || null,
    });
    return res.json(row);
  }

  if (req.method === 'PUT') {
    const { id, ...updates } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const row = await db.update('content_posts', id, updates);
    return res.json(row);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    await db.remove('content_posts', id);
    return res.json({ ok: true });
  }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  return res.status(405).end();
};
