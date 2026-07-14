// CEO Agent — the strategic brain for TMI.
//
// Reads the full state of the business from the GTM database and writes one
// strategic readout: a scoreboard, where the company stands, the top three
// moves to grow, the biggest risks, and the decisions the founders need to
// make. This is the "thinking" layer. The Chief of Staff turns it into action.
//
// Self-contained and guarded like founder-brief.js: a missing collection, an
// empty result, or a missing ANTHROPIC key never throws. It degrades to a
// deterministic readout assembled from the numbers.
//
// CLI:  node agents/gtm/ceo.js
// HTTP: PATCH/POST /api/ceo-agent  { trigger: true }

import { fileURLToPath } from 'url';
import path from 'path';
import * as db from './tools/db.js';
import { sendDigest } from './tools/email.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();
const MODEL = 'claude-sonnet-4-6';

async function safe(fn, fallback) { try { return await fn(); } catch { return fallback; } }
const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
const num = (n) => Number(n) || 0;

// ── 1. Gather the state of the business ────────────────────────────────────
async function gather() {
  const now = new Date();
  const nowIso = now.toISOString();
  const d30 = new Date(now - 30 * 864e5).toISOString();
  const d7 = new Date(now - 7 * 864e5).toISOString();

  const funnel = await safe(() => db.getFunnel(), { total: 0, contacted: 0, replied: 0, booked: 0 });

  // Revenue: invoices paid in the last 30 days, and overdue AR.
  const invoices = await safe(() => db.list('invoices', {}), []);
  const paid30 = (invoices || []).filter(i => i.status === 'paid' && (i.paid_at || i.updated_at || '') >= d30);
  const revenue30 = paid30.reduce((s, i) => s + num(i.amount || i.total), 0);
  const overdue = (invoices || []).filter(i => i.status !== 'paid' && i.due_date && i.due_date < nowIso);
  const overdueAR = overdue.reduce((s, i) => s + num(i.amount || i.total), 0);

  // Clients + at-risk.
  const clients = await safe(() => db.count('clients', []), 0);
  const atRisk = await safe(
    () => db.list('client_health', { where: [['band', '==', 'at_risk']], limit: 25 }), []);

  // New pipeline momentum.
  const newLeads7 = await safe(() => db.count('leads', [['created_at', '>=', d7]]), 0);
  const bookings7 = await safe(async () => {
    const rows = await db.list('leads', { where: [['status', '==', 'booked']] });
    return (rows || []).filter(b => (b.booked_at || b.created_at || '') >= d7).length;
  }, 0);
  const openCallTasks = await safe(() => db.count('call_tasks', [['status', '==', 'open']]), 0);

  // Growth signals: newsletter audience + queued content.
  const subscribers = await safe(() => db.count('contacts', [['unsubscribed', '==', false]]), 0);
  const pendingContent = await safe(() => db.count('content_queue', [['status', '==', 'pending']]), 0);

  // Recent agent activity (what the machine has been doing).
  const recentRuns = await safe(
    () => db.list('gtm_runs', { order: 'ran_at', ascending: false, limit: 8 }), []);

  return {
    date: nowIso.slice(0, 10),
    funnel,
    revenue30, paidCount30: paid30.length,
    overdueAR, overdueCount: overdue.length,
    clients, atRiskCount: (atRisk || []).length,
    atRisk: (atRisk || []).slice(0, 5).map(c => c.company_name || c.company || c.name || c.email || 'client'),
    newLeads7, bookings7, openCallTasks,
    subscribers, pendingContent,
    recentRuns: (recentRuns || []).map(r => `${r.kind || 'run'} @ ${(r.ran_at || '').slice(0, 16).replace('T', ' ')}`),
  };
}

// ── 2. Deterministic scoreboard + priorities (fallback + model hints) ──────
function scoreboard(m) {
  return [
    { label: 'Revenue (30d)', value: money(m.revenue30), note: `${m.paidCount30} invoices paid` },
    { label: 'Overdue AR', value: money(m.overdueAR), note: `${m.overdueCount} invoices` },
    { label: 'New leads (7d)', value: String(m.newLeads7), note: `${m.bookings7} booked` },
    { label: 'Pipeline', value: String(m.funnel.total), note: `${m.funnel.booked} booked total` },
    { label: 'Clients', value: String(m.clients), note: `${m.atRiskCount} at risk` },
    { label: 'Audience', value: String(m.subscribers), note: `${m.pendingContent} posts queued` },
  ];
}

function deterministicPriorities(m) {
  const p = [];
  if (m.overdueCount > 0) p.push({ title: `Collect ${money(m.overdueAR)} in overdue AR`, why: 'Cash already earned is aging. Fastest money on the board.', metric: 'Overdue AR' });
  if (m.atRiskCount > 0) p.push({ title: `Save ${m.atRiskCount} at-risk client${m.atRiskCount === 1 ? '' : 's'}`, why: 'Retention beats acquisition. This revenue is already yours to lose.', metric: 'Clients at risk' });
  if (m.funnel.replied > m.funnel.booked) p.push({ title: 'Convert replies into booked audits', why: `${m.funnel.replied} replied but only ${m.funnel.booked} booked. The demand exists.`, metric: 'Reply to booking rate' });
  if (m.newLeads7 < 10) p.push({ title: 'Refill the top of the funnel', why: `Only ${m.newLeads7} new leads in 7 days. Pipeline goes thin in 30.`, metric: 'New leads / week' });
  if (m.pendingContent < 2) p.push({ title: 'Feed the content engine', why: 'Content is the cheapest lead source and it is running low.', metric: 'Posts queued' });
  return p.slice(0, 3);
}

const SYSTEM = `You are the CEO's strategic advisor at TMI, a company that installs intelligent operating systems and AI employees into other businesses. Once a week you write the operator's strategic readout from the real numbers.

VOICE: Direct. Operator, not consultant. Real numbers from the data, never filler or hype. Short blunt sentences. Never use em dashes. Never use emojis. Never say "leverage", "optimize", "synergy", "streamline", "robust", "seamless". Talk about growing and running the company.

You return ONLY valid JSON, no markdown fences, matching exactly:
{
 "state": "2 to 3 sentences on where the company actually stands right now, from the numbers.",
 "priorities": [{"title":"the move","why":"one sentence, why it is the highest leverage","metric":"the number it moves"}],
 "risks": [{"risk":"the risk in one line","severity":"high|medium|low"}],
 "decisions": [{"question":"a decision the founders must make","context":"one line of why now"}]
}
Give exactly 3 priorities ranked by leverage, 1 to 3 risks, and 1 to 2 decisions. Use only the numbers provided. Never invent figures.`;

async function llmReadout(m) {
  const hint = deterministicPriorities(m);
  const content = [
    `Write this week's CEO readout from the data. Suggested priorities (use unless the data clearly points elsewhere): ${JSON.stringify(hint)}`,
    '',
    `Date: ${m.date}`,
    `Revenue last 30 days: ${money(m.revenue30)} across ${m.paidCount30} paid invoices.`,
    `Overdue AR: ${money(m.overdueAR)} across ${m.overdueCount} invoices.`,
    `Funnel: ${m.funnel.total} leads total, ${m.funnel.contacted} contacted, ${m.funnel.replied} replied, ${m.funnel.booked} booked.`,
    `Momentum: ${m.newLeads7} new leads and ${m.bookings7} bookings in the last 7 days. ${m.openCallTasks} open call tasks.`,
    `Clients: ${m.clients} active, ${m.atRiskCount} at risk${m.atRisk.length ? ' (' + m.atRisk.join(', ') + ')' : ''}.`,
    `Growth signals: ${m.subscribers} newsletter subscribers, ${m.pendingContent} posts queued.`,
    m.recentRuns.length ? `Recent automated runs: ${m.recentRuns.join('; ')}.` : 'No recent automated runs logged.',
  ].join('\n');

  const msg = await anthropic.messages.create({
    model: MODEL, max_tokens: 1500, system: SYSTEM,
    messages: [{ role: 'user', content }],
  });
  const raw = (msg.content[0] && msg.content[0].text || '').trim();
  const json = raw.match(/\{[\s\S]*\}/);
  if (!json) throw new Error('no json');
  return JSON.parse(json[0]);
}

// ── runCeoAgent() ──────────────────────────────────────────────────────────
export async function runCeoAgent() {
  const started = Date.now();
  const metrics = await gather();
  const board = scoreboard(metrics);

  let readout;
  let usedLlm = false;
  if (process.env.ANTHROPIC_API_KEY) {
    try { readout = await llmReadout(metrics); usedLlm = true; }
    catch (e) { console.error('ceo llm:', e.message); }
  }
  if (!readout) {
    readout = {
      state: `Revenue ${money(metrics.revenue30)} in 30 days, ${metrics.funnel.booked} audits booked, ${metrics.atRiskCount} clients at risk, ${money(metrics.overdueAR)} in overdue AR.`,
      priorities: deterministicPriorities(metrics),
      risks: metrics.overdueCount ? [{ risk: `${money(metrics.overdueAR)} in AR is aging past terms`, severity: 'high' }] : [],
      decisions: [],
    };
  }

  const report = {
    date: metrics.date,
    generated_at: new Date().toISOString(),
    scoreboard: board,
    state: readout.state || '',
    priorities: readout.priorities || [],
    risks: readout.risks || [],
    decisions: readout.decisions || [],
    metrics,
    used_llm: usedLlm,
  };

  await safe(() => db.insert('ceo_reports', report), null);

  // Email a plain-text version to the founders (no-ops if no digest email set).
  const lines = [`TMI CEO Readout — ${metrics.date}`, '', report.state, '', 'TOP PRIORITIES'];
  (report.priorities || []).forEach((p, i) => lines.push(`${i + 1}. ${p.title} — ${p.why}`));
  if ((report.risks || []).length) { lines.push('', 'RISKS'); report.risks.forEach(r => lines.push(`- (${r.severity}) ${r.risk}`)); }
  if ((report.decisions || []).length) { lines.push('', 'DECISIONS'); report.decisions.forEach(d => lines.push(`- ${d.question}`)); }
  await safe(() => sendDigest({ subject: 'TMI CEO Readout', body: lines.join('\n') }), null);

  await safe(() => db.logRun({ kind: 'ceo-agent', used_llm: usedLlm, elapsed_s: Math.round((Date.now() - started) / 1000) }), null);
  console.log(`CEO agent: done (${usedLlm ? 'llm' : 'plain'})`);
  return report;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) runCeoAgent().then(() => process.exit(0)).catch(e => { console.error('Fatal:', e); process.exit(1); });
