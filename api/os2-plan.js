// TMI OS — Plan. The COO as orchestrator. Given a goal, it produces a concrete
// plan to close the gap, mapped to the workers and tasks this company actually
// has, and can apply that plan by creating tasks and putting the right workers
// to work. This shows the owner their COO planning against a target, not just
// talking: every step is a real task, tied to a real worker where one fits.
//
// Every read and write is scoped to the caller's tenant_id, so one company can
// never see or touch another's data.
//
// POST { action }
//   'plan'  { goal_id?, goal_text? } -> { plan: {summary, steps}, goal: {title, target} }
//   'apply' { plan }                 -> { created }   (manager+)

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');

const MODEL = 'claude-opus-4-8';

const SYSTEM = `You are the COO of this company. You are given one goal and the company's current workers and numbers. Produce a short, concrete plan to close the gap between where the company is and the goal.

Rules:
- Use ONLY the workers listed. When a step is work a listed worker should own, reference that worker by its exact worker_id and worker_name. When no listed worker fits, leave worker_id and worker_name empty and propose a plain task.
- Be specific and grounded in this company's actual numbers and workers. No hype, no vague advice, no emojis, no em dashes.
- Between 3 and 6 steps. Each step is one clear thing to do, ordered so the plan builds toward the goal.

Return ONLY valid JSON:
{"summary":"1-2 sentences on how we close this","steps":[{"task_title":"short imperative task","worker_id":"<id from the list or empty>","worker_name":"<name from the list or empty>","why":"one line on why this step"}]}`;

function goalContext(goal, goalText) {
  if (goal) {
    return `GOAL: ${goal.title || 'Untitled goal'}` +
      `${goal.target ? `\nTarget: ${goal.target}` : ''}` +
      `${goal.timeframe ? `\nTimeframe: ${goal.timeframe}` : ''}` +
      `${goal.status ? `\nStatus: ${goal.status}` : ''}`;
  }
  return `GOAL: ${goalText}`;
}

async function buildPlan(tid, goal, goalText, workers, metrics, tenant) {
  const p = (tenant && tenant.profile) || {};
  const wk = workers.map((w) => `- ${w.id} | ${w.name} (${w.status || 'ready'}): ${w.job || ''}`).join('\n') || '- none';
  const met = metrics.map((m) => `- ${m.label}: ${m.value || '-'}${m.unit ? ' ' + m.unit : ''}${m.target ? ` (target ${m.target})` : ''}`).join('\n') || '- none';

  const ctx =
    `Company: ${tenant ? tenant.name : 'this company'}${tenant && tenant.business_type ? ' (' + tenant.business_type + ')' : ''}\n` +
    `What they do: ${p.what_you_do || (tenant && tenant.summary) || 'unspecified'}\n` +
    `Biggest bottleneck: ${p.bottleneck || 'unspecified'}\n\n` +
    `${goalContext(goal, goalText)}\n\n` +
    `WORKERS (id | name):\n${wk}\n\nMETRICS:\n${met}`;

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { summary: '', steps: [] };
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({ model: MODEL, max_tokens: 2000, system: SYSTEM, messages: [{ role: 'user', content: ctx }] });
  const text = (msg.content || []).map((c) => c.text || '').join('').trim();
  const a = text.indexOf('{'), z = text.lastIndexOf('}');
  let raw = {};
  if (a !== -1 && z !== -1) { try { raw = JSON.parse(text.slice(a, z + 1)); } catch { raw = {}; } }

  const workerIds = new Set(workers.map((w) => w.id));
  const workerName = {};
  for (const w of workers) workerName[w.id] = w.name;

  const steps = (Array.isArray(raw.steps) ? raw.steps : []).slice(0, 6).map((s) => {
    const step = s || {};
    const valid = step.worker_id && workerIds.has(step.worker_id);
    return {
      task_title: String(step.task_title || '').slice(0, 200),
      worker_id: valid ? step.worker_id : '',
      worker_name: valid ? (workerName[step.worker_id] || String(step.worker_name || '').slice(0, 120)) : '',
      why: String(step.why || '').slice(0, 300),
    };
  }).filter((s) => s.task_title);

  return { summary: String(raw.summary || '').slice(0, 600), steps };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;
  const tid = t.tenant_id;
  const b = req.body || {};
  const action = String(b.action || 'plan');

  try {
    if (action === 'plan') {
      const w = [['tenant_id', '==', tid]];
      const [tenant, workers, metrics] = await Promise.all([
        db.getById('os_tenants', tid),
        db.list('os_workers', { where: w }),
        db.list('os_metrics', { where: w }),
      ]);
      if (!tenant) return res.status(404).json({ error: 'Company not found' });

      let goal = null;
      const goalText = String(b.goal_text || '').slice(0, 600);
      if (b.goal_id) {
        goal = await db.getById('os_goals', String(b.goal_id));
        if (!goal || goal.tenant_id !== tid) return res.status(404).json({ error: 'Goal not found' });
      }
      if (!goal && !goalText) return res.status(400).json({ error: 'goal_id or goal_text required' });

      const plan = await buildPlan(tid, goal, goalText, workers, metrics, tenant);
      const goalOut = goal
        ? { title: goal.title || '', target: goal.target || '' }
        : { title: goalText, target: '' };
      return res.status(200).json({ plan, goal: goalOut });
    }

    if (action === 'apply') {
      if (!requireRole(t, res, 'manager')) return;
      const plan = b.plan || {};
      const steps = Array.isArray(plan.steps) ? plan.steps : [];
      if (!steps.length) return res.status(400).json({ error: 'plan has no steps' });

      const existing = await db.list('os_tasks', { where: [['tenant_id', '==', tid]] });
      let sort = existing.reduce((m, r) => Math.max(m, r.sort || 0), 0);
      const now = new Date().toISOString();

      let created = 0;
      for (const step of steps) {
        const title = String((step && step.task_title) || '').slice(0, 200);
        if (!title) continue;
        sort += 1;
        let workerId = step && step.worker_id ? String(step.worker_id) : null;
        if (workerId) {
          const worker = await db.getById('os_workers', workerId);
          if (!worker || worker.tenant_id !== tid) workerId = null;
          else await db.update('os_workers', workerId, { status: 'active' });
        }
        await db.insert('os_tasks', {
          tenant_id: tid,
          title,
          detail: String((step && step.why) || '').slice(0, 2000),
          status: 'open',
          priority: 'normal',
          worker_id: workerId || null,
          source: 'plan',
          sort,
          created_at: now,
        });
        created += 1;
      }

      const goalName = (plan.goal && plan.goal.title) || (plan.goal_title) || 'your goal';
      await db.insert('os_build_log', {
        tenant_id: tid,
        kind: 'plan',
        summary: `COO built a plan: ${created} step${created === 1 ? '' : 's'} toward ${goalName}`,
        created_at: now,
      }).catch(() => {});

      return res.status(200).json({ created });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-plan:', e.message);
    return res.status(500).json({ error: e.message || 'The COO could not build a plan' });
  }
};

module.exports.config = { maxDuration: 45 };
