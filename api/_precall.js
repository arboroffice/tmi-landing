// Pre-call sequence for anyone who books a TMI call on the Cal link.
//
// The job of every touch: make them think "I need to know what they find."
// The product is their own company; the AI is just how TMI rebuilds it.
//
// Timing fits the gap between booking and the call:
//   right away        -> email 1 + sms 1
//   each day between  -> one "middle" email (most important first if the gap is short)
//   day before        -> sms 4 (24h out)
//   morning of        -> email 7 (8:00 CT)
//   1 hour before     -> sms 5
//   10 min before     -> email + sms with the call link
//
// State lives in precall_bookings/{hash of email}. Every send claims its step in
// a transaction, so a step never goes out twice, and a cancel or reschedule
// makes stale jobs no-ops.
const crypto = require('crypto');
const db = require('./_db');

const SITE = 'https://admin.tmitechai.com';
const FROM_NUMBER = '+18557171044';
const FROM_EMAIL = 'Mia at TMI <support@tmitechai.com>';
const TZ = 'America/Chicago';
const MAX_DELAY_S = 6 * 86400; // QStash delay ceiling we stay under; later steps relay

const SIGN_BOTH = 'Mia + Tyler\nTMI Tech AI\nWe build intelligent companies.';
const SIGN_MIA = 'Mia\nTMI Tech AI';

// ---- copy ------------------------------------------------------------------
// Light markup: blank line = new paragraph, single newline = line break,
// lines starting with "* " = bullet list. {{first_name}}, {{time}}, {{link}}.
const EMAILS = {
  e1_booked: {
    subject: 'Before our call',
    body: `Hey {{first_name}},

Looking forward to talking with you.

Quick heads up before our call.

This is not a software demo.

We are going to look at how your company actually runs today and find where money, time, data, and opportunities are getting lost.

Most companies we talk to already have plenty of technology.

The problem is usually that none of it really works together.

You may have:

* information living in different systems
* work being tracked manually
* people doing the same tasks over and over
* leads or follow-ups slipping through
* reports that tell you what happened after it is too late
* data sitting inside the company that nobody is using
* processes that still depend on the owner or one key employee

That is what we are looking for.

By the end of our time together, we should have a much clearer picture of what your company could automate, connect, measure, and improve.

Talk soon,

${SIGN_BOTH}`,
  },
  e2_software: {
    subject: 'You probably don’t need more software',
    body: `{{first_name}},

A lot of businesses think becoming more advanced means adding another CRM, another dashboard, another AI tool, or another subscription.

Usually it’s the opposite.

We recently looked at a company spending tens of thousands of dollars across different software tools.

The issue wasn’t that they needed another one.

The issue was that they had too many systems, too much scattered data, and too many steps that still required a human to move information from one place to another.

That is one of the first things we look for.

What can be removed?
What can be connected?
What can run automatically?
What information are you already collecting but not using?

Sometimes the smartest technology project starts by deleting technology.

That’s part of what we’ll look at when we talk.

${SIGN_MIA}`,
  },
  e_hidden: {
    subject: 'We’re looking for your company’s “hidden employees”',
    body: `{{first_name}},

When we talk, we’re going to look for something we call hidden employees.

These aren’t actual people.

They’re jobs your company is already paying humans to do that a system could probably handle.

For example:

Someone checks something every morning.
Someone sends the same update every Friday.
Someone reminds customers.
Someone moves information between two systems.
Someone watches a spreadsheet.
Someone builds the same report every month.
Someone answers the same internal questions.
Someone has to remember when something needs attention.

Individually, those tasks seem small.

Across 20, 40, 100+ employees, they can add up to thousands of hours.

The goal isn’t to replace your people.

It’s to find the work your people should never have had to do manually in the first place.

That’s one thing we’ll be hunting for on our call.

See you soon.

${SIGN_MIA}`,
  },
  e3_owner: {
    subject: 'What happens when you’re not there?',
    body: `{{first_name}},

One question we ask every owner we sit down with:

What stops working, slows down, or needs approval when you aren’t there?

That answer tells us a lot.

A truly intelligent company should not need the owner to:

check everything
remember everything
push every job forward
answer every question
watch every employee
find every problem
or make every small decision.

The company itself should be able to tell you:

what needs attention
what is falling behind
what changed
what is making money
what is losing money
and what should happen next.

That is a big part of what TMI means by an Intelligent Company.

We aren’t just adding AI.

We are helping build a company that can think, report, trigger actions, and operate with much less friction.

We’ll dig into where that could apply inside your business when we talk.

${SIGN_MIA}`,
  },
  e4_ai: {
    subject: '“We already use AI.”',
    body: `{{first_name}},

We hear this a lot.

“We already use ChatGPT.”

“We already have AI in our CRM.”

“Our software added an AI feature.”

That’s great.

But using AI tools and having an Intelligent Company are two very different things.

An intelligent company connects AI to the actual business.

Your customers.
Your operations.
Your sales.
Your team.
Your documents.
Your schedules.
Your equipment.
Your numbers.
Your workflows.
Your historical data.

So instead of an employee asking ChatGPT a question, the company can start doing things like:

spotting problems automatically
following up automatically
building reports automatically
routing work automatically
finding patterns in company data
warning you before something becomes a problem
and giving your team the right information at the right time.

That is what we are trying to uncover.

Not “Where can we shove AI?”

But:

“If this company were truly intelligent, how would it operate differently?”

${SIGN_MIA}`,
  },
  e5_boring: {
    subject: 'The expensive problems are usually boring',
    body: `{{first_name}},

The biggest leaks inside a business rarely look dramatic.

It’s usually things like:

A quote that never got followed up.

A job sitting too long.

Someone entering the same information twice.

A customer nobody called back.

An employee spending 10 hours a week building reports.

A manager who has information nobody else can see.

A spreadsheet that quietly became part of the company’s operating system.

A problem nobody notices until the end of the month.

One of those things might not matter much.

Hundreds of them happening every month absolutely do.

Our job is to find those small leaks and figure out which ones are actually worth fixing.

We care much more about business impact than putting AI everywhere.

See you on the call.

${SIGN_MIA}`,
  },
  e6_worst: {
    subject: 'Worst case after our call',
    body: `{{first_name}},

You might be wondering what happens if we talk and you decide TMI is not the right fit.

That’s completely fine.

Worst case, you should leave the conversation with a clearer understanding of:

1. Where your company is losing time
2. Where work is still too manual
3. Where your data is trapped
4. Where information is falling through cracks
5. What should probably be automated
6. What should NOT be automated
7. Which systems may be unnecessary
8. Where AI could actually create an ROI
9. What is keeping the business dependent on certain people
10. What we would fix first if it were our company

So even if nothing happens after the call, the conversation should still be useful.

That’s the point.

${SIGN_MIA}`,
  },
  e7_morning: {
    subject: 'One question before we talk today',
    body: `{{first_name}},

Before we jump on today, think about this:

If you could snap your fingers and fix ONE thing inside the business, what would it be?

Not what AI tool you want.

Not what software you want.

The actual business problem.

Maybe:

“We don’t know what is going on without asking people.”
“Our sales follow-up sucks.”
“We have too much admin.”
“Our systems don’t talk.”
“We need better visibility.”
“Everything still comes back to me.”
“Our data is everywhere.”
“We need to know which jobs/customers actually make money.”
“Our team spends too much time doing things manually.”

That answer gives us a great place to start.

Talk shortly.

${SIGN_BOTH.split('\nWe build')[0]}`,
  },
  e_10m: {
    subject: 'We’re starting in about 10 minutes',
    body: `Hey {{first_name}},

We’re on in about 10 minutes.{{link_line}}

If something came up or you can’t find the link, just reply to this email.

${SIGN_MIA}`,
  },
};

const SMS = {
  s1_booked: `Hey {{first_name}}, it’s Mia with TMI. Saw you booked a call with us.

Quick heads up: this isn’t a software pitch. We’re going to look at how the business actually runs and find where your systems, data, people, or processes are costing you time or money.

Looking forward to it. Reply STOP to opt out.`,
  s2_manual: `One thing to think about before our call:

Where does your team still copy, type, call, check, remind, follow up, or move information manually?

Those little tasks are usually where we start finding the biggest opportunities.

No need to send me an answer now. Just keep it in mind for our call.`,
  s3_ai: `Also, don’t worry if you already use AI or have a bunch of software.

We’re not checking whether you “have AI.”

We’re looking at whether your company’s data + systems + people actually work together intelligently.

Big difference.`,
  s4_daybefore: `Hey {{first_name}}, quick reminder about our call tomorrow.

You don’t need to prepare a presentation or gather a bunch of documents.

Just be ready to walk us through:

how work comes in → what happens next → who touches it → what systems you use → where things tend to get stuck.

We’ll take it from there.`,
  s5_1h: `Hey {{first_name}}, we’re still good for {{time}}.

One question I want you thinking about before we get on:

If you could fix one thing inside the company instantly, what would it be?

We’ll start there.`,
  s_10m: `{{first_name}}, we’re starting in about 10 min.{{link_sms}} - Mia`,
};

// Middle emails: sent in story order, but when the gap is short the most
// important ones win the available days.
const MIDDLE_ORDER = ['e2_software', 'e_hidden', 'e3_owner', 'e4_ai', 'e5_boring', 'e6_worst'];
const MIDDLE_PRIORITY = ['e_hidden', 'e6_worst', 'e2_software', 'e3_owner', 'e4_ai', 'e5_boring'];

// ---- time helpers (Central time) -------------------------------------------
function ctParts(ms) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute };
}
// The instant that is h:mi Central on the given Central calendar day.
function ctAt(y, m, d, h, mi) {
  let guess = Date.UTC(y, m - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const p = ctParts(guess);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    guess += Date.UTC(y, m - 1, d, h, mi) - asUtc;
  }
  return guess;
}
function ctDayList(fromMs, toMs) { // Central calendar days strictly after fromMs's day and before toMs's day
  const a = ctParts(fromMs), b = ctParts(toMs);
  const out = [];
  let cur = Date.UTC(a.y, a.m - 1, a.d) + 86400000;
  const end = Date.UTC(b.y, b.m - 1, b.d);
  while (cur < end) { const dt = new Date(cur); out.push([dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()]); cur += 86400000; }
  return out;
}
const fmtTime = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }) + ' CT';

// ---- plan -------------------------------------------------------------------
// Returns [{ key, at }] for one booking. Pure, so it is easy to test.
function planSteps(bookedMs, callMs) {
  const steps = [{ key: 'e1_booked', at: bookedMs }, { key: 's1_booked', at: bookedMs }];
  const H = 3600000;
  const slots = ctDayList(bookedMs, callMs)
    .map(([y, m, d]) => ctAt(y, m, d, 10, 0))
    .filter((t) => t > bookedMs + 2 * H && t < callMs - 3 * H);
  const chosen = MIDDLE_PRIORITY.slice(0, slots.length);
  const ordered = MIDDLE_ORDER.filter((k) => chosen.includes(k));
  ordered.forEach((k, i) => steps.push({ key: k, at: slots[i] }));
  // SMS 2 rides with the first middle day (afternoon), SMS 3 with the AI email.
  if (slots.length) steps.push({ key: 's2_manual', at: slots[0] + 4 * H });
  const aiIdx = ordered.indexOf('e4_ai');
  if (aiIdx >= 0) steps.push({ key: 's3_ai', at: slots[aiIdx] + 4 * H });
  // Day before: only if that is still in the future and not the same moment as booking.
  if (callMs - 24 * H > bookedMs + 2 * H) steps.push({ key: 's4_daybefore', at: callMs - 24 * H });
  // Morning of: 8:00 CT on the call day, when the call is later than 9:00 and it is not the booking day.
  const c = ctParts(callMs), bk = ctParts(bookedMs);
  const morning = ctAt(c.y, c.m, c.d, 8, 0);
  const sameDay = c.y === bk.y && c.m === bk.m && c.d === bk.d;
  if (!sameDay && callMs - morning >= H && morning > bookedMs) steps.push({ key: 'e7_morning', at: morning });
  if (callMs - H > bookedMs + 15 * 60000) steps.push({ key: 's5_1h', at: callMs - H });
  if (callMs - 10 * 60000 > bookedMs + 5 * 60000) { steps.push({ key: 'e_10m', at: callMs - 10 * 60000 }); steps.push({ key: 's_10m', at: callMs - 10 * 60000 }); }
  return steps.sort((a, b) => a.at - b.at);
}

// ---- rendering --------------------------------------------------------------
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function fill(text, v) {
  return text
    .replace(/\{\{first_name\}\}/g, v.first_name || 'there')
    .replace(/\{\{time\}\}/g, v.time || 'our call')
    .replace(/\{\{link_line\}\}/g, v.link ? ` Here’s the link: ${v.link}` : ' Your call link is in the calendar invite.')
    .replace(/\{\{link_sms\}\}/g, v.link ? ` Join here: ${v.link}` : ' Your call link is in the calendar invite.');
}
function toHtml(text) {
  return text.split(/\n{2,}/).map((block) => {
    const lines = block.split('\n');
    if (lines.every((l) => l.startsWith('* '))) {
      return `<ul style="margin:0 0 16px;padding-left:20px;color:#333;">${lines.map((l) => `<li style="margin:0 0 4px;">${escHtml(l.slice(2))}</li>`).join('')}</ul>`;
    }
    return `<p style="margin:0 0 16px;">${lines.map(escHtml).join('<br>')}</p>`;
  }).join('\n').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#6f8f2a;font-weight:700;">$1</a>');
}
function wrapEmail(inner, stopUrl) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5ef;-webkit-font-smoothing:antialiased;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5ef;"><tr><td align="center" style="padding:28px 14px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid #e7e8e1;border-radius:16px;overflow:hidden;"><tr><td style="background:#0a0b14;padding:18px 30px;"><span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">TMI</span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#E4FF97;margin-left:5px;"></span></td></tr><tr><td style="padding:34px 30px 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.7;">
${inner}
${stopUrl ? `<p style="margin:32px 0 0;font-size:11px;color:#bbb;border-top:1px solid #eee;padding-top:16px;"><a href="${stopUrl}" style="color:#bbb;">Stop these pre-call emails</a></p>` : ''}
</td></tr><tr><td style="padding:6px 30px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><div style="border-top:1px solid #eceee4;margin-top:8px;padding-top:16px;font-size:12px;line-height:1.6;color:#9a9ba5;">TMI Technology &middot; We build Intelligent Companies<br><a href="https://www.tmitechai.com" style="color:#6f8f2a;text-decoration:none;">tmitechai.com</a></div></td></tr></table></td></tr></table></body></html>`;
}

// ---- state + sending --------------------------------------------------------
const docId = (email) => 'pc_' + crypto.createHash('sha256').update(String(email).toLowerCase().trim()).digest('hex').slice(0, 24);
const secret = () => process.env.GTM_RUN_SECRET || process.env.JWT_SECRET || '';
const stopToken = (id) => crypto.createHmac('sha256', secret()).update(id).digest('hex').slice(0, 20);
const stopUrl = (id) => `${SITE}/api/precall-sequence?stop=${id}&t=${stopToken(id)}`;
function phoneE164(p) { const d = String(p || '').replace(/\D/g, ''); if (d.length < 10) return null; return d.length === 10 ? `+1${d}` : `+${d}`; }

// Pull what we need out of a Cal.com webhook body.
function fromCal(body) {
  const p = (body && body.payload) || {};
  const a = (p.attendees || [])[0] || {};
  const r = p.responses || {};
  const val = (x) => (x && typeof x === 'object' ? x.value : x);
  const loc = val(r.location);
  const phone = val(r.attendeePhoneNumber) || val(r.phone) || val(r.phoneNumber) || a.phoneNumber || p.smsReminderNumber
    || (loc && typeof loc === 'object' ? loc.optionValue : null);
  const link = (p.metadata && p.metadata.videoCallUrl) || (p.videoCallData && p.videoCallData.url)
    || (/^https?:\/\//.test(String(p.location || '')) ? p.location : null);
  return {
    trigger: body && body.triggerEvent,
    email: a.email ? String(a.email).toLowerCase().trim() : null,
    name: a.name || val(r.name) || '',
    phone: phoneE164(phone),
    startTime: p.startTime || null,
    uid: p.uid || null,
    link: link || null,
  };
}

async function publish(qs, delayS, body) {
  const url = `${SITE}/api/precall-sequence?secret=${encodeURIComponent(secret())}`;
  return qs.publishJSON({ url, body, delay: Math.max(0, Math.floor(delayS)) });
}

// Start (or move, after a reschedule) the sequence for one booking.
async function schedule(info, { qs, now = Date.now() } = {}) {
  if (!info.email || !info.startTime) return { scheduled: 0 };
  const id = docId(info.email);
  const callMs = new Date(info.startTime).getTime();
  const prev = await db.getById('precall_bookings', id).catch(() => null);
  // A new booking (vs. a reschedule of the live one): nothing on file, it was
  // cancelled, or the last call already happened.
  const fresh = !prev || prev.cancelled || (prev.call_at && new Date(prev.call_at).getTime() < now - 3600000);
  const bookedMs = fresh ? now : new Date(prev.booked_at).getTime();
  await db.update('precall_bookings', id, {
    email: info.email, name: info.name || (prev && prev.name) || null,
    first_name: String(info.name || (prev && prev.name) || '').trim().split(/\s+/)[0] || null,
    phone: info.phone || (prev && prev.phone) || null,
    call_at: new Date(callMs).toISOString(), link: info.link || (prev && prev.link) || null,
    uid: info.uid || null, booked_at: new Date(bookedMs).toISOString(),
    cancelled: false, sent: fresh ? [] : (prev.sent || []), updated_at: new Date(now).toISOString(),
    stopped: fresh ? false : !!(prev && prev.stopped),
  });
  const steps = planSteps(bookedMs, callMs);
  let n = 0, relay = false;
  for (const s of steps) {
    const delay = (s.at - now) / 1000;
    if (delay < -600 && !s.key.endsWith('_booked')) continue; // already past
    if (delay > MAX_DELAY_S) { relay = true; continue; }
    await publish(qs, delay, { id, key: s.key, call_at: new Date(callMs).toISOString() });
    n++;
  }
  // Steps more than 6 days out: wake up later and schedule the rest then.
  if (relay) await publish(qs, MAX_DELAY_S - 3600, { id, relay: true, call_at: new Date(callMs).toISOString() });
  return { scheduled: n, relay };
}

async function cancel(email) {
  if (!email) return;
  await db.update('precall_bookings', docId(email), { cancelled: true, updated_at: new Date().toISOString() }).catch(() => {});
}

// Claim a step so it is sent at most once, then send it.
async function sendStep({ id, key, call_at }) {
  const fs = db.db();
  const ref = fs.collection('precall_bookings').doc(id);
  const doc = await fs.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const d = snap.data();
    if (d.cancelled || d.stopped) return null;
    if (call_at && d.call_at !== call_at) return null; // rescheduled since this job was queued
    if ((d.sent || []).includes(key)) return null;
    tx.update(ref, { sent: (d.sent || []).concat(key) });
    return d;
  });
  if (!doc) return { skipped: true };
  const callMs = new Date(doc.call_at).getTime();
  const vars = { first_name: doc.first_name, time: fmtTime(callMs), link: doc.link };
  if (EMAILS[key]) {
    if (!process.env.RESEND_API_KEY) return { skipped: 'no resend' };
    const { Resend } = require('resend');
    const e = EMAILS[key];
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: FROM_EMAIL, to: doc.email, reply_to: 'support@tmitechai.com',
      subject: fill(e.subject, vars), html: wrapEmail(toHtml(fill(e.body, vars)), stopUrl(id)),
    });
    return { sent: key };
  }
  if (SMS[key]) {
    if (!doc.phone || !process.env.TWILIO_ACCOUNT_SID) return { skipped: 'no phone' };
    const twilio = require('twilio');
    await twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN).messages.create({
      body: fill(SMS[key], vars), from: FROM_NUMBER, to: doc.phone,
    });
    return { sent: key };
  }
  return { skipped: 'unknown step' };
}

module.exports = { EMAILS, SMS, planSteps, fromCal, schedule, cancel, sendStep, stopToken, docId, toHtml, fill, wrapEmail, ctAt, ctParts };
