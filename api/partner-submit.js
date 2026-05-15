const { getSupabase } = require('./_supabase');
const { Resend } = require('resend');
const twilio = require('twilio');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const OWNER_EMAIL = 'mia@elianatech.com';
const SITE = 'https://www.tmi-technology.com';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { name, email, company, partner_type, industries, platform, opportunity, website } = req.body || {};
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

  const firstName = (name || 'there').split(' ')[0];
  const notes = [
    partner_type  ? `Partner type: ${partner_type}`  : '',
    industries    ? `Industries: ${industries}`       : '',
    platform      ? `Platform/tools: ${platform}`    : '',
    opportunity   ? `Opportunity: ${opportunity}`     : '',
    website       ? `Website: ${website}`             : '',
  ].filter(Boolean).join('\n');

  try {
    const db = getSupabase();

    const { data: contact } = await db.from('contacts').upsert({
      first_name: firstName,
      last_name: (name || '').split(' ').slice(1).join(' ') || null,
      email: email.toLowerCase().trim(),
      company: company || null,
      audience: 'partner',
      niche: industries || null,
      notes: notes || null,
    }, { onConflict: 'email' }).select('id').single();

    const { data: lead } = await db.from('leads').insert({
      contact_id: contact?.id || null,
      name: name || null,
      email: email.toLowerCase().trim(),
      status: 'new',
      source: 'partner-form',
      notes: notes || null,
    }).select('id').single();

    if (contact?.id) {
      db.from('activities').insert({
        contact_id: contact.id,
        lead_id: lead?.id || null,
        type: 'note',
        title: 'Partner application submitted',
        body: notes || null,
      }).then(() => {}).catch(() => {});
    }
  } catch (e) {
    console.error('Supabase partner-submit:', e.message);
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  resend.emails.send({
    from: 'TMI <support@tmitechai.com>',
    to: email,
    subject: `Got your partner application, ${firstName}`,
    html: `<!DOCTYPE html><html><body style="background:#fff;font-family:Arial,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:40px 24px;line-height:1.7;">
<p style="margin:0 0 6px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">TMI Technology</p>
<h2 style="margin:0 0 20px;font-size:28px;font-weight:800;letter-spacing:-0.02em;line-height:1.1;">We got your application.</h2>
<p style="font-size:15px;color:#444;margin:0 0 20px;line-height:1.65;">I'll review what you shared and reach out within a few business days to talk through how we can build together.</p>
<p style="font-size:15px;color:#444;margin:0 0 28px;line-height:1.65;">If you want to move faster, book a call directly:</p>
<a href="${SITE}/booking" style="display:inline-block;background:#E4FF97;color:#0a0b14;font-weight:700;font-size:14px;padding:14px 32px;border-radius:999px;text-decoration:none;">Book a Call &rarr;</a>
<p style="margin:36px 0 0;font-size:14px;line-height:1.7;">Mia<br><span style="color:#888;font-size:13px;">TMI &mdash; AI Infrastructure for Field Operations</span></p>
</body></html>`,
  }).catch(e => console.error('partner confirmation email:', e.message));

  resend.emails.send({
    from: 'TMI <support@tmitechai.com>',
    to: OWNER_EMAIL,
    subject: `Partner application: ${name || email} — ${company || 'no company'}`,
    html: `<!DOCTYPE html><html><body style="background:#fff;font-family:Arial,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:32px 24px;line-height:1.6;">
<p style="margin:0 0 4px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">New Partner Application</p>
<h2 style="margin:0 0 20px;font-size:22px;font-weight:800;">${name || email}</h2>
<table width="100%" style="border-collapse:collapse;background:#f9f9f9;border-radius:8px;overflow:hidden;margin-bottom:20px;">
  <tr><td style="padding:8px 14px;font-size:13px;color:#888;width:35%">Email</td><td style="padding:8px 14px;font-size:13px;font-weight:600"><a href="mailto:${email}" style="color:#5a9e00">${email}</a></td></tr>
  <tr style="background:#f3f3f3"><td style="padding:8px 14px;font-size:13px;color:#888">Company</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${company || '—'}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#888">Partner Type</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${partner_type || '—'}</td></tr>
  <tr style="background:#f3f3f3"><td style="padding:8px 14px;font-size:13px;color:#888">Industries</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${industries || '—'}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#888">Platform/Tools</td><td style="padding:8px 14px;font-size:13px">${platform || '—'}</td></tr>
  <tr style="background:#f3f3f3"><td style="padding:8px 14px;font-size:13px;color:#888">Website</td><td style="padding:8px 14px;font-size:13px">${website || '—'}</td></tr>
</table>
${opportunity ? `<p style="font-size:13px;color:#555;line-height:1.6"><strong>Opportunity:</strong><br>${opportunity}</p>` : ''}
<a href="https://admin.tmitechai.com/leads" style="font-size:13px;color:#5a9e00">View in Admin &rarr;</a>
</body></html>`,
  }).catch(e => console.error('partner internal email:', e.message));

  try {
    const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    sms.messages.create({
      body: `Partner app: ${name || '—'} | ${company || '—'} | ${email} | ${partner_type || '—'} | ${industries || '—'}`,
      from: FROM_NUMBER,
      to: ALERT_NUMBER,
    }).catch(e => console.error('partner SMS:', e.message));
  } catch (e) {
    console.error('Twilio:', e.message);
  }

  res.status(200).json({ ok: true });
};
