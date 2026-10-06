// "Know before you walk in": a one-screen sales brief for one city lead.
// Who the business is, who the owner is, what probably comes back to the owner
// in a business like theirs, what the audit would look at for them, what to say
// walking in, questions to ask, likely pushback and how to answer, and the ask.
// Reads the company's own website when we have one. Cached on the lead so the
// rep can reopen it in the field for free; refresh:true rebuilds it.
//
//   POST { lead_id, refresh? } -> { brief, brief_at, cached }

const db = require('./_db');
const { cors } = require('./_auth');
const { requireRep } = require('./_rep-auth');

const MODEL = 'claude-opus-5-5';

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
const noDash = (v) => (typeof v === 'string' ? v.replace(/\s*[\u2013\u2014]\s*/g, ' - ') : v);

function siteOf(lead) {
  const m = String(lead.notes || '').match(/Website:\s*(\S+)/i);
  const raw = (m && m[1]) || lead.website || lead.company_domain || '';
  if (!raw || /^n\/?a$/i.test(raw)) return null;
  return raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./i, '').toLowerCase() || null;
}

// Clean every string in the brief: no em dashes, sane lengths.
function tidy(o) {
  if (Array.isArray(o)) return o.slice(0, 6).map(tidy);
  if (o && typeof o === 'object') { const r = {}; Object.keys(o).forEach((k) => { r[k] = tidy(o[k]); }); return r; }
  return typeof o === 'string' ? clip(noDash(o.trim()), 900) : o;
}

function prompt(lead, rep, site, history) {
  return `You are preparing a TMI Tech AI field sales rep to walk into one specific business. Write a short brief they can read on their phone in the parking lot, in plain words a busy person can scan.

About TMI Tech AI (use only these facts): TMI is a Lafayette, Louisiana firm that installs the operating system of an intelligent company so industrial and family businesses can run, transfer, or sell without living in one person's head. It is not an AI agency; AI is one tool. The rep's goal is to sell the Intelligent Company Audit (always that exact name): $5,000, 30 to 45 minutes, in person or by phone, looking at how the company sells, operates, communicates, tracks information and makes decisions. The owner gets a Business Intelligence Score out of 100 across ten areas, a five-page report, and the Intelligent Company Roadmap, which they own whether or not they ever hire TMI. If the owner is not ready, the fallback ask is the free 20 to 30 minute Fit Call with Mia and Tyler, or a set date to follow up. Never call the audit free, never say it credits toward anything, never quote build prices, timelines or discounts, and never invent results, percentages, dollar figures, client names or stories.

${site ? `Look up this company first. Search for "${lead.business_name || site}" and read ${site} (home and about pages are enough). Use what you find to say what they actually do, who runs it, how long they have been around, their size, their service area. If something is not confirmed by a source, say "likely" or leave it out. Do not guess the owner's name.` : `There is no website on file. You may run one quick search for "${lead.business_name}" ${lead.address ? 'near ' + lead.address : ''} to confirm what they do and who runs it. If nothing solid comes up, write from the industry and say so.`}

How to write it:
- Relate everything to THIS business and THIS kind of work. A roofer's day is not a machine shop's day. Name the real jobs, crews, trucks, bids, schedules, parts, customers that business deals with.
- "What probably comes back to the owner" is a list of likely pains for a business like this, written as things to listen for or ask about, never as facts about them.
- "What the audit would look at" maps to how they sell, operate, communicate, track information and make decisions, in their language.
- The opener is what the rep says in the first 20 seconds walking in. Calm, local, human, specific to them. Not a pitch dump.
- Plain words, short sentences, no jargon, no hype, no emojis, no em dashes (use plain dashes), never "leverage AI", no "no pressure / no catch / no fluff" lines.
- Rep's first name: ${rep}.

The lead:
Business: ${lead.business_name || 'unknown'}
Contact on file: ${lead.contact_name || 'none'}
Industry on file: ${lead.industry || 'unknown'}
Address: ${lead.address || 'unknown'}
Website: ${site || 'none'}
Why this lead is on the list: ${lead.context ? clip(lead.context, 300) : 'part of the rep territory'}
Notes: ${lead.notes ? clip(lead.notes, 700) : 'none'}
Pipeline status: ${lead.status || 'new'}
What has happened so far (newest first):
${history.length ? history.map((h, i) => `${i + 1}. ${clip(h, 200)}`).join('\n') : 'Nobody has talked to them yet.'}

When you are done researching, reply with STRICT JSON only, no other text:
{
 "who": "2 to 3 sentences: what the business does, for who, where, how big if known",
 "owner": "who runs it and anything useful about them (title, family business, years), or what to find out if unknown",
 "facts": ["up to 4 short confirmed facts worth mentioning, each under 15 words"],
 "pains": ["3 to 4 things that probably come back to the owner in a business like this, each one sentence"],
 "audit_fit": ["3 short lines: what the audit would look at for them, in their language"],
 "opener": "what to say walking in, 2 to 4 sentences",
 "questions": ["3 questions that get the owner talking about their own operation"],
 "objections": [{"they_say": "likely pushback", "you_say": "calm plain answer"}, {"they_say": "...", "you_say": "..."}, {"they_say": "...", "you_say": "..."}],
 "ask": "the close line for the audit, plus the fallback if they are not ready",
 "sources": ["urls you actually read"],
 "confidence": "high, medium or low: how sure you are about who they are"
}`;
}

async function callClaude(body, apiKey) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('claude ' + r.status + ': ' + clip(await r.text().catch(() => ''), 200));
  return r.json();
}

async function build(lead, rep, history) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Brief is not set up yet (missing API key)');
  const site = siteOf(lead);
  const messages = [{ role: 'user', content: prompt(lead, rep, site, history) }];
  const req = {
    model: MODEL, max_tokens: 6000,
    thinking: { type: 'adaptive' }, output_config: { effort: 'low' },
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }],
    messages,
  };
  let data;
  // Web search runs a server-side loop; resume it if it pauses.
  for (let i = 0; i < 3; i++) {
    data = await callClaude(req, apiKey);
    if (data.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: data.content });
  }
  if (data.stop_reason === 'refusal') throw new Error('Could not build a brief for this lead');
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  const jm = text.match(/\{[\s\S]*\}/);
  if (!jm) throw new Error('Could not read the brief');
  const o = JSON.parse(jm[0]);
  const urls = new Set(o.sources || []);
  (data.content || []).forEach((c) => (c.citations || []).forEach((x) => x.url && urls.add(x.url)));
  o.sources = Array.from(urls).filter((u) => /^https?:\/\//.test(u)).slice(0, 5);
  return tidy(o);
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const rep = await requireRep(req, res); if (!rep) return;

  const b = req.body || {};
  try {
    const lead = await db.getById('rep_leads', String(b.lead_id || ''));
    if (!lead || lead.rep_id !== rep.sub) return res.status(404).json({ error: 'Lead not found' });
    if (lead.brief && !b.refresh) return res.json({ brief: lead.brief, brief_at: lead.brief_at, cached: true });

    const inter = await db.list('rep_interactions', { where: [['lead_id', '==', lead.id]], limit: 40 }).catch(() => []);
    const history = (inter || [])
      .filter((x) => x.rep_id === rep.sub && (x.summary || x.transcript))
      .sort((a, z) => String(z.created_at).localeCompare(String(a.created_at)))
      .slice(0, 6)
      .map((x) => `${x.channel || 'note'}: ${x.summary || x.transcript}`);
    const repDoc = await db.getById('reps', rep.sub).catch(() => null);
    const first = String((repDoc && repDoc.name) || rep.name || '').split(' ')[0] || 'the rep';

    const brief = await build(lead, first, history);
    const brief_at = new Date().toISOString();
    // Saving the brief is not an edit by the rep, so updated_at stays put.
    await db.update('rep_leads', lead.id, { brief, brief_at }).catch((e) => console.error('save brief:', e.message));
    return res.json({ brief, brief_at, cached: false });
  } catch (e) {
    console.error('rep-brief:', e.message);
    return res.status(502).json({ error: e.message.startsWith('claude') ? 'Could not build the brief right now. Try again in a minute.' : e.message });
  }
};

module.exports.config = { maxDuration: 120 };
