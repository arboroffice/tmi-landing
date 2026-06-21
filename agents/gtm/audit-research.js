// AI research pass for the Intelligent Company Audit. Before we ask the owner a
// single question, we do the homework: resolve their site from the email domain,
// read it, fingerprint the software they run, and let Claude extract what is
// PUBLICLY knowable. We pre-fill those fields so the audit only has to ask the
// owner for what only the owner knows. We never invent internal numbers.

import Anthropic from '@anthropic-ai/sdk';
import { fetchPage, baseUrl, detectTechStack, findSignals } from './tools/research.js';

const anthropic = new Anthropic();

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

export async function researchForAudit({ company, website, email } = {}) {
  const site = (website && String(website).trim()) || siteFromEmail(email);

  let home = null, tech = [], signals = [];
  if (site) {
    home = await fetchPage(site);
    const origin = baseUrl(site);
    tech = detectTechStack(home && home.html);
    // One extra page for context — services or about — no deep crawl (keeps it fast).
    if (origin) {
      const extra = (await fetchPage(origin + '/services')) || (await fetchPage(origin + '/about'));
      if (extra && extra.text) home = { text: ((home && home.text) || '') + ' ' + extra.text, html: home && home.html };
    }
    signals = findSignals((home && home.text) || '');
  }

  const context = [
    `Company name: ${company || 'unknown'}`,
    site ? `Website: ${site}` : 'Website: none (personal email or no site provided)',
    tech.length ? `Detected software/tools on their site: ${tech.join(', ')}` : 'Detected software/tools: none detected',
    signals.length ? `Role/hiring signals seen: ${signals.join(', ')}` : '',
    home && home.text ? `\nWebsite text excerpt:\n${home.text.slice(0, 3500)}` : '',
  ].filter(Boolean).join('\n');

  const system = `You are TMI's research agent. Before TMI audits a company, you do the homework so the owner is never asked something you can already find out. You research operations-heavy businesses (trades, industrial, field service, manufacturing, logistics) and extract only what is PUBLICLY knowable from the evidence.

Hard rules:
- Only fill a field when the evidence supports it. NEVER invent revenue, margins, headcount, hours, close rates, or anything internal. Those belong to the owner.
- Detected tools are real evidence of their software stack. Put them in tools_list.
- Be specific and concrete, grounded in what you actually saw. No AI hype. No em dashes.
- Output ONLY a JSON object. No prose before or after.`;

  const user = `${context}

Return ONLY this JSON object:
{
  "summary": "2 to 3 sentences on what this company does and how it likely operates today, built only from the evidence",
  "found": ["3 to 6 short factual statements of what you learned, one fact each, e.g. 'Runs ServiceTitan and QuickBooks', 'Lists 3 service areas', 'Hiring a dispatcher'"],
  "prefill": {
    "industry": "what the business actually does, in one concrete line, or empty",
    "website": "${site || ''}",
    "tools_list": "comma separated detected tools, or empty",
    "lead_sources": "only if the site clearly shows how they win customers, else empty",
    "locations": "number of locations/sites only if clearly stated, else empty"
  },
  "confidence": "high | medium | low"
}`;

  let parsed = {};
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const raw = msg.content[0].text;
    const j = raw.match(/\{[\s\S]*\}/);
    parsed = j ? JSON.parse(j[0]) : {};
  } catch (e) {
    parsed = {};
  }

  const prefill = Object.assign({ company: company || '', website: site || '' }, parsed.prefill || {});
  for (const k of Object.keys(prefill)) {
    const v = prefill[k];
    if (v == null || String(v).trim() === '' || String(v).toLowerCase() === 'unknown') delete prefill[k];
  }

  return {
    website: site || null,
    techStack: tech,
    signals,
    summary: parsed.summary || '',
    found: Array.isArray(parsed.found) ? parsed.found.slice(0, 6) : [],
    prefill,
    confidence: parsed.confidence || 'low',
  };
}
