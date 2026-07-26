// TMI Human Design - public intake. An owner sends a teammate (or client) an
// intake link; this serves the invite context and takes their birth data, then
// computes the chart in-house and keeps it as a record on the inviting company.
// No auth: the single-use token is the key. Birth data is computed locally and
// never sent to any third party.
//
// GET  ?token=<t>                                  -> { valid, company, invited_name }
// POST { token, name, date, time, tz_offset }      -> { ok, type, authority, profile }

const db = require('./_db');
const HD = require('./_oshd');

async function inviteByToken(token) {
  if (!token) return null;
  const rows = await db.list('os_hd_invites', { where: [['token', '==', token]], limit: 1 });
  return rows[0] || null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const inv = await inviteByToken(String((req.query && req.query.token) || ''));
      if (!inv) return res.status(200).json({ valid: false });
      const tenant = await db.getById('os_tenants', inv.tenant_id).catch(() => null);
      return res.status(200).json({ valid: true, company: (tenant && tenant.name) || 'a company', invited_name: inv.invited_name || null });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const inv = await inviteByToken(String(b.token || ''));
      if (!inv) return res.status(404).json({ error: 'This link is not valid.' });

      let chart;
      try { chart = HD.computeChart({ date: b.date, time: b.time, tz_offset: b.tz_offset }); }
      catch (e) { return res.status(400).json({ error: 'Check the birth date and time.' }); }

      const now = new Date().toISOString();
      const rec = Object.assign({
        tenant_id: inv.tenant_id, user_id: null, source: 'invite', invite_token: inv.token,
        name: String(b.name || inv.invited_name || 'Team member').slice(0, 120), updated_at: now,
      }, chart);

      // One chart per invite: replace if this token was already used.
      let profile;
      if (inv.profile_id) {
        profile = await db.update('os_hd_profiles', inv.profile_id, rec);
      } else {
        profile = await db.insert('os_hd_profiles', rec);
        await db.update('os_hd_invites', inv.id, { status: 'filled', profile_id: profile.id, filled_at: now });
      }
      await db.insert('os_build_log', { tenant_id: inv.tenant_id, kind: 'human-design', summary: `${rec.name} completed the Human Design intake: ${chart.type}.`, created_at: now }).catch(() => {});
      return res.status(200).json({ ok: true, type: chart.type, authority: chart.authority, profile: chart.profile, strategy: chart.strategy });
    }

    return res.status(405).json({ error: 'GET or POST' });
  } catch (e) {
    console.error('hd-intake:', e.message);
    return res.status(500).json({ error: 'Could not complete that' });
  }
};

module.exports.config = { maxDuration: 30 };
