const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const twilio = require('twilio');
const { Receiver } = require('@upstash/qstash');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const SITE = 'https://tmi-technology.com';

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

  // Skip if booked or unsubscribed
  if (!lead || lead.status === 'booked' || lead.status === 'unsubscribed') {
    return res.status(200).json({ skipped: true, reason: lead?.status });
  }

  const firstName = lead.name.split(' ')[0];
  const unsubUrl = `${SITE}/api/unsubscribe?id=${leadId}`;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  if (step === 'day1_sms' && lead.phone) {
    await sms.messages.create({
      body: `Hey ${firstName} - just checking in. Did you get a chance to look at what we sent? Happy to walk through it: ${SITE}/booking`,
      from: FROM_NUMBER,
      to: formatPhone(lead.phone),
    });
  }

  if (step === 'day3_email') {
    await resend.emails.send({
      from: 'Mia from TMI <hello@tmi-technology.com>',
      to: lead.email,
      subject: 'Quick question about your operation',
      html: emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">Still working on your audit. Quick thing - most operations we look at are bleeding the most through one of these three:</p>
<ul style="margin:0 0 16px;padding-left:20px;color:#333;">
  <li>Crew accountability and time tracking</li>
  <li>Dispatch and scheduling gaps</li>
  <li>Job costing that's off until it's too late</li>
</ul>
<p style="margin:0 0 16px;">We wrote about how it usually plays out: <a href="${SITE}/article-revenue-leakage" style="color:#5a9e00;">Where the Revenue Actually Goes</a></p>
<p style="margin:0 0 24px;">If any of that sounds familiar, worth a 20-minute call: <a href="${SITE}/booking" style="color:#5a9e00;">${SITE}/booking</a></p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">TMI</span></p>
`, unsubUrl),
    });
  }

  if (step === 'day7_email_sms') {
    await resend.emails.send({
      from: 'Mia from TMI <hello@tmi-technology.com>',
      to: lead.email,
      subject: 'Still here if you want to talk',
      html: emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">I know you're running an operation. You don't have time to chase things down.</p>
<p style="margin:0 0 16px;">So I'll keep this short: most tools built for field operations don't fix anything. They just give you something to look at.</p>
<p style="margin:0 0 16px;">What we do is different. If it's a fit for your business, you'll know in 20 minutes.</p>
<p style="margin:0 0 24px;"><a href="${SITE}/booking" style="color:#5a9e00;">Grab a time here.</a></p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">TMI</span></p>
`, unsubUrl),
    });

    if (lead.phone) {
      await sms.messages.create({
        body: `Hey ${firstName} - Mia from TMI. One more follow-up. If you want to talk through your operation: ${SITE}/booking`,
        from: FROM_NUMBER,
        to: formatPhone(lead.phone),
      });
    }
  }

  if (step === 'day14_email') {
    await resend.emails.send({
      from: 'Mia from TMI <hello@tmi-technology.com>',
      to: lead.email,
      subject: 'Last one from me',
      html: emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">I'm not going to keep filling your inbox.</p>
<p style="margin:0 0 16px;">If the timing isn't right, it isn't right. No hard feelings.</p>
<p style="margin:0 0 16px;">If it ever is - you know where to find us: <a href="${SITE}/booking" style="color:#5a9e00;">calendar</a></p>
<p style="margin:0 0 24px;">One more thing worth reading in the meantime: <a href="${SITE}/article-scaling-trap" style="color:#5a9e00;">Why Growth Usually Makes the Problem Worse</a></p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">TMI</span></p>
`, unsubUrl),
    });
  }

  res.status(200).json({ ok: true, step });
}

handler.config = { api: { bodyParser: false } };
module.exports = handler;
