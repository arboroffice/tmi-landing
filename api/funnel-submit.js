const { getSupabase } = require('./_supabase');
const { Resend } = require('resend');
const twilio = require('twilio');
const { Client: QStashClient } = require('@upstash/qstash');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const OWNER_EMAIL = 'mialouviere@gmail.com';
const SITE = 'https://www.tmi-technology.com';
const BEEHIIV_PUB = 'pub_24a9962f-7b4a-4587-b363-263e5508e73c';

const PHYSICAL_NICHES = ['hvac','construction','plumbing','electrical','roofing','landscaping','manufacturing','oil-gas','mining','fleet-logistics','other-trades'];

function formatPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { name, email, phone, company, niche } = req.body || {};
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

  const audience = PHYSICAL_NICHES.includes(niche) ? 'physical' : niche ? 'online' : null;
  const firstName = (name || 'there').split(' ')[0];
  const nameParts = (name || '').trim().split(' ');
  const first_name = nameParts[0] || email.split('@')[0];
  const last_name = nameParts.slice(1).join(' ') || null;
  const formattedPhone = formatPhone(phone);

  let contactId = null;
  let leadId = null;
  let appId = null;

  try {
    const db = getSupabase();

    // Upsert contact
    const { data: contact, error: cErr } = await db
      .from('contacts')
      .upsert({
        first_name,
        last_name,
        email: email.toLowerCase().trim(),
        phone: formattedPhone,
        company: company || null,
        audience,
        niche: niche || null,
      }, { onConflict: 'email' })
      .select('id')
      .single();

    if (cErr) console.error('contact upsert:', cErr.message);
    else contactId = contact.id;

    // Insert application
    const { data: app, error: aErr } = await db
      .from('applications')
      .insert({
        name: name || email,
        email: email.toLowerCase().trim(),
        phone: formattedPhone,
        company: company || null,
        audience,
        niche: niche || null,
        source: 'funnel',
        status: 'new',
        contact_id: contactId,
      })
      .select('id')
      .single();

    if (aErr) console.error('application insert:', aErr.message);
    else appId = app.id;

    // Insert lead
    const { data: lead, error: lErr } = await db
      .from('leads')
      .insert({
        contact_id: contactId,
        name: name || email,
        email: email.toLowerCase().trim(),
        phone: formattedPhone,
        status: 'new',
        source: 'funnel',
      })
      .select('id')
      .single();

    if (lErr) console.error('lead insert:', lErr.message);
    else {
      leadId = lead.id;
      if (appId) {
        db.from('applications')
          .update({ lead_id: leadId })
          .eq('id', appId)
          .then(() => {}).catch(e => console.error('app lead_id update:', e.message));
      }
    }

    // Activity log
    if (contactId) {
      db.from('activities').insert({
        contact_id: contactId,
        lead_id: leadId || null,
        type: 'note',
        title: 'Funnel application submitted',
        body: `Niche: ${niche || '—'} | Company: ${company || '—'} | Phone: ${phone || '—'}`,
      }).then(() => {}).catch(e => console.error('activity:', e.message));
    }
  } catch (e) {
    console.error('Supabase:', e.message);
  }

  // Subscribe to Beehiiv
  const customFields = [
    ...(audience ? [{ name: 'Audience', value: audience }] : []),
    ...(niche ? [{ name: 'Business Niche', value: niche }] : []),
  ];
  fetch(`https://api.beehiiv.com/v2/publications/${BEEHIIV_PUB}/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.BEEHIIV_API_KEY },
    body: JSON.stringify({
      email,
      reactivate_existing: true,
      send_welcome_email: true,
      utm_source: 'funnel',
      utm_medium: 'application_form',
      ...(customFields.length ? { custom_fields: customFields } : {}),
    }),
  }).catch(e => console.error('Beehiiv:', e.message));

  // Notifications
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Confirmation to applicant
    resend.emails.send({
      from: 'Mia from TMI <hello@tmitechai.com>',
      to: email,
      subject: `Application received, ${firstName}`,
      html: `<!DOCTYPE html><html><body style="background:#fff;font-family:Arial,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:40px 24px;line-height:1.7;">
<p style="margin:0 0 6px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">TMI Technology</p>
<h2 style="margin:0 0 20px;font-size:28px;font-weight:800;letter-spacing:-0.02em;line-height:1.1;">Application received.</h2>
<p style="font-size:15px;color:#444;margin:0 0 20px;line-height:1.65;">I review every application personally. You'll hear from me within 48 hours &mdash; usually sooner.</p>
<p style="font-size:15px;color:#444;margin:0 0 28px;line-height:1.65;">In the meantime, here's what operators are reading:</p>
<a href="${SITE}/news" style="display:inline-block;background:#E4FF97;color:#0a0b14;font-weight:700;font-size:14px;padding:14px 32px;border-radius:999px;text-decoration:none;">Read Field Notes &rarr;</a>
<p style="margin:36px 0 0;font-size:14px;line-height:1.7;">Mia<br><span style="color:#888;font-size:13px;">TMI &mdash; AI Infrastructure for Field Operations</span></p>
</body></html>`,
    }).catch(e => console.error('confirmation email:', e.message));

    // Internal alert to Mia
    resend.emails.send({
      from: 'Mia from TMI <hello@tmitechai.com>',
      to: OWNER_EMAIL,
      subject: `New application: ${name || email} — ${niche || 'no niche'}`,
      html: `<!DOCTYPE html><html><body style="background:#fff;font-family:Arial,sans-serif;color:#111;max-width:480px;margin:0 auto;padding:32px 24px;line-height:1.6;">
<p style="margin:0 0 4px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">New Funnel Application</p>
<h2 style="margin:0 0 20px;font-size:22px;font-weight:800;">${name || email}</h2>
<table width="100%" style="border-collapse:collapse;background:#f9f9f9;border-radius:8px;overflow:hidden;margin-bottom:20px;">
  <tr><td style="padding:8px 14px;font-size:13px;color:#888;width:30%">Email</td><td style="padding:8px 14px;font-size:13px;font-weight:600"><a href="mailto:${email}" style="color:#5a9e00">${email}</a></td></tr>
  <tr style="background:#f3f3f3"><td style="padding:8px 14px;font-size:13px;color:#888">Phone</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${phone || '—'}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#888">Company</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${company || '—'}</td></tr>
  <tr style="background:#f3f3f3"><td style="padding:8px 14px;font-size:13px;color:#888">Niche</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${niche || '—'}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#888">Audience</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${audience || '—'}</td></tr>
</table>
<a href="https://admin.tmitechai.com/admin-applications" style="font-size:13px;color:#5a9e00">View in Admin &rarr;</a>
</body></html>`,
    }).catch(e => console.error('internal email:', e.message));
  } catch (e) {
    console.error('Resend:', e.message);
  }

  // SMS alert to Mia
  try {
    const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    sms.messages.create({
      body: `New application: ${name || email} | ${company || '—'} | ${niche || '—'} | ${phone || 'no phone'} | ${email}`,
      from: FROM_NUMBER,
      to: ALERT_NUMBER,
    }).catch(e => console.error('alert SMS:', e.message));
  } catch (e) {
    console.error('Twilio:', e.message);
  }

  // Schedule follow-up chain
  if (leadId) {
    try {
      const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN });
      const followupUrl = `${SITE}/api/followup`;
      for (const { delay, step } of [
        { delay: 86400,   step: 'day1_sms' },
        { delay: 259200,  step: 'day3_email' },
        { delay: 604800,  step: 'day7_email_sms' },
        { delay: 1209600, step: 'day14_email' },
      ]) {
        qstash.publishJSON({ url: followupUrl, delay, body: { leadId, step } })
          .catch(e => console.error(`QStash ${step}:`, e.message));
      }
    } catch (e) {
      console.error('QStash:', e.message);
    }
  }

  res.status(200).json({ ok: true });
};
