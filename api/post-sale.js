// Trigger the post-sale runner (onboarding + delivery + success + case studies +
// expansion + collections + founder brief). Auth: GTM_RUN_SECRET bearer or admin JWT.

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
    const { runPostSale } = await import('../agents/gtm/post-sale.js');
    runPostSale(req.body || {}).catch(err => console.error('post-sale error:', err));
    return res.json({ ok: true, message: 'Post-sale agents started' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
