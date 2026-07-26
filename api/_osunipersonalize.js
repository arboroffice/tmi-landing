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

  const text = (msg.content || []).map(b => b.text || '').join('').trim();
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  let raw;
  try { raw = JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  const example = String(raw.example || '').slice(0, 1200).trim();
  const for_you = String(raw.for_you || '').slice(0, 600).trim();
  if (!example && !for_you) return null;
  // Strip any em dashes the model slipped in, brand rule.
  const clean = s => s.replace(/\s*[\u2014\u2013]\s*/g, ', ');
  return { example: clean(example), for_you: clean(for_you) };
}

module.exports = { personalize, variantKey, industrySlug };
