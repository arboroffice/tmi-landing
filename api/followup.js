const db = require('./_db');
const { Resend } = require('resend');
const twilio = require('twilio');
const { Receiver } = require('@upstash/qstash');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const SITE = 'https://admin.tmitechai.com';
// The free Fit Call is booked on the live site's audit page.
const FIT_CALL_URL = 'https://www.tmitechai.com/intelligent-company-audit.html#book';
const INSIGHT_INTELLIGENT_COMPANY = 'https://www.tmitechai.com/insights-what-is-an-intelligent-company.html';
const INSIGHT_AUDIT_FINDS = 'https://www.tmitechai.com/insights-what-an-audit-should-find.html';

function formatPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  return digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
}

function emailWrap(body, unsubUrl) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5ef;-webkit-font-smoothing:antialiased;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5ef;"><tr><td align="center" style="padding:28px 14px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid #e7e8e1;border-radius:16px;overflow:hidden;"><tr><td style="background:#0a0b14;padding:18px 30px;"><span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">TMI</span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#E4FF97;margin-left:5px;"></span></td></tr><tr><td style="padding:34px 30px 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.7;">
${body}
<p style="margin:40px 0 0;font-size:11px;color:#bbb;border-top:1px solid #eee;padding-top:16px;"><a href="${unsubUrl}" style="color:#bbb;">Unsubscribe</a></p>
</td></tr><tr><td style="padding:6px 30px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><div style="border-top:1px solid #eceee4;margin-top:8px;padding-top:16px;font-size:12px;line-height:1.6;color:#9a9ba5;">TMI Tech AI &middot; Lafayette, Louisiana<br><a href="https://www.tmitechai.com" style="color:#6f8f2a;text-decoration:none;">tmitechai.com</a></div></td></tr></table></td></tr></table></body></html>`;
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);

  // Verify this came from QStash
  const receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
  });

  try {
    await receiver.verify({
      signature: req.headers['upstash-signature'],
      body: rawBody,
    });
  } catch {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { leadId, step } = JSON.parse(rawBody);

  const lead = await db.getById('leads', leadId);

  const preCallSteps = ['pre_call_24h', 'pre_call_2h', 'pre_call_1h', 'pre_call_10m'];

  // Statuses where the lead has converted, gone dead, or opted out. Once a lead
  // reaches any of them, all cold and Intelligent Company Audit nurture follow-up stops.
  //
  // Verified against the admin portal (admin-leads.html): the lead pipeline is
  // new -> contacted -> qualified -> proposal -> won -> lost. "Convert to client"
  // sets the lead to 'won' and creates the client record, so on the lead side
  // 'won' IS "we got them as a client / we're building." booking-confirmed.js
  // sets 'booked'. Those plus 'lost' and 'unsubscribed' are the real stop
  // signals. The rest are forward-compatible synonyms in case the vocabulary
  // grows (client tables already use active/healthy/churned).
  const STOP_STATUSES = [
    'unsubscribed', 'booked', 'won', 'lost',          // verified, live today
    'client', 'building', 'customer', 'onboarding',   // forward-compatible
    'closed', 'paid', 'churned', 'dead',
    'rejected', 'do_not_contact',
  ];

  if (!lead) {
    return res.status(200).json({ skipped: true, reason: 'lead not found' });
  }

  if (lead.status === 'unsubscribed') {
    return res.status(200).json({ skipped: true, reason: 'unsubscribed' });
  }

  if (preCallSteps.includes(step)) {
    // Pre-call reminders only make sense for a lead with a booked call.
    if (lead.status !== 'booked') {
      return res.status(200).json({ skipped: true, reason: 'not booked' });
    }
  } else {
    // Cold + Intelligent Company Audit nurture steps stop once the lead has converted
    // (booked / client / building / etc.) or gone dead.
    if (STOP_STATUSES.includes(lead.status)) {
      return res.status(200).json({ skipped: true, reason: `suppressed - status is "${lead.status}"` });
    }
  }

  // Pull the lead's most recent Intelligent Company Audit (if any) so the campaign can
  // reference their actual industry and biggest bottleneck.
  let audit = null;
  try {
    const rows = await db.list('audit_submissions', {
      where: [['email', '==', lead.email]],
      order: 'created_at',
      ascending: false,
      limit: 1,
    });
    audit = rows[0] || null;
  } catch { /* personalization is best-effort */ }

  // Map the scored worst area to a plain-language bottleneck line.
  const WORST_LINE = {
    leads:   'new jobs leak between the first call and the signed estimate',
    ops:     'every dispatch and field decision still routes back through you',
    people:  'the operation runs on what is in your best people’s heads',
    finance: 'money you already earned sits uncollected between job-done and cash-in',
    comms:   'you find out a job went sideways when the customer calls, not before',
  };
  const worstLine = (audit && WORST_LINE[audit.worst_cat]) || 'most of what keeps the business running still routes through you';
  const industryLine = audit && audit.industry ? audit.industry : 'your operation';

  const firstName = String(lead.name || lead.owner_name || '').split(' ')[0] || 'there';
  const unsubUrl = `${SITE}/api/unsubscribe?id=${leadId}`;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  // Log every email/SMS this handler sends (all addressed to the lead) to the timeline.
  try { require('./_comms').instrument(db, { resend, sms, leadId: lead.id }); } catch (e) { console.error('comms instrument:', e.message); }

  if (step === 'day1_sms' && lead.phone) {
    await sms.messages.create({
      body: `Hey ${firstName}, did you get a chance to look at what we sent? If you want to talk it through, the Fit Call is free and takes 15 minutes: ${FIT_CALL_URL}`,
      from: FROM_NUMBER,
      to: formatPhone(lead.phone),
    });
  }

  if (step === 'day3_email') {
    // From Tyler
    await resend.emails.send({
      from: 'TMI <support@tmitechai.com>',
      to: lead.email,
      subject: 'Something I keep seeing',
      html: emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">I spend a lot of time inside established companies.</p>
<p style="margin:0 0 16px;">The ones that are stuck usually aren't doing anything wrong. They're running on people instead of systems. Every schedule change, every job update, every quote that needs a decision, someone has to catch it or it falls through.</p>
<p style="margin:0 0 16px;">Here's what it looks like when that is fixed: <a href="${INSIGHT_INTELLIGENT_COMPANY}" style="color:#5a9e00;">What Is an Intelligent Company?</a></p>
<p style="margin:0 0 24px;">If that sounds like your company, the Fit Call is free and takes 15 minutes: <a href="${FIT_CALL_URL}" style="color:#5a9e00;">book the Fit Call</a></p>
<p style="margin:0;">Tyler<br><span style="color:#888;font-size:13px;">Co-founder, TMI Tech AI</span></p>
`, unsubUrl),
    });
  }

  if (step === 'day7_email_sms') {
    // From Mia
    await resend.emails.send({
      from: 'TMI <support@tmitechai.com>',
      to: lead.email,
      subject: 'Straight question',
      html: emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">Is now just a bad time?</p>
<p style="margin:0 0 16px;">Real question. If you're in a busy stretch, buried on a job, or short on people, I get it. We can come back to this.</p>
<p style="margin:0 0 16px;">If it's something else, just reply and tell me. I'd rather know.</p>
<p style="margin:0 0 24px;">The Fit Call calendar is here whenever it's useful: <a href="${FIT_CALL_URL}" style="color:#5a9e00;">book the Fit Call</a></p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">TMI Tech AI</span></p>
`, unsubUrl),
    });

    if (lead.phone) {
      await sms.messages.create({
        body: `Hey ${firstName}, is now just a bad time? Real question. Happy to circle back whenever. Fit Call: ${FIT_CALL_URL}`,
        from: FROM_NUMBER,
        to: formatPhone(lead.phone),
      });
    }
  }

  if (step === 'day14_email') {
    // Signed from both founders
    await resend.emails.send({
      from: 'TMI <support@tmitechai.com>',
      to: lead.email,
      subject: "I'm going to stop here",
      html: emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">I don't want to be another email you're ignoring.</p>
<p style="margin:0 0 16px;">If the company's in a good place, genuinely good. If it's not and the timing just hasn't been right, the Fit Call calendar is here whenever: <a href="${FIT_CALL_URL}" style="color:#5a9e00;">book the Fit Call</a></p>
<p style="margin:0 0 24px;">One last thing worth reading: <a href="${INSIGHT_AUDIT_FINDS}" style="color:#5a9e00;">What Should a Business Audit Actually Find?</a></p>
<p style="margin:0;">Mia and Tyler<br><span style="color:#888;font-size:13px;">TMI Tech AI &middot; Lafayette, Louisiana</span></p>
`, unsubUrl),
    });
  }

  // ─── IDENTIFIED VISITOR CAMPAIGN (RB2B) ───
  // Email-only, opt-out at any time. For leads created from an identified site
  // visitor (source 'rb2b-visitor') that an admin approved from the Visitors page.
  // Deliberately NO SMS: these people never gave express consent (TCPA).
  let visitorNotes = {};
  try { visitorNotes = JSON.parse(lead.notes || '{}'); } catch { visitorNotes = {}; }
  const visitorCompany = visitorNotes.company || '';
  const coLine = visitorCompany ? ` at ${visitorCompany}` : '';
  const escHtml = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const introToParas = t => String(t).split(/\n+/).map(s => s.trim()).filter(Boolean)
    .map(s => `<p style="margin:0 0 16px;">${escHtml(s)}</p>`).join('');

  if (step === 'visitor_day0_email') {
    const sig = `<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">Co-founder, TMI Tech AI</span></p>`;
    const cta = `<p style="margin:0 0 24px;">If that's worth 15 minutes, the free Fit Call is here: <a href="${FIT_CALL_URL}" style="color:#5a9e00;">book the Fit Call</a>.</p>`;
    const bodyHtml = visitorNotes.intro
      ? `<p style="margin:0 0 20px;">Hey ${firstName},</p>\n${introToParas(visitorNotes.intro)}\n${cta}\n${sig}`
      : `<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">You came across TMI recently, so I'll keep this short and useful.</p>
<p style="margin:0 0 16px;">TMI is a Lafayette, Louisiana firm that installs the operating system of an intelligent company so industrial and family businesses can run, transfer, or sell without living in one person's head. If the company${coLine} still runs on what is in a few people's heads, that is the part we build around.</p>
${cta}
${sig}`;
    await resend.emails.send({
      from: 'TMI <support@tmitechai.com>',
      to: lead.email,
      subject: visitorCompany ? `A thought for ${visitorCompany}` : 'A thought on your operation',
      html: emailWrap(bodyHtml, unsubUrl),
    });
  }

  if (step === 'visitor_day3_email') {
    await resend.emails.send({
      from: 'TMI <support@tmitechai.com>',
      to: lead.email,
      subject: 'Where the revenue actually goes',
      html: emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">The companies that are stuck usually aren't doing anything wrong. They're running on people instead of systems. Every schedule change, every job update, every quote that needs a decision, someone has to catch it or it falls through.</p>
<p style="margin:0 0 16px;">Here's what it looks like when that is fixed: <a href="${INSIGHT_INTELLIGENT_COMPANY}" style="color:#5a9e00;">What Is an Intelligent Company?</a></p>
<p style="margin:0 0 24px;">If that sounds like your company, the Fit Call is free and takes 15 minutes: <a href="${FIT_CALL_URL}" style="color:#5a9e00;">book the Fit Call</a></p>
<p style="margin:0;">Tyler<br><span style="color:#888;font-size:13px;">Co-founder, TMI Tech AI</span></p>
`, unsubUrl),
    });
  }

  if (step === 'visitor_day7_email') {
    await resend.emails.send({
      from: 'TMI <support@tmitechai.com>',
      to: lead.email,
      subject: 'Worth a conversation?',
      html: emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">Last note from me. I don't want to be another email you're ignoring.</p>
<p style="margin:0 0 16px;">If the company's in a good place, genuinely good. If it's not and the timing just hasn't been right, the Fit Call is 15 minutes to work out whether TMI should come inside the company at all. If we are wrong for it, we will say so.</p>
<p style="margin:0 0 24px;">Whenever it's useful: <a href="${FIT_CALL_URL}" style="color:#5a9e00;">book the Fit Call</a></p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">TMI Tech AI</span></p>
`, unsubUrl),
    });
  }

  // ─── FORM NURTURE CAMPAIGN (older online form flow) ───
  // 7-day sequence for people who completed the older online form, plus a
  // 30-day check-in. Framed around the three bottlenecks: founder, information,
  // latency. Stops automatically once the lead converts (see STOP_STATUSES).

  if (step === 'ia_day1_sms' && lead.phone) {
    await sms.messages.create({
      body: `Hey ${firstName}, it's Mia at TMI Tech AI. From what you told us, ${worstLine}. Worth 15 minutes on a free Fit Call to see if the Intelligent Company Audit fits your company? ${FIT_CALL_URL}`,
      from: FROM_NUMBER,
      to: formatPhone(lead.phone),
    });
  }

  if (step === 'ia_day2_email') {
    // From Mia: the framing behind the Intelligent Company Audit
    await resend.emails.send({
      from: 'TMI <support@tmitechai.com>',
      to: lead.email,
      subject: 'The three places a business gets stuck',
      html: emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">Thanks for filling in the form. Here's the pattern we look for underneath answers like yours.</p>
<p style="margin:0 0 16px;">A company that grew by being good at the work tends to get stuck in one of three places. The founder, where every decision waits on one person. The information, where job status and numbers live in people's heads and texts instead of somewhere you can see. And the latency, the lag in every handoff, where margin quietly leaks out.</p>
<p style="margin:0 0 16px;">From what you told us about ${industryLine}, the one that sounds loudest is this: ${worstLine}.</p>
<p style="margin:0 0 24px;">An intelligent company runs those three on systems instead of on you. The Intelligent Company Audit is how we measure it properly: 30 to 45 minutes, in person or by phone, a Business Intelligence Score out of 100 across ten areas, a five-page report, and a roadmap you own. It starts with a free 15 minute Fit Call: <a href="${FIT_CALL_URL}" style="color:#5a9e00;">book the Fit Call</a></p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">Co-founder, TMI Tech AI</span></p>
`, unsubUrl),
    });
  }

  if (step === 'ia_day4_email') {
    // From Tyler: cost of staying the same
    await resend.emails.send({
      from: 'TMI <support@tmitechai.com>',
      to: lead.email,
      subject: 'What the lag is actually costing',
      html: emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">The expensive part of being stuck isn't dramatic. It's the lag.</p>
<p style="margin:0 0 16px;">A lead waits a few hours for a callback and goes with whoever answered first. A job finishes and the invoice goes out days later. A decision sits because the one person who can make it is out on a job. None of it shows up as a line item, which is exactly why it never gets fixed.</p>
<p style="margin:0 0 16px;">The reason it compounds is that it's structural, not a people problem. You can't hire your way out of lag. You build it out.</p>
<p style="margin:0 0 24px;">Here's what the fixed version looks like: <a href="${INSIGHT_INTELLIGENT_COMPANY}" style="color:#5a9e00;">What Is an Intelligent Company?</a> And if you want to talk about your company specifically, the Fit Call is free: <a href="${FIT_CALL_URL}" style="color:#5a9e00;">book the Fit Call</a></p>
<p style="margin:0;">Tyler<br><span style="color:#888;font-size:13px;">TMI Tech AI</span></p>
`, unsubUrl),
    });
  }

  if (step === 'ia_day7_email_sms') {
    // From Mia: the straight question
    await resend.emails.send({
      from: 'TMI <support@tmitechai.com>',
      to: lead.email,
      subject: 'Straight question',
      html: emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">You filled in the form, which means some part of this is on your mind. So a real question: is now just a bad time?</p>
<p style="margin:0 0 16px;">If you're in a busy stretch, buried on a job, or short on people, I get it. We can come back to this. If it's something else, reply and tell me. I'd rather know than keep guessing.</p>
<p style="margin:0 0 24px;">The Fit Call calendar is here whenever it's useful: <a href="${FIT_CALL_URL}" style="color:#5a9e00;">book the Fit Call</a></p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">TMI Tech AI</span></p>
`, unsubUrl),
    });

    if (lead.phone) {
      await sms.messages.create({
        body: `Hey ${firstName}, is now just a bad time? Real question. Happy to circle back whenever. Fit Call: ${FIT_CALL_URL}`,
        from: FROM_NUMBER,
        to: formatPhone(lead.phone),
      });
    }
  }

  if (step === 'ia_day30_checkin') {
    // 30-day check-in: re-open the loop
    await resend.emails.send({
      from: 'TMI <support@tmitechai.com>',
      to: lead.email,
      subject: `${firstName}, checking back in`,
      html: emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">It's been about a month since you filled in the form, so I'm checking back in.</p>
<p style="margin:0 0 16px;">The thing about a bottleneck is it doesn't fix itself. If anything, a busy month makes it louder, because the more work comes through, the more of it routes through you. If ${worstLine} is still true, it's still costing you.</p>
<p style="margin:0 0 16px;">If the company's in a genuinely good place, ignore this and good on you. If it's not and the timing just hasn't lined up, the Fit Call is 15 minutes, free, to work out whether TMI should come inside the company at all.</p>
<p style="margin:0 0 24px;">Whenever you're ready: <a href="${FIT_CALL_URL}" style="color:#5a9e00;">book the Fit Call</a></p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">Co-founder, TMI Tech AI</span></p>
`, unsubUrl),
    });
  }

  // --- BOOKED SEQUENCE (pre-call reminders) ---
  // The booked call is the free Fit Call (15 minutes). These just confirm,
  // prep the prospect, and make sure they hop on. No self-serve audit link.
  const TEXT_LINE = "Question before then? Just reply to this email.";

  if (step === "pre_call_24h") {
    await resend.emails.send({
      from: "TMI <support@tmitechai.com>",
      to: lead.email,
      subject: "Your TMI Fit Call is tomorrow",
      html: emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">We're on tomorrow. Looking forward to it.</p>
<p style="margin:0 0 8px;">It's the Fit Call: 15 minutes to work out whether TMI should come inside your company at all. If the answer is no, we will say so on the call. It helps to come with:</p>
<p style="margin:0 0 16px;color:#444;">1. The thing that most often still comes back to you.<br>2. A rough sense of the company: what you do, how many people, and where work tends to get stuck.<br>3. The software and tools you are paying for right now.</p>
<p style="margin:0 0 16px;">${TEXT_LINE}</p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">Co-founder, TMI Tech AI</span></p>
`, unsubUrl),
    });
    if (lead.phone) {
      await sms.messages.create({
        body: `Hey ${firstName}, it's Mia at TMI Tech AI. Our Fit Call is tomorrow, 15 minutes. Come with the thing that most often still comes back to you. ${TEXT_LINE}`,
        from: FROM_NUMBER, to: formatPhone(lead.phone),
      });
    }
  }

  if (step === "pre_call_2h" && lead.phone) {
    await sms.messages.create({
      body: `Hey ${firstName}, our Fit Call is in about 2 hours. Talk soon. ${TEXT_LINE}`,
      from: FROM_NUMBER, to: formatPhone(lead.phone),
    });
  }

  if (step === "pre_call_1h") {
    await resend.emails.send({
      from: "TMI <support@tmitechai.com>",
      to: lead.email,
      subject: "Your TMI Fit Call is in about an hour",
      html: emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">Quick heads up, we're on in about an hour. Your call link is in the calendar invite and your confirmation email.</p>
<p style="margin:0 0 16px;">Talk soon.</p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">Co-founder, TMI Tech AI</span></p>
`, unsubUrl),
    });
    if (lead.phone) {
      await sms.messages.create({
        body: `Hey ${firstName}, our Fit Call is in about an hour. Your call link is in the calendar invite and confirmation email. Reply here if you need it resent. Mia, TMI Tech AI`,
        from: FROM_NUMBER, to: formatPhone(lead.phone),
      });
    }
  }

  if (step === "pre_call_10m") {
    await resend.emails.send({
      from: "TMI <support@tmitechai.com>",
      to: lead.email,
      subject: "We're starting in about 10 minutes",
      html: emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">We're on in about 10 minutes. Grab the call link from your calendar invite or your confirmation email and hop on when you're ready.</p>
<p style="margin:0 0 16px;">If you can't find the link or something came up, just reply to this email and I'll sort it out.</p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">Co-founder, TMI Tech AI</span></p>
`, unsubUrl),
    });
    if (lead.phone) {
      await sms.messages.create({
        body: `${firstName}, we're starting in about 10 min. Your call link is in the calendar invite and confirmation email. Reply here if you need it. Mia, TMI Tech AI`,
        from: FROM_NUMBER, to: formatPhone(lead.phone),
      });
    }
  }

    res.status(200).json({ ok: true, step });
}

handler.config = { api: { bodyParser: false } };
module.exports = handler;
