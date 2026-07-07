const db = require('./_db');
const { Resend } = require('resend');
const twilio = require('twilio');
const { Client: QStashClient } = require('@upstash/qstash');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const OWNER_EMAIL = 'support@tmitechai.com';
const SITE = 'https://www.tmi-technology.com';

const PHYSICAL_INDUSTRIES = ['oil','gas','construction','trades','manufacturing','fleet','mining','utilities','home service','plumbing','hvac','roofing','electrical','landscaping','concrete','welding','pipeline'];

function audienceFromIndustry(industry = '') {
  const lower = industry.toLowerCase();
  return PHYSICAL_INDUSTRIES.some(k => lower.includes(k)) ? 'physical' : 'online';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { first_name, last_name, email, phone, company, team_size, industry, areas, biggest_problem } = req.body || {};

  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  if (!first_name) return res.status(400).json({ error: 'First name required' });

  const name = [first_name, last_name].filter(Boolean).join(' ').trim();
  const audience = audienceFromIndustry(industry);
  const areasArr = Array.isArray(areas) ? areas : areas ? [areas] : [];
  const notesText = [
    team_size    ? `Team size: ${team_size}`               : '',
    areasArr.length ? `Pain areas: ${areasArr.join(', ')}` : '',
    biggest_problem ? `Problem: ${biggest_problem}`        : '',
  ].filter(Boolean).join('\n');

  let contactId = null;
  let leadId = null;

  try {
    // Upsert contact by email
    const contact = await db.upsertByField('contacts', 'email', email.toLowerCase().trim(), {
      first_name: first_name.trim(),
      last_name: (last_name || '').trim() || null,
      email: email.toLowerCase().trim(),
      company: company || null,
      phone: phone || null,
      audience,
      niche: industry || null,
      tags: areasArr.length ? areasArr : null,
      notes: notesText || null,
    });

    contactId = contact.id;

    // Insert lead
    const lead = await db.insert('leads', {
      contact_id: contactId,
      name,
      email: email.toLowerCase().trim(),
      phone: phone || null,
      status: 'new',
      source: 'contact-form',
      notes: notesText || null,
    });

    leadId = lead.id;

    // Activity log
    if (contactId) {
      db.insert('activities', {
        contact_id: contactId,
        lead_id: leadId || null,
        type: 'note',
        title: 'Strategy call request submitted',
        body: notesText || null,
      }).catch(e => console.error('activity:', e.message));
    }
  } catch (e) {
    console.error('Supabase:', e.message);
  }

  // Meta Conversions API — initial lead event (fire and forget)
  try {
    const { sendLeadEvent, webContext } = require('./_meta-capi');
    sendLeadEvent({
      eventName: 'Lead',
      email,
      firstName: first_name,
      lastName: last_name,
      leadId,
      ...webContext(req),
    }).catch(() => {});
  } catch (e) { console.error('Meta CAPI:', e.message); }

  // Notifications — fire and forget
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Confirmation to submitter
    resend.emails.send({
      from: 'TMI <support@tmitechai.com>',
      to: email,
      subject: `Got it, ${first_name} — let's talk`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5ef;-webkit-font-smoothing:antialiased;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5ef;"><tr><td align="center" style="padding:28px 14px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid #e7e8e1;border-radius:16px;overflow:hidden;"><tr><td style="background:#0a0b14;padding:18px 30px;"><span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">TMI</span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#E4FF97;margin-left:5px;"></span></td></tr><tr><td style="padding:34px 30px 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.7;">
<p style="margin:0 0 6px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">TMI Technology</p>
<h2 style="margin:0 0 20px;font-size:28px;font-weight:800;letter-spacing:-0.02em;line-height:1.1;">We got your request.</h2>
<p style="font-size:15px;color:#444;margin:0 0 20px;line-height:1.65;">I'll review what you shared about ${company || 'your operation'} and reach out within one business day to set up your strategy call.</p>
<p style="font-size:15px;color:#444;margin:0 0 28px;line-height:1.65;">If you want to move faster, you can book directly:</p>
<a href="${SITE}/booking" style="display:inline-block;background:#E4FF97;color:#0a0b14;font-weight:700;font-size:14px;padding:14px 32px;border-radius:999px;text-decoration:none;">Book Your Call Now &rarr;</a>
<p style="margin:36px 0 0;font-size:14px;line-height:1.7;">Mia<br><span style="color:#888;font-size:13px;">TMI &mdash; AI Infrastructure for Field Operations</span></p>
</td></tr><tr><td style="padding:6px 30px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><div style="border-top:1px solid #eceee4;margin-top:8px;padding-top:16px;font-size:12px;line-height:1.6;color:#9a9ba5;">TMI Technology &middot; chaos control for growing companies<br><a href="https://www.tmitechai.com" style="color:#6f8f2a;text-decoration:none;">tmitechai.com</a></div></td></tr></table></td></tr></table></body></html>`,
    }).catch(e => console.error('confirmation email:', e.message));

    // Internal alert to Mia
    resend.emails.send({
      from: 'TMI <support@tmitechai.com>',
      to: OWNER_EMAIL,
      subject: `Strategy call request: ${name} — ${company || 'no company'}`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5ef;-webkit-font-smoothing:antialiased;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5ef;"><tr><td align="center" style="padding:28px 14px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid #e7e8e1;border-radius:16px;overflow:hidden;"><tr><td style="background:#0a0b14;padding:18px 30px;"><span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">TMI</span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#E4FF97;margin-left:5px;"></span></td></tr><tr><td style="padding:34px 30px 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.7;">
<p style="margin:0 0 4px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">New Contact Form Submission</p>
<h2 style="margin:0 0 20px;font-size:22px;font-weight:800;">${name}</h2>
<table width="100%" style="border-collapse:collapse;background:#f9f9f9;border-radius:8px;overflow:hidden;margin-bottom:20px;">
  <tr><td style="padding:8px 14px;font-size:13px;color:#888;width:30%">Email</td><td style="padding:8px 14px;font-size:13px;font-weight:600"><a href="mailto:${email}" style="color:#5a9e00">${email}</a></td></tr>
  <tr style="background:#f3f3f3"><td style="padding:8px 14px;font-size:13px;color:#888">Company</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${company || '—'}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#888">Team Size</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${team_size || '—'}</td></tr>
  <tr style="background:#f3f3f3"><td style="padding:8px 14px;font-size:13px;color:#888">Industry</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${industry || '—'}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#888">Pain Areas</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${areasArr.join(', ') || '—'}</td></tr>
  <tr style="background:#f3f3f3"><td style="padding:8px 14px;font-size:13px;color:#888">Problem</td><td style="padding:8px 14px;font-size:13px">${biggest_problem || '—'}</td></tr>
</table>
<a href="https://admin.tmitechai.com/admin-leads" style="font-size:13px;color:#5a9e00">View in Admin &rarr;</a>
</td></tr><tr><td style="padding:6px 30px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><div style="border-top:1px solid #eceee4;margin-top:8px;padding-top:16px;font-size:12px;line-height:1.6;color:#9a9ba5;">TMI Technology &middot; chaos control for growing companies<br><a href="https://www.tmitechai.com" style="color:#6f8f2a;text-decoration:none;">tmitechai.com</a></div></td></tr></table></td></tr></table></body></html>`,
    }).catch(e => console.error('internal email:', e.message));
  } catch (e) {
    console.error('Resend:', e.message);
  }

  // SMS alert to Mia
  try {
    const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    sms.messages.create({
      body: `Strategy call: ${name} | ${company || '—'} | ${email} | ${phone || 'no phone'} | ${industry || '—'} | team: ${team_size || '—'}`,
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
