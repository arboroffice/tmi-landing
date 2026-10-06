// Read Mia's Google Calendar busy times (free/busy only, never event details)
// with the same service account the database uses. One-time setup in Google
// Calendar: Settings > Share with specific people > add the service account
// email with "See only free/busy". The calendar id lives in settings/calendar.
const jwt = require('jsonwebtoken');
const db = require('./_db');

let cached = null; // { token, exp }

function account() {
  try { return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || ''); } catch { return null; }
}

function serviceEmail() { const sa = account(); return (sa && sa.client_email) || null; }

async function token() {
  if (cached && cached.exp > Date.now() + 60e3) return cached.token;
  const sa = account();
  if (!sa || !sa.private_key) throw new Error('No service account');
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/calendar.freebusy',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }, sa.private_key, { algorithm: 'RS256' });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error('Google sign-in failed: ' + (d.error_description || d.error || r.status));
  cached = { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return cached.token;
}

async function calendarId() {
  const s = await db.getById('settings', 'calendar').catch(() => null);
  return (s && s.gcal_id) || process.env.MIA_GCAL_ID || null;
}

// -> { ok, busy:[{start,end}], error? }
async function busy(timeMin, timeMax) {
  const id = await calendarId();
  if (!id) return { ok: false, busy: [], error: 'not_linked' };
  try {
    const r = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + (await token()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeMin, timeMax, timeZone: 'America/Chicago', items: [{ id }] }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, busy: [], error: (d.error && d.error.message) || 'google ' + r.status };
    const cal = (d.calendars || {})[id] || {};
    if (cal.errors && cal.errors.length) return { ok: false, busy: [], error: cal.errors[0].reason === 'notFound' ? 'not_shared' : cal.errors[0].reason };
    return { ok: true, busy: (cal.busy || []).map((b) => ({ start: b.start, end: b.end })) };
  } catch (e) {
    return { ok: false, busy: [], error: e.message };
  }
}

module.exports = { busy, serviceEmail, calendarId };
