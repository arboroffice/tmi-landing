// Revenue the funnel actually collects: paid $5,000 Intelligent Company Audits + accepted
// build-proposal deposits (real Stripe charges). Admin-only.

const { cors, requireAuth } = require('./_auth');
const dbx = require('./_db');

const AUDIT_PRICE = Number(process.env.COMPLETE_AUDIT_PRICE_CENTS || 500000) / 100; // $5,000

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    const [apps, props] = await Promise.all([
      dbx.list('applications', { where: [['source', '==', 'complete_audit']], limit: 5000 }).catch(() => []),
      dbx.list('proposals', { where: [['kind', '==', 'build']], limit: 2000 }).catch(() => []),
    ]);

    const now = new Date();
    const thisMonth = (d) => { if (!d) return false; const t = new Date(d); return t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth(); };

    const paid = apps.filter(a => a.status === 'paid' || a.status === 'booked');
    const accepted = props.filter(p => p.status === 'accepted');
    const depOf = (p) => Number(p.deposit_paid || p.deposit || 0);

    const auditRevenue = paid.length * AUDIT_PRICE;
    const depositRevenue = accepted.reduce((s, p) => s + depOf(p), 0);

    const auditMtd = paid.filter(a => thisMonth(a.paid_at)).length * AUDIT_PRICE;
    const depMtd = accepted.filter(p => thisMonth(p.accepted_at)).reduce((s, p) => s + depOf(p), 0);

    return res.json({
      auditsPaid: paid.length,
      auditsBooked: apps.filter(a => a.status === 'booked').length,
      auditRevenue,
      depositsAccepted: accepted.length,
      depositRevenue,
      total: auditRevenue + depositRevenue,
      mtd: { auditRevenue: auditMtd, depositRevenue: depMtd, total: auditMtd + depMtd },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
