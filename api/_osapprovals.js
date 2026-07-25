// TMI OS - the approval layer. Two very different things in the OS wait on a
// human yes/no before they count: a worker's output that carries a real outbound
// action (an email or text to a named recipient), and a cascade run that has hit
// an approval step and is blocked. Historically each had its own screen and its
// own endpoint, so the owner had to know to look in two places. This module is
// the single source of truth for what is waiting and how to release it, so the
// inbox action endpoint (os2-act) and the unified queue (os2-approvals) share one
// implementation and can never drift.

const db = require('./_db');
const { runAction, normalizeAction } = require('./_osact');
const { evaluate, getPolicies, getSpentToday } = require('./_ospolicy');
const { approveRun } = require('./_osflow');

function log(tid, summary, kind) {
  return db.insert('os_build_log', { tenant_id: tid, kind: kind || 'act', summary, created_at: new Date().toISOString() }).catch(() => {});
}

// A hard stop the owner set deliberately (a "Never" rule for this action type, or
// the company-wide pause) blocks even a manual approve/send. "Ask me first" does
// not block here, because approving IS the human saying yes.
async function hardStop(tenant, rawAction) {
  const a = normalizeAction(rawAction);
  if (!a || a.channel === 'internal') return null;
  if (!tenant._policies) tenant._policies = await getPolicies(tenant.id).catch(() => []);
  if (!tenant._spentToday) tenant._spentToday = await getSpentToday(tenant.id).catch(() => ({}));
  const d = evaluate(tenant, null, String(a.channel), typeof a.amount === 'number' ? a.amount : undefined);
  return d.mode === 'deny' ? d.reason : null;
}

// Approve one pending output. If it carries an action, this actually delivers it
// through the tenant's connected channel (unless a hard-stop policy denies it)
// and records the audit entry. The approver may edit the draft body/subject
// before it goes; the edited wording is what gets sent and saved.
// Returns { output } or { output, act } on success, or { blocked, reason, output }
// when a deliberate policy stop refuses the send.
async function approveOutput(tenant, output, opts = {}) {
  const tid = tenant.id;
  const editedBody = typeof opts.body === 'string' ? opts.body.slice(0, 12000) : null;
  const editedSubject = typeof opts.subject === 'string' ? opts.subject.slice(0, 200) : null;

  let outAction = output.action;
  if (outAction && (editedBody != null || editedSubject != null)) {
    outAction = Object.assign({}, outAction);
    if (editedBody != null) outAction.body = editedBody.slice(0, 8000);
    if (editedSubject != null) outAction.subject = editedSubject;
  }

  let act = null;
  if (outAction) {
    const blocked = await hardStop(tenant, outAction);
    if (blocked) return { blocked: true, reason: blocked, output };
    act = await runAction({ tenant, output, worker_name: output.worker_name, actor: opts.actor || 'owner' }, outAction);
  }

  const patch = { status: 'done', reason: null };
  if (editedBody != null) patch.body = editedBody;
  if (outAction && output.action) patch.action = outAction;
  if (act) patch.action_status = act.status;
  const updated = await db.update('os_outputs', output.id, patch);

  const tail = act
    ? (act.status === 'sent' ? ` and ${act.detail.replace(/\.$/, '').toLowerCase()}`
      : act.status === 'staged' ? ' (channel not connected yet)'
      : act.status === 'failed' ? ' (send failed)' : '')
    : '';
  await log(tid, `Approved ${output.worker_name || 'a worker'}'s ${output.title}${tail}.`);
  return { output: updated, act };
}

// Decline a pending output. Nothing is sent; it drops out of the queue.
async function dismissOutput(tenant, output) {
  const updated = await db.update('os_outputs', output.id, { status: 'dismissed' });
  await log(tenant.id, `Declined ${output.worker_name || 'a worker'}'s ${output.title || 'draft'}.`);
  return updated;
}

// Release a cascade run that is blocked on an approval step and continue past it.
async function approveBlockedRun(tenant, run) {
  const updated = await approveRun(run, new Date().toISOString());
  await log(tenant.id, `Approved the "${run.workflow_name || 'workflow'}" cascade to continue.`, 'cascade');
  return updated;
}

// Decline a blocked run: it stops here and never advances past the approval.
async function dismissBlockedRun(tenant, run) {
  const updated = await db.update('os_workflow_runs', run.id, { status: 'cancelled', updated_at: new Date().toISOString() });
  await log(tenant.id, `Declined the "${run.workflow_name || 'workflow'}" cascade at its approval step.`, 'cascade');
  return updated || run;
}

// The pending prompt on a blocked run lives in its last history entry.
function runPrompt(run) {
  const hist = Array.isArray(run.history) ? run.history : [];
  const last = hist[hist.length - 1];
  return (last && last.result && last.result.prompt) ? String(last.result.prompt) : 'Approval required';
}

// Build the unified queue: every output and cascade waiting on a human decision,
// normalized to one shape and sorted newest first. This is the read side of the
// single approvals screen.
async function listApprovals(tid) {
  const [outputs, runs] = await Promise.all([
    db.list('os_outputs', { where: [['tenant_id', '==', tid], ['status', '==', 'pending']] }).catch(() => []),
    db.list('os_workflow_runs', { where: [['tenant_id', '==', tid], ['status', '==', 'blocked']] }).catch(() => []),
  ]);

  const items = [];
  for (const o of outputs) {
    const a = o.action ? normalizeAction(o.action) : null;
    items.push({
      kind: 'output',
      id: o.id,
      title: o.title || 'Draft',
      worker_name: o.worker_name || null,
      reason: o.reason || null,
      body: String(o.body || ''),
      has_action: !!a,
      channel: a ? a.channel : null,
      to: a ? a.to : null,
      subject: a ? (a.subject || null) : null,
      created_at: o.created_at || null,
    });
  }
  for (const r of runs) {
    items.push({
      kind: 'run',
      id: r.id,
      title: r.workflow_name || 'Workflow',
      worker_name: null,
      reason: runPrompt(r),
      body: '',
      has_action: false,
      channel: null,
      to: null,
      subject: null,
      created_at: r.updated_at || r.created_at || null,
    });
  }
  items.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return items;
}

module.exports = {
  hardStop,
  approveOutput,
  dismissOutput,
  approveBlockedRun,
  dismissBlockedRun,
  listApprovals,
  runPrompt,
};
