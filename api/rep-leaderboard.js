// This week's team standings for the city-lead reps. Rep-scoped (any signed-in
// rep can see the board). Returns each active rep's visits / booked / won this
// week, ranked, with a flag on the current rep.
const db = require('./_db');
const { cors } = require('./_auth');
const { requireRep } = require('./_rep-auth');

function weekStart() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0 = Monday
  const m = new Date(now); m.setHours(0, 0, 0, 0); m.setDate(now.getDate() - day);
  return m;
}
const isThisWeek = (iso, start) => { if (!iso) return false; const d = new Date(iso); return !isNaN(d) && d >= start; };
const WORKED = ['attempted', 'contacted', 'callback', 'booked', 'won', 'not_interested', 'lost'];

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const me = await requireRep(req, res); if (!me) return;
  try {
    const start = weekStart();
    const [reps, leads] = await Promise.all([
      db.list('reps', { limit: 200 }),
      db.list('rep_leads', { limit: 5000 }),
    ]);
    const byRep = {};
    for (const r of (reps || [])) {
      if (r.status === 'disabled') continue;
      byRep[r.id] = { rep_id: r.id, name: (r.name || r.email || 'Rep'), visits: 0, booked: 0, won: 0 };
    }
    for (const l of (leads || [])) {
      const b = byRep[l.rep_id]; if (!b) continue;
      const touched = l.visited_at || l.updated_at || l.created_at;
      if (isThisWeek(touched, start) && (l.visited_at || WORKED.includes(l.status))) b.visits++;
      if (isThisWeek(l.updated_at || l.created_at, start)) {
        if (l.status === 'booked' || l.status === 'won') b.booked++;
        if (l.status === 'won') b.won++;
      }
    }
    const rows = Object.values(byRep).sort((a, b) => b.won - a.won || b.booked - a.booked || b.visits - a.visits);
    rows.forEach((r, i) => { r.rank = i + 1; r.isMe = r.rep_id === me.sub; });
    return res.json(rows);
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
