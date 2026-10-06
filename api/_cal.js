// Cal.com (API v2) with CAL_API_KEY: who is on the calendar (Mia, Tyler and any
// team hosts), every upcoming call and audit, and open times per booking type.
// Cal.com already checks each host's Google Calendar, so this is the one source
// for "what does the team's day look like".
const BASE = 'https://api.cal.com/v2';
const V = { bookings: '2024-08-13', eventTypes: '2024-06-14', slots: '2024-09-04' };
const memo = new Map(); // key -> { at, val }

function key() { return process.env.CAL_API_KEY || process.env.CALCOM_API_KEY || ''; }

async function get(path, version, ttlMs = 120e3) {
  const k = path + '|' + version;
  const hit = memo.get(k);
  if (hit && Date.now() - hit.at < ttlMs) return hit.val;
  const h = { Authorization: 'Bearer ' + key() };
  if (version) h['cal-api-version'] = version;
  const r = await fetch(BASE + path, { headers: h });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`cal ${r.status}: ${(d.error && (d.error.message || d.error.code)) || d.message || ''}`.trim());
  memo.set(k, { at: Date.now(), val: d });
  return d;
}

const arr = (d) => (Array.isArray(d) ? d : Array.isArray(d && d.data) ? d.data : (d && d.data && Array.isArray(d.data.eventTypes)) ? d.data.eventTypes : []);

async function me() { const d = await get('/me', null, 600e3); return d.data || d; }

// Own event types plus team event types.
async function eventTypes() {
  const out = [];
  try { arr(await get('/event-types', V.eventTypes, 600e3)).forEach((e) => out.push({ id: e.id, slug: e.slug, title: e.title, minutes: e.lengthInMinutes || e.length, team: null })); } catch (e) { /* keep going */ }
  try {
    const teams = arr(await get('/teams', null, 600e3));
    for (const t of teams.slice(0, 5)) {
      try { arr(await get(`/teams/${t.id}/event-types`, V.eventTypes, 600e3)).forEach((e) => out.push({ id: e.id, slug: e.slug, title: e.title, minutes: e.lengthInMinutes || e.length, team: t.name || t.slug })); } catch (e) { /* skip */ }
    }
  } catch (e) { /* no teams */ }
  return out;
}

async function teamMembers() {
  const out = [];
  try {
    const teams = arr(await get('/teams', null, 600e3));
    for (const t of teams.slice(0, 5)) {
      try { arr(await get(`/teams/${t.id}/memberships`, null, 600e3)).forEach((m) => out.push({ team: t.name || t.slug, name: (m.user && (m.user.name || m.user.username)) || m.name || null, username: (m.user && m.user.username) || null, role: m.role || null })); } catch (e) { /* skip */ }
    }
  } catch (e) { /* none */ }
  return out;
}

// Upcoming (and today's) bookings in a window, newest Cal shape normalized.
async function bookings(fromIso, toIso) {
  const q = new URLSearchParams({ afterStart: fromIso, beforeEnd: toIso, take: '100', sortStart: 'asc' });
  const rows = arr(await get('/bookings?' + q.toString(), V.bookings, 60e3));
  return rows.map((b) => ({
    uid: b.uid, title: b.title || (b.eventType && b.eventType.slug) || 'Call',
    start: b.start || b.startTime, end: b.end || b.endTime,
    status: String(b.status || '').toLowerCase(),
    event_slug: (b.eventType && b.eventType.slug) || null, event_type_id: b.eventTypeId || (b.eventType && b.eventType.id) || null,
    hosts: (b.hosts || (b.user ? [b.user] : [])).map((h) => h.name || h.username || h.email).filter(Boolean),
    attendees: (b.attendees || []).map((a) => ({ name: a.name || null, email: a.email ? String(a.email).toLowerCase() : null })),
    metadata: b.metadata || {},
  })).filter((b) => b.start && !['cancelled', 'rejected'].includes(b.status));
}

// Open start times per day for one booking type.
async function slots(eventTypeId, fromDay, toDay) {
  const q = new URLSearchParams({ eventTypeId: String(eventTypeId), start: fromDay, end: toDay, timeZone: 'America/Chicago' });
  const d = await get('/slots?' + q.toString(), V.slots, 120e3);
  const days = (d && d.data && (d.data.slots || d.data)) || {};
  const out = {};
  Object.keys(days).forEach((day) => { const list = Array.isArray(days[day]) ? days[day] : []; out[day] = list.map((s) => s.start || s.time || s).filter((x) => typeof x === 'string'); });
  return out;
}

module.exports = { key, me, eventTypes, teamMembers, bookings, slots };
