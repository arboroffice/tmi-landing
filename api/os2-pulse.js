// TMI OS — Pulse. The agentic oversight layer. It reads the whole company at
// once (metrics against targets, goals and their progress, open tasks, what the
// workforce produced, the Company Intelligence Score, live data) and returns a
// short, ranked list of signals: what is off track, what is at risk, what is
// working, each with a concrete recommended action grounded in the workers,
// metrics, and goals this company actually has. The owner can act on a signal in
// one tap and the OS does it: create the task, run the worker, or note it.
//
// This is what turns the OS from a place you check into a company that watches
// itself.
//
// POST { action }
//   'scan'                 -> { signals }   re-read the company, regenerate signals
//   'list'                 -> { signals }   current open signals
//   'act'    { signal_id } -> { signal, result }
//   'dismiss'{ signal_id } -> { ok: true }

const db = require('./_db');
const llm = require('./_osllm');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');
const { scoreTenant } = require('./_osscore');
const { executeWorker } = require('./_osrun');
const { toNum } = require('./_osmetric');

const MODEL = 'claude-opus-4-8';

const SYSTEM = `You are the Pulse of a company's TMI OS: the always-on operator that watches the whole business and says what needs the owner. You are given the company's live state. Produce a short, ranked list of signals. A signal is one specific thing that is off track, at risk, newly working, or an opportunity, stated in plain operator language with the actual number or fact in it. No hedging, no generic advice, no emojis, no em dashes.

For each signal, recommend ONE action the OS can take now, choosing only from what this company actually has:
- "task": create a task. Give a specific task_title.
- "run_worker": run one of the listed workers now. Give the exact worker_id and worker_name from the list.
- "note": nothing to automate, the owner should just see it.

Rank by severity: high (money or a customer is at risk now), medium (drifting), low (worth knowing). Return at most 6 signals, fewer if the company is small or healthy.

Return ONLY valid JSON:
{"signals":[{"title":"short, specific","area":"one of: revenue, cash, operations, sales, team, data, growth","severity":"high|medium|low","insight":"1-2 sentences with the real number or fact","action":{"type":"task|run_worker|note","task_title":"...","worker_id":"...","worker_name":"..."}}]}`;

async function loadState(tid) {
  const w = [['tenant_id', '==', tid]];
  const [tenant, metrics, workers, goals, tasks, outputs, knowledge, workflows, connections] = await Promise.all([
    db.getById('os_tenants', tid),
    db.list('os_metrics', { where: w }),
    db.list('os_workers', { where: w }),
    db.list('os_goals', { where: w }),
    db.list('os_tasks', { where: w }),
    db.list('os_outputs', { where: w, order: 'created_at', ascending: false, limit: 20 }),
    db.list('os_knowledge', { where: w }),
    db.list('os_workflows', { where: w }),
    db.list('os_connections', { where: w }),
  ]);
  return { tenant, metrics, workers, goals, tasks, outputs, knowledge, workflows, connections };
}

function goalLine(g, metrics) {
  const m = g.metric_id ? metrics.find((x) => x.id === g.metric_id) : null;
  const cur = m ? m.value : null;
  const curN = toNum(cur), tgtN = toNum(g.target);
  const pct = (curN != null && tgtN != null && tgtN !== 0) ? Math.round((curN / tgtN) * 100) : null;
  return `- ${g.title}: target ${g.target || '?'}${m ? `, current ${cur || '-'}${pct != null ? ` (${pct}%)` : ''}` : ''}${g.timeframe ? ` by ${g.timeframe}` : ''} [${g.status || 'active'}]`;
}

async function scan(tid) {
  const s = await loadState(tid);
  if (!s.tenant) throw new Error('tenant not found');
  const sc = scoreTenant({ metrics: s.metrics, workers: s.workers, workflows: s.workflows, knowledge: s.knowledge, onboarded: !!s.tenant.onboarded });
  const p = s.tenant.profile || {};

  const met = s.metrics.map((m) => `- ${m.label}: ${m.value || '-'}${m.unit ? ' ' + m.unit : ''}${m.target ? ` (target ${m.target})` : ''}${m.updated_at ? ` [live]` : ' [manual]'}`).join('\n') || '- none';
  const goals = s.goals.filter((g) => g.status === 'active').map((g) => goalLine(g, s.metrics)).join('\n') || '- none set';
  const wk = s.workers.map((w) => `- ${w.id} | ${w.name} (${w.status || 'ready'}): ${w.job || ''}`).join('\n') || '- none';
  const openTasks = s.tasks.filter((t) => t.status !== 'done');
  const tk = openTasks.map((t) => `- ${t.title}${t.priority === 'high' ? ' (high)' : ''}`).join('\n') || '- none';
  const pend = s.outputs.filter((o) => o.status === 'pending').length;

  const ctx =
    `Company: ${s.tenant.name}${s.tenant.business_type ? ' (' + s.tenant.business_type + ')' : ''}\n` +
    `What they do: ${p.what_you_do || s.tenant.summary || 'unspecified'}\n` +
    `Known leaks: ${p.what_falls_through || 'unspecified'}\n` +
    `Biggest bottleneck: ${p.bottleneck || 'unspecified'}\n` +
    `Company Intelligence Score: ${sc.score}/100 (${sc.tier}), owner dependency ${sc.owner_dependency}\n\n` +
    `GOALS:\n${goals}\n\nMETRICS:\n${met}\n\nWORKERS (id | name):\n${wk}\n\n` +
    `OPEN TASKS (${openTasks.length}):\n${tk}\n\nDrafts waiting for approval: ${pend}\n` +
    `Live data connections: ${s.connections.filter((c) => c.status === 'live').length} of ${s.connections.length}`;

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return [];
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });
  const msg = await llm.create(client, { model: MODEL, max_tokens: 2000, system: SYSTEM, messages: [{ role: 'user', content: ctx }] }, { tenantId: tid, label: 'pulse', workflow: 'pulse' });
  const text = (msg.content || []).map((b) => b.text || '').join('').trim();
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  let raw = {};
  if (a !== -1 && b !== -1) { try { raw = JSON.parse(text.slice(a, b + 1)); } catch { raw = {}; } }
  const workerIds = new Set(s.workers.map((x) => x.id));
  const signals = (Array.isArray(raw.signals) ? raw.signals : []).slice(0, 6).map((g) => {
    const sev = ['high', 'medium', 'low'].includes(g.severity) ? g.severity : 'medium';
    const act = g.action || {};
    let action = { type: 'note' };
    if (act.type === 'task' && act.task_title) action = { type: 'task', task_title: String(act.task_title).slice(0, 200) };
    else if (act.type === 'run_worker' && workerIds.has(act.worker_id)) action = { type: 'run_worker', worker_id: act.worker_id, worker_name: String(act.worker_name || '').slice(0, 120) };
    return {
      title: String(g.title || 'Signal').slice(0, 160),
      area: String(g.area || 'operations').slice(0, 30),
      severity: sev,
      insight: String(g.insight || '').slice(0, 600),
      action,
    };
  });
  return signals;
}

const SEV_RANK = { high: 0, medium: 1, low: 2 };

// Generate fresh signals for a tenant, supersede the old open set, save the new.
// Returns the saved signals. Used by the endpoint and the daily cron sweep.
async function runScan(tid) {
  const fresh = await scan(tid);
  const prev = await db.list('os_signals', { where: [['tenant_id', '==', tid], ['status', '==', 'open']] });
  await Promise.all(prev.map((s) => db.update('os_signals', s.id, { status: 'superseded' })));
  const now = new Date().toISOString();
  const saved = [];
  for (const g of fresh) saved.push(await db.insert('os_signals', Object.assign({ tenant_id: tid, status: 'open', created_at: now }, g)));
  saved.sort((a, c) => (SEV_RANK[a.severity] - SEV_RANK[c.severity]));
  await db.insert('os_build_log', { tenant_id: tid, kind: 'pulse', summary: `Pulse scanned the company: ${saved.length} signal${saved.length === 1 ? '' : 's'}.`, created_at: now }).catch(() => {});
  return saved;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;
  const tid = t.tenant_id;
  const b = req.body || {};
  const action = String(b.action || 'list');

  try {
    if (action === 'list') {
      const signals = await db.list('os_signals', { where: [['tenant_id', '==', tid], ['status', '==', 'open']] });
      signals.sort((a, c) => (SEV_RANK[a.severity] - SEV_RANK[c.severity]) || (c.created_at || '').localeCompare(a.created_at || ''));
      return res.status(200).json({ signals });
    }

    if (action === 'scan') {
      if (!requireRole(t, res, 'manager')) return;
      const saved = await runScan(tid);
      return res.status(200).json({ signals: saved });
    }

    if (action === 'act') {
      if (!requireRole(t, res, 'manager')) return;
      const sig = await db.getById('os_signals', String(b.signal_id || ''));
      if (!sig || sig.tenant_id !== tid) return res.status(404).json({ error: 'Signal not found' });
      const act = sig.action || { type: 'note' };
      let result = { type: act.type };

      if (act.type === 'task') {
        const existing = await db.list('os_tasks', { where: [['tenant_id', '==', tid]] });
        const sort = existing.reduce((m, r) => Math.max(m, r.sort || 0), 0) + 1;
        const task = await db.insert('os_tasks', { tenant_id: tid, title: act.task_title, detail: sig.insight || '', status: 'open', priority: sig.severity === 'high' ? 'high' : 'normal', sort, source: 'pulse', created_at: new Date().toISOString() });
        result.task = task;
      } else if (act.type === 'run_worker') {
        const worker = await db.getById('os_workers', act.worker_id);
        if (worker && worker.tenant_id === tid) { const output = await executeWorker(worker, 'manual'); result.output = output; }
        else result.error = 'worker missing';
      }

      const signal = await db.update('os_signals', sig.id, { status: 'done', acted_at: new Date().toISOString() });
      await db.insert('os_build_log', { tenant_id: tid, kind: 'pulse', summary: `Acted on a Pulse signal: ${sig.title}.`, created_at: new Date().toISOString() }).catch(() => {});
      return res.status(200).json({ signal, result });
    }

    if (action === 'dismiss') {
      if (!requireRole(t, res, 'manager')) return;
      const sig = await db.getById('os_signals', String(b.signal_id || ''));
      if (!sig || sig.tenant_id !== tid) return res.status(404).json({ error: 'Signal not found' });
      await db.update('os_signals', sig.id, { status: 'dismissed' });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-pulse:', e.message);
    return res.status(500).json({ error: e.message || 'Pulse could not run' });
  }
};

module.exports.config = { maxDuration: 60 };
module.exports.runScan = runScan;
