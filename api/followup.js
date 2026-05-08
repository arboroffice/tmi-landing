const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const twilio = require('twilio');
const { Receiver } = require('@upstash/qstash');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const SITE = 'https://www.tmi-technology.com';

function formatPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  return digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
}

function emailWrap(body, unsubUrl) {
  return `<!DOCTYPE html><html><body style="background:#fff;font-family:Arial,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:40px 24px;line-height:1.7;">
${body}
<p style="margin:40px 0 0;font-size:11px;color:#bbb;border-top:1px solid #eee;padding-top:16px;"><a href="${unsubUrl}" style="color:#bbb;">Unsubscribe</a></p>
</body></html>`;
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

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single();

  const preCallSteps = ['pre_call_24h', 'pre_call_2h'];

  // Always skip unsubscribed
  if (!lead || lead.status === 'unsubscribed') {
    return res.status(200).json({ skipped: true, reason: 'unsubscribed' });
  }

  // Booked leads only get pre-call steps - skip all cold follow-ups
  if (lead.status === 'booked' && !preCallSteps.includes(step)) {
    return res.status(200).json({ skipped: true, reason: 'booked - cold sequence suppressed' });
  }

  // New leads only get cold follow-ups, not pre-call steps
  if (lead.status === 'new' && preCallSteps.includes(step)) {
    return res.status(200).json({ skipped: true, reason: 'not booked' });
  }

  const firstName = lead.name.split(' ')[0];
  const unsubUrl = `${SITE}/api/unsubscribe?id=${leadId}`;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  if (step === 'day1_sms' && lead.phone) {
    await sms.messages.create({
      body: `Hey ${firstName} - did you get a chance to look at what we sent? Worth going through before we build anything. ${SITE}/booking if you want to talk it through.`,
      from: FROM_NUMBER,
      to: formatPhone(lead.phone),
    });
  }

  if (step === 'day3_email') {
    // From Tyler
    await resend.emails.send({
      from: 'Tyler at TMI <hello@tmi-technology.com>',
      to: lead.email,
      subject: 'Something I keep seeing',
      html: emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">I look at a lot of operations.</p>
<p style="margin:0 0 16px;">The ones losing the most aren't usually doing anything wrong. They're just running on people instead of systems. Every dispatch call, every schedule change, every job update - someone has to catch it or it falls through.</p>
<p style="margin:0 0 16px;">Here's how it usually adds up: <a href="${SITE}/article-revenue-leakage" style="color:#5a9e00;">Where the Revenue Actually Goes</a></p>
<p style="margin:0 0 24px;">Worth 20 minutes if that sounds like your operation: <a href="${SITE}/booking" style="color:#5a9e00;">${SITE}/booking</a></p>
<p style="margin:0;">Tyler<br><span style="color:#888;font-size:13px;">TMI - AI Infrastructure for Field Operations</span></p>
`, unsubUrl),
    });
  }

  if (step === 'day7_email_sms') {
    // From Mia
    await resend.emails.send({
      from: 'Mia at TMI <hello@tmi-technology.com>',
      to: lead.email,
      subject: 'Straight question',
      html: emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">Is now just a bad time?</p>
<p style="margin:0 0 16px;">Real question, not a guilt trip. If you're mid-season, buried on a job, dealing with staffing - I get it. We can come back to this.</p>
<p style="margin:0 0 16px;">If it's something else, just reply and tell me. I'd rather know.</p>
<p style="margin:0 0 24px;">Calendar's here whenever: <a href="${SITE}/booking" style="color:#5a9e00;">${SITE}/booking</a></p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">TMI</span></p>
`, unsubUrl),
    });

    if (lead.phone) {
      await sms.messages.create({
        body: `Hey ${firstName} - is now just a bad time? Real question. Happy to circle back whenever: ${SITE}/booking`,
        from: FROM_NUMBER,
        to: formatPhone(lead.phone),
      });
    }
  }

  if (step === 'day14_email') {
    // No name — just TMI
    await resend.emails.send({
      from: 'TMI <hello@tmi-technology.com>',
      to: lead.email,
      subject: "I'm going to stop here",
      html: emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">I don't want to be another email you're ignoring.</p>
<p style="margin:0 0 16px;">If the operation's in a good place - genuinely good. If it's not and the timing just hasn't been right, the calendar's here whenever: <a href="${SITE}/booking" style="color:#5a9e00;">${SITE}/booking</a></p>
<p style="margin:0 0 24px;">One last thing worth reading: <a href="${SITE}/article-scaling-trap" style="color:#5a9e00;">Why Growth Usually Makes the Problem Worse</a></p>
<p style="margin:0;">TMI<br><span style="color:#888;font-size:13px;">tmi-technology.com</span></p>
`, unsubUrl),
    });
  }

  // --- BOOKED SEQUENCE ---

  if (step === 'pre_call_24h') {
    // From Mia — day before the call
    await resend.emails.send({
      from: 'Mia at TMI <hello@tmi-technology.com>',
      to: lead.email,
      subject: "We're talking tomorrow",
      html: emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">Just a heads up - we're on tomorrow. Looking forward to it.</p>
<p style="margin:0 0 16px;">One thing that'll make the call more useful: if you haven't already, submit your operations audit before we get on. Takes about 5 minutes and means we can go deep from the start instead of spending the whole call on basics.</p>
<p style="margin:0 0 24px;"><a href="${SITE}/audit" style="color:#5a9e00;font-weight:600;">Submit your audit here</a></p>
<p style="margin:0 0 16px;">See you then.</p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">TMI - AI Infrastructure for Field Operations</span></p>
`, unsubUrl),
    });
  }

  if (step === 'pre_call_2h' && lead.phone) {
    // SMS only — 2 hours before
    await sms.messages.create({
      body: `Hey ${firstName} - we're on in 2 hours. See you then.`,
      from: FROM_NUMBER,
      to: formatPhone(lead.phone),
    });
  }

  res.status(200).json({ ok: true, step });
}

handler.config = { api: { bodyParser: false } };
module.exports = handler;
