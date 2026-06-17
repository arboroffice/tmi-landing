// Turns a paid Complete Audit into a client-facing build proposal: the three
// paths (DIY / done with you / done for you), each scoped and priced, with a
// recommended path. Generated from the audit deliverable so it is specific to
// the company. Returns structured JSON the build-proposal page renders.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const FALLBACK = (company) => ({
  summary: `Based on your Complete Audit, here is how TMI would build the intelligent backend for ${company || 'your company'} across three paths.`,
  recommended: 'dfy',
  paths: [
    { key: 'diy', name: 'Do It Yourself', price: 1500, deposit: 1500, timeline: 'Self-paced',
      scope: ['Your 90-day plan and build order', 'Templates and the system map', 'Async guidance as you build it with your own team'] },
    { key: 'dwy', name: 'Done With You', price: 9000, deposit: 3000, timeline: '6 to 8 weeks',
      scope: ['TMI builds the core systems alongside your team', 'Weekly working sessions', 'Your team trained to run and extend it'] },
    { key: 'dfy', name: 'Done For You', price: 18000, deposit: 6000, timeline: '90 days',
      scope: ['TMI builds and installs the full backend', 'Delete, connect, build across your operation', 'Deployed, wired into your tools, team trained, handed over running'] },
  ],
});

function clampMoney(n, lo, hi) {
  n = Math.round(Number(n) || 0);
  if (n < lo) n = lo;
  if (n > hi) n = hi;
  return n;
}

function prdToText(prd) {
  if (!prd) return '';
  if (typeof prd === 'string') return prd;
  const order = ['overview', 'problem', 'goals', 'stories', 'requirements', 'nonfunc', 'tech', 'criteria', 'outofscope'];
  return order.filter(k => prd[k]).map(k => `${k.toUpperCase()}: ${prd[k]}`).join('\n\n');
}

export async function buildBuildProposal({ company, industry, auditMd = '', score = null, notes = '', prd = null }) {
  const prdText = prdToText(prd);
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2200,
      system: `You are TMI's solutions architect turning a paid Complete Audit into a build proposal for ${company || 'the client'}. TMI runs a 90-day Delete / Connect / Build transformation: delete the software they don't use, connect what's left, build the backend the company runs on, with digital employees and a command center they run from their phone.

You scope THREE paths, all built from this company's real audit:
- DIY (Do It Yourself): they build it with TMI's plan and guidance. Lowest cost.
- DWY (Done With You): TMI builds alongside their team and trains them.
- DFY (Done For You): TMI builds and installs the whole backend.

Pricing guidance (USD, be realistic to the scope you describe):
- DIY: 1000 to 3000.
- DWY: 5000 to 18000.
- DFY: 12000 to 60000 depending on complexity and number of systems.
- deposit: about 30% of price, rounded to a clean number (DIY deposit equals its price, paid in full).

Be specific to their niche and the real systems their audit calls for. No AI hype. No em dashes. Each scope bullet is concrete.`,
      messages: [{
        role: 'user',
        content: `Company: ${company || 'unknown'}
Industry: ${industry || 'from the audit'}
Intelligence Score: ${score == null ? 'n/a' : score + '/100'}
${notes ? 'Strategist notes from the call: ' + notes + '\n' : ''}
${prdText ? 'PRD FROM THE STRATEGY CALL (the spec for what to build - scope the three paths to deliver this):\n' + prdText.slice(0, 4000) + '\n' : ''}
THEIR COMPLETE AUDIT:
${String(auditMd).slice(0, prdText ? 4000 : 6000)}

Return ONLY JSON in this exact shape, no prose:
{
  "summary": "2-3 sentences on what to build for this company and why, grounded in their audit",
  "recommended": "diy|dwy|dfy",
  "paths": [
    {"key":"diy","name":"Do It Yourself","price":0,"deposit":0,"timeline":"...","scope":["...","...","..."]},
    {"key":"dwy","name":"Done With You","price":0,"deposit":0,"timeline":"...","scope":["...","...","..."]},
    {"key":"dfy","name":"Done For You","price":0,"deposit":0,"timeline":"...","scope":["...","...","...","..."]}
  ]
}`,
      }],
    });
    const raw = msg.content[0].text;
    const json = raw.match(/\{[\s\S]*\}/);
    if (!json) return FALLBACK(company);
    const parsed = JSON.parse(json[0]);

    // Sanity-clamp the numbers so a model slip can't produce a wild price.
    const ranges = { diy: [1000, 3000], dwy: [5000, 18000], dfy: [12000, 60000] };
    (parsed.paths || []).forEach(p => {
      const r = ranges[p.key] || [0, 100000];
      p.price = clampMoney(p.price, p.key === 'diy' ? 0 : r[0], r[1]);
      p.deposit = p.key === 'diy' ? p.price : clampMoney(p.deposit || Math.round(p.price * 0.3), 0, p.price);
      if (!Array.isArray(p.scope)) p.scope = [];
    });
    if (!['diy', 'dwy', 'dfy'].includes(parsed.recommended)) parsed.recommended = 'dfy';
    if (!parsed.paths || parsed.paths.length < 3) return FALLBACK(company);
    return parsed;
  } catch (e) {
    console.error('buildBuildProposal:', e.message);
    return FALLBACK(company);
  }
}
