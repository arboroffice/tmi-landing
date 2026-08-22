// Email gate for The Intelligent Company book. Captures the lead before access,
// stores it (visible in admin as a lead + contact), emails the owner, and texts
// the owner line. Best-effort throughout so a failure never blocks access.
//
// POST { first_name?, name?, email, company?, phone? } -> { ok }

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
  const name = (b.first_name || b.name || '').trim();
  const email = (b.email || '').toLowerCase().trim();
  const company = (b.company || '').trim() || null;
  const phone = (b.phone || '').trim() || null;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

  // 1) Store (book_leads + lead + contact) — best-effort
  try {
    await db.insert('book_leads', {
      name: name || null, email, company, phone,
      resource: 'the-intelligent-company',
      source: 'book-gate', status: 'new', created_at: new Date().toISOString(),
    });
    if (!(await db.findOne('leads', 'email', email))) {
      await db.insert('leads', {
        email, owner_name: name || null, company_name: company, phone,
        source: 'book:the-intelligent-company', status: 'new', score: 'warm',
        unsubscribed: false, created_at: new Date().toISOString(),
      });
    }
    await db.upsertByField('contacts', 'email', email, {
      email, first_name: name || null, company, phone,
      notes: 'Downloaded The Intelligent Company',
    }).catch(() => {});
  } catch (e) {
    console.error('book-lead DB:', e.message);
  }

  // 2) Owner email (best-effort)
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      resend.emails.send({
        from: 'TMI <support@tmitechai.com>',
        to: OWNER_EMAIL,
        subject: `Book download: ${name || email}${company ? ' — ' + company : ''}`,
        text: `The Intelligent Company was unlocked by:\n\nName: ${name || '—'}\nEmail: ${email}\nCompany: ${company || '—'}\nPhone: ${phone || '—'}`,
      }).catch(e => console.error('book-lead email:', e.message));
    } catch (e) { console.error('book-lead email:', e.message); }
  }

  // 3) Owner SMS (best-effort)
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const sms = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      sms.messages.create({
        body: `Book download: ${name || email}${company ? ' | ' + company : ''} | ${email}`,
        from: FROM_NUMBER, to: ALERT_NUMBER,
      }).catch(e => console.error('book-lead SMS:', e.message));
    } catch (e) { console.error('book-lead Twilio:', e.message); }
  }

  res.status(200).json({ ok: true });
};
