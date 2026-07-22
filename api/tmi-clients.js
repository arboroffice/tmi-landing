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
const { slug } = require('./_osmetric');
const { notify } = require('./_osmail');

const INGEST_ENDPOINT = 'https://os.tmitechai.com/api/os2-ingest';

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
      const [requests, workers, metrics, workflows, knowledge, connections, log] = await Promise.all([
        db.list('os_requests', { where: w, order: 'created_at', ascending: false, limit: 200 }),
        db.list('os_workers', { where: w }),
        db.list('os_metrics', { where: w }),
        db.list('os_workflows', { where: w }),
        db.list('os_knowledge', { where: w }),
        db.list('os_connections', { where: w, order: 'created_at', ascending: false, limit: 100 }),
        db.list('os_build_log', { where: w, order: 'created_at', ascending: false, limit: 30 }),
      ]);
      const sc = scoreTenant({ metrics, workers, workflows, knowledge, onboarded: !!tenant.onboarded });
      return res.status(200).json({
        tenant: { id: tenant.id, name: tenant.name, business_type: tenant.business_type || null, plan: tenant.plan || 'trial', profile: tenant.profile || {}, summary: tenant.summary || null, ingest_key: tenant.ingest_key || null },
        score: sc, requests, workers, metrics, workflows, knowledge, connections, log,
        ingest_endpoint: INGEST_ENDPOINT,
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
        // Tell the client the moment something they asked for goes live.
        if (patch.status === 'live') {
          const tenant = await db.getById('os_tenants', cur.tenant_id);
          if (tenant) {
            const lines = [`TMI just delivered what you asked for: <b>${cur.title}</b>.`];
            if (patch.tmi_note) lines.push(patch.tmi_note);
            lines.push('It is live in your OS now.');
            await notify(tenant, `Live in your OS: ${cur.title}`, 'Your build is live', lines).catch(() => {});
          }
        }
      }
      return res.status(200).json({ request });
    }

    // Wire a real data connection: ensure the metrics it feeds exist (with keys),
    // create the connection record, and hand back the ingest endpoint + key so TMI
    // can point the client's actual tool at it. Goes live when data first flows.
    if (action === 'connect') {
      const tid = String(b.tenant_id || '');
      const tenant = await db.getById('os_tenants', tid);
      if (!tenant) return res.status(404).json({ error: 'Client not found' });
      const name = String(b.name || '').slice(0, 80).trim();
      if (!name) return res.status(400).json({ error: 'Name the connection' });
      const provider = String(b.provider || name).slice(0, 60);
      const labels = (Array.isArray(b.metric_labels) ? b.metric_labels : String(b.metric_labels || '').split(','))
        .map((s) => String(s).trim()).filter(Boolean).slice(0, 12);

      const existing = await db.list('os_metrics', { where: [['tenant_id', '==', tid]] });
      let sortBase = existing.reduce((m, r) => Math.max(m, r.sort || 0), 0);
      const feeds = [];
      for (const label of labels) {
        const key = slug(label);
        let m = existing.find((x) => (x.key && x.key === key) || slug(x.label) === key);
        if (!m) {
          m = await db.insert('os_metrics', { tenant_id: tid, label: label.slice(0, 60), key, value: '-', unit: '', sort: ++sortBase, source: provider, built_by: 'tmi', created_at: new Date().toISOString() });
          existing.push(m);
        } else if (!m.key) {
          await db.update('os_metrics', m.id, { key });
        }
        feeds.push({ key, label: label.slice(0, 60) });
      }

      let ingest_key = tenant.ingest_key;
      if (!ingest_key) { ingest_key = require('crypto').randomBytes(24).toString('hex'); await db.update('os_tenants', tid, { ingest_key }); }

      const now = new Date().toISOString();
      const connection = await db.insert('os_connections', {
        tenant_id: tid, name, provider, status: 'connecting', feeds, note: String(b.note || '').slice(0, 1000) || null,
        built_by: 'tmi', created_at: now, updated_at: now, last_data_at: null,
      });
      await db.insert('os_build_log', { tenant_id: tid, kind: 'build', summary: `TMI is connecting ${name}${feeds.length ? ' (' + feeds.map((f) => f.label).join(', ') + ')' : ''}.`, created_at: now }).catch(() => {});
      return res.status(200).json({ connection, ingest_endpoint: INGEST_ENDPOINT, ingest_key });
    }

    if (action === 'connection-update') {
      const id = String(b.id || '');
      const cur = await db.getById('os_connections', id);
      if (!cur) return res.status(404).json({ error: 'Connection not found' });
      const patch = { updated_at: new Date().toISOString() };
      if (b.status !== undefined && ['connecting', 'live', 'paused'].includes(b.status)) patch.status = b.status;
      if (b.note !== undefined) patch.note = String(b.note || '').slice(0, 1000);
      const connection = await db.update('os_connections', id, patch);
      if (patch.status === 'live') {
        await db.insert('os_build_log', { tenant_id: cur.tenant_id, kind: 'build', summary: `${cur.name} is live and feeding your OS.`, created_at: new Date().toISOString() }).catch(() => {});
        const tenant = await db.getById('os_tenants', cur.tenant_id);
        if (tenant) await notify(tenant, `Connected: ${cur.name}`, `${cur.name} is live`, [`Your <b>${cur.name}</b> connection is wired and feeding your OS with real numbers.`, 'Your command center, your COO, and your workers now run on actuals.']).catch(() => {});
      }
      return res.status(200).json({ connection });
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
