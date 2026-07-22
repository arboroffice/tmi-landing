// TMI OS - conversational onboarding. This is where a new company answers a few
// short interview questions and Claude designs the whole starting intelligent
// company: departments, workers, metrics, goals, tools, and workflows. The
// client SEES what their OS could be in minutes, then provisions it into their
// own tenant in one move.
//
// POST { action, ... }
//   'generate' { answers }  -> { spec }   design the starting company (no writes)
//   'apply'    { spec }     -> { counts }  provision the spec into this tenant (owner only)

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');

const MODEL = 'claude-opus-4-8';

const AUTONOMY = ['read', 'approve', 'auto'];
const CADENCE = ['realtime', 'daily', 'weekly'];

const SYSTEM = `You design an intelligent company for a real business. You are given a short interview and you lay out the company they could run on one screen: its departments, the AI workers inside them, the numbers they watch, the goals they are chasing, the systems they use, and the handful of workflows that carry the work.

Ground everything in what they told you. Do not invent specific dollar figures. Do not invent customer names. If they were vague, design a sensible starting company for a business like theirs and keep it concrete.

Voice: TMI. Direct, operator to operator. Plain language a shop owner reads without a manual. No emojis. No em dashes, use plain hyphens. No hype, no filler reassurance.

Return ONLY valid JSON, no preamble, in exactly this shape:
{
  "summary": "one sentence describing their company on one screen",
  "departments": [{"name":"Sales","mandate":"what this department is responsible for"}],
  "workers": [{"name":"Front Desk","job":"what this worker does","department":"Sales","autonomy":"approve","cadence":"daily"}],
  "metrics": [{"label":"Revenue MTD","unit":"","hint":"what this number tells the owner"}],
  "goals": [{"title":"the goal","target":"the target","timeframe":"by when"}],
  "tools": [{"name":"QuickBooks","category":"Accounting"}],
  "workflows": [{"name":"New lead intake","trigger":"A lead comes in","steps":["first step","next step"]}]
}
Rules: 3 to 5 departments. 4 to 8 workers, each in a named department, autonomy one of read|approve|auto, cadence one of realtime|daily|weekly. 4 to 6 metrics. 1 to 3 goals. List the systems they said they use, or sensible ones for their trade. 1 to 3 workflows, steps are plain sentences.`;

function s(v, max) {
  return String(v == null ? '' : v).slice(0, max).trim();
}
function pick(v, allowed, dflt) {
  return allowed.includes(v) ? v : dflt;
}

// Clamp Claude's output into the exact shape, with safe defaults if it returns junk.
function normalizeSpec(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const arr = (v) => (Array.isArray(v) ? v : []);

  const departments = arr(r.departments)
    .map((d) => ({ name: s(d && d.name, 80), mandate: s(d && d.mandate, 400) }))
    .filter((d) => d.name)
    .slice(0, 5);

  const workers = arr(r.workers)
    .map((w) => ({
      name: s(w && w.name, 80),
      job: s(w && w.job, 400),
      department: s(w && w.department, 80),
      autonomy: pick(w && w.autonomy, AUTONOMY, 'approve'),
      cadence: pick(w && w.cadence, CADENCE, 'daily'),
    }))
    .filter((w) => w.name)
    .slice(0, 8);

  const metrics = arr(r.metrics)
    .map((m) => ({ label: s(m && m.label, 80), unit: s(m && m.unit, 24), hint: s(m && m.hint, 300) }))
    .filter((m) => m.label)
    .slice(0, 6);

  const goals = arr(r.goals)
    .map((g) => ({ title: s(g && g.title, 200), target: s(g && g.target, 120), timeframe: s(g && g.timeframe, 120) }))
    .filter((g) => g.title)
    .slice(0, 3);

  const tools = arr(r.tools)
    .map((t) => ({ name: s(t && t.name, 80), category: s(t && t.category, 80) }))
    .filter((t) => t.name)
    .slice(0, 12);

  const workflows = arr(r.workflows)
    .map((f) => ({
      name: s(f && f.name, 120),
      trigger: s(f && f.trigger, 200),
      steps: (Array.isArray(f && f.steps) ? f.steps : []).slice(0, 12).map((x) => s(x, 200)).filter(Boolean),
    }))
    .filter((f) => f.name)
    .slice(0, 3);

  return {
    summary: s(r.summary, 300) || 'Your whole operation on one screen.',
    departments,
    workers,
    metrics,
    goals,
    tools,
    workflows,
  };
}

async function generate(answers) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });

  const a = answers && typeof answers === 'object' ? answers : {};
  const userMsg =
    `--- THE INTERVIEW ---\n` +
    `What you do: ${s(a.what_you_do, 1000) || 'unspecified'}\n` +
    `Biggest headache: ${s(a.biggest_headache, 1000) || 'unspecified'}\n` +
    `Tools you use today: ${s(a.tools, 1000) || 'unspecified'}\n` +
    `Team size: ${s(a.team_size, 200) || 'unspecified'}\n` +
    `Goal right now: ${s(a.goal, 1000) || 'unspecified'}\n\n` +
    `Design the starting intelligent company for this business. Return only the JSON.`;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: SYSTEM,
    messages: [{ role: 'user', content: userMsg }],
  });

  const text = (msg.content || []).map((b) => b.text || '').join('').trim();
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  let raw = {};
  if (start !== -1 && end !== -1) { try { raw = JSON.parse(text.slice(start, end + 1)); } catch { raw = {}; } }
  return normalizeSpec(raw);
}

// Provision a clamped spec into the caller's tenant. Everything is scoped to tenant_id.
async function apply(tid, rawSpec) {
  const spec = normalizeSpec(rawSpec);
  const now = () => new Date().toISOString();

  // Departments first, so workers can point at them by id.
  const deptMap = {};
  let dsort = 0;
  for (const d of spec.departments) {
    const row = await db.insert('os_departments', {
      tenant_id: tid, name: d.name, mandate: d.mandate, sort: ++dsort,
    });
    deptMap[d.name] = row.id;
  }

  let wsort = 0;
  for (const w of spec.workers) {
    await db.insert('os_workers', {
      tenant_id: tid, name: w.name, job: w.job,
      autonomy: pick(w.autonomy, AUTONOMY, 'approve'),
      cadence: pick(w.cadence, CADENCE, 'daily'),
      status: 'ready',
      department_id: deptMap[w.department] || null,
      sort: ++wsort, created_at: now(),
    });
  }

  let msort = 0;
  for (const m of spec.metrics) {
    await db.insert('os_metrics', {
      tenant_id: tid, label: m.label, unit: m.unit, hint: m.hint, value: '-', sort: ++msort,
    });
  }

  let gsort = 0;
  for (const g of spec.goals) {
    await db.insert('os_goals', {
      tenant_id: tid, title: g.title, target: g.target, timeframe: g.timeframe,
      status: 'active', sort: ++gsort,
    });
  }

  let fsort = 0;
  for (const f of spec.workflows) {
    await db.insert('os_workflows', {
      tenant_id: tid, name: f.name, trigger: f.trigger, steps: f.steps,
      status: 'draft', sort: ++fsort,
    });
  }

  // Each tool the client uses becomes a request for TMI to wire it in.
  for (const t of spec.tools) {
    await db.insert('os_requests', {
      tenant_id: tid, title: 'Connect ' + t.name, category: 'integration', detail: '',
      status: 'requested', created_at: now(), updated_at: now(),
    });
  }

  await db.update('os_tenants', tid, { onboarded: true, summary: spec.summary });

  await db.insert('os_build_log', {
    tenant_id: tid, kind: 'blueprint',
    summary: `Stood up your starting company: ${spec.departments.length} departments, ${spec.workers.length} workers.`,
    created_at: now(),
  });

  return {
    departments: spec.departments.length,
    workers: spec.workers.length,
    metrics: spec.metrics.length,
    goals: spec.goals.length,
    workflows: spec.workflows.length,
    tools: spec.tools.length,
  };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;

  const b = req.body || {};
  const action = String(b.action || '');

  try {
    if (action === 'generate') {
      const spec = await generate(b.answers);
      return res.status(200).json({ spec });
    }

    if (action === 'apply') {
      if (!requireRole(t, res, 'owner')) return;
      const counts = await apply(t.tenant_id, b.spec);
      return res.status(200).json({ counts });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-blueprint:', e.message);
    return res.status(500).json({ error: 'Could not build your company' });
  }
};

module.exports.config = { maxDuration: 60 };
