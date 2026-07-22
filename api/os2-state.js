// TMI OS — the whole dashboard state for the signed-in tenant: command center
// metrics, AI workers, workflows, and the build feed. Everything scoped to the
// caller's tenant_id.
//
// GET -> { tenant, metrics, workers, workflows, build_log }

const db = require('./_db');
const { requireTenant, cors } = require('./_tenant-auth');

const bySort = (a, b) => (a.sort || 0) - (b.sort || 0);

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const t = requireTenant(req, res);
  if (!t) return;
  const tid = t.tenant_id;

  try {
    const [tenant, metrics, workers, workflows, log] = await Promise.all([
      db.getById('os_tenants', tid),
      db.list('os_metrics', { where: [['tenant_id', '==', tid]] }),
      db.list('os_workers', { where: [['tenant_id', '==', tid]] }),
      db.list('os_workflows', { where: [['tenant_id', '==', tid]] }),
      db.list('os_build_log', { where: [['tenant_id', '==', tid]], order: 'created_at', ascending: false, limit: 20 }),
    ]);
    return res.status(200).json({
      tenant: tenant ? { id: tenant.id, name: tenant.name, onboarded: !!tenant.onboarded, summary: tenant.summary || null, plan: tenant.plan || 'trial' } : null,
      metrics: metrics.sort(bySort),
      workers: workers.sort(bySort),
      workflows: workflows.sort(bySort),
      build_log: log,
    });
  } catch (e) {
    console.error('os2-state:', e.message);
    return res.status(500).json({ error: 'Could not load your OS' });
  }
};
