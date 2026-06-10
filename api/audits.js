const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      const { id, tier, industry } = req.query;

      if (id) {
        const data = await db.getById('audit_submissions', id);
        if (!data) return res.status(404).json({ error: 'Not found' });
        return res.json(data);
      }

      // Firestore can't do ilike — filter `industry` in JS below. `tier` is an
      // equality filter so it stays a Firestore where clause.
      const where = [];
      if (tier) where.push(['tier', '==', tier]);
      let data = await db.list('audit_submissions', {
        where,
        order: 'created_at',
        ascending: false,
        limit: 500,
      });

      if (industry) {
        const needle = String(industry).toLowerCase();
        data = data.filter(r => (r.industry || '').toLowerCase().includes(needle));
      }

      return res.json(data);
    }

    if (req.method === 'PATCH') {
      const { id, status, notes } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const fields = {};
      if (status !== undefined) fields.status = status;
      if (notes  !== undefined) fields.notes  = notes;
      const data = await db.update('audit_submissions', id, fields);
      return res.json(data);
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
