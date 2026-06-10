const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    const { contact_id, lead_id, client_id } = req.query || {};
    try {
      const where = [];
      if (contact_id) where.push(['contact_id', '==', contact_id]);
      if (lead_id) where.push(['lead_id', '==', lead_id]);
      if (client_id) where.push(['client_id', '==', client_id]);
      const data = await db.list('activities', { where, order: 'created_at', ascending: false, limit: 50 });
      return res.json(data || []);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { contact_id, lead_id, client_id, type, title, body } = req.body || {};
    if (!type || !title) return res.status(400).json({ error: 'type and title required' });
    try {
      const data = await db.insert('activities', {
        contact_id: contact_id || null,
        lead_id: lead_id || null,
        client_id: client_id || null,
        type,
        title,
        body: body || null,
      });
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
};
