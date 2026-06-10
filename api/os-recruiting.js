const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

// Ops Machine — Recruiting leaderboard (recruiters/channels) + candidate pipeline.
// GET    -> { recruiters, candidates }
// POST   { recruiter } | { candidate }
// PUT    { recruiter } | { candidate }   (must include id)
// DELETE ?id=&type=recruiter|candidate
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
  if (req.method === 'GET') {
    const [recruiters, candidates] = await Promise.all([
      db.list('os_recruiters', { order: 'sort', ascending: true }),
      db.list('os_candidates', { order: 'created_at', ascending: false })
    ]);
    return res.json({ recruiters: recruiters || [], candidates: candidates || [] });
  }

  if (req.method === 'POST') {
    const { recruiter, candidate } = req.body || {};
    if (recruiter) {
      if (!recruiter.name) return res.status(400).json({ error: 'name required' });
      const data = await db.insert('os_recruiters', recruiter);
      return res.status(201).json(data);
    }
    if (candidate) {
      if (!candidate.name) return res.status(400).json({ error: 'name required' });
      const data = await db.insert('os_candidates', candidate);
      return res.status(201).json(data);
    }
    return res.status(400).json({ error: 'recruiter or candidate required' });
  }

  if (req.method === 'PUT') {
    const { recruiter, candidate } = req.body || {};
    const obj = recruiter || candidate;
    const table = recruiter ? 'os_recruiters' : 'os_candidates';
    if (!obj?.id) return res.status(400).json({ error: 'id required' });
    const { id, ...fields } = obj;
    const data = await db.update(table, id, fields);
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const { id, type } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const table = type === 'candidate' ? 'os_candidates' : 'os_recruiters';
    await db.remove(table, id);
    return res.json({ ok: true });
  }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
