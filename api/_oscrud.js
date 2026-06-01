const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

// Generic single-table CRUD handler factory for Ops Machine tables.
// opts: { select, order, ascending }
function crud(table, opts = {}) {
  const select = opts.select || '*';
  const order = opts.order || 'sort';
  const ascending = opts.ascending !== false;
  return async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (!requireAuth(req, res)) return;

    let db;
    try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

    if (req.method === 'GET') {
      let q = db.from(table).select(select);
      if (order) q = q.order(order, { ascending });
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { data, error } = await db.from(table).insert(body).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, ...fields } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data, error } = await db.from(table).update(fields).eq('id', id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const { error } = await db.from(table).delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  };
}

module.exports = { crud };
