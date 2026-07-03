// Daily runner for the cold-outbound campaign. Fires on a Vercel cron; can also
// be triggered manually with ?secret=<GTM_RUN_SECRET>. Adds up to the daily cap
// of verified, in-fit leads into the Instantly campaign.
const { cors, verifyToken } = require('./_auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  // Allow Vercel cron (sets x-vercel-cron), a manual call with the run secret,
  // or a signed-in admin hitting the "Run today's send" button.
  const isCron = !!req.headers['x-vercel-cron'];
  const secret = process.env.GTM_RUN_SECRET;
  const got = (req.query && req.query.secret) || req.headers['x-run-secret'] ||
    (req.headers.authorization || '').replace('Bearer ', '');
  const okSecret = secret && got === secret;
  const okAdmin = !!verifyToken(req);
  if (!isCron && !okSecret && !okAdmin) return res.status(401).json({ error: 'unauthorized' });

  try {
    const limit = parseInt((req.query && req.query.limit) || '50', 10);
    const { runCampaignSend } = await import('../agents/gtm/campaign-send.js');
    const stats = await runCampaignSend({ limit: Number.isFinite(limit) ? limit : 50 });
    return res.json({ ok: true, ...stats });
  } catch (e) {
    console.error('campaign-send:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
};

// Verifying + queueing up to 50 leads can take a bit.
module.exports.config = { maxDuration: 300 };
