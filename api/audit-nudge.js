const { getSupabase } = require('./_supabase');
const { Resend } = require('resend');
const twilio = require('twilio');

const FROM_NUMBER = '+18557171044';
const SITE = 'https://www.tmitechai.com';

// Abandon-chaser steps fire while a lead has started the audit but not finished.
// They stop the moment the audit is completed, the lead converts, or unsubscribes.
const STOP_STATUSES = [
  'unsubscribed', 'booked', 'won', 'lost', 'client', 'building',
  'customer', 'onboarding', 'closed', 'paid', 'churned', 'dead',
  'rejected', 'do_not_contact',
];

function formatPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  return digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
}

function emailWrap(inner, unsubUrl) {
  return `<!DOCTYPE html><html><body style="background:#fff;font-family:Arial,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:40px 24px;line-height:1.7;">
${inner}
<p style="margin:40px 0 0;font-size:11px;color:#bbb;border-top:1px solid #eee;padding-top:16px;"><a href="${unsubUrl}" style="color:#bbb;">Unsubscribe</a></p>
</body></html>`;
}

// 10-minute nudge — finish the audit.
function resumeEmail(firstName, resumeLink, unsubUrl) {
  return emailWrap(`
<p style="margin:0 0 6px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">TMI Intelligence Audit</p>
<h1 style="margin:0 0 16px;font-size:28px;font-weight:800;line-height:1.1;letter-spacing:-0.02em;color:#0a0b14;">You're a few minutes from your results</h1>
<p style="margin:0 0 20px;font-size:15px;color:#444;line-height:1.65;">Hey ${firstName}, you started your TMI Intelligence Audit but didn't quite finish. It takes about 3 more minutes, and at the end you get your founder dependency score, your biggest operational bottleneck, and the first move to fix it.</p>
<p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.65;">Pick up right where you left off. Your answers are pre-filled.</p>
<a href="${resumeLink}" style="display:inline-block;background:#E4FF97;color:#0a0b14;font-weight:700;font-size:14px;padding:14px 32px;border-radius:999px;text-decoration:none;">Finish my audit &rarr;</a>
<p style="margin:28px 0 0;font-size:14px;color:#555;line-height:1.65;">It's free, and there's no pitch at the end. Just a clear read on your operation.</p>
<p style="margin:24px 0 0;font-size:14px;">Mia<br><span style="color:#888;font-size:13px;">TMI &mdash; Intelligent Infrastructure for Field Operations</span></p>`, unsubUrl);
}

// Day 1 — lead with booking a call, keep the audit as the prep step.
function bookOrFinishEmail(firstName, bookingLink, resumeLink, unsubUrl) {
  return emailWrap(`
<p style="margin:0 0 6px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">TMI Intelligence Audit</p>
<h1 style="margin:0 0 16px;font-size:26px;font-weight:800;line-height:1.12;letter-spacing:-0.02em;color:#0a0b14;">Want to just talk it through?</h1>
<p style="margin:0 0 18px;font-size:15px;color:#444;line-height:1.65;">Hey ${firstName}, you started the audit yesterday and didn't finish. No problem. The fastest path is usually a quick call where we map your operation together.</p>
<a href="${bookingLink}" style="display:inline-block;background:#E4FF97;color:#0a0b14;font-weight:700;font-size:14px;padding:14px 32px;border-radius:999px;text-decoration:none;">Grab a time &rarr;</a>
<p style="margin:26px 0 18px;font-size:15px;color:#444;line-height:1.65;">One ask: if you can, finish your 5-minute audit before the call. It means we walk in with your actual numbers and go deep from the first minute instead of spending the call on basics.</p>
<a href="${resumeLink}" style="font-size:14px;color:#5a9e00;font-weight:600;">Finish my audit first &rarr;</a>
<p style="margin:28px 0 0;font-size:14px;">Mia<br><span style="color:#888;font-size:13px;">TMI</span></p>`, unsubUrl);
}

// Day 3 — final touch, both doors open.
function lastCallEmail(firstName, bookingLink, resumeLink, unsubUrl) {
  return emailWrap(`
<p style="margin:0 0 20px;font-size:15px;color:#444;line-height:1.65;">Hey ${firstName},</p>
<p style="margin:0 0 16px;font-size:15px;color:#444;line-height:1.65;">Last nudge on this, then I'll leave it.</p>
<p style="margin:0 0 16px;font-size:15px;color:#444;line-height:1.65;">If you want a read on where your operation is stuck, you've got two doors. Finish the 5-minute audit and get it instantly, or book a call and we'll do it together.</p>
<p style="margin:0 0 8px;font-size:15px;color:#444;"><a href="${resumeLink}" style="color:#5a9e00;font-weight:600;">Finish my audit &rarr;</a></p>
<p style="margin:0 0 24px;font-size:15px;color:#444;"><a href="${bookingLink}" style="color:#5a9e00;font-weight:600;">Book a call &rarr;</a></p>
<p style="margin:0;font-size:14px;">Mia<br><span style="color:#888;font-size:13px;">TMI</span></p>`, unsubUrl);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const { leadId, name, email, phone, company, step = 'abandon_10min' } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });

  let db;
  try { db = getSupabase(); } catch (e) {
    return res.status(503).json({ error: 'db not configured' });
  }

  // Stop the whole sequence if the audit was completed.
  const { data: submission } = await db
    .from('audit_submissions')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (submission) {
    return res.status(200).json({ ok: true, skipped: 'audit_complete' });
  }

  // Stop if the lead converted, booked, or opted out (booked leads get the
  // pre-call audit reminder instead of cold abandon chasing).
  let notes = {};
  if (leadId) {
    const { data: lead } = await db.from('leads').select('notes, status').eq('id', leadId).single();
    try { notes = JSON.parse(lead?.notes || '{}'); } catch { notes = {}; }
    if (lead?.status && STOP_STATUSES.includes(lead.status)) {
      return res.status(200).json({ ok: true, skipped: `status_${lead.status}` });
    }
    const sent = Array.isArray(notes.abandon_sent) ? notes.abandon_sent : [];
    // Back-compat: the old one-shot nudge marked notes.nudge_sent.
    if (sent.includes(step) || (step === 'abandon_10min' && notes.nudge_sent)) {
      return res.status(200).json({ ok: true, skipped: 'step_already_sent' });
    }
  }

  const params = new URLSearchParams({ n: name || '', e: email, p: phone || '', c: company || '' });
  const resumeLink = `${SITE}/audit?resume=1&${params.toString()}`;
  const bookingLink = `${SITE}/booking`;
  const firstName = (name || 'there').split(' ')[0];
  const unsubUrl = leadId
    ? `${SITE}/api/unsubscribe?id=${leadId}`
    : `${SITE}/api/unsubscribe?email=${encodeURIComponent(email.toLowerCase().trim())}`;

  // Per-step content
  const EMAIL = {
    abandon_10min: { subject: `${firstName}, your TMI audit is almost done`, html: resumeEmail(firstName, resumeLink, unsubUrl) },
    abandon_day1:  { subject: `${firstName}, want to just talk it through?`,  html: bookOrFinishEmail(firstName, bookingLink, resumeLink, unsubUrl) },
    abandon_day3:  { subject: `Last nudge, ${firstName}`,                     html: lastCallEmail(firstName, bookingLink, resumeLink, unsubUrl) },
  };
  const SMS = {
    abandon_10min: `Hey ${firstName} - looks like you didn't finish your TMI audit. Pick up where you left off: ${resumeLink}`,
    abandon_day1:  `Hey ${firstName} - easiest next step is a quick call. Grab a time: ${bookingLink}  If you can, finish your 5-min audit first so we have your numbers going in: ${resumeLink}`,
    abandon_day3:  `Hey ${firstName} - last nudge. Book a call: ${bookingLink}  or finish your audit: ${resumeLink}  Either works.`,
  };

  const emailContent = EMAIL[step] || EMAIL.abandon_10min;
  const smsBody = SMS[step] || SMS.abandon_10min;

  let emailSent = false, smsSent = false;

  const { logEmail, logSms } = require('./_comms');

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({ from: 'TMI <support@tmitechai.com>', to: email, subject: emailContent.subject, html: emailContent.html });
    emailSent = true;
    logEmail(db, { address: email, subject: emailContent.subject, leadId });
  } catch (e) { console.error(`nudge email (${step}):`, e.message); }

  if (phone) {
    try {
      const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      const msg = await sms.messages.create({ body: smsBody, from: FROM_NUMBER, to: formatPhone(phone) });
      smsSent = true;
      logSms(db, { phone: formatPhone(phone), body: smsBody, leadId, twilioSid: msg && msg.sid });
    } catch (e) { console.error(`nudge SMS (${step}):`, e.message); }
  }

  // If nothing went out, leave it un-marked so a retry can try again.
  if (!emailSent && !smsSent) {
    return res.status(500).json({ error: 'nudge failed to send', step, email_sent: false, sms_sent: false });
  }

  // Record this step so it never double-fires.
  if (leadId) {
    const sent = Array.isArray(notes.abandon_sent) ? notes.abandon_sent : [];
    sent.push(step);
    await db.from('leads').update({
      status: 'audit_nudge_sent',
      notes: JSON.stringify({
        ...notes,
        nudge_sent: true,
        abandon_sent: sent,
        [`${step}_at`]: new Date().toISOString(),
      }),
    }).eq('id', leadId);
  }

  return res.status(200).json({ ok: true, step, email_sent: emailSent, sms_sent: smsSent });
};
