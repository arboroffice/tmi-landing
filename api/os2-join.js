// TMI OS — accept a team invite. The invited teammate sets their password with
// their one-time invite token, which activates their account and signs them in
// to the company OS. No prior auth: the token is the credential.
//
// POST { token, name?, password } -> { token, user, tenant }

const db = require('./_db');
const { hashPassword, signTenant, cors } = require('./_tenant-auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const b = req.body || {};
  const token = String(b.token || '').trim();
  const password = String(b.password || '');
  const name = String(b.name || '').trim();
  if (!token) return res.status(400).json({ error: 'Invite token required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const user = await db.findOne('os_users', 'invite_token', token);
    if (!user || user.status !== 'invited') return res.status(410).json({ error: 'This invite is no longer valid. Ask for a new one.' });

    const updated = await db.update('os_users', user.id, {
      password_hash: hashPassword(password),
      status: 'active',
      invite_token: null,
      name: name || user.name,
      joined_at: new Date().toISOString(),
    });
    const tenant = await db.getById('os_tenants', updated.tenant_id).catch(() => null);
    const jwt = signTenant(updated);
    await db.insert('os_build_log', { tenant_id: updated.tenant_id, kind: 'team', summary: `${updated.name} joined the team.`, created_at: new Date().toISOString() }).catch(() => {});
    return res.status(200).json({
      token: jwt,
      user: { id: updated.id, tenant_id: updated.tenant_id, email: updated.email, name: updated.name, role: updated.role },
      tenant: { id: updated.tenant_id, name: tenant ? tenant.name : null, onboarded: !!(tenant && tenant.onboarded) },
    });
  } catch (e) {
    console.error('os2-join:', e.message);
    return res.status(500).json({ error: 'Could not complete sign up. Try again.' });
  }
};
