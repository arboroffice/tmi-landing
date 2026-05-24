const { getSupabase } = require('./_supabase');
const { Resend } = require('resend');
const twilio = require('twilio');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const OWNER_EMAIL = 'mia@elianatech.com';

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
    const db = getSupabase();

    const { data: record, error } = await db.from('city_leads').insert({
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
    }).select('id').single();

    if (error) console.error('city-lead-apply insert:', error.message);

    // Also upsert a contact and log activity
    const { data: contact } = await db.from('contacts').upsert({
      first_name: first_name.trim(),
      last_name:  (last_name || '').trim() || null,
      email:      email.toLowerCase().trim(),
      phone:      phone || null,
      audience:   'physical',
      notes:      `City Lead applicant — ${city}`,
    }, { onConflict: 'email' }).select('id').single();

    if (contact?.id && record?.id) {
      await db.from('activities').insert({
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
    html: `<!DOCTYPE html><html><body style="background:#fff;font-family:Arial,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:40px 24px;line-height:1.7;">
<p style="margin:0 0 6px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">TMI Technology</p>
<h2 style="margin:0 0 20px;font-size:28px;font-weight:800;letter-spacing:-0.02em;line-height:1.1;">We got your application.</h2>
<p style="font-size:15px;color:#444;margin:0 0 20px;line-height:1.65;">I'll review what you shared and reach out within 3 business days. If ${city} is available and you're a fit, we'll get on a call to walk through the program.</p>
<p style="font-size:15px;color:#444;margin:0 0 32px;line-height:1.65;">In the meantime, take a look at some of the Field Notes to get a feel for how we think about the work:</p>
<a href="https://tmi-technology.com/news" style="display:inline-block;background:#E4FF97;color:#0a0b14;font-weight:700;font-size:14px;padding:14px 32px;border-radius:999px;text-decoration:none;">Read Field Notes &rarr;</a>
<p style="margin:36px 0 0;font-size:14px;line-height:1.7;">Mia<br><span style="color:#888;font-size:13px;">TMI &mdash; AI Infrastructure for Field Operations</span></p>
</body></html>`,
  }).catch(e => console.error('city-lead confirmation email:', e.message));

  // Internal alert to owner
  resend.emails.send({
    from: 'TMI <support@tmitechai.com>',
    to: OWNER_EMAIL,
    subject: `City Lead application: ${fullName} — ${city}`,
    html: `<!DOCTYPE html><html><body style="background:#fff;font-family:Arial,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:32px 24px;line-height:1.6;">
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
</body></html>`,
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
