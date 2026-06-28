// Lookalike Expansion Agent — makes the machine compound.
//
// Seeds from your wins (booked / won / client / building leads). For each seed it
// asks Apollo for near-identical companies (same industry, size band, geography),
// dedupes against everything already in the pipeline, enriches the owner email, and
// inserts them as 'new' leads so the orchestrator audits + contacts them.
//
//   import { expandLookalikes } from './lookalike.js';
//   await expandLookalikes({ perSeed: 20, limit: 60 });
//
// CLI:  node agents/gtm/lookalike.js [limit]

import { fileURLToPath } from 'url';
import path from 'path';
import * as db from './tools/db.js';
import { searchProspects } from './tools/apollo.js';
import { findBestEmail } from './tools/enrich.js';
import { ICP, REVENUE_MIN } from './config.js';

const SEED_STATUSES = ['booked', 'won', 'client', 'building'];

// Map a freeform industry string to the closest ICP keyword tags Apollo understands.
function industryTags(seed) {
  const hay = `${seed.industry || ''} ${seed.company_name || ''}`.toLowerCase();
  const tags = ICP.industryKeywords.filter(k => hay.includes(k.split(' ')[0]));
  return tags.length ? tags.slice(0, 4) : (seed.industry ? [seed.industry.toLowerCase()] : ICP.industryKeywords.slice(0, 4));
}

async function getSeeds() {
  const seeds = [];
  for (const status of SEED_STATUSES) {
    try {
      const rows = await db.list('leads', { where: [['status', '==', status]], limit: 50 });
      seeds.push(...rows);
    } catch { /* status may not exist yet */ }
  }
  // de-dupe seeds by domain/company
  const seen = new Set();
  return seeds.filter(s => {
    const k = (s.website || s.company_name || s.id || '').toLowerCase();
    if (!k || seen.has(k)) return false; seen.add(k); return true;
  });
}

export async function expandLookalikes({ perSeed = 20, limit = 60 } = {}) {
  const stats = { seeds: 0, found: 0, inserted: 0, deduped: 0, noEmail: 0 };
  if (!process.env.APOLLO_API_KEY) { console.log('Lookalike: APOLLO_API_KEY missing, skipping.'); return stats; }

  const seeds = await getSeeds();
  stats.seeds = seeds.length;
  if (!seeds.length) { console.log('Lookalike: no seed wins yet. Land one client, then this compounds.'); return stats; }

  for (const seed of seeds) {
    if (stats.inserted >= limit) break;
    const location = seed.location && /,\s*[A-Z]{2}$/.test(seed.location)
      ? `${seed.location.split(',').pop().trim()}, United States` : (ICP.locations[0] || 'United States');
    let people = [];
    try {
      people = await searchProspects({
        titles: ICP.targetTitles,
        employeeRanges: ICP.employeeRanges,
        industries: industryTags(seed),
        locations: [location, 'United States'],
        revenueMin: REVENUE_MIN,
        perPage: Math.min(25, perSeed),
      });
    } catch (e) { console.warn('lookalike search', seed.company_name, e.message); continue; }
    stats.found += people.length;

    for (const p of people) {
      if (stats.inserted >= limit) break;
      let email = p.email;
      if (!email) {
        const hit = await findBestEmail({ domain: p.domain, name: p.name, title: p.title, apolloId: p.apolloId }).catch(() => null);
        email = hit?.email || null;
      }
      if (!email) { stats.noEmail++; continue; }
      if (await db.leadExists(email).catch(() => false)) { stats.deduped++; continue; }
      if (await db.isSuppressed(email).catch(() => false)) { stats.deduped++; continue; }
      try {
        await db.insertLead({
          company_name: p.company, website: p.website, industry: p.industry,
          location: p.location, employee_count: p.employeeCount?.toString() || null,
          owner_name: p.name, owner_title: p.title, email,
          linkedin_url: p.linkedinUrl, phone: p.phone || null,
          source: 'lookalike', status: 'new', score: 'warm',
          research_notes: `Lookalike of ${seed.company_name} (${seed.status}).`,
        });
        stats.inserted++;
      } catch (e) { console.warn('lookalike insert', email, e.message); }
    }
  }

  console.log(`Lookalike: ${stats.inserted} new from ${stats.seeds} seeds (${stats.found} found, ${stats.deduped} dupes, ${stats.noEmail} no-email)`);
  return stats;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const limit = parseInt(process.argv[2] || '60', 10);
  expandLookalikes({ limit })
    .then(s => { console.log(JSON.stringify(s)); process.exit(0); })
    .catch(e => { console.error('Fatal:', e); process.exit(1); });
}
