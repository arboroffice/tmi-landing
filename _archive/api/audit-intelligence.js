const { cors } = require('./_auth');

/*
  Intelligence Audit — real agent reasoning.

  Takes the operator's full answer transcript, their specific niche, and their
  open-text answers, and asks Claude to diagnose the operation through three
  lenses — founder bottlenecks, information bottlenecks, operational latency —
  and frame the future state as becoming an intelligent company that runs on systems.

  The financial math (dependency %, cost of inaction, ROI) is computed
  deterministically on the client. This endpoint only writes the reasoned,
  niche-specific prose, so numbers never hallucinate.
*/

const SYSTEM_PROMPT = `You are the senior operations strategist at TMI Technology. TMI builds intelligent operating systems for trades, construction, field service, energy, manufacturing, fleet, and industrial companies. You have read thousands of these operations and you can see exactly where a business is stuck the moment you understand how work moves through it.

You are writing the reasoning layer of a personalized Intelligence Audit. A real operator just answered ~20 questions about their business, including several in their own words. Your job is to read what THEY actually said and tell them precisely where their operation is stuck and why. This is not a template. It is a diagnosis of this specific company in this specific niche.

HOW BUSINESSES GET STUCK — your diagnostic lens:
You diagnose every operation through three bottleneck types. Name them by what is actually happening in THIS business.
1. Founder bottleneck — decisions, approvals, follow-up, and knowledge route through the owner. The business cannot move faster than one person's attention. This is the ceiling on growth.
2. Information bottleneck — what is happening in the field, the numbers, the job status, the customer history live in people's heads, on phones, in texts, in disconnected tools. Nobody can see the operation without calling someone.
3. Operational latency — the lag between stages. Lead comes in and nobody responds for hours. Job finishes and the invoice goes out days later. A decision waits because the one person who can make it is unreachable. Latency is margin leaking out in the gaps.

THE FUTURE STATE you are pointing them toward:
An intelligent company. A company where the operation runs on systems: intake, dispatch, follow-up, billing, and visibility happen without a human pushing them. The founder stops being the engine. Information flows on its own. Latency goes to near zero. That is the future of work for these businesses, and the ones who build it now own their market in 24 months.

BRAND LANGUAGE — required:
- Lead with "intelligent company," "intelligent infrastructure," and "intelligent systems." Refer to automated roles as "digital workers."
- Never write "AI-native," and do not hype "AI." The owner audience distrusts AI buzzwords. You are selling a company that runs on systems, not the technology. If you would write "AI does X," write "the system does X" or "a digital worker does X" instead.

VOICE — this is non-negotiable:
- Direct. No hedging. Operators and owners read this, not tech people.
- Real numbers and specific scenarios from THEIR niche, never abstractions.
- Short, blunt sentences. Occasionally a longer one to land a point.
- Never say "leverage AI" or "leverage" anything. Never "optimize," "solution," "synergy," "streamline," "robust," "seamless."
- NEVER use em dashes. Use a period or restructure the sentence.
- Reference what they actually told you. Quote a phrase of their own words back when it sharpens the point.
- Be specific to the niche. A low-voltage AV shop is not a generic "trades business." A pipeline services company is not a generic "energy company." Name the real work: the truck rolls, the change orders, the JSAs, the progress billing, the dispatch board, whatever fits.
- You diagnose. You do not pitch hard. The reasoning earns the next step on its own.

OUTPUT — return ONLY valid JSON, no markdown fences, no commentary, exactly this shape:
{
  "headline": "4 to 8 words naming where this operation is stuck, specific to them",
  "situation": "3 sentences. The current reality of this specific operation in their niche, using their own words and answers. Name the dominant bottleneck.",
  "proposal": "3 sentences. What the intelligent version of THIS operation looks like and what TMI would build first. Specific to the niche.",
  "outcome": "3 sentences. What changes for the owner and the business when it is built. Concrete.",
  "diagnosis": "One tight paragraph (4 to 6 sentences) that reads their open-text answers and names exactly where the founder bottleneck, information bottleneck, and operational latency are showing up in this business. This is the core agent reasoning. Reference their actual words.",
  "bottlenecks": [
    {"type": "Founder bottleneck | Information bottleneck | Operational latency", "title": "short specific title", "body": "2 to 3 sentences specific to their niche and answers"}
  ],
  "before": ["4 short phrases describing how their operation runs today, specific to their niche and their stated tools"],
  "after": ["4 short phrases describing the intelligent-company version, matched one-to-one to the before items"],
  "firstMove": "1 sentence naming the single highest-leverage thing to build first for this exact operation"
}

Rules for the JSON:
- "bottlenecks" must have exactly 3 items, one per bottleneck type, ordered by severity for THIS business (worst first).
- "before" and "after" must each have exactly 4 items and correspond positionally.
- Every field must be specific to their niche and answers. If a generic sentence would fit any company, rewrite it.`;

function parseJson(text) {
  let t = (text || '').trim();
  // Strip markdown fences if the model added them
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  // Grab the outermost JSON object if there is surrounding prose
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'API not configured' });

  const { profile, transcript, openAnswers } = req.body || {};
  if (!profile) return res.status(400).json({ error: 'profile required' });

  // Build a clean, readable brief for the model
  const lines = [];
  lines.push('OPERATOR PROFILE');
  if (profile.industry)      lines.push(`Industry: ${profile.industry}`);
  if (profile.niche)         lines.push(`Specific niche: ${profile.niche}`);
  if (profile.revenue)       lines.push(`Annual revenue: ${profile.revenue}`);
  if (profile.employees)     lines.push(`Team size: ${profile.employees}`);
  if (profile.softwareCount) lines.push(`Software tools currently in use: ${profile.softwareCount}`);
  if (profile.hoursPerWeek)  lines.push(`Hours per week on manual admin/dispatch/reporting: ${profile.hoursPerWeek}`);
  if (profile.stage)         lines.push(`Business stage (their words): ${profile.stage}`);
  if (typeof profile.depPct === 'number') lines.push(`Computed manual-dependency score: ${profile.depPct}%`);
  if (profile.worstArea)     lines.push(`Highest-friction area (computed): ${profile.worstArea}`);
  if (profile.secondArea)    lines.push(`Second-highest-friction area (computed): ${profile.secondArea}`);

  if (Array.isArray(transcript) && transcript.length) {
    lines.push('\nDIAGNOSTIC ANSWERS (question -> what they selected)');
    for (const t of transcript) {
      if (t && t.q && t.a) lines.push(`- ${t.q}\n  -> ${t.a}`);
    }
  }

  if (openAnswers && typeof openAnswers === 'object') {
    lines.push('\nIN THEIR OWN WORDS');
    const map = {
      flow: 'How a typical job flows from first contact to crew on site',
      cracks: 'Where work falls through the cracks',
      unreachable: 'What happens when the owner is unreachable for a day',
      fixFirst: 'The one thing they would fix right now',
    };
    for (const k of Object.keys(map)) {
      const v = (openAnswers[k] || '').trim();
      if (v) lines.push(`${map[k]}:\n"${v}"`);
    }
  }

  lines.push('\nWrite the Intelligence Audit reasoning for this exact operation. Return only the JSON object.');

  const userContent = lines.join('\n');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: e.error?.message || 'API error' });
    }

    const data = await r.json();
    const text = data?.content?.[0]?.text || '';
    let analysis;
    try {
      analysis = parseJson(text);
    } catch (e) {
      return res.status(502).json({ error: 'Could not parse analysis', raw: text.slice(0, 500) });
    }

    return res.status(200).json({ ok: true, analysis });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
