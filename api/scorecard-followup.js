// Abandonment follow-up for the Intelligent Company Scorecard. Runs on a Vercel
// cron (see vercel.json). Finds sessions that were started but not completed,
// waited long enough, and have not been followed up yet, then emails the
// prospect (and texts them if they opted in) a link to pick up where they left
// off. Idempotent: the follow_up_sent flag guarantees one send per session.

const db = require('./_db');

const FROM_NUMBER = '+18557171044';
const SITE = 'https://www.tmitechai.com';

// Best-effort E.164 normalization for US numbers; returns null if unsure so we
// simply skip the text rather than send Twilio a bad number.
function toE164(p) {
  if (!p) return null;
  const s = String(p).trim();
  if (s.startsWith('+')) return s.replace(/[^\d+]/g, '');
  const d = s.replace(/[^\d]/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return null;
}

module.exports = async function handler(req, res) {
  const now = Date.now();
  const MIN = 60000;
  const AFTER = 30 * MIN;                 // wait 30 min after last activity
  const MAX_AGE = 14 * 24 * 60 * MIN;     // ignore sessions older than 14 days

  let sessions = [];
  try {
    sessions = await db.list('scorecard_sessions', { where: [['completed', '==', false]] });
  } catch (e) {
    try { sessions = await db.list('scorecard_sessions', {}); } catch (e2) { sessions = []; }
  }

  let checked = 0, sent = 0;
  for (const s of sessions) {
    if (!s || s.completed || s.follow_up_sent) continue;
    if (!s.email) continue;
    const answered = s.answered || (Array.isArray(s.answers) ? s.answers.filter(Boolean).length : 0);
    if (answered < 1) continue;                       // never actually started answering
    const last = new Date(s.updated_at || s.started_at || s.created_at || 0).getTime();
    if (isNaN(last) || now - last < AFTER || now - last > MAX_AGE) continue;

    checked++;
    const sid = s.session_id || s.id;
    const link = SITE + '/intelligence-scorecard?s=' + encodeURIComponent(sid);
    const first = ((s.name || '').split(' ')[0]) || 'there';

    // 1) Email the prospect (best-effort)
    if (process.env.RESEND_API_KEY) {
      try {
        const { Resend } = require('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: 'TMI <support@tmitechai.com>',
          to: s.email,
          subject: 'Your Intelligent Company Scorecard is waiting',
          text: `Hi ${first},\n\nYou started the Intelligent Company Scorecard but did not finish. It takes about two more minutes, and you will see what level your business runs at today plus the one gap costing you the most.\n\nPick up where you left off:\n${link}\n\nTMI`,
        });
      } catch (e) { console.error('scorecard-followup email:', e.message); }
    }

    // 2) Text the prospect (only with consent + a usable number)
    const to = s.sms_consent ? toE164(s.phone) : null;
    if (to && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        const sms = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await sms.messages.create({
          body: `Hi ${first}, you started the TMI Intelligent Company Scorecard but did not finish. Pick up where you left off: ${link}\nReply STOP to opt out.`,
          from: FROM_NUMBER, to,
        });
      } catch (e) { console.error('scorecard-followup sms:', e.message); }
    }

    try {
      await db.update('scorecard_sessions', sid, {
        follow_up_sent: true, follow_up_at: new Date().toISOString(),
      });
    } catch (e) { console.error('scorecard-followup mark:', e.message); }

    sent++;
    if (sent >= 50) break;   // cap per run
  }

  res.status(200).json({ ok: true, checked, sent });
};
