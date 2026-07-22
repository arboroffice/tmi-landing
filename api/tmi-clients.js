// Admin side of the OS: TMI's build console for client operating systems. The
// client lays out what they want in their OS and files build requests; TMI works
// them here, marks them building or live, and can provision straight into the
// client's tenant, building their system for them. This is what makes the OS "all
// of TMI in a portal" rather than a DIY sandbox. Admin only.
//
// POST { action, ... }
//   'list'                                        -> { clients }
//   'get' { tenant_id }                           -> { tenant, score, requests, workers, metrics, workflows, knowledge, log }
//   'request-update' { id, status, tmi_note }     -> { request }
//   'provision' { tenant_id, resource, data }     -> { item }   create an os_* doc for the client
//   'build-log' { tenant_id, summary }            -> { ok }     note something in the client's feed

const db = require('./_db');
const { requireAuth, cors } = require('./_auth');
const { scoreTenant } = require('./_osscore');
const { tenantState } = require('./_tmiproof');

const REQ_STATUS = ['requested', 'building', 'live', 'declined', 'cancelled'];
const PROVISION = {
  workers: { coll: 'os_workers', fields: ['name', 'job', 'autonomy', 'cadence', 'status', 'sort'] },
  metrics: { coll: 'os_metrics', fields: ['label', 'value', 'unit', 'hint', 'target', 'sort'] },
  workflows: { coll: 'os_workflows', fields: ['name', 'trigger', 'steps', 'status', 'sort'] },
  knowledge: { coll: 'os_knowledge', fields: ['title', 'body', 'kind', 'sort'] },
  tasks: { coll: 'os_tasks', fields: ['title', 'detail', 'status', 'priority', 'due', 'sort'] },
};

function pick(fields, raw) {
  const data = raw || {}; const out = {};
  for (const k of fields) if (data[k] !== undefined && data[k] !== null) out[k] = typeof data[k] === 'string' ? data[k].slice(0, k === 'body' ? 12000 : 2000) : data[k];
  return out;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!requireAuth(req, res)) return;

  const b = req.body || {};
  const action = String(b.action || 'list');

  try {
    if (action === 'list') {
      const tenants = await db.list('os_tenants', { limit: 300 });
      const clients = [];
      for (const t of tenants) {
        if (!t.onboarded) continue;
        const reqs = await db.list('os_requests', { where: [['tenant_id', '==', t.id]], limit: 200 });
        const st = await tenantState(t.id);
        const sc = scoreTenant(Object.assign({ onboarded: true }, st));
        clients.push({
          id: t.id, name: t.name, business_type: t.business_type || null, plan: t.plan || 'trial',
          score: sc.score, tier: sc.tier, certified: sc.certified,
          requests_open: reqs.filter((r) => ['requested', 'building'].includes(r.status)).length,
          requests_total: reqs.length,
          workers: st.workers.length, live_workers: st.workers.filter((w) => w.status === 'active').length,
        });
      }
      clients.sort((a, b) => (b.requests_open - a.requests_open) || (b.score - a.score));
      return res.status(200).json({ clients });
    }

    if (action === 'get') {
      const tid = String(b.tenant_id || '');
      const tenant = await db.getById('os_tenants', tid);
      if (!tenant) return res.status(404).json({ error: 'Client not found' });
      const w = [['tenant_id', '==', tid]];
      const [requests, workers, metrics, workflows, knowledge, log] = await Promise.all([
        db.list('os_requests', { where: w, order: 'created_at', ascending: false, limit: 200 }),
        db.list('os_workers', { where: w }),
        db.list('os_metrics', { where: w }),
        db.list('os_workflows', { where: w }),
        db.list('os_knowledge', { where: w }),
        db.list('os_build_log', { where: w, order: 'created_at', ascending: false, limit: 30 }),
      ]);
      const sc = scoreTenant({ metrics, workers, workflows, knowledge, onboarded: !!tenant.onboarded });
      return res.status(200).json({
        tenant: { id: tenant.id, name: tenant.name, business_type: tenant.business_type || null, plan: tenant.plan || 'trial', profile: tenant.profile || {}, summary: tenant.summary || null },
        score: sc, requests, workers, metrics, workflows, knowledge, log,
      });
    }

    if (action === 'request-update') {
      const id = String(b.id || '');
      const cur = await db.getById('os_requests', id);
      if (!cur) return res.status(404).json({ error: 'Request not found' });
      const patch = { updated_at: new Date().toISOString() };
      if (b.status !== undefined && REQ_STATUS.includes(b.status)) patch.status = b.status;
      if (b.tmi_note !== undefined) patch.tmi_note = String(b.tmi_note || '').slice(0, 2000);
      const request = await db.update('os_requests', id, patch);
      if (patch.status) {
        const note = patch.status === 'live' ? `TMI delivered: ${cur.title}.` : patch.status === 'building' ? `TMI started building: ${cur.title}.` : patch.status === 'declined' ? `TMI reviewed a request: ${cur.title}.` : `Updated: ${cur.title}.`;
        await db.insert('os_build_log', { tenant_id: cur.tenant_id, kind: 'request', summary: note, created_at: new Date().toISOString() }).catch(() => {});
      }
      return res.status(200).json({ request });
    }

    if (action === 'provision') {
      const tid = String(b.tenant_id || '');
      const tenant = await db.getById('os_tenants', tid);
      if (!tenant) return res.status(404).json({ error: 'Client not found' });
      const spec = PROVISION[String(b.resource || '')];
      if (!spec) return res.status(400).json({ error: 'Unknown resource' });
      const data = pick(spec.fields, b.data);
      if (!Object.keys(data).length) return res.status(400).json({ error: 'Nothing to provision' });
      const existing = await db.list(spec.coll, { where: [['tenant_id', '==', tid]] });
      const sort = existing.reduce((m, r) => Math.max(m, r.sort || 0), 0) + 1;
      const item = await db.insert(spec.coll, Object.assign({ tenant_id: tid, sort, built_by: 'tmi' }, data, { created_at: new Date().toISOString() }));
      await db.insert('os_build_log', { tenant_id: tid, kind: 'build', summary: `TMI built ${data.name || data.label || data.title || 'an item'} in your OS.`, created_at: new Date().toISOString() }).catch(() => {});
      return res.status(200).json({ item });
    }

    if (action === 'build-log') {
      const tid = String(b.tenant_id || '');
      if (!tid || !b.summary) return res.status(400).json({ error: 'tenant_id and summary required' });
      await db.insert('os_build_log', { tenant_id: tid, kind: 'note', summary: String(b.summary).slice(0, 400), created_at: new Date().toISOString() });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('tmi-clients:', e.message);
    return res.status(500).json({ error: e.message || 'Something went wrong' });
  }
};

module.exports.config = { maxDuration: 60 };
