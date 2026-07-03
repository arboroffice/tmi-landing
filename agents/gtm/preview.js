// Intelligent Company Preview generator. The automated, POSITIVE outside read
// behind the "Intelligent Company Preview" outbound asset. Researches a company
// and returns a forward-looking preview of what it looks like as an intelligent
// company. Never a critique, never "bottleneck". Reuses the audit research pass.
//
//   import { generatePreview } from './preview.js';
//   const p = await generatePreview({ company, website, email });

import Anthropic from '@anthropic-ai/sdk';
import { researchForAudit } from './audit-research.js';

const anthropic = new Anthropic();
const clamp = (n, lo, hi, d) => { n = parseInt(String(n).match(/-?\d+/), 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

export async function generatePreview({ company, website, email } = {}) {
  const research = await researchForAudit({ company, website, email }).catch(() => null);
  const r = research || {};

  const ctx = [
    `Company: ${company || (r.prefill && r.prefill.company) || 'unknown'}`,
    r.website ? `Website: ${r.website}` : '',
    r.summary ? `What they do: ${r.summary}` : '',
    r.techStack && r.techStack.length ? `Detected software: ${r.techStack.join(', ')}` : 'Detected software: none found (likely phone, text, spreadsheets)',
    r.signals && r.signals.length ? `Back-office roles they staff: ${r.signals.join(', ')}` : '',
    r.frictionSignals && r.frictionSignals.length ? `Gaps observed: ${r.frictionSignals.join('; ')}` : '',
    r.found && r.found.length ? `Facts: ${r.found.slice(0, 8).join(' | ')}` : '',
  ].filter(Boolean).join('\n');

  const system = `You are TMI's strategist writing a short, POSITIVE "Intelligent Company Preview" for a prospect, from a 20-minute outside look.
TMI redesigns operations-heavy companies into intelligent companies: one operating system, a digital workforce (offices like sales, dispatch, back office), and a command center they own.

Tone rules, strict:
- Positive and forward-looking. This is a preview of upside, never a critique.
- NEVER use the word "bottleneck". Never say or imply the owner is the problem or has done anything wrong. Compliment what they built.
- Frame everything as opportunity and vision: "where the leverage is", "what it looks like when it runs on systems".
- Specific to their trade and the evidence. No AI hype. No em dashes.

Return ONLY this JSON, no markdown:
{
 "headline": "What <Company> looks like as an intelligent company.",
 "opening": "2 to 3 warm sentences, grounded in what they built",
 "whatWeSaw": { "business": "one line", "scale": "one line", "howItRunsToday": "one neutral line" },
 "opportunities": [ {"title":"short positive, e.g. Every lead answered and booked","win":"the upside in one phrase"} ],
 "score": <int 0-100, Company Intelligence Score estimate>,
 "scoreByFunction": [ {"name":"Sales","score":<0-100>}, {"name":"Operations","score":<0-100>}, {"name":"Finance","score":<0-100>}, {"name":"Visibility","score":<0-100>} ],
 "upsideAnnual": <int, conservative potential dollars per year of time and money in reach>,
 "theShift": "the positive picture of the intelligent version for their trade, one vivid sentence"
}`;

  let parsed = {};
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 1200, system,
      messages: [{ role: 'user', content: `Write the Intelligent Company Preview for:\n\n${ctx}` }],
    });
    const j = msg.content[0].text.match(/\{[\s\S]*\}/);
    parsed = j ? JSON.parse(j[0]) : {};
  } catch (e) { parsed = {}; }

  return {
    company: company || null,
    website: r.website || website || null,
    headline: parsed.headline || `What ${company || 'your company'} looks like as an intelligent company.`,
    opening: parsed.opening || '',
    whatWeSaw: parsed.whatWeSaw || {},
    opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities.slice(0, 5) : [],
    score: clamp(parsed.score, 0, 100, 45),
    scoreByFunction: Array.isArray(parsed.scoreByFunction)
      ? parsed.scoreByFunction.map((s) => ({ name: s.name, score: clamp(s.score, 0, 100, 45) })) : [],
    upsideAnnual: Math.max(0, Math.round(Number(parsed.upsideAnnual) || 0)),
    theShift: parsed.theShift || '',
    research: { techStack: r.techStack || [], signals: r.signals || [], found: (r.found || []).slice(0, 8) },
  };
}
