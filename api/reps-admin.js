// Admin management of city-lead reps + oversight of their field activity.
//   GET                 -> [ reps + lead_count + booked_count ]
//   GET ?leads=<repId>  -> that rep's leads (oversight)
//   POST { name,email,password,city,phone }  -> create a rep
//   PATCH { id, name?,city?,phone?,status?,password? }  -> update / reset password / disable
//   DELETE { id }       -> remove a rep
const db = require('./_db');
const { cors, requireAuth } = require('./_auth');
const { hashPassword } = require('./_rep-auth');

const clean = (r) => ({ id: r.id, name: r.name, email: r.email, city: r.city, phone: r.phone, status: r.status || 'active', created_at: r.created_at });

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      if (req.query.leads) {
        const leads = await db.list('rep_leads', { where: [['rep_id', '==', req.query.leads]], order: 'updated_at', ascending: false, limit: 1000 });
        return res.json(leads || []);
      }
      const reps = await db.list('reps', { order: 'created_at', ascending: false, limit: 200 });
      const all = await db.list('rep_leads', { limit: 5000 }).catch(() => []);
      const counts = {}, booked = {};
      (all || []).forEach((l) => {
        counts[l.rep_id] = (counts[l.rep_id] || 0) + 1;
        if (l.status === 'booked' || l.status === 'won') booked[l.rep_id] = (booked[l.rep_id] || 0) + 1;
      });
      return res.json((reps || []).map((r) => Object.assign(clean(r), { lead_count: counts[r.id] || 0, booked_count: booked[r.id] || 0 })));
    }

    if (req.method === 'POST') {
      const { name, email, password, city, phone } = req.body || {};
      if (!email || !email.includes('@') || !password || String(password).length < 8) {
        return res.status(400).json({ error: 'Email and an 8+ character password are required' });
      }
      const em = String(email).toLowerCase().trim();
      if (await db.findOne('reps', 'email', em)) return res.status(409).json({ error: 'A rep with that email already exists' });
      const rep = await db.insert('reps', {
        name: name || em, email: em, city: city || null, phone: phone || null,
        password: hashPassword(password), status: 'active', created_at: new Date().toISOString(),
      });
      return res.status(201).json(clean(rep));
    }

    if (req.method === 'PATCH') {
      const b = req.body || {};
      if (!b.id) return res.status(400).json({ error: 'id required' });
      const up = {};
      ['name', 'city', 'phone', 'status'].forEach((k) => { if (b[k] !== undefined) up[k] = b[k]; });
      if (b.password) {
        if (String(b.password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
        up.password = hashPassword(b.password);
      }
      const out = await db.update('reps', b.id, up);
      return res.json(clean(out));
    }

    if (req.method === 'DELETE') {
      const id = (req.body && req.body.id) || req.query.id;
      if (!id) return res.status(400).json({ error: 'id required' });
      await db.remove('reps', id);
      return res.json({ ok: true });
    }

    return res.status(405).end();
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
