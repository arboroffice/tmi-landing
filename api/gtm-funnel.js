// Outbound funnel for the admin command center: counts per stage so you can see
// the weak link (sourced -> contacted -> audit viewed -> replied -> booked).

const { cors, requireAuth } = require('./_auth');
const dbx = require('./_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    const c = (where) => dbx.count('leads', where).catch(() => 0);
    const [total, audited, inCampaign, sent, replied, booked, suppressed, notFit, unsub, viewed] = await Promise.all([
      c(),
      c([['status', '==', 'audited']]),
      c([['status', '==', 'in_campaign']]),
      c([['status', '==', 'sent']]),
      c([['status', '==', 'replied']]),
      c([['status', '==', 'booked']]),
      c([['status', '==', 'suppressed']]),
      c([['status', '==', 'not_fit']]),
      c([['status', '==', 'unsubscribed']]),
      c([['audit_viewed_at', '!=', null]]),
    ]);
    const contacted = inCampaign + sent + replied + booked;
    return res.json({
      sourced: total,
      contacted,
      auditViewed: viewed,
      replied: replied + booked,
      booked,
      breakdown: { audited, inCampaign, sent, replied, booked, suppressed, notFit, unsubscribed: unsub },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
