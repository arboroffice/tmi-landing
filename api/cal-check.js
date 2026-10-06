// Temporary setup check for the Cal.com hookup: what the key can see (booking
// types, team members, how many bookings per host). No attendee details.
// Locked to a one-time key; delete this file once the calendar is confirmed.
const crypto = require('crypto');
const cal = require('./_cal');

const LOCK = '5e31864fdeafd7521260802518f47eceba8b1d3acad7670ce745737fe2a92e4b';

module.exports = async (req, res) => {
  const k = crypto.createHash('sha256').update(String(req.query.k || '')).digest('hex');
  if (k !== LOCK) return res.status(404).end();
  if (!cal.key()) return res.json({ ok: false, error: 'CAL_API_KEY is not set on this deploy' });
  const out = { ok: true };
  try { const m = await cal.me(); out.me = { username: m.username, name: m.name, timeZone: m.timeZone }; } catch (e) { out.me_error = e.message; }
  try { out.event_types = await cal.eventTypes(); } catch (e) { out.event_types_error = e.message; }
  try {
    const r = await fetch('https://api.cal.com/v2/event-types?username=miaeliana&eventSlug=discovery-audit', { headers: { Authorization: 'Bearer ' + cal.key(), 'cal-api-version': '2024-06-14' } });
    const d = await r.json().catch(() => ({}));
    out.discovery_audit_lookup = { status: r.status, found: JSON.stringify(d).slice(0, 400) };
  } catch (e) { out.discovery_audit_error = e.message; }
  try { out.team = await cal.teamMembers(); } catch (e) { out.team_error = e.message; }
  try {
    const now = Date.now();
    const rows = await cal.bookings(new Date(now - 864e5).toISOString(), new Date(now + 21 * 864e5).toISOString());
    const by = {};
    rows.forEach((b) => { const k2 = (b.hosts.join(' + ') || 'unknown host') + ' | ' + (b.event_slug || b.title); by[k2] = (by[k2] || 0) + 1; });
    out.bookings_next_21_days = rows.length; out.by_host_and_type = by;
  } catch (e) { out.bookings_error = e.message; }
  try {
    const et = (out.event_types || []).find((e) => e.slug === 'discovery-audit') || (out.event_types || []).find((e) => e.slug === 'in-person-audit');
    if (et) { const d = new Date(); const s = await cal.slots(et.id, d.toISOString().slice(0, 10), new Date(d.getTime() + 7 * 864e5).toISOString().slice(0, 10)); out.slots_for = et.slug; out.open_days = Object.fromEntries(Object.entries(s).map(([k3, v]) => [k3, v.length])); }
  } catch (e) { out.slots_error = e.message; }
  return res.json(out);
};
