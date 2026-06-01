const { getSupabase } = require('./_supabase');
const { verifyToken, cors } = require('./_auth');

// Ops Machine — Fathom -> Claude meeting ingestion.
// Accepts a transcript, asks Claude to extract a structured Level 10 digest
// (summary, wins, issues/IDS, scorecard updates, initiative updates, action
// items), stores it on os_meetings, and returns the digest for review-and-apply
// in the Level 10 tab. Does NOT auto-write to the board — the UI applies
// accepted items via the individual os-* endpoints.
//
// Auth: either a valid admin JWT (manual paste from the UI) OR a matching
// x-fathom-secret header (Fathom webhook).

const EXTRACT_SYSTEM = `You are the operations analyst for TMI, an agency that builds custom AI operating systems for physical-economy and online businesses. You read a leadership or advisor meeting transcript and extract a structured digest for an EOS/Traction "Level 10" dashboard.

Return ONLY valid JSON (no markdown, no prose) matching exactly this shape:
{
  "summary": "2-4 sentence recap",
  "wins": ["short win statement", ...],
  "issues": [{"title": "issue or opportunity", "notes": "optional context"}],
  "scorecard_updates": [{"metric": "metric name as discussed", "value": number}],
  "initiative_updates": [{"title": "initiative name", "status": "on-track|behind|done", "progress": number, "notes": "optional"}],
  "action_items": [{"title": "task", "owner": "name or null", "level": "week"}]
}
Keep items concise and operational. Omit arrays you cannot populate by returning them empty. Never invent numbers that were not stated.`;

async function callClaude(transcript) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: [{ type: 'text', text: EXTRACT_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Meeting transcript:\n\n${transcript}` }]
    })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Claude API ${r.status}: ${t.slice(0, 300)}`);
  }
  const json = await r.json();
  const text = (json.content || []).map(b => b.text || '').join('').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON in Claude response');
  return JSON.parse(text.slice(start, end + 1));
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth: admin JWT or Fathom webhook secret
  const isAdmin = !!verifyToken(req);
  const secret = req.headers['x-fathom-secret'];
  const isWebhook = secret && secret === process.env.FATHOM_WEBHOOK_SECRET;
  if (!isAdmin && !isWebhook) return res.status(401).json({ error: 'Unauthorized' });

  const body = req.body || {};
  // Fathom payloads vary; accept several common transcript field names.
  const transcript = body.transcript || body.text || body.transcript_text || body.recording?.transcript || '';
  const title = body.title || body.meeting_title || body.recording?.title || 'Meeting';
  const source = isWebhook ? 'fathom' : (body.source || 'manual');
  if (!transcript || transcript.length < 40) return res.status(400).json({ error: 'transcript required' });

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  let extracted;
  try {
    extracted = await callClaude(transcript);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }

  const { data, error } = await db.from('os_meetings').insert({
    title,
    source,
    transcript,
    summary: extracted.summary || null,
    extracted,
    met_on: new Date().toISOString().slice(0, 10),
    processed_at: new Date().toISOString()
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });

  return res.status(201).json({ meeting_id: data.id, extracted });
};
