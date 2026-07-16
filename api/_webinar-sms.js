// Shared step-SMS logic for the weekly class, mirroring _webinar-mail.
// Same idempotent sent_<step> guard, same attended/not-booked gate on the
// nurture nudge. Used by the QStash consumer (webinar-nurture) and the cron
// fallback (webinar-cron). Best-effort: a Twilio failure never blocks anything.

const W = require('./_webinar');
const { hasBooked } = require('./_webinar-mail');

const FROM_NUMBER = '+18557171044';

function formatPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return null;
  return d.startsWith('1') ? `+${d}` : `+1${d}`;
}

function whenShort(session) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: W.TZ, weekday: 'short', month: 'short', day: 'numeric' }).format(session) + ', 3pm CT';
  } catch (_) { return 'Tue, 3pm CT'; }
}

// SMS steps that only make sense for attendees who have not already booked.
const NURTURE_SMS = ['sms_nudge'];

// Build the text for a step, or null for an unknown step.
function buildStepSms(reg, step) {
  const first = (reg.name || 'there').split(/\s+/)[0];
  const session = new Date(reg.session_time);
  const join = `${W.SITE}/watch?s=${encodeURIComponent(reg.session_time)}&t=${reg.token}`;

  switch (step) {
    case 'sms_confirm':
      return `TMI: You're registered for How to Build an Intelligent Company, ${whenShort(session)}. We'll text your join link before we start. Reply STOP to opt out.`;
    case 'sms_24h':
      return `TMI: Your free class is tomorrow at 3pm CT, How to Build an Intelligent Company. 40 min, live. We'll send your join link an hour before. See you there, ${first}.`;
    case 'sms_dayof':
      return `TMI: Today's the class, 3pm CT, 40 min live. Bring the one thing in your business you most want off your plate. Join link comes at 2pm.`;
    case 'sms_1h':
      return `TMI: We go live in 1 hour (3pm CT). Here's your room: ${join}`;
    case 'sms_live':
      return `TMI: We're live now. Jump in: ${join}`;
    case 'sms_after':
      return reg.attended
        ? `TMI: Thanks for being on the class, ${first}. Want us to find where your operation is leaking? Book a free call: ${W.SITE}/book, or text a question right here.`
        : `TMI: Missed you on the class today. We run it live every Tuesday at 3pm CT, grab the next seat: ${W.SITE}/webinar`;
    case 'sms_nudge':
      return `TMI: ${first}, the free call is the fast way to see your three systems mapped and a number on the biggest leak. 20 min: ${W.SITE}/book`;
    default:
      return null;
  }
}

// Send one SMS step for a registration, idempotently. Returns true if it sent.
async function sendStepSms(db, reg, step) {
  if (!reg || !reg.phone || reg[`sent_${step}`]) return false;
  if (reg.sms_opt_out) return false;
  if (NURTURE_SMS.includes(step)) {
    if (!reg.attended) return false;
    if (await hasBooked(db, reg.email)) return false;
  }
  const to = formatPhone(reg.phone);
  if (!to) return false;
  const body = buildStepSms(reg, step);
  if (!body) return false;

  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const sms = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await sms.messages.create({ body, from: FROM_NUMBER, to });
    } catch (e) { console.error(`webinar sms ${step}:`, e.message); return false; }
  }
  try { await db.update('webinar_registrations', reg.id, { [`sent_${step}`]: new Date().toISOString() }); } catch (_) {}
  return true;
}

module.exports = { buildStepSms, sendStepSms, formatPhone, NURTURE_SMS };
