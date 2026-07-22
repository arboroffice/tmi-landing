// TMI OS - executable workflow engine. Sits on top of the existing os_workflows
// docs without breaking them: a workflow's `steps` may be a list of plain
// strings (each treated as a note) or objects `{type, ...}`. A run is a stored
// os_workflow_runs doc that walks the steps forward, one step at a time, and can
// pause on a timed wait or block on a human approval and be resumed later.
//
// Step types:
//   {type:'note', text}                       -> record a log line, advance.
//   {type:'worker', worker_id}                -> load the tenant's worker and
//                                                execute it, store the output id.
//   {type:'wait', until_ms}                    -> mark 'waiting' with resume_at.
//   {type:'approval', prompt}                  -> mark 'blocked' until approved.
//   {type:'branch', condition, if_true, if_false}
//                                              -> pick the next step index by a
//                                                 simple condition on context.
//
// A condition is {field, op, value} where op is one of ==, !=, >, <, contains.
// No eval is ever used. Time is never read at module load: every function takes
// a `now` argument (an ISO string or numeric ms), and numeric needs are derived
// from it, so the same run is deterministic given the same inputs.

const db = require('./_db');
const { executeWorker } = require('./_osrun');

const RUNS = 'os_workflow_runs';
const MAX_STEPS_PER_ADVANCE = 25;
// Values at or above this are treated as an absolute epoch (ms), below it as a
// delay added to now. 1e12 ms is well before the present, so real "wait N ms"
// delays stay delays and real future timestamps stay absolute.
const ABS_MS_THRESHOLD = 1e12;

function nowMs(now) {
  const n = typeof now === 'number' ? now : Date.parse(now);
  return Number.isFinite(n) ? n : 0;
}
function nowIso(now) {
  if (typeof now === 'string' && now) return now;
  const n = nowMs(now);
  return new Date(n).toISOString();
}

// Coerce one raw step into an object with a `type`. Strings and anything that is
// not an object become a note step, so legacy string-only workflows still run.
function coerceStep(s) {
  if (s && typeof s === 'object' && !Array.isArray(s)) {
    return Object.assign({ type: 'note' }, s, { type: String(s.type || 'note') });
  }
  return { type: 'note', text: s == null ? '' : String(s) };
}

function coerceSteps(workflow) {
  const raw = workflow && Array.isArray(workflow.steps) ? workflow.steps : [];
  return raw.map(coerceStep);
}

// Evaluate a simple, safe condition against the run context. Returns a boolean.
function evalCondition(cond, context) {
  if (!cond || typeof cond !== 'object') return false;
  const ctx = context || {};
  const left = ctx[cond.field];
  const right = cond.value;
  switch (String(cond.op)) {
    case '==': return left === right;
    case '!=': return left !== right;
    case '>': return Number(left) > Number(right);
    case '<': return Number(left) < Number(right);
    case 'contains':
      if (Array.isArray(left)) return left.includes(right);
      return String(left == null ? '' : left).includes(String(right == null ? '' : right));
    default: return false;
  }
}

// Persist the run's current position and return the mutated run object.
async function persist(run, fields) {
  Object.assign(run, fields);
  const saved = await db.update(RUNS, run.id, fields);
  return saved || run;
}

// Walk steps from run.step forward until the run ends, waits, blocks, errors, or
// hits the per-call step cap. Every step is guarded: a step error records itself
// in history and sets status 'error' without throwing.
async function advance(run, now) {
  const iso = nowIso(now);
  const ms = nowMs(now);
  const steps = Array.isArray(run.steps) ? run.steps.map(coerceStep) : [];
  const history = Array.isArray(run.history) ? run.history.slice() : [];
  let idx = typeof run.step === 'number' && run.step >= 0 ? run.step : 0;
  let status = 'running';
  let resume_at = run.resume_at != null ? run.resume_at : null;
  let executed = 0;

  while (idx < steps.length && executed < MAX_STEPS_PER_ADVANCE) {
    executed++;
    const step = coerceStep(steps[idx]);
    const type = String(step.type || 'note');
    const entry = { step: idx, type, result: null, at: iso };
    try {
      if (type === 'worker') {
        const worker = await db.getById('os_workers', String(step.worker_id || ''));
        if (!worker || worker.tenant_id !== run.tenant_id) throw new Error('worker not found for this tenant');
        const output = await executeWorker(worker, 'workflow');
        entry.result = { worker_id: worker.id, output_id: output && output.id ? output.id : null };
        history.push(entry);
        idx++;
      } else if (type === 'wait') {
        const dur = Number(step.until_ms) || 0;
        resume_at = dur >= ABS_MS_THRESHOLD ? dur : ms + dur;
        entry.result = { resume_at };
        history.push(entry);
        idx++; // move past the wait so a resume continues at the next step
        status = 'waiting';
        break;
      } else if (type === 'approval') {
        entry.result = { prompt: String(step.prompt || 'Approval required'), awaiting: true };
        history.push(entry);
        status = 'blocked'; // stay on this step until approveRun advances past it
        break;
      } else if (type === 'branch') {
        const met = evalCondition(step.condition, run.context);
        const target = met ? step.if_true : step.if_false;
        const next = Number.isInteger(target) && target >= 0 ? target : idx + 1;
        entry.result = { condition_met: met, next };
        history.push(entry);
        idx = next;
      } else {
        entry.result = { text: String(step.text || '') };
        history.push(entry);
        idx++;
      }
    } catch (e) {
      entry.result = { error: e && e.message ? e.message : String(e) };
      history.push(entry);
      status = 'error';
      break;
    }
  }

  if (status === 'running' && idx >= steps.length) status = 'done';

  const fields = { step: idx, status, history, updated_at: iso };
  if (resume_at != null) fields.resume_at = resume_at;
  return persist(run, fields);
}

// Create a run for a workflow and immediately advance it. `tenant` is the loaded
// os_tenants doc; its id becomes the run's tenant_id for scoping worker steps.
async function startRun(tenant, workflow, context, now) {
  const iso = nowIso(now);
  const run = await db.insert(RUNS, {
    tenant_id: tenant.id,
    workflow_id: workflow.id,
    workflow_name: workflow.name || '',
    status: 'running',
    step: 0,
    context: context || {},
    steps: coerceSteps(workflow),
    history: [],
    created_at: iso,
    updated_at: iso,
  });
  return advance(run, now);
}

// Release a run that is blocked on an approval step and continue past it.
async function approveRun(run, now) {
  if (!run || run.status !== 'blocked') return run;
  run.step = (typeof run.step === 'number' ? run.step : 0) + 1;
  run.status = 'running';
  return advance(run, now);
}

module.exports = {
  startRun,
  advance,
  approveRun,
  coerceStep,
  coerceSteps,
  evalCondition,
};
