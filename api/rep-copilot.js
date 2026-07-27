// City-lead rep copilot. Drafts the next outreach for one specific lead, grounded
// in that lead's status, industry, notes, and recorded interaction history, so it
// beats the generic templates: it knows where this conversation actually stands.
// The rep sends it from their own phone (the app opens Messages) and every attempt
// is still logged. Scoped to the rep in the token.
//
//   POST { action:'draft', lead_id, kind } -> { body }
//     kind: 'text' (default) | 'call' | 'email'

const db = require('./_db');
const { cors } = require('./_auth');
const { requireRep } = require('./_rep-auth');

const MODEL = 'claude-haiku-4-5-20251001'; // matches the rep subsystem: fast on mobile in the field

const KIND = {
  text: 'a short SMS the rep will send from their phone, under 320 characters, warm and direct, one clear ask',
  call: 'a 4 to 6 line call opener the rep can read out loud, natural and conversational, that gets to the point fast',
  email: 'a short email (2 short paragraphs plus a one-line ask), professional but human',
};

async function draft(rep, lead, history, kind) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const nm = (lead.contact_name || '').split(' ')[0] || 'there';
  const co = lead.business_name || 'your business';
  const ind = lead.industry || 'operations';
  const repName = (rep.name || 'the TMI team').split(' ')[0] || 'the TMI team';

  const fallback = `Hi ${nm}, this is ${repName} with TMI. We help ${ind} run tighter with less chaos and full visibility. We do an Intelligent Company Audit that maps exactly where ${co} leaks time and money, then builds the fix. Worth a short conversation?`;
  if (!apiKey) return fallback;

  const hist = history.length
    ? history.map((h, i) => `${i + 1}. ${String(h).slice(0, 200)}`).join('\n')
    : 'No prior contact logged.';

  const prompt = `You are the outreach copilot for a TMI field rep who door-knocks industrial and trades business owners and pitches the Intelligent Company Audit, a paid engagement that maps the operation, scores it, and lays out a 30-day plan, and whose fee credits toward the build. You are not closing the sale on the spot, you are earning a short call with the owner. Do not lead with the price. Only if the owner asks or is clearly interested, share that the audit is $5,000 and credits in full toward the build.

Write ${KIND[kind] || KIND.text} for this specific lead. Ground it in where the conversation actually stands. Do not repeat an opener if they have already been contacted; move it forward. No hype, no emojis, no em dashes, plain dashes only. Sign as ${repName} when a sign-off fits.

Lead: ${co}${lead.contact_name ? ', contact ' + lead.contact_name : ''}
Industry: ${ind}
Pipeline status: ${lead.status || 'new'}
Notes: ${lead.notes ? String(lead.notes).slice(0, 500) : 'none'}
Interaction history (newest first):
${hist}

Return STRICT JSON only: {"body":"the message, ready to send"}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) return fallback;
    const data = await r.json();
    const txt = (data && data.content && data.content[0] && data.content[0].text) || '';
    const jm = txt.match(/\{[\s\S]*\}/);
    if (jm) { try { const o = JSON.parse(jm[0]); if (o.body) return String(o.body).slice(0, 1200).replace(/—/g, '-'); } catch {} }
    return String(txt || fallback).slice(0, 1200).replace(/—/g, '-');
  } catch { return fallback; }
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const rep = await requireRep(req, res); if (!rep) return;

  const b = req.body || {};
  const action = String(b.action || 'draft');
  try {
    if (action === 'draft') {
      const lead = await db.getById('rep_leads', String(b.lead_id || ''));
      if (!lead || lead.rep_id !== rep.sub) return res.status(404).json({ error: 'Lead not found' });
      const kind = ['text', 'call', 'email'].includes(b.kind) ? b.kind : 'text';

      const inter = await db.list('rep_interactions', { where: [['rep_id', '==', rep.sub]], order: 'created_at', ascending: false, limit: 100 }).catch(() => []);
      const history = (inter || [])
        .filter((x) => x.lead_id === lead.id && (x.summary || x.transcript))
        .slice(0, 6)
        .map((x) => `${x.channel || 'note'}: ${x.summary || x.transcript}`);

      const repProfile = await db.getById('reps', rep.sub).catch(() => null);
      const body = await draft(repProfile || { name: rep.name }, lead, history, kind);
      return res.json({ body, kind });
    }
    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('rep-copilot:', e.message);
    return res.status(500).json({ error: e.message });
  }
};

module.exports.config = { maxDuration: 30 };
