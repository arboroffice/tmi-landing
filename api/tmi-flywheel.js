// The whole flywheel on one screen. Aggregates the three surfaces of the
// intelligent company so an operator can steer all of it from one view:
//   OS         - every client, scored on the Company Intelligence Score
//   Territories- every city rep's pipeline health
//   Proof      - the content pipeline from client build to published story
// Admin only.
//
// GET -> { os, territories, content }

const db = require('./_db');
const { requireAuth, cors } = require('./_auth');
const { scoreTenant } = require('./_osscore');
const { tenantState } = require('./_tmiproof');

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);

async function osRollup() {
  const tenants = await db.list('os_tenants', { limit: 300 });
  const clients = [];
  for (const t of tenants) {
    if (!t.onboarded) continue;
    const st = await tenantState(t.id);
    const sc = scoreTenant(Object.assign({ onboarded: true }, st));
    clients.push({
      id: t.id, name: t.name, business_type: t.business_type || null,
      score: sc.score, tier: sc.tier, certified: sc.certified,
      owner_dependency: sc.owner_dependency, proof_fired: !!t.proof_fired_at,
      workers: st.workers.length, live_workers: st.workers.filter((w) => w.status === 'active').length,
    });
  }
  clients.sort((a, b) => b.score - a.score);
  const scores = clients.map((c) => c.score);
  return {
    clients,
    totals: {
      count: clients.length,
      certified: clients.filter((c) => c.certified).length,
      avg_score: avg(scores),
      avg_owner_dependency: avg(clients.map((c) => c.owner_dependency)),
      to_certify: clients.filter((c) => !c.certified).length,
    },
  };
}

async function territoryRollup() {
  const [reps, leads] = await Promise.all([
    db.list('reps', { limit: 300 }).catch(() => []),
    db.list('rep_leads', { limit: 5000 }).catch(() => []),
  ]);
  const now = Date.now();
  const byRep = {};
  for (const l of leads) {
    const k = l.rep_id || 'unassigned';
    (byRep[k] = byRep[k] || []).push(l);
  }
  const rows = reps.map((r) => {
    const ls = byRep[r.id] || [];
    const booked = ls.filter((l) => l.status === 'booked' || l.status === 'won').length;
    const won = ls.filter((l) => l.status === 'won').length;
    const due = ls.filter((l) => l.next_action_at && new Date(l.next_action_at).getTime() <= now && !['won', 'lost', 'not_interested'].includes(l.status)).length;
    const pipeline = ls.filter((l) => !['won', 'lost', 'not_interested'].includes(l.status)).reduce((s, l) => s + num(l.deal_value), 0);
    return { id: r.id, name: r.name || r.email || 'Rep', city: r.city || null, leads: ls.length, booked, won, due, pipeline_value: pipeline };
  });
  rows.sort((a, b) => b.leads - a.leads);
  return {
    reps: rows,
    totals: {
      reps: rows.length,
      leads: leads.length,
      booked: rows.reduce((s, r) => s + r.booked, 0),
      won: rows.reduce((s, r) => s + r.won, 0),
      due: rows.reduce((s, r) => s + r.due, 0),
      pipeline_value: rows.reduce((s, r) => s + r.pipeline_value, 0),
    },
  };
}

async function contentRollup() {
  const items = await db.list('tmi_content', { limit: 500 }).catch(() => []);
  const by = (s) => items.filter((c) => (c.status || 'pending') === s).length;
  const recent = items
    .slice()
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, 8)
    .map((c) => ({ id: c.id, title: c.title, status: c.status || 'pending', url: c.published_url || null, source: c.source_tenant ? 'client proof' : 'intelligence' }));
  return {
    pending: by('pending'), approved: by('approved'), published: by('published'),
    total: items.length, recent,
  };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;
  try {
    const [os, territories, content] = await Promise.all([osRollup(), territoryRollup(), contentRollup()]);
    return res.status(200).json({ os, territories, content });
  } catch (e) {
    console.error('tmi-flywheel:', e.message);
    return res.status(500).json({ error: e.message || 'Could not load the flywheel' });
  }
};

module.exports.config = { maxDuration: 60 };
