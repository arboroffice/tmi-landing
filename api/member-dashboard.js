// Member dashboard data: everything tied to the signed-in member's email.
const db = require('./_db');
const { cors } = require('./_auth');
const { requireMember } = require('./_member-auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const m = requireMember(req, res); if (!m) return;
  const email = m.email;
  const safe = (p) => p.catch(() => []);
  try {
    const [assessments, downloads, progress, saved, apps] = await Promise.all([
      safe(db.list('assessments', { where: [['email', '==', email]], order: 'created_at', ascending: false, limit: 50 })),
      safe(db.list('downloads', { where: [['email', '==', email]], order: 'created_at', ascending: false, limit: 100 })),
      safe(db.list('course_progress', { where: [['member_id', '==', m.sub]], limit: 200 })),
      safe(db.list('saved_items', { where: [['member_id', '==', m.sub]], order: 'created_at', ascending: false, limit: 100 })),
      safe(db.list('applications', { where: [['email', '==', email]], order: 'started_at', ascending: false, limit: 5 })),
    ]);
    const audit = apps[0] ? { status: apps[0].status, started_at: apps[0].started_at, audit_url: apps[0].audit_url || null } : null;
    return res.json({
      member: { id: m.sub, email },
      assessments, downloads, progress, saved,
      audit,
      counts: { assessments: assessments.length, downloads: downloads.length, courses: new Set(progress.map(p => p.course_id)).size, saved: saved.length },
    });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
