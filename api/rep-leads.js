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

// Bridge a rep-booked/won lead into the sales pipeline (applications), so admin,
// payments, commissions, and OS provisioning all reconcile against one record.
// Created once per lead (linked by application_id) and kept in sync after that.
// Never downgrades a further-along status (a real paid application stays paid).
const APP_RANK = { captured: 1, booked: 2, won: 3, paid: 4 };
async function bridgeToPipeline(lead, up, repId, rep) {
  const email = String(lead.email || '').toLowerCase().trim();
  const want = up.status === 'won' ? 'won' : 'booked';
  const now = new Date().toISOString();
  const patch = {
    name: lead.contact_name || lead.business_name || 'Field lead',
    phone: lead.phone || null, company: lead.business_name || null,
    website: lead.company_domain || null, industry: lead.industry || null,
    source: 'rep_field', rep_id: repId, rep_name: (rep && rep.name) || null, rep_lead_id: lead.id,
    deal_value: up.deal_value != null ? up.deal_value : (lead.deal_value != null ? lead.deal_value : null),
    updated_at: now,
  };
  let existing = null;
  if (lead.application_id) existing = await db.getById('applications', lead.application_id).catch(() => null);
  if (!existing && email) existing = await db.findOne('applications', 'email', email).catch(() => null);
  if (existing) {
    if ((APP_RANK[want] || 0) > (APP_RANK[existing.status] || 0)) patch.status = want;
    await db.update('applications', existing.id, patch).catch(() => null);
    return existing.id;
  }
  const app = await db.insert('applications', Object.assign({ email: email || null, status: want, captured_at: now, created_at: now }, patch));
  return app && app.id;
}

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
      if (b.deal_value !== undefined) up.deal_value = num(b.deal_value);
      if (b.status !== undefined && STATUSES.includes(b.status)) {
        up.status = b.status;
        if (b.status !== 'new' && !lead.visited_at) up.visited_at = up.updated_at;
      }
      // A booked or won lead flows into the sales pipeline. Best-effort: never
      // let a bridge failure block the rep's own status update.
      if (up.status === 'booked' || up.status === 'won') {
        try { const appId = await bridgeToPipeline(lead, up, repId, r); if (appId) up.application_id = appId; }
        catch (e) { console.error('rep-leads bridge:', e.message); }
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
