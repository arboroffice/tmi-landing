const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

// Ops Machine — Command center goals (cascading quarter -> month -> week)
// with nested subtasks. Handles both goals and subtasks via body discriminator.
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
  if (req.method === 'GET') {
    // os_subtasks reference os_goals via goal_id (parent has many children).
    // Fetch all goals + all subtasks, then group subtasks under each goal.
    const goals = await db.list('os_goals', {});
    const subtasks = await db.list('os_subtasks', {});
    const byGoal = {};
    for (const s of subtasks) {
      (byGoal[s.goal_id] = byGoal[s.goal_id] || []).push(s);
    }
    goals.forEach(g => {
      g.os_subtasks = byGoal[g.id] || [];
      g.os_subtasks.sort((a, b) => (a.sort - b.sort) || (new Date(a.created_at) - new Date(b.created_at)));
    });
    // Sort goals by sort then created_at (in-app so missing fields don't drop rows)
    goals.sort((a, b) => {
      const sa = a.sort, sb = b.sort;
      if (sa != null && sb != null && sa !== sb) return sa - sb;
      if (sa == null && sb != null) return -1;
      if (sa != null && sb == null) return 1;
      return (new Date(a.created_at) - new Date(b.created_at));
    });
    return res.json(goals);
  }

  if (req.method === 'POST') {
    const { goal, subtask } = req.body || {};
    if (subtask) {
      if (!subtask.goal_id || !subtask.text) return res.status(400).json({ error: 'goal_id and text required' });
      const data = await db.insert('os_subtasks', subtask);
      return res.status(201).json(data);
    }
    if (goal) {
      if (!goal.title) return res.status(400).json({ error: 'title required' });
      const data = await db.insert('os_goals', goal);
      // New goal has no subtasks yet; mirror the embedded-join response shape.
      data.os_subtasks = [];
      return res.status(201).json(data);
    }
    return res.status(400).json({ error: 'goal or subtask required' });
  }

  if (req.method === 'PUT') {
    const { goal, subtask } = req.body || {};
    if (subtask?.id) {
      const { id, ...fields } = subtask;
      const data = await db.update('os_subtasks', id, fields);
      return res.json(data);
    }
    if (goal?.id) {
      const { id, ...fields } = goal;
      const data = await db.update('os_goals', id, fields);
      // Re-attach subtasks to mirror the embedded-join response shape.
      const subs = await db.list('os_subtasks', { where: [['goal_id', '==', data.id]] });
      subs.sort((a, b) => (a.sort - b.sort) || (new Date(a.created_at) - new Date(b.created_at)));
      data.os_subtasks = subs;
      return res.json(data);
    }
    return res.status(400).json({ error: 'goal.id or subtask.id required' });
  }

  if (req.method === 'DELETE') {
    const { id, type } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const table = type === 'subtask' ? 'os_subtasks' : 'os_goals';
    await db.remove(table, id);
    return res.json({ ok: true });
  }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
