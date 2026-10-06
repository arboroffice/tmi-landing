// Calls a rep books on Mia's Cal.com for one of their leads. The rep app opens
// the Cal link with metadata[lead_id] and metadata[rep_id]; the Cal webhook
// (booking-confirmed.js) lands here and keeps rep_bookings in step with Cal:
// created, rescheduled, cancelled. Bookings without metadata still match a rep
// lead by the attendee email.
const db = require('./_db');

const EARLY = ['new', 'attempted', 'contacted', 'callback'];
const ct = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

async function findLead(meta, email) {
  if (meta.lead_id) {
    const l = await db.getById('rep_leads', String(meta.lead_id)).catch(() => null);
    if (l) return l;
  }
  if (!email) return null;
  return db.findOne('rep_leads', 'email', email).catch(() => null);
}

async function record(body) {
  const p = (body && body.payload) || {};
  const trigger = body && body.triggerEvent;
  const meta = p.metadata || {};
  const a = (p.attendees || [])[0] || {};
  const email = a.email ? String(a.email).toLowerCase().trim() : null;
  const now = new Date().toISOString();

  if (trigger === 'BOOKING_CANCELLED') {
    const b = p.uid && await db.findOne('rep_bookings', 'uid', p.uid).catch(() => null);
    if (!b) return null;
    await db.update('rep_bookings', b.id, { status: 'cancelled', updated_at: now });
    await db.insert('rep_interactions', { rep_id: b.rep_id, lead_id: b.lead_id, channel: 'note', source: 'auto', summary: `The call with Mia on ${ct(b.start)} was cancelled. Reach out and rebook.`, created_at: now }).catch(() => {});
    return b.id;
  }

  if (trigger === 'BOOKING_RESCHEDULED') {
    const oldUid = p.rescheduleUid || p.fromReschedule || (p.rescheduledBy && p.originalRescheduledBooking && p.originalRescheduledBooking.uid);
    const b = (oldUid && await db.findOne('rep_bookings', 'uid', oldUid).catch(() => null))
      || (p.uid && await db.findOne('rep_bookings', 'uid', p.uid).catch(() => null));
    if (b) {
      await db.update('rep_bookings', b.id, { uid: p.uid || b.uid, start: p.startTime || b.start, end: p.endTime || (p.startTime && b.end ? new Date(Date.parse(p.startTime) + (Date.parse(b.end) - Date.parse(b.start))).toISOString() : b.end), status: 'booked', updated_at: now });
      await db.insert('rep_interactions', { rep_id: b.rep_id, lead_id: b.lead_id, channel: 'note', source: 'auto', summary: `The call with Mia moved to ${ct(p.startTime || b.start)}.`, created_at: now }).catch(() => {});
      return b.id;
    }
    // Not one we knew about: fall through and record it as new.
  }

  if (!p.startTime) return null;
  const lead = await findLead(meta, email);
  if (!lead || !lead.rep_id) return null;
  if (p.uid) {
    const dup = await db.findOne('rep_bookings', 'uid', p.uid).catch(() => null);
    if (dup) return dup.id;
  }
  const row = await db.insert('rep_bookings', {
    rep_id: lead.rep_id, lead_id: lead.id, uid: p.uid || null,
    start: p.startTime, end: p.endTime || null, title: p.title || 'Fit Call with Mia',
    business_name: lead.business_name || null, attendee_name: a.name || null, attendee_email: email,
    status: 'booked', source: meta.lead_id ? 'rep' : 'email_match', created_at: now, updated_at: now,
  });
  const up = { booked_call_at: p.startTime, updated_at: now };
  if (EARLY.includes(lead.status)) up.status = 'booked';
  if (!lead.email && email) up.email = email;
  await db.update('rep_leads', lead.id, up).catch(() => {});
  await db.insert('rep_interactions', { rep_id: lead.rep_id, lead_id: lead.id, channel: 'note', source: 'auto', summary: `Fit Call with Mia booked for ${ct(p.startTime)}. TMI sends the reminders.`, created_at: now }).catch(() => {});
  return row && row.id;
}

module.exports = { record };
