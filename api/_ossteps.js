// TMI OS — shared workflow-step normalizer. Cascades are only executable if
// their steps are structured objects the engine (_osflow) understands. Anything
// that creates a workflow (owner CRUD, the marketplace, the blueprint, the COO)
// runs its steps through normalizeSteps so no path can save a decorative
// string-only cascade that "runs green" but does nothing.
//
// Step types the engine executes: note, worker, task, metric, notify, approval,
// wait, branch. A plain string is preserved as a note (legacy safety).

const STEP_TYPES = ['note', 'worker', 'task', 'metric', 'notify', 'approval', 'wait', 'branch'];

// The events a workflow trigger may bind to (plus 'manual'). Anything else is
// coerced to 'manual' so a freetext sentence never silently fails to match.
const TRIGGERS = ['manual', 'client_won', 'invoice_overdue', 'lead_created', 'job_completed', 'metric_threshold'];

function normalizeTrigger(t) {
  const s = String(t || 'manual');
  return TRIGGERS.includes(s) ? s : 'manual';
}

function normalizeSteps(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 20).map((s) => {
    if (s && typeof s === 'object' && !Array.isArray(s)) {
      const type = STEP_TYPES.includes(String(s.type)) ? String(s.type) : 'note';
      const o = { type };
      if (type === 'worker') o.worker_id = String(s.worker_id || '').slice(0, 64);
      else if (type === 'wait') o.until_ms = Math.max(0, Number(s.until_ms) || (Number(s.days) ? Number(s.days) * 86400000 : 0));
      else if (type === 'approval') o.prompt = String(s.prompt || 'Approval required').slice(0, 300);
      else if (type === 'task') { o.title = String(s.title || '').slice(0, 200); o.priority = s.priority === 'high' ? 'high' : 'normal'; }
      else if (type === 'metric') { o.label = String(s.label || '').slice(0, 80); o.value = String(s.value == null ? '' : s.value).slice(0, 80); }
      else if (type === 'notify') o.text = String(s.text || '').slice(0, 400);
      else if (type === 'branch') {
        o.condition = (s.condition && typeof s.condition === 'object')
          ? { field: String(s.condition.field || '').slice(0, 60), op: String(s.condition.op || '==').slice(0, 10), value: s.condition.value }
          : null;
        o.if_true = Number.isInteger(s.if_true) ? s.if_true : null;
        o.if_false = Number.isInteger(s.if_false) ? s.if_false : null;
      } else o.text = String(s.text || '').slice(0, 400);
      return o;
    }
    return { type: 'note', text: s == null ? '' : String(s).slice(0, 400) };
  });
}

module.exports = { normalizeSteps, normalizeTrigger, STEP_TYPES, TRIGGERS };
