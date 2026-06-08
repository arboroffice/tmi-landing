const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

// AI-drafted personalized first-touch for an identified visitor (Claude).
// POST { id }. Stores the draft on site_visitors.ai_intro and returns it.
// Enrollment uses ai_intro as the day-0 email body when present.
// Needs ANTHROPIC_API_KEY (already set). Model via ANTHROPIC_MODEL (default Haiku 4.5).

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not set' });

  const id = req.body && req.body.id;
  if (!id) return res.status(400).json({ error: 'id required' });

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  const { data: v, error } = await db.from('site_visitors').select('*').eq('id', id).single();
  if (error || !v) return res.status(404).json({ error: 'Visitor not found' });

  const firstName = v.first_name || 'there';
  const ctx = [
    `First name: ${firstName}`,
    v.title && `Title: ${v.title}`,
    v.company && `Company: ${v.company}`,
    v.industry && `Industry: ${v.industry}`,
    v.company_size && `Company size: ${v.company_size}`,
    v.last_page && `Page they viewed: ${v.last_page}`,
  ].filter(Boolean).join('\n');

  const system = "You write short, direct first-touch B2B emails in TMI's voice: blunt, concrete, written for operators and owners of field-service / construction / industrial businesses. No hype, no 'leverage AI', no em dashes, no exclamation points. TMI builds AI infrastructure for field operations (dispatch, job status, the numbers) so the business runs on systems instead of on people.";
  const prompt = `Write the BODY ONLY of a first cold email to this person who recently visited tmi-technology.com. Do not include a subject line, a greeting, or a signature - those are added separately. 2 to 3 very short paragraphs, about 70 words total. Make it specific to their company and industry where possible, and end by inviting a 20-minute call. Plain text, no markdown.\n\n${ctx}`;

  let draft;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, system, messages: [{ role: 'user', content: prompt }] }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: 'Anthropic error', body: json });
    draft = (json.content && json.content[0] && json.content[0].text || '').trim();
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
  if (!draft) return res.status(502).json({ error: 'Empty draft' });

  await db.from('site_visitors').update({ ai_intro: draft }).eq('id', id);
  return res.json({ ok: true, ai_intro: draft });
};
