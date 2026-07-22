// Company Intelligence engine for TMI itself (TMI as Client Zero). Takes an
// internal meeting transcript and routes it into publish-ready content, SOPs,
// durable company knowledge, and tasks. One capture, many outputs.
//
// Uses Claude (Opus) so the content comes back in TMI's voice, ready to edit.

const MODEL = 'claude-opus-4-8';

const SYSTEM = `You are the Company Intelligence engine for TMI, the Intelligent Company Firm. TMI turns owner-led businesses into Intelligent Companies that run on systems, not on the owner. Voice: direct, operator to operator, specific, no hype. Never use emojis. Never use em dashes. Never say "leverage AI".

You are given a transcript of an internal TMI meeting (strategy, team, product, or client debrief). Turn it into structured company intelligence. Use only what is actually in the transcript. Do not invent facts, names, or numbers.

Return ONLY valid JSON in exactly this shape:
{
  "summary": "2 to 3 sentences on what this meeting was and what came out of it",
  "decisions": ["each decision as one self-contained sentence"],
  "content": [
    { "format": "letter|linkedin|x_thread|podcast|youtube", "title": "short title", "angle": "one line on why this matters to owners", "draft": "the actual text, ready to edit and publish, in TMI voice" }
  ],
  "sops": [
    { "title": "SOP title", "purpose": "one line", "steps": ["step", "step"] }
  ],
  "knowledge": [
    { "title": "short title", "body": "the durable fact or decision worth remembering", "kind": "positioning|process|offer|client|decision|note" }
  ],
  "tasks": [
    { "title": "the action", "owner": "name or null", "due": "text or null" }
  ]
}

Rules:
- content: 2 to 6 drafts. Pull the sharpest, most useful, most debatable ideas from the meeting. For "letter" write 150 to 250 words. For "linkedin" a full post. For "x_thread" 4 to 7 numbered tweets in one string. For "podcast" or "youtube" a title plus a bullet outline. Everything grounded in the Intelligent Company message, not generic AI talk.
- sops: 0 to 4, only for processes the meeting actually described or implied.
- knowledge: durable facts, positioning, offers, pricing, client learnings, or decisions. Not chit chat.
- tasks: concrete action items with an owner when named.
- Return empty arrays for anything not present. No prose outside the JSON.`;

async function routeTranscript(transcript, meta) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });

  const head = `Meeting: ${(meta && meta.title) || 'Internal meeting'}\nDate: ${(meta && meta.date) || 'today'}\n\nTranscript:\n`;
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 4500,
    system: SYSTEM,
    messages: [{ role: 'user', content: head + String(transcript || '').slice(0, 60000) }],
  });

  const text = (msg.content || []).map(b => b.text || '').join('').trim();
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON in intelligence response');
  const raw = JSON.parse(text.slice(start, end + 1));
  return normalize(raw);
}

function arr(v) { return Array.isArray(v) ? v : []; }
function s(v, n) { return String(v == null ? '' : v).slice(0, n); }

function normalize(raw) {
  const FMT = ['letter', 'linkedin', 'x_thread', 'podcast', 'youtube'];
  const KIND = ['positioning', 'process', 'offer', 'client', 'decision', 'note'];
  return {
    summary: s(raw.summary, 600),
    decisions: arr(raw.decisions).slice(0, 12).map(d => s(d, 300)).filter(Boolean),
    content: arr(raw.content).slice(0, 6).map(c => ({
      format: FMT.includes(c.format) ? c.format : 'linkedin',
      title: s(c.title, 120) || 'Untitled',
      angle: s(c.angle, 240),
      body: s(c.draft || c.body, 8000),
    })).filter(c => c.body),
    sops: arr(raw.sops).slice(0, 4).map(x => ({
      title: s(x.title, 120) || 'SOP',
      purpose: s(x.purpose, 300),
      steps: arr(x.steps).slice(0, 20).map(y => s(y, 300)).filter(Boolean),
    })).filter(x => x.steps.length),
    knowledge: arr(raw.knowledge).slice(0, 10).map(k => ({
      title: s(k.title, 120) || 'Note',
      body: s(k.body, 4000),
      kind: KIND.includes(k.kind) ? k.kind : 'note',
    })).filter(k => k.body),
    tasks: arr(raw.tasks).slice(0, 12).map(t => ({
      title: s(t.title, 240),
      owner: t.owner ? s(t.owner, 80) : null,
      due: t.due ? s(t.due, 80) : null,
    })).filter(t => t.title),
  };
}

module.exports = { routeTranscript };
