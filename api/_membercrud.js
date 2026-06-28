// Member-gated CRUD factory for community/academy data. Members can read published
// rows and create/edit/delete their OWN rows; an admin token can do anything. Each
// created row is stamped with author_id/author_email so ownership is enforced.

const db = require('./_db');
const { cors, verifyToken } = require('./_auth');
const { verifyMember } = require('./_member-auth');

function crud(table, opts = {}) {
  const order = opts.order || 'created_at';
  const ascending = opts.ascending === true;
  const publicRead = opts.publicRead !== false; // members can read by default
  return async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    const admin = verifyToken(req);
    const member = verifyMember(req);
    if (!admin && !member) return res.status(401).json({ error: 'Sign in required' });

    try {
      if (req.method === 'GET') {
        const where = [];
        if (opts.scopeField && req.query[opts.scopeField]) where.push([opts.scopeField, '==', req.query[opts.scopeField]]);
        let rows = await db.list(table, { where, order, ascending, limit: 500 });
        // members see published rows + their own; admin sees all
        if (!admin && member && !publicRead) rows = rows.filter(r => r.author_id === member.sub);
        return res.json(rows);
      }
      if (req.method === 'POST') {
        const data = Object.assign({}, req.body || {}, { created_at: new Date().toISOString() });
        if (member && !admin) { data.author_id = member.sub; data.author_email = member.email; }
        const row = await db.insert(table, data);
        return res.status(201).json(row);
      }
      if (req.method === 'PUT' || req.method === 'PATCH') {
        const { id, ...fields } = req.body || {};
        if (!id) return res.status(400).json({ error: 'id required' });
        if (!admin) { const ex = await db.getById(table, id); if (!ex || ex.author_id !== member.sub) return res.status(403).json({ error: 'Not yours' }); }
        const row = await db.update(table, id, fields);
        return res.json(row);
      }
      if (req.method === 'DELETE') {
        const id = req.query.id || (req.body || {}).id;
        if (!id) return res.status(400).json({ error: 'id required' });
        if (!admin) { const ex = await db.getById(table, id); if (!ex || ex.author_id !== member.sub) return res.status(403).json({ error: 'Not yours' }); }
        await db.remove(table, id);
        return res.json({ ok: true });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  };
}
module.exports = { crud };
