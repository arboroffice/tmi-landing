const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    try {
      const opts = { order: 'due_at', ascending: true };
      if (req.query?.completed === 'false') {
        opts.where = [['completed', '==', false]];
      }
      let rows = await db.list('followups', opts);
      rows = await db.hydrateMany(rows, 'contact_id', 'contacts', 'contacts');
      return res.json(rows || []);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { contact_id, lead_id, client_id, type, title, notes, due_at, priority, assigned_to } = req.body || {};
    if (!title || !due_at) return res.status(400).json({ error: 'title and due_at required' });
    try {
      const data = await db.insert('followups', {
        contact_id: contact_id || null,
        lead_id: lead_id || null,
        client_id: client_id || null,
        type: type || 'task',
        title,
        notes: notes || null,
        due_at,
        priority: priority || 'normal',
        assigned_to: assigned_to || null,
      });
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'PUT') {
    const { id, completed, title, notes, due_at, priority, type } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (notes !== undefined) updates.notes = notes;
    if (due_at !== undefined) updates.due_at = due_at;
    if (priority !== undefined) updates.priority = priority;
    if (type !== undefined) updates.type = type;
    if (completed !== undefined) {
      updates.completed = completed;
      updates.completed_at = completed ? new Date().toISOString() : null;
    }
    try {
      const data = await db.update('followups', id, updates);
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      await db.remove('followups', id);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
};
