// City-lead rep auth. Separate from admin and members. JWT carries kind:'rep'
// so a rep token only works on rep endpoints. Passwords hashed with scrypt.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
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
function signRep(rep) {
  if (!SECRET) throw new Error('JWT_SECRET not configured');
  return jwt.sign({ sub: rep.id, email: rep.email, name: rep.name, kind: 'rep' }, SECRET, { expiresIn: TTL });
}
function verifyRep(req) {
  if (!SECRET) return null;
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  try {
    const p = jwt.verify(auth.slice(7), SECRET);
    return p && p.kind === 'rep' ? p : null;
  } catch { return null; }
}
function requireRep(req, res) {
  const r = verifyRep(req);
  if (!r) { res.status(401).json({ error: 'Sign in required' }); return null; }
  return r;
}

module.exports = { hashPassword, verifyPassword, signRep, verifyRep, requireRep };
