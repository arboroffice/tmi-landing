// Sales Cockpit data: the daily action board, computed from routed leads.
// GET  -> { funnel, workNow, dueFollowups, stalled, callTasks, signals }
// POST { action:'route' } -> re-score all leads via the lead-router agent.

const { cors, requireAuth, verifyToken } = require('./_auth');
const db = require('./_db');

const DONE = ['won', 'client', 'building', 'closed', 'lost', 'unsubscribed', 'do_not_contact', 'rejected', 'dead'];

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  if (req.method === 'POST') {
    const { action } = req.body || {};
    if (action === 'route') {
      try {
        const { routeLeads } = await import('../agents/gtm/lead-router.js');
        routeLeads({}).catch(e => console.error('route:', e));
        return res.json({ ok: true, message: 'Re-scoring leads' });
      } catch (e) { return res.status(500).json({ error: e.message }); }
    }
    return res.status(400).json({ error: 'unknown action' });
  }

  try {
    const leads = await db.list('leads', { where: [['unsubscribed', '==', false]], limit: 1500 }).catch(() => []);
    const active = leads.filter(l => !DONE.includes(String(l.status || '').toLowerCase()));
    const byScore = (a, b) => (b.lead_score || 0) - (a.lead_score || 0);
    const slim = (l) => ({ id: l.id, company: l.company_name || null, owner: l.owner_name || null, email: l.email || null, phone: l.phone || null, score: l.lead_score || 0, priority: l.priority || null, status: l.status || null, next_action: l.next_action || null, next_action_kind: l.next_action_kind || null, audit_url: l.audit_url || null, source: l.source || null });

    const workNow = active.filter(l => (l.priority === 'hot' || (l.lead_score || 0) >= 60)).sort(byScore).slice(0, 25).map(slim);
    const dueFollowups = active.filter(l => l.next_action_kind === 'followup').sort(byScore).slice(0, 25).map(slim);
    const stalled = active.filter(l => l.stalled).sort(byScore).slice(0, 25).map(slim);
    const callTasks = await db.list('call_tasks', { where: [['status', '==', 'open']], order: 'created_at', ascending: false, limit: 25 }).catch(() => []);
    const signals = await db.list('signals', { where: [['status', '==', 'new']], order: 'created_at', ascending: false, limit: 15 }).catch(() => []);

    const c = (f) => active.filter(f).length;
    const lc = (l) => String(l.status || '').toLowerCase();
    const funnel = {
      active: active.length,
      hot: c(l => l.priority === 'hot'),
      newLeads: c(l => lc(l) === 'new' || lc(l) === 'audited'),
      inSequence: c(l => ['sent', 'in_campaign', 'contacted'].includes(lc(l))),
      replied: c(l => lc(l) === 'replied' || lc(l) === 'booked'),
      stalled: stalled.length,
      unrouted: c(l => l.lead_score == null),
    };
    return res.json({ funnel, workNow, dueFollowups, stalled, callTasks, signals });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
