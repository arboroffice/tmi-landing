// Payment nurture for captured-but-unpaid Intelligent Company Audit leads.
// Called by QStash on a schedule set in api/audit-capture.js. Each step nudges
// the lead to complete the $5,000 audit. The chain stops as soon as the lead's
// status flips to 'paid' (set by api/audit-intake.js after payment).
//
// POST { applicationId, step }

const db = require('./_db');

// This app (resume, unsubscribe and other API links) is served here.
const APP = 'https://admin.tmitechai.com';
const FROM_NUMBER = '+18557171044';

function formatPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
}

function wrap(body, unsub, resumeUrl) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5ef;-webkit-font-smoothing:antialiased;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5ef;"><tr><td align="center" style="padding:28px 14px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid #e7e8e1;border-radius:16px;overflow:hidden;"><tr><td style="background:#0a0b14;padding:18px 30px;"><span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">TMI</span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#E4FF97;margin-left:5px;"></span></td></tr><tr><td style="padding:34px 30px 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.7;">
${body}
<p style="margin:28px 0 0;"><a href="${resumeUrl}" style="background:#E4FF97;color:#0a0b14;font-weight:700;padding:13px 26px;border-radius:999px;text-decoration:none;display:inline-block;">Complete your audit ($5,000)</a></p>
<p style="margin:32px 0 0;font-size:11px;color:#bbb;border-top:1px solid #eee;padding-top:16px;"><a href="${unsub}" style="color:#bbb;">Unsubscribe</a></p>
</td></tr><tr><td style="padding:6px 30px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><div style="border-top:1px solid #eceee4;margin-top:8px;padding-top:16px;font-size:12px;line-height:1.6;color:#9a9ba5;">TMI Tech AI &middot; Lafayette, Louisiana<br><a href="https://www.tmitechai.com" style="color:#6f8f2a;text-decoration:none;">tmitechai.com</a></div></td></tr></table></td></tr></table></body></html>`;
}

function copy(step, firstName, resumeUrl) {
  switch (step) {
    case 'hour1':
      return {
        subject: 'Finish your Intelligent Company Audit',
        html: `<p style="margin:0 0 16px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">You started the Intelligent Company Audit but did not finish checkout. The audit is 30 to 45 minutes, in person or by phone. We review how the company sells, operates, communicates, tracks information and makes decisions.</p>
<p style="margin:0 0 8px;">You get a Business Intelligence Score out of 100 across ten areas, a five-page report, and the Intelligent Company Roadmap. The roadmap is yours outright, whatever you decide to do afterwards.</p>`,
        sms: `Hey ${firstName}, it's Mia at TMI Tech AI. You started the Intelligent Company Audit but didn't finish checkout. You can pick it back up here: ${resumeUrl}`,
      };
    case 'day1':
      return {
        subject: 'What the audit actually shows you',
        html: `<p style="margin:0 0 16px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">The audit looks at how the work actually moves through your company, not how it is supposed to. Where knowledge lives in one or two people. Where the software gets worked around. Where decisions wait on the owner.</p>
<p style="margin:0 0 8px;">We say it back to you plainly, including the parts that are working and should be left alone. The roadmap is written so you could hand it to anyone to execute, us or another firm.</p>`,
        sms: '',
      };
    case 'day3':
      return {
        subject: 'Why the audit has a price',
        html: `<p style="margin:0 0 16px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">The audit has a price because it is a fixed thing. Paying for it changes what it is: we go into the systems and the numbers rather than taking anyone's word for them, and you own a document you can hand to a partner, a banker or a buyer.</p>
<p style="margin:0 0 8px;">$5,000, in person or by phone. Anything after it is scoped from what the audit found, in writing, before any work begins.</p>`,
        sms: `${firstName}, the Intelligent Company Audit is $5,000: a Business Intelligence Score out of 100, a five-page report, and a roadmap you own. Pick it back up here: ${resumeUrl}`,
      };
    case 'day7':
    default:
      return {
        subject: 'Last note on your audit',
        html: `<p style="margin:0 0 16px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">I am not going to keep filling your inbox. If the timing is not right, that is fine.</p>
<p style="margin:0 0 8px;">When you are ready for a clear read on how your company runs and what to build first, the audit is right here. If you would rather talk it through first, reply to this email.</p>`,
        sms: '',
      };
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const _S = process.env.GTM_RUN_SECRET;
  if (_S && req.query && req.query.secret !== _S) return res.status(401).json({ error: 'unauthorized' });

  const { applicationId, step } = req.body || {};
  if (!applicationId) return res.status(400).json({ error: 'applicationId required' });

  let app;
  try {
    app = await db.getById('applications', applicationId);
  } catch (e) {
    console.error('audit-followup load:', e.message);
    return res.status(200).json({ ok: true }); // ack so QStash doesn't retry forever
  }
  // Stop the chain if the lead is gone, already paid, or opted out.
  if (!app || app.status === 'paid' || app.status === 'unsubscribed' || app.unsubscribed) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  const firstName = (app.name || 'there').split(/\s+/)[0];
  const resumeUrl = `${APP}/api/audit-resume?id=${app.id}`;
  const c = copy(step, firstName, resumeUrl);
  const unsub = `${APP}/api/unsubscribe?id=${app.id}`;

  try {
    if (process.env.RESEND_API_KEY && app.email) {
      const { Resend } = require('resend');
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: 'TMI <support@tmitechai.com>',
        to: app.email,
        subject: c.subject,
        html: wrap(c.html, unsub, resumeUrl),
      });
    }
  } catch (e) { console.error('audit-followup email:', e.message); }

  try {
    if (c.sms && app.phone && process.env.TWILIO_ACCOUNT_SID) {
      const to = formatPhone(app.phone);
      if (to) {
        const sms = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await sms.messages.create({ body: c.sms, from: FROM_NUMBER, to });
      }
    }
  } catch (e) { console.error('audit-followup sms:', e.message); }

  try { await db.update('applications', app.id, { last_nudge: step, last_nudge_at: new Date().toISOString() }); } catch (e) {}

  return res.json({ ok: true });
};
