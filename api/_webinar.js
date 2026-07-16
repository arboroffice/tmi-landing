// Shared helpers for the weekly live class.
// One appointment, every week: Tuesday 3:00 PM America/Chicago (CST/CDT).
// The team shows up live every week, so the copy is live-weekly, not evergreen.

const TZ = 'America/Chicago';
const SESSION_WEEKDAY = 2; // Sun=0 ... Tue=2
const SESSION_HOUR = 15; // 3:00 PM local
const SESSION_MIN = 0;
const DURATION_SEC = 40 * 60; // 40-minute masterclass
const SITE = 'https://www.tmitechai.com';
const EVENT_NAME = 'How to Build an Intelligent Company';

// Absolute instant (Date) for a wall-clock time in a named timezone, DST-safe.
function zonedToUtc(y, mo, d, h, mi, tz) {
  const asUTC = Date.UTC(y, mo - 1, d, h, mi, 0);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  dtf.formatToParts(new Date(asUTC)).forEach(x => { p[x.type] = x.value; });
  let hr = +p.hour; if (hr === 24) hr = 0;
  const asTZ = Date.UTC(+p.year, p.month - 1, +p.day, hr, +p.minute, +p.second);
  return new Date(asUTC - (asTZ - asUTC));
}

// Chicago calendar parts for a given instant.
function chicagoParts(date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  const p = {};
  dtf.formatToParts(date).forEach(x => { p[x.type] = x.value; });
  const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let hr = +p.hour; if (hr === 24) hr = 0;
  return { y: +p.year, mo: +p.month, d: +p.day, wd: wdMap[p.weekday], h: hr, mi: +p.minute };
}

// Next upcoming Tuesday 3:00 PM Chicago as an absolute Date (from `from`).
function nextSession(from) {
  const now = from || new Date();
  const c = chicagoParts(now);
  let add = (SESSION_WEEKDAY - c.wd + 7) % 7;
  if (add === 0 && (c.h > SESSION_HOUR || (c.h === SESSION_HOUR && c.mi >= SESSION_MIN))) add = 7;
  // advance the Chicago calendar date by `add` days
  const base = Date.UTC(c.y, c.mo - 1, c.d) + add * 86400000;
  const b = new Date(base);
  return zonedToUtc(b.getUTCFullYear(), b.getUTCMonth() + 1, b.getUTCDate(), SESSION_HOUR, SESSION_MIN, TZ);
}

// Given a session instant, is `now` before / during / after the live window?
function sessionState(sessionMs, now) {
  const t = (now || Date.now());
  if (t < sessionMs) return 'pre';
  if (t < sessionMs + DURATION_SEC * 1000) return 'live';
  return 'ended';
}

function fmtChicago(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(date);
}

// UTC stamp for .ics (YYYYMMDDTHHMMSSZ).
function icsStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

module.exports = {
  TZ, SESSION_WEEKDAY, SESSION_HOUR, SESSION_MIN, DURATION_SEC, SITE, EVENT_NAME,
  zonedToUtc, chicagoParts, nextSession, sessionState, fmtChicago, icsStamp,
};
