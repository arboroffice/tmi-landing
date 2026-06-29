const jwt = require('jsonwebtoken');
const { cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(503).json({ error: 'JWT_SECRET not configured' });
  const adminPw = process.env.ADMIN_PASSWORD;

  // POST /api/auth — login
  if (req.method === 'POST') {
    const { password } = req.body || {};
    if (!adminPw) return res.status(503).json({ error: 'ADMIN_PASSWORD not configured' });
    if (!password || password !== adminPw) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    const token = jwt.sign({ admin: true }, secret, { expiresIn: '14d' });
    return res.json({ token });
  }

  // PUT /api/auth — change password (requires current token + current password)
  if (req.method === 'PUT') {
    const { requireAuth } = require('./_auth');
    if (!requireAuth(req, res)) return;
    const { current_password, new_password } = req.body || {};
    if (!adminPw || current_password !== adminPw) {
      return res.status(401).json({ error: 'Current password incorrect' });
    }
    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ error: 'New password too short' });
    }
    // Note: changing the actual ADMIN_PASSWORD env var requires Vercel API integration.
    // For now this validates and returns success — user must update the env var manually.
    return res.json({ ok: true, note: 'Update ADMIN_PASSWORD in Vercel environment variables to take effect.' });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
