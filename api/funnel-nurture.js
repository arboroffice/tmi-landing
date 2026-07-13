// Funnel nurture: light, non-annoying nudges at the steps that leak. Each stage
// is capped at 1-2 touches and stops the moment the lead converts past it.
// Called by QStash from the points where each stage is scheduled.
//
// POST { stage, email?, session_id?, submissionId?, applicationId?, proposalId? }
//   stage: paid_no_intake | delivered_no_booking | proposal_no_accept
//          | precall_24h | precall_2h

const db = require('./_db');

const SITE = 'https://www.tmitechai.com';
const CAL_LINK = 'https://cal.com/mia-elianaa-a4n2hk/30min';
const FROM_NUMBER = '+18557171044';

function formatPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (!d) return null;
  return d.startsWith('1') ? `+${d}` : `+1${d}`;
}

function email(to, subject, bodyHtml, unsub) {
  if (!process.env.RESEND_API_KEY || !to) return;
  const { Resend } = require('resend');
  return new Resend(process.env.RESEND_API_KEY).emails.send({
    from: 'TMI <support@tmitechai.com>', to, subject,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5ef;-webkit-font-smoothing:antialiased;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5ef;"><tr><td align="center" style="padding:28px 14px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid #e7e8e1;border-radius:16px;overflow:hidden;"><tr><td style="background:#0a0b14;padding:18px 30px;"><span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">TMI</span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#E4FF97;margin-left:5px;"></span></td></tr><tr><td style="padding:34px 30px 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.7;">
${bodyHtml}
${unsub ? `<p style="margin:32px 0 0;font-size:11px;color:#bbb;border-top:1px solid #eee;padding-top:16px;"><a href="${unsub}" style="color:#bbb;">Unsubscribe</a></p>` : ''}
</td></tr><tr><td style="padding:6px 30px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><div style="border-top:1px solid #eceee4;margin-top:8px;padding-top:16px;font-size:12px;line-height:1.6;color:#9a9ba5;">TMI Technology &middot; chaos control for growing companies<br><a href="https://www.tmitechai.com" style="color:#6f8f2a;text-decoration:none;">tmitechai.com</a></div></td></tr></table></td></tr></table></body></html>`,
  });
}

function sms(to, body) {
  if (!to || !process.env.TWILIO_ACCOUNT_SID) return;
  const t = formatPhone(to);
  if (!t) return;
  return require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    .messages.create({ body, from: FROM_NUMBER, to: t });
}

function cta(url, label) {
  return `<p style="margin:24px 0;"><a href="${url}" style="background:#E4FF97;color:#0a0b14;font-weight:700;padding:13px 26px;border-radius:999px;text-decoration:none;display:inline-block;">${label}</a></p>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const _S = process.env.GTM_RUN_SECRET;
  if (_S && req.query && req.query.secret !== _S) return res.status(401).json({ error: 'unauthorized' });

  const b = req.body || {};
  const stage = b.stage;
  const ack = () => res.status(200).json({ ok: true }); // always ack so QStash stops retrying

  try {
    const appByEmail = async (e) => e ? db.findOne('applications', 'email', String(e).toLowerCase()).catch(() => null) : null;
    const stopped = (app) => app && (app.status === 'unsubscribed' || app.unsubscribed);

    if (stage === 'paid_no_intake') {
      // They paid but have not completed the detailed intake yet.
      const done = b.email ? await db.findOne('audit_submissions', 'email', String(b.email).toLowerCase()).catch(() => null) : null;
      if (done) return res.json({ ok: true, skipped: 'intake done' });
      const app = await appByEmail(b.email);
      if (stopped(app)) return res.json({ ok: true, skipped: 'opted out' });
      const name = (app && app.name || 'there').split(/\s+/)[0];
      const url = b.session_id ? `${SITE}/complete-audit-intake?session_id=${encodeURIComponent(b.session_id)}` : `${SITE}/complete-audit-intake`;
      const unsub = app ? `${SITE}/api/unsubscribe?id=${app.id}` : null;
      await email(b.email, 'One quick step to start your audit',
        `<p style="margin:0 0 16px;">Hey ${name},</p>
<p style="margin:0 0 16px;">Your Complete Audit is paid and ready to build. We just need your intake - about 10 to 15 minutes of detail on how your business runs. The more you give us, the sharper your audit and the more we get done on the call.</p>${cta(url, 'Finish my intake')}`, unsub);
      if (b.touch === 'second') await sms(app && app.phone, `${name} - your Complete Audit is paid and waiting on your intake (10-15 min). Finish here: ${url}`);
      return ack();
    }

    if (stage === 'delivered_no_booking') {
      // Audit delivered, no strategy call booked yet. This is the biggest leak.
      const app = await appByEmail(b.email);
      if (app && app.status === 'booked') return res.json({ ok: true, skipped: 'already booked' });
      if (stopped(app)) return res.json({ ok: true, skipped: 'opted out' });
      const name = (app && app.name || 'there').split(/\s+/)[0];
      const url = b.session_id ? `${SITE}/booking?session_id=${encodeURIComponent(b.session_id)}` : CAL_LINK;
      const unsub = app ? `${SITE}/api/unsubscribe?id=${app.id}` : null;
      await email(b.email, 'Book your strategy call',
        `<p style="margin:0 0 16px;">Hey ${name},</p>
<p style="margin:0 0 16px;">Your audit is the map. The 30-minute call with the founder and a strategist is where it gets real - we walk through it together and pick your path. It is free, so grab a time.</p>${cta(url, 'Book my strategy call')}`, unsub);
      if (b.touch === 'second') await sms(app && app.phone, `${name} - your audit is done. Last step is your free 30-min strategy call. Grab a time: ${url}`);
      return ack();
    }

    if (stage === 'proposal_no_accept') {
      const p = b.proposalId ? await db.getById('proposals', b.proposalId).catch(() => null) : null;
      if (!p) return res.json({ ok: true, skipped: 'no proposal' });
      if (p.status === 'accepted') return res.json({ ok: true, skipped: 'accepted' });
      const url = `${SITE}/build-proposal?id=${p.id}`;
      const name = (p.company || 'there');
      await email(p.client_email, 'Your build proposal is ready when you are',
        `<p style="margin:0 0 16px;">Hi,</p>
<p style="margin:0 0 16px;">Your build proposal for ${name} is ready: three ways to build it, scoped and priced from your audit. Whenever you are ready, pick the path that fits and we will kick it off.</p>${cta(url, 'View my proposal')}`,
        null);
      return ack();
    }

    if (stage === 'precall_24h' || stage === 'precall_2h' || stage === 'precall_1h' || stage === 'precall_10m') {
      const app = b.applicationId ? await db.getById('applications', b.applicationId).catch(() => null) : await appByEmail(b.email);
      if (stopped(app)) return res.json({ ok: true, skipped: 'opted out' });
      const name = (app && app.name || 'there').split(/\s+/)[0];
      const to = app && app.email;
      const unsub = app ? `${SITE}/api/unsubscribe?id=${app.id}` : null;
      if (stage === 'precall_24h') {
        await email(to, 'Your TMI strategy call is tomorrow',
          `<p style="margin:0 0 16px;">Hey ${name},</p>
<p style="margin:0 0 16px;">Quick reminder: your 30-minute strategy call with the founder is tomorrow. Have your audit handy and come with the one thing you most want off your plate. See you then.</p>`, unsub);
      } else if (stage === 'precall_1h') {
        await email(to, 'Your TMI call is in about an hour',
          `<p style="margin:0 0 16px;">Hey ${name},</p>
<p style="margin:0 0 16px;">Heads up - we're on in about an hour. Your call link is in the calendar invite and confirmation email. Talk soon.</p>`, unsub);
        await sms(app && app.phone, `${name} - your TMI strategy call is in about an hour. Link's in your calendar invite + confirmation email. Reply if you need it resent.`);
      } else if (stage === 'precall_10m') {
        await email(to, "We're starting in about 10 minutes",
          `<p style="margin:0 0 16px;">Hey ${name},</p>
<p style="margin:0 0 16px;">We're on in about 10 minutes. Grab the call link from your calendar invite or confirmation email and hop on when you're ready. Reply here if you need it and I'll sort it out.</p>`, unsub);
        await sms(app && app.phone, `${name} - we're starting in about 10 min. Call link is in your calendar invite + confirmation email. Reply if you need it.`);
      } else {
        await sms(app && app.phone, `${name} - your TMI strategy call is in about 2 hours. Talk soon.`);
      }
      return ack();
    }

    return res.status(400).json({ error: 'unknown stage' });
  } catch (e) {
    console.error('funnel-nurture:', e.message);
    return res.status(200).json({ ok: true, error: e.message });
  }
};
