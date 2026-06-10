const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      const rows = await db.list('content_items', {});
      // Order by publish_date ascending, nulls last
      rows.sort((a, b) => {
        const av = a.publish_date, bv = b.publish_date;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (av < bv) return -1;
        if (av > bv) return 1;
        return 0;
      });
      return res.json(rows || []);
    }

    if (req.method === 'POST') {
      const { title, category, status, publish_date, filename, notes } = req.body || {};
      if (!title) return res.status(400).json({ error: 'title required' });
      const row = await db.insert('content_items', {
        title,
        category: category || null,
        status: status || 'idea',
        publish_date: publish_date || null,
        filename: filename || null,
        notes: notes || null,
      });
      return res.json(row);
    }

    if (req.method === 'PUT') {
      const { id, ...updates } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const row = await db.update('content_items', id, updates);
      return res.json(row);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      await db.remove('content_items', id);
      return res.json({ ok: true });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
