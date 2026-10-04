// A rep's own leads, generated in the field. Scoped to the rep in the token.
//   GET                         -> [ leads ]  (all their leads; untouched ones trimmed)
//   GET ?id=<leadId>            -> one full lead
//   GET ?today=1                -> today's stop list { date, town, lead_ids }
//   POST { action:'replan' }    -> pick a new town for today's list
//   POST { business_name, ... } -> create a lead / log a walk-in
//   PATCH { id, ... }           -> update status/notes/location/next action
//   DELETE { id }               -> remove
const db = require('./_db');
const { cors } = require('./_auth');
const { requireRep } = require('./_rep-auth');

const STATUSES = ['new', 'attempted', 'contacted', 'booked', 'callback', 'not_interested', 'won', 'lost'];
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const FIELDS = ['business_name', 'contact_name', 'phone', 'email', 'address', 'industry', 'notes', 'next_action_at', 'source', 'audit_link_sent_at'];

// Bridge a rep-booked/won lead into the sales pipeline (applications), so admin,
// payments, commissions, and OS provisioning all reconcile against one record.
// Created once per lead (linked by application_id) and kept in sync after that.
// Never downgrades a further-along status (a real paid application stays paid).
const APP_RANK = { captured: 1, booked: 2, won: 3, paid: 4 };
async function bridgeToPipeline(lead, up, repId, rep) {
  const email = String(lead.email || '').toLowerCase().trim();
  const want = up.status === 'won' ? 'won' : 'booked';
  const now = new Date().toISOString();
  const patch = {
    name: lead.contact_name || lead.business_name || 'Field lead',
    phone: lead.phone || null, company: lead.business_name || null,
    website: lead.company_domain || null, industry: lead.industry || null,
    source: 'rep_field', rep_id: repId, rep_name: (rep && rep.name) || null, rep_lead_id: lead.id,
    deal_value: up.deal_value != null ? up.deal_value : (lead.deal_value != null ? lead.deal_value : null),
    updated_at: now,
  };
  let existing = null;
  if (lead.application_id) existing = await db.getById('applications', lead.application_id).catch(() => null);
  if (!existing && email) existing = await db.findOne('applications', 'email', email).catch(() => null);
  if (existing) {
    if ((APP_RANK[want] || 0) > (APP_RANK[existing.status] || 0)) patch.status = want;
    await db.update('applications', existing.id, patch).catch(() => null);
    return existing.id;
  }
  const app = await db.insert('applications', Object.assign({ email: email || null, status: want, captured_at: now, created_at: now }, patch));
  return app && app.id;
}

// Persist the rep's commission for a won deal (admin's audit rate) as a real
// ledger row admin can pay out against, instead of a client-side number. One row
// per won lead (doc id derived from the lead), refreshed if the deal value
// changes; the payout status is preserved across refreshes.
async function recordCommission(lead, up, repId, appId) {
  const deal = up.deal_value != null ? up.deal_value : (lead.deal_value != null ? lead.deal_value : null);
  const comp = require('./_rep-comp');
  const rates = await comp.getRates();
  return comp.writeCommission({
    id: 'cm_' + lead.id, rep_id: repId, rep_lead_id: lead.id, application_id: appId || lead.application_id || null,
    business_name: lead.business_name || lead.contact_name || null, kind: 'audit', amount: deal, rate: rates.audit, source: 'rep',
  }).catch(() => null);
}


// ---- Today's stops ----------------------------------------------------------
// Reps get thousands of seeded leads, and a territory pair (Zoey + Lauryn) works
// the SAME list. Each day we hand each rep ~15 stops in one town, best first,
// never a business their partner has already worked or has on today's list.
const DAY_STOPS = 15;
const CLOSED = ['won', 'lost', 'not_interested'];
const laDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(d);
const nameKey = (l) => String(l.business_name || l.contact_name || '').toLowerCase().trim();
function townOf(address) {
  const parts = String(address || '').split(',').map((x) => x.trim()).filter(Boolean);
  const la = parts.findIndex((x) => /^(LA|Louisiana)\b/i.test(x));
  if (la > 0) return parts[la - 1];
  return parts.length === 1 && !/\d/.test(parts[0]) ? parts[0] : (parts[1] || null);
}
function stopScore(l) {
  return (l.priority === 'hot' ? 5 : l.priority === 'warm' ? 3 : 1) + (l.contact_name ? 2 : 0) + (l.phone ? 1 : 0) + (l.lat != null && !l.approx_location ? 0.5 : 0);
}
const dist = (a, b) => Math.hypot(a.lat - b.lat, (a.lng - b.lng) * 0.87);
function routeOrder(stops) {
  const pinned = stops.filter((l) => l.lat != null), rest = stops.filter((l) => l.lat == null);
  const out = []; let cur = pinned.shift();
  while (cur) { out.push(cur); if (!pinned.length) break; pinned.sort((a, b) => dist(cur, a) - dist(cur, b)); cur = pinned.shift(); }
  return out.concat(rest);
}
async function buildPlan(repId, leads, { avoidTown } = {}) {
  const today = laDate();
  const endOfDay = new Date(`${today}T23:59:59-06:00`).toISOString(); // end of the Louisiana day
  const [others, mine] = await Promise.all([
    db.list('rep_day_plans', { where: [['date', '==', today]], limit: 500 }).catch(() => []),
    db.list('rep_day_plans', { where: [['rep_id', '==', repId]], limit: 400 }).catch(() => []),
  ]);
  const takenToday = new Set(), partnerTowns = new Set();
  (others || []).filter((p) => p.rep_id !== repId).forEach((p) => { (p.names || []).forEach((n) => takenToday.add(n)); if (p.town) partnerTowns.add(p.town); });
  // Callbacks and follow-ups due today come first.
  const due = leads.filter((l) => l.next_action_at && l.next_action_at <= endOfDay && !CLOSED.includes(l.status)).slice(0, 6);
  const dueIds = new Set(due.map((l) => l.id));
  const pool = leads.filter((l) => l.status === 'new' && !dueIds.has(l.id) && !(l.claimed_by_id && l.claimed_by_id !== repId) && !takenToday.has(nameKey(l)));
  const byTown = {};
  pool.forEach((l) => { const t = townOf(l.address) || 'Other'; (byTown[t] = byTown[t] || []).push(l); });
  Object.values(byTown).forEach((list) => list.sort((a, b) => stopScore(b) - stopScore(a)));
  const towns = Object.keys(byTown).filter((t) => t !== avoidTown);
  if (!towns.length) return { date: today, town: null, lead_ids: due.map((l) => l.id), names: due.map(nameKey) };
  // Stay in yesterday's town until it is mostly worked, so reps finish a cluster.
  const last = (mine || []).filter((p) => p.date < today).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  let town = last && last.town && last.town !== avoidTown && (byTown[last.town] || []).length >= 8 ? last.town : null;
  if (!town) {
    const val = (t) => byTown[t].slice(0, DAY_STOPS).reduce((a, l) => a + stopScore(l), 0) * (partnerTowns.has(t) ? 0.6 : 1);
    town = towns.sort((a, b) => val(b) - val(a))[0];
  }
  let picks = byTown[town].slice(0, DAY_STOPS);
  // A small town runs out: fill from the nearest towns.
  if (picks.length < DAY_STOPS) {
    const center = (list) => { const p = list.filter((l) => l.lat != null); return p.length ? { lat: p.reduce((a, l) => a + l.lat, 0) / p.length, lng: p.reduce((a, l) => a + l.lng, 0) / p.length } : null; };
    const c = center(byTown[town]);
    const near = towns.filter((t) => t !== town).map((t) => ({ t, c: center(byTown[t]) })).filter((x) => c && x.c).sort((a, b) => dist(c, a.c) - dist(c, b.c));
    for (const n of near) { if (picks.length >= DAY_STOPS) break; picks = picks.concat(byTown[n.t].slice(0, DAY_STOPS - picks.length)); }
  }
  const stops = due.concat(routeOrder(picks));
  return { date: today, town, lead_ids: stops.map((l) => l.id), names: stops.map(nameKey) };
}
async function savePlan(repId, plan) {
  await db.insert('rep_day_plans', Object.assign({ id: `${repId}_${plan.date}`, rep_id: repId, created_at: new Date().toISOString() }, plan));
  return plan;
}
// Untouched seeded leads go to the phone without their long notes; the app loads
// the full lead when it is opened. Keeps a 5,000-lead list fast and small.
function slim(l) {
  if (l.status !== 'new' || !l.notes) return l;
  const o = Object.assign({}, l, { _slim: true }); delete o.notes;
  if (o.context && o.context.length > 160) o.context = o.context.slice(0, 157) + '...';
  return o;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const r = await requireRep(req, res); if (!r) return;
  const repId = r.sub;

  try {
    if (req.method === 'GET') {
      if (req.query.id) {
        const one = await db.getById('rep_leads', req.query.id);
        if (!one || one.rep_id !== repId) return res.status(404).json({ error: 'Not found' });
        return res.json(one);
      }
      const rows = await db.list('rep_leads', { where: [['rep_id', '==', repId]], order: 'updated_at', ascending: false, limit: 20000 });
      if (req.query.today) {
        const existing = await db.getById('rep_day_plans', `${repId}_${laDate()}`).catch(() => null);
        if (existing) return res.json({ date: existing.date, town: existing.town, lead_ids: existing.lead_ids || [] });
        const plan = await savePlan(repId, await buildPlan(repId, rows || []));
        return res.json({ date: plan.date, town: plan.town, lead_ids: plan.lead_ids });
      }
      return res.json((rows || []).map(slim));
    }

    if (req.method === 'POST' && req.body && req.body.action === 'replan') {
      const rows = await db.list('rep_leads', { where: [['rep_id', '==', repId]], limit: 20000 });
      const cur = await db.getById('rep_day_plans', `${repId}_${laDate()}`).catch(() => null);
      const plan = await savePlan(repId, await buildPlan(repId, rows || [], { avoidTown: cur && cur.town }));
      return res.json({ date: plan.date, town: plan.town, lead_ids: plan.lead_ids });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.business_name && !b.contact_name) return res.status(400).json({ error: 'A business or contact name is required' });
      const now = new Date().toISOString();
      const status = STATUSES.includes(b.status) ? b.status : 'new';
      const lead = await db.insert('rep_leads', {
        rep_id: repId,
        business_name: b.business_name || null, contact_name: b.contact_name || null,
        phone: b.phone || null, email: b.email || null, address: b.address || null,
        industry: b.industry || null, lat: num(b.lat), lng: num(b.lng),
        status, notes: b.notes || null, next_action_at: b.next_action_at || null,
        source: b.source || 'walk-in', created_at: now, updated_at: now,
        visited_at: status !== 'new' ? now : null,
      });
      return res.status(201).json(lead);
    }

    if (req.method === 'PATCH') {
      const b = req.body || {};
      if (!b.id) return res.status(400).json({ error: 'id required' });
      const lead = await db.getById('rep_leads', b.id);
      if (!lead || lead.rep_id !== repId) return res.status(404).json({ error: 'Not found' });
      // A pin-only save (the app geocoding a lead for the map) is not rep activity,
      // so it leaves updated_at alone and admin tracking stays honest.
      const pinOnly = Object.keys(b).every((k) => ['id', 'lat', 'lng'].includes(k));
      const up = pinOnly ? {} : { updated_at: new Date().toISOString() };
      FIELDS.forEach((k) => { if (b[k] !== undefined) up[k] = b[k]; });
      if (b.lat !== undefined) up.lat = num(b.lat);
      if (b.lng !== undefined) up.lng = num(b.lng);
      if (b.deal_value !== undefined) up.deal_value = num(b.deal_value);
      if (b.status !== undefined && STATUSES.includes(b.status)) {
        up.status = b.status;
        if (b.status !== 'new' && !lead.visited_at) up.visited_at = up.updated_at;
      }
      // A booked or won lead flows into the sales pipeline. Best-effort: never
      // let a bridge failure block the rep's own status update.
      if (up.status === 'booked' || up.status === 'won') {
        try { const appId = await bridgeToPipeline(lead, up, repId, r); if (appId) up.application_id = appId; }
        catch (e) { console.error('rep-leads bridge:', e.message); }
      }
      // Record the commission when a deal is won, or when the deal value changes
      // on an already-won lead.
      if (up.status === 'won' || (lead.status === 'won' && up.deal_value !== undefined)) {
        try { await recordCommission(lead, up, repId, up.application_id); }
        catch (e) { console.error('rep-leads commission:', e.message); }
      }
      const wasNew = lead.status === 'new';
      const out = await db.update('rep_leads', b.id, up);
      // First real touch on a shared (pair) lead: mark the partner's copy as taken
      // so the two reps never walk into the same business.
      if (wasNew && up.status && up.status !== 'new' && lead.business_name) {
        try {
          const twins = await db.list('rep_leads', { where: [['business_name', '==', lead.business_name]], limit: 20 });
          const who = (r.profile && r.profile.name) || r.name || 'your partner';
          await Promise.all((twins || []).filter((t) => t.rep_id !== repId && t.status === 'new' && !t.claimed_by_id)
            .map((t) => db.update('rep_leads', t.id, { claimed_by_id: repId, claimed_by: who, claimed_at: up.updated_at })));
        } catch (e) { console.error('rep-leads claim:', e.message); }
      }
      return res.json(out);
    }

    if (req.method === 'DELETE') {
      const id = (req.body && req.body.id) || req.query.id;
      if (!id) return res.status(400).json({ error: 'id required' });
      const lead = await db.getById('rep_leads', id);
      if (!lead || lead.rep_id !== repId) return res.status(404).json({ error: 'Not found' });
      await db.remove('rep_leads', id);
      return res.json({ ok: true });
    }

    return res.status(405).end();
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
