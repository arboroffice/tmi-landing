// Course progress for the signed-in member. GET own; POST upsert a lesson's status.
const db = require('./_db');
const { cors } = require('./_auth');
const { requireMember } = require('./_member-auth');
module.exports = async function handler(req, res) {
  cors(res); if (req.method === 'OPTIONS') return res.status(200).end();
  const m = requireMember(req, res); if (!m) return;
  try {
    if (req.method === 'GET') {
      const rows = await db.list('course_progress', { where: [['member_id', '==', m.sub]], limit: 500 });
      return res.json(rows);
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      const { course_id, lesson_id, status } = req.body || {};
      if (!course_id || !lesson_id) return res.status(400).json({ error: 'course_id and lesson_id required' });
      const key = `${m.sub}_${lesson_id}`;
      const existing = await db.findOne('course_progress', 'key', key);
      const data = { key, member_id: m.sub, course_id, lesson_id, status: status || 'complete', updated_at: new Date().toISOString() };
      if (existing) { await db.update('course_progress', existing.id, data); } else { await db.insert('course_progress', data); }
      return res.json({ ok: true });
    }
    return res.status(405).end();
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
