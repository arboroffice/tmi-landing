const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    let query = db
      .from('followups')
      .select('*, contacts(first_name, last_name, company)')
      .order('due_at', { ascending: true });

    if (req.query?.completed === 'false') {
      query = query.eq('completed', false);
    }
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  }

  if (req.method === 'POST') {
    const { contact_id, lead_id, client_id, type, title, notes, due_at, priority, assigned_to } = req.body || {};
    if (!title || !due_at) return res.status(400).json({ error: 'title and due_at required' });
    const { data, error } = await db.from('followups').insert({
      contact_id: contact_id || null,
      lead_id: lead_id || null,
      client_id: client_id || null,
      type: type || 'task',
      title,
      notes: notes || null,
      due_at,
      priority: priority || 'normal',
      assigned_to: assigned_to || null,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
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
    const { data, error } = await db.from('followups').update(updates).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    await db.from('followups').delete().eq('id', id);
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
