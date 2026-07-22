// TMI OS - governance controls (in-app). A manager can read the company's
// policies and autonomy state; only the owner can change a policy or hit the
// kill switch that pauses every worker at once.
//
// POST { action, ... }
//   'list'                                              -> { policies, paused, autopilot }
//   'set'   { scope, scope_id, action_type, mode, daily_limit, per_action_limit } (owner) -> { policy }
//   'pause' { on } (owner)                              -> { paused }

const db = require('./_db');
const policy = require('./_ospolicy');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');

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
    const tenant = await db.getById('os_tenants', tid);
    if (!tenant) return res.status(404).json({ error: 'Company not found' });

    if (action === 'list') {
      if (!requireRole(t, res, 'viewer')) return;
      const policies = await policy.getPolicies(tid);
      return res.status(200).json({
        policies,
        paused: tenant.paused === true,
        autopilot: !!tenant.autopilot,
      });
    }

    if (action === 'set') {
      if (!requireRole(t, res, 'owner')) return;
      const saved = await policy.setPolicy(tid, {
        scope: b.scope,
        scope_id: b.scope_id,
        action_type: b.action_type,
        mode: b.mode,
        daily_limit: b.daily_limit,
        per_action_limit: b.per_action_limit,
      });
      return res.status(200).json({ policy: saved });
    }

    if (action === 'pause') {
      if (!requireRole(t, res, 'owner')) return;
      const paused = await policy.killSwitch(tid, b.on === true);
      return res.status(200).json({ paused });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-policy:', e.message);
    return res.status(500).json({ error: 'Could not update your governance settings' });
  }
};
