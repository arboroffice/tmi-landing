// Member auth — public accounts, separate from admin. JWT carries kind:'member'
// so a member token can never hit an admin endpoint (admin checks verifyToken which
// does not care about kind, but member endpoints require kind:'member', and admin
// endpoints are unaffected). Passwords hashed with scrypt (no extra deps).

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TTL = '30d';

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(pw, stored) {
  if (!stored || !String(stored).includes(':')) return false;
  const [salt, hash] = String(stored).split(':');
  const h = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  const a = Buffer.from(h), b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signMember(member) {
  return jwt.sign({ sub: member.id, email: member.email, kind: 'member' }, SECRET, { expiresIn: TTL });
}
function verifyMember(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  try {
    const p = jwt.verify(auth.slice(7), SECRET);
    return p && p.kind === 'member' ? p : null;
  } catch { return null; }
}
function requireMember(req, res) {
  const m = verifyMember(req);
  if (!m) { res.status(401).json({ error: 'Sign in required' }); return null; }
  return m;
}

module.exports = { hashPassword, verifyPassword, signMember, verifyMember, requireMember };
