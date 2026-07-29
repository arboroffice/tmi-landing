// City-lead rep "what do I say" copilot (the Objection Brain). The rep types what
// the owner said, or any question, and gets TMI's real line back, grounded in the
// objection + FAQ library extracted from the rep master guide (api/_repbrain.js)
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
  const fallback = refs[0] ? refs[0].a : 'Keep it about their operation. We map where the business leaks time and money on a short call, then build the fix. Worth 20 minutes?';
  if (!apiKey) return fallback;

  const system = `You are the field copilot for a TMI rep who door-knocks industrial and trades business owners and books them onto TMI's discovery call at tmitechai.com/book, where the Intelligent Company Audit is done live. The rep does not close on the street and does not lead with price. Only if asked: the Intelligent Company Audit is $5,000 and credits in full toward the build; a digital employee starts at $5,000; an operating system starts at $25,000; the client owns what we build, no monthly license. The one way in is booking the call.

Given what the owner said (or the rep's question), give the rep the exact line to say back. Use TMI's real answers below as your source of truth. Match their voice: blunt, concrete, no hype, no emojis, no em dashes (plain dashes only), short enough to say out loud at a door. End by moving toward booking the call when it fits. Return only the line to say, no preamble.

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
