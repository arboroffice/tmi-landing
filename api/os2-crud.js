// TMI OS — generic tenant-scoped CRUD for the owner-editable objects that make
// up their intelligent company: metrics, workers, workflows, knowledge, tasks,
// and reports. This is the DIY core: the owner builds and runs their company by
// creating and editing these, and the AI COO writes to the same endpoint.
//
// Every read and write is scoped to the caller's tenant_id, and updates/deletes
// verify the target doc belongs to the tenant, so one company can never touch
// another's data.
//
// POST { resource, action, id?, data? }
//   action: 'list' | 'create' | 'update' | 'delete'
//   -> { items } | { item } | { ok: true }

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');

const COLLS = {
  metrics: 'os_metrics',
  workers: 'os_workers',
  workflows: 'os_workflows',
  knowledge: 'os_knowledge',
  tasks: 'os_tasks',
  reports: 'os_reports',
  outputs: 'os_outputs',
  goals: 'os_goals',
  departments: 'os_departments',
};

const FIELDS = {
  metrics: ['label', 'value', 'unit', 'hint', 'target', 'sort', 'department_id'],
  workers: ['name', 'job', 'autonomy', 'cadence', 'status', 'sort', 'department_id', 'tools', 'inbound'],
  workflows: ['name', 'trigger', 'steps', 'status', 'sort', 'department_id'],
  knowledge: ['title', 'body', 'kind', 'sort', 'department_id'],
  tasks: ['title', 'detail', 'status', 'priority', 'due', 'sort'],
  reports: ['title', 'body', 'period', 'sort'],
  outputs: ['title', 'body', 'status'],
  goals: ['title', 'metric_id', 'target', 'timeframe', 'status', 'sort', 'department_id'],
  departments: ['name', 'mandate', 'sort'],
};

const NOUN = { metrics: 'metric', workers: 'worker', workflows: 'workflow', knowledge: 'knowledge item', tasks: 'task', reports: 'report', outputs: 'output', goals: 'goal', departments: 'department' };

function clean(resource, raw) {
  const data = raw || {};
  const out = {};
  for (const k of FIELDS[resource]) if (data[k] !== undefined && data[k] !== null) out[k] = data[k];

  if (resource === 'workers') {
    if (out.autonomy && !['read', 'approve', 'auto'].includes(out.autonomy)) out.autonomy = 'approve';
    if (out.cadence && !['realtime', 'daily', 'weekly'].includes(out.cadence)) out.cadence = 'daily';
    if (out.status && !['ready', 'active', 'paused'].includes(out.status)) out.status = 'ready';
    if (out.tools !== undefined) out.tools = (Array.isArray(out.tools) ? out.tools : []).slice(0, 24).map((s) => String(s).slice(0, 80));
    if (out.inbound !== undefined) out.inbound = !!out.inbound;
  }
  if (resource === 'workflows') {
    if (out.steps !== undefined) out.steps = (Array.isArray(out.steps) ? out.steps : []).slice(0, 12).map(s => String(s).slice(0, 200));
    if (out.status && !['active', 'paused', 'draft'].includes(out.status)) out.status = 'active';
  }
  if (resource === 'tasks') {
    if (out.status && !['open', 'done'].includes(out.status)) out.status = 'open';
    if (out.priority && !['low', 'normal', 'high'].includes(out.priority)) out.priority = 'normal';
  }
  if (resource === 'knowledge') {
    if (out.kind && !['sop', 'policy', 'pricing', 'note', 'report', 'faq'].includes(out.kind)) out.kind = 'note';
  }
  if (resource === 'outputs') {
    if (out.status && !['pending', 'done', 'dismissed'].includes(out.status)) out.status = 'done';
  }
  if (resource === 'goals') {
    if (out.status && !['active', 'hit', 'missed', 'paused'].includes(out.status)) out.status = 'active';
  }
  for (const k of Object.keys(out)) {
    if (typeof out[k] === 'string') out[k] = out[k].slice(0, k === 'body' ? 12000 : 2000);
    if (typeof out[k] === 'number') out[k] = out[k];
  }
  return out;
}

function label(resource, row) {
  return `${NOUN[resource] || 'item'} ${row.name || row.label || row.title || ''}`.trim();
}
function log(tid, summary) {
  return db.insert('os_build_log', { tenant_id: tid, kind: 'edit', summary, created_at: new Date().toISOString() }).catch(() => {});
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;

  const b = req.body || {};
  const resource = String(b.resource || b.collection || '');
  const coll = COLLS[resource];
  if (!coll) return res.status(400).json({ error: 'Unknown resource' });
  const action = String(b.action || 'list');
  const tid = t.tenant_id;

  try {
    if (action === 'list') {
      const rows = await db.list(coll, { where: [['tenant_id', '==', tid]] });
      rows.sort((a, b) => (a.sort || 0) - (b.sort || 0));
      return res.status(200).json({ items: rows });
    }

    // create / update / delete are writes: viewers are read-only.
    if (!requireRole(t, res, 'manager')) return;

    if (action === 'create') {
      const data = clean(resource, b.data);
      const existing = await db.list(coll, { where: [['tenant_id', '==', tid]] });
      const sort = existing.reduce((m, r) => Math.max(m, r.sort || 0), 0) + 1;
      const item = await db.insert(coll, Object.assign({ tenant_id: tid, sort }, data, { created_at: new Date().toISOString() }));
      if (resource !== 'reports') log(tid, `Added ${label(resource, item)}.`);
      return res.status(201).json({ item });
    }

    const id = String(b.id || '');
    if (!id) return res.status(400).json({ error: 'id required' });
    const cur = await db.getById(coll, id);
    if (!cur || cur.tenant_id !== tid) return res.status(404).json({ error: 'Not found' });

    if (action === 'update') {
      const item = await db.update(coll, id, clean(resource, b.data));
      return res.status(200).json({ item });
    }
    if (action === 'delete') {
      await db.remove(coll, id);
      if (resource !== 'reports') log(tid, `Removed ${label(resource, cur)}.`);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-crud:', e.message);
    return res.status(500).json({ error: 'Could not save that' });
  }
};
