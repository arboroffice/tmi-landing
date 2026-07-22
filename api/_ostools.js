// TMI OS — the tool bridge. This is the seam between an AI worker and the real
// world: it turns the connector actions a worker has been granted into Claude
// tool-use definitions, and it executes a tool call under policy control with a
// permanent audit trail. A worker can only touch what its tenant connected and
// what policy allows; every attempt (allowed, held, or denied) is recorded.
//
// worker.tools is an array of strings, each either a whole provider ("stripe")
// or a single action ("stripe.create_payment_link"). Tool names replace '.'
// with '__' so they are safe for Claude's tool-name rules.

const connectors = require('./_osconnectors');
const ossecrets = require('./_ossecrets');
const ospolicy = require('./_ospolicy');
const osaudit = require('./_osaudit');

// -------------------------------------------------------------------------
// Tool-name <-> provider/action mapping
// -------------------------------------------------------------------------
function toolName(provider, actionKey) {
  return `${provider}.${actionKey}`.replace(/\./g, '__');
}

// Split "stripe__create_payment_link" back into provider + action. The provider
// key is the first segment; the action is everything after the first '__'.
function parseToolName(name) {
  const s = String(name || '');
  const i = s.indexOf('__');
  if (i === -1) return { provider: s, action: '' };
  return { provider: s.slice(0, i), action: s.slice(i + 2) };
}

// Build a JSON-schema property for a named param.
function paramSchema(pname) {
  if (pname === 'amount' || pname === 'limit') return { type: 'number' };
  if (['headers', 'body', 'payload', 'line_items', 'attendees', 'fields'].includes(pname)) {
    return { type: 'object', description: `${pname} (object or array)` };
  }
  return { type: 'string' };
}

function toolDef(provider, action) {
  const conn = connectors.getConnector(provider);
  const props = {};
  (action.params || []).forEach((pn) => { props[pn] = paramSchema(pn); });
  return {
    name: toolName(provider, action.key),
    description: `${action.label} via ${conn ? conn.label : provider}.`,
    input_schema: { type: 'object', properties: props },
  };
}

// Expand worker.tools into concrete {provider, action} pairs.
function grantedActions(worker) {
  const grants = (worker && Array.isArray(worker.tools)) ? worker.tools : [];
  const out = [];
  const seen = new Set();
  for (const raw of grants) {
    const g = String(raw || '').trim();
    if (!g) continue;
    const dot = g.indexOf('.');
    const provider = dot === -1 ? g : g.slice(0, dot);
    const actionKey = dot === -1 ? null : g.slice(dot + 1);
    const conn = connectors.getConnector(provider);
    if (!conn) continue;
    for (const action of conn.actions) {
      if (actionKey && action.key !== actionKey) continue;
      const id = `${provider}.${action.key}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ provider, action });
    }
  }
  return out;
}

// -------------------------------------------------------------------------
// toolsForWorker(tenant, worker) -> [Claude tool definitions]
// -------------------------------------------------------------------------
function toolsForWorker(tenant, worker) {
  return grantedActions(worker).map(({ provider, action }) => toolDef(provider, action));
}

// -------------------------------------------------------------------------
// executeTool(tenant, worker, toolName, input, actor)
//   -> { status:'done'|'pending'|'denied'|'staged'|'failed', result?, reason? }
// -------------------------------------------------------------------------
async function executeTool(tenant, worker, name, input, actor) {
  const inp = (input && typeof input === 'object') ? input : {};
  const { provider, action } = parseToolName(name);
  const conn = connectors.getConnector(provider);
  const actDef = conn ? (conn.actions || []).find((a) => a.key === action) : null;
  const writes = !!(actDef && actDef.writes);
  const actionType = writes ? 'external_write' : 'internal';
  const target = `${provider}.${action}`;

  let amount;
  if (inp.amount != null) {
    const n = Number(inp.amount);
    if (!Number.isNaN(n)) amount = n;
  }

  const tenantId = tenant && tenant.id;
  const workerId = worker && worker.id;

  // Safe audit wrapper — an audit failure must never break execution.
  async function audit(status, summary, result) {
    try {
      await osaudit.record(tenantId, {
        actor: actor || 'worker',
        action_type: actionType,
        target,
        summary,
        input: inp,
        result: result != null ? result : null,
        status,
        reversible: !writes,
        worker_id: workerId,
        amount,
      });
    } catch (_e) { /* auditing is best-effort */ }
  }

  // 1) Policy decision. evaluate() is synchronous and reads tenant._policies,
  // so load and attach the tenant's policies first.
  let policy;
  try {
    if (tenant && !tenant._policies) {
      try { tenant._policies = await ospolicy.getPolicies(tenantId); } catch (_p) { tenant._policies = []; }
    }
    policy = ospolicy.evaluate(tenant, worker, actionType, amount);
  } catch (_e) {
    policy = { mode: 'approve', reason: 'policy unavailable, holding for approval' };
  }
  const mode = policy && policy.mode;
  const reason = policy && policy.reason;

  if (mode === 'deny') {
    await audit('denied', `Denied ${target}: ${reason || 'policy'}`, null);
    return { status: 'denied', reason };
  }

  if (mode === 'approve') {
    // Held for a human. Do NOT execute.
    await audit('pending', `Awaiting approval for ${target}`, null);
    return { status: 'pending', reason };
  }

  // 2) mode === 'auto' (or anything else falls through to executing) — run it.
  let secret = null;
  try { secret = await ossecrets.getSecret(tenantId, provider); } catch (_e) { secret = null; }

  let exec;
  try {
    exec = await connectors.execute(provider, action, inp, secret);
  } catch (e) {
    exec = { ok: false, error: e && e.message ? e.message : String(e) };
  }
  exec = exec || { ok: false, error: 'no result' };

  if (exec.ok) {
    await audit('done', `Ran ${target}`, exec.result != null ? exec.result : exec);
    return { status: 'done', result: exec.result };
  }
  if (exec.staged) {
    await audit('staged', `Staged ${target}: ${exec.note || 'connector not wired live'}`, exec);
    return { status: 'staged', reason: exec.note || 'connector not wired live', result: exec };
  }
  await audit('failed', `Failed ${target}: ${exec.error || 'error'}`, exec);
  return { status: 'failed', reason: exec.error || 'execution failed', result: exec };
}

module.exports = { toolsForWorker, executeTool, toolName, parseToolName };
