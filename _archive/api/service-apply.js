// Generic TMI division apply handler. Used by the service-line pages
// (visibility, inbound, and any future division). Stores the lead as a tagged
// contact + application, logs it, and emails the applicant + team. Best-effort.
//
// POST { name, email, company?, phone?, message?, service, service_name } -> { ok: true }

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

  const slug = (b.service || 'tmi-service').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const serviceName = (b.service_name || 'TMI').trim();
  const first = name.split(/\s+/)[0];
  const last = name.includes(' ') ? name.split(/\s+/).slice(1).join(' ') : null;
  const summary =
    `Service: ${serviceName} (${slug})\n` +
    `Company: ${b.company || '—'}  ·  Phone: ${b.phone || '—'}\n` +
    `Message: ${b.message || '—'}`;

  // 1) Tagged contact
  let contact = null;
  try {
    const existing = await db.findOne('contacts', 'email', email);
    const tags = Array.isArray(existing && existing.tags) ? existing.tags.slice() : [];
    for (const t of [slug, `${slug}-applicant`]) if (!tags.includes(t)) tags.push(t);
    contact = await db.upsertByField('contacts', 'email', email, {
      first_name: first,
      last_name: last,
      email,
      company: b.company || null,
      phone: b.phone || (existing && existing.phone) || null,
      tags,
      notes: `${serviceName} application\n${summary}`,
    });
  } catch (e) { console.error('service-apply contact:', e.message); }

  // 2) Application record (admin pipeline)
  let app = null;
  try {
    app = await db.insert('applications', {
      name,
      email,
      company: b.company || null,
      phone: b.phone || null,
      source: slug,
      status: 'applied',
      notes: summary,
      created_at: new Date().toISOString(),
    });
  } catch (e) { console.error('service-apply application:', e.message); }

  // 3) Activity log
  try {
    if (contact && contact.id) {
      await db.insert('activities', { contact_id: contact.id, type: 'note', title: `${serviceName} application`, body: summary });
    }
  } catch (e) { console.error('service-apply activity:', e.message); }

  // 4) Emails
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'TMI <support@tmitechai.com>',
        to: email,
        subject: `We got your ${serviceName} request`,
        text:
          `Hi ${first},\n\n` +
          `Thanks for reaching out about ${serviceName}. We will review what you sent and get back to you within 24 hours with whether we can help and exactly what it would look like.\n\n` +
          `— The TMI team`,
      });
      await resend.emails.send({
        from: 'TMI <support@tmitechai.com>',
        to: TEAM,
        subject: `New ${serviceName} application: ${name}${b.company ? ' (' + b.company + ')' : ''}`,
        text: `${name} <${email}>  ${b.phone || ''}\n\n${summary}`,
      });
    } catch (e) { console.error('service-apply email:', e.message); }
  }

  return res.json({ ok: true, id: app && app.id ? app.id : null });
};
