// Payment nurture for captured-but-unpaid Complete Audit leads.
// Called by QStash on a schedule set in api/audit-capture.js. Each step nudges
// the lead to complete the $1,000 audit. The chain stops as soon as the lead's
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

function wrap(body, unsub) {
  return `<!DOCTYPE html><html><body style="background:#fff;font-family:Arial,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:40px 24px;line-height:1.7;">
${body}
<p style="margin:28px 0 0;"><a href="${SITE}/complete-audit" style="background:#E4FF97;color:#0a0b14;font-weight:700;padding:13px 26px;border-radius:999px;text-decoration:none;display:inline-block;">Complete your audit ($1,000)</a></p>
<p style="margin:32px 0 0;font-size:11px;color:#bbb;border-top:1px solid #eee;padding-top:16px;"><a href="${unsub}" style="color:#bbb;">Unsubscribe</a></p>
</body></html>`;
}

function copy(step, firstName) {
  switch (step) {
    case 'hour1':
      return {
        subject: 'Finish your Complete Audit',
        html: `<p style="margin:0 0 16px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">You started the Complete Audit but did not finish checkout. It is the one way in: a detailed map of where your business leaks time and money, your Intelligence Score, a 90-day plan, and a 30-minute call with the founder and a strategist where we pick your path.</p>
<p style="margin:0 0 8px;">Takes two minutes to lock in.</p>`,
        sms: `Hey ${firstName} - you started the Complete Audit but didn't finish. Lock it in here: ${SITE}/complete-audit`,
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
<p style="margin:0 0 8px;">$1,000, and it applies toward whatever you build next.</p>`,
        sms: `${firstName} - the Complete Audit pinpoints exactly where your business is stuck and what to fix first. $1,000, applies toward your build: ${SITE}/complete-audit`,
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
  const c = copy(step, firstName);
  const unsub = `${SITE}/api/unsubscribe?id=${app.id}`;

  try {
    if (process.env.RESEND_API_KEY && app.email) {
      const { Resend } = require('resend');
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: 'TMI <support@tmitechai.com>',
        to: app.email,
        subject: c.subject,
        html: wrap(c.html, unsub),
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
