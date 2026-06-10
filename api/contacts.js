const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    // GET — list or single
    if (req.method === 'GET') {
      const { id } = req.query;
      if (id) {
        const row = await db.getById('contacts', id);
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.json(row);
      }
      const rows = await db.list('contacts', { order: 'created_at', ascending: false, limit: 500 });
      return res.json(rows);
    }

    // POST — create
    if (req.method === 'POST') {
      const body = req.body || {};
      const row = await db.insert('contacts', {
        first_name: body.first_name,
        last_name: body.last_name || null,
        email: body.email || null,
        phone: body.phone || null,
        company: body.company || null,
        title: body.title || null,
        audience: body.audience || null,
        niche: body.niche || null,
        notes: body.notes || null,
      });
      return res.status(201).json(row);
    }

    // PUT — update
    if (req.method === 'PUT') {
      const body = req.body || {};
      const { id } = body;
      if (!id) return res.status(400).json({ error: 'id required' });
      const row = await db.update('contacts', id, {
        first_name: body.first_name,
        last_name: body.last_name || null,
        email: body.email || null,
        phone: body.phone || null,
        company: body.company || null,
        title: body.title || null,
        audience: body.audience || null,
        niche: body.niche || null,
        notes: body.notes || null,
      });
      return res.json(row);
    }

    // DELETE
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await db.remove('contacts', id);
      return res.json({ ok: true });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
