// TMI OS — the whole workspace for the signed-in tenant: command center
// metrics, AI workers, workflows, company knowledge, tasks, generated reports,
// and the build feed. Everything scoped to the caller's tenant_id.
//
// GET -> { tenant, metrics, workers, workflows, knowledge, tasks, reports, build_log }

const db = require('./_db');
const { requireTenant, cors } = require('./_tenant-auth');
const { scoreTenant } = require('./_osscore');
const { isOverdue } = require('./_osrecords');

const bySort = (a, b) => (a.sort || 0) - (b.sort || 0);

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const t = requireTenant(req, res);
  if (!t) return;
  const tid = t.tenant_id;
  const w = [['tenant_id', '==', tid]];

  try {
    const [tenant, metrics, workers, workflows, knowledge, tasks, reports, outputs, actions, requests, connections, goals, signals, departments, threads, log, records, blockedRuns] = await Promise.all([
      db.getById('os_tenants', tid),
      db.list('os_metrics', { where: w }),
      db.list('os_workers', { where: w }),
      db.list('os_workflows', { where: w }),
      db.list('os_knowledge', { where: w }),
      db.list('os_tasks', { where: w }),
      db.list('os_reports', { where: w }),
      db.list('os_outputs', { where: w }),
      db.list('os_actions', { where: w, order: 'created_at', ascending: false, limit: 200 }),
      db.list('os_requests', { where: w, order: 'created_at', ascending: false, limit: 100 }),
      db.list('os_connections', { where: w, order: 'created_at', ascending: false, limit: 50 }),
      db.list('os_goals', { where: w }),
      db.list('os_signals', { where: [['tenant_id', '==', tid], ['status', '==', 'open']] }),
      db.list('os_departments', { where: w }),
      db.list('os_threads', { where: [['tenant_id', '==', tid], ['status', '==', 'open']], limit: 100 }),
      db.list('os_build_log', { where: w, order: 'created_at', ascending: false, limit: 30 }),
      db.list('os_records', { where: w, limit: 1000 }).catch(() => []),
      db.list('os_workflow_runs', { where: [['tenant_id', '==', tid], ['status', '==', 'blocked']], limit: 50 }).catch(() => []),
    ]);

    // Cascade runs blocked on an approval step. Surfaced in the Inbox triage next
    // to worker drafts so every human decision lives in one queue. The prompt the
    // step is asking about lives in the run's last history entry.
    const approvals_runs = blockedRuns.map(r => {
      const hist = Array.isArray(r.history) ? r.history : [];
      const last = hist[hist.length - 1];
      const prompt = (last && last.result && last.result.prompt) ? String(last.result.prompt) : 'Approval required';
      return { id: r.id, workflow_name: r.workflow_name || 'Workflow', prompt, created_at: r.updated_at || r.created_at || null };
    });
    const score = scoreTenant({
      metrics, workers, workflows, knowledge,
      onboarded: !!(tenant && tenant.onboarded),
    });

    // What each worker actually delivered. We count os_outputs (every real work
    // product a worker produced - internal reports AND external messages), not
    // just os_actions with status 'sent'. os_outputs always carries worker_id and
    // covers report-only workers too, so scoreboards populate for every worker.
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const weekCut = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const done = outputs.filter(o => o && o.status !== 'dismissed');
    const done30 = done.filter(o => Date.parse(o.created_at || 0) >= cutoff);
    const byWorker = {};
    for (const o of done30) { const k = o.worker_name || 'A worker'; byWorker[k] = (byWorker[k] || 0) + 1; }
    const delivered = {
      sent_30d: done30.length,
      sent_total: done.length,
      workers: Object.keys(byWorker).length,
      top: Object.entries(byWorker).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, n]) => ({ name, n })),
    };

    // Per-worker scoreboard: week / month / total, keyed by worker_id.
    const worker_stats = {};
    for (const o of done) {
      const id = o.worker_id; if (!id) continue;
      const st = worker_stats[id] || (worker_stats[id] = { week: 0, month: 0, total: 0, last_at: null });
      st.total++;
      const t = Date.parse(o.created_at || 0);
      if (t >= cutoff) st.month++;
      if (t >= weekCut) st.week++;
      if (!st.last_at || (o.created_at || '') > st.last_at) st.last_at = o.created_at || null;
    }

    // Company graph summary: counts by type + AR headline, for the Records view
    // and the command-center tiles.
    const nowMs = Date.now();
    const record_stats = { total: records.length, counts: {}, openInvoices: 0, overdueInvoices: 0, outstanding: 0 };
    for (const r of records) {
      record_stats.counts[r.type] = (record_stats.counts[r.type] || 0) + 1;
      if (r.type === 'invoice') {
        const st = String(r.status || '').toLowerCase();
        if (st !== 'paid' && st !== 'void' && st !== 'draft') {
          record_stats.openInvoices++;
          if (typeof r.amount === 'number') record_stats.outstanding += r.amount;
        }
        if (isOverdue(r, nowMs)) record_stats.overdueInvoices++;
      }
    }
    record_stats.outstanding = Math.round(record_stats.outstanding);

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
      worker_stats,
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
      records: records.sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '')),
      record_stats,
      approvals_runs,
      build_log: log,
    });
  } catch (e) {
    console.error('os2-state:', e.message);
    return res.status(500).json({ error: 'Could not load your OS' });
  }
};
