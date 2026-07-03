// Transcribe a rep's voice note with Deepgram, save the transcript (text, not the
// raw audio), and return it so the portal can drop it into the lead's notes.
//   POST { audio: dataURL, lead_id?, duration? } -> { id, transcript }
const db = require('./_db');
const { cors } = require('./_auth');
const { requireRep } = require('./_rep-auth');

const MAX = 4 * 1024 * 1024; // ~4MB data URL cap (Vercel body limit ~4.5MB)

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
  if (audio.length > MAX) return res.status(413).json({ error: 'Recording too long. Keep voice notes under about 2 minutes.' });

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

  // Store the transcript only (small, searchable). Return it even if the save fails.
  try {
    const note = await db.insert('rep_voice_notes', {
      rep_id: rep.sub, lead_id: b.lead_id || null,
      transcript, duration: Number(b.duration) || null,
      created_at: new Date().toISOString(),
    });
    return res.json({ id: note.id, transcript, created_at: note.created_at });
  } catch (e) {
    return res.json({ transcript, saved: false, error: e.message });
  }
};

module.exports.config = { maxDuration: 30 };
