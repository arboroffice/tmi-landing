// Admin commission ledger for city-lead reps. Rep-leads.js writes a rep_commissions
// row for every won deal (20% of deal value). This is the admin read + payout view.
//   GET                        -> { items, totals:{pending,paid,count}, byRep[] }
//   PATCH { id, status }       -> mark a commission 'paid' or back to 'pending'
//   POST { action:'add', rep_id, rep_lead_id?, business_name, kind, amount, rate? }
//                              -> record an upsell (implementation fee, retainer, add-on)
//   POST { action:'rates', audit, upsell }  -> set the commission rates (20 or 0.2 both work)
const db = require('./_db');
const { cors, requireAuth } = require('./_auth');
const comp = require('./_rep-comp');

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
      // Reconcile each commission against its linked application: "verified" means
      // that customer actually paid (application.status === 'paid'), so admin does
      // not pay out on a rep-entered "won" that never became a real payment.
      await db.hydrateMany(rows || [], 'application_id', 'applications', '_app').catch(() => {});
      let pending = 0, paid = 0, pendingVerified = 0;
      const items = (rows || []).map((c) => {
        const status = c.status === 'paid' ? 'paid' : 'pending';
        const amt = Number(c.commission) || 0;
        // Stripe-paid and admin-entered rows are real money; a rep-marked win needs its payment confirmed.
        const verified = c.source === 'stripe' || c.source === 'admin' || !!(c._app && c._app.status === 'paid');
        if (status === 'paid') paid += amt; else { pending += amt; if (verified) pendingVerified += amt; }
        return {
          id: c.id, rep_id: c.rep_id, rep: nameOf[c.rep_id] || 'Rep',
          business_name: c.business_name || null, deal_value: c.deal_value != null ? Number(c.deal_value) : null,
          kind: c.kind || 'audit', kind_label: c.kind_label || comp.KINDS[c.kind || 'audit'], rate: c.rate != null ? c.rate : 0.2, note: c.note || null,
          commission: amt, status, verified, created_at: c.created_at, paid_at: c.paid_at || null,
          application_id: c.application_id || null, rep_lead_id: c.rep_lead_id || null,
        };
      });
      const byRep = {};
      items.forEach((c) => {
        const g = byRep[c.rep_id] || (byRep[c.rep_id] = { rep_id: c.rep_id, rep: c.rep, pending: 0, paid: 0, count: 0 });
        g.count++; if (c.status === 'paid') g.paid += c.commission; else g.pending += c.commission;
      });
      return res.json({ items, totals: { pending, paid, count: items.length, pendingVerified }, byRep: Object.values(byRep).sort((a, b) => b.pending - a.pending), rates: await comp.getRates(), kinds: comp.KINDS });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (b.action === 'rates') return res.json(await comp.setRates(b));
      if (b.action === 'add') {
        if (!b.rep_id) return res.status(400).json({ error: 'Pick a rep' });
        const amount = Number(String(b.amount || '').replace(/[^0-9.]/g, ''));
        if (!amount) return res.status(400).json({ error: 'Enter the amount the client paid' });
        const kind = comp.KINDS[b.kind] ? b.kind : 'other';
        const rates = await comp.getRates();
        const rate = b.rate !== undefined && b.rate !== '' ? (Number(b.rate) > 1 ? Number(b.rate) / 100 : Number(b.rate)) : (kind === 'audit' ? rates.audit : rates.upsell);
        const lead = b.rep_lead_id ? await db.getById('rep_leads', b.rep_lead_id).catch(() => null) : null;
        const row = await comp.writeCommission({
          id: `cm_${kind}_m${Date.now().toString(36)}`, rep_id: b.rep_id, rep_lead_id: lead ? lead.id : null,
          application_id: lead ? lead.application_id : null, business_name: b.business_name || (lead && lead.business_name) || null,
          kind, amount, rate, note: b.note || null, source: 'admin',
        });
        return res.status(201).json(row);
      }
      return res.status(400).json({ error: 'unknown action' });
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
