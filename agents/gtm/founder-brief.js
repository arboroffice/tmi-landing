// Founder Daily Brief — the EA digital employee for Mia.
//
// Self-contained: reads only the GTM database (no Gmail / calendar dependency),
// aggregates the state of the business, and writes one tight, scannable brief
// the founder reads in 30 seconds. Persists a `founder_briefs` row and emails it
// to GTM_DIGEST_EMAIL via sendDigest. Every path is guarded — a missing
// collection, an empty result, or a missing ANTHROPIC key never throws; it
// degrades to a plain-text brief assembled from the numbers.
//
// CLI:  node agents/gtm/founder-brief.js
// HTTP: PATCH/POST /api/founder-brief  { trigger: true }

import { fileURLToPath } from 'url';
import path from 'path';
import * as db from './tools/db.js';
import { sendDigest } from './tools/email.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const ADMIN = 'https://admin.tmitechai.com';

// Small helpers — every one swallows its own error and returns a safe default.
async function safe(fn, fallback) {
  try { return await fn(); } catch { return fallback; }
}
const fmtMoney = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
const name = (r) =>
  (r && (r.company_name || r.company || [r.first_name, r.last_name].filter(Boolean).join(' ') || r.name || r.email)) || 'Unknown';

// ── 1. Gather the numbers ──────────────────────────────────────────────────
async function gather() {
  const nowIso = new Date().toISOString();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const funnel = await safe(() => db.getFunnel(), { total: 0, contacted: 0, replied: 0, booked: 0 });

  const openCallTasks = await safe(
    () => db.count('call_tasks', [['status', '==', 'open']]),
    0,
  );
  const hottestCalls = await safe(
    () => db.list('call_tasks', { where: [['status', '==', 'open']], order: 'created_at', ascending: false, limit: 5 }),
    [],
  );

  const hotAccounts = await safe(() => db.getHotAccounts(5), []);
  const recentBookings = await safe(() => db.getRecentBookings(5), []);

  // Clients needing attention: client_health band at_risk if the field exists.
  const atRiskClients = await safe(
    () => db.list('client_health', { where: [['band', '==', 'at_risk']], order: 'computed_at', ascending: false, limit: 10 }),
    [],
  );

  // Overdue AR: invoices not paid and past their due date.
  const overdueInvoices = await safe(async () => {
    const rows = await db.list('invoices', { where: [['status', '!=', 'paid']] });
    return (rows || []).filter(i => i.due_date && i.due_date < nowIso);
  }, []);
  const overdueAR = overdueInvoices.reduce((s, i) => s + (Number(i.amount) || Number(i.total) || 0), 0);

  // Latest prospect-gen run for top-of-funnel context.
  const lastProspectGen = await safe(async () => {
    const rows = await db.list('gtm_runs', { where: [['kind', '==', 'prospect-gen']], order: 'ran_at', ascending: false, limit: 1 });
    return (rows && rows[0]) || null;
  }, null);

  // Today's bookings (best-effort) from the recent set.
  const bookedToday = (recentBookings || []).filter(b => (b.booked_at || b.created_at || '') >= todayIso).length;

  return {
    date: nowIso.slice(0, 10),
    funnel,
    openCallTasks,
    hottestCalls: (hottestCalls || []).map(t => ({
      who: name(t),
      reason: t.reason || t.note || t.priority || null,
      phone: t.phone || t.contact_phone || null,
    })),
    hotAccounts: (hotAccounts || []).map(a => ({ who: name(a), status: a.status || null })),
    recentBookings: (recentBookings || []).map(b => ({ who: name(b), at: (b.booked_at || b.created_at || '').slice(0, 10) })),
    bookedToday,
    atRiskClients: (atRiskClients || []).map(c => ({ who: name(c), reason: c.health_reason || c.note || null })),
    overdueCount: overdueInvoices.length,
    overdueAR,
    overdueTop: (overdueInvoices || [])
      .sort((a, b) => (Number(b.amount || b.total) || 0) - (Number(a.amount || a.total) || 0))
      .slice(0, 5)
      .map(i => ({ who: name(i), amount: Number(i.amount) || Number(i.total) || 0, due: (i.due_date || '').slice(0, 10) })),
    lastProspectGen: lastProspectGen
      ? { at: (lastProspectGen.ran_at || '').slice(0, 16).replace('T', ' '), elapsed_s: lastProspectGen.elapsed_s }
      : null,
  };
}

// ── 2a. Plain-text brief (the fallback / no-LLM path) ──────────────────────
function plainBrief(m) {
  const L = [];
  L.push(`TMI Daily Brief — ${m.date}`);
  L.push('');
  L.push('FUNNEL AT A GLANCE');
  L.push(`Leads ${m.funnel.total} total · ${m.funnel.contacted} contacted · ${m.funnel.replied} replied · ${m.funnel.booked} booked`);
  if (m.lastProspectGen) L.push(`Last prospecting run: ${m.lastProspectGen.at}`);
  L.push('');

  L.push('CALLS TO MAKE TODAY');
  L.push(`${m.openCallTasks} open call task${m.openCallTasks === 1 ? '' : 's'}.`);
  if (m.hottestCalls.length) {
    for (const c of m.hottestCalls) {
      L.push(`  - ${c.who}${c.reason ? ' (' + c.reason + ')' : ''}${c.phone ? ' · ' + c.phone : ''}`);
    }
  }
  L.push(`Work the queue: ${ADMIN}/admin-call-tasks`);
  L.push('');

  L.push('BOOKINGS');
  if (m.recentBookings.length) {
    L.push(`${m.bookedToday} booked today. Recent:`);
    for (const b of m.recentBookings) L.push(`  - ${b.who}${b.at ? ' · ' + b.at : ''}`);
  } else {
    L.push('No recent bookings.');
  }
  L.push('');

  L.push('CLIENTS AT RISK');
  if (m.atRiskClients.length) {
    for (const c of m.atRiskClients) L.push(`  - ${c.who}${c.reason ? ' (' + c.reason + ')' : ''}`);
  } else {
    L.push('None flagged at risk.');
  }
  L.push('');

  L.push('OVERDUE AR');
  if (m.overdueCount) {
    L.push(`${m.overdueCount} overdue invoice${m.overdueCount === 1 ? '' : 's'} worth ${fmtMoney(m.overdueAR)}.`);
    for (const i of m.overdueTop) L.push(`  - ${i.who} · ${fmtMoney(i.amount)}${i.due ? ' · due ' + i.due : ''}`);
  } else {
    L.push('Nothing overdue.');
  }
  L.push('');

  L.push('THE ONE THING TODAY');
  L.push(decideOneThing(m));

  return L.join('\n');
}

// Deterministic pick for the single most important move, used by the fallback
// and handed to the model as a hint.
function decideOneThing(m) {
  if (m.overdueCount > 0) return `Collect on ${m.overdueCount} overdue invoice${m.overdueCount === 1 ? '' : 's'} (${fmtMoney(m.overdueAR)}). Cash first.`;
  if (m.atRiskClients.length) return `Call ${m.atRiskClients[0].who}. A client is at risk and that revenue is already yours.`;
  if (m.openCallTasks > 0) return `Clear the call queue. ${m.openCallTasks} open task${m.openCallTasks === 1 ? '' : 's'} are warm and waiting.`;
  if (m.funnel.replied > m.funnel.booked) return `Turn replies into meetings. ${m.funnel.replied} have replied, only ${m.funnel.booked} are booked.`;
  return 'Add to the top of the funnel. The pipeline is thin today.';
}

// ── 2b. LLM brief ──────────────────────────────────────────────────────────
const SYSTEM = `You are Mia's executive assistant at TMI, an agency that builds intelligent operating systems for trades, field service, construction, energy, and industrial companies. Every morning you write her one daily brief on the state of the business.

VOICE: Direct. Operator, not tech person. Real numbers from the data, never filler or hype. Short blunt sentences. Never use em dashes. Never use emojis. Never write "leverage", "optimize", "synergy", "streamline", "robust", "seamless", or "AI will". Say "the system" or "a digital worker".

FORMAT: Plain text only, no markdown symbols. Start with "TMI Daily Brief" and the date. Then short labeled sections in this order: Funnel at a glance, Calls to make today, Bookings, Clients at risk, Overdue AR. End with a section "The one thing today" that names the single highest-leverage move. Keep the whole thing scannable in 30 seconds. Only use the numbers given. Do not invent figures or names.`;

async function llmBrief(m) {
  const content = [
    `Write today's brief from this data. The deterministic recommendation for the one thing is: "${decideOneThing(m)}" — use it unless the data clearly points elsewhere.`,
    '',
    `Date: ${m.date}`,
    `Funnel: ${m.funnel.total} total leads, ${m.funnel.contacted} contacted, ${m.funnel.replied} replied, ${m.funnel.booked} booked.`,
    m.lastProspectGen ? `Last prospecting run: ${m.lastProspectGen.at}.` : 'No prospecting run logged yet.',
    '',
    `Open call tasks: ${m.openCallTasks}. Call queue: ${ADMIN}/admin-call-tasks`,
    m.hottestCalls.length ? 'Hottest to call: ' + m.hottestCalls.map(c => `${c.who}${c.reason ? ' (' + c.reason + ')' : ''}${c.phone ? ' ' + c.phone : ''}`).join('; ') : 'No specific call tasks queued.',
    '',
    `Booked today: ${m.bookedToday}.`,
    m.recentBookings.length ? 'Recent bookings: ' + m.recentBookings.map(b => `${b.who}${b.at ? ' (' + b.at + ')' : ''}`).join('; ') : 'No recent bookings.',
    '',
    m.atRiskClients.length ? 'Clients at risk: ' + m.atRiskClients.map(c => `${c.who}${c.reason ? ' (' + c.reason + ')' : ''}`).join('; ') : 'No clients flagged at risk.',
    '',
    m.overdueCount ? `Overdue AR: ${m.overdueCount} invoices worth ${fmtMoney(m.overdueAR)}. Top: ` + m.overdueTop.map(i => `${i.who} ${fmtMoney(i.amount)}${i.due ? ' due ' + i.due : ''}`).join('; ') : 'No overdue invoices.',
  ].join('\n');

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  });
  const text = msg.content[0].text.trim();
  if (!text) throw new Error('empty completion');
  return text;
}

// ── runFounderBrief() ──────────────────────────────────────────────────────
export async function runFounderBrief() {
  const started = Date.now();
  const metrics = await gather();

  let body;
  let usedLlm = false;
  if (process.env.ANTHROPIC_API_KEY) {
    try { body = await llmBrief(metrics); usedLlm = true; }
    catch (e) { console.error('founder-brief llm:', e.message); }
  }
  if (!body) body = plainBrief(metrics);

  const date = metrics.date;
  const created_at = new Date().toISOString();

  // Store the brief (best-effort).
  await safe(() => db.insert('founder_briefs', { date, body, metrics, created_at }), null);

  // Email it (sendDigest no-ops gracefully if GTM_DIGEST_EMAIL is unset).
  let sent = false;
  try {
    await sendDigest({ subject: 'TMI Daily Brief', body });
    sent = true;
  } catch (e) {
    console.error('founder-brief email:', e.message);
  }

  const stats = { sent, used_llm: usedLlm, metrics };
  await safe(() => db.logRun({ kind: 'founder-brief', sent, used_llm: usedLlm, elapsed_s: Math.round((Date.now() - started) / 1000) }), null);

  console.log(`Founder brief: done (${usedLlm ? 'llm' : 'plain'}, sent=${sent})`);
  return stats;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runFounderBrief().then(() => process.exit(0)).catch(e => { console.error('Fatal:', e); process.exit(1); });
}
