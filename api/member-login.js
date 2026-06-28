// Public member login.
const db = require('./_db');
const { cors } = require('./_auth');
const { verifyPassword, signMember } = require('./_member-auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const m = await db.findOne('members', 'email', String(email).toLowerCase().trim());
    if (!m || !verifyPassword(password, m.password)) return res.status(401).json({ error: 'Wrong email or password' });
    return res.json({ token: signMember(m), member: { id: m.id, email: m.email, name: m.name, company: m.company } });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
