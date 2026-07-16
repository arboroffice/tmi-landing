// Admin oversight of the weekly live class (How to Build an Intelligent Company).
//   GET -> { stats, upcoming, sessions, registrations, questions, broadcast }
// Auth required. Read-only. Everything is best-effort so one failed lookup
// never blanks the whole dashboard.

const db = require('./_db');
const W = require('./_webinar');
const { cors, requireAuth } = require('./_auth');
const { ytId } = require('./webinar-live');

const lc = (s) => (s || '').toLowerCase();

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  // Set this week's live stream link. Stamped with the upcoming session so the
  // dashboard can tell whether it is set for the right Tuesday.
  if (req.method === 'POST') {
    const url = ((req.body && req.body.live_url) || '').trim();
    const upcoming = W.nextSession().toISOString();
    try {
      await db.upsertByField('webinar_config', 'key', 'live', {
        key: 'live', live_url: url, session_time: upcoming, updated_at: new Date().toISOString(),
      });
    } catch (e) {
      return res.status(500).json({ error: 'could not save' });
    }
    return res.json({ ok: true, live_url: url, yt_id: ytId(url), session_time: upcoming });
  }

  try {
    // All registrations (bounded). Small volume; fine to pull and reduce in JS.
    let regs = [];
    try { regs = await db.list('webinar_registrations', { order: 'created_at', ascending: false, limit: 3000 }); } catch (_) { regs = []; }
    regs = regs || [];

    // Booked-email set from applications + leads, so we can flag attendees who
    // have since booked a call without N per-row lookups.
    const booked = new Set();
    try {
      const apps = await db.list('applications', { limit: 5000 });
      (apps || []).forEach((a) => { if (a && a.email && (a.status === 'booked' || a.booked_at)) booked.add(lc(a.email)); });
    } catch (_) {}
    try {
      const leads = await db.list('leads', { limit: 5000 });
      (leads || []).forEach((l) => { if (l && l.email && (l.status === 'booked' || l.booked_at)) booked.add(lc(l.email)); });
    } catch (_) {}

    const now = Date.now();
    const attended = regs.filter((r) => r.attended);
    const total = regs.length;
    const showRate = total ? Math.round((attended.length / total) * 100) : 0;
    const bookedAfter = attended.filter((r) => booked.has(lc(r.email))).length;
    const attendConv = attended.length ? Math.round((bookedAfter / attended.length) * 100) : 0;

    // Upcoming session.
    const nextSession = W.nextSession();
    const nextIso = nextSession.toISOString();
    const upcomingCount = regs.filter((r) => {
      const t = new Date(r.session_time).getTime();
      return !isNaN(t) && t >= now - 60 * 60 * 1000; // this session or later
    }).length;

    // Group registrations by session_time for the session breakdown.
    const bySession = {};
    for (const r of regs) {
      const key = r.session_time || 'unknown';
      if (!bySession[key]) bySession[key] = { session_time: key, when: r.when || (r.session_time ? W.fmtChicago(new Date(r.session_time)) : 'Unknown'), registered: 0, attended: 0, booked: 0 };
      bySession[key].registered++;
      if (r.attended) bySession[key].attended++;
      if (r.attended && booked.has(lc(r.email))) bySession[key].booked++;
    }
    const sessions = Object.values(bySession)
      .sort((a, b) => new Date(b.session_time) - new Date(a.session_time))
      .slice(0, 26);

    // Recent registrations for the table.
    const registrations = regs.slice(0, 250).map((r) => ({
      name: r.name || '', email: r.email || '', company: r.company || '',
      session_time: r.session_time || '', when: r.when || '',
      attended: !!r.attended, booked: booked.has(lc(r.email)),
      created_at: r.created_at || '',
    }));

    // Audience questions (stored as activities by webinar-question.js).
    let questions = [];
    try {
      const acts = await db.list('activities', { order: 'created_at', ascending: false, limit: 300 });
      questions = (acts || [])
        .filter((a) => a && a.title === 'Webinar question')
        .slice(0, 60)
        .map((a) => ({ body: a.body || '', created_at: a.created_at || '' }));
    } catch (_) {}

    // This week's live stream link (set by the team, read by the room).
    let cfg = null;
    try { cfg = await db.findOne('webinar_config', 'key', 'live'); } catch (_) {}
    const liveUrl = (cfg && cfg.live_url) || '';
    const setFor = (cfg && cfg.session_time) || '';
    const isForUpcoming = !!liveUrl && setFor === nextIso;
    const broadcast = {
      live_url: liveUrl,
      yt_id: ytId(liveUrl),
      set_for: setFor,
      updated_at: (cfg && cfg.updated_at) || '',
      // green = ready for the next session, amber = stale/missing, so the team
      // never accidentally runs the class pointing at last week's stream.
      status: !liveUrl ? 'missing' : (isForUpcoming ? 'ready' : 'stale'),
    };

    return res.json({
      stats: { total, attended: attended.length, showRate, bookedAfter, attendConv },
      upcoming: { session_time: nextIso, when: W.fmtChicago(nextSession), registered: upcomingCount },
      sessions,
      registrations,
      questions,
      broadcast,
    });
  } catch (e) {
    console.error('webinar-admin:', e.message);
    return res.status(500).json({ error: 'failed to load' });
  }
};
