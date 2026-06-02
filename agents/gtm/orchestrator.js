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
import { findContact, getEmail, enrichCompany } from './tools/apollo.js';
import { processLead } from './outbound.js';
import { sendDigest } from './tools/email.js';
import { ICP, LIMITS } from './config.js';

// ── Lead finding pipeline ──────────────────────────────────────────────────

async function findNewLeads(targetCount) {
  const leads = [];

  // Pick a random industry + city combo to avoid repeating the same search
  const industry = ICP.industries[Math.floor(Math.random() * ICP.industries.length)];
  const city = ICP.cities[Math.floor(Math.random() * ICP.cities.length)];

  console.log(`Finding businesses: "${industry}" in ${city}`);

  let businesses;
  try {
    businesses = await findBusinessesOnMaps({
      searchQuery: industry,
      location: city,
      maxResults: targetCount * 3, // fetch more than needed to account for filtering
    });
  } catch (err) {
    console.error('Apify error:', err.message);
    return [];
  }

  // Filter by minimum reviews (signals established business)
  const qualified = businesses.filter(b =>
    b.reviewCount >= ICP.minReviews && b.website
  );

  console.log(`Found ${businesses.length} businesses, ${qualified.length} qualified`);

  for (const biz of qualified) {
    if (leads.length >= targetCount) break;

    const domain = extractDomain(biz.website);
    if (!domain) continue;

    // Skip if we already have this domain
    const existing = await db.leadExists(`@${domain}`).catch(() => false);
    if (existing) continue;

    // Enrich with Apollo
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

    // If Apollo found a contact without email, try to reveal it
    if (contact && !contact.email && contact.apolloId) {
      contact.email = await getEmail({ apolloId: contact.apolloId }).catch(() => null);
    }

    if (!contact?.email) {
      console.log(`  Skip ${biz.name} - no email found`);
      continue;
    }

    // Double-check this email isn't already in DB
    const emailExists = await db.leadExists(contact.email).catch(() => false);
    if (emailExists) continue;

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

    if (saved) {
      leads.push({ ...lead, id: saved.id });
      console.log(`  Added: ${lead.company_name} <${lead.email}>`);
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

  // 1. Find new leads
  console.log(`--- Finding ${LIMITS.leadsPerDay} new leads ---`);
  const newLeads = await findNewLeads(LIMITS.leadsPerDay);
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
