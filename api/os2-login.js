// TMI OS — sign in. POST { email, password } -> { token, user, tenant }

const db = require('./_db');
const { verifyPassword, hashPassword, signTenant, cors } = require('./_tenant-auth');

// A real scrypt hash of a random value, computed once at cold start. Used to
// equalize verify timing when the email is unknown. No password matches it.
const DUMMY_HASH = hashPassword(require('crypto').randomBytes(24).toString('hex'));

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const b = req.body || {};
  const email = (b.email || '').toLowerCase().trim();
  const password = String(b.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const user = await db.findOne('os_users', 'email', email);
    // Always run a scrypt verify, even when the email is unknown, so response
    // timing does not reveal whether an account exists (anti-enumeration). The
    // dummy hash is a real scrypt hash of a random value that no password matches.
    const stored = (user && user.password_hash) || DUMMY_HASH;
    const good = verifyPassword(password, stored);
    if (!user || !good) {
      return res.status(401).json({ error: 'Wrong email or password' });
    }
    const tenant = await db.getById('os_tenants', user.tenant_id);
    const token = signTenant(user);
    const safeUser = { id: user.id, tenant_id: user.tenant_id, email: user.email, name: user.name, role: user.role };
    return res.status(200).json({
      token, user: safeUser,
      tenant: { id: user.tenant_id, name: tenant ? tenant.name : null, onboarded: !!(tenant && tenant.onboarded) },
    });
  } catch (e) {
    console.error('os2-login:', e.message);
    return res.status(500).json({ error: 'Could not sign you in. Try again.' });
  }
};
