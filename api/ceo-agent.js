const { cors, requireAuth } = require('./_auth');
const dbx = require('./_db');

// CEO Agent endpoint.
//   GET            -> latest report from `ceo_reports`.
//   GET ?list=1    -> the last 12 reports.
//   POST | PATCH   -> { trigger: true } runs the CEO agent (async, non-blocking).
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Vercel cron (weekly) triggers a run without a JWT.
  if (req.headers['x-vercel-cron']) {
    try {
      const { runCeoAgent } = await import('../agents/gtm/ceo.js');
      runCeoAgent().catch(err => console.error('ceo-agent cron error:', err));
      return res.json({ ok: true, cron: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    try {
      const list = req.query && (req.query.list === '1' || req.query.list === 'true');
      const rows = await dbx.list('ceo_reports', { order: 'generated_at', ascending: false, limit: list ? 12 : 1 });
      return res.json(list ? { reports: rows || [] } : { report: (rows && rows[0]) || null });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST' || req.method === 'PATCH') {
    const { trigger } = req.body || {};
    if (!trigger) return res.status(400).json({ error: 'trigger required' });
    try {
      const { runCeoAgent } = await import('../agents/gtm/ceo.js');
      runCeoAgent().catch(err => console.error('ceo-agent run error:', err));
      return res.json({ ok: true, message: 'CEO agent started' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
