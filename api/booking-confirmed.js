const db = require('./_db');
const { Client: QStashClient } = require('@upstash/qstash');
const twilio = require('twilio');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const SITE = 'https://www.tmi-technology.com';

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

  // Find the lead by email, then flip it to booked.
  const existingLead = await db.findOne('leads', 'email', email.toLowerCase());

  if (!existingLead) {
    console.log('No lead found for:', email);
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

  // Has this lead completed the Intelligence Audit? If not (e.g. they used "skip
  // the audit and book a call"), the call is far more effective with their actual
  // numbers, so the confirmation text doubles as the first push to run it. The
  // pre-call sequence (api/followup) keeps nudging at 24h and 2h; this covers the
  // gap for same-day / next-day bookings where those reminders can't fire.
  let auditDone = false;
  try {
    const a = await db.findOne('audit_submissions', 'email', (lead.email || '').toLowerCase());
    auditDone = !!a;
  } catch { /* best effort — default to the plain confirmation */ }

  let companyNote = '';
  try { companyNote = (JSON.parse(lead.notes || '{}').company) || ''; } catch { companyNote = ''; }
  const resumeParams = new URLSearchParams({ n: lead.name || '', e: lead.email || '', p: lead.phone || '', c: companyNote });
  const auditLink = `${SITE}/audit?resume=1&${resumeParams.toString()}`;

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

  // Confirmation SMS to lead
  if (lead.phone) {
    sms.messages.create({
      body: auditDone
        ? `You're confirmed, ${firstName}. See you then. If anything comes up before the call, reply here.`
        : `You're confirmed, ${firstName}. One quick favor before the call: run your 5-min Intelligence Audit so we walk in with your real numbers and go deep from minute one - ${auditLink}`,
      from: FROM_NUMBER,
      to: formatPhone(lead.phone),
    }).catch(e => console.error('Confirmation SMS error:', e));
  }

  // Internal alert
  sms.messages.create({
    body: `Call booked: ${lead.name} | ${lead.email} | ${dateStr} CT`,
    from: FROM_NUMBER,
    to: ALERT_NUMBER,
  }).catch(e => console.error('Internal alert error:', e));

  // Schedule pre-call reminder sequence
  if (startTime) {
    const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN });
    const followupUrl = `${SITE}/api/followup`;
    const callMs = new Date(startTime).getTime();
    const nowMs = Date.now();

    const delay24h = Math.floor((callMs - 86400000 - nowMs) / 1000);
    const delay2h  = Math.floor((callMs - 7200000  - nowMs) / 1000);

    // 24h before: email nudge to submit audit
    if (delay24h > 60) {
      qstash.publishJSON({
        url: followupUrl,
        delay: delay24h,
        body: { leadId: lead.id, step: 'pre_call_24h' },
      }).catch(e => console.error('QStash pre_call_24h error:', e));
    }

    // 2h before: SMS reminder
    if (delay2h > 60) {
      qstash.publishJSON({
        url: followupUrl,
        delay: delay2h,
        body: { leadId: lead.id, step: 'pre_call_2h' },
      }).catch(e => console.error('QStash pre_call_2h error:', e));
    }
  }

  res.status(200).json({ ok: true });
};
