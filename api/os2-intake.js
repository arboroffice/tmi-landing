// TMI OS — the intake/builder agent. Takes a new account's onboarding and uses
// Claude to design their intelligent-company starter build: a command center
// (metrics), a set of AI workers, and a few workflows. Two ways in:
//   - business: we read their website and design the company's OS
//   - creator:  we take their social handles and design a backend ops system
//     for the business behind their audience
// Seeds all of it into Firestore, scoped to the tenant, marks the tenant onboarded.
//
// POST {
//   mode: "business" | "creator",
//   website: "https://...",              // business
//   handles: [{ platform, handle }],     // creator
//   answers: { ...free-text confirmations }
// } -> { summary, metrics, workers, workflows }

const db = require('./_db');
const { requireTenant, cors } = require('./_tenant-auth');
const { safeFetch } = require('./_osnet');

const MODEL = 'claude-opus-4-8';

const SHAPE = `Return ONLY valid JSON (no markdown, no prose) in exactly this shape:
{
  "name": "the operation's real name if you can tell it from the content, else empty",
  "summary": "one or two sentences describing this operation and what its OS should do",
  "departments": [
    { "name": "Department name", "mandate": "one sentence on what this department owns" }
  ],
  "metrics": [
    { "key": "snake_case_id", "label": "Short human label", "value": "-", "unit": "", "hint": "what this tile tracks" }
  ],
  "workers": [
    { "name": "Worker name", "job": "one sentence on what this AI worker does", "department": "the exact name of the department above it belongs to", "autonomy": "read|approve|auto", "cadence": "realtime|daily|weekly", "target": "a concrete weekly or monthly target this worker owns, e.g. 40 invoices chased / month", "procedure": "a short plain-language operating procedure: the exact steps this worker follows every run, written as if instructing a new hire" }
  ],
  "workflows": [
    { "name": "Workflow name", "trigger": "what starts it", "steps": ["step", "step"] }
  ],
  "goals": [
    { "title": "A concrete goal for this business", "target": "the number or milestone to hit" }
  ]
}

Autonomy is "read" for reporting/summaries, "approve" for anything that writes or contacts a person, "auto" only for safe internal tasks. Cadence is how often it runs. Every worker's "department" must match one of the department names exactly.
Be specific and detailed for THIS operation. No generic filler, no hype, no emojis, no em dashes. Never invent tools or numbers they did not give you.`;

const SYSTEM_BUSINESS = `You are the builder agent for TMI OS, a platform that turns a company into an intelligent company that runs without its owner. A new company just onboarded and gave you their website and a few notes. Read the site content closely to understand what they do, who they serve, and how they make money, then design a detailed starter build for the whole company.

${SHAPE}

- 3 to 5 departments: the real parts of THIS business (for example Sales, Operations or Delivery, Finance, Customer Success), each with a clear mandate.
- 5 to 8 metrics: the numbers this owner should see every morning on one screen. Use "-" as the starting value.
- 4 to 6 workers: name them like real roles for THIS business (for example a receptionist, a sales rep, a coordinator, a billing worker), each assigned to one of the departments, grounded in what the site shows they do.
- 2 to 4 workflows, each with 2 to 4 concrete steps.
- 2 to 3 goals that fit where this business likely wants to go.`;

const SYSTEM_CREATOR = `You are the builder agent for TMI OS. A creator or personal brand just onboarded. They do not want a content calendar, they want the backend operations system for the business behind their audience, so it runs without them living in the apps. From their handles, niche, and notes, design a detailed starter build for the whole creator business.

${SHAPE}

- 3 to 5 departments for a creator business (for example Audience and Community, Content, Partnerships and Brand Deals, Monetization, Finance), each with a clear mandate.
- 5 to 8 metrics a creator business lives on: for example followers or subscribers, reach or views, email list size, monthly revenue, active brand deals, content shipped. Use "-" as the starting value.
- 4 to 6 workers as real creator-business roles: for example a Community Manager for DMs and comments, a Content Planner, a Brand Deal Manager for inbound sponsorships, a Repurposer that turns one post into many, a Newsletter worker, an Analytics worker, each assigned to one of the departments. Ground them in the creator's niche and how they monetize.
- 2 to 4 workflows behind the scenes: for example the content pipeline from idea to posted to repurposed, inbound brand-deal intake and qualification, and comment or DM triage.
- 2 to 3 goals that fit where this creator business likely wants to go.`;

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;

  const body = req.body || {};
  const mode = body.mode === 'creator' ? 'creator' : 'business';
  const answers = body.answers || {};
  const website = typeof body.website === 'string' ? body.website.trim() : '';
  const handles = Array.isArray(body.handles) ? body.handles.slice(0, 6) : [];

  const tenant = await db.getById('os_tenants', t.tenant_id).catch(() => null);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  // Commit: the user approved a proposed build. Seed exactly what they saw.
  if (body.commit && body.spec) {
    const spec = normalize(body.spec);
    try {
      await seedAndFinish(t.tenant_id, spec, { mode, website, handles, answers });
    } catch (e) {
      console.error('os2-intake commit:', e.message);
      return res.status(500).json({ error: 'Could not save your build. Try again.' });
    }
    return res.status(200).json(spec);
  }

  // Generate a proposed build from the website or handles.
  let spec;
  try {
    spec = await buildSpec(tenant, { mode, answers, website, handles });
  } catch (e) {
    console.error('os2-intake claude:', e.message);
    return res.status(502).json({ error: 'The builder could not finish. Try again in a moment.' });
  }

  // Preview: return the proposal for approval, seed nothing yet.
  if (body.preview) return res.status(200).json({ spec });

  // Legacy direct build (no preview flag): seed immediately.
  try {
    await seedAndFinish(t.tenant_id, spec, { mode, website, handles, answers });
  } catch (e) {
    console.error('os2-intake seed:', e.message);
    return res.status(500).json({ error: 'Built the plan but could not save it. Try again.' });
  }
  return res.status(200).json(spec);
};

async function seedAndFinish(tenantId, spec, profile) {
  await reseed(tenantId, spec);
  await db.update('os_tenants', tenantId, {
    onboarded: true,
    business_type: profile.mode,
    profile: profile,
    summary: spec.summary || null,
    onboarded_at: new Date().toISOString(),
  });
  await db.insert('os_build_log', {
    tenant_id: tenantId,
    kind: 'build',
    summary: `Built your command center: ${spec.metrics.length} metrics, ${spec.workers.length} workers, ${spec.workflows.length} workflows.`,
    created_at: new Date().toISOString(),
  });
}

async function buildSpec(tenant, input) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });

  const creator = input.mode === 'creator';
  let userMsg;

  if (creator) {
    const handleLines = (input.handles || [])
      .filter(h => h && (h.handle || h.platform))
      .map(h => `- ${h.platform || 'social'}: ${h.handle || ''}`)
      .join('\n') || '- (none given)';
    let siteText = '';
    // creators often have a link-in-bio or personal site; read it if given
    if (input.website) siteText = await fetchSite(input.website);
    userMsg =
      `Creator / brand: ${tenant.name}\n` +
      `Handles:\n${handleLines}\n\n` +
      `Their niche and audience: ${input.answers.niche || '-'}\n` +
      `How they make money: ${input.answers.monetization || '-'}\n` +
      `What eats their time: ${input.answers.bottleneck || '-'}` +
      (siteText ? `\n\nContent from their site or link page:\n${siteText}` : '');
  } else {
    const siteText = input.website ? await fetchSite(input.website) : '';
    userMsg =
      `Company: ${tenant.name}\n` +
      `Website: ${input.website || '-'}\n\n` +
      `What they added: ${input.answers.what_you_do || '-'}\n` +
      `What falls through the cracks: ${input.answers.what_falls_through || '-'}\n` +
      `Biggest bottleneck: ${input.answers.bottleneck || '-'}` +
      (siteText
        ? `\n\nContent read from their website:\n${siteText}`
        : `\n\n(Their website could not be read. Design from the notes above.)`);
  }

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: creator ? SYSTEM_CREATOR : SYSTEM_BUSINESS,
    messages: [{ role: 'user', content: userMsg }],
  });

  const text = (msg.content || []).map(b => b.text || '').join('').trim();
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON in builder response');
  const raw = JSON.parse(text.slice(start, end + 1));
  return normalize(raw);
}

// Best-effort fetch of a site's readable text. Never throws; returns '' on
// failure. SSRF-guarded via _osnet.safeFetch (resolves + validates every IP,
// refuses redirects).
async function fetchSite(url) {
  try {
    const r = await safeFetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TMI-OS-Builder/1.0)' },
    }, 7000);
    if (!r.ok) return '';
    let html = await r.text();
    html = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1];
    const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || [, ''])[1];
    const text = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z#0-9]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return [title && `Title: ${title.trim()}`, desc && `Description: ${desc.trim()}`, text]
      .filter(Boolean)
      .join('\n')
      .slice(0, 6500);
  } catch (e) {
    return '';
  }
}

function normalize(raw) {
  const clampAutonomy = a => (['read', 'approve', 'auto'].includes(a) ? a : 'approve');
  const clampCadence = c => (['realtime', 'daily', 'weekly'].includes(c) ? c : 'daily');
  const departments = (Array.isArray(raw.departments) ? raw.departments : []).slice(0, 6).map((d, i) => ({
    name: String(d.name || 'Department').slice(0, 60),
    mandate: String(d.mandate || '').slice(0, 200),
    sort: i,
  }));
  const metrics = (Array.isArray(raw.metrics) ? raw.metrics : []).slice(0, 8).map((m, i) => ({
    key: String(m.key || 'metric_' + i).slice(0, 40),
    label: String(m.label || 'Metric').slice(0, 60),
    value: m.value != null ? String(m.value) : '-',
    unit: String(m.unit || '').slice(0, 12),
    hint: String(m.hint || '').slice(0, 120),
    sort: i,
  }));
  const workers = (Array.isArray(raw.workers) ? raw.workers : []).slice(0, 8).map((w, i) => ({
    name: String(w.name || 'Worker').slice(0, 60),
    job: String(w.job || '').slice(0, 240),
    department: w.department ? String(w.department).slice(0, 60) : '',
    autonomy: clampAutonomy(w.autonomy),
    cadence: clampCadence(w.cadence),
    target: w.target ? String(w.target).slice(0, 120) : '',
    procedure: w.procedure ? String(w.procedure).slice(0, 2000) : '',
    status: 'ready',
    sort: i,
  }));
  // Activate one safe, read-only worker by default so the workforce visibly runs
  // on day one (lifts the workforce score, produces a real first deliverable).
  // Read-only workers only report; they never contact anyone or move money.
  const firstRead = workers.find(w => w.autonomy === 'read');
  if (firstRead) firstRead.status = 'active';
  const workflows = (Array.isArray(raw.workflows) ? raw.workflows : []).slice(0, 4).map((f, i) => ({
    name: String(f.name || 'Workflow').slice(0, 60),
    trigger: String(f.trigger || '').slice(0, 120),
    steps: (Array.isArray(f.steps) ? f.steps : []).slice(0, 6).map(s => String(s).slice(0, 160)),
    status: 'active',
    sort: i,
  }));
  const goals = (Array.isArray(raw.goals) ? raw.goals : []).slice(0, 4).map((g, i) => ({
    title: String(g.title || 'Goal').slice(0, 120),
    target: String(g.target || '').slice(0, 60),
    status: 'active',
    sort: i,
  }));
  return {
    name: raw.name ? String(raw.name).slice(0, 80) : '',
    summary: String(raw.summary || '').slice(0, 240),
    departments, metrics, workers, workflows, goals,
  };
}

// Replace any prior starter build for this tenant, then insert the new one.
async function reseed(tenantId, spec) {
  for (const coll of ['os_metrics', 'os_workers', 'os_workflows', 'os_departments', 'os_goals']) {
    const rows = await db.list(coll, { where: [['tenant_id', '==', tenantId]] });
    await Promise.all(rows.map(r => db.remove(coll, r.id).catch(() => {})));
  }

  // Departments first, so workers can be linked to them by name.
  const deptIdByName = {};
  await Promise.all((spec.departments || []).map(async d => {
    const row = await db.insert('os_departments', Object.assign({ tenant_id: tenantId }, d));
    deptIdByName[d.name.toLowerCase()] = row.id;
  }));

  await Promise.all([
    ...spec.metrics.map(m => db.insert('os_metrics', Object.assign({ tenant_id: tenantId }, m))),
    ...spec.workers.map(w => {
      const dept = w.department ? deptIdByName[String(w.department).toLowerCase()] : null;
      const row = Object.assign({ tenant_id: tenantId }, w);
      delete row.department;
      if (dept) row.department_id = dept;
      return db.insert('os_workers', row);
    }),
    ...spec.workflows.map(f => db.insert('os_workflows', Object.assign({ tenant_id: tenantId }, f))),
    ...(spec.goals || []).map(g => db.insert('os_goals', Object.assign({ tenant_id: tenantId }, g))),
  ]);
}
