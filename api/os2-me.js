// TMI OS — current user + tenant (used to gate the app and route onboarding).
// GET -> { user, tenant }

const db = require('./_db');
const { requireTenant, cors } = require('./_tenant-auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const t = requireTenant(req, res);
  if (!t) return;

  try {
    const [user, tenant] = await Promise.all([
      db.getById('os_users', t.sub),
      db.getById('os_tenants', t.tenant_id),
    ]);
    if (!user || !tenant) return res.status(401).json({ error: 'Account not found' });
    return res.status(200).json({
      user: { id: user.id, tenant_id: user.tenant_id, email: user.email, name: user.name, role: user.role },
      tenant: { id: tenant.id, name: tenant.name, business_type: tenant.business_type, onboarded: !!tenant.onboarded, plan: tenant.plan || 'trial' },
    });
  } catch (e) {
    console.error('os2-me:', e.message);
    return res.status(500).json({ error: 'Could not load your account' });
  }
};
