// TMI OS — installer (agency) client-workspace management. Lets a partner/
// installer tenant list, create, and open the client workspaces it manages.
// Every client workspace is an os_tenants record whose parent_installer_id
// points back at the installer, and "open" mints a tenant-scoped token so the
// installer can switch into that client's OS.
//
// POST { action, ...args } -> depends on action
//   list                        -> { clients }
//   create { name, mode }       -> { client }
//   open   { client_id }        -> { token }

const db = require('./_db');
const { requireTenant, signTenant, cors } = require('./_tenant-auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;

  const b = req.body || {};
  const action = (b.action || '').trim();

  try {
    // Only an installer/partner tenant may manage client workspaces.
    const installer = await db.getById('os_tenants', t.tenant_id);
    if (!installer) return res.status(401).json({ error: 'Account not found' });
    const isInstaller = t.is_installer === true || installer.is_installer === true || installer.plan === 'partner';
    if (!isInstaller) return res.status(403).json({ error: 'Only an installer account can manage client workspaces' });

    if (action === 'list') {
      const rows = await db.list('os_tenants', { where: [['parent_installer_id', '==', t.tenant_id]] });
      const clients = rows.map(c => ({
        id: c.id,
        name: c.name,
        business_type: c.business_type || null,
        onboarded: !!c.onboarded,
        summary: c.summary || null,
        created_at: c.created_at || null,
      }));
      return res.status(200).json({ clients });
    }

    if (action === 'create') {
      const name = (b.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Name required' });
      const businessType = b.mode === 'creator' ? 'creator' : 'business';

      const client = await db.insert('os_tenants', {
        name,
        business_type: businessType,
        profile: {},
        onboarded: false,
        plan: 'trial',
        parent_installer_id: t.tenant_id,
        created_at: new Date().toISOString(),
      });

      return res.status(201).json({ client: { id: client.id, name: client.name } });
    }

    if (action === 'open') {
      const clientId = (b.client_id || '').toString().trim();
      if (!clientId) return res.status(400).json({ error: 'client_id required' });

      const client = await db.getById('os_tenants', clientId);
      if (!client || client.parent_installer_id !== t.tenant_id) {
        return res.status(403).json({ error: 'Not your client workspace' });
      }

      // Mint a tenant-scoped token for the client, reusing signTenant exactly as
      // os2-signup does. The workspace has no user of its own, so the token keeps
      // the installer's user identity (sub/email) but scopes tenant_id to the client.
      const token = signTenant({ id: t.sub, email: t.email, tenant_id: client.id, role: 'owner' });
      return res.status(200).json({ token });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-clients:', e.message);
    return res.status(500).json({ error: 'Could not manage client workspaces' });
  }
};
