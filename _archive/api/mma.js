// Admin: list / update Make Money With AI early-access submissions.
const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      const data = await db.list('mma_submissions', {
        order: 'created_at', ascending: false, limit: 1000,
      });
      return res.json(data);
    }

    if (req.method === 'PATCH') {
      const { id, status, notes } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const patch = {};
      if (status !== undefined) patch.status = status;
      if (notes !== undefined) patch.notes = notes;
      await db.update('mma_submissions', id, patch);
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('mma admin:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
