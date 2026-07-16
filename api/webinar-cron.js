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
const { sendStepSms } = require('./_webinar-sms');

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

    // A single reg can be due for at most one step per run (windows are
    // disjoint). Nurture steps are additionally gated inside sendStep to
    // attendees who have not booked, so listing them here is safe.
    const steps = [];
    if (now >= T - 24 * H && now < T - H) steps.push('reminder_24h');
    else if (now >= T - H && now < T) steps.push('reminder_1h');
    else if (now >= T && now < T + 20 * 60 * 1000) steps.push('live_now');
    else if (now >= T + D + 2 * H && now < T + D + 26 * H) steps.push('followup_2h');
    else if (now >= T + 24 * H && now < T + 2 * 24 * H) steps.push('nurture_1d');
    else if (now >= T + 3 * 24 * H && now < T + 4 * 24 * H) steps.push('nurture_3d');
    else if (now >= T + 6 * 24 * H && now < T + 7 * 24 * H) steps.push('lastcall_6d');
    if (!steps.length) continue;

    for (const step of steps) {
      try { if (await sendStep(db, reg, step)) sent++; } catch (e) { console.error('webinar-cron:', e.message); }
    }

    // Parallel SMS track (own disjoint windows; gated to phone/attended in sendStepSms).
    if (reg.phone) {
      let smsStep = null;
      if (now >= T - 24 * H && now < T - 7 * H) smsStep = 'sms_24h';
      else if (now >= T - 6 * H && now < T - 2 * H) smsStep = 'sms_dayof';
      else if (now >= T - H && now < T) smsStep = 'sms_1h';
      else if (now >= T && now < T + 20 * 60 * 1000) smsStep = 'sms_live';
      else if (now >= T + D + 2 * H && now < T + D + 26 * H) smsStep = 'sms_after';
      else if (now >= T + 2 * 24 * H && now < T + 3 * 24 * H) smsStep = 'sms_nudge';
      if (smsStep) {
        try { if (await sendStepSms(db, reg, smsStep)) sent++; } catch (e) { console.error('webinar-cron sms:', e.message); }
      }
    }
  }

  return res.status(200).json({ ok: true, checked, sent });
};
