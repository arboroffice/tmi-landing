// TMI OS — company settings. Update the tenant's name, business type, and the
// profile answers that ground the COO and every worker. Scoped to the caller's
// own tenant. POST { name?, business_type?, profile? } -> { tenant }

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');

const PFIELDS = ['what_you_do', 'what_you_track', 'what_falls_through', 'tools', 'bottleneck'];

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;
  if (!requireRole(t, res, 'owner')) return;

  const b = req.body || {};
  const tid = t.tenant_id;
  try {
    const tenant = await db.getById('os_tenants', tid);
    if (!tenant) return res.status(404).json({ error: 'Company not found' });

    const patch = {};
    if (typeof b.name === 'string' && b.name.trim()) patch.name = b.name.trim().slice(0, 120);
    if (typeof b.business_type === 'string') patch.business_type = b.business_type.trim().slice(0, 80) || null;
    if (typeof b.digest === 'boolean') patch.digest = b.digest;
    if (b.profile && typeof b.profile === 'object') {
      const prof = Object.assign({}, tenant.profile || {});
      for (const k of PFIELDS) if (typeof b.profile[k] === 'string') prof[k] = b.profile[k].slice(0, 2000);
      patch.profile = prof;
    }
    const u = await db.update('os_tenants', tid, patch);
    return res.status(200).json({
      tenant: {
        id: u.id, name: u.name, business_type: u.business_type || null,
        plan: u.plan || 'trial', profile: u.profile || {}, summary: u.summary || null,
        onboarded: !!u.onboarded, digest: u.digest !== false,
      },
    });
  } catch (e) {
    console.error('os2-profile:', e.message);
    return res.status(500).json({ error: 'Could not save settings' });
  }
};
