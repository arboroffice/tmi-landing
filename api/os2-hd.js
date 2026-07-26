// TMI OS - Human Design, the member side. A person computes their own chart in
// the OS, and an owner can send an intake link to anyone on the team (or a
// client) to take it, keeping every chart as a record on the company. All
// computation is in-house (_oshd), so birth data never leaves the platform.
//
// POST { action, ... }
//   'state'                                  -> { me, team, invites }
//   'submit' { name, date, time, tz_offset } -> { profile }   compute + store the caller's own chart
//   'get'    { id }                          -> { profile }   full chart (tenant-scoped)
//   'invite' { name }        (manager)       -> { invite, url } shareable intake link for a teammate
//   'revoke' { id }          (manager)       -> { ok }         cancel a pending invite
//   'remove' { id }          (manager)       -> { ok }         delete a stored chart

const crypto = require('crypto');
const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');
const { scope } = require('./_ostenantdb');
const HD = require('./_oshd');

const INTAKE_BASE = 'https://www.tmitechai.com/hd-intake?token=';

// The light shape shown in a team list (no raw birth data, no full bodygraph).
function teamCard(p) {
  return {
    id: p.id, name: p.name || 'Someone', role: p.role || null, source: p.source || null,
    type: p.type, authority: p.authority, profile: p.profile, strategy: p.strategy,
    computed_at: p.computed_at || null,
  };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;
  const tid = t.tenant_id;
  const tdb = scope(tid);
  const b = req.body || {};
  const action = String(b.action || 'state');

  try {
    if (action === 'state') {
      const [profiles, invites] = await Promise.all([
        tdb.list('os_hd_profiles', { limit: 500 }),
        tdb.list('os_hd_invites', { limit: 200 }),
      ]);
      const me = profiles.find(p => p.user_id === t.sub) || null;
      const team = profiles.filter(p => p.user_id !== t.sub).map(teamCard);
      const pending = invites.filter(i => i.status === 'pending').map(i => ({ id: i.id, token: i.token, invited_name: i.invited_name || null, url: INTAKE_BASE + i.token, created_at: i.created_at }));
      return res.status(200).json({ me: me || null, team, invites: pending });
    }

    if (action === 'get') {
      const p = await tdb.getById('os_hd_profiles', String(b.id || ''));
      if (!p) return res.status(404).json({ error: 'Chart not found' });
      return res.status(200).json({ profile: p });
    }

    if (action === 'submit') {
      // Any signed-in member can compute their own chart.
      let chart;
      try { chart = HD.computeChart({ date: b.date, time: b.time, tz_offset: b.tz_offset }); }
      catch (e) { return res.status(400).json({ error: 'Check the birth date and time.' }); }
      const now = new Date().toISOString();
      const rec = Object.assign({ user_id: t.sub, name: String(b.name || t.email || 'Me').slice(0, 120), source: 'self', updated_at: now }, chart);
      const existing = (await tdb.list('os_hd_profiles', { where: [['user_id', '==', t.sub]], limit: 1 }))[0];
      const profile = existing ? await tdb.update('os_hd_profiles', existing.id, rec) : await tdb.insert('os_hd_profiles', rec);
      await db.insert('os_build_log', { tenant_id: tid, kind: 'human-design', summary: `${rec.name} took the Human Design assessment: ${chart.type}.`, created_at: now }).catch(() => {});
      return res.status(200).json({ profile });
    }

    // Writes below are manager-only.
    if (!requireRole(t, res, 'manager')) return;

    if (action === 'invite') {
      const token = crypto.randomBytes(12).toString('hex');
      const invite = await tdb.insert('os_hd_invites', {
        token, invited_name: String(b.name || '').slice(0, 120) || null,
        status: 'pending', created_by: t.email || t.sub, created_at: new Date().toISOString(),
      });
      return res.status(200).json({ invite: { id: invite.id, token, invited_name: invite.invited_name }, url: INTAKE_BASE + token });
    }

    if (action === 'revoke') {
      const ok = await tdb.remove('os_hd_invites', String(b.id || ''));
      return res.status(200).json({ ok });
    }

    if (action === 'remove') {
      const ok = await tdb.remove('os_hd_profiles', String(b.id || ''));
      return res.status(200).json({ ok });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-hd:', e.message);
    return res.status(500).json({ error: 'Could not complete that' });
  }
};

module.exports.config = { maxDuration: 30 };
