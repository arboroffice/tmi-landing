// TMI OS - Marketplace endpoint. A shelf of prebuilt, industry-agnostic roles,
// departments, and workflows any business can install into its OS in one tap.
// Installing does real work: it provisions live tenant-scoped objects the owner
// and the AI COO then run, so breadth turns into a company that already works.
//
// POST { action }
//   action 'list'    -> { items: CATALOG }
//   action 'install' { id } (manager+) -> provisions the template's spec into the
//                    caller's tenant and returns { installed: { kind, label, counts? } }
//
// Every write is scoped to the caller's tenant_id, so one company can never
// provision into another's OS.

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');
const { CATALOG, getTemplate } = require('./_osmarket');
const { normalizeSteps, normalizeTrigger } = require('./_ossteps');

// Next sort value for a collection within one tenant: current max + 1.
async function nextSort(coll, tid) {
  const rows = await db.list(coll, { where: [['tenant_id', '==', tid]] });
  return rows.reduce((m, r) => Math.max(m, r.sort || 0), 0) + 1;
}

function log(tid, label) {
  return db
    .insert('os_build_log', {
      tenant_id: tid,
      kind: 'market',
      summary: 'Installed ' + label + ' from the marketplace.',
      created_at: new Date().toISOString(),
    })
    .catch(() => {});
}

async function installWorker(tid, spec) {
  const sort = await nextSort('os_workers', tid);
  await db.insert('os_workers', Object.assign({ tenant_id: tid }, spec, { status: 'ready', sort }));
}

async function installDepartment(tid, spec) {
  const sort = await nextSort('os_departments', tid);
  const dept = await db.insert('os_departments', Object.assign({ tenant_id: tid }, spec, { sort }));
  return dept;
}

async function installWorkflow(tid, spec, departmentId) {
  const sort = await nextSort('os_workflows', tid);
  const row = { tenant_id: tid, name: spec.name, trigger: normalizeTrigger(spec.trigger), steps: normalizeSteps(spec.steps), status: 'draft', sort };
  if (departmentId) row.department_id = departmentId;
  await db.insert('os_workflows', row);
}

async function installPack(tid, spec) {
  const dept = await installDepartment(tid, spec.department);
  const deptId = dept.id;
  const counts = { workers: 0, metrics: 0, goals: 0, workflows: 0 };

  let wSort = await nextSort('os_workers', tid);
  for (const w of spec.workers || []) {
    await db.insert('os_workers', Object.assign({ tenant_id: tid }, w, { department_id: deptId, status: 'ready', sort: wSort++ }));
    counts.workers++;
  }

  let mSort = await nextSort('os_metrics', tid);
  for (const m of spec.metrics || []) {
    await db.insert('os_metrics', { tenant_id: tid, label: m.label, unit: m.unit, hint: m.hint, department_id: deptId, sort: mSort++ });
    counts.metrics++;
  }

  let gSort = await nextSort('os_goals', tid);
  for (const g of spec.goals || []) {
    await db.insert('os_goals', { tenant_id: tid, title: g.title, target: g.target, timeframe: g.timeframe, department_id: deptId, status: 'active', sort: gSort++ });
    counts.goals++;
  }

  let fSort = await nextSort('os_workflows', tid);
  for (const f of spec.workflows || []) {
    await db.insert('os_workflows', { tenant_id: tid, name: f.name, trigger: normalizeTrigger(f.trigger), steps: normalizeSteps(f.steps), department_id: deptId, status: 'draft', sort: fSort++ });
    counts.workflows++;
  }

  return counts;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;

  const b = req.body || {};
  const action = String(b.action || 'list');
  const tid = t.tenant_id;

  try {
    if (action === 'list') {
      return res.status(200).json({ items: CATALOG });
    }

    if (action === 'install') {
      if (!requireRole(t, res, 'manager')) return;

      const tpl = getTemplate(String(b.id || ''));
      if (!tpl) return res.status(404).json({ error: 'Unknown template' });

      const installed = { kind: tpl.kind, label: tpl.label };

      if (tpl.kind === 'worker') {
        await installWorker(tid, tpl.spec);
      } else if (tpl.kind === 'department') {
        await installDepartment(tid, tpl.spec);
      } else if (tpl.kind === 'workflow') {
        await installWorkflow(tid, tpl.spec, null);
      } else if (tpl.kind === 'pack') {
        installed.counts = await installPack(tid, tpl.spec);
      } else {
        return res.status(400).json({ error: 'Unknown template kind' });
      }

      await log(tid, tpl.label);
      return res.status(200).json({ installed });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-market:', e.message);
    return res.status(500).json({ error: 'Could not install that' });
  }
};
