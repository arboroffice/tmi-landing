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
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5ef;-webkit-font-smoothing:antialiased;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5ef;"><tr><td align="center" style="padding:28px 14px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid #e7e8e1;border-radius:16px;overflow:hidden;"><tr><td style="background:#0a0b14;padding:18px 30px;"><span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">TMI</span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#E4FF97;margin-left:5px;"></span></td></tr><tr><td style="padding:34px 30px 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.7;">
<p style="margin:0 0 16px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">You're confirmed for your discovery call${dateStr && dateStr !== 'TBD' ? ` on <strong>${dateStr} CT</strong>` : ''}. It's 30 minutes with me, walking through your operation and the first systems we would build.</p>
<p style="margin:0 0 8px;">To get the most out of it, come with:</p>
<p style="margin:0 0 16px;color:#444;">1. The one thing you most want off your plate.<br>2. A rough sense of your numbers (revenue, team size, where jobs or leads slip).<br>3. The tools you are paying for right now.</p>
<p style="margin:0 0 16px;">Question before then, or want to talk sooner? Just reply to this email and a real person will get back to you.</p>
<p style="margin:24px 0 0;">Mia<br><span style="color:#888;font-size:13px;">Founder, TMI</span></p>
</td></tr><tr><td style="padding:6px 30px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><div style="border-top:1px solid #eceee4;margin-top:8px;padding-top:16px;font-size:12px;line-height:1.6;color:#9a9ba5;">TMI Technology &middot; chaos control for growing companies<br><a href="https://www.tmitechai.com" style="color:#6f8f2a;text-decoration:none;">tmitechai.com</a></div></td></tr></table></td></tr></table></body></html>`,
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
            const nurl = `${SITE}/api/funnel-nurture?secret=${process.env.GTM_RUN_SECRET || ''}`;
            const callMs = new Date(startTime).getTime(), nowMs = Date.now();
            const d24 = Math.floor((callMs - 86400000 - nowMs) / 1000);
            const d2 = Math.floor((callMs - 7200000 - nowMs) / 1000);
            const d1h = Math.floor((callMs - 3600000 - nowMs) / 1000);
            const d10 = Math.floor((callMs - 600000 - nowMs) / 1000);
            if (d24 > 60) await qs.publishJSON({ url: nurl, delay: d24, body: { stage: 'precall_24h', applicationId: appLead.id } });
            if (d2 > 60) await qs.publishJSON({ url: nurl, delay: d2, body: { stage: 'precall_2h', applicationId: appLead.id } });
            if (d1h > 60) await qs.publishJSON({ url: nurl, delay: d1h, body: { stage: 'precall_1h', applicationId: appLead.id } });
            if (d10 > 30) await qs.publishJSON({ url: nurl, delay: d10, body: { stage: 'precall_10m', applicationId: appLead.id } });
          }
        } catch (e) { console.error('schedule precall (app):', e.message); }

        // Confirmation to the prospect (email + SMS) - this path previously only
        // sent an internal alert.
        try {
          const fn = (appLead.name || 'there').split(/\s+/)[0];
          await confirmEmail(email, fn, dateStr);
          if (appLead.phone && process.env.TWILIO_ACCOUNT_SID) {
            twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN).messages.create({
              body: `You're confirmed for your TMI discovery call${dateStr && dateStr !== 'TBD' ? ` on ${dateStr} CT` : ''}, ${fn}. Come with the one thing you most want off your plate. Questions before then? Just reply here. - Mia`,
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

  // Confirmation SMS to lead
  if (lead.phone) {
    sms.messages.create({
      body: `You're confirmed, ${firstName}. Come with the one thing you most want off your plate and a rough sense of your numbers. Questions before then? Just reply here.`,
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
    const delay1h  = Math.floor((callMs - 3600000  - nowMs) / 1000);
    const delay10m = Math.floor((callMs - 600000   - nowMs) / 1000);

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

    // 1h before: email + SMS so it doesn't get missed
    if (delay1h > 60) {
      qstash.publishJSON({
        url: followupUrl,
        delay: delay1h,
        body: { leadId: lead.id, step: 'pre_call_1h' },
      }).catch(e => console.error('QStash pre_call_1h error:', e));
    }

    // 10m before: final email + SMS reminder to hop on
    if (delay10m > 30) {
      qstash.publishJSON({
        url: followupUrl,
        delay: delay10m,
        body: { leadId: lead.id, step: 'pre_call_10m' },
      }).catch(e => console.error('QStash pre_call_10m error:', e));
    }
  }

  res.status(200).json({ ok: true });
};
