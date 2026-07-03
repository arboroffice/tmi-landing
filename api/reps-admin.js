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
const isToday = (iso) => { if (!iso) return false; const d = new Date(iso), n = new Date(); return d.toDateString() === n.toDateString(); };

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
      // Team activity feed: recent recorded interactions across all reps, with names.
      if (req.query.feed) {
        const [recaps, reps] = await Promise.all([
          db.list('rep_interactions', { order: 'created_at', ascending: false, limit: 40 }).catch(() => []),
          db.list('reps', { limit: 200 }).catch(() => []),
        ]);
        const nameOf = {}; (reps || []).forEach((r) => { nameOf[r.id] = r.name || r.email || 'Rep'; });
        return res.json((recaps || []).map((x) => ({ id: x.id, rep: nameOf[x.rep_id] || 'Rep', summary: x.summary, outcome: x.outcome, next_step: x.next_step, created_at: x.created_at })));
      }
      // One rep's recorded interactions (recaps) for the rep panel.
      if (req.query.activity) {
        const recaps = await db.list('rep_interactions', { where: [['rep_id', '==', req.query.activity]], order: 'created_at', ascending: false, limit: 20 }).catch(() => []);
        return res.json(recaps || []);
      }
      const reps = await db.list('reps', { order: 'created_at', ascending: false, limit: 200 });
      const all = await db.list('rep_leads', { limit: 5000 }).catch(() => []);
      const counts = {}, booked = {}, today = {}, last = {};
      (all || []).forEach((l) => {
        counts[l.rep_id] = (counts[l.rep_id] || 0) + 1;
        if (l.status === 'booked' || l.status === 'won') booked[l.rep_id] = (booked[l.rep_id] || 0) + 1;
        if (isToday(l.created_at)) today[l.rep_id] = (today[l.rep_id] || 0) + 1;
        const t = l.visited_at || l.updated_at || l.created_at;
        if (t && (!last[l.rep_id] || t > last[l.rep_id])) last[l.rep_id] = t;
      });
      return res.json((reps || []).map((r) => Object.assign(clean(r), {
        lead_count: counts[r.id] || 0, booked_count: booked[r.id] || 0, today_count: today[r.id] || 0,
        last_active: last[r.id] || null,
      })));
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      // Bulk assign a pasted list of businesses, to one rep or split across all.
      if (body.action === 'bulk_add') {
        const items = (Array.isArray(body.leads) ? body.leads : []).filter((x) => x && (x.business_name || x.contact_name)).slice(0, 150);
        if (!items.length) return res.status(400).json({ error: 'No valid businesses to add (need at least a name per line)' });
        let targets;
        if (body.split) {
          const reps = await db.list('reps', { limit: 200 });
          targets = (reps || []).filter((r) => r.status !== 'disabled').map((r) => r.id);
          if (!targets.length) return res.status(400).json({ error: 'No active reps to split across' });
        } else {
          if (!body.rep_id) return res.status(400).json({ error: 'Pick a rep, or choose split across all' });
          if (!(await db.getById('reps', body.rep_id))) return res.status(404).json({ error: 'Rep not found' });
          targets = [body.rep_id];
        }
        const now = new Date().toISOString();
        let created = 0, i = 0;
        for (const it of items) {
          const rid = targets[i % targets.length]; i++;
          await db.insert('rep_leads', {
            rep_id: rid, business_name: it.business_name || null,
            contact_name: it.contact_name || it.owner_name || null,
            phone: it.phone || null, email: it.email || null,
            address: it.address || null, industry: it.industry || null,
            lat: null, lng: null, status: 'new', notes: it.notes || null, next_action_at: null,
            priority: it.priority || null, context: it.context || null,
            company_domain: it.domain || null, lead_id: it.lead_id || null,
            source: 'assigned', created_at: now, updated_at: now, visited_at: null,
          });
          created++;
        }
        return res.status(201).json({ ok: true, created, reps: targets.length });
      }

      // Push warm, enriched leads from the GTM pool (leads collection) to a rep.
      //   { action:'assign_pool', rep_id, industry?, city?, limit? }
      if (body.action === 'assign_pool') {
        if (!body.rep_id) return res.status(400).json({ error: 'Pick a rep' });
        if (!(await db.getById('reps', body.rep_id))) return res.status(404).json({ error: 'Rep not found' });
        const limit = Math.min(parseInt(body.limit, 10) || 25, 100);
        const where = body.industry ? [['industry_bucket', '==', String(body.industry)]] : [];
        let pool = await db.list('leads', { where, order: 'created_at', ascending: true, limit: Math.max(limit * 4, 100) }).catch(() => []);
        const city = String(body.city || '').toLowerCase().trim();
        pool = (pool || []).filter((l) => l && !l.assigned_rep_id && (l.company_name || l.owner_name));
        if (city) pool = pool.filter((l) => String(l.location || '').toLowerCase().includes(city));
        pool = pool.slice(0, limit);
        if (!pool.length) return res.status(200).json({ ok: true, created: 0, note: 'No unassigned leads matched that filter. Import more on the Campaign tab.' });
        const now = new Date().toISOString();
        let created = 0;
        for (const l of pool) {
          const ctx = [l.revenue_est || l.revenue, l.industry].filter(Boolean).join(' · ');
          await db.insert('rep_leads', {
            rep_id: body.rep_id,
            business_name: l.company_name || null, contact_name: l.owner_name || null,
            phone: l.phone || null, email: l.email || null,
            address: l.location || null, industry: l.industry || l.industry_bucket || null,
            lat: null, lng: null, status: 'new', notes: null, next_action_at: null,
            priority: 'warm', context: ctx || null,
            company_domain: (l.website || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '') || null,
            lead_id: l.id || null, source: 'assigned',
            created_at: now, updated_at: now, visited_at: null,
          });
          await db.update('leads', l.id, { assigned_rep_id: body.rep_id, assigned_at: now }).catch(() => {});
          created++;
        }
        return res.status(201).json({ ok: true, created });
      }
      // Assign / seed a single lead to a rep's field queue.
      if (body.action === 'add_lead') {
        const { rep_id } = body;
        if (!rep_id) return res.status(400).json({ error: 'rep_id required' });
        if (!body.business_name && !body.contact_name) return res.status(400).json({ error: 'A business or contact name is required' });
        const rep = await db.getById('reps', rep_id);
        if (!rep) return res.status(404).json({ error: 'Rep not found' });
        const now = new Date().toISOString();
        const lead = await db.insert('rep_leads', {
          rep_id, business_name: body.business_name || null, contact_name: body.contact_name || null,
          phone: body.phone || null, email: body.email || null, address: body.address || null,
          industry: body.industry || null, lat: null, lng: null,
          status: 'new', notes: body.notes || null, next_action_at: null,
          source: 'assigned', created_at: now, updated_at: now, visited_at: null,
        });
        return res.status(201).json(lead);
      }
      const { name, email, password, city, phone } = body;
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

module.exports.config = { maxDuration: 60 };
