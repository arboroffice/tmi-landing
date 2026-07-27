// Admin - Payments & OS. Every Intelligent Company Audit lead, whether they
// paid the $5,000 or not, joined to their OS (tenant) if they have one. This is
// how the team tracks who paid, when, and whether that customer is now running
// on the OS. Admin-only.
//
// GET -> { summary, payments: [ { ...lead, paid, amount, os } ] }

const db = require('./_db');
const { cors, requireAuth } = require('./_auth');

const AUDIT_PRICE = Number(process.env.COMPLETE_AUDIT_PRICE_CENTS || 500000) / 100; // $5,000

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    const [apps, users, tenants] = await Promise.all([
      db.list('applications', { where: [['source', '==', 'complete_audit']], order: 'created_at', ascending: false, limit: 5000 }).catch(() => []),
      db.list('os_users', { limit: 5000 }).catch(() => []),
      db.list('os_tenants', { limit: 5000 }).catch(() => []),
    ]);

    // email -> owning tenant, so a paying customer links to their OS.
    const tenantById = {};
    (tenants || []).forEach(t => { tenantById[t.id] = t; });
    const tenantByEmail = {};
    (users || []).forEach(u => {
      const em = String(u.email || '').toLowerCase();
      if (!em) return;
      const t = tenantById[u.tenant_id];
      // Prefer the owner's tenant, but any membership is a link to an OS.
      if (t && (!tenantByEmail[em] || (u.role || '') === 'owner')) tenantByEmail[em] = t;
    });

    const now = new Date();
    const thisMonth = d => { if (!d) return false; const t = new Date(d); return t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth(); };
    const isPaid = a => a.status === 'paid' || a.status === 'booked';

    const payments = (apps || []).map(a => {
      const em = String(a.email || '').toLowerCase();
      const t = tenantByEmail[em] || null;
      const paid = isPaid(a);
      return {
        id: a.id,
        name: a.name || null,
        company: a.company || null,
        email: a.email || null,
        phone: a.phone || null,
        status: a.status || 'captured',
        paid,
        amount: paid ? AUDIT_PRICE : null,
        paid_at: a.paid_at || null,
        stripe_session: a.stripe_session || null,
        created_at: a.created_at || null,
        os: t ? { tenant_id: t.id, name: t.name || null, plan: t.plan || 'trial', onboarded: !!t.onboarded, created_at: t.created_at || null } : null,
      };
    });

    const paidRows = payments.filter(p => p.paid);
    const summary = {
      leads: payments.length,
      paid: paidRows.length,
      revenue: paidRows.length * AUDIT_PRICE,
      revenue_mtd: paidRows.filter(p => thisMonth(p.paid_at)).length * AUDIT_PRICE,
      on_os: payments.filter(p => p.os).length,
      paid_on_os: paidRows.filter(p => p.os).length,
      audit_price: AUDIT_PRICE,
    };

    return res.json({ summary, payments });
  } catch (e) {
    console.error('admin-payments:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
