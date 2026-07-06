// Cron fallback for the webinar reminder / follow-up chain.
// Runs every 15 minutes. Independent of QStash: it scans upcoming/recent
// registrations and sends any step that is due and not already sent. The
// idempotent sent_<step> guard in _webinar-mail means it never double-sends,
// even if QStash also delivered the same step.
//
// Windows (relative to session start T, duration D):
//   reminder_24h : T-24h  ..  T-1h
//   reminder_1h  : T-1h   ..  T
//   live_now     : T      ..  T+15m
//   followup_2h  : T+D+2h ..  T+D+26h

const db = require('./_db');
const W = require('./_webinar');
const { sendStep } = require('./_webinar-mail');

module.exports = async function handler(req, res) {
  const now = Date.now();
  const H = 3600000;
  const D = W.DURATION_SEC * 1000;

  let regs = [];
  try {
    // Everyone still in the reminder/follow-up window (session within the last
    // ~2 days and up to ~8 days out).
    regs = await db.list('webinar_registrations', { where: [['status', 'in', ['registered', 'attended']]] });
  } catch (e) {
    // `in` may be unsupported by the driver's first-filter path; fall back to all.
    try { regs = await db.list('webinar_registrations', {}); } catch (e2) { regs = []; }
  }

  let sent = 0, checked = 0;
  for (const reg of regs) {
    if (!reg || !reg.email || !reg.session_time) continue;
    const T = new Date(reg.session_time).getTime();
    if (isNaN(T)) continue;
    checked++;

    let step = null;
    if (now >= T - 24 * H && now < T - H) step = 'reminder_24h';
    else if (now >= T - H && now < T) step = 'reminder_1h';
    else if (now >= T && now < T + 20 * 60 * 1000) step = 'live_now';
    else if (now >= T + D + 2 * H && now < T + D + 26 * H) step = 'followup_2h';
    if (!step) continue;

    try { if (await sendStep(db, reg, step)) sent++; } catch (e) { console.error('webinar-cron:', e.message); }
  }

  return res.status(200).json({ ok: true, checked, sent });
};
