// Application submissions for /startabusiness (trades partnership program).
// Stores each application in its own `startabusiness_submissions` collection
// (surfaced on the dedicated admin page), tags a CRM contact, and emails the
// founder on every submission. Every step is best-effort so nothing blocks the
// application.
//
// POST { name, email, phone?, trade_status?, trade?, location?, message? } -> { ok }

const db = require('./_db');

// Who gets pinged on every submission.
const NOTIFY = ['mia@tmitechai.com', 'mialouviere@gmail.com'];

const TRADE_STATUS_LABEL = {
  have: 'Already has a trade',
  learning: 'Currently learning a trade',
  none: 'No trade yet, wants to learn',
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const b = req.body || {};
  const name = (b.name || '').trim();
  const email = (b.email || '').trim().toLowerCase();
  if (!name || !email || email.indexOf('@') < 0) {
    return res.status(400).json({ error: 'Name and a valid email are required.' });
  }
  const first = name.split(/\s+/)[0];
  const last = name.includes(' ') ? name.split(/\s+/).slice(1).join(' ') : null;
  const phone = (b.phone || '').trim() || null;
  const tradeStatus = (b.trade_status || '').trim() || null;
  const trade = (b.trade || '').trim() || null;
  const location = (b.location || '').trim() || null;
  const message = (b.message || '').trim() || null;
  const statusLabel = tradeStatus ? (TRADE_STATUS_LABEL[tradeStatus] || tradeStatus) : null;

  // 1) Dedicated submission record (best-effort)
  let sub = null;
  try {
    sub = await db.insert('startabusiness_submissions', {
      name, email, phone,
      trade_status: tradeStatus,
      trade, location, message,
      status: 'new',
      created_at: new Date().toISOString(),
    });
  } catch (e) { console.error('startabusiness submission:', e.message); }

  // 2) Tagged CRM contact (best-effort)
  try {
    const existing = await db.findOne('contacts', 'email', email);
    const tags = Array.isArray(existing && existing.tags) ? existing.tags.slice() : [];
    for (const t of ['startabusiness', 'trades-partnership']) if (!tags.includes(t)) tags.push(t);
    const noteLines = [
      'Start a Trades Business - application',
      statusLabel ? `Trade status: ${statusLabel}` : '',
      trade ? `Trade: ${trade}` : '',
      location ? `Location: ${location}` : '',
      message ? `About: ${message}` : '',
    ].filter(Boolean);
    await db.upsertByField('contacts', 'email', email, {
      first_name: first, last_name: last, email, phone,
      tags, notes: noteLines.join('\n'),
    });
  } catch (e) { console.error('startabusiness contact:', e.message); }

  // 3) Email the founder on every submission (best-effort)
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'TMI <support@tmitechai.com>',
        to: NOTIFY,
        subject: `New Start a Business application - ${name}`,
        text:
          `New application on /startabusiness:\n\n` +
          `Name: ${name}\n` +
          `Email: ${email}\n` +
          (phone ? `Phone: ${phone}\n` : '') +
          (statusLabel ? `Trade status: ${statusLabel}\n` : '') +
          (trade ? `Trade: ${trade}\n` : '') +
          (location ? `Location: ${location}\n` : '') +
          (message ? `About: ${message}\n` : '') +
          `\nSee them all: https://www.tmitechai.com/admin-startabusiness`,
      });
    } catch (e) { console.error('startabusiness email:', e.message); }
  }

  return res.status(200).json({ ok: true, id: sub && sub.id ? sub.id : null });
};
