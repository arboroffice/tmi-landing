// AI research pass for the Intelligent Company Audit. Before we ask the owner a
// single question, we do the homework across multiple sources, the way a sharp
// analyst would after an hour of digging:
//   1. Their own site  - a deep (but fast) multi-page crawl: home, about, services,
//      service-area, team, careers, contact, pricing, reviews. We read the copy,
//      fingerprint every software tool they run, and pull phones, locations,
//      service-area language, "since YYYY", and team-size claims.
//   2. Google Maps     - rating, review count, category, hours, address (Apify).
//   3. Apollo          - firmographics: industry, employees, revenue, founded, HQ.
//   4. LinkedIn        - description, headcount band, specialties (only if the
//      firmographics came back thin).
// Then Claude synthesizes ALL of it into pre-filled answers so the audit only has
// to ask the owner for what only the owner knows. We never invent internal numbers.

import Anthropic from '@anthropic-ai/sdk';
import { crawlSite, baseUrl } from './tools/research.js';
import { enrichCompany } from './tools/apollo.js';
import { lookupBusinessOnMaps, scrapeLinkedInCompany } from './tools/apify.js';
import { webResearch } from './tools/brave.js';

const anthropic = new Anthropic();

// Resolve a tool name to the specific intake field(s) the owner just confirms.
function mapToolsToFields(tech) {
  const has = (n) => tech.includes(n);
  const out = {};
  const fieldTool = ['ServiceTitan', 'Jobber', 'Housecall Pro', 'FieldEdge', 'Service Fusion', 'ServiceM8', 'Workiz', 'JobNimbus', 'AccuLynx', 'Procore', 'Buildertrend', 'Knowify', 'simPRO', 'Tradify', 'Contractor Foreman'].find(has);
  if (fieldTool) { out.system_of_record = fieldTool; out.crm = fieldTool; }
  else {
    const crm = ['HubSpot', 'Salesforce', 'Zoho', 'ActiveCampaign'].find(has);
    if (crm) out.crm = crm;
  }
  const books = ['QuickBooks', 'Xero', 'Sage', 'FreshBooks'].find(has);
  if (books) out.books = books;
  if (tech.length) out.tools_list = tech.join(', ');
  return out;
}

// Personal / ISP domains we never treat as a company website.
const GENERIC = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'aol.com',
  'live.com', 'msn.com', 'proton.me', 'protonmail.com', 'gmx.com', 'me.com',
  'comcast.net', 'att.net', 'verizon.net', 'sbcglobal.net', 'cox.net', 'ymail.com',
]);

function siteFromEmail(email) {
  const m = String(email || '').toLowerCase().match(/@([^@\s]+)$/);
  if (!m) return null;
  const dom = m[1].trim();
  if (!dom || GENERIC.has(dom)) return null;
  return dom;
}

// Time-box a best-effort source so a slow scraper can never blow the request window.
function withTimeout(promise, ms) {
  return Promise.race([
    Promise.resolve(promise).catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function researchForAudit({ company, website, email } = {}) {
  const site = (website && String(website).trim()) || siteFromEmail(email);
  const origin = site ? baseUrl(site) : null;

  // ── Phase 1: gather every source we can, in parallel, each time-boxed ──────
  // Brave web search is the primary "other sites" engine (one key, whole web).
  // Apollo + Apify are optional boosters - they only run if their own key is set.
  const [crawl, web, firmo, maps] = await Promise.all([
    site ? withTimeout(crawlSite(site, { maxPages: 9 }), 22000) : Promise.resolve(null),
    company && process.env.BRAVE_API_KEY ? withTimeout(webResearch({ company, website: site }), 12000) : Promise.resolve(null),
    site && process.env.APOLLO_API_KEY ? withTimeout(enrichCompany({ domain: site }), 8000) : Promise.resolve(null),
    company && process.env.APIFY_API_TOKEN ? withTimeout(lookupBusinessOnMaps({ name: company, website: site }), 24000) : Promise.resolve(null),
  ]);

  const tech = (crawl && crawl.tech) || [];
  const roleSignals = (crawl && crawl.roleSignals) || [];
  const opsSignals = (crawl && crawl.opsSignals) || [];
  const frictionSignals = (crawl && crawl.frictionSignals) || [];
  const facts = (crawl && crawl.facts) || {};

  // ── Phase 2: LinkedIn only if firmographics came back thin (avoids dup work) ─
  let linkedin = null;
  const firmoThin = !firmo || (!firmo.employeeCount && !firmo.revenue && !firmo.foundedYear);
  if (firmo && firmo.linkedinUrl && firmoThin) {
    linkedin = await withTimeout(scrapeLinkedInCompany({ linkedinUrl: firmo.linkedinUrl }), 12000);
  }

  // ── Build the evidence packet for the model ───────────────────────────────
  const siteText = crawl && crawl.combinedText ? crawl.combinedText.slice(0, 8000) : '';
  const context = [
    `Company name: ${company || 'unknown'}`,
    site ? `Website: ${site}` : 'Website: none (personal email or no site provided)',
    crawl && crawl.pagesCrawled ? `Pages read: ${crawl.pagesCrawled.join(', ')}` : '',
    tech.length ? `Software/tools detected on their site: ${tech.join(', ')}` : 'Software/tools detected: none (likely runs on phone, email, paper, spreadsheets)',
    roleSignals.length ? `Back-office roles they hire/list: ${roleSignals.join(', ')}` : '',
    opsSignals.length ? `How they operate / win work (from site copy): ${opsSignals.join('; ')}` : '',
    frictionSignals.length ? `Gaps detected (what is MISSING - absence is evidence): ${frictionSignals.join('; ')}` : '',
    facts.certifications ? `Certifications/licenses advertised: ${facts.certifications.join(', ')}` : '',
    facts.fleet_claim ? `Fleet claim: ${facts.fleet_claim}` : '',
    facts.social_platforms ? `Social presence: ${facts.social_platforms.join(', ')}` : '',
    facts.service_area_text ? `Service-area language: "${facts.service_area_text}"` : '',
    facts.locations_mentioned ? `Cities/locations named on site: ${facts.locations_mentioned.join('; ')}` : '',
    facts.since_year ? `In business since: ${facts.since_year}` : '',
    facts.team_claim ? `Team-size claim on site: ${facts.team_claim}` : '',
    facts.phones ? `Phone numbers listed: ${facts.phones.join(', ')}` : '',
    firmo ? `Apollo firmographics: industry=${firmo.industry || '?'}, employees=${firmo.employeeCount || '?'}, revenue=${firmo.revenue || '?'}, founded=${firmo.foundedYear || '?'}, HQ=${firmo.location || '?'}` : '',
    linkedin ? `LinkedIn: ${[linkedin.industry, linkedin.employeeCount ? linkedin.employeeCount + ' employees' : '', linkedin.founded ? 'founded ' + linkedin.founded : '', Array.isArray(linkedin.specialties) ? 'specialties: ' + linkedin.specialties.slice(0, 8).join(', ') : ''].filter(Boolean).join('; ')}` : '',
    maps ? `Google Maps: ${[maps.category, maps.rating ? maps.rating + ' stars' : '', maps.reviewCount ? maps.reviewCount + ' reviews' : '', maps.address, maps.hours ? 'hours listed' : ''].filter(Boolean).join('; ')}` : '',
    web && web.results && web.results.length
      ? `\nWeb search results about them (other sites - Google profile, Yelp, BBB, LinkedIn, news, directories). Extract review counts/ratings, headcount, founded year, categories, and notable mentions from these snippets:\n${web.results.map((r, i) => `${i + 1}. ${r.title}${r.source ? ' [' + r.source + ']' : ''}\n   ${r.description}\n   ${r.url}`).join('\n')}`
      : '',
    siteText ? `\nWebsite copy excerpt:\n${siteText}` : '',
  ].filter(Boolean).join('\n');

  const system = `You are TMI's research agent. Before TMI audits a company, you do the homework so the owner is never asked something you can already find out from public evidence. You research operations-heavy businesses (trades, industrial, field service, manufacturing, logistics, services) and pre-fill the intake from what you actually saw.

Hard rules:
- Only fill a field when the evidence supports it. NEVER invent revenue, margins, headcount, hours, close rates, response times, or anything internal that is not in the evidence. Those belong to the owner.
- Detected tools are hard evidence of their stack. List them. The presence of a field-service platform (ServiceTitan, Jobber, etc.) versus none at all tells you how work moves.
- Back-office hiring titles (Dispatcher, Coordinator, Data Entry) are proof they pay a human to move information a system should move.
- Be specific and concrete, grounded in what you actually saw. No AI hype. No em dashes.
- For "hypotheses", you MAY make an educated read of how they likely operate, but phrase each as a confirmable statement, never as fact, and base it on the evidence.
- Output ONLY a JSON object. No prose before or after.`;

  const user = `${context}

Return ONLY this JSON object:
{
  "summary": "3 to 4 sentences on what this company does, who they serve, and how they likely operate today, built only from the evidence",
  "found": ["5 to 9 short, specific factual statements, one fact each, e.g. 'Runs ServiceTitan and QuickBooks', 'Serves 4 counties around Lafayette LA', '4.7 stars on 312 Google reviews', 'Hiring a dispatcher', 'Family-owned since 1998', 'Offers 24/7 emergency service'"],
  "prefill": {
    "industry": "what the business actually does, one concrete line, or empty",
    "website": "${site || ''}",
    "tools_list": "comma separated detected tools, or empty",
    "crm": "the CRM/field system holding leads and customers, or empty",
    "books": "their accounting system if detected, or empty",
    "system_of_record": "the system that holds true job status if detected, or empty",
    "lead_sources": "how they appear to win customers (reviews, Angi/Thumbtack, free estimates, referrals, commercial bids) only if the site/Maps shows it, else empty",
    "locations": "number of locations/sites only if clearly supported, else empty",
    "years": "years in business if founded/since is known (compute from the year), else empty",
    "seasonality": "Very | Somewhat | Not really - best read from the trade, else empty",
    "compliance": "licenses/certs/insurance they advertise (e.g. 'Licensed and insured, EPA') only if shown, else empty"
  },
  "hypotheses": {
    "work_flow": "our read on how a job likely flows from sold to delivered to paid, one confirmable sentence, or empty",
    "biggest_bottleneck": "our single best read on the most likely operational bottleneck, named specifically and tied to the evidence, or empty",
    "founder_role": "our read on what the owner is likely still doing personally given the size/stack, or empty"
  },
  "confidence": "high | medium | low"
}`;

  let parsed = {};
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1600,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const raw = msg.content[0].text;
    const j = raw.match(/\{[\s\S]*\}/);
    parsed = j ? JSON.parse(j[0]) : {};
  } catch (e) {
    parsed = {};
  }

  // Firmographics that owners normally type but can just confirm.
  const firmoFields = {};
  const empCount = (firmo && firmo.employeeCount) || (linkedin && linkedin.employeeCount) || null;
  const founded = (firmo && firmo.foundedYear) || (linkedin && linkedin.founded) || facts.since_year || null;
  if (empCount) firmoFields.headcount = String(empCount);
  if (firmo && firmo.revenue) firmoFields.revenue = firmo.revenue;
  if (founded) { const y = parseInt(String(founded).match(/\d{4}/), 10); if (y) firmoFields.years = String(new Date().getFullYear() - y); }
  if (maps && maps.reviewCount && !(parsed.prefill && parsed.prefill.lead_sources)) {
    firmoFields.lead_sources = `Google reviews (${maps.rating || '?'} stars, ${maps.reviewCount} reviews)`;
  }
  if ((firmo && firmo.industry) && !(parsed.prefill && parsed.prefill.industry)) firmoFields.industry = firmo.industry;

  // Precedence: base, then model's website read, then deterministic tool map, then firmographics.
  const prefill = Object.assign(
    { company: company || '', website: site || '' },
    parsed.prefill || {},
    mapToolsToFields(tech),
    firmoFields,
  );
  for (const k of Object.keys(prefill)) {
    const v = prefill[k];
    if (v == null || String(v).trim() === '' || String(v).toLowerCase() === 'unknown') delete prefill[k];
  }

  // "What we found" - lead with the hard third-party facts, then the model's reads.
  const found = [];
  if (maps) {
    const bits = [];
    if (maps.rating && maps.reviewCount) bits.push(`${maps.rating} stars on ${maps.reviewCount} Google reviews`);
    else if (maps.reviewCount) bits.push(`${maps.reviewCount} Google reviews`);
    if (maps.category) bits.push(`listed as ${maps.category}`);
    if (bits.length) found.push(bits.join(', '));
  }
  if (empCount || (firmo && firmo.revenue) || founded) {
    const bits = [];
    if (empCount) bits.push(`~${empCount} employees`);
    if (firmo && firmo.revenue) bits.push(`~${firmo.revenue} revenue`);
    if (founded) { const y = (String(founded).match(/\d{4}/) || [founded])[0]; bits.push(`since ${y}`); }
    if (bits.length) found.push(bits.join(', '));
  }
  if (firmo && firmo.location) found.push(`HQ ${firmo.location}`);
  if (tech.length) found.push(`Runs ${tech.slice(0, 6).join(', ')}`);
  if (roleSignals.length) found.push(`Lists back-office roles: ${roleSignals.slice(0, 4).join(', ')}`);
  if (facts.certifications && facts.certifications.length) found.push(`Advertises ${facts.certifications.slice(0, 4).join(', ')}`);
  if (Array.isArray(parsed.found)) for (const f of parsed.found) if (found.indexOf(f) < 0) found.push(f);

  return {
    website: site || null,
    origin,
    pagesCrawled: (crawl && crawl.pagesCrawled) || [],
    techStack: tech,
    signals: roleSignals,
    opsSignals,
    frictionSignals,
    facts,
    firmographics: firmo || null,
    linkedin: linkedin || null,
    maps: maps || null,
    web: web || null,
    summary: parsed.summary || '',
    found: found.slice(0, 12),
    prefill,
    hypotheses: parsed.hypotheses || {},
    confidence: parsed.confidence || ((firmo || maps || web || tech.length) ? 'medium' : 'low'),
  };
}
