// TMI OS — capture a record by voice or photo. Brings the City Leads field
// capture (Deepgram voice + Claude vision) into the OS, tenant-scoped. The owner
// speaks or snaps a photo (a job sheet, a business card, an invoice) and we
// extract a structured os_records spec for them to confirm and save. Extraction
// only; the client confirms and writes through os2-records create, so nothing is
// mass-created without a look.
//
//   POST { action:'voice', audio }   -> { transcript, record }
//   POST { action:'parse', text }    -> { record }
//   POST { action:'scan',  image }   -> { record }
//
// record: { type, title, customer_name, amount, status, due_at, fields:{...} }

const { requireTenant, requireRole, cors } = require('./_tenant-auth');

const TYPES = ['customer', 'lead', 'invoice', 'payment', 'job', 'deal'];
const MAX_AUDIO = 4 * 1024 * 1024;

function normRecord(o) {
  if (!o || typeof o !== 'object') return null;
  const type = TYPES.includes(String(o.type)) ? String(o.type) : 'customer';
  const amt = Number(String(o.amount == null ? '' : o.amount).replace(/[^0-9.\-]/g, ''));
  const rec = {
    type,
    title: String(o.title || '').slice(0, 200),
    customer_name: String(o.customer_name || '').slice(0, 200),
    amount: isFinite(amt) && String(o.amount || '').trim() !== '' ? amt : null,
    status: o.status != null ? String(o.status).slice(0, 40) : null,
    due_at: o.due_at ? String(o.due_at).slice(0, 40) : null,
    fields: (o.fields && typeof o.fields === 'object' && !Array.isArray(o.fields)) ? o.fields : {},
  };
  if (!rec.title && rec.customer_name) rec.title = rec.customer_name;
  return rec;
}

const EXTRACT_PROMPT = `You turn a short note about a business event into ONE structured record for a company operating system. Return STRICT JSON only, no prose, with keys:
"type" (one of: customer, lead, invoice, payment, job, deal),
"title" (short label for the record),
"customer_name" (the customer/company/person it is about, or ""),
"amount" (a number in dollars if money is mentioned, else null),
"status" (a short status word if stated, e.g. open, paid, scheduled, won, else ""),
"due_at" (an ISO date YYYY-MM-DD if a date is mentioned, else ""),
"fields" (an object of any other useful details as key/value strings).
Pick the single best type. Example: "invoice 4471 for Acme, 2,400 dollars, due Friday" -> an invoice record. "new customer, Delta Welding, met at the yard" -> a customer record.`;

async function claude(messages, apiKey) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, messages }),
  });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('AI ' + r.status + ' ' + t.slice(0, 120)); }
  const d = await r.json();
  const txt = (d && d.content && d.content[0] && d.content[0].text) || '';
  const jm = txt.match(/\{[\s\S]*\}/);
  return jm ? JSON.parse(jm[0]) : null;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res); if (!t) return;
  if (!requireRole(t, res, 'manager')) return; // capture writes records: viewers are read-only

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const b = req.body || {};
  const action = String(b.action || '');

  try {
    if (action === 'scan') {
      if (!apiKey) return res.status(503).json({ error: 'Capture is not configured' });
      const image = String(b.image || '');
      const m = image.match(/^data:([^;]+);base64,(.*)$/s);
      if (!m) return res.status(400).json({ error: 'An image data URL is required' });
      let media_type = (m[1] || 'image/jpeg').toLowerCase();
      if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(media_type)) media_type = 'image/jpeg';
      const o = await claude([{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type, data: m[2] } },
        { type: 'text', text: 'This is a photo of a business document (invoice, job sheet, business card, receipt, or sign). ' + EXTRACT_PROMPT },
      ] }], apiKey);
      return res.json({ record: normRecord(o) });
    }

    if (action === 'parse') {
      if (!apiKey) return res.status(503).json({ error: 'Capture is not configured' });
      const text = String(b.text || '').trim();
      if (text.length < 3) return res.status(400).json({ error: 'Say a bit more' });
      const o = await claude([{ role: 'user', content: EXTRACT_PROMPT + '\n\nNote:\n"""' + text.slice(0, 2000) + '"""' }], apiKey);
      return res.json({ record: normRecord(o) });
    }

    if (action === 'voice') {
      const key = process.env.DEEPGRAM_API_KEY;
      if (!key) return res.status(503).json({ error: 'Voice capture is not configured' });
      const audio = String(b.audio || '');
      if (!audio.startsWith('data:')) return res.status(400).json({ error: 'A base64 audio data URL is required' });
      if (audio.length > MAX_AUDIO) return res.status(413).json({ error: 'Recording too long. Keep it short.' });
      const am = audio.match(/^data:([^;]+)(?:;[^,]*)?;base64,(.*)$/s);
      if (!am) return res.status(400).json({ error: 'Audio must be a base64 data URL' });
      const dg = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true', {
        method: 'POST', headers: { Authorization: 'Token ' + key, 'Content-Type': am[1] || 'audio/webm' }, body: Buffer.from(am[2], 'base64'),
      });
      if (!dg.ok) return res.status(502).json({ error: 'Transcription failed' });
      const dd = await dg.json();
      const transcript = (((dd.results || {}).channels || [])[0] || {}).alternatives ? dd.results.channels[0].alternatives[0].transcript : '';
      if (!transcript || !apiKey) return res.json({ transcript: transcript || '', record: null });
      const o = await claude([{ role: 'user', content: EXTRACT_PROMPT + '\n\nNote:\n"""' + transcript.slice(0, 2000) + '"""' }], apiKey);
      return res.json({ transcript, record: normRecord(o) });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-capture:', e.message);
    return res.status(500).json({ error: e.message || 'Capture failed' });
  }
};

module.exports.config = { maxDuration: 60 };
