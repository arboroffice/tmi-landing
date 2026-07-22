// TMI OS — invoke a worker's tool. This is the Phase 1 action path: a worker
// with granted connector actions can take a real, policy-gated, audited action
// (create an invoice, book a job, post to Slack, hit an HTTP endpoint). The
// policy layer decides auto / approve / deny and the audit log records it.
//
// POST { action }
//   'tools' { worker_id }               -> { tools }   what this worker can do
//   'run'   { worker_id, tool, input }  -> { result }   invoke one, policy-gated

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');
const { toolsForWorker, executeTool } = require('./_ostools');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;
  const tid = t.tenant_id;
  const b = req.body || {};
  const action = String(b.action || '');

  try {
    const tenant = await db.getById('os_tenants', tid);
    if (!tenant) return res.status(404).json({ error: 'Company not found' });

    const worker = await db.getById('os_workers', String(b.worker_id || ''));
    if (!worker || worker.tenant_id !== tid) return res.status(404).json({ error: 'Worker not found' });

    if (action === 'tools') {
      return res.status(200).json({ tools: toolsForWorker(tenant, worker) });
    }

    if (action === 'run') {
      if (!requireRole(t, res, 'manager')) return;
      const tool = String(b.tool || '');
      if (!tool) return res.status(400).json({ error: 'tool required' });
      const result = await executeTool(tenant, worker, tool, b.input || {}, t.email || 'owner');
      return res.status(200).json({ result });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-tool:', e.message);
    return res.status(500).json({ error: e.message || 'Could not run the tool' });
  }
};

module.exports.config = { maxDuration: 45 };
