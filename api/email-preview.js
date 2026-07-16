// Preview sender: emails a curated set of the client-facing, on-brand emails
// to a TMI inbox so we can eyeball the branding in a real client.
// GET ?to=<addr> (defaults to mia@tmitechai.com), ?from=domain to send from
// support@tmitechai.com instead of the Resend test sender.
// Recipients are restricted to @tmitechai.com so this can never reach outsiders.
// Pure preview: no DB writes, no SMS, no CAPI, no follow-up scheduling.

const { emailWrap, buildStepEmail } = require('./_webinar-mail');
const { renderIssue } = require('./_newsletter-render');

const SITE = 'https://www.tmitechai.com';

const btn = (href, label, dark) =>
  `<a href="${href}" style="display:inline-block;background:${dark ? '#0a0b14' : '#E4FF97'};color:${dark ? '#E4FF97' : '#0a0b14'};font-weight:800;padding:14px 28px;border-radius:10px;text-decoration:none;">${label}</a>`;

// The Founders of the Future Letters sample (mirrors newsletter-test).
const NL_SAMPLE = {
  title: 'The first thing AI should do in your business',
  subject: 'The first thing AI should do in your business',
  preheader: 'Not replace people. Remember, route, and finish the work so it stops routing through you.',
  format: 'standard',
  body:
`Most owners think about AI backwards. They ask what it can replace. The better question is what it can remember, route, and finish without you in the room.

A lead comes in, and someone has to see it, qualify it, and follow up. A job gets done, and someone has to capture it, invoice it, and chase the payment. None of that is hard. All of it depends on a person being available and not dropping the ball. That dependence is the real ceiling on your business.

That is the difference between using AI and becoming an intelligent company. Tools sit on the side and wait to be used. Infrastructure runs the business whether you are watching or not.

## Where to start

1. Find the one handoff that breaks most when you get busy.
2. Write down exactly what a person does in that moment, step by step.
3. Make it run automatically every time, whether you are watching or not.`,
};

function samples(to) {
  const first = 'Mia';
  const auditUrl = `${SITE}/complete-audit`;
  const bookUrl = `${SITE}/booking`;
  const unsub = `${SITE}/api/unsubscribe?email=${encodeURIComponent(to)}`;
  const list = [];

  // 1) Strategy-call / contact confirmation
  list.push({
    key: 'contact-confirmation',
    subject: `Got it, ${first}. Let's talk.`,
    html: emailWrap(
      `<p style="margin:0 0 6px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">TMI Technology</p>` +
      `<h2 style="margin:0 0 20px;font-size:28px;font-weight:800;letter-spacing:-0.02em;line-height:1.1;">We got your request.</h2>` +
      `<p>I'll review what you shared about your operation and reach out within one business day to set up your strategy call.</p>` +
      `<p>If you want to move faster, you can book directly:</p>` +
      `<p>${btn(bookUrl, 'Book your call now', true)}</p>` +
      `<p style="margin-top:28px;">Mia<br><span style="color:#888;font-size:13px;">TMI, Technology Management Innovation. We build intelligent companies.</span></p>`,
      unsub
    ),
  });

  // 2) Lead nurture follow-up
  list.push({
    key: 'lead-followup',
    subject: `The part of your operation that quietly leaks`,
    html: emailWrap(
      `<p>Hey ${first},</p>` +
      `<p>Quick thought while it's on my mind. In almost every operation we audit, the money does not leak where the owner expects. It leaks in the handoffs: the lead that waits, the invoice that slips out late, the job nobody costed until it was over.</p>` +
      `<p>The free audit maps exactly where yours leaks and hands you a 30-day plan, and you keep the audit either way.</p>` +
      `<p>${btn(auditUrl, 'Get your free audit', true)}</p>` +
      `<p>The TMI team</p>`,
      unsub
    ),
  });

  // 3) Booking confirmation
  list.push({
    key: 'booking-confirmation',
    subject: `You're booked. Strategy call confirmed.`,
    html: emailWrap(
      `<h2 style="margin:0 0 18px;font-size:26px;font-weight:800;letter-spacing:-0.02em;">You're on the calendar.</h2>` +
      `<p>Hey ${first}, your strategy call is confirmed. You'll get a calendar invite with the video link shortly.</p>` +
      `<table width="100%" style="border-collapse:collapse;background:#f9f9f9;border-radius:8px;overflow:hidden;margin:20px 0;">` +
      `<tr><td style="padding:10px 14px;font-size:13px;color:#888;width:30%">When</td><td style="padding:10px 14px;font-size:13px;font-weight:600">Tuesday, 3:00 PM CT</td></tr>` +
      `<tr style="background:#f3f3f3"><td style="padding:10px 14px;font-size:13px;color:#888">Where</td><td style="padding:10px 14px;font-size:13px;font-weight:600">Google Meet (link in your invite)</td></tr>` +
      `<tr><td style="padding:10px 14px;font-size:13px;color:#888">With</td><td style="padding:10px 14px;font-size:13px;font-weight:600">Mia, TMI</td></tr>` +
      `</table>` +
      `<p>Come with the one part of the business that stresses you out most. We'll start there.</p>` +
      `<p>The TMI team</p>`,
      unsub
    ),
  });

  // 4) Audit deliverable receipt
  list.push({
    key: 'audit-receipt',
    subject: `Your intelligence audit is ready`,
    html: emailWrap(
      `<h2 style="margin:0 0 18px;font-size:26px;font-weight:800;letter-spacing:-0.02em;">Your audit is ready.</h2>` +
      `<p>Hey ${first}, we mapped how your operation runs today, scored it, and marked where time and money leak, plus the first system and digital employees worth building.</p>` +
      `<p>${btn(auditUrl, 'Open your audit', true)}</p>` +
      `<p>It's yours to keep whether or not you build with us. When you're ready, book a call and we'll walk through it together.</p>` +
      `<p>The TMI team</p>`,
      unsub
    ),
  });

  // 5) Webinar reminder (real builder)
  const reg = {
    name: 'Mia Louviere', email: to, session_time: '2026-07-14T20:00:00.000Z',
    when: 'Tuesday at 3:00 PM CT', token: 'preview', attended: false,
  };
  const web = buildStepEmail(reg, 'reminder_24h');
  if (web) list.push({ key: 'webinar-reminder', subject: web.subject, html: web.html });

  // 6) Founders of the Future Letters newsletter
  list.push({
    key: 'field-notes-newsletter',
    subject: NL_SAMPLE.subject,
    html: renderIssue(NL_SAMPLE, `${SITE}/api/nl-unsubscribe?e=${encodeURIComponent(to)}`),
  });

  return list;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const to = (req.query.to || 'mia@tmitechai.com').toString().toLowerCase().trim();
  if (!/@tmitechai\.com$/.test(to) && to !== 'mialouviere@gmail.com') {
    return res.status(403).json({ error: 'Preview sends restricted to @tmitechai.com addresses' });
  }
  if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: 'RESEND_API_KEY not set' });

  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = req.query.from === 'domain'
    ? 'TMI <support@tmitechai.com>'
    : 'TMI <onboarding@resend.dev>';

  const results = [];
  for (const s of samples(to)) {
    try {
      const r = await resend.emails.send({ from, to, subject: '[PREVIEW] ' + s.subject, html: s.html });
      results.push({ key: s.key, ok: !(r && r.error), id: (r && r.data && r.data.id) || null, error: r && r.error ? JSON.stringify(r.error) : null });
    } catch (e) {
      results.push({ key: s.key, ok: false, error: e.message });
    }
  }

  return res.json({ ok: results.every(r => r.ok), sent_to: to, from, count: results.length, results });
};
