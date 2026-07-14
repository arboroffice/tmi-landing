// Agent Runtime — lets the Chief of Staff build new agents on demand.
//
// An "agent" here is a SPEC (a row in `agent_specs`), not new code: a name, a
// purpose, the instructions it runs on, the data it is allowed to read, and
// what it outputs. This runtime does two things:
//
//   proposeAgentSpec(need)  -> the Chief of Staff authors a new draft spec from
//                              a plain-language need. Draft = inert until a human
//                              activates it.
//   runCustomAgent(spec)    -> executes any spec: gathers its (allowlisted,
//                              capped) reads, runs the LLM on its instructions,
//                              and persists the output. Built agents can produce
//                              a brief (text) or internal actions. They can NEVER
//                              contact a customer; outbound stays with the coded,
//                              guarded agents and a human click.
//
// Guarded like the rest of gtm: missing key/collection/data never throws.

import * as db from './tools/db.js';
import { sendDigest } from './tools/email.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();
const MODEL = 'claude-sonnet-4-6';

async function safe(fn, fallback) { try { return await fn(); } catch { return fallback; } }

// Collections a built agent is allowed to read. Read-only, everything else is
// refused. Keeps a generated agent from touching data it has no business in.
export const READ_ALLOWLIST = [
  'leads', 'invoices', 'clients', 'client_health', 'call_tasks', 'contacts',
  'content_queue', 'gtm_runs', 'cos_actions', 'cos_plans', 'ceo_reports',
  'founder_briefs', 'prospect_audits', 'replies', 'outreach', 'bookings',
  'visitors', 'proposals', 'projects',
];
const OUTPUTS = ['brief', 'actions'];
const CADENCES = ['manual', 'daily', 'weekly'];

// Clamp an LLM-authored spec to something safe to run.
export function sanitizeSpec(raw) {
  const s = raw || {};
  const reads = (Array.isArray(s.reads) ? s.reads : [])
    .filter(r => r && READ_ALLOWLIST.includes(r.collection))
    .slice(0, 5)
    .map(r => ({
      collection: r.collection,
      where: Array.isArray(r.where) ? r.where.slice(0, 3) : undefined,
      order: typeof r.order === 'string' ? r.order : undefined,
      ascending: r.ascending === true,
      limit: Math.min(Math.max(Number(r.limit) || 20, 1), 50),
    }));
  return {
    name: String(s.name || 'Untitled agent').slice(0, 80),
    purpose: String(s.purpose || '').slice(0, 400),
    system_prompt: String(s.system_prompt || '').slice(0, 4000),
    reads,
    output: OUTPUTS.includes(s.output) ? s.output : 'brief',
    cadence: CADENCES.includes(s.cadence) ? s.cadence : 'manual',
    external: false, // built agents never contact customers
  };
}

const AUTHOR_SYSTEM = `You are the Chief of Staff at TMI, and you design new digital employees ("agents") on demand. Given a plain-language need, you author one agent spec.

Rules:
- The agent can only READ from these collections: ${READ_ALLOWLIST.join(', ')}. Never reference any other collection.
- output is "brief" (writes a short readout for the founders) or "actions" (proposes internal tasks for the team). A built agent can NEVER send email or SMS to customers.
- cadence is "manual", "daily", or "weekly".
- The system_prompt is the agent's own instructions: who it is, exactly what to analyze from the data, and what its output should contain. Write it in TMI voice: direct, real numbers, no hype, no em dashes, no emojis.

Return ONLY valid JSON, no markdown fences:
{"name":"...","purpose":"one line","system_prompt":"the agent's instructions","reads":[{"collection":"leads","where":[["status","==","new"]],"order":"created_at","ascending":false,"limit":25}],"output":"brief","cadence":"weekly"}`;

export async function proposeAgentSpec(need) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return sanitizeSpec({ name: 'New agent (draft)', purpose: String(need || '').slice(0, 200), system_prompt: String(need || ''), output: 'brief', cadence: 'manual', reads: [] });
  }
  const msg = await anthropic.messages.create({
    model: MODEL, max_tokens: 1200, system: AUTHOR_SYSTEM,
    messages: [{ role: 'user', content: `The need: ${String(need || '').slice(0, 1200)}` }],
  });
  const raw = (msg.content[0] && msg.content[0].text || '').trim();
  const json = raw.match(/\{[\s\S]*\}/);
  if (!json) throw new Error('no spec json');
  return sanitizeSpec(JSON.parse(json[0]));
}

// Persist a proposed spec as a draft (inert until a human activates it).
export async function saveDraftSpec(spec, createdBy = 'chief-of-staff') {
  const clean = sanitizeSpec(spec);
  return db.insert('agent_specs', Object.assign(clean, {
    status: 'draft', created_by: createdBy, created_at: new Date().toISOString(), last_run_at: null,
  }));
}

// Gather the spec's reads, capped, into a compact digest for the model.
async function gather(spec) {
  const out = {};
  for (const r of (spec.reads || [])) {
    const rows = await safe(() => db.list(r.collection, {
      where: r.where, order: r.order, ascending: r.ascending, limit: r.limit,
    }), []);
    // keep it small: cap rows and stringify a shallow view
    out[r.collection] = (rows || []).slice(0, r.limit).map(row => {
      const o = {};
      for (const k of Object.keys(row || {}).slice(0, 12)) {
        const v = row[k];
        o[k] = (typeof v === 'string') ? v.slice(0, 200) : v;
      }
      return o;
    });
  }
  return out;
}

const GUARDRAILS = `\n\nVOICE: direct, real numbers only, no hype, no em dashes, no emojis. Never invent figures or names; use only the data given.`;

export async function runCustomAgent(spec) {
  const started = Date.now();
  const data = await gather(spec);
  let digest = JSON.stringify(data);
  if (digest.length > 7000) digest = digest.slice(0, 7000) + ' ...(truncated)';

  let output = '';
  let actions = [];
  if (process.env.ANTHROPIC_API_KEY && spec.system_prompt) {
    try {
      const system = spec.system_prompt + GUARDRAILS + (spec.output === 'actions'
        ? `\n\nReturn ONLY valid JSON: {"actions":[{"title":"...","detail":"...","owner":"Mia|Tyler","priority":"now|today|this_week"}]}`
        : `\n\nReturn plain text only, scannable in under a minute.`);
      const msg = await anthropic.messages.create({
        model: MODEL, max_tokens: 1400, system,
        messages: [{ role: 'user', content: `Data:\n${digest}` }],
      });
      const raw = (msg.content[0] && msg.content[0].text || '').trim();
      if (spec.output === 'actions') {
        const j = raw.match(/\{[\s\S]*\}/);
        actions = j ? (JSON.parse(j[0]).actions || []) : [];
      } else {
        output = raw;
      }
    } catch (e) { console.error('runCustomAgent llm:', e.message); }
  }
  if (!output && spec.output !== 'actions') {
    output = `${spec.name}: ran with ${Object.values(data).reduce((s, a) => s + a.length, 0)} records. No LLM output (missing key or empty).`;
  }

  const generated_at = new Date().toISOString();
  // Persist the run.
  const run = await safe(() => db.insert('agent_runs', {
    spec_id: spec.id || null, name: spec.name, output_type: spec.output,
    output: output || null, actions: actions.length ? actions : null,
    generated_at, created_at: generated_at,
  }), null);

  // If it produced actions, write them to the shared internal queue (never external).
  for (const a of actions.slice(0, 10)) {
    await safe(() => db.insert('cos_actions', {
      plan_id: null, source: spec.name, date: generated_at.slice(0, 10),
      title: a.title || '', detail: a.detail || '', owner: a.owner || 'Mia',
      agent: null, external: false, priority: a.priority || 'today',
      status: 'open', created_at: generated_at,
    }), null);
  }

  // Brief agents email the founders.
  if (spec.output === 'brief' && output) {
    await safe(() => sendDigest({ subject: `Agent: ${spec.name}`, body: output }), null);
  }

  if (spec.id) await safe(() => db.update('agent_specs', spec.id, { last_run_at: generated_at }), null);
  await safe(() => db.logRun({ kind: 'custom-agent', name: spec.name, elapsed_s: Math.round((Date.now() - started) / 1000) }), null);

  return { id: run && run.id, name: spec.name, output, actions, generated_at };
}

// Scheduler: run every active spec whose cadence is due (called by cron).
export async function runDueAgents() {
  const specs = await safe(() => db.list('agent_specs', { where: [['status', '==', 'active']], limit: 50 }), []);
  const now = Date.now();
  const due = (specs || []).filter(s => {
    if (s.cadence === 'manual') return false;
    if (!s.last_run_at) return true;
    const age = now - new Date(s.last_run_at).getTime();
    return s.cadence === 'daily' ? age > 20 * 3600e3 : age > 6 * 864e5; // weekly ~6d
  });
  const results = [];
  for (const s of due) results.push(await safe(() => runCustomAgent(s), null));
  return { ran: results.filter(Boolean).length };
}
