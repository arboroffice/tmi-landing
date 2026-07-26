// TMI University - industry and level personalization. The teaching in every
// lesson is universal, the principle does not change between a gun manufacturer
// and a home service company. What changes is the example and the translation:
// what this looks like inside THIS kind of business, at THIS level. That is
// generated here from the lesson's own teaching, then cached per
// (industry, level, lesson) so the first member in an industry pays for it once
// and everyone after gets it instantly. The cache holds no member data, only the
// lesson plus an industry and a level, so it is safe to share across tenants.

const llm = require('./_osllm');

const SYSTEM = `You tailor one TMI University lesson to a specific company's industry and level. You speak to the owner of a real company, not a student.

You are given the lesson's universal teaching and its do-this step. Do two things:
1. Rewrite ONLY the concrete example so it lives inside THIS industry, with realistic specifics and numbers that fit that kind of business. Keep it to two or three sentences.
2. Write one short "for you" line: how this lesson applies to a company of this kind at this level, and the first move it should make.

Rules:
- Third grade reading level. Short sentences. No corporate language. No emojis. No em dashes.
- Use real, believable numbers for that industry. Never invent facts about a specific named company.
- Never contradict the teaching. Do not tell them to skip ahead.
- Ground it in the industry you are given. A firearms manufacturer is a shop floor, serial numbers, ATF compliance, and lot tracking. A home service company is crews, dispatch, and callbacks. Make it obviously theirs.

Return ONLY valid JSON: {"example":"...","for_you":"..."}. No other text.`;

const MODEL = 'claude-opus-4-8';

// Normalize an industry string into a stable, low-cardinality cache key part.
function industrySlug(s) {
  return String(s || 'general')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'general';
}

function variantKey(industry, level, lessonId) {
  return `${industrySlug(industry)}::L${Number(level) || 1}::${lessonId}`;
}

// Generate the tailored example + for-you line for one lesson. Returns
// { example, for_you } or null on any failure (caller falls back to generic).
async function personalize(client, lesson, industry, levelName, opts = {}) {
  const userMsg =
    `INDUSTRY: ${industry || 'general operating company'}\n` +
    `THEIR LEVEL: ${levelName || 'Level 1'}\n` +
    `LESSON: ${lesson.title}\n\n` +
    `THE TEACHING:\n${lesson.teach || lesson.cold_open || ''}\n\n` +
    `THE DO-THIS STEP:\n${lesson.step || ''}`;

  const msg = await llm.create(client, {
    model: MODEL, max_tokens: 500, system: SYSTEM,
    messages: [{ role: 'user', content: userMsg }],
  }, { tenantId: opts.tenantId, label: 'uni:personalize:' + lesson.id, workflow: 'university_personalize', trace: opts.trace });

  const raw = parseJson(msg);
  if (!raw) return null;
  const example = clean(String(raw.example || '').slice(0, 1200).trim());
  const for_you = clean(String(raw.for_you || '').slice(0, 600).trim());
  if (!example && !for_you) return null;
  return { example, for_you };
}

// ---------------------------------------------------------------------------
// Instant feedback on a submitted artifact. Not grading (a human still verifies
// before a floor unlocks); this is the immediate, specific coaching that no
// course gives. Grounded in the lesson and the member's industry.
// ---------------------------------------------------------------------------
const FEEDBACK_SYSTEM = `You give instant feedback on one artifact a business owner just built for a TMI University lesson. You are not the final grader, a human verifies later. You are the coach who tells them, right now, whether the thing is real and what is thin.

You get the lesson's teaching, the do-this step, the owner's industry, and what they submitted. Judge whether the artifact actually exists and meets the bar the lesson set. Then give three to five short sentences: what is good, what is thin or missing, and the one concrete thing to add or fix next. Be specific to their industry and use real numbers where it helps. Honest but encouraging. Never approve empty or placeholder work.

Rules: third grade reading level, short sentences, no corporate language, no emojis, no em dashes.

Return ONLY valid JSON: {"verdict":"strong" or "thin","feedback":"..."}. No other text.`;

async function feedbackOn(client, lesson, content, industry, levelName, opts = {}) {
  const userMsg =
    `INDUSTRY: ${industry || 'general operating company'}\n` +
    `THEIR LEVEL: ${levelName || 'Level 1'}\n` +
    `LESSON: ${lesson.title}\n\n` +
    `THE TEACHING:\n${lesson.teach || lesson.cold_open || ''}\n\n` +
    `THE DO-THIS STEP:\n${lesson.step || ''}\n\n` +
    `WHAT THEY SUBMITTED:\n${String(content || '').slice(0, 6000)}`;
  const msg = await llm.create(client, {
    model: MODEL, max_tokens: 400, system: FEEDBACK_SYSTEM,
    messages: [{ role: 'user', content: userMsg }],
  }, { tenantId: opts.tenantId, label: 'uni:feedback:' + lesson.id, workflow: 'university_feedback', trace: opts.trace });
  const parsed = parseJson(msg);
  if (!parsed) return null;
  const verdict = parsed.verdict === 'strong' ? 'strong' : 'thin';
  const feedback = clean(String(parsed.feedback || '').slice(0, 1500).trim());
  if (!feedback) return null;
  return { verdict, feedback };
}

// ---------------------------------------------------------------------------
// Draft the ugly first version of an artifact from what we know about the
// member's business. "Start ugly" (Floor 4) made automatic. They edit it.
// ---------------------------------------------------------------------------
const DRAFT_SYSTEM = `You draft the ugly first version of an artifact a business owner needs to build for a TMI University lesson. It is a starting point they will edit, not a finished product. Ground it in their industry and what you are told about their business. Make it specific and realistic, with placeholders only where you genuinely cannot know the answer, and mark those with a short note in parentheses telling them what to fill in.

Rules: third grade reading level, short sentences, no corporate language, no emojis, no em dashes. Write the artifact itself, not advice about it.

Return ONLY valid JSON: {"draft":"..."}. No other text.`;

async function draftFor(client, lesson, industry, levelName, context, opts = {}) {
  const userMsg =
    `INDUSTRY: ${industry || 'general operating company'}\n` +
    `THEIR LEVEL: ${levelName || 'Level 1'}\n` +
    (context ? `WHAT WE KNOW ABOUT THEIR BUSINESS:\n${String(context).slice(0, 2000)}\n\n` : '') +
    `LESSON: ${lesson.title}\n` +
    `THE ARTIFACT TO DRAFT: ${lesson.artifact ? lesson.artifact.label : lesson.title}\n\n` +
    `THE TEACHING:\n${lesson.teach || lesson.cold_open || ''}\n\n` +
    `THE DO-THIS STEP:\n${lesson.step || ''}`;
  const msg = await llm.create(client, {
    model: MODEL, max_tokens: 1200, system: DRAFT_SYSTEM,
    messages: [{ role: 'user', content: userMsg }],
  }, { tenantId: opts.tenantId, label: 'uni:draft:' + lesson.id, workflow: 'university_draft', trace: opts.trace });
  const parsed = parseJson(msg);
  if (!parsed) return null;
  const draft = clean(String(parsed.draft || '').slice(0, 8000).trim());
  return draft ? { draft } : null;
}

// ---------------------------------------------------------------------------
// A focused 90-day plan, grounded in the member's weakest area and the floor
// they are on right now. Three phases, concrete moves, in order.
// ---------------------------------------------------------------------------
const PLAN_SYSTEM = `You write a focused ninety day plan for a business owner in TMI University. Ground it in their industry, their weakest area, and the floor they are on right now. Three phases of thirty days each. Each phase has a one line focus and two or three concrete moves that are specific to their kind of business and build in order. Do not tell them to skip floors. Start where they are.

Rules: third grade reading level, short sentences, no corporate language, no emojis, no em dashes, real and specific.

Return ONLY valid JSON: {"phases":[{"title":"Days 1 to 30","focus":"...","moves":["...","..."]},{"title":"Days 31 to 60","focus":"...","moves":["..."]},{"title":"Days 61 to 90","focus":"...","moves":["..."]}]}. No other text.`;

async function planFor(client, ctx, opts = {}) {
  const userMsg =
    `INDUSTRY: ${ctx.industry || 'general operating company'}\n` +
    `LEVEL: ${ctx.levelName || 'Level 1'}\n` +
    `WEAKEST AREA: ${ctx.weakest || 'unknown'}\n` +
    `CURRENT FLOOR: ${ctx.floor || 'Floor 1'}\n` +
    `ARTIFACTS STILL OPEN ON THIS FLOOR: ${(ctx.missing && ctx.missing.length) ? ctx.missing.join('; ') : 'none'}\n` +
    `ALREADY BUILT AND VERIFIED: ${ctx.built || 0} artifacts`;
  const msg = await llm.create(client, {
    model: MODEL, max_tokens: 900, system: PLAN_SYSTEM,
    messages: [{ role: 'user', content: userMsg }],
  }, { tenantId: opts.tenantId, label: 'uni:plan', workflow: 'university_plan', trace: opts.trace });
  const parsed = parseJson(msg);
  if (!parsed || !Array.isArray(parsed.phases)) return null;
  const phases = parsed.phases.slice(0, 3).map(p => ({
    title: clean(String(p.title || '').slice(0, 60)),
    focus: clean(String(p.focus || '').slice(0, 300)),
    moves: (Array.isArray(p.moves) ? p.moves : []).slice(0, 4).map(m => clean(String(m).slice(0, 300))).filter(Boolean),
  })).filter(p => p.focus || p.moves.length);
  return phases.length ? { phases } : null;
}

// Shared: pull the JSON object out of a model reply.
function parseJson(msg) {
  const text = (msg.content || []).map(b => b.text || '').join('').trim();
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}
// Shared: strip any em or en dashes the model returns, brand rule.
function clean(s) { return String(s || '').replace(/\s*[\u2014\u2013]\s*/g, ', '); }

module.exports = { personalize, feedbackOn, draftFor, planFor, variantKey, industrySlug };
