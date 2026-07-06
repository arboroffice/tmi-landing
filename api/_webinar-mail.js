// Shared step-email logic for the webinar reminder / follow-up chain.
// Used by both the QStash consumer (webinar-nurture) and the cron fallback
// (webinar-cron) so there is one source of truth for the copy and the
// idempotent "already sent" guard.

const W = require('./_webinar');

function emailWrap(body, unsubUrl) {
  return `<!DOCTYPE html><html><body style="background:#fff;font-family:Arial,Helvetica,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:40px 24px;line-height:1.7;">
${body}
${unsubUrl ? `<p style="margin:40px 0 0;font-size:11px;color:#bbb;border-top:1px solid #eee;padding-top:16px;"><a href="${unsubUrl}" style="color:#bbb;">Unsubscribe</a></p>` : ''}
</body></html>`;
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
      subject = `Your next step after the masterclass`;
      body = `<p>Hey ${first},</p><p>Thanks for spending 40 minutes with us. You've seen the framework — the three systems that let a company run without the owner in the middle of everything.</p><p>The fastest way to find out exactly where yours is leaking is the free Business Intelligence Audit. We map your operation and hand you a 30-day plan. No pitch.</p><p>${btn(auditUrl, 'Book your free audit →', true)}</p><p>— The TMI team</p>`;
    } else {
      subject = `You missed it — here's the replay`;
      body = `<p>Hey ${first},</p><p>Looks like ${when} didn't work out. No problem — you can watch the full masterclass on demand right now:</p><p>${btn(replayUrl, 'Watch the replay →', true)}</p><p>It's the same 40 minutes on the system that removes the owner as the bottleneck. Worth the time.</p><p>— The TMI team</p>`;
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
