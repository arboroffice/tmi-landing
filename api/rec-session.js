// Resilient recording sessions (admin-only). Records any interaction so that
// nothing is lost if the phone dies mid-recording: the client rolls the audio
// into short complete segments, uploads each to Firebase Storage as it is
// captured, and calls this endpoint to transcribe it (Deepgram) and append the
// text to the session. So the server always holds every segment + transcript up
// to the last moment before a crash, and a session can be recovered/resumed.
//
// Actions (POST body.action):
//   'start'    { entity?, title?, sales_stage? }            -> { id }
//   'segment'  { session_id, seq, path, mime, duration? }   -> { seq, text, transcript }
//   'stop'     { session_id, duration_sec? }                -> session (recovers any untranscribed segments first)
//   'recover'  { session_id }                               -> session (transcribe stored segments missing text)
// GET ?session_id=   -> one session
// GET               -> recent sessions

const db = require('./_db');
const storage = require('./_storage');
const { requireAuth, cors } = require('./_auth');

const COLL = 'recording_sessions';

async function transcribe(path, mime) {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return { text: '', error: 'DEEPGRAM_API_KEY missing' };
  let buf;
  try { [buf] = await storage.bucket().file(path).download(); }
  catch (e) { return { text: '', error: 'segment not in storage: ' + e.message }; }
  if (!buf || !buf.length) return { text: '', error: 'empty segment' };
  try {
    const dg = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true', {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'Content-Type': mime || 'audio/webm' },
      body: buf,
    });
    if (!dg.ok) return { text: '', error: 'deepgram ' + dg.status };
    const data = await dg.json();
    const alt = data && data.results && data.results.channels && data.results.channels[0]
      && data.results.channels[0].alternatives && data.results.channels[0].alternatives[0];
    return { text: (alt && alt.transcript) || '' };
  } catch (e) { return { text: '', error: e.message }; }
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      if (req.query.session_id) {
        const s = await db.getById(COLL, req.query.session_id);
        if (!s) return res.status(404).json({ error: 'session not found' });
        return res.json(s);
      }
      const rows = await db.list(COLL, { order: 'started_at', ascending: false, limit: 30 });
      return res.json(rows || []);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
    const b = req.body || {};

    if (b.action === 'start') {
      const s = await db.insert(COLL, {
        status: 'recording',
        started_at: new Date().toISOString(),
        entity: b.entity || null,        // { type, id, company, label }
        title: b.title || null,
        sales_stage: b.sales_stage || null,
        transcript: '',
        segments: [],                    // [{ seq, path, mime, duration, text, at }]
        duration_sec: 0,
      });
      return res.json({ id: s.id, storage_folder: `recordings/${s.id}` });
    }

    if (b.action === 'segment') {
      const { session_id, seq, path, mime, duration } = b;
      if (!session_id || path == null || seq == null) return res.status(400).json({ error: 'session_id, seq, path required' });
      const s = await db.getById(COLL, session_id);
      if (!s) return res.status(404).json({ error: 'session not found' });
      const { text, error } = await transcribe(path, mime);
      const seg = { seq, path, mime: mime || 'audio/webm', duration: duration || null, text: text || '', error: error || null, at: new Date().toISOString() };
      const segments = [...(s.segments || []).filter(x => x.seq !== seq), seg].sort((a, c) => a.seq - c.seq);
      const transcript = segments.map(x => x.text).filter(Boolean).join(' ').trim();
      await db.update(COLL, session_id, { segments, transcript, duration_sec: (s.duration_sec || 0) + (duration || 0) });
      return res.json({ seq, text: seg.text, transcript });
    }

    if (b.action === 'recover' || b.action === 'stop') {
      const s = await db.getById(COLL, b.session_id);
      if (!s) return res.status(404).json({ error: 'session not found' });
      // Transcribe any stored segment that never got its text (phone died between
      // upload and transcribe, or a transient Deepgram failure).
      const segments = [...(s.segments || [])];
      let changed = false;
      for (const seg of segments) {
        if (!seg.text && seg.path) {
          const { text } = await transcribe(seg.path, seg.mime);
          if (text) { seg.text = text; seg.error = null; changed = true; }
        }
      }
      const transcript = segments.map(x => x.text).filter(Boolean).join(' ').trim();
      const patch = { segments, transcript };
      if (b.action === 'stop') { patch.status = 'done'; patch.ended_at = new Date().toISOString(); if (b.duration_sec) patch.duration_sec = b.duration_sec; }
      if (changed || b.action === 'stop') await db.update(COLL, b.session_id, patch);
      return res.json({ ...s, ...patch });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

module.exports.config = { maxDuration: 60 };
