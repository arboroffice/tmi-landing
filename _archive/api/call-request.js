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

const BOOK_URL = 'https://www.tmitechai.com/the-intelligent-company-book';
const SCORECARD_URL = 'https://www.tmitechai.com/intelligence-scorecard';

// Best-effort E.164 for US numbers; returns null if we can't be confident.
function toE164(raw) {
  const s = String(raw || '').trim();
  if (s[0] === '+') { const d = s.replace(/[^\d]/g, ''); return d.length >= 11 ? '+' + d : null; }
  const d = s.replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return null;
}

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

  // 4) Prospect SMS: send the book and scorecard to the person who booked, but
  //    only the resources they have not already filled out, and only once per
  //    contact. Consent comes from the phone field on the book-a-call form.
  if (phone && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const to = toE164(phone);
      const contact = await db.findOne('contacts', 'email', email).catch(() => null);
      const alreadyTexted = !!(contact && contact.resources_texted);
      if (to && !alreadyTexted) {
        const [gotBook, gotScorecard] = await Promise.all([
          db.findOne('book_leads', 'email', email).catch(() => null),
          db.findOne('scorecard_leads', 'email', email).catch(() => null),
        ]);
        const links = [];
        if (!gotScorecard) links.push('Score your company: ' + SCORECARD_URL);
        if (!gotBook) links.push('The Intelligent Company (free book): ' + BOOK_URL);
        const first = (name || '').split(' ')[0];
        const hi = first ? first + ', thanks' : 'Thanks';
        const body = links.length
          ? `${hi} for reaching out to TMI. We'll be in touch shortly, usually the same day. In the meantime:\n\n${links.join('\n\n')}\n\nReply STOP to opt out.`
          : `${hi} for reaching out to TMI. We'll be in touch shortly, usually the same day. Reply STOP to opt out.`;
        const sms = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        sms.messages.create({ body, from: FROM_NUMBER, to })
          .then(r => { try { require('./_comms').logSms(null, { phone: to, body, twilioSid: r && r.sid }); } catch (_) {} })
          .catch(e => console.error('call-request prospect SMS:', e.message));
        // Mark so a repeat booking does not re-text the same resources.
        db.upsertByField('contacts', 'email', email, { resources_texted: true }).catch(() => {});
      }
    } catch (e) { console.error('call-request prospect SMS:', e.message); }
  }

  res.status(200).json({ ok: true });
};
