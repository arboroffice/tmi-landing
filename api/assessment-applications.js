const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      const data = await db.list('assessment_applications', { order: 'created_at', ascending: false });
      return res.json(data || []);
    }

    if (req.method === 'PATCH') {
      const { id, status, notes, rating } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const updates = {};
      if (status !== undefined) updates.status = status;
      if (notes  !== undefined) updates.notes  = notes;
      if (rating !== undefined) updates.rating = rating;
      const data = await db.update('assessment_applications', id, updates);
      return res.json(data);
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
