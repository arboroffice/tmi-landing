// Payment nurture for captured-but-unpaid Intelligent Company Audit leads.
// Called by QStash on a schedule set in api/audit-capture.js. Each step nudges
// the lead to complete the $5,000 audit. The chain stops as soon as the lead's
// status flips to 'paid' (set by api/audit-intake.js after payment).
//
// POST { applicationId, step }

const db = require('./_db');

const SITE = 'https://www.tmitechai.com';
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
</td></tr><tr><td style="padding:6px 30px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><div style="border-top:1px solid #eceee4;margin-top:8px;padding-top:16px;font-size:12px;line-height:1.6;color:#9a9ba5;">TMI Technology &middot; chaos control for growing companies<br><a href="https://www.tmitechai.com" style="color:#6f8f2a;text-decoration:none;">tmitechai.com</a></div></td></tr></table></td></tr></table></body></html>`;
}

function copy(step, firstName, resumeUrl) {
  switch (step) {
    case 'hour1':
      return {
        subject: 'Finish your Intelligent Company Audit',
        html: `<p style="margin:0 0 16px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">You started the Intelligent Company Audit but did not finish checkout. It is the one way in: a detailed map of where your business leaks time and money, your Intelligence Score, a 30-day plan, and a 30-minute call with the founder and a strategist where we pick your path.</p>
<p style="margin:0 0 8px;">Takes two minutes to lock in.</p>`,
        sms: `Hey ${firstName} - you started the Intelligent Company Audit but didn't finish. Lock it in here: ${resumeUrl}`,
      };
    case 'day1':
      return {
        subject: 'What the audit actually shows you',
        html: `<p style="margin:0 0 16px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">Most owners are surprised by what the audit surfaces: the software nobody uses, the work that gets done but never billed, the steps that quietly add days. We map all of it from your own answers, not a template.</p>
<p style="margin:0 0 8px;">The 30-minute call with the founder is where it gets real. You leave with your three paths: do it yourself, do it with us, or have us build it for you.</p>`,
        sms: '',
      };
    case 'day3':
      return {
        subject: 'The bottleneck is usually one of three things',
        html: `<p style="margin:0 0 16px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">Almost every operation we audit is stuck on one of three things: the founder is the bottleneck, nobody can see what is happening in time, or things just take too long between steps. The audit tells you which one is costing you the most and what to build first.</p>
<p style="margin:0 0 8px;">$5,000, and it applies toward whatever you build next.</p>`,
        sms: `${firstName} - the Intelligent Company Audit pinpoints exactly where your business is stuck and what to fix first. $5,000, applies toward your build: ${resumeUrl}`,
      };
    case 'day7':
    default:
      return {
        subject: 'Last nudge on your audit',
        html: `<p style="margin:0 0 16px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">I am not going to keep filling your inbox. If the timing is not right, that is fine.</p>
<p style="margin:0 0 8px;">When you are ready to see exactly where the time and money are going and how to fix it, the audit is right here.</p>`,
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
  const resumeUrl = `${SITE}/api/audit-resume?id=${app.id}`;
  const c = copy(step, firstName, resumeUrl);
  const unsub = `${SITE}/api/unsubscribe?id=${app.id}`;

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
