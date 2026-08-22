// Audience question from the live room -> email the team (best-effort).
// POST { token?, name?, question } -> { ok }

const db = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const b = req.body || {};
  const question = (b.question || '').trim();
  if (!question) return res.status(400).json({ error: 'question required' });

  let email = null;
  try {
    if (b.token) {
      const reg = await db.findOne('webinar_registrations', 'token', b.token);
      if (reg) email = reg.email;
    }
  } catch (e) {}

  try {
    await db.insert('activities', {
      type: 'note',
      title: 'Webinar question',
      body: `${b.name || 'Attendee'}${email ? ' <' + email + '>' : ''}: ${question}`,
    });
  } catch (e) {}

  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'TMI <support@tmitechai.com>',
        to: ['support@tmitechai.com', 'mia@tmitechai.com'],
        subject: `Webinar question from ${b.name || 'attendee'}`,
        text: `${b.name || 'Attendee'}${email ? ' <' + email + '>' : ''}\n\n${question}`,
      });
    } catch (e) { console.error('webinar-question email:', e.message); }
  }

  return res.status(200).json({ ok: true });
};
