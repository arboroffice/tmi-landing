// What each rep actually did on a given Louisiana day: stops worked, audit links
// sent, audits sold, and their chosen town / stop list. Shared by the admin
// Today board and the morning / noon texts to the owner.
const db = require('./_db');

const TZ = 'America/Chicago';
const laDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);

// Every rep lead, trimmed to what activity needs.
async function allLeads() {
  const snap = await db.db().collection('rep_leads')
    .select('rep_id', 'status', 'created_at', 'updated_at', 'visited_at', 'source', 'audit_link_sent_at', 'audit_paid_at', 'deal_value')
    .get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, db.normalize(d.data())));
}
// When the rep really worked a lead (imports and map-pin saves don't count).
function touchedAt(l) {
  const times = [l.visited_at];
  if (l.updated_at && l.updated_at !== l.created_at) times.push(l.updated_at);
  if (l.source !== 'assigned') times.push(l.created_at);
  return times.filter(Boolean).sort().pop() || null;
}
const onDay = (iso, day) => !!iso && laDate(new Date(iso)) === day;

async function dayActivity(day = laDate()) {
  const [reps, leads, plans] = await Promise.all([
    db.list('reps', { limit: 300 }).catch(() => []),
    allLeads().catch(() => []),
    db.list('rep_day_plans', { where: [['date', '==', day]], limit: 500 }).catch(() => []),
  ]);
  const byId = {}; leads.forEach((l) => { byId[l.id] = l; });
  const planOf = {}; (plans || []).forEach((p) => { planOf[p.rep_id] = p; });
  const out = (reps || []).filter((r) => r.status !== 'disabled').map((r) => {
    const mine = leads.filter((l) => l.rep_id === r.id);
    const last = mine.map(touchedAt).filter(Boolean).sort().pop() || null;
    const plan = planOf[r.id];
    const stops = plan ? (plan.lead_ids || []).map((id) => byId[id]).filter(Boolean) : [];
    return {
      id: r.id, name: r.name || r.email || 'Rep', first: String(r.name || r.email || 'Rep').split(' ')[0],
      town: plan ? plan.town : null, stops: stops.length,
      stops_done: stops.filter((l) => l.status !== 'new' || onDay(l.visited_at, day)).length,
      worked: mine.filter((l) => onDay(touchedAt(l), day)).length,
      links: mine.filter((l) => onDay(l.audit_link_sent_at, day)).length,
      sold: mine.filter((l) => onDay(l.audit_paid_at, day)).length,
      sold_value: mine.filter((l) => onDay(l.audit_paid_at, day)).reduce((a, l) => a + (Number(l.deal_value) || 0), 0),
      last_active: last,
    };
  });
  return { day, reps: out.sort((a, b) => (b.sold - a.sold) || (b.links - a.links) || (b.worked - a.worked)) };
}

module.exports = { laDate, allLeads, touchedAt, dayActivity };
