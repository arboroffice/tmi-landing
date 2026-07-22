// TMI OS — the AI COO. Answers the owner's questions and produces the morning
// briefing, grounded ONLY in this tenant's OS state (command center metrics,
// AI workers, workflows, recent activity). Scoped to the caller's tenant_id so
// one company can never see another's data.
//
// POST { question?, mode? }  mode: 'ask' (default) | 'briefing'
//   -> { answer }

const db = require('./_db');
const { requireTenant, cors } = require('./_tenant-auth');

const MODEL = 'claude-opus-4-8';

const SYSTEM = `You are the AI COO inside TMI OS for the company described below. You speak for their operating system: you can see their command center metrics, their AI workers, their workflows, and the recent build activity, and nothing else.

Answer like a sharp, direct operator talking to the owner. Short and specific. No hype, no filler, no emojis, no em dashes. Two to five sentences unless the owner clearly asks for more. If the honest answer is that a number is not connected yet, say exactly what to connect to get it, and never invent a figure. Never claim a worker did something the activity feed does not show. When the metric values are still "-", it means no live data source is connected yet: say so plainly and point to what to wire in first.`;

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;

  const tid = t.tenant_id;
  const mode = (req.body && req.body.mode) === 'briefing' ? 'briefing' : 'ask';
  const question = String((req.body && req.body.question) || '').trim().slice(0, 1000);
  if (mode === 'ask' && !question) return res.status(400).json({ error: 'Ask a question' });

  try {
    const [tenant, metrics, workers, workflows, log] = await Promise.all([
      db.getById('os_tenants', tid),
      db.list('os_metrics', { where: [['tenant_id', '==', tid]] }),
      db.list('os_workers', { where: [['tenant_id', '==', tid]] }),
      db.list('os_workflows', { where: [['tenant_id', '==', tid]] }),
      db.list('os_build_log', { where: [['tenant_id', '==', tid]], order: 'created_at', ascending: false, limit: 8 }),
    ]);
    if (!tenant) return res.status(404).json({ error: 'Company not found' });

    const answer = await ask(tenant, metrics, workers, workflows, log, mode, question);
    return res.status(200).json({ answer });
  } catch (e) {
    console.error('os2-ask:', e.message);
    return res.status(502).json({ error: 'The COO could not answer right now. Try again in a moment.' });
  }
};

function context(tenant, metrics, workers, workflows, log) {
  const p = tenant.profile || {};
  const bySort = (a, b) => (a.sort || 0) - (b.sort || 0);
  const m = metrics.sort(bySort).map(x => `- ${x.label}: ${x.value || '-'}${x.unit ? ' ' + x.unit : ''}${x.hint ? ` (${x.hint})` : ''}`).join('\n') || '- none yet';
  const w = workers.sort(bySort).map(x => `- ${x.name} [${x.status || 'ready'}, ${x.autonomy}, ${x.cadence}]: ${x.job}`).join('\n') || '- none yet';
  const f = workflows.sort(bySort).map(x => `- ${x.name} (when: ${x.trigger}): ${(x.steps || []).join(' -> ')}`).join('\n') || '- none yet';
  const a = log.map(x => `- ${x.summary}`).join('\n') || '- nothing yet';
  return `COMPANY: ${tenant.name}${tenant.business_type ? ' (' + tenant.business_type + ')' : ''}
WHAT THEY DO: ${p.what_you_do || tenant.summary || 'unspecified'}
WANTS TO SEE DAILY: ${p.what_you_track || 'unspecified'}
KNOWN LEAKS: ${p.what_falls_through || 'unspecified'}
TOOLS: ${p.tools || 'unspecified'}
BIGGEST BOTTLENECK: ${p.bottleneck || 'unspecified'}

COMMAND CENTER METRICS:
${m}

AI WORKERS:
${w}

WORKFLOWS:
${f}

RECENT ACTIVITY:
${a}`;
}

async function ask(tenant, metrics, workers, workflows, log, mode, question) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });

  const ctx = context(tenant, metrics, workers, workflows, log);
  const task = mode === 'briefing'
    ? 'Give the owner a short morning briefing: the one or two things that most need their attention today, based only on the OS state below. If there is not enough live data connected yet, tell them the single most valuable thing to connect first. Three sentences maximum.'
    : `The owner asks: "${question}"`;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 700,
    system: SYSTEM,
    messages: [{ role: 'user', content: `${task}\n\n--- THIS COMPANY'S OS STATE ---\n${ctx}` }],
  });

  return (msg.content || []).map(b => b.text || '').join('').trim();
}
