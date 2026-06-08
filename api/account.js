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
// source is best-effort: a missing table or column degrades to an empty list
// rather than failing the whole request.

const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

// Build a Supabase .or() filter from [column, value] pairs, skipping empties.
function orFilter(pairs) {
  const clauses = pairs
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([col, v]) => `${col}.eq.${v}`);
  return clauses.length ? clauses.join(',') : null;
}

async function safe(promise, label) {
  try {
    const { data, error } = await promise;
    if (error) { console.error(`[account] ${label}:`, error.message); return []; }
    return data || [];
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

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  const { leadId, contactId, email } = req.query;
  if (!leadId && !contactId && !email) {
    return res.status(400).json({ error: 'Provide leadId, contactId, or email' });
  }

  // 1. Resolve the anchor lead (with its contact) from whatever key we got.
  let lead = null;
  if (leadId) {
    lead = (await db.from('leads').select('*, contacts(*)').eq('id', leadId).maybeSingle()).data;
  } else if (email) {
    lead = (await db.from('leads').select('*, contacts(*)')
      .eq('email', email.toLowerCase().trim())
      .order('created_at', { ascending: false }).limit(1).maybeSingle()).data;
  } else if (contactId) {
    lead = (await db.from('leads').select('*, contacts(*)')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()).data;
  }

  // Resolve a contact even if there's no lead.
  let contact = lead?.contacts || null;
  if (!contact) {
    if (contactId) contact = (await db.from('contacts').select('*').eq('id', contactId).maybeSingle()).data;
    else if (email) contact = (await db.from('contacts').select('*').eq('email', email.toLowerCase().trim()).maybeSingle()).data;
  }

  // The set of keys that identify this person across tables.
  const lid = lead?.id || null;
  const cid = lead?.contact_id || contact?.id || contactId || null;
  const em  = (lead?.email || contact?.email || email || '').toLowerCase().trim() || null;
  const ph  = lead?.phone || contact?.phone || null;

  // 2. Gather everything, in parallel, each guarded.
  const auditOr = orFilter([['lead_id', lid], ['email', em]]);
  const fuOr    = orFilter([['lead_id', lid], ['contact_id', cid]]);
  const actOr   = orFilter([['lead_id', lid], ['contact_id', cid]]);
  const emOr    = orFilter([['contact_id', cid], ['email', em]]);
  const smsOr   = orFilter([['contact_id', cid], ['phone', ph]]);

  const [audits, followups, activities, emails, sms] = await Promise.all([
    auditOr ? safe(db.from('audit_submissions').select('*').or(auditOr).order('created_at', { ascending: false }), 'audits') : [],
    fuOr    ? safe(db.from('followups').select('*').or(fuOr).order('due_at', { ascending: false }), 'followups') : [],
    actOr   ? safe(db.from('activities').select('*').or(actOr).order('created_at', { ascending: false }), 'activities') : [],
    emOr    ? safe(db.from('email_sends').select('*').or(emOr).order('created_at', { ascending: false }), 'emails') : [],
    smsOr   ? safe(db.from('sms_log').select('*').or(smsOr).order('created_at', { ascending: false }), 'sms') : [],
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
  for (const a of activities) timeline.push({ kind: 'activity', at: a.created_at, title: a.title || a.type, detail: a.body || '', direction: null });
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
