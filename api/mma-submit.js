// Early-access submissions for /makemoneywithai.
// Stores each submission in its own `mma_submissions` collection (surfaced on
// the dedicated admin page), tags a CRM contact, and emails the founder on
// every submission. Every step is best-effort so nothing blocks the signup.
//
// POST { name, email, goal? } -> { ok }

const db = require('./_db');

// Who gets pinged on every submission.
const NOTIFY = ['mia@tmitechai.com', 'mialouviere@gmail.com'];

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
  const goal = (b.goal || '').trim();

  // 1) Dedicated submission record (best-effort)
  let sub = null;
  try {
    sub = await db.insert('mma_submissions', {
      name, email, goal: goal || null,
      status: 'new',
      created_at: new Date().toISOString(),
    });
  } catch (e) { console.error('mma submission:', e.message); }

  // 2) Tagged CRM contact (best-effort)
  try {
    const existing = await db.findOne('contacts', 'email', email);
    const tags = Array.isArray(existing && existing.tags) ? existing.tags.slice() : [];
    for (const t of ['makemoneywithai', 'early-access']) if (!tags.includes(t)) tags.push(t);
    await db.upsertByField('contacts', 'email', email, {
      first_name: first, last_name: last, email, tags,
      notes: `Make Money With AI — early access${goal ? '\n' + goal : ''}`,
    });
  } catch (e) { console.error('mma contact:', e.message); }

  // 3) Email the founder on every submission (best-effort)
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'TMI <support@tmitechai.com>',
        to: NOTIFY,
        subject: `New Make Money With AI signup — ${name}`,
        text:
          `New early-access submission on /makemoneywithai:\n\n` +
          `Name: ${name}\n` +
          `Email: ${email}\n` +
          (goal ? `Goal: ${goal}\n` : '') +
          `\nSee them all: https://www.tmitechai.com/admin-makemoneywithai`,
      });
    } catch (e) { console.error('mma email:', e.message); }
  }

  // 4) Confirmation to the applicant so they know it went through (best-effort)
  try {
    if (process.env.RESEND_API_KEY) {
      const { Resend } = require('resend');
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: 'TMI <support@tmitechai.com>', to: email,
        subject: "You're on the early-access list",
        html: `<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:10px;color:#1a1a1a;font-size:16px;line-height:1.7;"><p style="margin:0 0 16px;">Hey ${first},</p><p style="margin:0 0 16px;">You're on the list for <strong>Make Money With AI</strong>. We'll email you the moment early access opens.</p><p style="margin:0 0 16px;">In the meantime, reply and tell us what you're trying to build - it helps us tailor it to you.</p><p style="margin:0;">- The TMI team</p></div>`,
      });
    }
  } catch (e) { console.error('mma confirm:', e.message); }

  return res.status(200).json({ ok: true, id: sub && sub.id ? sub.id : null });
};
