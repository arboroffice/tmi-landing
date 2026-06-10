const db = require('./_db');
const { requireAuth, cors } = require('./_auth');
const twilio = require('twilio');

const FROM_NUMBER = '+18557171044';

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    try {
      const rows = await db.list('sms_log', { order: 'created_at', ascending: false, limit: 200 });
      // Replaces the Supabase embed contacts(first_name, last_name).
      await db.hydrateMany(rows, 'contact_id', 'contacts', 'contacts');
      return res.json(rows || []);
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (req.method === 'POST') {
    const { contact_id, phone, body } = req.body || {};
    if (!phone || !body) return res.status(400).json({ error: 'phone and body required' });

    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) return res.status(503).json({ error: 'Twilio not configured' });

    const digits = String(phone).replace(/\D/g, '');
    const toNumber = digits.startsWith('1') ? `+${digits}` : `+1${digits}`;

    let twilioSid = null;
    let status = 'sent';
    try {
      const sms = twilio(sid, token);
      const msg = await sms.messages.create({ body, from: FROM_NUMBER, to: toNumber });
      twilioSid = msg.sid;
      status = 'sent';
    } catch (e) {
      status = 'failed';
      console.error('Twilio error:', e.message);
    }

    let record = null;
    try {
      record = await db.insert('sms_log', {
        contact_id: contact_id || null,
        direction: 'outbound',
        phone: toNumber,
        body,
        status,
        twilio_sid: twilioSid,
      });
    } catch (e) { console.error('[sms] log insert:', e.message); }

    return res.json({ ok: status === 'sent', status, record });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
