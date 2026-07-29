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
    return res.json({ pending, paid, count: (rows || []).length });
  } catch (e) {
    console.error('rep-me-commissions:', e.message);
    return res.status(500).json({ error: e.message });
  }
};

module.exports.config = { maxDuration: 15 };
