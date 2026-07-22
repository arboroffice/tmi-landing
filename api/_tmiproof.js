// Shared Proof Engine. Turns one client's real OS build into TMI proof: a case
// study saved to the company brain, and a publish-ready content draft dropped
// into the Company Intelligence approval queue. Used by the admin endpoint
// (tmi-proof, on demand) and the scheduled sweep (os2-cron, auto-fired the first
// time a client crosses the Certified line). Never invents numbers.

const db = require('./_db');
const { scoreTenant } = require('./_osscore');

const MODEL = 'claude-opus-4-8';

async function tenantState(tid) {
  const w = [['tenant_id', '==', tid]];
  const [metrics, workers, workflows, knowledge] = await Promise.all([
    db.list('os_metrics', { where: w }),
    db.list('os_workers', { where: w }),
    db.list('os_workflows', { where: w }),
    db.list('os_knowledge', { where: w }),
  ]);
  return { metrics, workers, workflows, knowledge };
}

const SYSTEM = `You write proof for TMI, the Intelligent Company Firm, which turns owner-led businesses into Intelligent Companies that run on systems, not on the owner. Voice: direct, operator to operator, specific, no hype. Never use emojis. Never use em dashes. Never say "leverage AI".

You are given a real client's operating system build. Write proof from it. Do NOT invent numbers, dollar figures, timelines, or outcomes that are not in the data. You may reference the Company Intelligence Score and the Owner Dependency reading, and describe what was built (the workers, workflows, knowledge, and live data) and the shift from owner-dependent to systems-run.

Return ONLY valid JSON:
{
  "case_study": "a short internal case study, 120 to 200 words: who they are, what they run on now, and what changed structurally",
  "content_title": "short title for a post",
  "content": "a publish-ready LinkedIn post about this transformation, in TMI voice, that an owner reading it would find useful and want to share",
  "format": "linkedin"
}`;

async function writeProof(tenant, st, sc) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });

  const active = st.workers.filter((w) => w.status === 'active');
  const liveMetrics = st.metrics.filter((m) => m.updated_at);
  const ctx =
    `Company: ${tenant.name}${tenant.business_type ? ' (' + tenant.business_type + ')' : ''}\n` +
    `What they do: ${(tenant.profile && tenant.profile.what_you_do) || tenant.summary || 'unspecified'}\n` +
    `Company Intelligence Score: ${sc.score} / 100 (${sc.tier})\n` +
    `Owner Dependency: ${sc.owner_dependency}\n` +
    `AI workers built: ${st.workers.length} (${active.length} live): ${st.workers.map((w) => w.name).join(', ') || 'none'}\n` +
    `Workflows: ${st.workflows.map((w) => w.name).join(', ') || 'none'}\n` +
    `Knowledge captured: ${st.knowledge.length} items\n` +
    `Live metrics on the command center: ${liveMetrics.length} of ${st.metrics.length}`;

  const msg = await client.messages.create({
    model: MODEL, max_tokens: 1600, system: SYSTEM,
    messages: [{ role: 'user', content: ctx }],
  });
  const text = (msg.content || []).map((x) => x.text || '').join('').trim();
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  let raw = {};
  if (start !== -1 && end !== -1) { try { raw = JSON.parse(text.slice(start, end + 1)); } catch { raw = {}; } }
  return {
    case_study: String(raw.case_study || text).slice(0, 4000),
    content_title: String(raw.content_title || `How ${tenant.name} became an Intelligent Company`).slice(0, 120),
    content: String(raw.content || '').slice(0, 8000),
    format: 'linkedin',
  };
}

// Generate proof for one tenant and persist it. `trigger` labels the build-log
// entry ('manual' or 'auto'). Returns { case_study, content, score }.
async function generateProof(tenant, trigger) {
  const st = await tenantState(tenant.id);
  const sc = scoreTenant(Object.assign({ onboarded: !!tenant.onboarded }, st));
  const proof = await writeProof(tenant, st, sc);
  const now = new Date().toISOString();

  const case_study = await db.insert('tmi_knowledge', {
    title: 'Case study: ' + tenant.name, body: proof.case_study, kind: 'client',
    source_tenant: tenant.id, created_at: now,
  });
  const content = await db.insert('tmi_content', {
    title: proof.content_title, body: proof.content, format: proof.format || 'linkedin',
    angle: 'Client proof: ' + tenant.name, status: 'pending', source_tenant: tenant.id, created_at: now,
  });
  await db.insert('os_build_log', {
    tenant_id: tenant.id, kind: 'proof',
    summary: `TMI generated a case study from this build${trigger === 'auto' ? ' (auto, on certification)' : ''}.`,
    created_at: now,
  }).catch(() => {});
  return { case_study, content, score: sc };
}

module.exports = { tenantState, writeProof, generateProof };
