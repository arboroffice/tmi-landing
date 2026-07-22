// TMI OS — team management. The owner invites teammates into the company OS,
// sets their role, and removes them. Everyone on a tenant shares one OS; roles
// gate what they can do: owner (everything, incl. team + settings), manager
// (operate and build), viewer (read only). Owner-only endpoint.
//
// POST { action, ... }
//   'list'                              -> { members }
//   'invite' { email, name, role }      -> { member, join_url }
//   'role'   { id, role }               -> { member }
//   'remove' { id }                     -> { ok: true }

const crypto = require('crypto');
const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');

const ROLES = ['owner', 'manager', 'viewer'];
const FROM = 'TMI OS <support@tmitechai.com>';

function safe(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role || 'manager', status: u.status || 'active' };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;
  if (!requireRole(t, res, 'owner')) return;

  const b = req.body || {};
  const action = String(b.action || 'list');
  const tid = t.tenant_id;

  try {
    if (action === 'list') {
      const members = await db.list('os_users', { where: [['tenant_id', '==', tid]] });
      return res.status(200).json({ members: members.map(safe) });
    }

    if (action === 'invite') {
      const email = String(b.email || '').toLowerCase().trim();
      const name = String(b.name || '').trim();
      const role = ROLES.includes(b.role) ? b.role : 'manager';
      if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
      if (!name) return res.status(400).json({ error: 'Name required' });
      if (await db.findOne('os_users', 'email', email)) return res.status(409).json({ error: 'That email is already on a company' });

      const token = crypto.randomBytes(24).toString('hex');
      const member = await db.insert('os_users', {
        tenant_id: tid, email, name, role, status: 'invited',
        password_hash: null, invite_token: token, created_at: new Date().toISOString(),
      });
      const tenant = await db.getById('os_tenants', tid).catch(() => null);
      const join_url = `https://os.tmitechai.com/join?token=${token}`;
      sendInvite(email, name, tenant && tenant.name, join_url).catch(() => {});
      await db.insert('os_build_log', { tenant_id: tid, kind: 'team', summary: `Invited ${name} (${role}).`, created_at: new Date().toISOString() });
      return res.status(201).json({ member: safe(member), join_url });
    }

    const id = String(b.id || '');
    if (!id) return res.status(400).json({ error: 'id required' });
    const member = await db.getById('os_users', id);
    if (!member || member.tenant_id !== tid) return res.status(404).json({ error: 'Member not found' });

    if (action === 'role') {
      const role = ROLES.includes(b.role) ? b.role : 'manager';
      if (id === t.sub && role !== 'owner') {
        const owners = (await db.list('os_users', { where: [['tenant_id', '==', tid]] })).filter(u => (u.role || 'manager') === 'owner');
        if (owners.length <= 1) return res.status(400).json({ error: 'The company needs at least one owner' });
      }
      const updated = await db.update('os_users', id, { role });
      return res.status(200).json({ member: safe(updated) });
    }

    if (action === 'remove') {
      if (id === t.sub) return res.status(400).json({ error: 'You cannot remove yourself' });
      await db.remove('os_users', id);
      await db.insert('os_build_log', { tenant_id: tid, kind: 'team', summary: `Removed ${member.name} from the team.`, created_at: new Date().toISOString() });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-team:', e.message);
    return res.status(500).json({ error: 'Could not update the team' });
  }
};

async function sendInvite(email, name, company, url) {
  if (!process.env.RESEND_API_KEY) return;
  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: FROM, to: [email],
    subject: `You have been added to ${company || 'a company'} on TMI OS`,
    text: `Hi ${name},\n\nYou have been invited into ${company || 'the'} company OS on TMI. Set your password and get in here:\n\n${url}\n\nThis link is one time and just for you.`,
  });
}
