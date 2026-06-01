const { getSupabase } = require('./_supabase');
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

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    const [recruiters, candidates] = await Promise.all([
      db.from('os_recruiters').select('*').order('sort', { ascending: true }),
      db.from('os_candidates').select('*').order('created_at', { ascending: false })
    ]);
    if (recruiters.error) return res.status(500).json({ error: recruiters.error.message });
    return res.json({ recruiters: recruiters.data || [], candidates: candidates.data || [] });
  }

  if (req.method === 'POST') {
    const { recruiter, candidate } = req.body || {};
    if (recruiter) {
      if (!recruiter.name) return res.status(400).json({ error: 'name required' });
      const { data, error } = await db.from('os_recruiters').insert(recruiter).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }
    if (candidate) {
      if (!candidate.name) return res.status(400).json({ error: 'name required' });
      const { data, error } = await db.from('os_candidates').insert(candidate).select().single();
      if (error) return res.status(500).json({ error: error.message });
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
    const { data, error } = await db.from(table).update(fields).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const { id, type } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const table = type === 'candidate' ? 'os_candidates' : 'os_recruiters';
    const { error } = await db.from(table).delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
