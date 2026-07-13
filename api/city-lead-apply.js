const db = require('./_db');
const { Resend } = require('resend');
const twilio = require('twilio');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const OWNER_EMAIL = ['support@tmitechai.com', 'mia@tmitechai.com'];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const {
    first_name, last_name, email, phone, city,
    linkedin, background, why, revenue_goal, source,
  } = req.body || {};

  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  if (!first_name) return res.status(400).json({ error: 'First name required' });
  if (!city) return res.status(400).json({ error: 'City required' });

  const fullName = [first_name, last_name].filter(Boolean).join(' ');

  try {
    const record = await db.insert('city_leads', {
      first_name: first_name.trim(),
      last_name:  (last_name || '').trim() || null,
      email:      email.toLowerCase().trim(),
      phone:      phone || null,
      city:       city.trim(),
      linkedin:   linkedin || null,
      background: background || null,
      why:        why || null,
      revenue_goal: revenue_goal || null,
      source:     source || 'city-lead-page',
      status:     'new',
    });

    // Also upsert a contact and log activity
    const contact = await db.upsertByField('contacts', 'email', email.toLowerCase().trim(), {
      first_name: first_name.trim(),
      last_name:  (last_name || '').trim() || null,
      email:      email.toLowerCase().trim(),
      phone:      phone || null,
      audience:   'physical',
      notes:      `City Lead applicant — ${city}`,
    });

    if (contact?.id && record?.id) {
      await db.update('city_leads', record.id, { contact_id: contact.id }).catch(() => {});
      await db.insert('activities', {
        contact_id: contact.id,
        type: 'note',
        title: 'City Lead application submitted',
        body: `City: ${city}\nRevenue goal: ${revenue_goal || '—'}\n\nBackground: ${background || '—'}\n\nWhy: ${why || '—'}`,
      }).catch(() => {});
    }
  } catch (e) {
    console.error('city-lead-apply DB:', e.message);
  }

  // Confirmation email to applicant
  const resend = new Resend(process.env.RESEND_API_KEY);

  resend.emails.send({
    from: 'TMI <support@tmitechai.com>',
    to: email,
    subject: `Got your application, ${first_name}`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5ef;-webkit-font-smoothing:antialiased;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5ef;"><tr><td align="center" style="padding:28px 14px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid #e7e8e1;border-radius:16px;overflow:hidden;"><tr><td style="background:#0a0b14;padding:18px 30px;"><span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">TMI</span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#E4FF97;margin-left:5px;"></span></td></tr><tr><td style="padding:34px 30px 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.7;">
<p style="margin:0 0 6px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">TMI Technology</p>
<h2 style="margin:0 0 20px;font-size:28px;font-weight:800;letter-spacing:-0.02em;line-height:1.1;">We got your application.</h2>
<p style="font-size:15px;color:#444;margin:0 0 20px;line-height:1.65;">I'll review what you shared and reach out within 3 business days. If ${city} is available and you're a fit, we'll get on a call to walk through the program.</p>
<p style="font-size:15px;color:#444;margin:0 0 32px;line-height:1.65;">In the meantime, take a look at some of the Founders of the Future Letters to get a feel for how we think about the work:</p>
<a href="https://tmi-technology.com/news" style="display:inline-block;background:#E4FF97;color:#0a0b14;font-weight:700;font-size:14px;padding:14px 32px;border-radius:999px;text-decoration:none;">Read Founders of the Future Letters &rarr;</a>
<p style="margin:36px 0 0;font-size:14px;line-height:1.7;">Mia<br><span style="color:#888;font-size:13px;">TMI &mdash; AI Infrastructure for Field Operations</span></p>
</td></tr><tr><td style="padding:6px 30px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><div style="border-top:1px solid #eceee4;margin-top:8px;padding-top:16px;font-size:12px;line-height:1.6;color:#9a9ba5;">TMI Technology &middot; chaos control for growing companies<br><a href="https://www.tmitechai.com" style="color:#6f8f2a;text-decoration:none;">tmitechai.com</a></div></td></tr></table></td></tr></table></body></html>`,
  }).catch(e => console.error('city-lead confirmation email:', e.message));

  // Internal alert to owner
  resend.emails.send({
    from: 'TMI <support@tmitechai.com>',
    to: OWNER_EMAIL,
    subject: `City Lead application: ${fullName} — ${city}`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5ef;-webkit-font-smoothing:antialiased;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5ef;"><tr><td align="center" style="padding:28px 14px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid #e7e8e1;border-radius:16px;overflow:hidden;"><tr><td style="background:#0a0b14;padding:18px 30px;"><span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">TMI</span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#E4FF97;margin-left:5px;"></span></td></tr><tr><td style="padding:34px 30px 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.7;">
<p style="margin:0 0 4px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">New City Lead Application</p>
<h2 style="margin:0 0 20px;font-size:22px;font-weight:800;">${fullName} &mdash; ${city}</h2>
<table width="100%" style="border-collapse:collapse;background:#f9f9f9;border-radius:8px;overflow:hidden;margin-bottom:20px;">
  <tr><td style="padding:8px 14px;font-size:13px;color:#888;width:35%">Email</td><td style="padding:8px 14px;font-size:13px;font-weight:600"><a href="mailto:${email}" style="color:#5a9e00">${email}</a></td></tr>
  <tr style="background:#f3f3f3"><td style="padding:8px 14px;font-size:13px;color:#888">Phone</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${phone || '—'}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#888">City</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${city}</td></tr>
  <tr style="background:#f3f3f3"><td style="padding:8px 14px;font-size:13px;color:#888">Revenue Goal</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${revenue_goal || '—'}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#888">LinkedIn</td><td style="padding:8px 14px;font-size:13px">${linkedin ? `<a href="${linkedin}" style="color:#5a9e00">${linkedin}</a>` : '—'}</td></tr>
  <tr style="background:#f3f3f3"><td style="padding:8px 14px;font-size:13px;color:#888">Source</td><td style="padding:8px 14px;font-size:13px">${source || '—'}</td></tr>
</table>
${background ? `<p style="font-size:13px;color:#555;line-height:1.6;margin-bottom:16px"><strong>Background:</strong><br>${background}</p>` : ''}
${why ? `<p style="font-size:13px;color:#555;line-height:1.6;margin-bottom:20px"><strong>Why City Lead:</strong><br>${why}</p>` : ''}
<a href="https://admin.tmitechai.com/admin-city-leads" style="font-size:13px;color:#5a9e00">View in Admin &rarr;</a>
</td></tr><tr><td style="padding:6px 30px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><div style="border-top:1px solid #eceee4;margin-top:8px;padding-top:16px;font-size:12px;line-height:1.6;color:#9a9ba5;">TMI Technology &middot; chaos control for growing companies<br><a href="https://www.tmitechai.com" style="color:#6f8f2a;text-decoration:none;">tmitechai.com</a></div></td></tr></table></td></tr></table></body></html>`,
  }).catch(e => console.error('city-lead internal email:', e.message));

  // SMS alert
  try {
    const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    sms.messages.create({
      body: `City Lead app: ${fullName} | ${city} | ${email} | Goal: ${revenue_goal || '—'}`,
      from: FROM_NUMBER,
      to: ALERT_NUMBER,
    }).catch(e => console.error('city-lead SMS:', e.message));
  } catch (e) {
    console.error('Twilio:', e.message);
  }

  res.status(200).json({ ok: true });
};
