// Client Success + QBR Agent — keeps the accounts you already won.
//
// For every active client it computes a simple health score from the signals we
// have (activity recency, last contact, time since start, onboarding / open
// issues, any engagement fields), bands it healthy / watch / at_risk, and writes
// a client_health snapshot. Clients due a monthly report get a concise value
// report written in TMI operator voice and emailed to them, stored in
// qbr_reports. At-risk clients are flagged so a human checks in, and the run
// closes with an internal digest. Every path is guarded so the run degrades to a
// no-op and returns stats rather than throwing.
//
//   import { runClientSuccess } from './client-success.js';
//   const stats = await runClientSuccess({ limit: 25 });
//
// CLI:  node agents/gtm/client-success.js [limit]

import { fileURLToPath } from 'url';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import * as db from './tools/db.js';
import { sendEmail, sendDigest } from './tools/email.js';

const anthropic = new Anthropic();

const ACTIVE_STATUSES = ['client', 'building', 'active'];
const QBR_INTERVAL_DAYS = 30;

const daysAgo = (iso) => iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity;
const period = () => new Date().toISOString().slice(0, 7); // YYYY-MM

// ── Health scoring ──────────────────────────────────────────────────────────
// Simple, explainable score out of 100 built from whatever signals exist on the
// client record. Missing signals are treated neutrally so sparse records do not
// get punished into a false at_risk band.
function scoreClient(client) {
  let score = 100;
  const reasons = [];

  const lastActivity = client.last_activity_at || client.last_contact_at || client.updated_at;
  const sinceActivity = daysAgo(lastActivity);
  if (sinceActivity !== Infinity) {
    if (sinceActivity > 45) { score -= 35; reasons.push(`No activity in ${Math.round(sinceActivity)} days`); }
    else if (sinceActivity > 21) { score -= 18; reasons.push(`Quiet for ${Math.round(sinceActivity)} days`); }
    else if (sinceActivity > 10) { score -= 8; reasons.push(`Last activity ${Math.round(sinceActivity)} days ago`); }
  }

  const sinceContact = daysAgo(client.last_contact_at);
  if (sinceContact !== Infinity && sinceContact > 30) {
    score -= 12; reasons.push(`No direct contact in ${Math.round(sinceContact)} days`);
  }

  // Onboarding: new accounts that have not finished onboarding are a watch item.
  const sinceStart = daysAgo(client.started_at);
  const onboardingDone = client.onboarding_complete === true || client.onboarded === true;
  if (!onboardingDone && sinceStart !== Infinity && sinceStart > 30) {
    score -= 20; reasons.push('Onboarding still open past 30 days');
  }

  // Open issues / support load.
  const openIssues = Number(client.open_issues || client.open_tickets || 0);
  if (openIssues >= 3) { score -= 22; reasons.push(`${openIssues} open issues`); }
  else if (openIssues > 0) { score -= 8; reasons.push(`${openIssues} open issue(s)`); }

  // Explicit engagement / usage signal when present (0-100 scale assumed).
  if (client.engagement_score != null) {
    const eng = Number(client.engagement_score);
    if (eng < 30) { score -= 25; reasons.push('Low product engagement'); }
    else if (eng < 60) { score -= 10; reasons.push('Moderate product engagement'); }
    else { reasons.push('Strong product engagement'); }
  }

  // Honeymoon protection: a brand-new account with no bad signals reads healthy.
  if (sinceStart !== Infinity && sinceStart < 14 && reasons.length === 0) {
    reasons.push('Recently onboarded, settling in');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  let band = 'healthy';
  if (score < 50) band = 'at_risk';
  else if (score < 75) band = 'watch';

  if (reasons.length === 0) reasons.push('No risk signals on record');
  return { score, band, reasons };
}

// Upsert the latest health snapshot per client (one current row keyed by client).
async function writeHealth(client, company, scored) {
  const row = {
    client_id: client.id,
    company,
    score: scored.score,
    band: scored.band,
    reasons: scored.reasons,
    computed_at: new Date().toISOString(),
  };
  try {
    const existing = await db.findOne('client_health', 'client_id', client.id);
    if (existing) await db.update('client_health', existing.id, row);
    else await db.insert('client_health', row);
  } catch (e) {
    console.warn('client-success: health write failed for', client.id, e.message);
  }
}

// ── Monthly value report ────────────────────────────────────────────────────
async function dueForReport(clientId) {
  try {
    const rows = await db.list('qbr_reports', {
      where: [['client_id', '==', clientId]],
      order: 'sent_at', ascending: false, limit: 1,
    });
    if (!rows.length) return true;
    return daysAgo(rows[0].sent_at) >= QBR_INTERVAL_DAYS;
  } catch {
    return false; // never report on a read failure
  }
}

async function writeReportBody(client, company, contact, scored) {
  const firstName = contact?.first_name || 'there';
  const plan = client.plan || client.mrr ? `Plan: ${client.plan || ''} ${client.mrr ? `($${client.mrr}/mo)` : ''}`.trim() : '';
  const facts = [
    `Client: ${company}`,
    `Contact: ${firstName}`,
    client.started_at ? `Started: ${String(client.started_at).slice(0, 10)}` : '',
    plan,
    `Health band: ${scored.band} (${scored.score}/100)`,
    `Signals: ${scored.reasons.join('; ')}`,
  ].filter(Boolean).join('\n');

  const system = [
    'You write a short monthly value report from TMI Technology to an industrial / field-services client.',
    'Voice: direct operator-to-operator. No hype, no buzzwords, no "leverage AI". Never use em dashes; use regular dashes or restructure.',
    'No emojis. No bullet-point listicles - write in short prose paragraphs.',
    'Structure in three short beats: what was built or automated this month, the time and money impact framed honestly from only what we know, and the focus for next month.',
    'If a signal is unknown, do not invent numbers. Keep it to roughly 150-220 words. Sign off as "The TMI team".',
  ].join(' ');

  const content = `Write the monthly value report email body (plain text, no subject line) for this client.\n\n${facts}`;

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1800,
    system,
    messages: [{ role: 'user', content }],
  });
  let body = (msg.content?.[0]?.text || '').trim();
  body = body.replace(/—/g, ' - '); // strip any stray em dashes defensively
  return body;
}

async function sendReport(client, company, contact, scored) {
  const email = contact?.email;
  if (!email) return false;
  let body;
  try {
    body = await writeReportBody(client, company, contact, scored);
  } catch (e) {
    console.warn('client-success: report draft failed for', company, e.message);
    return false;
  }
  if (!body) return false;

  const subject = `${company}: your TMI monthly review`;
  try {
    await sendEmail({
      to: email,
      toName: contact?.first_name || null,
      subject,
      body,
      cc: process.env.OUTREACH_CC || undefined,
    });
  } catch (e) {
    console.warn('client-success: report send failed for', company, e.message);
    return false;
  }

  try {
    await db.insert('qbr_reports', {
      client_id: client.id,
      company,
      period: period(),
      body,
      sent_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('client-success: qbr_reports write failed for', company, e.message);
  }
  return true;
}

// ── Main ────────────────────────────────────────────────────────────────────
export async function runClientSuccess({ limit = 25 } = {}) {
  const stats = { scored: 0, atRisk: 0, reportsSent: 0 };
  const atRiskList = [];

  let clients = [];
  try {
    clients = await db.list('clients', {
      where: [['status', 'in', ACTIVE_STATUSES]],
      order: 'created_at', ascending: false, limit,
    });
  } catch (e) {
    console.error('client-success: client list failed:', e.message);
    return stats;
  }
  if (!clients.length) {
    console.log('Client Success: no active clients to score');
    return stats;
  }

  // Hydrate contacts for names / emails.
  try {
    await db.hydrateMany(clients, 'contact_id', 'contacts', 'contact');
  } catch (e) {
    console.warn('client-success: contact hydrate failed:', e.message);
  }

  for (const client of clients) {
    const company = client.company || client.contact?.company || 'this account';
    const contact = client.contact || null;

    let scored;
    try {
      scored = scoreClient(client);
    } catch (e) {
      console.warn('client-success: scoring failed for', company, e.message);
      continue;
    }

    await writeHealth(client, company, scored);
    stats.scored++;

    if (scored.band === 'at_risk') {
      stats.atRisk++;
      atRiskList.push({ company, score: scored.score, reasons: scored.reasons, email: contact?.email });
    }

    try {
      if (await dueForReport(client.id)) {
        const sent = await sendReport(client, company, contact, scored);
        if (sent) stats.reportsSent++;
      }
    } catch (e) {
      console.warn('client-success: report flow failed for', company, e.message);
    }
  }

  // Run record.
  try { await db.logRun({ kind: 'client-success', ...stats }); } catch {}

  // Internal digest. No em dashes, no emojis.
  try {
    const lines = [
      `Client Success run complete.`,
      ``,
      `Scored: ${stats.scored}`,
      `At risk: ${stats.atRisk}`,
      `Monthly reports sent: ${stats.reportsSent}`,
    ];
    if (atRiskList.length) {
      lines.push('', 'At-risk accounts to check in on:');
      for (const a of atRiskList) {
        lines.push(`- ${a.company} (${a.score}/100): ${a.reasons.join('; ')}${a.email ? ` [${a.email}]` : ''}`);
      }
    }
    await sendDigest({ subject: `Client Success: ${stats.atRisk} at risk, ${stats.reportsSent} reports sent`, body: lines.join('\n') });
  } catch (e) {
    console.warn('client-success: digest failed:', e.message);
  }

  console.log(`Client Success: scored ${stats.scored}, at risk ${stats.atRisk}, reports ${stats.reportsSent}`);
  return stats;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const limit = parseInt(process.argv[2] || '25', 10);
  runClientSuccess({ limit })
    .then(s => { console.log(JSON.stringify(s)); process.exit(0); })
    .catch(e => { console.error('Fatal:', e); process.exit(1); });
}
