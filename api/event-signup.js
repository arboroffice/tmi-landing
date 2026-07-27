// Founders of the Future — event RSVP.
// Stores the attendee as a tagged contact + application, logs it, and emails a
// confirmation to the attendee plus an alert to the team. Every step is
// best-effort so a single failure never blocks the RSVP. Reusable across events
// via the `event` (slug) and `event_name` fields.
//
// POST { name, email, company?, phone?, industry?, location?, goal?,
//        tmi_interest?, event?, event_name? } -> { ok: true }

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

  const slug = (b.event || 'fotf-event').trim();
  const eventName = (b.event_name || 'Founders of the Future event').trim();
  const first = name.split(/\s+/)[0];
  const last = name.includes(' ') ? name.split(/\s+/).slice(1).join(' ') : null;
  const summary =
    `Event: ${eventName} (${slug})\n` +
    (b.session ? `Session: ${b.session}${b.session_time ? ` (${b.session_time})` : ''}\n` : '') +
    `Company: ${b.company || '—'}  ·  Phone: ${b.phone || '—'}\n` +
    `Industry: ${b.industry || '—'}  ·  Location: ${b.location || '—'}\n` +
    `Wants to walk away with: ${b.goal || '—'}\n` +
    `Interested in TMI building systems: ${b.tmi_interest || '—'}`;

  // 1) Tagged contact
  let contact = null;
  try {
    const existing = await db.findOne('contacts', 'email', email);
    const tags = Array.isArray(existing && existing.tags) ? existing.tags.slice() : [];
    for (const t of ['founders-of-the-future', 'event', `event-${slug}`]) {
      if (!tags.includes(t)) tags.push(t);
    }
    contact = await db.upsertByField('contacts', 'email', email, {
      first_name: first,
      last_name: last,
      email,
      company: b.company || null,
      phone: b.phone || (existing && existing.phone) || null,
      tags,
      notes: `${eventName} RSVP\n${summary}`,
    });
  } catch (e) { console.error('event-signup contact:', e.message); }

  // 2) Application record (best-effort) — shows in the admin pipeline
  let app = null;
  try {
    app = await db.insert('applications', {
      name,
      email,
      company: b.company || null,
      phone: b.phone || null,
      website: b.website || null,
      source: `event-${slug}`,
      status: 'rsvp',
      notes: summary,
      created_at: new Date().toISOString(),
    });
  } catch (e) { console.error('event-signup application:', e.message); }

  // 3) Activity log (best-effort)
  try {
    if (contact && contact.id) {
      await db.insert('activities', {
        contact_id: contact.id,
        type: 'note',
        title: `${eventName} RSVP`,
        body: summary,
      });
    }
  } catch (e) { console.error('event-signup activity:', e.message); }

  // 4) Emails (best-effort)
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Founders of the Future <support@tmitechai.com>',
        to: email,
        subject: `You're on the list for ${eventName}`,
        text:
          `Hi ${first},\n\n` +
          `You're on the list for ${eventName}. We're finalizing the date and venue and you'll be the first to know, with the details sent straight to you.\n\n` +
          `This is a room for business owners building the future. Come ready to meet other operators and see what running on intelligent systems actually looks like.\n\n` +
          `If you'd like your own operation mapped before then, you can book your Intelligent Company Audit here: https://www.tmitechai.com/book\n\n` +
          `- The TMI team`,
      });
      await resend.emails.send({
        from: 'TMI <support@tmitechai.com>',
        to: TEAM,
        subject: `New RSVP — ${eventName}: ${name}${b.company ? ' (' + b.company + ')' : ''}`,
        text: `${name} <${email}>  ${b.phone || ''}\n\n${summary}`,
      });
    } catch (e) { console.error('event-signup email:', e.message); }
  }

  return res.json({ ok: true, id: app && app.id ? app.id : null });
};
