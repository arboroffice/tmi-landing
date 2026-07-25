// TMI OS — the AI COO. Grounded ONLY in this tenant's OS state (metrics,
// workers, workflows, company knowledge, tasks, recent activity), it does three
// things: answers the owner's questions, writes the morning briefing, and drafts
// an owner report. Crucially it is agentic: when the owner asks to build, add,
// change, or set something, it returns structured ACTIONS the app applies with
// one click (create a worker, draft a workflow, add a task, set a metric, save
// knowledge). Scoped to the caller's tenant_id.
//
// POST { question?, mode? }  mode: 'ask' (default) | 'briefing' | 'report'
//   -> { answer, actions }

const db = require('./_db');
const { requireTenant, cors } = require('./_tenant-auth');
const { graphSummary } = require('./_osrecords');
const llm = require('./_osllm');
const { startTrace, finishTrace } = require('./_ostrace');

const MODEL = 'claude-opus-4-8';

const SYSTEM = `You are the AI COO inside TMI OS for the company described below. You can see their command center metrics, AI workers, workflows, company knowledge, open tasks, recent activity, and their real company records (customers, leads, invoices, payments, jobs), and nothing else. You are the operating brain of an intelligent company: the owner runs the business through you.

Speak like a sharp, direct operator talking to the owner. Short and specific. No hype, no filler, no emojis, no em dashes. If a number is not connected yet (value is "-"), say so and name what to connect. Never invent figures. When you have real company records, cite them by name and number (the customer, the invoice, the amount, whether it is overdue). Never claim a worker did something the activity feed does not show. Use the company knowledge when it is relevant.

You can also BUILD. When the owner asks you to add, create, draft, change, set, or turn something into part of their OS, propose it as one or more actions. Only propose actions the owner is clearly asking for or that directly answer their request. Keep every proposed object specific to THIS company.

Return ONLY valid JSON in exactly this shape (no markdown, no prose outside it):
{
  "answer": "your natural-language reply to the owner",
  "actions": [
    { "kind": "create", "resource": "workers",   "label": "Add worker: Collections Clerk", "data": { "name": "Collections Clerk", "job": "one sentence", "autonomy": "read|approve|auto", "cadence": "realtime|daily|weekly" } },
    { "kind": "create", "resource": "workflows",  "label": "Draft cascade: New lead to booked job", "data": { "name": "...", "trigger": "manual|client_won|invoice_overdue|lead_created|job_completed|metric_threshold", "steps": [ { "type": "task", "title": "...", "priority": "normal" }, { "type": "notify", "text": "..." }, { "type": "wait", "days": 1 }, { "type": "approval", "prompt": "..." } ] } },
    { "kind": "create", "resource": "tasks",      "label": "Add task: Connect accounting", "data": { "title": "...", "detail": "one line", "priority": "low|normal|high" } },
    { "kind": "create", "resource": "metrics",    "label": "Track: Callback rate", "data": { "label": "...", "value": "-", "unit": "", "hint": "what it tracks" } },
    { "kind": "create", "resource": "knowledge",  "label": "Save SOP: Dispatch", "data": { "title": "...", "body": "the SOP text", "kind": "sop|policy|pricing|note|faq" } },
    { "kind": "update_metric", "label": "Set Revenue to $2.1M", "match": "Revenue", "data": { "value": "$2.1M" } }
  ]
}
Autonomy rules for any worker you create: "read" for reporting only, "approve" for anything that writes or contacts a customer, "auto" only for safe internal tasks.
Cascade rules: a workflow "trigger" must be exactly one of manual, client_won, invoice_overdue, lead_created, job_completed, metric_threshold (use "manual" if none fit). Every workflow "step" must be an object with a "type" of task, notify, wait, approval, metric, or note - never a plain string, or it will not run. If there is nothing to build, return "actions": [].`;

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;

  const tid = t.tenant_id;
  const mode = ['briefing', 'report'].includes(req.body && req.body.mode) ? req.body.mode : 'ask';
  const question = String((req.body && req.body.question) || '').trim().slice(0, 2000);
  if (mode === 'ask' && !question) return res.status(400).json({ error: 'Ask a question' });

  try {
    const w = [['tenant_id', '==', tid]];
    const [tenant, metrics, workers, workflows, knowledge, tasks, log, goals, signals, graph] = await Promise.all([
      db.getById('os_tenants', tid),
      db.list('os_metrics', { where: w }),
      db.list('os_workers', { where: w }),
      db.list('os_workflows', { where: w }),
      db.list('os_knowledge', { where: w }),
      db.list('os_tasks', { where: w }),
      db.list('os_build_log', { where: w, order: 'created_at', ascending: false, limit: 10 }),
      db.list('os_goals', { where: w }),
      db.list('os_signals', { where: [['tenant_id', '==', tid], ['status', '==', 'open']] }),
      graphSummary(tid).catch(() => ''),
    ]);
    if (!tenant) return res.status(404).json({ error: 'Company not found' });

    const trace = startTrace(tid, { kind: 'coo', label: mode === 'ask' ? question.slice(0, 80) : mode, meta: { mode } });
    try {
      const out = await run(tenant, { metrics, workers, workflows, knowledge, tasks, log, goals, signals, graph }, mode, question, trace);
      await finishTrace(trace, { status: 'ok' });
      return res.status(200).json(out);
    } catch (e) {
      await finishTrace(trace, { error: e });
      throw e;
    }
  } catch (e) {
    console.error('os2-ask:', e.message);
    return res.status(502).json({ error: 'The COO could not answer right now. Try again in a moment.' });
  }
};

function context(tenant, s) {
  const p = tenant.profile || {};
  const bySort = (a, b) => (a.sort || 0) - (b.sort || 0);
  const m = s.metrics.sort(bySort).map(x => `- ${x.label}: ${x.value || '-'}${x.unit ? ' ' + x.unit : ''}${x.target ? ` (target ${x.target})` : ''}${x.hint ? ` — ${x.hint}` : ''}`).join('\n') || '- none yet';
  const w = s.workers.sort(bySort).map(x => `- ${x.name} [${x.status || 'ready'}, ${x.autonomy}, ${x.cadence}]: ${x.job}`).join('\n') || '- none yet';
  const f = s.workflows.sort(bySort).map(x => `- ${x.name} (when: ${x.trigger}): ${(x.steps || []).join(' -> ')}`).join('\n') || '- none yet';
  const k = s.knowledge.sort(bySort).map(x => `- [${x.kind || 'note'}] ${x.title}: ${String(x.body || '').slice(0, 400)}`).join('\n') || '- none yet';
  const tk = s.tasks.sort(bySort).map(x => `- (${x.status || 'open'}, ${x.priority || 'normal'}) ${x.title}`).join('\n') || '- none yet';
  const a = s.log.map(x => `- ${x.summary}`).join('\n') || '- nothing yet';
  const metricById = {};
  (s.metrics || []).forEach(x => { metricById[x.id] = x; });
  const g = (s.goals || []).sort(bySort).map(x => {
    const mt = x.metric_id && metricById[x.metric_id];
    const now = mt ? `${mt.value || '-'}${mt.unit ? ' ' + mt.unit : ''}` : null;
    return `- ${x.title}${x.target ? ` (target ${x.target}${now ? `, now at ${now}` : ''})` : ''}${x.timeframe ? ` by ${x.timeframe}` : ''}`;
  }).join('\n') || '- none yet';
  const SEV = { high: 0, medium: 1, low: 2 };
  const sig = (s.signals || []).slice().sort((x, y) => (SEV[x.severity] ?? 1) - (SEV[y.severity] ?? 1))
    .map(x => `- [${x.severity || 'medium'}] ${x.title}: ${String(x.insight || '').slice(0, 240)}`).join('\n') || '- none open';
  const graph = String(s.graph || '').trim();
  return `COMPANY: ${tenant.name}${tenant.business_type ? ' (' + tenant.business_type + ')' : ''}
WHAT THEY DO: ${p.what_you_do || tenant.summary || 'unspecified'}
WANTS TO SEE DAILY: ${p.what_you_track || 'unspecified'}
KNOWN LEAKS: ${p.what_falls_through || 'unspecified'}
TOOLS: ${p.tools || 'unspecified'}
BIGGEST BOTTLENECK: ${p.bottleneck || 'unspecified'}
${graph ? `\nCOMPANY RECORDS (real customers, invoices, jobs, payments - cite these by name and number):\n${graph}\n` : ''}
METRICS:
${m}

AI WORKERS:
${w}

WORKFLOWS:
${f}

COMPANY KNOWLEDGE:
${k}

GOALS:
${g}

WHAT PULSE IS FLAGGING (ranked):
${sig}

TASKS:
${tk}

RECENT ACTIVITY:
${a}`;
}

async function run(tenant, s, mode, question, trace) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });

  const task = mode === 'briefing'
    ? 'Write the owner a morning briefing: the one or two things that most need attention today, based only on the OS state below. Lead with what Pulse is flagging (highest severity first) and where each goal stands against its target, naming the real numbers. If a high-severity signal is open, that is your lead. If not enough live data is connected, name the single most valuable thing to connect first. Do not say "all quiet" unless there are genuinely no open signals, no goals off target, and no missing data. Three sentences maximum in "answer". Propose up to two tasks in "actions" only if there is a clear next step.'
    : mode === 'report'
      ? 'Write the owner a plain-language weekly report of their company from the OS state below: what the numbers say, what the workers and workflows are doing, what improved, and the two or three things to do next. Six to ten sentences in "answer", written in short paragraphs. Return "actions": [].'
      : `The owner says: "${question}"`;

  const msg = await llm.create(client, {
    model: MODEL,
    max_tokens: mode === 'report' ? 2000 : 1500,
    system: SYSTEM,
    messages: [{ role: 'user', content: `${task}\n\n--- THIS COMPANY'S OS STATE ---\n${context(tenant, s)}` }],
  }, { tenantId: tenant.id, label: 'coo:' + mode, workflow: 'coo', trace });

  const text = (msg.content || []).map(b => b.text || '').join('').trim();
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return { answer: text, actions: [] };
  let parsed;
  try { parsed = JSON.parse(text.slice(start, end + 1)); } catch { return { answer: text, actions: [] }; }
  return { answer: String(parsed.answer || '').trim(), actions: sanitizeActions(parsed.actions) };
}

function sanitizeActions(actions) {
  if (!Array.isArray(actions)) return [];
  const RES = ['workers', 'workflows', 'tasks', 'metrics', 'knowledge'];
  return actions.slice(0, 6).map(a => {
    if (!a || typeof a !== 'object') return null;
    const kind = a.kind === 'update_metric' ? 'update_metric' : 'create';
    if (kind === 'update_metric') {
      if (!a.match || !a.data || a.data.value == null) return null;
      return { kind, label: String(a.label || 'Update metric').slice(0, 80), match: String(a.match).slice(0, 80), data: { value: String(a.data.value).slice(0, 60) } };
    }
    if (!RES.includes(a.resource) || !a.data || typeof a.data !== 'object') return null;
    return { kind, resource: a.resource, label: String(a.label || 'Add').slice(0, 80), data: a.data };
  }).filter(Boolean);
}
