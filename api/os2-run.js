// TMI OS — run a worker on demand. The worker actually does its job: Claude
// produces the real, ready-to-use work product grounded only in this tenant's
// knowledge and context, saved to the tenant's inbox. See _osrun for the shared
// execution used by both this endpoint and the scheduled sweep (os2-cron).
//
// POST { id } -> { output }

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');
const { executeWorker } = require('./_osrun');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;
  if (!requireRole(t, res, 'manager')) return;

  const id = String((req.body && req.body.id) || '');
  if (!id) return res.status(400).json({ error: 'Worker id required' });

  try {
    const worker = await db.getById('os_workers', id);
    if (!worker || worker.tenant_id !== t.tenant_id) return res.status(404).json({ error: 'Worker not found' });
    const output = await executeWorker(worker, 'manual');
    return res.status(200).json({ output });
  } catch (e) {
    console.error('os2-run:', e.message);
    return res.status(502).json({ error: 'The worker could not finish. Try again in a moment.' });
  }
};
