// Shared step-email logic for the webinar reminder / follow-up chain.
// Used by both the QStash consumer (webinar-nurture) and the cron fallback
// (webinar-cron) so there is one source of truth for the copy and the
// idempotent "already sent" guard.

const W = require('./_webinar');

function emailWrap(body, unsubUrl) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5ef;-webkit-font-smoothing:antialiased;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5ef;"><tr><td align="center" style="padding:28px 14px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid #e7e8e1;border-radius:16px;overflow:hidden;"><tr><td style="background:#0a0b14;padding:18px 30px;"><span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">TMI</span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#E4FF97;margin-left:5px;"></span></td></tr><tr><td style="padding:34px 30px 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.7;">
${body}
${unsubUrl ? `<p style="margin:40px 0 0;font-size:11px;color:#bbb;border-top:1px solid #eee;padding-top:16px;"><a href="${unsubUrl}" style="color:#bbb;">Unsubscribe</a></p>` : ''}
</td></tr><tr><td style="padding:6px 30px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><div style="border-top:1px solid #eceee4;margin-top:8px;padding-top:16px;font-size:12px;line-height:1.6;color:#9a9ba5;">TMI Technology &middot; chaos control for growing companies<br><a href="https://www.tmitechai.com" style="color:#6f8f2a;text-decoration:none;">tmitechai.com</a></div></td></tr></table></td></tr></table></body></html>`;
}

// Pure: build the {subject, html} for a step, or null for an unknown step.
function buildStepEmail(reg, step) {
  const first = (reg.name || 'there').split(/\s+/)[0];
  const session = new Date(reg.session_time);
  const when = reg.when || W.fmtChicago(session);
  const joinUrl = `${W.SITE}/watch?s=${encodeURIComponent(reg.session_time)}&t=${reg.token}`;
  const replayUrl = `${W.SITE}/watch?mode=ondemand`;
  const auditUrl = `${W.SITE}/audit`;
  const unsub = `${W.SITE}/api/unsubscribe?email=${encodeURIComponent(reg.email)}`;
  const btn = (href, label, dark) =>
    `<a href="${href}" style="display:inline-block;background:${dark ? '#0a0b14' : '#E4FF97'};color:${dark ? '#E4FF97' : '#0a0b14'};font-weight:800;padding:14px 28px;border-radius:10px;text-decoration:none;">${label}</a>`;

  let subject = '', body = '';
  if (step === 'reminder_24h') {
    subject = `Tomorrow: ${W.EVENT_NAME}`;
    body = `<p>Hey ${first},</p><p>Quick reminder — <b>${W.EVENT_NAME}</b> is tomorrow, <b>${when}</b>.</p><p>Come ready to find out which of the three systems is leaking the most time and money in your operation. Forty minutes, no fluff.</p><p>${btn(joinUrl, 'Your join link →', true)}</p><p>— The TMI team</p>`;
  } else if (step === 'reminder_1h') {
    subject = `Starting in 1 hour: ${W.EVENT_NAME}`;
    body = `<p>Hey ${first},</p><p>We go live in about an hour (<b>${when}</b>). Grab a coffee and a notepad.</p><p>${btn(joinUrl, 'Join the room →', true)}</p><p>— The TMI team</p>`;
  } else if (step === 'live_now') {
    subject = `We're live now — ${W.EVENT_NAME}`;
    body = `<p>Hey ${first},</p><p>We're starting right now. Jump in.</p><p>${btn(joinUrl, 'Join live →', false)}</p><p>— The TMI team</p>`;
  } else if (step === 'followup_2h') {
    if (reg.attended) {
      subject = `Your next step after the class`;
      body = `<p>Hey ${first},</p><p>Thanks for spending 40 minutes with us. You've seen the framework — the three systems that let a company run without the owner in the middle of everything.</p><p>The fastest way to find out exactly where yours is leaking is the free Business Intelligence Audit. We map your operation and hand you a 30-day plan. No pitch.</p><p>${btn(auditUrl, 'Book your free audit →', true)}</p><p>— The TMI team</p>`;
    } else {
      subject = `You missed it — grab the next session`;
      body = `<p>Hey ${first},</p><p>Looks like ${when} didn't work out. No problem — we run it live every week. Grab your spot for the next one:</p><p>${btn(W.SITE + '/webinar', 'Save my spot →', true)}</p><p>It's 40 minutes on the system that removes the owner as the bottleneck. Worth the time.</p><p>— The TMI team</p>`;
    }
  } else {
    return null;
  }
  return { subject, html: emailWrap(body, unsub) };
}

// Send one step for a registration, idempotently. Returns true if it sent.
async function sendStep(db, reg, step) {
  if (!reg || !reg.email || reg[`sent_${step}`]) return false;
  const built = buildStepEmail(reg, step);
  if (!built) return false;

  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({ from: 'TMI <support@tmitechai.com>', to: reg.email, subject: built.subject, html: built.html });
    } catch (e) { console.error(`webinar sendStep ${step}:`, e.message); return false; }
  }
  try { await db.update('webinar_registrations', reg.id, { [`sent_${step}`]: new Date().toISOString() }); } catch (e) {}
  return true;
}

module.exports = { buildStepEmail, sendStep, emailWrap };
