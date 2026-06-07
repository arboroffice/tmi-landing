import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const envFile = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
    for (const line of envFile.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]+)"?\s*$/);
      if (m) process.env[m[1]] = m[2];
    }
  } catch {}
}

import { createClient } from '@supabase/supabase-js';
import { findContact, getEmail, enrichCompany } from './tools/apollo.js';
import { extractDomain } from './tools/apify.js';
import { sendDigest } from './tools/email.js';

function db() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

// ── Indeed scraper via Apify ───────────────────────────────────────────────

// Job postings that signal "we have operational chaos" = perfect TMI prospect
const SIGNAL_SEARCHES = [
  'dispatcher HVAC',
  'dispatch coordinator roofing',
  'field operations manager construction',
  'dispatcher plumbing electrical',
  'operations coordinator oilfield',
  'dispatch manager trucking fleet',
  'field service coordinator',
  'operations manager landscaping',
];

async function scrapeIndeedJobs({ query, maxResults = 10 }) {
  const token = process.env.APIFY_API_TOKEN;
  const url = `https://api.apify.com/v2/acts/misceres~indeed-scraper/run-sync-get-dataset-items?token=${token}&timeout=120&memory=512`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      position: query,
      country: 'us',
      maxItems: maxResults,
      saveOnlyUniqueItems: true,
    }),
  });

  if (!res.ok) throw new Error(`Indeed scraper ${res.status}`);
  const items = await res.json();

  return (items || []).map(job => ({
    title: job.positionName,
    company: job.company,
    location: job.location,
    description: job.description?.slice(0, 500) || '',
    jobUrl: job.url,
    companyUrl: null, // Indeed doesn't always give this
  })).filter(j => j.company);
}

// ── Extract company website from job posting ───────────────────────────────

async function findCompanyWebsite(companyName, location) {
  try {
    // Quick Google search via Apollo enrichment by company name
    const guessedDomain = companyName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+(inc|llc|co|corp|company|services|group)$/i, '')
      .trim()
      .replace(/\s+/g, '') + '.com';
    return guessedDomain;
  } catch {
    return null;
  }
}

// ── Main job monitor ───────────────────────────────────────────────────────

export async function runJobMonitor() {
  const supabase = db();
  const stats = { jobsFound: 0, newLeads: 0, alreadyTracked: 0 };

  // Pick 2-3 random search queries per run
  const searches = SIGNAL_SEARCHES
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  const allJobs = [];
  for (const query of searches) {
    console.log(`Scraping jobs: "${query}"`);
    try {
      const jobs = await scrapeIndeedJobs({ query, maxResults: 15 });
      allJobs.push(...jobs);
    } catch (err) {
      console.warn(`Job scrape failed for "${query}": ${err.message}`);
    }
  }

  // Deduplicate by company name
  const seen = new Set();
  const uniqueJobs = allJobs.filter(j => {
    const key = j.company?.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  stats.jobsFound = uniqueJobs.length;
  console.log(`${uniqueJobs.length} unique companies found posting ops/dispatch jobs`);

  const newLeads = [];

  for (const job of uniqueJobs) {
    // Try to find and enrich the company
    const guessedDomain = await findCompanyWebsite(job.company, job.location);
    const domain = extractDomain(`https://${guessedDomain}`) || guessedDomain;

    // Check if already in DB
    const { data: existing } = await supabase
      .from('leads')
      .select('id, status')
      .ilike('company_name', job.company)
      .single();

    if (existing) {
      // Update with new signal info
      await supabase.from('leads').update({
        research_notes: `Active job posting: "${job.title}" - ${existing.status === 'new' ? 'PRIORITY' : 'already in sequence'}`,
      }).eq('id', existing.id);
      stats.alreadyTracked++;
      continue;
    }

    // New company - enrich with Apollo
    let contact = null;
    let apolloCompany = null;
    try {
      [contact, apolloCompany] = await Promise.all([
        findContact({ domain, targetTitles: ['Owner', 'CEO', 'President', 'Founder', 'General Manager'] }),
        enrichCompany({ domain }),
      ]);
      if (contact && !contact.email && contact.apolloId) {
        contact.email = await getEmail({ apolloId: contact.apolloId }).catch(() => null);
      }
    } catch (err) {
      console.warn(`Apollo failed for ${domain}: ${err.message}`);
    }

    if (!contact?.email) continue;

    // Check email uniqueness
    const { data: emailExists } = await supabase
      .from('leads')
      .select('id')
      .eq('email', contact.email)
      .single();
    if (emailExists) continue;

    const lead = {
      company_name: apolloCompany?.name || job.company,
      website: apolloCompany?.website || `https://${guessedDomain}`,
      industry: apolloCompany?.industry || job.title.split(' ').slice(1).join(' '),
      location: apolloCompany?.location || job.location,
      employee_count: apolloCompany?.employeeCount?.toString() || null,
      owner_name: contact.name || null,
      owner_title: contact.title || null,
      email: contact.email,
      linkedin_url: contact.linkedinUrl || null,
      source: 'job_posting_signal',
      status: 'new',
      score: 'hot', // pre-score hot because they're actively hiring for the role we eliminate
      research_notes: `Posting: "${job.title}" on Indeed - they are actively looking to hire someone to do what TMI automates.`,
      pain_points: 'dispatch coordination, operations management',
    };

    const { error } = await supabase.from('leads').insert(lead);
    if (!error) {
      newLeads.push(lead);
      stats.newLeads++;
      console.log(`  New high-intent lead: ${lead.company_name} <${lead.email}>`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  // Send digest if anything interesting happened
  if (stats.newLeads > 0) {
    await sendDigest({
      subject: `Job Monitor: ${stats.newLeads} new high-intent leads`,
      body: [
        `Job Posting Monitor - ${new Date().toLocaleDateString()}`,
        '',
        `Jobs scraped: ${stats.jobsFound}`,
        `New leads added: ${stats.newLeads}`,
        `Already tracked: ${stats.alreadyTracked}`,
        '',
        'New leads (pre-scored HOT):',
        ...newLeads.map(l => `  - ${l.company_name} (${l.location}) <${l.email}>`),
        '',
        'These companies are actively trying to hire someone to do what TMI automates.',
        'They will be added to the outbound sequence.',
      ].join('\n'),
    }).catch(e => console.error('Digest error:', e.message));
  }

  console.log('Job monitor complete:', stats);
  return stats;
}

// Run if called directly
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runJobMonitor().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
