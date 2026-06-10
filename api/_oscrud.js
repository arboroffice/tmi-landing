const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

// Generic single-table CRUD handler factory for Ops Machine tables (Firestore).
// opts: { order, ascending } — sorting is done in-app so a missing field on some
// docs never silently drops rows (and avoids per-collection composite indexes).
function crud(table, opts = {}) {
  const order = opts.order || 'sort';
  const ascending = opts.ascending !== false;
  return async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (!requireAuth(req, res)) return;

    try {
      if (req.method === 'GET') {
        const rows = await db.list(table, {});
        if (order) {
          rows.sort((a, b) => {
            const av = a[order], bv = b[order];
            if (av == null && bv == null) return 0;
            if (av == null) return ascending ? -1 : 1;
            if (bv == null) return ascending ? 1 : -1;
            if (av < bv) return ascending ? -1 : 1;
            if (av > bv) return ascending ? 1 : -1;
            return 0;
          });
        }
        return res.json(rows);
      }

      if (req.method === 'POST') {
        const row = await db.insert(table, req.body || {});
        return res.status(201).json(row);
      }

      if (req.method === 'PUT') {
        const { id, ...fields } = req.body || {};
        if (!id) return res.status(400).json({ error: 'id required' });
        const row = await db.update(table, id, fields);
        return res.json(row);
      }

      if (req.method === 'DELETE') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'id required' });
        await db.remove(table, id);
        return res.json({ ok: true });
      }
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }

    res.status(405).json({ error: 'Method not allowed' });
  };
}

module.exports = { crud };
