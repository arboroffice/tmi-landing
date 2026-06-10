const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      const rows = await db.list('clients', { order: 'created_at', ascending: false, limit: 500 });
      const data = await db.hydrateMany(rows, 'contact_id', 'contacts', 'contacts');
      return res.json(data);
    }

    if (req.method === 'POST') {
      const { contact, client, contact_id } = req.body || {};

      let cid = contact_id;

      if (!cid && contact?.first_name) {
        // Upsert contact
        if (contact.email) {
          const existing = await db.findOne('contacts', 'email', contact.email);
          if (existing) {
            cid = existing.id;
            await db.update('contacts', cid, contact);
          }
        }
        if (!cid) {
          const c = await db.insert('contacts', contact);
          cid = c.id;
        }
      }

      if (!cid) return res.status(400).json({ error: 'contact or contact_id required' });

      const row = await db.insert('clients', { ...(client || {}), contact_id: cid });
      const data = await db.hydrateOne(row, 'contact_id', 'contacts', 'contacts');
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { contact, client } = req.body || {};
      if (!client?.id) return res.status(400).json({ error: 'client.id required' });

      if (contact?.first_name) {
        const existing = await db.getById('clients', client.id);
        if (existing?.contact_id) {
          await db.update('contacts', existing.contact_id, contact);
        }
      }

      const { id, ...clientFields } = client;
      const row = await db.update('clients', id, clientFields);
      const data = await db.hydrateOne(row, 'contact_id', 'contacts', 'contacts');
      return res.json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await db.remove('clients', id);
      return res.json({ ok: true });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
