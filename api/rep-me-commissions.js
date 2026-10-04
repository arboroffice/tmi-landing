// A rep's own commission ledger totals (what admin has actually paid out vs what
// is still pending), so the rep app can show the real numbers instead of only a
// client-side estimate. Rep-scoped to the token.
//   GET / POST -> { pending, paid, count }
const db = require('./_db');
const { cors } = require('./_auth');
const { requireRep } = require('./_rep-auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const rep = await requireRep(req, res); if (!rep) return;
  try {
    const rows = await db.list('rep_commissions', { where: [['rep_id', '==', rep.sub]], limit: 1000 }).catch(() => []);
    let pending = 0, paid = 0;
    (rows || []).forEach((c) => { const a = Number(c.commission) || 0; if (c.status === 'paid') paid += a; else pending += a; });
    const items = (rows || []).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 50).map((c) => ({
      business_name: c.business_name || null, kind_label: c.kind_label || 'Intelligent Company Audit',
      deal_value: c.deal_value, rate: c.rate != null ? c.rate : 0.1, commission: Number(c.commission) || 0,
      status: c.status === 'paid' ? 'paid' : 'pending', created_at: c.created_at || null,
    }));
    return res.json({ pending, paid, count: (rows || []).length, items });
  } catch (e) {
    console.error('rep-me-commissions:', e.message);
    return res.status(500).json({ error: e.message });
  }
};

module.exports.config = { maxDuration: 15 };
