// TMI OS — the conversational cascade builder. The owner describes what they
// want in plain language ("when a new lead comes in, text them in 2 minutes,
// then open a task for dispatch") and the COO builds a runnable cascade with
// them, back and forth, until it is right. Each turn returns a natural reply
// AND a live structured draft the UI renders and can save straight to
// os_workflows. Grounded only in this tenant's real workers.
//
// POST { messages: [{ role:'user'|'assistant', content }] } (manager+)
//   -> { reply, draft: { name, trigger, steps[] } | null }

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');

const MODEL = 'claude-opus-4-8';

const TRIGGERS = ['manual', 'client_won', 'invoice_overdue', 'lead_created', 'job_completed', 'metric_threshold'];
const STEP_TYPES = ['worker', 'task', 'metric', 'notify', 'approval', 'wait', 'note'];

const SYSTEM = `You are the AI COO inside TMI OS, helping the owner build a cascade: one trigger, then a sequence of steps the OS runs in order across their company. Build it WITH them, conversationally. Ask a short clarifying question only when you truly need it; otherwise propose a draft and refine it as they react.

A cascade has a trigger and steps. Valid triggers:
- manual: the owner runs it themselves
- client_won: a client is won
- invoice_overdue: an invoice goes overdue
- lead_created: a new lead comes in
- job_completed: a job is completed
- metric_threshold: a metric crosses a line

Valid step types (use ONLY these):
- worker: run one of THIS company's existing AI workers. Set "worker_id" to an id from the worker list below. Never invent a worker id; if the right worker does not exist, use a task step that says to create or do it instead.
- task: create a task. { "type":"task", "title":"...", "priority":"normal|high" }
- metric: set a metric. { "type":"metric", "label":"...", "value":"..." }
- notify: notify the owner. { "type":"notify", "text":"..." }
- approval: pause for the owner to approve before continuing. { "type":"approval", "prompt":"..." }
- wait: pause a while. { "type":"wait", "days": <number> }
- note: a plain note. { "type":"note", "text":"..." }

Speak like a sharp, direct operator. Short and specific. No hype, no filler, no emojis, no em dashes. Keep "reply" to one to three sentences.

Return ONLY valid JSON in exactly this shape (no markdown, no prose outside it):
{
  "reply": "your natural-language reply to the owner",
  "draft": {
    "name": "short cascade name",
    "trigger": "one of the valid triggers",
    "steps": [ { "type":"worker", "worker_id":"..." }, { "type":"wait", "days":2 }, { "type":"task", "title":"...", "priority":"normal" } ]
  }
}
Include "draft" whenever you have enough to propose or update one, even a rough first pass. Set "draft" to null ONLY if you genuinely cannot propose anything yet and must ask a question first. Always reflect the owner's latest change in the draft.`;

function normalizeDraft(raw, workers) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').slice(0, 120).trim();
  let trigger = String(raw.trigger || 'manual');
  if (!TRIGGERS.includes(trigger)) trigger = 'manual';
  const validIds = new Set(workers.map(w => String(w.id)));
  const byName = {};
  workers.forEach(w => { byName[String(w.name || '').toLowerCase()] = String(w.id); });

  const steps = (Array.isArray(raw.steps) ? raw.steps : []).slice(0, 20).map((s) => {
    if (!s || typeof s !== 'object') return { type: 'note', text: String(s || '').slice(0, 400) };
    const type = STEP_TYPES.includes(String(s.type)) ? String(s.type) : 'note';
    if (type === 'worker') {
      let id = String(s.worker_id || '');
      if (!validIds.has(id)) id = byName[String(s.worker_name || s.name || '').toLowerCase()] || '';
      if (!id) return { type: 'task', title: String(s.title || s.worker_name || 'Do this step').slice(0, 200), priority: 'normal' };
      return { type: 'worker', worker_id: id };
    }
    if (type === 'task') return { type: 'task', title: String(s.title || '').slice(0, 200), priority: s.priority === 'high' ? 'high' : 'normal' };
    if (type === 'metric') return { type: 'metric', label: String(s.label || '').slice(0, 80), value: String(s.value == null ? '' : s.value).slice(0, 80) };
    if (type === 'notify') return { type: 'notify', text: String(s.text || '').slice(0, 400) };
    if (type === 'approval') return { type: 'approval', prompt: String(s.prompt || 'Approval required').slice(0, 300) };
    if (type === 'wait') return { type: 'wait', until_ms: Math.max(0, Math.round((Number(s.days) || 0) * 86400000)) };
    return { type: 'note', text: String(s.text || '').slice(0, 400) };
  });
  if (!name && !steps.length) return null;
  return { name: name || 'New cascade', trigger, steps };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;
  if (!requireRole(t, res, 'manager')) return;
  const tid = t.tenant_id;

  const raw = Array.isArray(req.body && req.body.messages) ? req.body.messages : [];
  const messages = raw.slice(-16).map(m => ({
    role: m && m.role === 'assistant' ? 'assistant' : 'user',
    content: String((m && m.content) || '').slice(0, 4000),
  })).filter(m => m.content);
  if (!messages.length) return res.status(400).json({ error: 'Say what you want the cascade to do' });

  try {
    const workers = await db.list('os_workers', { where: [['tenant_id', '==', tid]] });
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: key });

    const roster = workers.length
      ? workers.map(w => `- id:${w.id} name:"${w.name}" does:${String(w.job || '').slice(0, 120)}`).join('\n')
      : '(this company has no AI workers yet - use task steps instead of worker steps)';

    const sys = `${SYSTEM}\n\n--- THIS COMPANY'S AI WORKERS (use these ids for worker steps) ---\n${roster}`;
    const msg = await client.messages.create({
      model: MODEL, max_tokens: 1500, system: sys, messages,
    });

    const text = (msg.content || []).map(b => b.text || '').join('').trim();
    const start = text.indexOf('{'), end = text.lastIndexOf('}');
    let parsed = null;
    if (start !== -1 && end !== -1) { try { parsed = JSON.parse(text.slice(start, end + 1)); } catch { parsed = null; } }
    if (!parsed) return res.status(200).json({ reply: text || 'Tell me a bit more about what should happen.', draft: null });

    return res.status(200).json({
      reply: String(parsed.reply || '').trim() || 'Here is a first pass.',
      draft: normalizeDraft(parsed.draft, workers),
    });
  } catch (e) {
    console.error('os2-flowbuild:', e.message);
    return res.status(502).json({ error: 'The COO could not build that right now. Try again in a moment.' });
  }
};

module.exports.config = { maxDuration: 30 };
