// City-lead rep auth. Accepts a Firebase Auth ID token (the portal signs in with
// Firebase) OR, for backward compatibility, the legacy custom JWT (kind:'rep').
// Either way we resolve to the rep's `reps` profile doc, creating it on first
// Firebase login. Legacy passwords stay scrypt-hashed for the old login path.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const dbmod = require('./_db');

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
function bearer(req) {
  const a = req.headers.authorization || '';
  return a.startsWith('Bearer ') ? a.slice(7) : '';
}

// Legacy custom JWT (kind:'rep'). Sync, cheap.
function verifyLegacy(token) {
  if (!SECRET) return null;
  try {
    const p = jwt.verify(token, SECRET);
    return p && p.kind === 'rep' ? p : null;
  } catch { return null; }
}

// Firebase Auth ID token, verified with the Admin SDK.
async function verifyFirebase(token) {
  try {
    dbmod.db(); // ensure the admin app is initialized
    const dec = await dbmod.admin.auth().verifyIdToken(token);
    return dec && dec.uid ? dec : null;
  } catch { return null; }
}

// Resolve (and lazily create) the `reps` profile doc backing an identity, so the
// rest of the portal keeps keying leads off a stable reps doc id.
async function resolveProfile({ sub, email, name, uid }) {
  if (sub) {
    const p = await dbmod.getById('reps', sub).catch(() => null);
    if (p) return p;
  }
  const em = String(email || '').toLowerCase().trim();
  if (!em) return null;
  const all = await dbmod.list('reps', { limit: 500 }).catch(() => []);
  const found = (all || []).find((r) => r && r.email && String(r.email).toLowerCase().trim() === em);
  if (found) {
    if (uid && found.firebase_uid !== uid) await dbmod.update('reps', found.id, { firebase_uid: uid }).catch(() => {});
    return found;
  }
  // First-time Firebase rep with no profile yet: create one so they show up in
  // Admin > City Team and can own leads.
  return dbmod.insert('reps', {
    name: name || em, email: em, city: null, phone: null,
    firebase_uid: uid || null, status: 'active', created_at: new Date().toISOString(),
  });
}

// Returns a normalized identity { sub, id, email, name, profile } (sub === reps
// doc id, so existing endpoints need no change) or null.
async function verifyRep(req) {
  const token = bearer(req);
  if (!token) return null;

  const legacy = verifyLegacy(token);
  if (legacy) {
    const profile = await resolveProfile({ sub: legacy.sub, email: legacy.email, name: legacy.name });
    if (!profile || profile.status === 'disabled') return null;
    return { sub: profile.id, id: profile.id, email: profile.email, name: profile.name, profile };
  }

  const fb = await verifyFirebase(token);
  if (fb) {
    const profile = await resolveProfile({ email: fb.email, name: fb.name, uid: fb.uid });
    if (!profile || profile.status === 'disabled') return null;
    return { sub: profile.id, id: profile.id, email: profile.email, name: profile.name, profile };
  }
  return null;
}

async function requireRep(req, res) {
  const r = await verifyRep(req);
  if (!r) { res.status(401).json({ error: 'Sign in required' }); return null; }
  return r;
}

module.exports = { hashPassword, verifyPassword, signRep, verifyRep, requireRep };
