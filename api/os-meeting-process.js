const { getSupabase } = require('./_supabase');
const { cors } = require('./_auth');
const { extractFromTranscript } = require('./_osclaude');

// Ops Machine — async meeting processor. Invoked by QStash (or any trusted
// caller) to run the Claude extraction off the request path so webhooks return
// instantly. Guarded by a shared internal secret set when the job is enqueued.
// Body: { meeting_id }
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = req.headers['x-internal-secret'];
  const expected = process.env.FATHOM_WEBHOOK_SECRET || process.env.OPS_INTERNAL_SECRET;
  if (!expected || secret !== expected) return res.status(401).json({ error: 'Unauthorized' });

  const { meeting_id } = req.body || {};
  if (!meeting_id) return res.status(400).json({ error: 'meeting_id required' });

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  const { data: meeting, error: loadErr } = await db
    .from('os_meetings').select('id, transcript').eq('id', meeting_id).single();
  if (loadErr) return res.status(404).json({ error: 'meeting not found' });

  let extracted;
  try {
    extracted = await extractFromTranscript(meeting.transcript || '');
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }

  const { error } = await db.from('os_meetings').update({
    summary: extracted.summary || null,
    extracted,
    processed_at: new Date().toISOString()
  }).eq('id', meeting_id);
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true, meeting_id, extracted });
};
