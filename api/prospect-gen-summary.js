// Prospect-gen visibility for admin: latest run + what each source produced.
// GET /api/prospect-gen-summary

const { cors, requireAuth } = require('./_auth');
const dbx = require('./_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    // latest prospect-gen run (gtm_runs, filtered in JS to avoid a composite index)
    const runs = await dbx.list('gtm_runs', { order: 'ran_at', ascending: false, limit: 40 }).catch(() => []);
    const lastRun = runs.find(r => r.kind === 'prospect-gen') || null;

    // leads created by each new source
    const bySource = {};
    for (const src of ['site_visitor', 'lookalike', 'intent_signal']) {
      bySource[src] = await dbx.count('leads', [['source', '==', src]]).catch(() => 0);
    }
    const reactivated = await dbx.count('leads', [['reactivation_count', '>=', 1]]).catch(() => 0);

    // open call tasks + recent hot site visitors
    const openCalls = await dbx.count('call_tasks', [['status', '==', 'open']]).catch(() => 0);
    const recentVisitors = await dbx.list('leads', {
      where: [['source', '==', 'site_visitor']], order: 'created_at', ascending: false, limit: 8,
    }).catch(() => []);

    return res.json({
      lastRun,
      bySource: { ...bySource, reactivated },
      openCalls,
      recentVisitors,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
