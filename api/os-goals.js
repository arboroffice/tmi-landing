const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

// Ops Machine — Command center goals (cascading quarter -> month -> week)
// with nested subtasks. Handles both goals and subtasks via body discriminator.
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    const { data, error } = await db
      .from('os_goals')
      .select('*, os_subtasks(*)')
      .order('sort', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    // Sort nested subtasks by sort then created_at
    (data || []).forEach(g => {
      if (Array.isArray(g.os_subtasks)) {
        g.os_subtasks.sort((a, b) => (a.sort - b.sort) || (new Date(a.created_at) - new Date(b.created_at)));
      }
    });
    return res.json(data);
  }

  if (req.method === 'POST') {
    const { goal, subtask } = req.body || {};
    if (subtask) {
      if (!subtask.goal_id || !subtask.text) return res.status(400).json({ error: 'goal_id and text required' });
      const { data, error } = await db.from('os_subtasks').insert(subtask).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }
    if (goal) {
      if (!goal.title) return res.status(400).json({ error: 'title required' });
      const { data, error } = await db.from('os_goals').insert(goal).select('*, os_subtasks(*)').single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }
    return res.status(400).json({ error: 'goal or subtask required' });
  }

  if (req.method === 'PUT') {
    const { goal, subtask } = req.body || {};
    if (subtask?.id) {
      const { id, ...fields } = subtask;
      const { data, error } = await db.from('os_subtasks').update(fields).eq('id', id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }
    if (goal?.id) {
      const { id, ...fields } = goal;
      const { data, error } = await db.from('os_goals').update(fields).eq('id', id).select('*, os_subtasks(*)').single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }
    return res.status(400).json({ error: 'goal.id or subtask.id required' });
  }

  if (req.method === 'DELETE') {
    const { id, type } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const table = type === 'subtask' ? 'os_subtasks' : 'os_goals';
    const { error } = await db.from(table).delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
