// Expansion / Upsell Agent — grows the clients you already won.
//
// TMI's offer ladder runs free Complete Audit -> done-for-you build
// ($5k-$25k+, department builds from ~$25k) -> AI Department Retainer
// ($3k-$15k+/mo). Most clients enter low (an audit, or a single one-time
// build) and never get moved up. This agent scans existing clients for upsell
// signals, figures out the natural next tier, drafts an internal-facing
// recommendation with Sonnet (a human reviews it, nothing is auto-sent to the
// client), and files an expansion_opportunities row at stage 'identified'.
//
//   import { runExpansion } from './expansion.js';
//   const stats = await runExpansion({ limit: 15 });
//
// CLI:  node agents/gtm/expansion.js [limit]

import { fileURLToPath } from 'url';
import path from 'path';
import * as db from './tools/db.js';
import { sendDigest } from './tools/email.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// Client statuses that are healthy enough to upsell. Anything churning,
// paused, or already at the top tier is left alone.
const HEALTHY = new Set(['active', 'client', 'live', 'won', 'building', 'delivered', 'good', 'healthy']);

// Time a client should sit on a tier before we float the next step.
const MIN_DAYS_ON_TIER = 21;

const daysAgo = (iso) => iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity;

// Map a client's current plan/tier onto our ladder, then to the next rung.
// Returns null when the client is already at the top (retainer) or unknown.
function nextStep(client) {
  const raw = String(client.plan || client.tier || '').toLowerCase().trim();

  // Already on the retainer / department — top of the ladder, nothing to upsell.
  if (/retainer|department|monthly|mrr|subscription/.test(raw)) return null;
  if ((client.mrr || 0) > 0) return null;

  // One-time build delivered -> move to the recurring AI Department Retainer.
  if (/build|done.?for.?you|dfy|project|one.?time|implementation/.test(raw)) {
    return {
      current_tier: 'done-for-you build',
      recommended_tier: 'AI Department Retainer',
    };
  }

  // Audit-only (the default entry point) -> move to a done-for-you build.
  if (/audit|free|trial|complete.?audit/.test(raw) || raw === '') {
    return {
      current_tier: 'Complete Audit',
      recommended_tier: 'done-for-you build',
    };
  }

  // Unknown tier — treat conservatively as audit-stage, recommend a build.
  return {
    current_tier: raw || 'Complete Audit',
    recommended_tier: 'done-for-you build',
  };
}

async function draftPitch({ company, contactName, step, client }) {
  const fallback =
    `${company} has been on the ${step.current_tier} stage for a while and looks healthy. `
    + `Natural next step is the ${step.recommended_tier}. Recommend a human reviews account history and proposes it.`;

  if (!process.env.ANTHROPIC_API_KEY) return fallback;

  const system = [
    'You write short internal upsell recommendations for TMI Technology, an AI operations company for industrial and trades businesses.',
    'TMI offer ladder: free Complete Audit, then a done-for-you build ($5k to $25k+, full department builds from about $25k), then an AI Department Retainer ($3k to $15k+/mo).',
    'Voice: blunt operator language, no hype, no marketing fluff, no buzzwords like "leverage" or "synergy".',
    'Never use em dashes. Never use emojis.',
    'This is internal. A human reads it and decides whether to pitch the client. Do not address the client directly.',
    'Write 3 to 5 sentences: what to build or sell them next, and the concrete reason now is the right time given where they are on the ladder.',
  ].join(' ');

  const content =
    `Client: ${company}${contactName ? ` (contact: ${contactName})` : ''}\n`
    + `Current tier: ${step.current_tier}\n`
    + `Recommended next tier: ${step.recommended_tier}\n`
    + `Status: ${client.status || 'unknown'}\n`
    + `Started: ${client.started_at || client.created_at || 'unknown'}\n`
    + `Current MRR: ${client.mrr || 0}\n\n`
    + `Write the internal recommendation for moving this client to the ${step.recommended_tier}.`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content }],
    });
    const text = msg.content[0]?.text?.trim();
    return text ? text.replace(/—/g, '-') : fallback;
  } catch (e) {
    console.warn('expansion: pitch draft failed for', company, e.message);
    return fallback;
  }
}

export async function runExpansion({ limit = 15 } = {}) {
  const stats = { scanned: 0, identified: 0 };

  let clients = [];
  try {
    clients = await db.list('clients', { order: 'created_at', ascending: false, limit: 500 });
  } catch (e) {
    console.error('expansion: list clients failed:', e.message);
    return stats;
  }

  // Pull existing open opportunities once so we never double-file the same client.
  let openByClient = new Set();
  try {
    const open = await db.list('expansion_opportunities', { where: [['stage', 'in', ['identified', 'proposed']]] });
    openByClient = new Set(open.map(o => String(o.client_id)));
  } catch (e) {
    console.warn('expansion: could not read existing opportunities:', e.message);
  }

  const opportunities = [];

  for (const client of clients) {
    if (stats.identified >= limit) break;
    stats.scanned++;

    if (!client || !client.id) continue;
    if (openByClient.has(String(client.id))) continue;

    const status = String(client.status || '').toLowerCase();
    if (status && !HEALTHY.has(status)) continue;

    const step = nextStep(client);
    if (!step) continue;

    // Needs to have settled on the current tier before we float the next one,
    // unless there is an explicit usage signal saying they are ready.
    const onTier = daysAgo(client.started_at || client.created_at);
    const hasUsageSignal = !!(client.usage_signal || client.active_usage || client.expansion_ready);
    if (onTier < MIN_DAYS_ON_TIER && !hasUsageSignal) continue;

    let company = client.company || '';
    let contactName = '';
    try {
      if (client.contact_id) {
        const contact = await db.getById('contacts', client.contact_id);
        if (contact) {
          if (!company) company = contact.company || '';
          contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim();
        }
      }
    } catch (e) { /* contact hydrate is best-effort */ }
    if (!company) company = 'Unnamed client';

    const pitch = await draftPitch({ company, contactName, step, client });
    const rationale =
      `Healthy ${step.current_tier} client, ${Math.round(onTier)} days in`
      + `${hasUsageSignal ? ', usage signal present' : ''}. Natural move up to ${step.recommended_tier}.`;

    try {
      const row = await db.insert('expansion_opportunities', {
        client_id: client.id,
        company,
        current_tier: step.current_tier,
        recommended_tier: step.recommended_tier,
        rationale,
        pitch,
        stage: 'identified',
        created_at: new Date().toISOString(),
      });
      opportunities.push({ company, ...step, id: row && row.id });
      openByClient.add(String(client.id));
      stats.identified++;
    } catch (e) {
      console.warn('expansion: insert failed for', company, e.message);
    }
  }

  try { await db.logRun({ kind: 'expansion', ...stats }); } catch (e) { /* non-fatal */ }

  if (opportunities.length) {
    const lines = opportunities.map(o =>
      `- ${o.company}: ${o.current_tier} -> ${o.recommended_tier}`).join('\n');
    const body =
      `Expansion agent flagged ${stats.identified} upsell opportunit${stats.identified === 1 ? 'y' : 'ies'} `
      + `out of ${stats.scanned} clients scanned.\n\n`
      + `${lines}\n\n`
      + `Each is filed at stage "identified" with a drafted next-step recommendation. `
      + `Review in the admin before anything goes to the client.`;
    try {
      await sendDigest({ subject: `Expansion: ${stats.identified} upsell opportunities`, body });
    } catch (e) { console.warn('expansion: digest failed:', e.message); }
  }

  console.log(`Expansion: ${stats.identified} identified (${stats.scanned} clients scanned)`);
  return stats;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const limit = parseInt(process.argv[2] || '15', 10);
  runExpansion({ limit })
    .then(s => { console.log(JSON.stringify(s)); process.exit(0); })
    .catch(e => { console.error('Fatal:', e); process.exit(1); });
}
