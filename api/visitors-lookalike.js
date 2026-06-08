const { requireAuth, cors } = require('./_auth');
const { createLookalike } = require('./_meta-audience');

// Create a Meta lookalike audience from the RB2B visitor Custom Audience.
// POST { country?, ratio? }. No ad spend — just builds the audience.
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;

  const { country, ratio } = req.body || {};
  const result = await createLookalike({ country, ratio });
  if (!result.ok) return res.status(502).json(result);
  return res.json(result);
};
