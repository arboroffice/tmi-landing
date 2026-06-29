import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

// Load env for local runs
if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const envFile = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
    for (const line of envFile.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]+)"?\s*$/);
      if (m) process.env[m[1]] = m[2];
    }
  } catch {}
}

import * as db from './tools/db.js';
import { findBusinessesOnMaps, extractDomain } from './tools/apify.js';
import { findContact, getEmail, enrichCompany, searchProspects } from './tools/apollo.js';
import { verifyEmail } from './tools/verify.js';
import { processLead } from './outbound.js';
import { sendDigest } from './tools/email.js';
import { ICP, LIMITS, SOURCE, SEGMENTS, REVENUE_MIN } from './config.js';
import { runIntentAgent } from './intent-agent.js';

// ── Lead finding pipeline ──────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Enrich one maps business into a saved lead, or return null if not usable.
async function processBusiness(biz, industry, city) {
  const domain = extractDomain(biz.website);
  if (!domain) return null;

  const existing = await db.leadExists(`@${domain}`).catch(() => false);
  if (existing) return null;

  let contact = null;
  let apolloCompany = null;
  try {
    [contact, apolloCompany] = await Promise.all([
      findContact({ domain, targetTitles: ICP.targetTitles }),
      enrichCompany({ domain }),
    ]);
  } catch (err) {
    console.warn(`Apollo failed for ${domain}: ${err.message}`);
  }

  if (contact && !contact.email && contact.apolloId) {
    contact.email = await getEmail({ apolloId: contact.apolloId }).catch(() => null);
  }
  if (!contact?.email) return null;

  const emailExists = await db.leadExists(contact.email).catch(() => false);
  if (emailExists) return null;

  const lead = {
    company_name: apolloCompany?.name || biz.name,
    website: biz.website,
    industry: apolloCompany?.industry || biz.category || industry,
    revenue_est: apolloCompany?.revenue || null,
    employee_count: apolloCompany?.employeeCount?.toString() || null,
    location: apolloCompany?.location || `${biz.city || ''} ${biz.state || ''}`.trim() || city,
    owner_name: contact.name || null,
    owner_title: contact.title || null,
    email: contact.email,
    linkedin_url: contact.linkedinUrl || apolloCompany?.linkedinUrl || null,
    phone: biz.phone || apolloCompany?.phone || null,
    source: 'apify_maps',
    status: 'new',
  };

  const saved = await db.insertLead(lead).catch(err => {
    console.warn(`Failed to insert ${lead.email}: ${err.message}`);
    return null;
  });
  return saved ? { ...lead, id: saved.id } : null;
}

// ── Apollo-first sourcing for one segment (industrial / service) ────────────
async function findLeadsApollo(segmentKey, targetCount) {
  const seg = SEGMENTS[segmentKey];
  const leads = [];
  const keywords = shuffle(seg.industryKeywords);

  for (const kw of keywords) {
    if (leads.length >= targetCount) break;
    for (let page = 1; page <= 4 && leads.length < targetCount; page++) {
      let prospects = [];
      try {
        prospects = await searchProspects({
          titles: seg.titles || ICP.targetTitles,
          employeeRanges: seg.employeeRanges || ICP.employeeRanges,
          industries: [kw],
          locations: ICP.locations,
          revenueMin: REVENUE_MIN,
          page,
          perPage: 25,
        });
      } catch (err) {
        console.error(`Apollo [${segmentKey}] "${kw}" p${page}: ${err.message}`);
        break;
      }
      if (!prospects.length) break;
      console.log(`Apollo [${segmentKey}] "${kw}" p${page}: ${prospects.length} prospects (${leads.length}/${targetCount})`);

      for (const p of prospects) {
        if (leads.length >= targetCount) break;
        if (!p.domain) continue;

        let email = p.email;
        if ((!email || /not_unlocked/i.test(email)) && p.apolloId) {
          email = await getEmail({ apolloId: p.apolloId }).catch(() => null);
        }
        if (!email || /not_unlocked/i.test(email)) continue;
        if (await db.isSuppressed(email).catch(() => false)) continue;
        if (await db.leadExists(email).catch(() => false)) continue;
        const verdict = await verifyEmail(email).catch(() => ({ ok: true }));
        if (!verdict.ok) { console.log(`  Skip ${email} (${verdict.status})`); continue; }

        const lead = {
          company_name: p.company || p.domain,
          website: p.website || `https://${p.domain}`,
          industry: p.industry || kw,
          revenue_est: p.revenue || null,
          employee_count: p.employeeCount != null ? String(p.employeeCount) : null,
          location: p.location || null,
          owner_name: p.name || null,
          owner_title: p.title || null,
          email,
          linkedin_url: p.linkedinUrl || null,
          phone: p.phone || null,
          source: 'apollo',
          segment: segmentKey,
          status: 'new',
        };
        const saved = await db.insertLead(lead).catch(e => { console.warn(`insert ${email}: ${e.message}`); return null; });
        if (saved) {
          leads.push({ ...lead, id: saved.id });
          console.log(`  Added: ${lead.company_name} <${email}>`);
        }
      }
    }
  }
  return leads;
}

// Dispatch sourcing: run every segment (industrial + service), ~per-segment target.
async function findNewLeads(perSegmentTarget) {
  if (SOURCE === 'apollo') {
    const all = [];
    for (const key of Object.keys(SEGMENTS)) {
      const target = perSegmentTarget || SEGMENTS[key].leadsPerDay;
      console.log(`--- Segment: ${SEGMENTS[key].label} (target ${target}) ---`);
      const leads = await findLeadsApollo(key, target);
      console.log(`  ${SEGMENTS[key].label}: ${leads.length} leads`);
      all.push(...leads);
    }
    if (all.length) return all;
    console.log('Apollo returned no leads, falling back to maps');
  }
  return findLeadsMaps(perSegmentTarget || LIMITS.leadsPerDay);
}

// Sweep across many industry x city combos until we hit the daily target (maps fallback).
async function findLeadsMaps(targetCount) {
  const leads = [];
  const combos = shuffle(
    ICP.industries.flatMap(ind => ICP.cities.map(city => ({ ind, city })))
  ).slice(0, LIMITS.maxCombosPerRun || 24);

  for (const { ind, city } of combos) {
    if (leads.length >= targetCount) break;
    console.log(`Searching "${ind}" in ${city} (${leads.length}/${targetCount})`);

    let businesses;
    try {
      businesses = await findBusinessesOnMaps({ searchQuery: ind, location: city, maxResults: 40 });
    } catch (err) {
      console.error('Apify error:', err.message);
      continue;
    }

    const qualified = businesses.filter(b => b.reviewCount >= ICP.minReviews && b.website);
    console.log(`  ${businesses.length} found, ${qualified.length} qualified`);

    for (const biz of qualified) {
      if (leads.length >= targetCount) break;
      try {
        const lead = await processBusiness(biz, ind, city);
        if (lead) {
          leads.push(lead);
          console.log(`  Added: ${lead.company_name} <${lead.email}>`);
        }
      } catch (err) {
        console.warn(`  Skip ${biz.name}: ${err.message}`);
      }
    }
  }

  return leads;
}

// ── Main orchestrator ──────────────────────────────────────────────────────

export async function run() {
  const startTime = Date.now();
  const stats = { found: 0, contacted: 0, followupsSent: 0, skipped: 0, errors: 0 };

  console.log('=== TMI GTM Agent ===');
  console.log(new Date().toISOString());
  console.log('');

  // Runtime overrides (admin button / workflow inputs): per-segment batch + dry run.
  const override = process.env.GTM_LEADS_PER_DAY ? Math.min(Number(process.env.GTM_LEADS_PER_DAY) || 0, 500) : null;
  const dry = String(process.env.GTM_DRY_RUN || '').toLowerCase() === 'true';

  // 0. Intent agent: watch job postings + LinkedIn/social for ICP-fit buying and
  // hiring signals, score them with Claude, and route the strongest in as 'new'
  // leads (and LinkedIn touches). Runs alongside outbound sourcing.
  console.log('--- Intent agent (inbound signals) ---');
  const intentStats = await runIntentAgent().catch(e => { console.error('intent agent:', e.message); return {}; });
  console.log(`Intent: ${intentStats.signals || 0} signals, ${intentStats.routed || 0} routed\n`);

  // 1. Find new leads across every segment (industrial + service), ~100 each.
  console.log(`--- Sourcing${override ? ` (${override}/segment)` : ' (per-segment defaults)'}${dry ? ' (DRY RUN: build audits, do not send)' : ''} ---`);
  const newLeads = await findNewLeads(override);
  // Pull in any signal-routed leads waiting at status 'new' so the intent agent's
  // finds get audited and contacted on the same run as outbound sourcing.
  try {
    const sourced = new Set(newLeads.map(l => l.email));
    const signalLeads = (await db.getNewLeads(50)).filter(l =>
      ['intent_signal', 'job_posting_signal'].includes(l.source) && !sourced.has(l.email));
    if (signalLeads.length) { console.log(`+ ${signalLeads.length} signal-routed leads to contact`); newLeads.push(...signalLeads); }
  } catch (e) { console.error('signal lead merge:', e.message); }
  stats.found = newLeads.length;
  console.log(`Found ${stats.found} new leads\n`);

  // 2. Send cold emails to new leads
  console.log('--- Sending cold emails ---');
  for (const lead of newLeads) {
    try {
      const result = await processLead(lead);
      if (result.sent) stats.contacted++;
      else stats.skipped++;
    } catch (err) {
      console.error(`Error processing ${lead.email}:`, err.message);
      stats.errors++;
    }
    // Small delay between sends
    await new Promise(r => setTimeout(r, 1500));
  }

  // 3. Process follow-ups
  console.log('\n--- Processing follow-ups ---');
  const followups = await db.getLeadsDueForFollowup();
  console.log(`${followups.length} leads due for follow-up`);
  for (const lead of followups) {
    try {
      const result = await processLead(lead);
      if (result.sent) stats.followupsSent++;
      else stats.skipped++;
    } catch (err) {
      console.error(`Error following up ${lead.email}:`, err.message);
      stats.errors++;
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\nDone in ${elapsed}s`);
  console.log(stats);

  // Observability: record the run.
  await db.logRun({ ...stats, source: SOURCE, dry_run: dry, per_segment: override, segments: Object.keys(SEGMENTS).join('+'), elapsed_s: elapsed }).catch(e => console.error('logRun:', e.message));

  // 4. Send the operator's daily briefing (funnel + bookings + hot accounts).
  const digestStats = await db.getDigestStats().catch(() => ({}));
  const funnel = await db.getFunnel().catch(() => ({}));
  const bookings = await db.getRecentBookings(8).catch(() => []);
  const hot = await db.getHotAccounts(8).catch(() => []);

  const line = (l) => l;
  const digestBody = [
    `TMI Outbound — Daily Briefing`,
    `${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`,
    '',
    `TODAY`,
    `  New prospects:   ${stats.found}`,
    `  Contacted:       ${stats.contacted}${dry ? ' (DRY RUN — nothing sent)' : ''}`,
    `  Follow-ups:      ${stats.followupsSent}`,
    `  Errors:          ${stats.errors}`,
    '',
    `FUNNEL (all time)`,
    `  Sourced:         ${funnel.total ?? '—'}`,
    `  Contacted:       ${funnel.contacted ?? '—'}`,
    `  Replied:         ${funnel.replied ?? '—'}`,
    `  Booked:          ${funnel.booked ?? '—'}`,
    '',
    bookings.length ? `CALLS BOOKED` : `No new bookings yet.`,
    ...bookings.map(b => `  • ${b.company_name || b.email} — ${b.owner_name || ''} <${b.email}>`),
    '',
    hot.length ? `HOT ACCOUNTS (hiring-signal triggers)` : '',
    ...hot.map(h => `  • ${h.company_name} — ${h.signals || 'signal'} ${h.audit_url ? '(' + h.audit_url + ')' : ''}`),
    '',
    `Manage: https://admin.tmitechai.com/outbound`,
  ].filter(line => line !== '').join('\n');

  await sendDigest({
    subject: `Outbound briefing — ${stats.contacted} contacted, ${funnel.booked ?? 0} booked total`,
    body: digestBody,
  }).catch(e => console.error('Briefing failed:', e.message));

  return stats;
}

// Run if called directly
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
