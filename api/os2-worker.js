// TMI OS — worker actions. Turn an AI worker on or off, or run a cycle now.
// Every action is scoped to the caller's tenant and logged to the build feed.
//
// POST { id, action: 'toggle' | 'run' } -> { worker } | { ok: true }

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

  const b = req.body || {};
  const id = String(b.id || '');
  const action = String(b.action || '');
  if (!id) return res.status(400).json({ error: 'Worker id required' });

  try {
    const w = await db.getById('os_workers', id);
    if (!w || w.tenant_id !== t.tenant_id) return res.status(404).json({ error: 'Worker not found' });

    if (action === 'toggle') {
      const next = w.status === 'active' ? 'paused' : 'active';
      const worker = await db.update('os_workers', id, { status: next });
      await db.insert('os_build_log', {
        tenant_id: t.tenant_id, kind: 'worker',
        summary: `${next === 'active' ? 'Turned on' : 'Paused'} ${w.name}.`,
        created_at: new Date().toISOString(),
      });
      return res.status(200).json({ worker });
    }

    if (action === 'run') {
      // Actually execute the worker (produce real output, gated by policy),
      // the same path os2-run uses. Previously this faked a build-log entry
      // without doing any work.
      const result = await executeWorker(w, 'manual').catch((e) => ({ error: e.message }));
      if (result && result.error) return res.status(502).json({ error: 'The worker could not run right now.' });
      return res.status(200).json({ ok: true, result });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-worker:', e.message);
    return res.status(500).json({ error: 'Could not update the worker' });
  }
};
