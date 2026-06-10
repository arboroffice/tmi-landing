const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

// Command Brief - aggregation summarizing the last 7 days and current state.
// Every section is wrapped in its own try/catch so a missing collection (or any
// query error) simply skips that section rather than 500ing the whole endpoint.
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const brief = { generated_at: new Date().toISOString() };

  // ── Site visitors: total last 7d, hot count, top 5 hottest ────────────────
  try {
    const data = await db.list('site_visitors', { where: [['last_seen', '>=', since]] });
    if (Array.isArray(data)) {
      const hot = data.filter(v => Number(v.score) >= 70);
      const top = [...data]
        .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
        .slice(0, 5)
        .map(v => ({
          name: [v.first_name, v.last_name].filter(Boolean).join(' ') || null,
          company: v.company || null,
          score: Number(v.score) || 0,
        }));
      brief.visitors = {
        total_7d: data.length,
        hot_count: hot.length,
        top_hottest: top,
      };
    }
  } catch (e) { /* table missing - skip section */ }

  // ── Pipeline: counts of leads by status ───────────────────────────────────
  try {
    const data = await db.list('leads', {});
    if (Array.isArray(data)) {
      const by_status = {};
      for (const l of data) {
        const s = l.status || 'unknown';
        by_status[s] = (by_status[s] || 0) + 1;
      }
      brief.pipeline = { by_status, total: data.length };
    }
  } catch (e) { /* skip */ }

  // ── New leads in the last 7 days ──────────────────────────────────────────
  // Firestore has no head/count query - fetch matching rows and count in JS.
  try {
    const data = await db.list('leads', { where: [['created_at', '>=', since]] });
    if (Array.isArray(data)) brief.new_leads_7d = data.length;
  } catch (e) { /* skip */ }

  // ── Audits submitted in the last 7 days ───────────────────────────────────
  try {
    const data = await db.list('audit_submissions', { where: [['created_at', '>=', since]] });
    if (Array.isArray(data)) brief.audits_7d = data.length;
  } catch (e) { /* skip */ }

  // ── Follow-ups due or overdue ─────────────────────────────────────────────
  try {
    const data = await db.list('followups', { where: [['completed', '==', false], ['due_at', '<=', now]] });
    if (Array.isArray(data)) brief.follow_ups_due = data.length;
  } catch (e) { /* skip */ }

  return res.json(brief);
};
