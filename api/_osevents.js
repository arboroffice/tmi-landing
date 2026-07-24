// TMI OS — the event bus that turns one thing happening into a company-wide
// cascade. When something real occurs (a client is won, an invoice goes
// overdue, a lead comes in, a job finishes, a metric crosses a line), we look up
// every active workflow whose trigger matches and start a run of it. That is how
// Finance sets up billing, Ops opens a kickoff, and the COO briefs the owner off
// a single event, automatically.
//
// emitEvent is tenant-scoped and best-effort: a workflow that fails to start
// never blocks the others, and an unknown event type is a no-op.

const db = require('./_db');
const { startRun } = require('./_osflow');

// The events the OS understands. Workflows opt in by setting `trigger` to one.
const EVENTS = ['client_won', 'invoice_overdue', 'lead_created', 'job_completed', 'metric_threshold'];

function isEvent(type) {
  return EVENTS.includes(String(type || ''));
}

// Fire an event for one tenant. Returns the runs that were started (possibly []).
async function emitEvent(tenant, type, context, now) {
  const t = String(type || '');
  if (!tenant || !tenant.id || !isEvent(t)) return [];
  const iso = now || new Date().toISOString();

  const wfs = await db.list('os_workflows', { where: [['tenant_id', '==', tenant.id]] }).catch(() => []);
  const matched = wfs.filter(w => w && w.status !== 'paused' && String(w.trigger || '') === t);

  const runs = [];
  for (const w of matched) {
    try {
      const run = await startRun(tenant, w, Object.assign({ event: t }, context || {}), iso);
      if (run) runs.push(run);
    } catch (e) {
      console.error('emitEvent', tenant.id, w.id, e.message);
    }
  }
  if (runs.length) {
    await db.insert('os_build_log', {
      tenant_id: tenant.id, kind: 'cascade',
      summary: `Event "${t}" fired ${runs.length} cascade${runs.length === 1 ? '' : 's'}.`,
      created_at: iso,
    }).catch(() => {});
  }
  return runs;
}

module.exports = { emitEvent, isEvent, EVENTS };
