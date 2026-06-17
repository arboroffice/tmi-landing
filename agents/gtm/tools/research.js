import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// ── Fetch a page, return { text, html } ─────────────────────────────────────
async function fetchPage(url) {
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

function baseUrl(url) {
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
  [/calendly/i, 'Calendly'],
  [/acuityscheduling/i, 'Acuity Scheduling'],
  [/procore/i, 'Procore'],
  [/buildertrend/i, 'Buildertrend'],
  [/quickbooks|intuit/i, 'QuickBooks'],
  [/samsara/i, 'Samsara'],
  [/fleetio/i, 'Fleetio'],
  // Website platform
  [/wp-content|wp-includes/i, 'WordPress'],
  [/static\.wixstatic|wix\.com/i, 'Wix'],
  [/squarespace/i, 'Squarespace'],
  [/assets\.webflow|webflow\.io/i, 'Webflow'],
  [/cdn\.shopify|shopify/i, 'Shopify'],
  [/duda(mobile)?/i, 'Duda'],
  // Forms / chat / reviews
  [/gravityforms|gform_/i, 'Gravity Forms'],
  [/typeform/i, 'Typeform'],
  [/jotform/i, 'JotForm'],
  [/intercom/i, 'Intercom'],
  [/drift\.com|js\.driftt/i, 'Drift'],
  [/tawk\.to/i, 'Tawk.to'],
  [/podium/i, 'Podium'],
  [/birdeye/i, 'Birdeye'],
  // Analytics
  [/googletagmanager|gtag\(/i, 'Google Tag Manager'],
  [/google-analytics|ga\('create/i, 'Google Analytics'],
  [/connect\.facebook\.net|fbevents/i, 'Meta Pixel'],
  [/hotjar/i, 'Hotjar'],
];

function detectTechStack(html) {
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

function findSignals(text) {
  if (!text) return [];
  const lc = text.toLowerCase();
  const hits = new Set();
  for (const t of SIGNAL_TITLES) {
    if (lc.includes(t)) hits.add(t.replace(/\b\w/g, c => c.toUpperCase()));
  }
  return [...hits];
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
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    system: `You are TMI's prospect research analyst. TMI is the fractional AI and ops department for operations-heavy businesses doing $5M+ (physical or digital). TMI runs a Delete / Connect / Build transformation: delete software they don't use, connect what's left, build the backend the company runs on.
You reason over REAL signals (detected tech stack, hiring titles, website) to identify where this specific company is likely losing time and money. Hiring titles like Dispatcher, Operations Coordinator, Data Entry, Scheduler are bottleneck signals: the company is hiring humans to move information that a system should move. A pile of disconnected tools is a connect/delete opportunity. No tools at all means manual everything. Be concrete and specific to the niche. No AI hype. No em dashes.`,
    messages: [{
      role: 'user',
      content: `Analyze this company and return JSON only.

${context}

{
  "companySize": "small/medium/large",
  "techObservation": "one sentence on what their tech stack (or lack of it) implies about how work moves",
  "signalObservation": "one sentence on what their hiring signals imply about bottlenecks, or 'none' if no signals",
  "likelyPainPoints": ["3-5 specific operational pain points, niche-specific"],
  "primaryPain": "the single most likely bottleneck in one concrete sentence",
  "crewCount": "rough number of crews/trucks/teams based on size, or null",
  "goodFit": true/false,
  "fitReason": "one sentence on fit for a $5M+ operations transformation"
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
