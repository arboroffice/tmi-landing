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
