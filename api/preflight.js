// Admin pre-flight: GET /api/preflight -> the same readiness report as the CLI.
const { cors, requireAuth } = require('./_auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;
  try {
    const { preflight } = await import('../agents/gtm/preflight.js');
    const report = await preflight();
    return res.json(report);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
