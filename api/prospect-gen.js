// Trigger the prospect-gen runner (intent + reactivation + lookalike + SMS).
// Auth: GTM_RUN_SECRET bearer (cron / GitHub Actions) or a valid admin JWT.

const { cors, verifyToken } = require('./_auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const okSecret = process.env.GTM_RUN_SECRET && token === process.env.GTM_RUN_SECRET;
  const okAdmin = !!verifyToken(req);
  if (!okSecret && !okAdmin) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { runProspectGen } = await import('../agents/gtm/prospect-gen.js');
    // run async; don't block the HTTP response
    runProspectGen(req.body || {}).catch(err => console.error('prospect-gen error:', err));
    return res.json({ ok: true, message: 'Prospect-gen started' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
