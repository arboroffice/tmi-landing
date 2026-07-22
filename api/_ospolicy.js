// TMI OS - the governance and policy model. This is the layer that decides,
// before any action fires, whether a worker may act on its own ('auto'), must
// wait for a human to approve ('approve'), or is blocked outright ('deny').
//
// Policy is layered: a company-wide kill switch (tenant.paused), then explicit
// os_policies rows (worker beats department beats tenant-wide), then sensible
// defaults keyed on whether the action is internal or reaches the outside world.
// Spend limits narrow an otherwise-auto action back down to approval.
//
// os_policies fields:
//   { tenant_id, scope:'tenant'|'department'|'worker', scope_id,
//     action_type, mode, daily_limit, per_action_limit, updated_at }

const db = require('./_db');

const INTERNAL_ACTIONS = ['note', 'task', 'internal'];
const EXTERNAL_ACTIONS = ['email', 'sms', 'payment', 'external_write', 'booking'];

const VALID_MODES = ['auto', 'approve', 'deny'];
const VALID_SCOPES = ['tenant', 'department', 'worker'];

// Rank so a more specific policy wins: worker (3) beats department (2) beats
// tenant-wide (1).
const SCOPE_RANK = { worker: 3, department: 2, tenant: 1 };

// Decide the mode for one proposed action.
// tenant / worker may be null; when in doubt we return 'approve' (a human sees it)
// rather than 'auto' (fires unseen) or 'deny' (silently blocked).
function evaluate(tenant, worker, actionType, amount) {
  const type = String(actionType || 'internal');

  if (tenant && tenant.paused === true) {
    return { mode: 'deny', reason: 'Company autonomy is paused.' };
  }

  const policy = pickPolicy(tenant && tenant._policies, worker, type);

  // An explicit policy mode is authoritative for auto/approve/deny, but spend
  // limits can still pull an 'auto' back to 'approve'.
  if (policy && VALID_MODES.includes(policy.mode)) {
    if (policy.mode === 'deny') {
      return { mode: 'deny', reason: `A policy blocks ${type} actions.` };
    }
    if (policy.mode === 'approve') {
      return { mode: 'approve', reason: `A policy sends ${type} actions to approval.` };
    }
    // policy.mode === 'auto' - check spend before letting it run unattended.
    const spend = checkSpend(policy, amount);
    if (spend) return spend;
    return { mode: 'auto', reason: `A policy lets this worker run ${type} actions on its own.` };
  }

  // No explicit policy: fall back to defaults by action class.
  if (INTERNAL_ACTIONS.includes(type)) {
    return { mode: 'auto', reason: `Internal ${type} actions run on their own.` };
  }

  const isExternal = EXTERNAL_ACTIONS.includes(type);
  const canAuto = worker && worker.autonomy === 'auto' && tenant && tenant.autopilot === true;
  if (isExternal && canAuto) {
    const spend = checkSpend(policy, amount);
    if (spend) return spend;
    return { mode: 'auto', reason: `Autopilot is on and this worker is autonomous, so ${type} runs on its own.` };
  }

  // Default for external work (or anything unrecognized): a human approves.
  return { mode: 'approve', reason: `${type} actions wait for a person to approve.` };
}

// If amount exceeds the policy's per_action_limit, pull back to approval. Well
// over the limit (more than 5x) still approves, but the reason flags the size.
// Returns a decision object to short-circuit with, or null to continue.
function checkSpend(policy, amount) {
  const limit = policy && Number(policy.per_action_limit);
  if (typeof amount !== 'number' || !isFinite(amount)) return null;
  if (!limit || !isFinite(limit) || limit <= 0) return null;
  if (amount <= limit) return null;
  if (amount > limit * 5) {
    return { mode: 'approve', reason: `Amount ${amount} is far over the ${limit} per-action limit and needs a person to approve.` };
  }
  return { mode: 'approve', reason: `Amount ${amount} is over the ${limit} per-action limit and needs a person to approve.` };
}

// Choose the applicable policy from a list, matching action_type and preferring
// the most specific scope (worker > department > tenant).
function pickPolicy(policies, worker, type) {
  if (!Array.isArray(policies) || !policies.length) return null;
  const workerId = worker && worker.id != null ? String(worker.id) : null;
  const deptId = worker && worker.department_id != null ? String(worker.department_id) : null;

  let best = null;
  let bestRank = -1;
  for (const p of policies) {
    if (!p || String(p.action_type) !== type) continue;
    let match = false;
    if (p.scope === 'worker') match = workerId != null && String(p.scope_id) === workerId;
    else if (p.scope === 'department') match = deptId != null && String(p.scope_id) === deptId;
    else if (p.scope === 'tenant') match = true;
    if (!match) continue;
    const rank = SCOPE_RANK[p.scope] || 0;
    if (rank > bestRank) { best = p; bestRank = rank; }
  }
  return best;
}

// All policy docs for a tenant, newest updates first.
async function getPolicies(tenantId) {
  const rows = await db.list('os_policies', { where: [['tenant_id', '==', String(tenantId)]] });
  rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return rows;
}

// Create or replace a policy (upsert by tenant_id + scope + scope_id + action_type).
async function setPolicy(tenantId, spec) {
  const tid = String(tenantId);
  const s = spec || {};
  const scope = VALID_SCOPES.includes(s.scope) ? s.scope : 'tenant';
  const scopeId = s.scope_id != null ? String(s.scope_id) : '';
  const actionType = String(s.action_type || 'internal');
  const mode = VALID_MODES.includes(s.mode) ? s.mode : 'approve';
  const fields = {
    tenant_id: tid,
    scope,
    scope_id: scopeId,
    action_type: actionType,
    mode,
    daily_limit: toNum(s.daily_limit),
    per_action_limit: toNum(s.per_action_limit),
    updated_at: new Date().toISOString(),
  };

  const rows = await db.list('os_policies', { where: [['tenant_id', '==', tid], ['action_type', '==', actionType]] });
  const existing = rows.find(p => p.scope === scope && String(p.scope_id || '') === scopeId);
  if (existing) return db.update('os_policies', existing.id, fields);
  return db.insert('os_policies', fields);
}

// The company-wide kill switch. on=true pauses all worker autonomy.
async function killSwitch(tenantId, on) {
  await db.update('os_tenants', String(tenantId), { paused: on === true });
  return on === true;
}

function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

module.exports = { evaluate, getPolicies, setPolicy, killSwitch };
