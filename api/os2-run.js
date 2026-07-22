// TMI OS — run a worker. The worker actually does its job: Claude produces the
// real, ready-to-use work product (the draft message, the summary, the list,
// the estimate) grounded ONLY in this tenant's knowledge and context. The
// output lands in the tenant's inbox. Workers whose autonomy is "approve" leave
// their output "pending" for the owner to approve; "read" and "auto" workers
// mark it "done". Scoped to the caller's tenant_id.
//
// POST { id } -> { output }

const db = require('./_db');
const { requireTenant, cors } = require('./_tenant-auth');

const MODEL = 'claude-opus-4-8';

const SYSTEM = `You are an AI worker inside a company's TMI OS. You will be given your role and the company's context. Do the job now and produce the actual, ready-to-use work product: the real message, list, summary, estimate, or draft, not a description of what you would do. Ground everything only in the company's knowledge and context. If a live data source is missing, produce the best draft from what is known and briefly note the assumption in one line. No preamble, no emojis, no em dashes.

Return ONLY valid JSON: {"title":"short label of what you produced","body":"the actual work product, ready to use"}`;

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;

  const id = String((req.body && req.body.id) || '');
  if (!id) return res.status(400).json({ error: 'Worker id required' });
  const tid = t.tenant_id;

  try {
    const worker = await db.getById('os_workers', id);
    if (!worker || worker.tenant_id !== tid) return res.status(404).json({ error: 'Worker not found' });

    const w = [['tenant_id', '==', tid]];
    const [tenant, knowledge, metrics, tasks] = await Promise.all([
      db.getById('os_tenants', tid),
      db.list('os_knowledge', { where: w }),
      db.list('os_metrics', { where: w }),
      db.list('os_tasks', { where: w }),
    ]);

    const product = await produce(tenant, worker, { knowledge, metrics, tasks });
    const status = worker.autonomy === 'approve' ? 'pending' : 'done';

    const output = await db.insert('os_outputs', {
      tenant_id: tid, worker_id: id, worker_name: worker.name,
      title: product.title, body: product.body, status,
      created_at: new Date().toISOString(),
    });
    await db.update('os_workers', id, { last_run: new Date().toISOString() });
    await db.insert('os_build_log', {
      tenant_id: tid, kind: 'run',
      summary: `${worker.name} produced: ${product.title}${status === 'pending' ? ' (needs approval)' : ''}.`,
      created_at: new Date().toISOString(),
    });
    return res.status(200).json({ output });
  } catch (e) {
    console.error('os2-run:', e.message);
    return res.status(502).json({ error: 'The worker could not finish. Try again in a moment.' });
  }
};

async function produce(tenant, worker, s) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });

  const p = tenant.profile || {};
  const know = s.knowledge.map(k => `- [${k.kind || 'note'}] ${k.title}: ${String(k.body || '').slice(0, 600)}`).join('\n') || '- none yet';
  const met = s.metrics.map(m => `- ${m.label}: ${m.value || '-'}${m.unit ? ' ' + m.unit : ''}`).join('\n') || '- none yet';
  const tk = s.tasks.filter(x => x.status !== 'done').map(x => `- ${x.title}`).join('\n') || '- none';

  const userMsg =
    `YOUR ROLE: ${worker.name}\n` +
    `WHAT YOU DO: ${worker.job}\n` +
    `HOW OFTEN: ${worker.cadence}\n\n` +
    `--- COMPANY CONTEXT ---\n` +
    `Company: ${tenant.name}${tenant.business_type ? ' (' + tenant.business_type + ')' : ''}\n` +
    `What they do: ${p.what_you_do || tenant.summary || 'unspecified'}\n` +
    `Known leaks: ${p.what_falls_through || 'unspecified'}\n` +
    `Tools: ${p.tools || 'unspecified'}\n\n` +
    `COMPANY KNOWLEDGE:\n${know}\n\nCURRENT METRICS:\n${met}\n\nOPEN TASKS:\n${tk}`;

  const msg = await client.messages.create({
    model: MODEL, max_tokens: 1600, system: SYSTEM,
    messages: [{ role: 'user', content: userMsg }],
  });

  const text = (msg.content || []).map(b => b.text || '').join('').trim();
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  let raw = {};
  if (start !== -1 && end !== -1) { try { raw = JSON.parse(text.slice(start, end + 1)); } catch { raw = {}; } }
  return {
    title: String(raw.title || `${worker.name} output`).slice(0, 120),
    body: String(raw.body || text || 'No output produced.').slice(0, 12000),
  };
}
