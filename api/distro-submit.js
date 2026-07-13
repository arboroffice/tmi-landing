// App submissions for /distro (Distro, the anti-accelerator).
// Stores each submission in its own `distro_submissions` collection (surfaced
// on the dedicated admin page), tags a CRM contact, and emails the founder on
// every submission. Every step is best-effort so nothing blocks the submission.
//
// POST { name, email, app_name?, app_link?, platform?, stage?, revenue?, model?, message? } -> { ok }

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
  const appName = (b.app_name || '').trim() || null;
  const appLink = (b.app_link || '').trim() || null;
  const platform = (b.platform || '').trim() || null;
  const stage = (b.stage || '').trim() || null;
  const revenue = (b.revenue || '').trim() || null;
  const model = (b.model || '').trim() || null;
  const message = (b.message || '').trim() || null;

  // 1) Dedicated submission record (best-effort)
  let sub = null;
  try {
    sub = await db.insert('distro_submissions', {
      name, email,
      app_name: appName, app_link: appLink,
      platform, stage, revenue, model, message,
      status: 'new',
      created_at: new Date().toISOString(),
    });
  } catch (e) { console.error('distro submission:', e.message); }

  // 2) Tagged CRM contact (best-effort)
  try {
    const existing = await db.findOne('contacts', 'email', email);
    const tags = Array.isArray(existing && existing.tags) ? existing.tags.slice() : [];
    for (const t of ['distro', 'app-builder']) if (!tags.includes(t)) tags.push(t);
    const noteLines = [
      'Distro - app submission',
      appName ? `App: ${appName}` : '',
      appLink ? `Link: ${appLink}` : '',
      platform ? `Platform: ${platform}` : '',
      stage ? `Stage: ${stage}` : '',
      revenue ? `Revenue: ${revenue}` : '',
      model ? `Model: ${model}` : '',
      message ? `Notes: ${message}` : '',
    ].filter(Boolean);
    await db.upsertByField('contacts', 'email', email, {
      first_name: first, last_name: last, email,
      tags, notes: noteLines.join('\n'),
    });
  } catch (e) { console.error('distro contact:', e.message); }

  // 3) Email the founder on every submission (best-effort)
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'TMI <support@tmitechai.com>',
        to: NOTIFY,
        subject: `New Distro app submission - ${name}${appName ? ' (' + appName + ')' : ''}`,
        text:
          `New app submission on /distro:\n\n` +
          `Name: ${name}\n` +
          `Email: ${email}\n` +
          (appName ? `App: ${appName}\n` : '') +
          (appLink ? `Link: ${appLink}\n` : '') +
          (platform ? `Platform: ${platform}\n` : '') +
          (stage ? `Stage: ${stage}\n` : '') +
          (revenue ? `Revenue: ${revenue}\n` : '') +
          (model ? `Model: ${model}\n` : '') +
          (message ? `Notes: ${message}\n` : '') +
          `\nSee them all: https://www.tmitechai.com/admin-distro`,
      });
    } catch (e) { console.error('distro email:', e.message); }
  }

  // Confirmation to the applicant so they know it went through (best-effort)
  try {
    if (process.env.RESEND_API_KEY) {
      const { Resend } = require('resend');
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: 'TMI <support@tmitechai.com>', to: email,
        subject: 'We got your Distro submission',
        html: `<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:10px;color:#1a1a1a;font-size:16px;line-height:1.7;"><p style="margin:0 0 16px;">Hey ${first},</p><p style="margin:0 0 16px;">We received your Distro submission${appName ? ` for <strong>${appName}</strong>` : ''}. Our team is reviewing it and we'll be in touch.</p><p style="margin:0 0 16px;">Reply here if you want to add anything.</p><p style="margin:0;">- The TMI team</p></div>`,
      });
    }
  } catch (e) { console.error('distro confirm:', e.message); }

  return res.status(200).json({ ok: true, id: sub && sub.id ? sub.id : null });
};
