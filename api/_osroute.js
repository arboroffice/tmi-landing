// TMI OS — inbound routing. When a message lands in the shared inbox, this
// decides which worker should own it. It is deliberately cheap: no Claude call,
// just a pick from the tenant's active workers. Preference order is an explicit
// inbound flag, then a front-desk / intake role, then the first active worker.
// Returns ids only so callers can stamp the thread.

const db = require('./_db');

const INTAKE_HINTS = ['front desk', 'front-desk', 'frontdesk', 'intake', 'reception', 'dispatch', 'inbox', 'customer', 'support', 'concierge', 'scheduler', 'coordinator'];

function looksIntake(worker) {
  const hay = `${worker.role || ''} ${worker.job || ''} ${worker.name || ''}`.toLowerCase();
  return INTAKE_HINTS.some(h => hay.includes(h));
}

// tenant: the tenant doc (needs .id). thread: the thread being routed.
// -> { department_id, worker_id } (either may be null).
async function routeInbound(tenant, thread) {
  const tid = (tenant && tenant.id) || (thread && thread.tenant_id);
  const empty = { department_id: null, worker_id: null };
  if (!tid) return empty;

  const workers = await db.list('os_workers', { where: [['tenant_id', '==', tid]] }).catch(() => []);
  const active = workers.filter(w => (w.status || 'active') === 'active');
  if (!active.length) return empty;

  const flagged = active.find(w => w.inbound === true);
  const chosen = flagged || active.find(looksIntake) || active[0];
  if (!chosen) return empty;

  return {
    department_id: chosen.department_id || null,
    worker_id: chosen.id || null,
  };
}

module.exports = { routeInbound };
