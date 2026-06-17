// Complete Audit funnel for the admin command center.
// Captured -> Paid -> Booked, conversion rates, and the worklist of
// captured-but-unpaid leads to follow up by hand.

const { cors, requireAuth } = require('./_auth');
const dbx = require('./_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    const rows = await dbx.list('applications', {
      where: [['source', '==', 'complete_audit']],
      order: 'captured_at', ascending: false, limit: 1000,
    });

    const byStatus = (s) => rows.filter(r => r.status === s).length;
    const captured = rows.length;
    const paid = rows.filter(r => r.status === 'paid' || r.status === 'booked').length;
    const booked = byStatus('booked');
    const refunded = byStatus('refunded');
    const unpaid = rows.filter(r => r.status === 'captured');

    const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

    // Worklist: captured-but-unpaid, freshest first, with how long ago + last nudge.
    const worklist = unpaid.slice(0, 100).map(r => ({
      id: r.id,
      name: r.name || null,
      company: r.company || null,
      email: r.email || null,
      phone: r.phone || null,
      website: r.website || null,
      captured_at: r.captured_at || r.created_at || null,
      last_nudge: r.last_nudge || null,
      resume_url: `/api/audit-resume?id=${r.id}`,
    }));

    // Completed paid audits + any build proposal already generated, so the
    // strategist can generate / view the proposal after the call.
    const [subs, props] = await Promise.all([
      dbx.list('audit_submissions', { order: 'created_at', ascending: false, limit: 60 }).catch(() => []),
      dbx.list('proposals', { where: [['kind', '==', 'build']], order: 'created_at', ascending: false, limit: 200 }).catch(() => []),
    ]);
    const propByAudit = {};
    for (const p of props) if (p.audit_id) propByAudit[p.audit_id] = p;
    const audits = subs.map(s => {
      const p = propByAudit[s.id];
      return {
        id: s.id,
        company: s.company || (s.answers && s.answers.company) || null,
        email: s.email || null,
        score: s.score != null ? s.score : null,
        deliverable_ready: !!s.deliverable,
        created_at: s.created_at || null,
        report_url: `/audit-report?id=${s.id}`,
        proposal: p ? { id: p.id, status: p.status, url: `/build-proposal?id=${p.id}` } : null,
      };
    });

    return res.json({
      captured, paid, booked, refunded,
      unpaidCount: unpaid.length,
      conversion: {
        capturedToPaid: pct(paid, captured),
        paidToBooked: pct(booked, paid),
      },
      worklist,
      audits,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
