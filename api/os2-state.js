// TMI OS — the whole workspace for the signed-in tenant: command center
// metrics, AI workers, workflows, company knowledge, tasks, generated reports,
// and the build feed. Everything scoped to the caller's tenant_id.
//
// GET -> { tenant, metrics, workers, workflows, knowledge, tasks, reports, build_log }

const db = require('./_db');
const { requireTenant, cors } = require('./_tenant-auth');
const { scoreTenant } = require('./_osscore');

const bySort = (a, b) => (a.sort || 0) - (b.sort || 0);

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const t = requireTenant(req, res);
  if (!t) return;
  const tid = t.tenant_id;
  const w = [['tenant_id', '==', tid]];

  try {
    const [tenant, metrics, workers, workflows, knowledge, tasks, reports, outputs, actions, requests, log] = await Promise.all([
      db.getById('os_tenants', tid),
      db.list('os_metrics', { where: w }),
      db.list('os_workers', { where: w }),
      db.list('os_workflows', { where: w }),
      db.list('os_knowledge', { where: w }),
      db.list('os_tasks', { where: w }),
      db.list('os_reports', { where: w }),
      db.list('os_outputs', { where: w }),
      db.list('os_actions', { where: w, order: 'created_at', ascending: false, limit: 40 }),
      db.list('os_requests', { where: w, order: 'created_at', ascending: false, limit: 100 }),
      db.list('os_build_log', { where: w, order: 'created_at', ascending: false, limit: 30 }),
    ]);
    const score = scoreTenant({
      metrics, workers, workflows, knowledge,
      onboarded: !!(tenant && tenant.onboarded),
    });

    return res.status(200).json({
      me: { id: t.sub, role: t.role || 'owner', email: t.email || null },
      score,
      tenant: tenant ? {
        id: tenant.id, name: tenant.name, onboarded: !!tenant.onboarded,
        summary: tenant.summary || null, plan: tenant.plan || 'trial',
        business_type: tenant.business_type || null, profile: tenant.profile || {},
        digest: tenant.digest !== false,
        channels: tenant.channels || {}, autopilot: !!tenant.autopilot,
      } : null,
      metrics: metrics.sort(bySort),
      workers: workers.sort(bySort),
      workflows: workflows.sort(bySort),
      knowledge: knowledge.sort(bySort),
      tasks: tasks.sort(bySort),
      reports: reports.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
      outputs: outputs.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
      actions,
      requests,
      build_log: log,
    });
  } catch (e) {
    console.error('os2-state:', e.message);
    return res.status(500).json({ error: 'Could not load your OS' });
  }
};
