const { cors, verifyToken } = require('./_auth');

// Admin-facing snapshot of the cold-outbound campaign: the config the agents
// read, how many leads sit in each stage, and today's send progress. Powers the
// Campaign management tab.
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!verifyToken(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const db = await import('../agents/gtm/tools/db.js');
    const CAMPAIGN = (await import('../agents/gtm/campaign.js')).default;

    const countBy = (status) => db.count('leads', [['status', '==', status]]).catch(() => 0);
    const [neu, inCampaign, unqualified, sent, replied] = await Promise.all([
      countBy('new'), countBy('in_campaign'), countBy('unqualified'), countBy('sent'), countBy('replied'),
    ]);

    // Leads added to the campaign today (best-effort; contacted_at is an ISO string).
    let queuedToday = 0;
    try {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const recent = await db.list('leads', {
        where: [['status', '==', 'in_campaign']], order: 'contacted_at', ascending: false, limit: 80,
      });
      queuedToday = (recent || []).filter(l => l.contacted_at && new Date(l.contacted_at) >= start).length;
    } catch (_) {}

    return res.json({
      ok: true,
      campaign: {
        name: CAMPAIGN.name,
        market: CAMPAIGN.market && CAMPAIGN.market.name,
        geo: (CAMPAIGN.market && CAMPAIGN.market.geo) || [],
        dailyCap: (CAMPAIGN.sending && CAMPAIGN.sending.dailyCap) || 50,
        channel: (CAMPAIGN.sending && CAMPAIGN.sending.channel) || 'instantly',
        offer: CAMPAIGN.offer,
        sequence: CAMPAIGN.sequence || [],
        industries: (CAMPAIGN.icp && CAMPAIGN.icp.industries) || [],
      },
      counts: { new: neu, in_campaign: inCampaign, unqualified, sent, replied, queuedToday },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
