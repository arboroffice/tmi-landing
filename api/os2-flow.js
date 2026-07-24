// TMI OS - workflow run endpoint. Starts, lists, reads, approves, and resumes
// executable workflow runs, all scoped to the caller's tenant so one company can
// never touch another's runs. The engine lives in ./_osflow; this file only
// handles auth, tenant scoping, and shaping the request and response.
//
// POST { action, ... }
//   'run'     { workflow_id, context? } (manager) -> { run }
//   'event'   { event, context? }       (manager) -> { runs, fired }
//   'runs'                                          -> { runs }  newest first, 50
//   'get'     { run_id }                            -> { run }
//   'approve' { run_id }               (manager)    -> { run }
//   'resume'  { run_id }                            -> { run }

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');
const { startRun, advance, approveRun } = require('./_osflow');
const { emitEvent } = require('./_osevents');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;

  const b = req.body || {};
  const action = String(b.action || '');
  const tid = t.tenant_id;

  try {
    const tenant = await db.getById('os_tenants', tid);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    if (action === 'run') {
      if (!requireRole(t, res, 'manager')) return;
      const wf = await db.getById('os_workflows', String(b.workflow_id || ''));
      if (!wf || wf.tenant_id !== tid) return res.status(404).json({ error: 'Workflow not found' });
      const run = await startRun(tenant, wf, b.context || {}, new Date().toISOString());
      return res.status(200).json({ run });
    }

    if (action === 'event') {
      if (!requireRole(t, res, 'manager')) return;
      const runs = await emitEvent(tenant, String(b.event || ''), b.context || {}, new Date().toISOString());
      return res.status(200).json({ runs, fired: runs.length });
    }

    if (action === 'runs') {
      const runs = await db.list('os_workflow_runs', {
        where: [['tenant_id', '==', tid]], order: 'created_at', ascending: false, limit: 50,
      });
      return res.status(200).json({ runs });
    }

    if (action === 'get') {
      const run = await db.getById('os_workflow_runs', String(b.run_id || ''));
      if (!run || run.tenant_id !== tid) return res.status(404).json({ error: 'Run not found' });
      return res.status(200).json({ run });
    }

    if (action === 'approve') {
      if (!requireRole(t, res, 'manager')) return;
      const run = await db.getById('os_workflow_runs', String(b.run_id || ''));
      if (!run || run.tenant_id !== tid) return res.status(404).json({ error: 'Run not found' });
      const updated = await approveRun(run, new Date().toISOString());
      return res.status(200).json({ run: updated });
    }

    if (action === 'resume') {
      const run = await db.getById('os_workflow_runs', String(b.run_id || ''));
      if (!run || run.tenant_id !== tid) return res.status(404).json({ error: 'Run not found' });
      const now = Date.now();
      if (run.status === 'waiting' && (run.resume_at == null || Number(run.resume_at) <= now)) {
        const updated = await advance(run, new Date().toISOString());
        return res.status(200).json({ run: updated });
      }
      return res.status(200).json({ run });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-flow:', e.message);
    return res.status(500).json({ error: 'Could not run the workflow' });
  }
};

module.exports.config = { maxDuration: 60 };
