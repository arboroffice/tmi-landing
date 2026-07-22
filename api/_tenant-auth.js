// Tenant auth for the TMI OS (the multi-tenant client platform on
// os.tmitechai.com). Separate from admin auth and from member auth: the JWT
// carries kind:'tenant' plus the tenant_id, so every OS endpoint can scope all
// reads and writes to the caller's company and one tenant can never see another.
//
// Passwords hashed with scrypt (Node crypto, no extra deps), same as members.

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

function signTenant(user) {
  if (!SECRET) throw new Error('JWT_SECRET not configured');
  return jwt.sign(
    { sub: user.id, email: user.email, tenant_id: user.tenant_id, role: user.role || 'owner', kind: 'tenant' },
    SECRET, { expiresIn: TTL }
  );
}
function verifyTenant(req) {
  if (!SECRET) return null;
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  try {
    const p = jwt.verify(auth.slice(7), SECRET);
    return p && p.kind === 'tenant' && p.tenant_id ? p : null;
  } catch { return null; }
}

// CORS for the OS app (bearer-token auth, no cookies, so a wildcard origin is safe).
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Gate an endpoint. Returns the decoded token (with .tenant_id, .sub) or null
// after having already written the 401 response.
function requireTenant(req, res) {
  const t = verifyTenant(req);
  if (!t) { res.status(401).json({ error: 'Sign in required' }); return null; }
  return t;
}

// Role rank. Legacy tokens (all owners) and any missing role default to owner,
// so existing accounts keep full access. viewer < manager < owner.
const RANK = { viewer: 1, manager: 2, owner: 3 };
function can(token, need) {
  return (RANK[token && token.role] || RANK.owner) >= (RANK[need] || RANK.owner);
}
// Gate a write. Returns true if allowed; otherwise writes 403 and returns false.
function requireRole(token, res, need) {
  if (can(token, need)) return true;
  res.status(403).json({ error: need === 'owner' ? 'Only the owner can do that' : 'You do not have access to change this' });
  return false;
}

module.exports = { hashPassword, verifyPassword, signTenant, verifyTenant, requireTenant, cors, can, requireRole };
