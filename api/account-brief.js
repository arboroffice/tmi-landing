const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

// Living company brief — Claude reads everything known about an account (audit,
// every recorded meeting's knowledge, activity, comms) and writes a single
// rolling brief the team can read in 30 seconds. Persisted on the lead/client
// doc as `brief` + `brief_at` so it surfaces everywhere the account appears.
//
// POST /api/account-brief  { type: 'lead'|'client', id }

const SYSTEM = `You are the chief of staff at TMI, an agency that builds intelligent operating systems for trades, field service, construction, energy, and industrial companies. You keep a living brief on every account so anyone on the team can walk into the next conversation fully caught up.

You are handed structured knowledge about ONE account: who they are, their audit results, and the knowledge extracted from every sales call recorded with them. Write a tight, current brief.

VOICE: Direct. No hedging. Write for operators, not tech people. Real specifics from the data, never filler. Short blunt sentences. Never use em dashes. Never write "leverage", "optimize", "synergy", "streamline", "robust", "seamless". Do not hype "AI" — say "the system" or "a digital worker".

Return ONLY valid JSON (no markdown), exactly this shape:
{
  "headline": "one line: who they are and where the deal stands",
  "summary": "3-5 sentences a rep reads before the next call",
  "what_we_know": ["durable facts about how this company operates"],
  "pains": ["their most important operational pains"],
  "where_it_stands": "one blunt sentence on the real state of the relationship",
  "next_best_action": "the single highest-leverage next move with this account"
}
Use empty arrays for anything genuinely unknown. Never invent facts or numbers.`;

async function callClaude(user) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured in Vercel env');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1800,
      system: SYSTEM,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error?.message || `Claude API ${r.status}`);
  }
  const data = await r.json();
  const text = (data.content || []).map(b => b.text || '').join('').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Could not parse JSON from Claude');
  return JSON.parse(text.slice(start, end + 1));
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, id } = req.body || {};
  if (!type || !id || !['lead', 'client'].includes(type)) {
    return res.status(400).json({ error: 'type (lead|client) and id required' });
  }
  const coll = type === 'client' ? 'clients' : 'leads';

  let anchor;
  try {
    anchor = await db.getById(coll, id);
    if (!anchor) return res.status(404).json({ error: 'account not found' });
    await db.hydrateOne(anchor, 'contact_id', 'contacts', 'contacts');
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const c = anchor.contacts || {};
  const key = type === 'lead' ? 'lead_id' : 'client_id';

  const [meetings, audits] = await Promise.all([
    db.list('sales_meetings', { where: [[key, '==', id]], order: 'created_at', ascending: false }).catch(() => []),
    type === 'lead'
      ? db.list('audit_submissions', { where: [['lead_id', '==', id]], order: 'created_at', ascending: false }).catch(() => [])
      : Promise.resolve([]),
  ]);

  // Build a compact, readable brief input for Claude.
  const lines = [];
  lines.push('ACCOUNT');
  lines.push(`Name: ${[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}`);
  if (c.company) lines.push(`Company: ${c.company}`);
  if (c.email) lines.push(`Email: ${c.email}`);
  if (anchor.status) lines.push(`Status: ${anchor.status}`);
  if (c.niche || c.audience) lines.push(`Segment: ${[c.audience, c.niche].filter(Boolean).join(' / ')}`);
  lines.push(`Account type: ${type}`);

  const a = audits[0];
  if (a) {
    lines.push('\nAUDIT RESULT');
    lines.push(`Tier: ${a.tier || '—'} · Dependency: ${typeof a.dep_pct === 'number' ? a.dep_pct + '%' : '—'} · Industry: ${a.industry || '—'}`);
    if (a.worst_cat) lines.push(`Worst area: ${a.worst_cat}${a.second_cat ? ', then ' + a.second_cat : ''}`);
  }

  if (meetings.length) {
    lines.push(`\nRECORDED MEETINGS (${meetings.length}, newest first)`);
    for (const m of meetings.slice(0, 8)) {
      lines.push(`\n# ${m.title || 'Sales call'} — ${m.sales_stage || 'stage n/a'} — ${(m.created_at || '').slice(0, 10)}`);
      const k = m.knowledge;
      if (k) {
        if (k.summary) lines.push(`Summary: ${k.summary}`);
        if (k.company_facts?.length) lines.push(`Facts: ${k.company_facts.join('; ')}`);
        if (k.pains?.length) lines.push(`Pains: ${k.pains.join('; ')}`);
        if (k.objections?.length) lines.push(`Objections: ${k.objections.join('; ')}`);
        if (k.buying_signals?.length) lines.push(`Buying signals: ${k.buying_signals.join('; ')}`);
        if (k.next_steps?.length) lines.push(`Next steps: ${k.next_steps.map(s => (s.action || s) + (s.owner ? ` (${s.owner})` : '')).join('; ')}`);
      } else if (m.transcript) {
        lines.push(`Transcript excerpt: ${String(m.transcript).slice(0, 800)}`);
      }
    }
  }

  if (!a && !meetings.length) {
    lines.push('\nNo audit or recorded meetings yet. Write a brief from the basic account facts and flag that discovery is needed.');
  }

  lines.push('\nWrite the living brief for this account. Return only the JSON.');

  let brief;
  try {
    brief = await callClaude(lines.join('\n'));
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }

  const brief_at = new Date().toISOString();
  try {
    await db.update(coll, id, { brief, brief_at });
  } catch (e) {
    return res.status(200).json({ ok: true, brief, brief_at, saved: false, save_error: e.message });
  }

  return res.status(200).json({ ok: true, brief, brief_at, saved: true });
};
