import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// ── Fetch a page, return { text, html } ─────────────────────────────────────
export async function fetchPage(url) {
  if (!url) return null;
  try {
    const full = url.startsWith('http') ? url : `https://${url}`;
    const res = await fetch(full, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TMI-Research/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { text, html };
  } catch {
    return null;
  }
}

export function baseUrl(url) {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).origin; }
  catch { return null; }
}

// ── Tech stack fingerprinting (from raw HTML) ───────────────────────────────
const TECH_FINGERPRINTS = [
  // CRM / marketing
  [/hs-scripts\.com|js\.hs-analytics|hubspot/i, 'HubSpot'],
  [/pardot|force\.com|salesforce/i, 'Salesforce'],
  [/zoho/i, 'Zoho'],
  [/klaviyo/i, 'Klaviyo'],
  [/(chimpstatic|list-manage)\.com|mailchimp/i, 'Mailchimp'],
  [/activehosted|activecampaign/i, 'ActiveCampaign'],
  // Field service / scheduling / ops
  [/servicetitan/i, 'ServiceTitan'],
  [/getjobber|jobber/i, 'Jobber'],
  [/housecallpro|housecall/i, 'Housecall Pro'],
  [/fieldedge/i, 'FieldEdge'],
  [/servicefusion/i, 'Service Fusion'],
  [/servicem8/i, 'ServiceM8'],
  [/workiz/i, 'Workiz'],
  [/mhelpdesk/i, 'mHelpDesk'],
  [/jobnimbus/i, 'JobNimbus'],
  [/acculynx/i, 'AccuLynx'],
  [/roofr/i, 'Roofr'],
  [/knowify/i, 'Knowify'],
  [/tradify/i, 'Tradify'],
  [/companycam/i, 'CompanyCam'],
  [/simpro/i, 'simPRO'],
  [/fergus/i, 'Fergus'],
  [/calendly/i, 'Calendly'],
  [/acuityscheduling/i, 'Acuity Scheduling'],
  [/procore/i, 'Procore'],
  [/buildertrend/i, 'Buildertrend'],
  [/contractorforeman/i, 'Contractor Foreman'],
  [/quickbooks|intuit/i, 'QuickBooks'],
  [/xero/i, 'Xero'],
  [/sage(accounting|intacct|50|100|300)?/i, 'Sage'],
  [/freshbooks/i, 'FreshBooks'],
  [/bill\.com/i, 'Bill.com'],
  // Fleet / GPS / telematics
  [/samsara/i, 'Samsara'],
  [/fleetio/i, 'Fleetio'],
  [/gomotive|keeptruckin/i, 'Motive'],
  [/verizonconnect|fleetmatics/i, 'Verizon Connect'],
  [/gpsinsight/i, 'GPS Insight'],
  [/geotab/i, 'Geotab'],
  // Payroll / HR / scheduling labor
  [/adp\.com|workforcenow/i, 'ADP'],
  [/gusto/i, 'Gusto'],
  [/paychex/i, 'Paychex'],
  [/tsheets|quickbooks-time/i, 'QuickBooks Time'],
  [/wheniwork/i, 'When I Work'],
  [/deputy\.com/i, 'Deputy'],
  // Payments
  [/js\.stripe\.com|stripe/i, 'Stripe'],
  [/squareup|squarecdn/i, 'Square'],
  [/authorize\.net/i, 'Authorize.net'],
  // Project / work management
  [/monday\.com/i, 'Monday.com'],
  [/asana/i, 'Asana'],
  [/trello/i, 'Trello'],
  [/clickup/i, 'ClickUp'],
  [/airtable/i, 'Airtable'],
  [/notion\.so|notion\.site/i, 'Notion'],
  [/smartsheet/i, 'Smartsheet'],
  // Website platform
  [/wp-content|wp-includes/i, 'WordPress'],
  [/static\.wixstatic|wix\.com/i, 'Wix'],
  [/squarespace/i, 'Squarespace'],
  [/assets\.webflow|webflow\.io/i, 'Webflow'],
  [/cdn\.shopify|shopify/i, 'Shopify'],
  [/duda(mobile)?/i, 'Duda'],
  // Forms / chat / reviews / lead marketplaces
  [/gravityforms|gform_/i, 'Gravity Forms'],
  [/typeform/i, 'Typeform'],
  [/jotform/i, 'JotForm'],
  [/intercom/i, 'Intercom'],
  [/drift\.com|js\.driftt/i, 'Drift'],
  [/tawk\.to/i, 'Tawk.to'],
  [/podium/i, 'Podium'],
  [/birdeye/i, 'Birdeye'],
  [/nicejob/i, 'NiceJob'],
  [/(^|\W)angi(\.com|leads)/i, 'Angi'],
  [/thumbtack/i, 'Thumbtack'],
  [/nextdoor/i, 'Nextdoor'],
  [/yelp\.com\/biz|yelp-reviews/i, 'Yelp'],
  [/servicetitan-marketing|marketing-pro/i, 'ServiceTitan Marketing Pro'],
  [/salesrabbit/i, 'SalesRabbit'],
  // Analytics
  [/googletagmanager|gtag\(/i, 'Google Tag Manager'],
  [/google-analytics|ga\('create/i, 'Google Analytics'],
  [/connect\.facebook\.net|fbevents/i, 'Meta Pixel'],
  [/hotjar/i, 'Hotjar'],
  // Phone / voice / call handling
  [/dialpad/i, 'Dialpad'],
  [/ringcentral/i, 'RingCentral'],
  [/aircall/i, 'Aircall'],
  [/grasshopper\.com/i, 'Grasshopper'],
  [/openphone/i, 'OpenPhone'],
  [/callrail/i, 'CallRail'],
  [/twilio/i, 'Twilio'],
  [/justcall/i, 'JustCall'],
  // AI / chat / booking / receptionist
  [/intaker|smith\.ai|smithai/i, 'AI receptionist'],
  [/tidio|landbot|manychat|chatbot/i, 'Chatbot'],
  [/calendly|youcanbook|setmore|book(ing)?like/i, 'Online booking'],
  // Estimating / takeoff / proposals
  [/stack(ct|estimating)|planswift|bluebeam/i, 'Estimating/takeoff software'],
  [/proposify|pandadoc|qwilr|better proposals/i, 'Proposal software'],
  [/docusign|hellosign|signnow/i, 'E-signature'],
  // Inventory / supply / e-commerce
  [/woocommerce|bigcommerce|magento/i, 'E-commerce platform'],
  [/fishbowl|cin7|katana|sortly/i, 'Inventory software'],
];

export function detectTechStack(html) {
  if (!html) return [];
  const found = new Set();
  for (const [re, name] of TECH_FINGERPRINTS) {
    if (re.test(html)) found.add(name);
  }
  return [...found];
}

// ── Bottleneck signals from careers/job pages ───────────────────────────────
const SIGNAL_TITLES = [
  'operations coordinator', 'operations manager', 'dispatcher', 'dispatch',
  'project administrator', 'project coordinator', 'data entry', 'scheduling manager',
  'scheduler', 'office manager', 'administrative assistant', 'office administrator',
  'billing clerk', 'accounts receivable', 'customer service representative',
  'estimator', 'service coordinator',
];

export function findSignals(text) {
  if (!text) return [];
  const lc = text.toLowerCase();
  const hits = new Set();
  for (const t of SIGNAL_TITLES) {
    if (lc.includes(t)) hits.add(t.replace(/\b\w/g, c => c.toUpperCase()));
  }
  return [...hits];
}

// ── Operational signals (how they run + win work) from site copy ────────────
const OPS_PATTERNS = [
  [/24\/7|24-7|24 hours|around the clock|after[- ]hours/i, '24/7 / after-hours service'],
  [/emergency (service|repair|response|call)/i, 'Emergency service offered'],
  [/same[- ]day|next[- ]day service/i, 'Same/next-day service promise'],
  [/financing (available|options)|apply for financing|0% (apr|financing)/i, 'Offers customer financing'],
  [/free (estimate|quote|inspection|consultation)/i, 'Free estimates/quotes'],
  [/family[- ]owned|family operated|since (18|19|20)\d\d|established (in )?(18|19|20)\d\d/i, 'Family-owned / long-established'],
  [/licensed (and|&) insured|fully insured|bonded/i, 'Licensed and insured'],
  [/membership|maintenance plan|service agreement|service plan/i, 'Recurring membership/maintenance plans'],
  [/we'?re hiring|join our team|now hiring|careers/i, 'Actively hiring'],
  [/commercial (and|&) residential|residential (and|&) commercial/i, 'Both commercial and residential'],
  [/fleet of|our trucks|service vehicles/i, 'Operates a fleet'],
  [/warranty|guaranteed|satisfaction guarantee/i, 'Warranty / guarantee'],
  [/online (booking|scheduling)|book online|schedule online/i, 'Online booking on site'],
  [/text us|text message|sms/i, 'Texting as a channel'],
];

export function findOpsSignals(text) {
  if (!text) return [];
  const out = new Set();
  for (const [re, label] of OPS_PATTERNS) if (re.test(text)) out.add(label);
  return [...out];
}

// ── Friction signals: what is MISSING. Absence is evidence too. A company that
// advertises 24/7 service but has no online booking, no detected CRM, and a
// mailto-only contact is moving everything by phone and a human. These gaps are
// often the sharpest tells of where a system should be and isn't.
export function findFrictionSignals({ text = '', html = '', tech = [], opsSignals = [] } = {}) {
  const out = [];
  const has = (n) => tech.includes(n);
  const fieldSystem = ['ServiceTitan', 'Jobber', 'Housecall Pro', 'FieldEdge', 'Service Fusion', 'ServiceM8', 'Workiz', 'JobNimbus', 'AccuLynx', 'Procore', 'Buildertrend', 'Knowify', 'simPRO', 'Tradify', 'Contractor Foreman'].some(has);
  const hasBooking = has('Online booking') || /book online|schedule online|online (booking|scheduling)/i.test(text);
  const hasChat = has('Chatbot') || has('AI receptionist') || has('Intercom') || has('Drift') || has('Tawk.to') || has('Podium');
  const hasForm = /<form[\s>]|gravityforms|typeform|jotform|contact-form/i.test(html) || has('Gravity Forms') || has('Typeform') || has('JotForm');
  const mailtoOnly = /mailto:/i.test(html) && !hasForm;
  const promisesSpeed = opsSignals.some(s => /24\/7|emergency|same|next-day/i.test(s));

  if (!fieldSystem) out.push('No field-service/CRM platform detected (lead and job data likely lives in phone, email, spreadsheets)');
  if (!hasBooking) out.push('No online booking (every job has to be scheduled by a person)');
  if (!hasChat) out.push('No live chat or text-back capture (after-hours and web leads can go unanswered)');
  if (mailtoOnly) out.push('Contact is a raw email link, not a tracked form (inbound is not captured or routed)');
  if (promisesSpeed && !hasBooking && !hasChat) out.push('Promises fast/emergency response but has no instant-capture channel to back it');
  if (fieldSystem && (has('QuickBooks') || has('Xero')) && !/integrat|sync|connect/i.test(text)) out.push('Runs a field system and separate accounting with no stated integration (data likely re-keyed between them)');
  return out;
}

// ── Extract phones, emails, service-area mentions, and counts from site ──────
const US_STATES = '(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)';

export function extractFacts(text, html) {
  const facts = {};
  const phones = [...new Set((text.match(/(\(\d{3}\)\s?|\d{3}[.\-\s])\d{3}[.\-\s]\d{4}/g) || []).map(s => s.trim()))].slice(0, 6);
  if (phones.length) facts.phones = phones;
  // Service areas: "serving X, Y, Z" or "areas we serve"
  const serveBlock = (text.match(/(serving|areas? (we )?serve|service areas?|proudly serving)[^.]{0,220}/i) || [])[0];
  if (serveBlock) facts.service_area_text = serveBlock.trim().slice(0, 220);
  // City, ST pairs (rough proxy for locations / coverage)
  const cityState = [...new Set((text.match(new RegExp(`[A-Z][a-zA-Z.\\- ]{2,24},\\s?${US_STATES}\\b`, 'g')) || []).map(s => s.trim()))].slice(0, 12);
  if (cityState.length) facts.locations_mentioned = cityState;
  // Years in business / "since YYYY"
  const since = (text.match(/\b(since|established|est\.?|serving since)\s+((18|19|20)\d\d)/i) || [])[2];
  if (since) facts.since_year = since;
  // Team / crew size claims
  const team = (text.match(/(\d{2,4})\+?\s+(employees|team members|technicians|professionals|trucks|crews)/i) || [])[0];
  if (team) facts.team_claim = team.trim();
  // Fleet size claim
  const fleet = (text.match(/(?:fleet of|over|more than)\s+(\d{1,4})\s+(trucks|vehicles|units|rigs)/i) || [])[0];
  if (fleet) facts.fleet_claim = fleet.trim();
  // Licenses / certifications advertised
  const certs = [...new Set((text.match(/\b(EPA|OSHA|NATE|ASE|LEED|ISO ?\d{3,5}|NACE|API ?\d{2,4}|UL listed|bonded|licensed (and|&) insured)\b/gi) || []).map(s => s.trim()))].slice(0, 8);
  if (certs.length) facts.certifications = certs;
  // Social presence (count of distinct platforms linked)
  const socials = [...new Set((html.match(/(facebook|instagram|linkedin|youtube|twitter|x\.com|tiktok)\.com/gi) || []).map(s => s.toLowerCase().split('.')[0]))];
  if (socials.length) facts.social_platforms = socials;
  // Awards / recognition
  if (/\b(award|best of|top rated|#1|voted)\b/i.test(text)) facts.awards_mentioned = true;
  return facts;
}

// ── Pull internal links from homepage HTML, prioritized for ops research ─────
const PRIORITY_PATHS = [
  '/about', '/about-us', '/services', '/our-services', '/what-we-do',
  '/service-area', '/service-areas', '/locations', '/areas-we-serve',
  '/team', '/our-team', '/staff', '/careers', '/jobs', '/employment',
  '/contact', '/contact-us', '/pricing', '/financing', '/reviews',
  '/testimonials', '/projects', '/gallery', '/fleet', '/commercial', '/residential',
];

export function extractLinks(html, origin) {
  if (!html || !origin) return [];
  const hrefs = [...html.matchAll(/href=["']([^"'#]+)["']/gi)].map(m => m[1]);
  const internal = new Set();
  for (const h of hrefs) {
    let path = null;
    if (h.startsWith('/') && !h.startsWith('//')) path = h;
    else if (h.startsWith(origin)) { try { path = new URL(h).pathname; } catch {} }
    if (!path) continue;
    path = path.replace(/\/+$/, '') || '/';
    if (/\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|mp4|css|js)$/i.test(path)) continue;
    if (path.split('/').length > 3) continue; // shallow only
    internal.add(path);
  }
  return [...internal];
}

// ── Deep (but fast) site crawl: homepage + prioritized internal pages ────────
// Fetches in parallel with short timeouts so it fits inside a serverless window.
export async function crawlSite(website, { maxPages = 9 } = {}) {
  const origin = baseUrl(website);
  if (!origin) return null;
  const home = await fetchPage(origin);
  if (!home) return { origin, pages: [], combinedText: '', tech: [], roleSignals: [], opsSignals: [], facts: {} };

  const discovered = extractLinks(home.html, origin);
  // Rank: priority paths first (in our order), then any other discovered shallow links.
  const ranked = [];
  for (const p of PRIORITY_PATHS) {
    const hit = discovered.find(d => d.toLowerCase() === p);
    if (hit && !ranked.includes(hit)) ranked.push(hit);
  }
  for (const d of discovered) {
    if (d === '/' || ranked.includes(d)) continue;
    if (ranked.length >= maxPages) break;
    ranked.push(d);
  }
  const toFetch = ranked.slice(0, maxPages);

  const fetched = await Promise.all(toFetch.map(p => fetchPage(origin + p).then(r => ({ path: p, r })).catch(() => ({ path: p, r: null }))));
  const pages = [{ path: '/', text: home.text, html: home.html }];
  for (const { path, r } of fetched) if (r && r.text) pages.push({ path, text: r.text, html: r.html });

  const allHtml = pages.map(p => p.html || '').join('\n');
  const combinedText = pages.map(p => `[${p.path}] ${p.text}`).join('\n\n');
  const tech = detectTechStack(allHtml);
  const roleSignals = findSignals(combinedText);
  const opsSignals = findOpsSignals(combinedText);
  const facts = extractFacts(combinedText, allHtml);
  const frictionSignals = findFrictionSignals({ text: combinedText, html: allHtml, tech, opsSignals });

  return { origin, pagesCrawled: pages.map(p => p.path), pages, combinedText, tech, roleSignals, opsSignals, frictionSignals, facts };
}

async function gatherSignals(origin) {
  if (!origin) return { text: '', signals: [] };
  const paths = ['/careers', '/jobs', '/careers/', '/about', '/employment'];
  let combined = '';
  for (const p of paths) {
    const page = await fetchPage(origin + p);
    if (page?.text) combined += ' ' + page.text.slice(0, 2500);
    if (combined.length > 6000) break;
  }
  return { text: combined, signals: findSignals(combined) };
}

// ── Main research agent ─────────────────────────────────────────────────────
export async function researchCompany({ name, website, industry, location, employeeCount, reviewCount }) {
  const home = await fetchPage(website);
  const origin = baseUrl(website);
  const techStack = detectTechStack(home?.html);
  const { signals } = origin ? await gatherSignals(origin) : { signals: [] };

  const context = [
    `Company: ${name}`,
    `Industry: ${industry || 'unknown'}`,
    `Location: ${location || 'unknown'}`,
    `Employees: ${employeeCount || 'unknown'}`,
    `Google reviews: ${reviewCount || 'unknown'}`,
    techStack.length ? `Detected tech stack: ${techStack.join(', ')}` : 'Detected tech stack: none found (likely off-the-shelf or minimal)',
    signals.length ? `Hiring signals (job titles seen): ${signals.join(', ')}` : 'Hiring signals: none detected',
    home?.text ? `\nWebsite excerpt:\n${home.text.slice(0, 2800)}` : '',
  ].filter(Boolean).join('\n');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 900,
    system: `You are TMI's senior prospect research analyst. TMI is the fractional AI and ops department for operations-heavy businesses doing $5M+ (physical or digital), running a Delete / Connect / Build transformation: delete software they don't use, connect what's left, build the backend the company runs on.

Your job is to find the ONE TRUE BOTTLENECK in this specific company and back it with evidence, the way a sharp operator would after 20 minutes of digging. You diagnose through three lenses:
1. Founder bottleneck - decisions, approvals, follow-up route through one person.
2. Information bottleneck - status, numbers, history live in heads, texts, and disconnected tools; nobody can see the operation without calling someone.
3. Operational latency - lag between stages (lead to response, job done to invoice, decision waiting on a person).

Read the EVIDENCE and let it decide, do not guess generically:
- Hiring titles (Dispatcher, Operations Coordinator, Data Entry, Scheduler, Project Administrator) are proof they are paying a human to move information a system should move. Name the role and what it implies.
- A pile of disconnected tools (e.g. QuickBooks + a separate scheduler + spreadsheets) is a connect/delete problem: data is re-keyed between systems.
- No detected tools at all means the operation likely runs on phone, email, paper, and spreadsheets - manual everything.
- The website (services, locations, fleet size, team page) tells you scale and where volume concentrates.

Be specific to the niche and to THIS company's evidence. No AI hype. No em dashes. No generic "they probably struggle with efficiency."`,
    messages: [{
      role: 'user',
      content: `Diagnose this company. Use the evidence. Return JSON only.

${context}

{
  "companySize": "small/medium/large",
  "techObservation": "one sentence on what their detected stack (or lack of it) proves about how work moves",
  "signalObservation": "one sentence on what their hiring signals prove about a bottleneck, or 'none'",
  "bottleneckType": "founder | information | latency",
  "primaryPain": "the ONE true bottleneck, named specifically, in one concrete sentence, citing the evidence (a hiring title, a tool gap, scale). Not generic.",
  "evidence": "the specific signal(s) that point to it",
  "likelyPainPoints": ["3-5 specific, niche-specific operational pain points ranked by likelihood"],
  "crewCount": "rough number of crews/trucks/teams/locations based on size, or null",
  "goodFit": true/false,
  "fitReason": "one sentence on fit for a $5M+ Delete/Connect/Build transformation"
}`,
    }],
  });

  try {
    const raw = message.content[0].text;
    const json = raw.match(/\{[\s\S]*\}/)?.[0];
    const parsed = json ? JSON.parse(json) : {};
    return { ...parsed, techStack, signals };
  } catch {
    return { likelyPainPoints: [], primaryPain: 'manual, disconnected operations', goodFit: true, fitReason: 'fits size profile', techStack, signals };
  }
}
