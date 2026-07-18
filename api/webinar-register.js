// Webinar registration for the self-hosted weekly evergreen masterclass.
// Creates a tagged contact + a registration record, emails a confirmation with
// calendar links and the join link, and schedules the reminder/follow-up chain
// via QStash (24h before, 1h before, live-now, and a 2h-after follow-up that
// branches on whether they actually attended). Every external step is
// best-effort so a single failure never blocks the registration.
//
// POST { name, email, company?, session_time? } -> { ok, token, session_time }

const crypto = require('crypto');
const db = require('./_db');
const W = require('./_webinar');

const TEAM = ['support@tmitechai.com', 'mia@tmitechai.com'];

function emailWrap(body, unsubUrl) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5ef;-webkit-font-smoothing:antialiased;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5ef;"><tr><td align="center" style="padding:28px 14px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid #e7e8e1;border-radius:16px;overflow:hidden;"><tr><td style="background:#0a0b14;padding:18px 30px;"><span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">TMI</span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#E4FF97;margin-left:5px;"></span></td></tr><tr><td style="padding:34px 30px 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.7;">
${body}
${unsubUrl ? `<p style="margin:40px 0 0;font-size:11px;color:#bbb;border-top:1px solid #eee;padding-top:16px;"><a href="${unsubUrl}" style="color:#bbb;">Unsubscribe</a></p>` : ''}
</td></tr><tr><td style="padding:6px 30px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><div style="border-top:1px solid #eceee4;margin-top:8px;padding-top:16px;font-size:12px;line-height:1.6;color:#9a9ba5;">TMI Technology &middot; chaos control for growing companies<br><a href="https://www.tmitechai.com" style="color:#6f8f2a;text-decoration:none;">tmitechai.com</a></div></td></tr></table></td></tr></table></body></html>`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const b = req.body || {};
  const name = (b.name || '').trim();
  const email = (b.email || '').trim().toLowerCase();
  if (!name || !email || email.indexOf('@') < 0) {
    return res.status(400).json({ error: 'Name and a valid email are required.' });
  }
  const first = name.split(/\s+/)[0];
  const last = name.includes(' ') ? name.split(/\s+/).slice(1).join(' ') : null;
  const phone = (b.phone || '').trim();

  // Trust a client-sent session, but re-derive if missing/past.
  let session = b.session_time ? new Date(b.session_time) : null;
  if (!session || isNaN(session.getTime()) || session.getTime() < Date.now()) session = W.nextSession();
  const sessionIso = session.toISOString();
  const when = W.fmtChicago(session);
  const token = crypto.randomBytes(12).toString('hex');

  const joinUrl = `${W.SITE}/watch?s=${encodeURIComponent(sessionIso)}&t=${token}`;
  const replayUrl = `${W.SITE}/watch?mode=ondemand`;
  const icsUrl = `${W.SITE}/api/webinar-ics?s=${encodeURIComponent(sessionIso)}`;
  const gcalStart = W.icsStamp(session);
  const gcalEnd = W.icsStamp(new Date(session.getTime() + W.DURATION_SEC * 1000));
  const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(W.EVENT_NAME)}&dates=${gcalStart}/${gcalEnd}&details=${encodeURIComponent('Join here: ' + joinUrl)}&location=${encodeURIComponent(joinUrl)}`;

  // 1) Tagged contact (best-effort)
  let contact = null;
  try {
    const existing = await db.findOne('contacts', 'email', email);
    const tags = Array.isArray(existing && existing.tags) ? existing.tags.slice() : [];
    for (const t of ['webinar', 'webinar-masterclass']) if (!tags.includes(t)) tags.push(t);
    contact = await db.upsertByField('contacts', 'email', email, {
      first_name: first, last_name: last, email,
      phone: phone || (existing && existing.phone) || null,
      company: b.company || (existing && existing.company) || null,
      tags, notes: `Registered: ${W.EVENT_NAME}\nSession: ${when}`,
    });
  } catch (e) { console.error('webinar contact:', e.message); }

  // 2) Registration record (best-effort)
  let reg = null;
  try {
    reg = await db.insert('webinar_registrations', {
      name, email, company: b.company || null, phone: phone || null,
      session_time: sessionIso, when, token,
      status: 'registered', attended: false,
      contact_id: contact && contact.id ? contact.id : null,
      created_at: new Date().toISOString(),
    });
  } catch (e) { console.error('webinar reg:', e.message); }

  // 3) Confirmation email + team alert (best-effort)
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'TMI <support@tmitechai.com>',
        to: email,
        subject: `You're registered — ${W.EVENT_NAME} (${when})`,
        html: emailWrap(
          `<p style="margin:0 0 18px;">Hey ${first},</p>
<p style="margin:0 0 16px;">You're in. Here are your details for <b>${W.EVENT_NAME}</b>:</p>
<p style="margin:0 0 8px;font-size:18px;"><b>${when}</b></p>
<p style="margin:0 0 22px;">It's a 40-minute working session on the system that removes the owner as the bottleneck, so your business runs on systems instead of on you answering every question.</p>
<p style="margin:0 0 22px;"><a href="${joinUrl}" style="display:inline-block;background:#0a0b14;color:#E4FF97;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;">Save your join link &rarr;</a></p>
<p style="margin:0 0 8px;font-size:14px;color:#555;">Add it to your calendar so you don't miss it:</p>
<p style="margin:0 0 22px;font-size:14px;"><a href="${gcalUrl}" style="color:#5a9e00;">Google Calendar</a>  &nbsp;·&nbsp;  <a href="${icsUrl}" style="color:#5a9e00;">Apple / Outlook (.ics)</a></p>
<p style="margin:0 0 16px;">A quick primer before we start: most operations we look at are leaking the most time and money through one of three systems. In the session we'll show you which one is costing you, and what the fix looks like.</p>
<p style="margin:0;">See you in the room,<br>The TMI team</p>`,
          `${W.SITE}/api/unsubscribe?email=${encodeURIComponent(email)}`
        ),
      });
      await resend.emails.send({
        from: 'TMI <support@tmitechai.com>',
        to: TEAM,
        subject: `Webinar registration — ${name}${b.company ? ' (' + b.company + ')' : ''}`,
        text: `${name} <${email}>\nCompany: ${b.company || '—'}\nSession: ${when}\nJoin: ${joinUrl}`,
      });
    } catch (e) { console.error('webinar email:', e.message); }
  }

  // 3b) Confirmation SMS (best-effort; only if they gave a number)
  if (phone && reg && reg.id) {
    try { const { sendStepSms } = require('./_webinar-sms'); await sendStepSms(db, reg, 'sms_confirm'); }
    catch (e) { console.error('webinar sms confirm:', e.message); }
  }

  // 3c) Owner alert SMS on every registration (best-effort)
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const sms = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await sms.messages.create({
        body: `New webinar signup: ${name} | ${email}${b.company ? ' | ' + b.company : ''}${phone ? ' | ' + phone : ''} | ${when}`,
        from: '+18557171044',
        to: '+13373809059',
      });
    } catch (e) { console.error('webinar owner sms alert:', e.message); }
  }

  // 4) Schedule the reminder / follow-up chain via QStash (best-effort)
  if (process.env.QSTASH_TOKEN && reg && reg.id) {
    try {
      const { Client: QStashClient } = require('@upstash/qstash');
      const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN });
      const url = `${W.SITE}/api/webinar-nurture`;
      const diff = Math.floor((session.getTime() - Date.now()) / 1000);
      const jobs = [
        { step: 'reminder_24h', delay: diff - 86400 },
        { step: 'reminder_1h', delay: diff - 3600 },
        { step: 'live_now', delay: diff },
        { step: 'followup_2h', delay: diff + 2 * 3600 + W.DURATION_SEC },
        // Post-class nurture (attended + not-yet-booked only; gated in sendStep).
        { step: 'nurture_1d', delay: diff + 24 * 3600 },
        { step: 'nurture_3d', delay: diff + 3 * 24 * 3600 },
        { step: 'lastcall_6d', delay: diff + 6 * 24 * 3600 },
      ];
      // Parallel SMS track (only fires if a phone was given; gated in sendStepSms).
      if (phone) {
        jobs.push(
          { step: 'sms_24h', delay: diff - 86400 },
          { step: 'sms_dayof', delay: diff - 6 * 3600 },
          { step: 'sms_1h', delay: diff - 3600 },
          { step: 'sms_live', delay: diff },
          { step: 'sms_after', delay: diff + 2 * 3600 + W.DURATION_SEC },
          { step: 'sms_nudge', delay: diff + 2 * 24 * 3600 },
        );
      }
      for (const j of jobs) {
        if (j.delay < 60) continue; // too soon to be worth scheduling
        qstash.publishJSON({ url, delay: j.delay, body: { regId: reg.id, step: j.step } })
          .catch(e => console.error(`QStash ${j.step}:`, e.message));
      }
    } catch (e) { console.error('webinar schedule:', e.message); }
  }

  return res.status(200).json({ ok: true, token, session_time: sessionIso, when });
};
