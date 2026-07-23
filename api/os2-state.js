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
    const [tenant, metrics, workers, workflows, knowledge, tasks, reports, outputs, actions, requests, connections, goals, signals, departments, threads, log, sentActions] = await Promise.all([
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
      db.list('os_connections', { where: w, order: 'created_at', ascending: false, limit: 50 }),
      db.list('os_goals', { where: w }),
      db.list('os_signals', { where: [['tenant_id', '==', tid], ['status', '==', 'open']] }),
      db.list('os_departments', { where: w }),
      db.list('os_threads', { where: [['tenant_id', '==', tid], ['status', '==', 'open']], limit: 100 }),
      db.list('os_build_log', { where: w, order: 'created_at', ascending: false, limit: 30 }),
      db.list('os_actions', { where: [['tenant_id', '==', tid], ['status', '==', 'sent']], order: 'created_at', ascending: false, limit: 1000 }),
    ]);
    const score = scoreTenant({
      metrics, workers, workflows, knowledge,
      onboarded: !!(tenant && tenant.onboarded),
    });

    // Outcome meter: real work the workers delivered (the billable signal).
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const sent30 = sentActions.filter(a => Date.parse(a.created_at || 0) >= cutoff);
    const byWorker = {};
    for (const a of sent30) { const k = a.worker_name || 'A worker'; byWorker[k] = (byWorker[k] || 0) + 1; }
    const delivered = {
      sent_30d: sent30.length,
      sent_total: sentActions.length,
      workers: Object.keys(byWorker).length,
      top: Object.entries(byWorker).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, n]) => ({ name, n })),
    };

    return res.status(200).json({
      me: { id: t.sub, role: t.role || 'owner', email: t.email || null },
      score,
      tenant: tenant ? {
        id: tenant.id, name: tenant.name, onboarded: !!tenant.onboarded,
        summary: tenant.summary || null, plan: tenant.plan || 'trial',
        business_type: tenant.business_type || null, profile: tenant.profile || {},
        digest: tenant.digest !== false,
        channels: tenant.channels || {}, autopilot: !!tenant.autopilot,
        paused: !!tenant.paused, is_installer: !!tenant.is_installer,
      } : null,
      delivered,
      metrics: metrics.sort(bySort),
      workers: workers.sort(bySort),
      workflows: workflows.sort(bySort),
      knowledge: knowledge.sort(bySort),
      tasks: tasks.sort(bySort),
      reports: reports.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
      outputs: outputs.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
      actions,
      requests,
      connections,
      goals: goals.sort(bySort),
      signals: signals.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - { high: 0, medium: 1, low: 2 }[b.severity])),
      departments: departments.sort(bySort),
      threads: threads.sort((a, b) => (b.last_at || b.created_at || '').localeCompare(a.last_at || a.created_at || '')),
      build_log: log,
    });
  } catch (e) {
    console.error('os2-state:', e.message);
    return res.status(500).json({ error: 'Could not load your OS' });
  }
};
