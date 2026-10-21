// Speed to lead: what happens in the seconds after somebody raises a hand, and
// for the two weeks after that if they go quiet.
//
// Two problems this exists to fix.
//
// 1. The website never replied. tmitechai.com posts every form to
//    /api/site-intake, which saved the row and texted the team. The visitor got
//    nothing from TMI unless they went on to book, so the fastest we ever
//    responded was however long it took someone to read a text.
//
// 2. The chase was scheduled against the wrong collection. api/followup.js
//    holds day1/day3/day7/day14 and reads db.getById('leads', leadId).
//    api/lead.js only ever wrote an `applications` row, so scheduling with that
//    id makes every step answer "lead not found" and the chase silently does
//    nothing. api/visitor-enroll.js gets this right: create the lead row first,
//    then schedule against it. This does the same.
//
// Nothing here talks over a live conversation. followup.js suppresses every
// step the moment the lead's status is booked, won, lost, paid or unsubscribed,
// and enrol() refuses anyone on the suppression list.

const db = require('./_db');

const APP = 'https://admin.tmitechai.com';
const SITE = 'https://www.tmitechai.com';
const FROM_NUMBER = '+18557171044';
const FIT_CALL_URL = SITE + '/intelligent-company-audit.html#book';
const DAY = 86400;

// Day 1 is a text, so the first chase lands while they still remember us.
const CHASE = [
  { delay: 1 * DAY, step: 'day1_sms' },
  { delay: 3 * DAY, step: 'day3_email' },
  { delay: 7 * DAY, step: 'day7_email_sms' },
  { delay: 14 * DAY, step: 'day14_email' },
];

function formatPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return null;
  return d.startsWith('1') ? `+${d}` : `+1${d}`;
}

function emailWrap(body, unsubUrl) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5ef;-webkit-font-smoothing:antialiased;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5ef;"><tr><td align="center" style="padding:28px 14px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid #e7e8e1;border-radius:16px;overflow:hidden;"><tr><td style="background:#0a0b14;padding:18px 30px;"><span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">TMI</span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#E4FF97;margin-left:5px;"></span></td></tr><tr><td style="padding:34px 30px 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.7;">
${body}
${unsubUrl ? `<p style="margin:40px 0 0;font-size:11px;color:#bbb;border-top:1px solid #eee;padding-top:16px;"><a href="${unsubUrl}" style="color:#bbb;">Unsubscribe</a></p>` : ''}
</td></tr><tr><td style="padding:6px 30px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><div style="border-top:1px solid #eceee4;margin-top:8px;padding-top:16px;font-size:12px;line-height:1.6;color:#9a9ba5;">TMI Tech AI &middot; Lafayette, Louisiana<br><a href="${SITE}" style="color:#6f8f2a;text-decoration:none;">tmitechai.com</a></div></td></tr></table></td></tr></table></body></html>`;
}

function greetingEmail(firstName, unsubUrl) {
  return emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">Got it, and a real person has it, not just a form. If you have not picked a time yet, the next step is the Fit Call: <a href="${FIT_CALL_URL}" style="color:#5a9e00;">pick a time here</a></p>
<p style="margin:0 0 8px;">It is free and takes fifteen minutes, and it decides whether TMI should come inside your company at all. If the answer is no, we say so on the call. It helps to come with:</p>
<p style="margin:0 0 16px;color:#444;">1. The thing that most often still comes back to you.<br>2. A rough sense of the company: what you do, how many people, and where work gets stuck.<br>3. The software you are paying for right now.</p>
<p style="margin:0 0 24px;">If it is easier to just reply to this email, do that instead.</p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">Founder, TMI Tech AI</span></p>
`, unsubUrl);
}

// Find or create the `leads` row the chase runs against. Returns null when the
// address is suppressed, so nothing downstream sends to a do-not-contact.
async function enrol({ email, name, phone, company, source }) {
  const lc = String(email || '').toLowerCase().trim();
  if (!lc || !lc.includes('@')) return null;
  if (await db.findOne('suppression', 'email', lc).catch(() => null)) return null;

  const existing = await db.findOne('leads', 'email', lc).catch(() => null);
  if (existing) {
    // Keep a phone or a company we did not have before; never move a status back.
    const patch = {};
    if (phone && !existing.phone) patch.phone = phone;
    if (company && !existing.company_name) patch.company_name = company;
    if (name && !existing.owner_name) patch.owner_name = name;
    if (Object.keys(patch).length) await db.update('leads', existing.id, patch).catch(() => {});
    return Object.assign({}, existing, patch);
  }
  return db.insert('leads', {
    email: lc,
    owner_name: name || null,
    company_name: company || null,
    phone: phone || null,
    source: source || 'tmitechai.com',
    status: 'new',
    unsubscribed: false,
    created_at: new Date().toISOString(),
  }).catch((e) => { console.error('lead-response enrol:', e.message); return null; });
}

// Schedule the chase once per lead. chase_scheduled_at makes a repeat form
// submission refresh the record without starting a second sequence.
async function scheduleChase(lead) {
  if (!lead || !lead.id) return 0;
  if (lead.chase_scheduled_at) return 0;
  if (!process.env.QSTASH_TOKEN) return 0;

  const { Client: QStashClient } = require('@upstash/qstash');
  const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN });
  const url = `${APP}/api/followup`;
  let n = 0;
  for (const { delay, step } of CHASE) {
    try {
      await qstash.publishJSON({ url, delay, body: { leadId: lead.id, step } });
      n++;
    } catch (e) {
      console.error(`lead-response ${step}:`, e.message);
    }
  }
  if (n) await db.update('leads', lead.id, { chase_scheduled_at: new Date().toISOString() }).catch(() => {});
  return n;
}

// The reply the person gets within seconds. Sent once per lead.
async function greet(lead, { name, email, phone }) {
  if (!lead || lead.greeted_at) return false;
  const firstName = String(name || '').trim().split(/\s+/)[0] || 'there';
  const unsubUrl = `${APP}/api/unsubscribe?id=${lead.id}`;

  if (process.env.RESEND_API_KEY) {
    const { Resend } = require('resend');
    new Resend(process.env.RESEND_API_KEY).emails.send({
      from: 'TMI <support@tmitechai.com>',
      to: email,
      subject: 'Got it. Here is the next step.',
      html: greetingEmail(firstName, unsubUrl),
    }).catch((e) => console.error('lead-response email:', e.message));
  }

  const to = formatPhone(phone);
  if (to && process.env.TWILIO_ACCOUNT_SID) {
    require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
      .messages.create({
        body: `Hey ${firstName}, it's Mia at TMI Tech AI. Got your form. Next step is a free 15 minute Fit Call to work out whether we should be inside your company at all: ${FIT_CALL_URL} Reply here with questions.`,
        from: FROM_NUMBER,
        to,
      }).catch((e) => console.error('lead-response sms:', e.message));
  }

  await db.update('leads', lead.id, { greeted_at: new Date().toISOString() }).catch(() => {});
  return true;
}

// One call for an inbound form: enrol, reply, and start the chase.
async function respondToInbound({ name, email, phone, company, source }) {
  const lead = await enrol({ email, name, phone, company, source });
  if (!lead) return { ok: false, reason: 'suppressed or invalid' };
  const greeted = await greet(lead, { name, email, phone });
  const scheduled = await scheduleChase(lead);
  return { ok: true, leadId: lead.id, greeted, scheduled };
}

module.exports = { enrol, greet, scheduleChase, respondToInbound, CHASE, formatPhone };
