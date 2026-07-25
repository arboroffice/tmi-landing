// TMI OS — shared worker execution. Given a worker, Claude produces the real,
// ready-to-use work product grounded only in that tenant's knowledge and
// context, and it is saved as an output (pending approval for "ask first"
// workers, done otherwise), with the worker's last_run stamped and an activity
// log entry written. Used by the manual run endpoint (os2-run) and the
// scheduled sweep (os2-cron).

const db = require('./_db');
const { normalizeAction, runAction } = require('./_osact');
const { evaluate, getPolicies, getSpentToday } = require('./_ospolicy');
const llm = require('./_osllm');
const { startTrace, addSpan, finishTrace } = require('./_ostrace');
const { validateOutput } = require('./_osguard');

const MODEL = 'claude-opus-4-8';

const SYSTEM = `You are an AI worker inside a company's TMI OS. You will be given your role and the company's context. Do the job now and produce the actual, ready-to-use work product: the real message, list, summary, estimate, or draft, not a description of what you would do. Ground everything only in the company's knowledge and context. If a live data source is missing, produce the best draft from what is known and briefly note the assumption in one line. No preamble, no emojis, no em dashes.

If, and only if, your work product is a message meant to be delivered to one specific recipient (a customer, a lead, a vendor, or a teammate) and you can identify who from the context, also return an "action" describing how it should be delivered. Use channel "email" or "sms". Put the recipient in "to" (an email address or phone number only if the context contains a real one; otherwise leave "to" empty and omit the action). Never invent a contact. Work that is internal (a report, an SOP, an analysis, a plan) has no action.

Return ONLY valid JSON: {"title":"short label of what you produced","body":"the actual work product, ready to use","action":{"channel":"email","to":"","subject":""}}. Omit "action" entirely when the work is internal or you have no real recipient.`;

async function produce(tenant, worker, s, trace) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });

  const p = tenant.profile || {};
  const know = s.knowledge.map(k => `- [${k.kind || 'note'}] ${k.title}: ${String(k.body || '').slice(0, 600)}`).join('\n') || '- none yet';
  const met = s.metrics.map(m => `- ${m.label}: ${m.value || '-'}${m.unit ? ' ' + m.unit : ''}`).join('\n') || '- none yet';
  const tk = s.tasks.filter(x => x.status !== 'done').map(x => `- ${x.title}`).join('\n') || '- none';

  const userMsg =
    `YOUR ROLE: ${worker.name}\n` +
    `WHAT YOU DO: ${worker.job}\n` +
    `HOW OFTEN: ${worker.cadence}\n` +
    (worker.target ? `YOUR TARGET: ${worker.target}\n` : '') +
    (worker.procedure ? `\nYOUR OPERATING PROCEDURE (follow this exactly, step by step):\n${String(worker.procedure).slice(0, 4000)}\n` : '') +
    `\n` +
    `--- COMPANY CONTEXT ---\n` +
    `Company: ${tenant.name}${tenant.business_type ? ' (' + tenant.business_type + ')' : ''}\n` +
    `What they do: ${p.what_you_do || tenant.summary || 'unspecified'}\n` +
    `Known leaks: ${p.what_falls_through || 'unspecified'}\n` +
    `Tools: ${p.tools || 'unspecified'}\n\n` +
    `COMPANY KNOWLEDGE:\n${know}\n\nCURRENT METRICS:\n${met}\n\nOPEN TASKS:\n${tk}`;

  const msg = await llm.create(client, {
    model: MODEL, max_tokens: 1600, system: SYSTEM,
    messages: [{ role: 'user', content: userMsg }],
  }, { tenantId: tenant.id, worker_id: worker.id, label: 'worker:' + (worker.name || worker.id), workflow: 'worker_run', trace });

  const text = (msg.content || []).map(b => b.text || '').join('').trim();
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  let raw = {};
  if (start !== -1 && end !== -1) { try { raw = JSON.parse(text.slice(start, end + 1)); } catch { raw = {}; } }
  return {
    title: String(raw.title || `${worker.name} output`).slice(0, 120),
    body: String(raw.body || text || 'No output produced.').slice(0, 12000),
    action: normalizeAction(raw.action),
  };
}

// Load the worker's tenant context, produce the work, and persist it.
// `trigger` is 'manual' or 'scheduled', used in the activity summary.
async function executeWorker(worker, trigger) {
  const tid = worker.tenant_id;
  const w = [['tenant_id', '==', tid]];
  const [tenant, knowledge, metrics, tasks] = await Promise.all([
    db.getById('os_tenants', tid),
    db.list('os_knowledge', { where: w }),
    db.list('os_metrics', { where: w }),
    db.list('os_tasks', { where: w }),
  ]);
  if (!tenant) throw new Error('tenant not found');

  // Attach this tenant's guardrail policies so the per-action rules and spend
  // limits they set actually bind on the autonomous-fire decision below.
  tenant._policies = await getPolicies(tid).catch(() => []);
  tenant._spentToday = await getSpentToday(tid).catch(() => ({}));

  // Trace the whole run so a failed or surprising output can be reconstructed.
  const trace = startTrace(tid, { kind: 'worker', label: worker.name || worker.id, meta: { worker_id: worker.id, trigger: trigger || 'manual' } });
  let product;
  try {
    product = await produce(tenant, worker, { knowledge, metrics, tasks }, trace);
  } catch (e) {
    await finishTrace(trace, { error: e });
    throw e;
  }
  const action = product.action;

  // Guardrail: does THIS output pass before it can auto-send? A failing check
  // (empty, placeholder still in it, bad or missing recipient) can never fire
  // automatically; it drops to needs-approval so a human catches it.
  const guard = validateOutput(product, action);
  addSpan(trace, { name: 'guardrail', kind: 'guard', error: guard.ok ? null : guard.issues.join(' '), meta: { ok: guard.ok, issues: guard.issues } });

  // Evaluate policy explicitly (rather than a bare yes/no) so that when a worker
  // has to escalate we can record WHY on the output and show it in the inbox.
  let autoFire = false, reason = '';
  if (action) {
    const type = action.channel === 'internal' ? 'internal' : String(action.channel || 'external_write');
    const amount = typeof action.amount === 'number' ? action.amount : undefined;
    const decision = evaluate(tenant, worker, type, amount);
    autoFire = decision.mode === 'auto' && guard.ok;
    if (!autoFire) reason = !guard.ok ? ('Held for review: ' + guard.issues.join(' ')) : (decision.reason || '');
  }

  // With a proposed action: fire now if policy allows, otherwise hold for approval.
  // Without one: internal work, done unless the worker asks first.
  let status;
  if (action) status = autoFire ? 'done' : 'pending';
  else status = worker.autonomy === 'approve' ? 'pending' : 'done';

  // An internal work product held for sign-off gets a plain reason too.
  if (!action && status === 'pending') reason = 'This worker asks you to approve its work before it counts as done.';

  const output = await db.insert('os_outputs', {
    tenant_id: tid, worker_id: worker.id, worker_name: worker.name,
    title: product.title, body: product.body, status,
    action: action || null,
    reason: reason || null,
    trigger: trigger || 'manual', created_at: new Date().toISOString(),
  });

  let acted = null;
  if (action && autoFire) {
    acted = await runAction({ tenant, output, worker_name: worker.name, actor: trigger === 'scheduled' ? 'auto' : 'owner' }, action);
    if (acted) { await db.update('os_outputs', output.id, { action_status: acted.status }); output.action_status = acted.status; }
  }

  await db.update('os_workers', worker.id, { last_run: new Date().toISOString() });
  const did = acted
    ? (acted.status === 'sent' ? ` and ${acted.detail.replace(/\.$/, '').toLowerCase()}` : acted.status === 'filed' ? '' : ` (${acted.detail.replace(/\.$/, '').toLowerCase()})`)
    : '';
  await db.insert('os_build_log', {
    tenant_id: tid, kind: 'run',
    summary: `${worker.name}${trigger === 'scheduled' ? ' (auto)' : ''} produced: ${product.title}${did}${status === 'pending' ? ' (needs approval)' : ''}.`,
    created_at: new Date().toISOString(),
  });
  trace.meta.output_id = output.id;
  trace.meta.output_status = status;
  await finishTrace(trace, { status: 'ok' });
  return output;
}

module.exports = { executeWorker, produce };
