// Founders of the Future — membership application.
// Stores the applicant as a tagged contact + application, logs it, and emails
// a confirmation to the applicant plus an alert to the team. Every step is
// best-effort so a single failure never blocks the application.
//
// POST { name, email, company?, website?, building?, ai_stage?, industry?,
//        location?, revenue?, want?, tmi_interest? } -> { ok: true }

const db = require('./_db');

const TEAM = ['support@tmitechai.com', 'mia@tmitechai.com'];

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
  const summary =
    `What they're building: ${b.building || '—'}\n` +
    `AI stage: ${b.ai_stage || '—'}\n` +
    `Industry: ${b.industry || '—'}  ·  Location: ${b.location || '—'}\n` +
    `Revenue: ${b.revenue || '—'}\n` +
    `Wants from FOTF: ${b.want || '—'}\n` +
    `Interested in TMI building systems: ${b.tmi_interest || '—'}\n` +
    `Website: ${b.website || '—'}`;

  // 1) Tagged contact
  let contact = null;
  try {
    const existing = await db.findOne('contacts', 'email', email);
    const tags = Array.isArray(existing && existing.tags) ? existing.tags.slice() : [];
    for (const t of ['founders-of-the-future', 'fotf-applicant']) {
      if (!tags.includes(t)) tags.push(t);
    }
    contact = await db.upsertByField('contacts', 'email', email, {
      first_name: first,
      last_name: last,
      email,
      company: b.company || null,
      tags,
      notes: `Founders of the Future applicant\n${summary}`,
    });
  } catch (e) { console.error('fotf-apply contact:', e.message); }

  // 2) Application record (best-effort)
  let app = null;
  try {
    app = await db.insert('applications', {
      name,
      email,
      company: b.company || null,
      website: b.website || null,
      phone: null,
      source: 'founders-of-the-future',
      status: 'applied',
      notes: summary,
      created_at: new Date().toISOString(),
    });
  } catch (e) { console.error('fotf-apply application:', e.message); }

  // 3) Activity log (best-effort)
  try {
    if (contact && contact.id) {
      await db.insert('activities', {
        contact_id: contact.id,
        type: 'note',
        title: 'Founders of the Future application',
        body: summary,
      });
    }
  } catch (e) { console.error('fotf-apply activity:', e.message); }

  // 4) Emails (best-effort)
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Founders of the Future <support@tmitechai.com>',
        to: email,
        subject: 'Your Founders of the Future application',
        text:
          `Hi ${first},\n\n` +
          `Thanks for applying to Founders of the Future. We review every application personally and will be in touch about the next dinner, build lab, or company tour.\n\n` +
          `If you want your systems built in the meantime, you can book a TMI audit here: https://www.tmitechai.com/complete-audit\n\n` +
          `— The TMI team`,
      });
      await resend.emails.send({
        from: 'TMI <support@tmitechai.com>',
        to: TEAM,
        subject: `New FOTF application: ${name}${b.company ? ' (' + b.company + ')' : ''}`,
        text: `${name} <${email}>\n\n${summary}`,
      });
    } catch (e) { console.error('fotf-apply email:', e.message); }
  }

  return res.json({ ok: true, id: app && app.id ? app.id : null });
};
