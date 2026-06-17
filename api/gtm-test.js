// Admin-triggered test send: fires the tester (build audit + send the cold email)
// to a recipient, default mia@tmitechai.com. Used by the admin command center.

const { cors, requireAuth } = require('./_auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!requireAuth(req, res)) return;

  const { email, company, domain } = req.body || {};
  const to = email || 'mia@tmitechai.com';
  try {
    const { runTest } = await import('../agents/gtm/test-send.js');
    // Fire-and-forget: the send takes ~15-30s; don't block the request.
    runTest({ email: to, company, domain }).catch(err => console.error('gtm-test error:', err));
    return res.json({ ok: true, message: `Test send started to ${to}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
