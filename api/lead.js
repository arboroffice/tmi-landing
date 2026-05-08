const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const twilio = require('twilio');
const { Client: QStashClient } = require('@upstash/qstash');

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

function buildInitialEmail(firstName, unsubUrl) {
  return emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">Got your application. We're putting your audit together now.</p>
<p style="margin:0 0 12px;">Here's what you'll get back from us:</p>
<ul style="margin:0 0 16px;padding-left:20px;color:#333;">
  <li>A full map of where your operation is losing time and money</li>
  <li>Every gap an AI system can close in your workflow</li>
  <li>What your operation looks like running on automated infrastructure</li>
</ul>
<p style="margin:0 0 16px;">This isn't a generic deck. It's specific to your business.</p>
<p style="margin:0 0 24px;">If you want to talk before we send it over, grab a time: <a href="${SITE}/booking" style="color:#5a9e00;">${SITE}/booking</a></p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">TMI - AI Infrastructure for Field Operations</span></p>
`, unsubUrl);
}

function buildDay3Email(firstName, unsubUrl) {
  return emailWrap(`
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
`, unsubUrl);
}

function buildDay7Email(firstName, unsubUrl) {
  return emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">I know you're running an operation. You don't have time to chase things down.</p>
<p style="margin:0 0 16px;">So I'll keep this short: most tools built for field operations don't fix anything. They just give you something to look at.</p>
<p style="margin:0 0 16px;">What we do is different. If it's a fit for your business, you'll know in 20 minutes.</p>
<p style="margin:0 0 24px;"><a href="${SITE}/booking" style="color:#5a9e00;">Grab a time here.</a></p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">TMI</span></p>
`, unsubUrl);
}

function buildDay14Email(firstName, unsubUrl) {
  return emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">I'm not going to keep filling your inbox.</p>
<p style="margin:0 0 16px;">If the timing isn't right, it isn't right. No hard feelings.</p>
<p style="margin:0 0 16px;">If it ever is - you know where to find us: <a href="${SITE}/booking" style="color:#5a9e00;">calendar</a></p>
<p style="margin:0 0 24px;">One more thing worth reading: <a href="${SITE}/article-scaling-trap" style="color:#5a9e00;">Why Growth Usually Makes the Problem Worse</a></p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">TMI</span></p>
`, unsubUrl);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { name, email, phone } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Missing required fields' });

  const firstName = name.split(' ')[0];

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: lead, error: dbError } = await supabase
    .from('leads')
    .insert({ name, email: email.toLowerCase(), phone: phone || null, status: 'new' })
    .select()
    .single();

  if (dbError) {
    console.error('Supabase error:', dbError);
    return res.status(500).json({ error: 'Failed to save lead' });
  }

  const unsubUrl = `${SITE}/api/unsubscribe?id=${lead.id}`;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  // Initial email
  resend.emails.send({
    from: 'Mia from TMI <hello@tmi-technology.com>',
    to: email,
    subject: "Got your info - here's what happens next",
    html: buildInitialEmail(firstName, unsubUrl),
  }).catch(e => console.error('Resend error:', e));

  // SMS to lead
  if (phone) {
    sms.messages.create({
      body: `Hey ${firstName} - Mia from TMI. Got your info, on it now. If you want to talk: ${SITE}/booking`,
      from: FROM_NUMBER,
      to: formatPhone(phone),
    }).catch(e => console.error('Lead SMS error:', e));
  }

  // Internal alert
  sms.messages.create({
    body: `New TMI lead: ${name} | ${email} | ${phone || 'no phone'}`,
    from: FROM_NUMBER,
    to: ALERT_NUMBER,
  }).catch(e => console.error('Alert SMS error:', e));

  // Schedule follow-up chain
  const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN });
  const followupUrl = `${SITE}/api/followup`;

  const schedule = [
    { delay: 86400,   step: 'day1_sms' },
    { delay: 259200,  step: 'day3_email' },
    { delay: 604800,  step: 'day7_email_sms' },
    { delay: 1209600, step: 'day14_email' },
  ];

  for (const { delay, step } of schedule) {
    qstash.publishJSON({
      url: followupUrl,
      delay,
      body: { leadId: lead.id, step },
    }).catch(e => console.error(`QStash ${step} error:`, e));
  }

  res.status(200).json({ ok: true });
};
