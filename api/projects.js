const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Public single-project read (for prd-view.html shareable links)
  if (req.method === 'GET' && req.query.id && !req.headers.authorization) {
    try {
      const data = await db.getById('projects', req.query.id);
      if (!data) return res.status(404).json({ error: 'Not found' });
      return res.json(data);
    } catch (e) {
      return res.status(404).json({ error: 'Not found' });
    }
  }

  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    try {
      const rows = await db.list('projects', { order: 'created_at', ascending: false });
      // Embedded join: clients(contacts(...)) and the project's own contacts(...).
      await db.hydrateMany(rows, 'contact_id', 'contacts', 'contacts');
      await db.hydrateMany(rows, 'client_id', 'clients', 'clients');
      // Double-nested: hydrate each hydrated client's own contact.
      await Promise.all(rows.map(async (r) => {
        if (r && r.clients && r.clients.contact_id) {
          r.clients.contacts = await db.getById('contacts', r.clients.contact_id);
        } else if (r && r.clients) {
          r.clients.contacts = null;
        }
      }));
      return res.json(rows || []);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { client_id, contact_id, name, status, start_date, end_date, value, description, notes } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    try {
      const data = await db.insert('projects', {
        client_id: client_id || null,
        contact_id: contact_id || null,
        name,
        status: status || 'scoping',
        start_date: start_date || null,
        end_date: end_date || null,
        value: value || null,
        description: description || null,
        notes: notes || null,
      });
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'PUT') {
    const { id, ...updates } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      const data = await db.update('projects', id, updates);
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      await db.remove('projects', id);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
};
