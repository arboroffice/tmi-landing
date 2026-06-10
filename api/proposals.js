const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Allow unauthenticated GET when a single ?id= param is provided (secret link sharing)
  const publicSingleFetch = req.method === 'GET'
    && req.query.id
    && Object.keys(req.query).length === 1
    && !req.headers['authorization'];

  if (!publicSingleFetch && !requireAuth(req, res)) return;

  if (req.method === 'GET') {
    if (publicSingleFetch) {
      try {
        let data = await db.getById('proposals', req.query.id);
        if (!data) return res.status(404).json({ error: 'Proposal not found' });
        data = await db.hydrateOne(data, 'contact_id', 'contacts', 'contacts');
        return res.json(data);
      } catch (e) {
        return res.status(404).json({ error: 'Proposal not found' });
      }
    }
    try {
      let rows = await db.list('proposals', { order: 'created_at', ascending: false });
      rows = await db.hydrateMany(rows, 'contact_id', 'contacts', 'contacts');
      rows = await db.hydrateMany(rows, 'lead_id', 'leads', 'leads');
      return res.json(rows || []);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { contact_id, lead_id, title, status, total, sections, expires_at, notes } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });
    try {
      const data = await db.insert('proposals', {
        contact_id: contact_id || null,
        lead_id: lead_id || null,
        title,
        status: status || 'draft',
        total: total || null,
        sections: sections || null,
        expires_at: expires_at || null,
        notes: notes || null,
      });
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'PUT') {
    const { id, ...updates } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    if (updates.status === 'sent' && !updates.sent_at) updates.sent_at = new Date().toISOString();
    try {
      const data = await db.update('proposals', id, updates);
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      await db.remove('proposals', id);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
};
