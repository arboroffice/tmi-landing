// A rep's own leads, generated in the field. Scoped to the rep in the token.
//   GET                         -> [ leads ]  (their leads, newest activity first)
//   POST { business_name, ... } -> create a lead / log a walk-in
//   PATCH { id, ... }           -> update status/notes/location/next action
//   DELETE { id }               -> remove
const db = require('./_db');
const { cors } = require('./_auth');
const { requireRep } = require('./_rep-auth');

const STATUSES = ['new', 'attempted', 'contacted', 'booked', 'callback', 'not_interested', 'won', 'lost'];
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const FIELDS = ['business_name', 'contact_name', 'phone', 'email', 'address', 'industry', 'notes', 'next_action_at', 'source'];

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const r = await requireRep(req, res); if (!r) return;
  const repId = r.sub;

  try {
    if (req.method === 'GET') {
      const rows = await db.list('rep_leads', { where: [['rep_id', '==', repId]], order: 'updated_at', ascending: false, limit: 1000 });
      return res.json(rows || []);
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.business_name && !b.contact_name) return res.status(400).json({ error: 'A business or contact name is required' });
      const now = new Date().toISOString();
      const status = STATUSES.includes(b.status) ? b.status : 'new';
      const lead = await db.insert('rep_leads', {
        rep_id: repId,
        business_name: b.business_name || null, contact_name: b.contact_name || null,
        phone: b.phone || null, email: b.email || null, address: b.address || null,
        industry: b.industry || null, lat: num(b.lat), lng: num(b.lng),
        status, notes: b.notes || null, next_action_at: b.next_action_at || null,
        source: b.source || 'walk-in', created_at: now, updated_at: now,
        visited_at: status !== 'new' ? now : null,
      });
      return res.status(201).json(lead);
    }

    if (req.method === 'PATCH') {
      const b = req.body || {};
      if (!b.id) return res.status(400).json({ error: 'id required' });
      const lead = await db.getById('rep_leads', b.id);
      if (!lead || lead.rep_id !== repId) return res.status(404).json({ error: 'Not found' });
      const up = { updated_at: new Date().toISOString() };
      FIELDS.forEach((k) => { if (b[k] !== undefined) up[k] = b[k]; });
      if (b.lat !== undefined) up.lat = num(b.lat);
      if (b.lng !== undefined) up.lng = num(b.lng);
      if (b.status !== undefined && STATUSES.includes(b.status)) {
        up.status = b.status;
        if (b.status !== 'new' && !lead.visited_at) up.visited_at = up.updated_at;
      }
      const out = await db.update('rep_leads', b.id, up);
      return res.json(out);
    }

    if (req.method === 'DELETE') {
      const id = (req.body && req.body.id) || req.query.id;
      if (!id) return res.status(400).json({ error: 'id required' });
      const lead = await db.getById('rep_leads', id);
      if (!lead || lead.rep_id !== repId) return res.status(404).json({ error: 'Not found' });
      await db.remove('rep_leads', id);
      return res.json({ ok: true });
    }

    return res.status(405).end();
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
