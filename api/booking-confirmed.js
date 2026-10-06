const db = require('./_db');
const { Client: QStashClient } = require('@upstash/qstash');
const twilio = require('twilio');
const precall = require('./_precall');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const SITE = 'https://admin.tmitechai.com';

function formatPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  return digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body || {};
  const attendees = body?.payload?.attendees || [];
  const email = attendees[0]?.email;
  const startTime = body?.payload?.startTime;

  if (!email) return res.status(400).json({ error: 'No email in payload' });

  // Pre-call sequence (emails + texts from booking until the call). Runs for
  // every booking on the Cal link, known lead or not. Cancels stop it;
  // reschedules move it to the new time.
  const info = precall.fromCal(body);
  if (info.trigger === 'BOOKING_CANCELLED') {
    await precall.cancel(info.email);
    return res.status(200).json({ ok: true, note: 'cancelled' });
  }
  try {
    if (process.env.QSTASH_TOKEN) await precall.schedule(info, { qs: new QStashClient({ token: process.env.QSTASH_TOKEN }) });
  } catch (e) { console.error('precall schedule:', e.message); }
  const callStr = startTime
    ? new Date(startTime).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'TBD';
  if (info.trigger === 'BOOKING_RESCHEDULED') {
    try {
      if (process.env.TWILIO_ACCOUNT_SID) {
        await twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN).messages.create({
          body: `Call rescheduled: ${info.name || ''} | ${email} | now ${callStr} CT`, from: FROM_NUMBER, to: ALERT_NUMBER,
        });
      }
    } catch (e) { /* best effort */ }
    return res.status(200).json({ ok: true, note: 'rescheduled' });
  }

  // Paid Intelligent Company Audit customers take precedence. They may ALSO exist as a cold
  // lead (e.g. an outbound prospect who later paid), so check applications first
  // and handle the audit booking before the normal lead flow.
  {
    try {
      const appLead = await db.findOne('applications', 'email', email.toLowerCase());
      if (appLead) {
        await db.update('applications', appLead.id, { status: 'booked', booked_at: new Date().toISOString() });
        // The paid audit (with the deliverable) lives in audit_submissions - link it
        // so the prep brief and the PRD can be grounded in it.
        const sub = await db.findOne('audit_submissions', 'email', email.toLowerCase()).catch(() => null);
        const dateStr = startTime
          ? new Date(startTime).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
          : 'TBD';
        try {
          if (process.env.TWILIO_ACCOUNT_SID) {
            twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN).messages.create({
              body: `Intelligent Company Audit call booked: ${appLead.name || ''} | ${email} | ${dateStr} CT`,
              from: FROM_NUMBER, to: ALERT_NUMBER,
            }).catch(() => {});
          }
        } catch (e) { /* best effort */ }

        // Pre-create the strategy call as a scheduled meeting so it is listed in
        // the admin recorder before the call, ready to record into.
        let meetingId = null;
        if (sub) {
          try {
            const mtg = await db.insert('sales_meetings', {
              audit_id: sub.id,
              account_type: 'audit',
              application_id: appLead.id,
              company: appLead.company || appLead.name || null,
              account_label: [appLead.name, appLead.company].filter(Boolean).join(' · ') || appLead.company || email,
              contact_email: email,
              title: 'Intelligent Company Audit strategy call',
              sales_stage: 'Discovery',
              transcript: '',
              status: 'scheduled',
              met_on: startTime ? new Date(startTime).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
            });
            meetingId = mtg && mtg.id;
          } catch (e) { console.error('pre-create meeting:', e.message); }
        }

        try {
          new QStashClient({ token: process.env.QSTASH_TOKEN }).publishJSON({
            url: `${SITE}/api/audit-prep`,
            body: {
              companyName: appLead.company || appLead.name,
              contactName: appLead.name,
              contactEmail: appLead.email,
              website: appLead.website || null,
              leadId: appLead.id,
              applicationId: appLead.id,
              submissionId: sub ? sub.id : null,
              meetingId,
            },
          }).catch(e => console.error('QStash audit-prep (app) error:', e));
        } catch (e) { console.error('audit-prep enqueue (app):', e.message); }

        // Confirmation + reminders now come from the pre-call sequence above.

        return res.status(200).json({ ok: true, note: 'audit customer booked' });
      }
    } catch (e) { console.error('applications booking lookup:', e.message); }
  }

  // Otherwise, normal cold-lead booking flow.
  const existingLead = await db.findOne('leads', 'email', email.toLowerCase());
  if (!existingLead) {
    // Someone booked straight from the Cal link without being in our lead list.
    // They still get the pre-call sequence; make sure the team hears about it.
    try {
      if (process.env.TWILIO_ACCOUNT_SID) {
        await twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN).messages.create({
          body: `Call booked (new contact): ${info.name || ''} | ${email} | ${callStr} CT`, from: FROM_NUMBER, to: ALERT_NUMBER,
        });
      }
    } catch (e) { /* best effort */ }
    return res.status(200).json({ ok: true, note: 'No matching lead' });
  }

  const lead = await db.update('leads', existingLead.id, {
    status: 'booked',
    booked_at: new Date().toISOString(),
  });

  const firstName = lead.name.split(' ')[0];

  // Meta Conversions API — Schedule conversion (a call was booked). This is the
  // high-intent conversion after the audit. The booking happens on the website
  // via the Cal embed, but this confirmation arrives as a Cal webhook (so the
  // request IP/UA are Cal's, not the user's) - match on hashed email/phone/name
  // instead, and dedup with the browser pixel via the Cal booking uid.
  try {
    const { sendLeadEvent } = require('./_meta-capi');
    const uid = body?.payload?.uid || body?.payload?.bookingId || '';
    const nameParts = (lead.name || '').trim().split(/\s+/);
    sendLeadEvent({
      eventName: 'Schedule',
      actionSource: 'website',
      eventSourceUrl: `${SITE}/booking`,
      eventId: uid ? `booking_${uid}` : undefined,
      email,
      phone: lead.phone,
      firstName: nameParts[0] || undefined,
      lastName: nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined,
      leadId: lead.id,
    }).catch(() => {});
  } catch (e) { console.error('Meta CAPI Schedule:', e.message); }

  const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  // Log the confirmation SMS to the lead (the phone filter excludes the team alert).
  try { require('./_comms').instrument(db, { sms, leadId: lead.id, phone: lead.phone }); } catch (e) { console.error('comms instrument:', e.message); }
  const dateStr = startTime
    ? new Date(startTime).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'TBD';

  // Company note (used to ground the team's pre-call brief). The intelligent
  // audit now happens live on the call, so there is no self-serve audit to push.
  let companyNote = '';
  try { companyNote = (JSON.parse(lead.notes || '{}').company) || ''; } catch { companyNote = ''; }

  // Auto-generate the pre-call intelligence brief for the team (robust via QStash).
  try {
    const qs = new QStashClient({ token: process.env.QSTASH_TOKEN });
    qs.publishJSON({
      url: `${SITE}/api/audit-prep`,
      body: {
        companyName: companyNote || lead.name,
        contactName: lead.name,
        contactEmail: lead.email,
        website: lead.website || null,
        leadId: lead.id,
      },
    }).catch(e => console.error('QStash audit-prep error:', e));
  } catch (e) { console.error('audit-prep enqueue:', e.message); }

  // Confirmation + reminders now come from the pre-call sequence above.

  // Internal alert
  sms.messages.create({
    body: `Call booked: ${lead.name} | ${lead.email} | ${dateStr} CT`,
    from: FROM_NUMBER,
    to: ALERT_NUMBER,
  }).catch(e => console.error('Internal alert error:', e));

  res.status(200).json({ ok: true });
};
