// Book-a-call / contact capture for the TMI OS page. A visitor submits their
// info and we get back to them (no calendar). Stores the lead, emails the
// owner, and texts the owner line. Best-effort throughout so a failure never
// blocks the confirmation.
//
// POST { name, email, phone?, company?, message?, source? } -> { ok }

const db = require('./_db');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const OWNER_EMAIL = ['support@tmitechai.com', 'mia@tmitechai.com'];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const b = req.body || {};
  const name = (b.name || '').trim();
  const email = (b.email || '').toLowerCase().trim();
  const phone = (b.phone || '').trim() || null;
  const company = (b.company || '').trim() || null;
  const message = (b.message || '').trim() || null;
  const source = (b.source || 'tmi-os').trim();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

  // 1) Store (call_requests + lead + contact) - best-effort
  try {
    await db.insert('call_requests', {
      name: name || null, email, phone, company, message,
      source, status: 'new', created_at: new Date().toISOString(),
    });
    if (!(await db.findOne('leads', 'email', email))) {
      await db.insert('leads', {
        email, owner_name: name || null, company_name: company, phone,
        source: 'call:' + source, status: 'new', score: 'hot',
        unsubscribed: false, created_at: new Date().toISOString(),
      });
    }
    await db.upsertByField('contacts', 'email', email, {
      email, first_name: name || null, company, phone,
      notes: 'Requested a call from ' + source,
    }).catch(() => {});
  } catch (e) {
    console.error('call-request DB:', e.message);
  }

  // 2) Owner email (best-effort)
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      resend.emails.send({
        from: 'TMI <support@tmitechai.com>',
        to: OWNER_EMAIL,
        subject: `Call request: ${name || email}${company ? ' - ' + company : ''}`,
        text: `New call request from ${source}:\n\nName: ${name || '-'}\nEmail: ${email}\nPhone: ${phone || '-'}\nCompany: ${company || '-'}\n\nWhat they want to fix:\n${message || '-'}`,
      }).catch(e => console.error('call-request email:', e.message));
    } catch (e) { console.error('call-request email:', e.message); }
  }

  // 3) Owner SMS (best-effort)
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const sms = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      sms.messages.create({
        body: `Call request: ${name || email}${company ? ' | ' + company : ''}${phone ? ' | ' + phone : ''} | ${email}`,
        from: FROM_NUMBER, to: ALERT_NUMBER,
      }).catch(e => console.error('call-request SMS:', e.message));
    } catch (e) { console.error('call-request Twilio:', e.message); }
  }

  res.status(200).json({ ok: true });
};
