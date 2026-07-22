// TMI OS — the intake/builder agent. Takes a new company's onboarding answers
// and uses Claude to design their intelligent-company starter build: a command
// center (metrics), a set of AI workers, and a few workflows. Seeds all of it
// into Firestore, scoped to the tenant, and marks the tenant onboarded.
//
// POST { answers: { what_you_do, what_you_track, what_falls_through, tools, bottleneck } }
//   -> { summary, metrics, workers, workflows }

const db = require('./_db');
const { requireTenant, cors } = require('./_tenant-auth');

const MODEL = 'claude-opus-4-8';

const SYSTEM = `You are the builder agent for TMI OS, a platform that turns a company into an intelligent company that runs without its owner. A new company just onboarded. From their answers, design their starter build.

Return ONLY valid JSON (no markdown, no prose) in exactly this shape:
{
  "summary": "one sentence describing this company and what its OS should do",
  "metrics": [
    { "key": "snake_case_id", "label": "Short human label", "value": "-", "unit": "", "hint": "what this tile tracks" }
  ],
  "workers": [
    { "name": "Worker name", "job": "one sentence on what this AI worker does", "autonomy": "read|approve|auto", "cadence": "realtime|daily|weekly" }
  ],
  "workflows": [
    { "name": "Workflow name", "trigger": "what starts it", "steps": ["step", "step"] }
  ]
}

Rules:
- 4 to 6 metrics: the numbers this owner should see every morning on one screen. Use "-" as the starting value.
- 3 to 5 workers: name them like real roles for THIS business. autonomy is "read" for reporting/summaries, "approve" for anything that writes or contacts a customer, "auto" only for safe internal tasks. cadence is how often it runs.
- 2 to 3 workflows, each with 2 to 4 concrete steps.
- Be specific to the company. No generic filler, no hype, no emojis, no em dashes.
- Ground everything in the answers. Never invent tools or numbers they did not mention.`;

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;

  const answers = (req.body && req.body.answers) || {};
  const tenant = await db.getById('os_tenants', t.tenant_id).catch(() => null);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  let spec;
  try {
    spec = await buildSpec(tenant, answers);
  } catch (e) {
    console.error('os2-intake claude:', e.message);
    return res.status(502).json({ error: 'The builder could not finish. Try again in a moment.' });
  }

  try {
    await reseed(t.tenant_id, spec);
    await db.update('os_tenants', t.tenant_id, {
      onboarded: true,
      business_type: tenant.business_type || null,
      profile: answers,
      summary: spec.summary || null,
      onboarded_at: new Date().toISOString(),
    });
    await db.insert('os_build_log', {
      tenant_id: t.tenant_id,
      kind: 'build',
      summary: `Built your command center: ${spec.metrics.length} metrics, ${spec.workers.length} workers, ${spec.workflows.length} workflows.`,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('os2-intake seed:', e.message);
    return res.status(500).json({ error: 'Built the plan but could not save it. Try again.' });
  }

  return res.status(200).json(spec);
};

async function buildSpec(tenant, answers) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });

  const userMsg =
    `Company: ${tenant.name}\n` +
    `Type: ${tenant.business_type || 'unspecified'}\n\n` +
    `What they do: ${answers.what_you_do || '-'}\n` +
    `What they want to see every morning: ${answers.what_you_track || '-'}\n` +
    `What falls through the cracks: ${answers.what_falls_through || '-'}\n` +
    `Tools they use: ${answers.tools || '-'}\n` +
    `Biggest bottleneck: ${answers.bottleneck || '-'}`;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: SYSTEM,
    messages: [{ role: 'user', content: userMsg }],
  });

  const text = (msg.content || []).map(b => b.text || '').join('').trim();
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON in builder response');
  const raw = JSON.parse(text.slice(start, end + 1));
  return normalize(raw);
}

function normalize(raw) {
  const clampAutonomy = a => (['read', 'approve', 'auto'].includes(a) ? a : 'approve');
  const clampCadence = c => (['realtime', 'daily', 'weekly'].includes(c) ? c : 'daily');
  const metrics = (Array.isArray(raw.metrics) ? raw.metrics : []).slice(0, 6).map((m, i) => ({
    key: String(m.key || 'metric_' + i).slice(0, 40),
    label: String(m.label || 'Metric').slice(0, 60),
    value: m.value != null ? String(m.value) : '-',
    unit: String(m.unit || '').slice(0, 12),
    hint: String(m.hint || '').slice(0, 120),
    sort: i,
  }));
  const workers = (Array.isArray(raw.workers) ? raw.workers : []).slice(0, 5).map((w, i) => ({
    name: String(w.name || 'Worker').slice(0, 60),
    job: String(w.job || '').slice(0, 240),
    autonomy: clampAutonomy(w.autonomy),
    cadence: clampCadence(w.cadence),
    status: 'ready',
    sort: i,
  }));
  const workflows = (Array.isArray(raw.workflows) ? raw.workflows : []).slice(0, 3).map((f, i) => ({
    name: String(f.name || 'Workflow').slice(0, 60),
    trigger: String(f.trigger || '').slice(0, 120),
    steps: (Array.isArray(f.steps) ? f.steps : []).slice(0, 6).map(s => String(s).slice(0, 160)),
    status: 'active',
    sort: i,
  }));
  return { summary: String(raw.summary || '').slice(0, 200), metrics, workers, workflows };
}

// Replace any prior starter build for this tenant, then insert the new one.
async function reseed(tenantId, spec) {
  for (const coll of ['os_metrics', 'os_workers', 'os_workflows']) {
    const rows = await db.list(coll, { where: [['tenant_id', '==', tenantId]] });
    await Promise.all(rows.map(r => db.remove(coll, r.id).catch(() => {})));
  }
  await Promise.all([
    ...spec.metrics.map(m => db.insert('os_metrics', Object.assign({ tenant_id: tenantId }, m))),
    ...spec.workers.map(w => db.insert('os_workers', Object.assign({ tenant_id: tenantId }, w))),
    ...spec.workflows.map(f => db.insert('os_workflows', Object.assign({ tenant_id: tenantId }, f))),
  ]);
}
