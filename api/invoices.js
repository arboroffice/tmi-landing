const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Allow unauthenticated GET when a single ?id= param is provided (secret link sharing)
  const publicSingleFetch = req.method === 'GET'
    && req.query.id
    && Object.keys(req.query).length === 1
    && !req.headers['authorization'];

  if (!publicSingleFetch && !requireAuth(req, res)) return;

  if (req.method === 'GET') {
    if (publicSingleFetch) {
      try {
        let data = await db.getById('invoices', req.query.id);
        if (!data) return res.status(404).json({ error: 'Invoice not found' });
        data = await db.hydrateOne(data, 'contact_id', 'contacts', 'contacts');
        return res.json(data);
      } catch (e) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
    }
    try {
      const rows = await db.list('invoices', { order: 'created_at', ascending: false });
      // Embedded join: clients(contacts(...)) and the invoice's own contacts(...).
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
    const { client_id, contact_id, number, amount, status, due_date, description, line_items, notes } = req.body || {};
    if (!amount) return res.status(400).json({ error: 'amount required' });
    try {
      const data = await db.insert('invoices', {
        client_id: client_id || null,
        contact_id: contact_id || null,
        number: number || null,
        amount,
        status: status || 'pending',
        due_date: due_date || null,
        description: description || null,
        line_items: line_items || null,
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
    if (updates.status === 'paid' && !updates.paid_at) {
      updates.paid_at = new Date().toISOString();
    }
    try {
      const data = await db.update('invoices', id, updates);
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      await db.remove('invoices', id);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
};
