// Admin commission ledger for city-lead reps. Rep-leads.js writes a rep_commissions
// row for every won deal (20% of deal value). This is the admin read + payout view.
//   GET                        -> { items, totals:{pending,paid,count}, byRep[] }
//   PATCH { id, status }       -> mark a commission 'paid' or back to 'pending'
const db = require('./_db');
const { cors, requireAuth } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      const [rows, reps] = await Promise.all([
        db.list('rep_commissions', { order: 'created_at', ascending: false, limit: 2000 }).catch(() => []),
        db.list('reps', { limit: 300 }).catch(() => []),
      ]);
      const nameOf = {}; (reps || []).forEach((r) => { nameOf[r.id] = r.name || r.email || 'Rep'; });
      let pending = 0, paid = 0;
      const items = (rows || []).map((c) => {
        const status = c.status === 'paid' ? 'paid' : 'pending';
        const amt = Number(c.commission) || 0;
        if (status === 'paid') paid += amt; else pending += amt;
        return {
          id: c.id, rep_id: c.rep_id, rep: nameOf[c.rep_id] || 'Rep',
          business_name: c.business_name || null, deal_value: c.deal_value != null ? Number(c.deal_value) : null,
          commission: amt, status, created_at: c.created_at, paid_at: c.paid_at || null,
          application_id: c.application_id || null, rep_lead_id: c.rep_lead_id || null,
        };
      });
      const byRep = {};
      items.forEach((c) => {
        const g = byRep[c.rep_id] || (byRep[c.rep_id] = { rep_id: c.rep_id, rep: c.rep, pending: 0, paid: 0, count: 0 });
        g.count++; if (c.status === 'paid') g.paid += c.commission; else g.pending += c.commission;
      });
      return res.json({ items, totals: { pending, paid, count: items.length }, byRep: Object.values(byRep).sort((a, b) => b.pending - a.pending) });
    }

    if (req.method === 'PATCH') {
      const { id, status } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const st = status === 'paid' ? 'paid' : 'pending';
      const out = await db.update('rep_commissions', id, { status: st, paid_at: st === 'paid' ? new Date().toISOString() : null, updated_at: new Date().toISOString() });
      return res.json(out);
    }

    return res.status(405).end();
  } catch (e) {
    console.error('rep-commissions:', e.message);
    return res.status(500).json({ error: e.message });
  }
};

module.exports.config = { maxDuration: 30 };
