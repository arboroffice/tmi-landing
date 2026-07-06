// QStash consumer for the webinar reminder / follow-up chain.
// Steps: reminder_24h, reminder_1h, live_now, followup_2h.
// followup_2h branches: attended -> "book your audit"; no-show -> replay link.
// Verifies the QStash signature, then sends one email per step (best-effort).

const db = require('./_db');
const W = require('./_webinar');

function emailWrap(body, unsubUrl) {
  return `<!DOCTYPE html><html><body style="background:#fff;font-family:Arial,Helvetica,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:40px 24px;line-height:1.7;">
${body}
${unsubUrl ? `<p style="margin:40px 0 0;font-size:11px;color:#bbb;border-top:1px solid #eee;padding-top:16px;"><a href="${unsubUrl}" style="color:#bbb;">Unsubscribe</a></p>` : ''}
</body></html>`;
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const raw = await getRawBody(req);

  // Verify the request came from QStash (skip only if keys are unset).
  if (process.env.QSTASH_CURRENT_SIGNING_KEY) {
    try {
      const { Receiver } = require('@upstash/qstash');
      const receiver = new Receiver({
        currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
        nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
      });
      await receiver.verify({ signature: req.headers['upstash-signature'], body: raw });
    } catch {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  let payload = {};
  try { payload = JSON.parse(raw); } catch { return res.status(400).end(); }
  const { regId, step } = payload;

  const reg = await db.getById('webinar_registrations', regId).catch(() => null);
  if (!reg || !reg.email) return res.status(200).json({ ok: true, skipped: 'no-reg' });

  const first = (reg.name || 'there').split(/\s+/)[0];
  const session = new Date(reg.session_time);
  const when = reg.when || W.fmtChicago(session);
  const joinUrl = `${W.SITE}/watch?s=${encodeURIComponent(reg.session_time)}&t=${reg.token}`;
  const replayUrl = `${W.SITE}/watch?mode=ondemand`;
  const auditUrl = `${W.SITE}/audit`;
  const unsub = `${W.SITE}/api/unsubscribe?email=${encodeURIComponent(reg.email)}`;

  let subject = '', html = '';
  if (step === 'reminder_24h') {
    subject = `Tomorrow: ${W.EVENT_NAME}`;
    html = `<p>Hey ${first},</p><p>Quick reminder — <b>${W.EVENT_NAME}</b> is tomorrow, <b>${when}</b>.</p><p>Come ready to find out which of the three systems is leaking the most time and money in your operation. Forty minutes, no fluff.</p><p><a href="${joinUrl}" style="display:inline-block;background:#0a0b14;color:#E4FF97;font-weight:700;padding:13px 26px;border-radius:10px;text-decoration:none;">Your join link &rarr;</a></p><p>— The TMI team</p>`;
  } else if (step === 'reminder_1h') {
    subject = `Starting in 1 hour: ${W.EVENT_NAME}`;
    html = `<p>Hey ${first},</p><p>We go live in about an hour (<b>${when}</b>). Grab a coffee and a notepad.</p><p><a href="${joinUrl}" style="display:inline-block;background:#0a0b14;color:#E4FF97;font-weight:700;padding:13px 26px;border-radius:10px;text-decoration:none;">Join the room &rarr;</a></p><p>— The TMI team</p>`;
  } else if (step === 'live_now') {
    subject = `We're live now — ${W.EVENT_NAME}`;
    html = `<p>Hey ${first},</p><p>We're starting right now. Jump in.</p><p><a href="${joinUrl}" style="display:inline-block;background:#E4FF97;color:#0a0b14;font-weight:800;padding:14px 30px;border-radius:10px;text-decoration:none;">Join live &rarr;</a></p><p>— The TMI team</p>`;
  } else if (step === 'followup_2h') {
    if (reg.attended) {
      subject = `Your next step after the masterclass`;
      html = `<p>Hey ${first},</p><p>Thanks for spending 40 minutes with us. You've seen the framework — the three systems that let a company run without the owner in the middle of everything.</p><p>The fastest way to find out exactly where yours is leaking is the free Business Intelligence Audit. We map your operation and hand you a 30-day plan. No pitch.</p><p><a href="${auditUrl}" style="display:inline-block;background:#0a0b14;color:#E4FF97;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;">Book your free audit &rarr;</a></p><p>— The TMI team</p>`;
    } else {
      subject = `You missed it — here's the replay`;
      html = `<p>Hey ${first},</p><p>Looks like ${when} didn't work out. No problem — you can watch the full masterclass on demand right now:</p><p><a href="${replayUrl}" style="display:inline-block;background:#0a0b14;color:#E4FF97;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;">Watch the replay &rarr;</a></p><p>It's the same 40 minutes on the system that removes the owner as the bottleneck. Worth the time.</p><p>— The TMI team</p>`;
    }
  } else {
    return res.status(200).json({ ok: true, skipped: 'unknown-step' });
  }

  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({ from: 'TMI <support@tmitechai.com>', to: reg.email, subject, html: emailWrap(html, unsub) });
    } catch (e) { console.error('webinar-nurture email:', e.message); }
  }

  try { await db.update('webinar_registrations', regId, { [`sent_${step}`]: new Date().toISOString() }); } catch {}
  return res.status(200).json({ ok: true, step });
}

module.exports = handler;
