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

// Branded confirmation email to the booked prospect (best-effort).
function confirmEmail(to, firstName, dateStr) {
  if (!process.env.RESEND_API_KEY || !to) return Promise.resolve();
  const { Resend } = require('resend');
  return new Resend(process.env.RESEND_API_KEY).emails.send({
    from: 'TMI <support@tmitechai.com>', to,
    subject: `You're booked${dateStr && dateStr !== 'TBD' ? ` for ${dateStr} CT` : ''}`,
    html: `<!DOCTYPE html><html><body style="background:#fff;font-family:Arial,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:40px 24px;line-height:1.7;">
<p style="margin:0 0 16px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">You're confirmed for your discovery call${dateStr && dateStr !== 'TBD' ? ` on <strong>${dateStr} CT</strong>` : ''}. It's 30 minutes with me, walking through your operation and the first systems we would build.</p>
<p style="margin:0 0 8px;">To get the most out of it, come with:</p>
<p style="margin:0 0 16px;color:#444;">1. The one thing you most want off your plate.<br>2. A rough sense of your numbers (revenue, team size, close rate).<br>3. Your audit results, if you have run it.</p>
<p style="margin:0 0 16px;">If anything comes up before then, just reply to this email.</p>
<p style="margin:24px 0 0;">Mia<br><span style="color:#888;font-size:13px;">Founder, TMI</span></p>
</body></html>`,
  }).catch(e => console.error('confirm email:', e.message));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body || {};
  const attendees = body?.payload?.attendees || [];
  const email = attendees[0]?.email;
  const startTime = body?.payload?.startTime;

  if (!email) return res.status(400).json({ error: 'No email in payload' });

  // Paid Complete Audit customers take precedence. They may ALSO exist as a cold
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
              body: `Complete Audit call booked: ${appLead.name || ''} | ${email} | ${dateStr} CT`,
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
              title: 'Complete Audit strategy call',
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

        // Pre-call reminders for the audit customer (24h email + 2h SMS).
        try {
          if (startTime && process.env.QSTASH_TOKEN) {
            const qs = new QStashClient({ token: process.env.QSTASH_TOKEN });
            const nurl = `${SITE}/api/funnel-nurture`;
            const callMs = new Date(startTime).getTime(), nowMs = Date.now();
            const d24 = Math.floor((callMs - 86400000 - nowMs) / 1000);
            const d2 = Math.floor((callMs - 7200000 - nowMs) / 1000);
            if (d24 > 60) await qs.publishJSON({ url: nurl, delay: d24, body: { stage: 'precall_24h', applicationId: appLead.id } });
            if (d2 > 60) await qs.publishJSON({ url: nurl, delay: d2, body: { stage: 'precall_2h', applicationId: appLead.id } });
          }
        } catch (e) { console.error('schedule precall (app):', e.message); }

        // Confirmation to the prospect (email + SMS) - this path previously only
        // sent an internal alert.
        try {
          const fn = (appLead.name || 'there').split(/\s+/)[0];
          await confirmEmail(email, fn, dateStr);
          if (appLead.phone && process.env.TWILIO_ACCOUNT_SID) {
            twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN).messages.create({
              body: `You're confirmed for your TMI discovery call${dateStr && dateStr !== 'TBD' ? ` on ${dateStr} CT` : ''}, ${fn}. Come with the one thing you most want off your plate. Reply here if anything comes up. - Mia`,
              from: FROM_NUMBER, to: formatPhone(appLead.phone),
            }).catch(() => {});
          }
        } catch (e) { console.error('apps confirm prospect:', e.message); }

        return res.status(200).json({ ok: true, note: 'audit customer booked' });
      }
    } catch (e) { console.error('applications booking lookup:', e.message); }
  }

  // Otherwise, normal cold-lead booking flow.
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

  // Confirmation email to the lead.
  confirmEmail(lead.email, firstName, dateStr);

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
