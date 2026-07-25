// TMI OS — the unified approval queue. One screen, one badge, for everything in
// the company waiting on a human yes/no: worker outputs held for review (a draft
// email or text to a real recipient) and cascade runs blocked on an approval
// step. The read side merges both into one time-ordered list; approve/dismiss
// route to the shared approval layer so this can never diverge from the inbox.
//
// POST { action, ... }
//   'list'                                    -> { items, count }
//   'approve' { kind, id, body?, subject? }   (manager) -> depends on kind
//   'dismiss' { kind, id }                    (manager) -> { ok: true }
//
// kind is 'output' or 'run'. For an output, body/subject optionally edit the
// draft before it is delivered.

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');
const {
  approveOutput, dismissOutput, approveBlockedRun, dismissBlockedRun, listApprovals,
} = require('./_osapprovals');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;
  const tid = t.tenant_id;
  const b = req.body || {};
  const action = String(b.action || 'list');

  try {
    if (action === 'list') {
      const items = await listApprovals(tid);
      return res.status(200).json({ items, count: items.length });
    }

    // Deciding on anything is a change: viewers are read-only.
    if (!requireRole(t, res, 'manager')) return;

    const kind = String(b.kind || '');
    const id = String(b.id || '');
    if (!id) return res.status(400).json({ error: 'id required' });

    if (action === 'approve') {
      const tenant = await db.getById('os_tenants', tid);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

      if (kind === 'output') {
        const output = await db.getById('os_outputs', id);
        if (!output || output.tenant_id !== tid) return res.status(404).json({ error: 'Item not found' });
        if (output.status !== 'pending') return res.status(409).json({ error: 'This one was already handled.' });
        const result = await approveOutput(tenant, output, { body: b.body, subject: b.subject, actor: t.email || 'owner' });
        if (result.blocked) return res.status(200).json({ blocked: true, reason: result.reason, item: result.output });
        return res.status(200).json({ output: result.output, act: result.act });
      }
      if (kind === 'run') {
        const run = await db.getById('os_workflow_runs', id);
        if (!run || run.tenant_id !== tid) return res.status(404).json({ error: 'Item not found' });
        if (run.status !== 'blocked') return res.status(409).json({ error: 'This cascade already moved on.' });
        const updated = await approveBlockedRun(tenant, run);
        return res.status(200).json({ run: updated });
      }
      return res.status(400).json({ error: 'Unknown kind' });
    }

    if (action === 'dismiss') {
      const tenant = await db.getById('os_tenants', tid);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

      if (kind === 'output') {
        const output = await db.getById('os_outputs', id);
        if (!output || output.tenant_id !== tid) return res.status(404).json({ error: 'Item not found' });
        await dismissOutput(tenant, output);
        return res.status(200).json({ ok: true });
      }
      if (kind === 'run') {
        const run = await db.getById('os_workflow_runs', id);
        if (!run || run.tenant_id !== tid) return res.status(404).json({ error: 'Item not found' });
        await dismissBlockedRun(tenant, run);
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: 'Unknown kind' });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-approvals:', e.message);
    return res.status(500).json({ error: 'Could not complete that' });
  }
};

module.exports.config = { maxDuration: 30 };
