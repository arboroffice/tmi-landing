// Public-read CRUD factory: anyone can list published rows; writes require an admin
// token. For catalog content (library, podcast, courses, lessons, events).
const db = require('./_db');
const { cors, verifyToken } = require('./_auth');

function crud(table, opts = {}) {
  const order = opts.order || 'created_at';
  const ascending = opts.ascending === true;
  const publishedOnly = opts.publishedOnly !== false;
  return async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    try {
      if (req.method === 'GET') {
        const where = [];
        if (opts.scopeField && req.query[opts.scopeField]) where.push([opts.scopeField, '==', req.query[opts.scopeField]]);
        let rows = await db.list(table, { where, order, ascending, limit: 500 });
        const isAdmin = !!verifyToken(req);
        if (publishedOnly && !isAdmin) rows = rows.filter(r => r.status == null || r.status === 'published');
        return res.json(rows);
      }
      if (!verifyToken(req)) return res.status(401).json({ error: 'Unauthorized' });
      if (req.method === 'POST') {
        const row = await db.insert(table, Object.assign({ status: 'published', created_at: new Date().toISOString() }, req.body || {}));
        return res.status(201).json(row);
      }
      if (req.method === 'PUT' || req.method === 'PATCH') {
        const { id, ...f } = req.body || {};
        if (!id) return res.status(400).json({ error: 'id required' });
        const row = await db.update(table, id, f); return res.json(row);
      }
      if (req.method === 'DELETE') {
        const id = req.query.id || (req.body || {}).id;
        if (!id) return res.status(400).json({ error: 'id required' });
        await db.remove(table, id); return res.json({ ok: true });
      }
      return res.status(405).end();
    } catch (e) { return res.status(500).json({ error: e.message }); }
  };
}
module.exports = { crud };
