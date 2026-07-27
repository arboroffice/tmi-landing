// Serves the Intelligent Company Audit intake schema to the intake form.

const { cors } = require('./_auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const { INTAKE } = await import('../agents/gtm/intake-questions.js');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.json(INTAKE);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
