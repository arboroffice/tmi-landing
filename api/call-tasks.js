// Call queue — the hottest prospects the SMS agent flagged to phone.
// GET  /api/call-tasks            -> open tasks (newest first)
// GET  /api/call-tasks?status=... -> filter (open | called | booked | dead)
// GET  /api/call-tasks?summary=1  -> counts by status
// PATCH /api/call-tasks { id, status, notes } -> update a task

const { cors, requireAuth } = require('./_auth');
const dbx = require('./_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      if (req.query.summary) {
        const statuses = ['open', 'called', 'booked', 'dead'];
        const counts = {};
        await Promise.all(statuses.map(async s => { counts[s] = await dbx.count('call_tasks', [['status', '==', s]]).catch(() => 0); }));
        return res.json({ counts });
      }
      const status = req.query.status || 'open';
      const where = status === 'all' ? [] : [['status', '==', status]];
      const rows = await dbx.list('call_tasks', { where, order: 'created_at', ascending: false, limit: 200 });
      return res.json(rows);
    }

    if (req.method === 'PATCH' || req.method === 'POST') {
      const { id, status, notes } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const fields = { updated_at: new Date().toISOString() };
      if (status) fields.status = status;
      if (notes != null) fields.notes = notes;
      if (status === 'booked') fields.booked_at = new Date().toISOString();
      await dbx.update('call_tasks', id, fields);
      return res.json({ ok: true });
    }

    return res.status(405).end();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
