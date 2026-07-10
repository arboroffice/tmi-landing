// Team standings for the city-lead reps. Rep-scoped (any signed-in rep can see
// the board). Returns each active rep's visits / booked / won for the requested
// window, ranked, with a flag on the current rep.
//   GET ?range=week|month|all  (default week)
const db = require('./_db');
const { cors } = require('./_auth');
const { requireRep } = require('./_rep-auth');

function weekStart() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0 = Monday
  const m = new Date(now); m.setHours(0, 0, 0, 0); m.setDate(now.getDate() - day);
  return m;
}
function monthStart() {
  const now = new Date();
  const m = new Date(now.getFullYear(), now.getMonth(), 1); m.setHours(0, 0, 0, 0);
  return m;
}
const after = (iso, start) => { if (!start) return true; if (!iso) return false; const d = new Date(iso); return !isNaN(d) && d >= start; };
const WORKED = ['attempted', 'contacted', 'callback', 'booked', 'won', 'not_interested', 'lost'];

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const me = await requireRep(req, res); if (!me) return;
  try {
    const range = String((req.query && req.query.range) || 'week');
    const start = range === 'all' ? null : (range === 'month' ? monthStart() : weekStart());
    const [reps, leads] = await Promise.all([
      db.list('reps', { limit: 200 }),
      db.list('rep_leads', { limit: 5000 }),
    ]);
    const byRep = {};
    for (const r of (reps || [])) {
      if (r.status === 'disabled') continue;
      byRep[r.id] = { rep_id: r.id, name: (r.name || r.email || 'Rep'), visits: 0, booked: 0, won: 0, revenue: 0 };
    }
    for (const l of (leads || [])) {
      const b = byRep[l.rep_id]; if (!b) continue;
      const touched = l.visited_at || l.updated_at || l.created_at;
      if (after(touched, start) && (l.visited_at || WORKED.includes(l.status))) b.visits++;
      if (after(l.updated_at || l.created_at, start)) {
        if (l.status === 'booked' || l.status === 'won') b.booked++;
        if (l.status === 'won') { b.won++; b.revenue += Number(l.deal_value) || 0; }
      }
    }
    const rows = Object.values(byRep).sort((a, b) => b.won - a.won || b.booked - a.booked || b.visits - a.visits);
    rows.forEach((r, i) => { r.rank = i + 1; r.isMe = r.rep_id === me.sub; });
    return res.json({ range, rows });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
