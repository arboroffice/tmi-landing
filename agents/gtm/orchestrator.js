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
import { ICP, LIMITS, SOURCE } from './config.js';

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

// ── Apollo-first sourcing: ICP search (revenue/headcount/industry/title) ────
async function findLeadsApollo(targetCount) {
  const leads = [];
  const keywords = shuffle(ICP.industryKeywords);

  for (const kw of keywords) {
    if (leads.length >= targetCount) break;
    for (let page = 1; page <= 4 && leads.length < targetCount; page++) {
      let prospects = [];
      try {
        prospects = await searchProspects({
          titles: ICP.targetTitles,
          employeeRanges: ICP.employeeRanges,
          industries: [kw],
          locations: ICP.locations,
          page,
          perPage: 25,
        });
      } catch (err) {
        console.error(`Apollo "${kw}" p${page}: ${err.message}`);
        break;
      }
      if (!prospects.length) break;
      console.log(`Apollo "${kw}" p${page}: ${prospects.length} prospects (${leads.length}/${targetCount})`);

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

// Dispatch sourcing by configured engine.
async function findNewLeads(targetCount) {
  if (SOURCE === 'apollo') {
    const leads = await findLeadsApollo(targetCount);
    if (leads.length) return leads;
    console.log('Apollo returned no leads, falling back to maps');
  }
  return findLeadsMaps(targetCount);
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

  // Runtime overrides (admin button / workflow inputs): batch size + dry run.
  const target = Number(process.env.GTM_LEADS_PER_DAY) || LIMITS.leadsPerDay;
  const dry = String(process.env.GTM_DRY_RUN || '').toLowerCase() === 'true';

  // 1. Find new leads
  console.log(`--- Finding ${target} new leads${dry ? ' (DRY RUN: build audits, do not send)' : ''} ---`);
  const newLeads = await findNewLeads(target);
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
  await db.logRun({ ...stats, source: SOURCE, dry_run: dry, target, elapsed_s: elapsed }).catch(e => console.error('logRun:', e.message));

  // 4. Send daily digest
  const digestStats = await db.getDigestStats();
  const digestBody = [
    `TMI GTM Agent - Daily Digest`,
    `${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`,
    '',
    `New leads added:    ${digestStats.newLeadsAdded}`,
    `Emails sent:        ${digestStats.emailsSent}`,
    `Replies received:   ${digestStats.repliesReceived}`,
    '',
    `Skipped (no fit/email): ${stats.skipped}`,
    `Errors:             ${stats.errors}`,
    `Run time:           ${elapsed}s`,
    '',
    'View leads: https://tmi-technology.com/admin',
  ].join('\n');

  await sendDigest({
    subject: `GTM Digest - ${digestStats.emailsSent} sent, ${digestStats.repliesReceived} replies`,
    body: digestBody,
  }).catch(e => console.error('Digest failed:', e.message));

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
