const db = require('./_db');
const { verifyToken, cors } = require('./_auth');
const { extractFromTranscript } = require('./_osclaude');

// Ops Machine — Fathom -> Claude meeting ingestion.
//
// Manual paste (admin JWT): runs Claude synchronously and returns the digest so
// the Level 10 tab can show it immediately for review-and-apply.
//
// Fathom webhook (x-fathom-secret): stores the transcript and hands off to the
// async processor via QStash, returning 202 instantly. Falls back to inline
// processing if QStash isn't configured. Does NOT auto-write to the board — the
// digest is reviewed/applied from the Level 10 meeting history.

async function enqueueProcess(meetingId, secret) {
  const token = process.env.QSTASH_TOKEN;
  const base = process.env.OPS_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!token || !base) throw new Error('QStash not configured');
  const { Client } = require('@upstash/qstash');
  const qstash = new Client({ token });
  await qstash.publishJSON({
    url: `${base}/api/os-meeting-process`,
    body: { meeting_id: meetingId },
    headers: { 'x-internal-secret': secret }
  });
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const isAdmin = !!verifyToken(req);
  const secret = req.headers['x-fathom-secret'];
  const expectedSecret = process.env.FATHOM_WEBHOOK_SECRET;
  const isWebhook = expectedSecret && secret === expectedSecret;
  if (!isAdmin && !isWebhook) return res.status(401).json({ error: 'Unauthorized' });

  const body = req.body || {};
  const transcript = body.transcript || body.text || body.transcript_text || body.recording?.transcript || '';
  const title = body.title || body.meeting_title || body.recording?.title || 'Meeting';
  const source = isWebhook ? 'fathom' : (body.source || 'manual');
  if (!transcript || transcript.length < 40) return res.status(400).json({ error: 'transcript required' });

  const today = new Date().toISOString().slice(0, 10);

  // Webhook path: store first, process async.
  if (isWebhook) {
    let data;
    try {
      data = await db.insert('os_meetings', { title, source, transcript, met_on: today });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
    try {
      await enqueueProcess(data.id, expectedSecret);
      return res.status(202).json({ meeting_id: data.id, queued: true });
    } catch {
      // Fallback: process inline so nothing is lost when QStash isn't set up.
      try {
        const extracted = await extractFromTranscript(transcript);
        await db.update('os_meetings', data.id, { summary: extracted.summary || null, extracted, processed_at: new Date().toISOString() });
        return res.status(201).json({ meeting_id: data.id, extracted });
      } catch (e) {
        return res.status(502).json({ error: e.message, meeting_id: data.id });
      }
    }
  }

  // Manual paste path: synchronous so the UI gets the digest back.
  let extracted;
  try {
    extracted = await extractFromTranscript(transcript);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
  let data;
  try {
    data = await db.insert('os_meetings', {
      title, source, transcript,
      summary: extracted.summary || null,
      extracted,
      met_on: today,
      processed_at: new Date().toISOString()
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  return res.status(201).json({ meeting_id: data.id, extracted });
};
