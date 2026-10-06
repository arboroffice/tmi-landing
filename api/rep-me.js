// Current rep's profile from their token.
const db = require('./_db');
const { cors } = require('./_auth');
const { requireRep } = require('./_rep-auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const r = await requireRep(req, res); if (!r) return;
  try {
    const rep = await db.getById('reps', r.sub);
    if (!rep) return res.status(404).json({ error: 'Not found' });
    // Reps fill in their own details. Login email stays as admin set it; invites
    // for calls they book go to cal_email (or the login email if blank).
    if (req.method === 'PATCH') {
      const b = req.body || {};
      const up = {};
      const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
      if (b.name !== undefined) { const v = clip(b.name, 80); if (!v) return res.status(400).json({ error: 'Name cannot be blank' }); up.name = v; }
      if (b.phone !== undefined) up.phone = clip(b.phone, 30) || null;
      if (b.city !== undefined) up.city = clip(b.city, 60) || null;
      if (b.cal_email !== undefined) {
        const v = clip(b.cal_email, 120).toLowerCase();
        if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return res.status(400).json({ error: 'That email does not look right' });
        up.cal_email = v || null;
      }
      up.profile_updated_at = new Date().toISOString();
      const out = await db.update('reps', r.sub, up);
      return res.json({ id: out.id, name: out.name, email: out.email, city: out.city, phone: out.phone, cal_email: out.cal_email || null });
    }
    return res.json({ id: rep.id, name: rep.name, email: rep.email, city: rep.city, phone: rep.phone, cal_email: rep.cal_email || null });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
