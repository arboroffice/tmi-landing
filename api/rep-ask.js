// City-lead rep "what do I say" copilot (the Objection Brain). The rep types what
// the owner said, or any question, and gets TMI's real line back, grounded in the
// objection + FAQ library in api/_repbrain.js (matched to the live tmitechai.com)
// instead of anything invented. Scoped to the rep in the token.
//
//   POST { action:'ask', question } -> { answer, refs }

const { cors } = require('./_auth');
const { requireRep } = require('./_rep-auth');
const KB = require('./_repbrain');

const MODEL = 'claude-haiku-4-5-20251001'; // rep subsystem: fast on mobile

// Cheap keyword overlap so we surface the closest real answers as references and
// keep the grounding prompt tight. Falls back to a broad slice when nothing hits.
function relevant(question, n) {
  const q = String(question || '').toLowerCase();
  const words = new Set(q.split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  const scored = KB.map((e) => {
    const hay = (e.q + ' ' + e.a).toLowerCase();
    let s = 0; words.forEach((w) => { if (hay.includes(w)) s++; });
    if (e.q.toLowerCase().includes(q) && q.length > 4) s += 3;
    return { e, s };
  });
  scored.sort((a, b) => b.s - a.s);
  const hit = scored.filter((x) => x.s > 0).slice(0, n).map((x) => x.e);
  return hit.length ? hit : KB.slice(0, n);
}

async function answer(question, refs) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const kb = refs.map((e, i) => `${i + 1}. Owner says: "${e.q}"\n   You say: ${e.a}`).join('\n\n');
  const fallback = refs[0] ? refs[0].a : 'Keep it about their operation. Ask where everything still comes back to them. The next step is the $5,000 Intelligent Company Audit, or if they are not ready, the free Fit Call with Mia and Tyler at tmitechai.com/intelligent-company-audit.html#book.';
  if (!apiKey) return fallback;

  const system = `You are the field copilot for a TMI Tech AI city rep who visits established industrial and family business owners (manufacturers, machine shops, oil and gas, construction, logistics and fleet, field service, marine, equipment). TMI is a Lafayette, Louisiana firm that installs the operating system of an intelligent company so industrial and family businesses can run, transfer, or sell without living in one person's head. TMI is not an AI company; AI is one tool. Lead with the operation, the owner, knowledge in people's heads, software nobody uses, and the son or daughter taking over.

The rep's goal is to sell the $5,000 Intelligent Company Audit (always that exact name): 30 to 45 minutes, in person or by phone, a Business Intelligence Score out of 100 across ten areas, a five-page report, and the Intelligent Company Roadmap the client owns outright. The rep sends a payment link by text or email or shows a QR code. If the owner is not ready, the next step is the free 20 to 30 minute Fit Call with Mia and Tyler (tmitechai.com/intelligent-company-audit.html#book) or a dated follow-up. If asked why the audit is not free: a free audit is a sales call wearing a costume; the price is fixed because the audit is a fixed thing; the roadmap is theirs whether or not they ever hire TMI.

Hard rules: Only published starting prices, as floors (builds start around fifteen thousand; the real number comes in writing after the audit, not before). Never quote a total, range, timeline, start date, discount, trial, or "no monthly fee" promise. Never invent a result, ROI, percentage, dollar loss, statistic or client story; when a number would help, ask the owner for their own number instead. Never say the audit is free or that it credits toward a build.

Given what the owner said (or the rep's question), give the rep the exact line to say back. Use TMI's real answers below as your source of truth. Voice: calm, plain, specific, respectful of the people who built the company. No hype, no emojis, no em dashes (plain dashes or commas only), no "leverage AI", no "no pitch / no pressure / no catch" lines. Two to five sentences, short enough to say out loud. End by moving toward the paid audit or, if they are not ready, the Fit Call or a dated follow-up, when it fits. Return only the line to say, no preamble.

TMI's real answers:
${kb}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, system, messages: [{ role: 'user', content: String(question || '').slice(0, 600) }] }),
    });
    if (!r.ok) return fallback;
    const data = await r.json();
    const txt = (data && data.content && data.content[0] && data.content[0].text) || '';
    return String(txt || fallback).trim().replace(/—/g, '-') || fallback;
  } catch { return fallback; }
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const rep = await requireRep(req, res); if (!rep) return;

  const b = req.body || {};
  if (String(b.action || 'ask') !== 'ask') return res.status(400).json({ error: 'Unknown action' });
  const question = String(b.question || '').trim();
  if (!question) return res.status(400).json({ error: 'What did they say?' });

  try {
    const refs = relevant(question, 8);
    const ans = await answer(question, refs);
    return res.json({ answer: ans, refs: refs.slice(0, 3).map((e) => e.q) });
  } catch (e) {
    console.error('rep-ask:', e.message);
    return res.status(500).json({ error: e.message });
  }
};

module.exports.config = { maxDuration: 30 };
