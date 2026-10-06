// Rep calendar: the calls they booked on Mia's Cal.com, their follow-ups, and
// when Mia is busy (Google Calendar free/busy, no event details).
//
//   GET  (rep)            -> { bookings, followups, mia:{ok,busy,error}, cal_url, feed_url }
//   GET  ?feed=<token>    -> text/calendar feed the rep adds to their own Google Calendar
//   GET  ?setup=1 (admin) -> { service_email, gcal_id, mia } for linking Mia's calendar
//   POST (admin) { gcal_id } -> save which Google Calendar is Mia's
const crypto = require('crypto');
const db = require('./_db');
const { cors, verifyToken } = require('./_auth');
const { verifyRep } = require('./_rep-auth');
const gcal = require('./_gcal');
const cal = require('./_cal');

const CAL_URL = 'https://cal.com/miaeliana/tmi-fit-call';
const SITE = 'https://admin.tmitechai.com';
const DAY = 864e5;

async function feedToken(repId) {
  const r = await db.getById('reps', repId).catch(() => null);
  if (r && r.cal_token) return r.cal_token;
  const t = crypto.randomBytes(18).toString('hex');
  await db.update('reps', repId, { cal_token: t });
  return t;
}

// The team's next 7 days from Cal.com: every call and audit (time, type, who
// is hosting) and open Fit Call times. Business names only on the rep's own.
async function teamDays(repId, myUids) {
  if (!cal.key()) return { ok: false, error: 'not_linked' };
  try {
    const now = Date.now();
    const startDay = new Date(now - (now % DAY)).toISOString();
    const [rows, types] = await Promise.all([
      cal.bookings(startDay, new Date(now + 7 * DAY).toISOString()),
      cal.eventTypes().catch(() => []),
    ]);
    const items = rows.map((b) => {
      const mine = myUids.has(b.uid) || (b.metadata && b.metadata.lead_id && myUids.has('lead:' + b.metadata.lead_id));
      const a = b.attendees[0] || {};
      // Cal titles often carry the attendee's name, so others' calls show the booking type only.
      const ty = types.find((t) => (b.event_type_id && t.id === b.event_type_id) || (b.event_slug && t.slug === b.event_slug));
      return { start: b.start, end: b.end, title: mine ? b.title : ((ty && ty.title) || 'Booked'), type: b.event_slug, hosts: b.hosts, mine: !!mine, who: mine ? (a.name || null) : null };
    });
    let open = null;
    // Open times for the call reps book: the Fit Call, else the discovery audit. Never Passem.
    const fit = ['tmi-fit-call', 'discovery-audit', 'in-person-audit'].map((sl) => types.find((t) => t.slug === sl)).find(Boolean)
      || types.find((t) => !/passem/i.test(t.slug || ''));
    if (fit) {
      const d = new Date();
      const days = await cal.slots(fit.id, d.toISOString().slice(0, 10), new Date(d.getTime() + 7 * DAY).toISOString().slice(0, 10)).catch(() => null);
      if (days) open = { title: fit.title, slug: fit.slug, minutes: fit.minutes, days };
    }
    return { ok: true, items, open };
  } catch (e) {
    console.error('rep-calendar team:', e.message);
    return { ok: false, error: 'cal_error' };
  }
}

async function repData(repId, days) {
  const from = new Date(Date.now() - DAY).toISOString();
  const to = new Date(Date.now() + days * DAY).toISOString();
  const bookings = ((await db.list('rep_bookings', { where: [['rep_id', '==', repId]], limit: 500 }).catch(() => [])) || [])
    .filter((b) => b.start >= from && b.start <= to)
    .sort((a, z) => String(a.start).localeCompare(String(z.start)))
    .map((b) => ({ id: b.id, uid: b.uid, lead_id: b.lead_id, start: b.start, end: b.end, status: b.status, title: b.title, business_name: b.business_name, attendee_name: b.attendee_name }));
  // Single-field range query (no composite index), then keep this rep's.
  const fromDay = new Date(Date.now() - 14 * DAY).toISOString().slice(0, 10);
  const followups = ((await db.list('rep_leads', { where: [['next_action_at', '>=', fromDay]], limit: 5000 }).catch(() => [])) || [])
    .filter((l) => l.rep_id === repId && l.next_action_at && String(l.next_action_at) <= to && !['won', 'lost', 'not_interested'].includes(l.status))
    .map((l) => ({ lead_id: l.id, date: String(l.next_action_at).slice(0, 10), business_name: l.business_name || l.contact_name || 'Lead', status: l.status, phone: l.phone || null, address: l.address || null }))
    .sort((a, z) => a.date.localeCompare(z.date));
  return { bookings, followups };
}

const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const icsTime = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function ics(name, { bookings, followups }) {
  const stamp = icsTime(new Date().toISOString());
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TMI Tech AI//City Leads//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText('TMI City Leads' + (name ? ' - ' + name : ''))}`, 'X-WR-TIMEZONE:America/Chicago', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H'];
  bookings.filter((b) => b.status !== 'cancelled').forEach((b) => {
    const end = b.end || new Date(new Date(b.start).getTime() + 30 * 60e3).toISOString();
    out.push('BEGIN:VEVENT', `UID:booking-${b.id}@tmitechai.com`, `DTSTAMP:${stamp}`, `DTSTART:${icsTime(b.start)}`, `DTEND:${icsTime(end)}`,
      `SUMMARY:${icsText('Fit Call with Mia: ' + (b.business_name || b.attendee_name || 'your lead'))}`,
      `DESCRIPTION:${icsText('Booked through City Leads. TMI sends the reminders.')}`, 'END:VEVENT');
  });
  followups.forEach((f) => {
    const d = f.date.replace(/-/g, '');
    const next = new Date(Date.parse(f.date + 'T12:00:00Z') + DAY).toISOString().slice(0, 10).replace(/-/g, '');
    out.push('BEGIN:VEVENT', `UID:followup-${f.lead_id}-${d}@tmitechai.com`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${icsText('Follow up: ' + f.business_name)}`,
      `DESCRIPTION:${icsText([f.phone, f.address, 'Open City Leads: https://cityleads.tmitechai.com'].filter(Boolean).join('\n'))}`, 'END:VEVENT');
  });
  out.push('END:VCALENDAR');
  return out.join('\r\n') + '\r\n';
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    // Calendar feed for Google Calendar / Apple Calendar. The token is the key.
    if (req.method === 'GET' && req.query.feed) {
      const rep = await db.findOne('reps', 'cal_token', String(req.query.feed)).catch(() => null);
      if (!rep) return res.status(404).send('Not found');
      const data = await repData(rep.id, 120);
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Cache-Control', 'private, max-age=900');
      return res.status(200).send(ics(String(rep.name || '').split(' ')[0], data));
    }

    const admin = verifyToken(req);
    if (admin && req.method === 'POST') {
      const id = String((req.body && req.body.gcal_id) || '').trim();
      if (id && !/^[^\s@]+@[^\s@]+$/.test(id)) return res.status(400).json({ error: 'That does not look like a calendar id (it looks like an email)' });
      await db.update('settings', 'calendar', { gcal_id: id || null, updated_at: new Date().toISOString() });
      const now = new Date();
      return res.json({ ok: true, gcal_id: id || null, mia: id ? await gcal.busy(now.toISOString(), new Date(now.getTime() + 7 * DAY).toISOString()) : null });
    }
    if (admin && req.method === 'GET' && req.query.setup) {
      const now = new Date();
      const since = new Date(now.getTime() - DAY).toISOString();
      const [reps, rows] = await Promise.all([
        db.list('reps', { limit: 200 }).catch(() => []),
        db.list('rep_bookings', { where: [['start', '>=', since]], limit: 300 }).catch(() => []),
      ]);
      const repName = {}; (reps || []).forEach((r) => { repName[r.id] = r.name; });
      const bookings = (rows || []).sort((a, z) => String(a.start).localeCompare(String(z.start)))
        .map((b) => ({ start: b.start, status: b.status, business_name: b.business_name, attendee_name: b.attendee_name, rep: repName[b.rep_id] || null }));
      return res.json({ service_email: gcal.serviceEmail(), gcal_id: await gcal.calendarId(), mia: await gcal.busy(now.toISOString(), new Date(now.getTime() + 7 * DAY).toISOString()), bookings });
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
    const rep = await verifyRep(req);
    if (!rep) return res.status(401).json({ error: 'Sign in required' });
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 60);
    const now = new Date();
    const dayStart = new Date(now.getTime() - (now.getTime() % DAY)).toISOString();
    const [data, mia, token] = await Promise.all([
      repData(rep.sub, days),
      gcal.busy(dayStart, new Date(now.getTime() + 7 * DAY).toISOString()),
      feedToken(rep.sub),
    ]);
    const myUids = new Set();
    data.bookings.forEach((b) => { if (b.uid) myUids.add(b.uid); });
    (await db.list('rep_bookings', { where: [['rep_id', '==', rep.sub]], limit: 500 }).catch(() => [])).forEach((b) => { if (b.uid) myUids.add(b.uid); if (b.lead_id) myUids.add('lead:' + b.lead_id); });
    const team = await teamDays(rep.sub, myUids);
    return res.json(Object.assign(data, { mia, team, cal_url: CAL_URL, feed_url: `${SITE}/api/rep-calendar?feed=${token}` }));
  } catch (e) {
    console.error('rep-calendar:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
