// Intelligence Assessment application intake.
// Saves the application to Firestore (visible in admin), upserts a contact +
// activity, emails a confirmation to the applicant and an alert to the owners,
// and texts the owner line on every submission. Best-effort throughout so a
// single failure never blocks the application.
//
// POST { first_name, last_name?, email, phone?, company?, revenue?, employees?,
//        industry?, current_software?, challenge?, source? } -> { ok }

const db = require('./_db');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const OWNER_EMAIL = ['support@tmitechai.com', 'mia@tmitechai.com'];

function emailWrap(body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5ef;-webkit-font-smoothing:antialiased;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5ef;"><tr><td align="center" style="padding:28px 14px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid #e7e8e1;border-radius:16px;overflow:hidden;"><tr><td style="background:#0a0b14;padding:18px 30px;"><span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">TMI</span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#E4FF97;margin-left:5px;"></span></td></tr><tr><td style="padding:34px 30px 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.7;">
${body}
</td></tr><tr><td style="padding:6px 30px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><div style="border-top:1px solid #eceee4;margin-top:8px;padding-top:16px;font-size:12px;line-height:1.6;color:#9a9ba5;">TMI Technology &middot; Intelligence Transformation Firm<br><a href="https://www.tmitechai.com" style="color:#6f8f2a;text-decoration:none;">tmitechai.com</a></div></td></tr></table></td></tr></table></body></html>`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const {
    first_name, last_name, email, phone, company,
    revenue, employees, industry, current_software, challenge, source,
  } = req.body || {};

  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  if (!first_name) return res.status(400).json({ error: 'First name required' });

  const fullName = [first_name, last_name].filter(Boolean).join(' ');
  const cleanEmail = email.toLowerCase().trim();

  // 1) Application record + contact + activity (best-effort)
  try {
    const record = await db.insert('assessment_applications', {
      first_name: first_name.trim(),
      last_name: (last_name || '').trim() || null,
      email: cleanEmail,
      phone: phone || null,
      company: company || null,
      revenue: revenue || null,
      employees: employees || null,
      industry: industry || null,
      current_software: current_software || null,
      challenge: challenge || null,
      source: source || 'intelligence-assessment',
      status: 'new',
    });

    const contact = await db.upsertByField('contacts', 'email', cleanEmail, {
      first_name: first_name.trim(),
      last_name: (last_name || '').trim() || null,
      email: cleanEmail,
      phone: phone || null,
      company: company || null,
      notes: `Intelligence Assessment applicant${company ? ' — ' + company : ''}`,
    });

    if (contact?.id && record?.id) {
      await db.update('assessment_applications', record.id, { contact_id: contact.id }).catch(() => {});
      await db.insert('activities', {
        contact_id: contact.id,
        type: 'note',
        title: 'Intelligence Assessment application submitted',
        body: `Company: ${company || '—'}\nRevenue: ${revenue || '—'}\nEmployees: ${employees || '—'}\nIndustry: ${industry || '—'}\nCurrent software: ${current_software || '—'}\n\nBiggest challenge: ${challenge || '—'}`,
      }).catch(() => {});
    }
  } catch (e) {
    console.error('assessment-apply DB:', e.message);
  }

  // 2) Emails: applicant confirmation + owner alert (best-effort)
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);

      resend.emails.send({
        from: 'TMI <support@tmitechai.com>',
        to: cleanEmail,
        subject: `Your Intelligence Assessment application, ${first_name}`,
        html: emailWrap(
          `<p style="margin:0 0 6px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">TMI Intelligence Assessment</p>
<h2 style="margin:0 0 20px;font-size:28px;font-weight:800;letter-spacing:-0.02em;line-height:1.1;">We got your application.</h2>
<p style="font-size:15px;color:#444;margin:0 0 20px;line-height:1.65;">Thanks, ${first_name}. Before we talk, we'll research your company, your competitors, your current systems, and where AI actually belongs, so the first meeting starts with insight, not introductions.</p>
<p style="font-size:15px;color:#444;margin:0 0 32px;line-height:1.65;">We'll be in touch within 2 business days to schedule your Executive Intelligence Assessment.</p>`
        ),
      }).catch(e => console.error('assessment confirmation email:', e.message));

      resend.emails.send({
        from: 'TMI <support@tmitechai.com>',
        to: OWNER_EMAIL,
        subject: `Intelligence Assessment: ${fullName}${company ? ' — ' + company : ''}`,
        html: emailWrap(
          `<p style="margin:0 0 4px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">New Intelligence Assessment application</p>
<h2 style="margin:0 0 20px;font-size:22px;font-weight:800;">${fullName}${company ? ' — ' + company : ''}</h2>
<table width="100%" style="border-collapse:collapse;background:#f9f9f9;border-radius:8px;overflow:hidden;margin-bottom:20px;">
  <tr><td style="padding:8px 14px;font-size:13px;color:#888;width:38%">Email</td><td style="padding:8px 14px;font-size:13px;font-weight:600"><a href="mailto:${cleanEmail}" style="color:#5a9e00">${cleanEmail}</a></td></tr>
  <tr style="background:#f3f3f3"><td style="padding:8px 14px;font-size:13px;color:#888">Phone</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${phone || '—'}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#888">Revenue</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${revenue || '—'}</td></tr>
  <tr style="background:#f3f3f3"><td style="padding:8px 14px;font-size:13px;color:#888">Employees</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${employees || '—'}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#888">Industry</td><td style="padding:8px 14px;font-size:13px">${industry || '—'}</td></tr>
  <tr style="background:#f3f3f3"><td style="padding:8px 14px;font-size:13px;color:#888">Current software</td><td style="padding:8px 14px;font-size:13px">${current_software || '—'}</td></tr>
</table>
${challenge ? `<p style="font-size:13px;color:#555;line-height:1.6;margin-bottom:16px"><strong>Biggest challenge:</strong><br>${challenge}</p>` : ''}
<a href="https://admin.tmitechai.com/admin-assessment" style="font-size:13px;color:#5a9e00">View in Admin &rarr;</a>`
        ),
      }).catch(e => console.error('assessment owner email:', e.message));
    } catch (e) {
      console.error('assessment email:', e.message);
    }
  }

  // 3) Owner SMS alert on every submission (best-effort)
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const sms = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      sms.messages.create({
        body: `Intelligence Assessment: ${fullName}${company ? ' | ' + company : ''}${revenue ? ' | ' + revenue : ''}${industry ? ' | ' + industry : ''} | ${cleanEmail}`,
        from: FROM_NUMBER,
        to: ALERT_NUMBER,
      }).catch(e => console.error('assessment SMS:', e.message));
    } catch (e) {
      console.error('assessment Twilio:', e.message);
    }
  }

  res.status(200).json({ ok: true });
};
