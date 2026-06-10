// Account 360 — everything we know about one person in a single payload:
// their audit answers + results, booking, follow-ups, and all communications
// (emails + SMS) and CRM activity. Auth required (admin Bearer JWT).
//
// GET /api/account?leadId=<uuid>
// GET /api/account?email=<email>
// GET /api/account?contactId=<uuid>
//
// Records are linked by lead_id / contact_id / email / phone, so we resolve the
// person from whichever key is provided and gather across all of them. Every
// source is best-effort: a missing collection or column degrades to an empty
// list rather than failing the whole request.

const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

// Firestore can't OR across different fields in one query, so we run one query
// per [field, value] clause and merge the results, de-duped by id. Each query
// orders by `orderField` (desc) on the server; the merged set is re-sorted.
// Returns [] on any failure (best-effort, mirrors the old safe() wrapper).
async function gather(coll, pairs, orderField, label) {
  try {
    const clauses = pairs.filter(([, v]) => v !== undefined && v !== null && v !== '');
    if (!clauses.length) return [];
    const results = await Promise.all(
      clauses.map(([field, value]) =>
        db.list(coll, { where: [[field, '==', value]], order: orderField, ascending: false })
          .catch(() => [])
      )
    );
    const byId = new Map();
    for (const rows of results) {
      for (const r of rows) if (r && !byId.has(r.id)) byId.set(r.id, r);
    }
    const merged = [...byId.values()];
    merged.sort((a, b) => new Date(b[orderField] || 0) - new Date(a[orderField] || 0));
    return merged;
  } catch (e) {
    console.error(`[account] ${label} threw:`, e.message);
    return [];
  }
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;

  const { leadId, contactId, email } = req.query;
  if (!leadId && !contactId && !email) {
    return res.status(400).json({ error: 'Provide leadId, contactId, or email' });
  }

  // 1. Resolve the anchor lead (with its contact) from whatever key we got.
  let lead = null;
  if (leadId) {
    lead = await db.getById('leads', leadId);
  } else if (email) {
    const rows = await db.list('leads', { where: [['email', '==', email.toLowerCase().trim()]], order: 'created_at', ascending: false, limit: 1 });
    lead = rows[0] || null;
  } else if (contactId) {
    const rows = await db.list('leads', { where: [['contact_id', '==', contactId]], order: 'created_at', ascending: false, limit: 1 });
    lead = rows[0] || null;
  }

  // Embedded join contacts(*): attach the lead's contact under `contacts`.
  if (lead) await db.hydrateOne(lead, 'contact_id', 'contacts', 'contacts');

  // Resolve a contact even if there's no lead.
  let contact = lead?.contacts || null;
  if (!contact) {
    if (contactId) contact = await db.getById('contacts', contactId);
    else if (email) contact = await db.findOne('contacts', 'email', email.toLowerCase().trim());
  }

  // The set of keys that identify this person across collections.
  const lid = lead?.id || null;
  const cid = lead?.contact_id || contact?.id || contactId || null;
  const em  = (lead?.email || contact?.email || email || '').toLowerCase().trim() || null;
  const ph  = lead?.phone || contact?.phone || null;

  // 2. Gather everything, in parallel, each guarded.
  const [audits, followups, activities, emails, sms] = await Promise.all([
    gather('audit_submissions', [['lead_id', lid], ['email', em]], 'created_at', 'audits'),
    gather('followups', [['lead_id', lid], ['contact_id', cid]], 'due_at', 'followups'),
    gather('activities', [['lead_id', lid], ['contact_id', cid]], 'created_at', 'activities'),
    gather('email_sends', [['contact_id', cid], ['email', em]], 'created_at', 'emails'),
    gather('sms_log', [['contact_id', cid], ['phone', ph]], 'created_at', 'sms'),
  ]);

  // 3. Booking summary (lives on the lead).
  const booking = lead ? {
    status: lead.status || null,
    booked_at: lead.booked_at || null,
    booked: lead.status === 'booked' || !!lead.booked_at,
  } : null;

  // 4. A single merged timeline of communications + activity, newest first.
  const timeline = [];
  for (const e of emails) timeline.push({ kind: 'email', at: e.created_at, title: e.subject || 'Email sent', detail: e.status || 'sent', direction: 'outbound' });
  for (const s of sms)    timeline.push({ kind: 'sms', at: s.created_at, title: s.body || 'SMS', detail: s.status || '', direction: s.direction || 'outbound' });
  for (const a of activities) {
    const kind = a.type === 'email' ? 'email' : a.type === 'sms' ? 'sms' : 'activity';
    const inbound = /^Reply:/i.test(a.title || '') || /^From\s/i.test(a.body || '');
    timeline.push({
      kind,
      at: a.created_at,
      title: a.title || a.type,
      detail: a.body ? String(a.body).slice(0, 160) : '',
      direction: kind === 'email' ? (inbound ? 'inbound' : 'outbound') : null,
    });
  }
  for (const f of followups) timeline.push({ kind: 'followup', at: f.due_at || f.created_at, title: f.title || f.type, detail: f.completed ? 'completed' : 'scheduled', direction: null });
  timeline.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

  return res.status(200).json({
    lead: lead || null,
    contact: contact || null,
    booking,
    audits,
    followups,
    activities,
    emails,
    sms,
    timeline,
    counts: {
      audits: audits.length,
      followups: followups.length,
      emails: emails.length,
      sms: sms.length,
      activities: activities.length,
    },
  });
};
