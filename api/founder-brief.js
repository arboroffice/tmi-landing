const { cors, requireAuth } = require('./_auth');
const dbx = require('./_db');

// Founder Daily Brief endpoint.
//
// GET    -> latest brief from `founder_briefs` (newest first).
//           ?list=1 -> the last 14 briefs.
// PATCH  -> { trigger: true } runs the agent (dynamic import, ESM).
// POST   -> same as PATCH.
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  // ── Read latest / list ────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      if (req.query && (req.query.list === '1' || req.query.list === 'true')) {
        const rows = await dbx.list('founder_briefs', { order: 'created_at', ascending: false, limit: 14 });
        return res.json({ briefs: rows || [] });
      }
      const rows = await dbx.list('founder_briefs', { order: 'created_at', ascending: false, limit: 1 });
      return res.json({ brief: (rows && rows[0]) || null });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Trigger a run ─────────────────────────────────────────────────────────
  if (req.method === 'PATCH' || req.method === 'POST') {
    const { trigger } = req.body || {};
    if (!trigger) return res.status(400).json({ error: 'trigger required' });
    try {
      const { runFounderBrief } = await import('../agents/gtm/founder-brief.js');
      // Run async without blocking the HTTP response.
      runFounderBrief().catch(err => console.error('founder-brief run error:', err));
      return res.json({ ok: true, message: 'Founder brief started' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
