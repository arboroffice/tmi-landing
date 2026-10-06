const db = require('./_db');
const { Resend } = require('resend');
const twilio = require('twilio');
const { Client: QStashClient } = require('@upstash/qstash');

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

function buildInitialEmail(firstName, unsubUrl) {
  return emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">Got your details. If you already picked a time, you're set. A separate confirmation with the call link is on its way. If you did not finish picking a time, do it here: <a href="${FIT_CALL_URL}" style="color:#5a9e00;">book the Fit Call</a></p>
<p style="margin:0 0 8px;">The Fit Call is free and takes 15 minutes. It is there to work out whether TMI should come inside your company at all, and if the answer is no, we will say so on the call. It helps to come with:</p>
<p style="margin:0 0 16px;color:#444;">1. The thing that most often still comes back to you.<br>2. A rough sense of the company: what you do, how many people, and where work tends to get stuck.<br>3. The software and tools you are paying for right now.</p>
<p style="margin:0 0 24px;">Question before then, or want to talk sooner? Reply to this email and Mia or Tyler will get back to you.</p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">Co-founder, TMI Tech AI</span></p>
`, unsubUrl);
}

function buildDay3Email(firstName, unsubUrl) {
  return emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">A thought while you are deciding on a time.</p>
<p style="margin:0 0 16px;">The companies we sit down with are usually good at the work. Where they get stuck is that the company runs on what is in two or three people's heads, the software they bought gets worked around, and every real decision still waits on the owner.</p>
<p style="margin:0 0 16px;">We wrote about what that looks like when it is fixed: <a href="${INSIGHT_INTELLIGENT_COMPANY}" style="color:#5a9e00;">What Is an Intelligent Company?</a></p>
<p style="margin:0 0 24px;">If any of that sounds familiar, the Fit Call is free and takes 15 minutes: <a href="${FIT_CALL_URL}" style="color:#5a9e00;">pick a time</a></p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">TMI Tech AI</span></p>
`, unsubUrl);
}

function buildDay7Email(firstName, unsubUrl) {
  return emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">I know you are running a company. You do not have time to chase things down.</p>
<p style="margin:0 0 16px;">So I will keep this short. Most software bought to fix an operation gives you another screen to look at. What we do is go inside the company, keep what already works, and build the systems around it.</p>
<p style="margin:0 0 16px;">Whether that fits your business is what the Fit Call is for. It is free, 15 minutes, and we will tell you if TMI is wrong for this.</p>
<p style="margin:0 0 24px;"><a href="${FIT_CALL_URL}" style="color:#5a9e00;">Pick a time here.</a></p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">TMI Tech AI</span></p>
`, unsubUrl);
}

function buildDay14Email(firstName, unsubUrl) {
  return emailWrap(`
<p style="margin:0 0 20px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">I am not going to keep filling your inbox.</p>
<p style="margin:0 0 16px;">If the timing is not right, it is not right.</p>
<p style="margin:0 0 16px;">If it ever is, the Fit Call calendar is here: <a href="${FIT_CALL_URL}" style="color:#5a9e00;">book the Fit Call</a></p>
<p style="margin:0 0 24px;">One more thing worth reading: <a href="${INSIGHT_AUDIT_FINDS}" style="color:#5a9e00;">What Should a Business Audit Actually Find?</a></p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">TMI Tech AI</span></p>
`, unsubUrl);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { name, email, phone, company, website, heard_from, audience, niche, message, source } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Missing required fields' });
  // Fold website + attribution into the message so they land in the CRM record.
  const noteParts = [
    message,
    website ? `Website: ${website}` : null,
    heard_from ? `How they found us: ${heard_from}` : null,
  ].filter(Boolean);
  const noteBody = noteParts.length ? noteParts.join('\n') : null;

  const firstName = name.split(' ')[0];

  // Write to applications table (CRM inbox)
  let app;
  try {
    app = await db.insert('applications', {
      name,
      email: email.toLowerCase(),
      phone: phone || null,
      company: company || null,
      website: website || null,
      heard_from: heard_from || null,
      audience: audience || null,
      niche: niche || null,
      message: noteBody,
      source: source || 'funnel',
      status: 'new',
    });
  } catch (dbError) {
    console.error('Supabase error:', dbError);
    return res.status(500).json({ error: 'Failed to save application' });
  }

  const unsubUrl = `${SITE}/api/unsubscribe?id=${app.id}`;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  // Initial email
  resend.emails.send({
    from: 'TMI <support@tmitechai.com>',
    to: email,
    subject: "You applied. Here's what happens next.",
    html: buildInitialEmail(firstName, unsubUrl),
  }).catch(e => console.error('Resend error:', e));

  // SMS to lead
  if (phone) {
    sms.messages.create({
      body: `Hey ${firstName}, it's Mia at TMI Tech AI. Got your application. Next step is a free 15 minute Fit Call to see whether TMI should come inside your company at all. If you have not picked a time yet: ${FIT_CALL_URL} Questions before then? Reply here.`,
      from: FROM_NUMBER,
      to: formatPhone(phone),
    }).catch(e => console.error('Lead SMS error:', e));
  }

  // Internal alerts
  const domain = email.split('@')[1] || '';
  sms.messages.create({
    body: `New lead: ${name}\n${email}\n${phone || 'no phone'}\nCo: ${company || domain}${website ? '\n' + website : ''}${heard_from ? '\nFound us: ' + heard_from : ''}${audience ? '\nAudience: ' + audience : ''}${niche ? ' / ' + niche : ''}`,
    from: FROM_NUMBER,
    to: ALERT_NUMBER,
  }).catch(e => console.error('Alert SMS 1 error:', e));

  sms.messages.create({
    body: `PITCH: Free Fit Call (20-30 min) -> $5,000 Intelligent Company Audit (BI Score out of 100, five-page report, roadmap they own) -> build scoped from the roadmap, fixed scope and fixed price. TMI Partner is optional after.\n\nOpen on problems: everything still comes back to the owner, software the team works around, knowledge in two or three heads. Never quote a build total.\n\nFit Call: ${FIT_CALL_URL}`,
    from: FROM_NUMBER,
    to: ALERT_NUMBER,
  }).catch(e => console.error('Alert SMS 2 error:', e));

  // No drip is scheduled here. People book a call immediately after this form, so
  // the booking confirmation and pre-call reminders (api/booking-confirmed ->
  // api/funnel-nurture) own the rest of the conversation. The email/SMS above
  // already nudge anyone who did not finish picking a time back to the Fit Call.

  res.status(200).json({ ok: true });
};
