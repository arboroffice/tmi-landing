const { cors, verifyToken } = require('./_auth');

// Trigger GTM orchestrator via HTTP. Auth: either the GTM_RUN_SECRET bearer
// (GitHub Actions / cron) or a valid admin JWT (the admin command center button).
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const okSecret = process.env.GTM_RUN_SECRET && token === process.env.GTM_RUN_SECRET;
  const okAdmin = !!verifyToken(req);
  if (!okSecret && !okAdmin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Import and run the orchestrator (dynamic import since agents/ uses ESM)
  try {
    const { run } = await import('../agents/gtm/orchestrator.js');
    // Run async without blocking the HTTP response
    run().catch(err => console.error('GTM orchestrator error:', err));
    return res.json({ ok: true, message: 'GTM agent started' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
