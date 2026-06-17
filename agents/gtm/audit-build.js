// Generates the structured, prospect-facing audit data (Intelligence Score,
// category breakdown, bottlenecks, current/future state, savings) that feeds the
// audit microsite (audit-site.js). Numbers are illustrative estimates framed as
// "potential" - never presented as measured fact.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const CATS = ['Lead flow', 'Operations', 'Visibility', 'Automation', 'Reporting'];

function clampScore(n, max = 10) {
  n = Number(n);
  if (!Number.isFinite(n)) return Math.round(max * 0.4);
  return Math.max(0, Math.min(max, Math.round(n)));
}

export async function buildAuditData({ lead, research, websiteText }) {
  const ctx = `
COMPANY: ${lead.company_name}
INDUSTRY: ${lead.industry || 'operations-heavy business'}
LOCATION: ${lead.location || 'unknown'}
EMPLOYEES: ${lead.employee_count || 'unknown'}
REVENUE (est): ${lead.revenue_est || lead.revenue || 'unknown'}
OWNER: ${lead.owner_name || 'the owner'} (${lead.owner_title || 'Owner'})
PRIMARY PAIN (research): ${research?.primaryPain || 'manual, disconnected operations'}
LIKELY PAIN POINTS: ${research?.likelyPainPoints?.join(', ') || 'scheduling, dispatch, reporting, communication'}
WEBSITE EXCERPT: ${(websiteText || '').slice(0, 1500) || 'n/a'}
`.trim();

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1100,
    system: `You are TMI's operations strategist producing a prospect-facing operational intelligence review.
TMI runs a 90-day Delete / Connect / Build transformation: delete software they don't use, connect what's left, build the backend the company runs on.
You write a concise, specific, non-hyped review of THIS company based on its size, industry, and research.
Rules: Never claim anything is broken - frame as where time and money "may be" leaking. No AI hype. No em dashes. Be specific to the niche.
Scores are out of 10 per category; lower = more friction/opportunity. The overall Intelligence Score (0-100) reflects how systems-driven they likely are today (operations-heavy SMBs usually land 35-60).
Return ONLY valid JSON, no markdown fences, exactly this shape:
{
  "score": <int 0-100>,
  "summary": "<2-3 sentences, plain, specific to this company and niche, in their language>",
  "categories": [ {"name":"Lead flow","score":<0-10>}, {"name":"Operations","score":<0-10>}, {"name":"Visibility","score":<0-10>}, {"name":"Automation","score":<0-10>}, {"name":"Reporting","score":<0-10>} ],
  "bottlenecks": ["<4-6 short observed-friction phrases, niche-specific>"],
  "current": ["<3-5 short current-state items, e.g. '5 software tools', '12 spreadsheets', 'phone & text'>"],
  "future": ["<3-5 short future-state items, e.g. 'one command center', 'reporting', 'dispatch & approvals'>"],
  "savingsAnnual": <int, conservative potential annual dollars>,
  "hoursPerWeek": <int, potential hours recovered per week>
}`,
    messages: [{ role: 'user', content: `Produce the audit JSON for:\n\n${ctx}` }],
  });

  const raw = msg.content[0].text;
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error('No JSON in audit data response');
  const d = JSON.parse(json);

  // Coerce / guard
  const categories = (Array.isArray(d.categories) && d.categories.length ? d.categories : CATS.map(n => ({ name: n, score: 4 })))
    .map(c => ({ name: c.name, score: clampScore(c.score) }));
  const score = Math.max(0, Math.min(100, Math.round(Number(d.score) || Math.round(categories.reduce((s, c) => s + c.score, 0) / categories.length * 10))));

  return {
    score,
    summary: d.summary || '',
    categories,
    bottlenecks: Array.isArray(d.bottlenecks) ? d.bottlenecks.slice(0, 6) : [],
    current: Array.isArray(d.current) ? d.current.slice(0, 5) : [],
    future: Array.isArray(d.future) ? d.future.slice(0, 5) : [],
    savingsAnnual: Math.max(0, Math.round(Number(d.savingsAnnual) || 0)),
    hoursPerWeek: Math.max(0, Math.round(Number(d.hoursPerWeek) || 0)),
  };
}
