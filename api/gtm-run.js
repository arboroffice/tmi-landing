const { cors } = require('./_auth');

// Trigger GTM orchestrator via HTTP
// Called by GitHub Actions: curl -X POST $URL -H "Authorization: Bearer $SECRET"
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Simple bearer token auth
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (token !== process.env.GTM_RUN_SECRET) {
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
