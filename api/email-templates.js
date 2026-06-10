const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

// Reusable email templates for the Comms / Email composer.
// GET    -> list all templates (newest first)
// POST   -> create (or update when an id is supplied) { id?, name, subject, body }
// DELETE -> ?id=<uuid>
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    try {
      const data = await db.list('email_templates', { order: 'created_at', ascending: false });
      return res.json(data || []);
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (req.method === 'POST') {
    const { id, name, subject, body } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    const fields = { name, subject: subject || null, body: body || null };
    if (id) {
      try {
        const data = await db.update('email_templates', id, fields);
        return res.json(data);
      } catch (e) { return res.status(500).json({ error: e.message }); }
    }
    try {
      const data = await db.insert('email_templates', fields);
      return res.status(201).json(data);
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      await db.remove('email_templates', id);
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  res.status(405).json({ error: 'Method not allowed' });
};
