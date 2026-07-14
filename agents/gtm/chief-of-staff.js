// Chief of Staff Agent — turns strategy into delegated, tracked action.
//
// Reads the latest CEO readout and the latest Founder Brief, then produces one
// action plan: the single focus, and a short list of concrete actions, each
// with an owner (Mia, Tyler, or a named digital agent) and a priority. It
// writes each action to `cos_actions` so the admin cockpit can track it, and
// persists the plan to `cos_plans`.
//
// It does NOT send anything to customers on its own. Actions that dispatch a
// digital agent are proposed with an `agent` key; a human approves and runs
// them from the cockpit (POST /api/chief-of-staff { runAgent }). This keeps a
// person in the loop for anything outward-facing.
//
// CLI:  node agents/gtm/chief-of-staff.js
// HTTP: PATCH/POST /api/chief-of-staff  { trigger: true }

import { fileURLToPath } from 'url';
import path from 'path';
import * as db from './tools/db.js';
import { sendDigest } from './tools/email.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();
const MODEL = 'claude-sonnet-4-6';

async function safe(fn, fallback) { try { return await fn(); } catch { return fallback; } }

// The digital agents the Chief of Staff can dispatch. `external: true` means it
// contacts customers, so it always requires human approval in the cockpit.
export const AGENT_CATALOG = [
  { key: 'ceo', label: 'CEO Agent (refresh strategy)', external: false },
  { key: 'founder-brief', label: 'Founder Brief (refresh the daily brief)', external: false },
  { key: 'prospect-gen', label: 'Prospecting (find new leads)', external: false },
  { key: 'collections', label: 'Collections (chase overdue AR)', external: true },
  { key: 'reactivate', label: 'Reactivation (wake up cold leads)', external: true },
  { key: 'campaign-send', label: 'Campaign Send (send the queued campaign)', external: true },
];
const AGENT_KEYS = AGENT_CATALOG.map(a => a.key);

async function gather() {
  const ceo = await safe(async () => (await db.list('ceo_reports', { order: 'generated_at', ascending: false, limit: 1 }))[0], null);
  const brief = await safe(async () => (await db.list('founder_briefs', { order: 'created_at', ascending: false, limit: 1 }))[0], null);
  const funnel = await safe(() => db.getFunnel(), { total: 0, contacted: 0, replied: 0, booked: 0 });
  const openActions = await safe(() => db.count('cos_actions', [['status', '==', 'open']]), 0);
  return { ceo, brief, funnel, openActions };
}

const SYSTEM = `You are the Chief of Staff at TMI, a company that installs intelligent operating systems and AI employees into other businesses. You take the CEO's strategy and the daily brief and turn them into a short, delegated action plan the team executes today. You are the operator who makes sure the plan actually happens.

VOICE: Direct. Real. Short blunt sentences. Never use em dashes. Never use emojis. Never say "leverage", "optimize", "synergy", "streamline". Assign work clearly.

You can delegate an action to a digital agent by setting its "agent" field to one of these keys: ${AGENT_KEYS.join(', ')}. Only use those exact keys, or null for a human action. Actions handled by a person get an owner of "Mia" or "Tyler".

You return ONLY valid JSON, no markdown fences, matching exactly:
{
 "focus": "the single most important thing to move today, one sentence",
 "actions": [
   {"title":"the action","detail":"one line of what and why","owner":"Mia|Tyler|Agent","agent":"<agent key or null>","priority":"now|today|this_week"}
 ]
}
Give 3 to 6 actions, ranked, the most important first. Prefer actions that directly grow revenue or protect existing revenue. Use only what the strategy and brief support.`;

function fallbackPlan(g) {
  const actions = [];
  const pr = (g.ceo && g.ceo.priorities) || [];
  pr.slice(0, 3).forEach(p => actions.push({ title: p.title, detail: p.why || '', owner: 'Mia', agent: null, priority: 'today' }));
  if (!actions.length) actions.push({ title: 'Refresh the CEO readout', detail: 'No strategy on file yet. Run the CEO agent to set direction.', owner: 'Agent', agent: 'ceo', priority: 'now' });
  return { focus: (pr[0] && pr[0].title) || 'Set this week\'s direction', actions };
}

async function llmPlan(g) {
  const content = [
    'Build today\'s action plan.',
    '',
    g.ceo ? `CEO strategy (state): ${g.ceo.state}` : 'No CEO strategy on file yet.',
    g.ceo && g.ceo.priorities ? `CEO priorities: ${JSON.stringify(g.ceo.priorities)}` : '',
    g.ceo && g.ceo.risks ? `Risks: ${JSON.stringify(g.ceo.risks)}` : '',
    '',
    g.brief ? `Today\'s founder brief:\n${(g.brief.body || '').slice(0, 1800)}` : 'No founder brief on file today.',
    '',
    `Funnel: ${g.funnel.total} leads, ${g.funnel.replied} replied, ${g.funnel.booked} booked. ${g.openActions} actions already open.`,
  ].filter(Boolean).join('\n');

  const msg = await anthropic.messages.create({
    model: MODEL, max_tokens: 1400, system: SYSTEM,
    messages: [{ role: 'user', content }],
  });
  const raw = (msg.content[0] && msg.content[0].text || '').trim();
  const json = raw.match(/\{[\s\S]*\}/);
  if (!json) throw new Error('no json');
  const plan = JSON.parse(json[0]);
  // sanitize agent keys
  (plan.actions || []).forEach(a => { if (a.agent && !AGENT_KEYS.includes(a.agent)) a.agent = null; });
  return plan;
}

export async function runChiefOfStaff() {
  const started = Date.now();
  const g = await gather();

  let plan;
  let usedLlm = false;
  if (process.env.ANTHROPIC_API_KEY) {
    try { plan = await llmPlan(g); usedLlm = true; }
    catch (e) { console.error('cos llm:', e.message); }
  }
  if (!plan) plan = fallbackPlan(g);

  const generated_at = new Date().toISOString();
  const date = generated_at.slice(0, 10);

  // Persist the plan.
  const saved = await safe(() => db.insert('cos_plans', {
    date, generated_at, focus: plan.focus || '', actions: plan.actions || [], used_llm: usedLlm,
  }), null);
  const planId = saved && saved.id ? saved.id : null;

  // Write each action as a trackable record (open) with its external flag.
  for (const a of (plan.actions || [])) {
    const cat = AGENT_CATALOG.find(c => c.key === a.agent);
    await safe(() => db.insert('cos_actions', {
      plan_id: planId, date,
      title: a.title || '', detail: a.detail || '',
      owner: a.owner || 'Mia', agent: a.agent || null,
      external: !!(cat && cat.external),
      priority: a.priority || 'today',
      status: 'open', created_at: generated_at,
    }), null);
  }

  // Email the plan (no-ops without a digest email).
  const lines = [`TMI Chief of Staff — ${date}`, '', `Focus: ${plan.focus || ''}`, '', 'ACTIONS'];
  (plan.actions || []).forEach((a, i) => lines.push(`${i + 1}. [${a.owner || 'Mia'}${a.agent ? '/' + a.agent : ''}] ${a.title}${a.detail ? ' — ' + a.detail : ''}`));
  await safe(() => sendDigest({ subject: 'TMI Chief of Staff — today\'s plan', body: lines.join('\n') }), null);

  await safe(() => db.logRun({ kind: 'chief-of-staff', used_llm: usedLlm, elapsed_s: Math.round((Date.now() - started) / 1000) }), null);
  console.log(`Chief of Staff: done (${usedLlm ? 'llm' : 'plain'}, ${(plan.actions || []).length} actions)`);
  return Object.assign({ id: planId }, plan, { date, generated_at });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) runChiefOfStaff().then(() => process.exit(0)).catch(e => { console.error('Fatal:', e); process.exit(1); });
