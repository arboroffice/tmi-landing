// Capture a rep's field interaction: transcribe the audio (Deepgram), summarize
// it (Claude) into an outcome + next step, and store it as an interaction record.
//   POST { audio: dataURL, lead_id?, duration? } -> { id, transcript, summary, outcome, next_step, sentiment }
const db = require('./_db');
const { cors } = require('./_auth');
const { requireRep } = require('./_rep-auth');

const MAX = 4 * 1024 * 1024; // ~4MB data URL cap (Vercel body limit ~4.5MB); opus fits ~15 min

// Summarize a field-visit transcript into a structured recap. Never throws.
async function summarize(transcript) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !transcript || transcript.trim().length < 20) return null;
  const prompt = `You are a sales assistant. A field rep just recorded a visit or call with a prospect (an industrial/trades business owner). From the transcript, return STRICT JSON only, no prose, with keys:
"summary" (2-3 sentence recap),
"outcome" (one of: "booked","interested","follow_up","not_interested","no_decision"),
"next_step" (one short imperative sentence, or ""),
"sentiment" (one of: "positive","neutral","negative").
Transcript:
"""${transcript.slice(0, 6000)}"""`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) { console.error('summarize', r.status); return null; }
    const data = await r.json();
    let txt = (data && data.content && data.content[0] && data.content[0].text) || '';
    const jm = txt.match(/\{[\s\S]*\}/);
    if (!jm) return null;
    const o = JSON.parse(jm[0]);
    return {
      summary: String(o.summary || '').slice(0, 800),
      outcome: String(o.outcome || '').slice(0, 40),
      next_step: String(o.next_step || '').slice(0, 300),
      sentiment: String(o.sentiment || '').slice(0, 20),
    };
  } catch (e) { console.error('summarize err', e.message); return null; }
}

// Extract structured lead fields from a spoken "new lead" note. Never throws.
async function extractLead(transcript) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !transcript || transcript.trim().length < 6) return null;
  const prompt = `A field sales rep spoke a quick note to create a new lead. From the note, return STRICT JSON only, no prose, with keys: "business_name","contact_name","phone","industry","status" (one of: new,attempted,contacted,booked,callback,not_interested,won,lost — default "new"),"notes". Use "" for anything not mentioned.
Note:
"""${transcript.slice(0, 2000)}"""`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) { console.error('extractLead', r.status); return null; }
    const data = await r.json();
    const txt = (data && data.content && data.content[0] && data.content[0].text) || '';
    const jm = txt.match(/\{[\s\S]*\}/); if (!jm) return null;
    const o = JSON.parse(jm[0]);
    const STAT = ['new', 'attempted', 'contacted', 'booked', 'callback', 'not_interested', 'won', 'lost'];
    return {
      business_name: String(o.business_name || '').slice(0, 120),
      contact_name: String(o.contact_name || '').slice(0, 80),
      phone: String(o.phone || '').slice(0, 40),
      industry: String(o.industry || '').slice(0, 60),
      status: STAT.includes(o.status) ? o.status : 'new',
      notes: String(o.notes || '').slice(0, 600),
    };
  } catch (e) { console.error('extractLead err', e.message); return null; }
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  const rep = await requireRep(req, res); if (!rep) return;

  const b = req.body || {};
  const audio = b.audio;
  if (!audio || typeof audio !== 'string' || !audio.startsWith('data:')) {
    return res.status(400).json({ error: 'A base64 audio data URL is required' });
  }
  if (audio.length > MAX) return res.status(413).json({ error: 'Recording too long for one upload. Keep it under about 15 minutes.' });

  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return res.status(503).json({ error: 'Transcription is not configured (DEEPGRAM_API_KEY missing)' });

  const m = audio.match(/^data:([^;]+)(?:;[^,]*)?;base64,(.*)$/s);
  if (!m) return res.status(400).json({ error: 'Audio must be a base64 data URL' });
  const mime = m[1] || 'audio/webm';
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length) return res.status(400).json({ error: 'Empty audio' });

  let transcript = '';
  try {
    const dg = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true', {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'Content-Type': mime },
      body: buf,
    });
    if (!dg.ok) {
      const t = await dg.text().catch(() => '');
      console.error('deepgram', dg.status, t.slice(0, 200));
      return res.status(502).json({ error: 'Transcription failed', status: dg.status });
    }
    const data = await dg.json();
    transcript = (data && data.results && data.results.channels && data.results.channels[0]
      && data.results.channels[0].alternatives && data.results.channels[0].alternatives[0]
      && data.results.channels[0].alternatives[0].transcript) || '';
  } catch (e) {
    console.error('transcribe fetch:', e.message);
    return res.status(500).json({ error: e.message });
  }

  // Voice-to-lead: extract structured fields instead of an interaction recap.
  if (b.intent === 'new_lead') {
    const lead = await extractLead(transcript);
    return res.json({ transcript, lead });
  }

  // Summarize into an outcome + next step (best-effort; never blocks the transcript).
  const recap = await summarize(transcript);

  // Store the interaction (transcript + AI recap; not the raw audio). Return it
  // even if the save fails so the rep never loses their note.
  const payload = {
    rep_id: rep.sub, lead_id: b.lead_id || null,
    transcript, duration: Number(b.duration) || null,
    summary: recap ? recap.summary : null,
    outcome: recap ? recap.outcome : null,
    next_step: recap ? recap.next_step : null,
    sentiment: recap ? recap.sentiment : null,
    created_at: new Date().toISOString(),
  };
  try {
    const rec = await db.insert('rep_interactions', payload);
    return res.json({ id: rec.id, transcript, summary: payload.summary, outcome: payload.outcome, next_step: payload.next_step, sentiment: payload.sentiment, created_at: rec.created_at });
  } catch (e) {
    return res.json({ transcript, summary: payload.summary, outcome: payload.outcome, next_step: payload.next_step, sentiment: payload.sentiment, saved: false, error: e.message });
  }
};

module.exports.config = { maxDuration: 60 };
