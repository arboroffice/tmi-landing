// Venture Studio application intake.
// Saves the quiz-style application to Firestore (visible in admin), upserts a
// contact + activity, emails a confirmation to the applicant and an alert to
// the owners, and texts the owner line on every submission. Every external
// step is best-effort so a single failure never blocks the application.
//
// POST { first_name, last_name?, email, phone?, industry?, years_experience?,
//        customers?, goal?, source? } -> { ok }

const db = require('./_db');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const OWNER_EMAIL = ['support@tmitechai.com', 'mia@tmitechai.com'];

function emailWrap(body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5ef;-webkit-font-smoothing:antialiased;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5ef;"><tr><td align="center" style="padding:28px 14px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid #e7e8e1;border-radius:16px;overflow:hidden;"><tr><td style="background:#0a0b14;padding:18px 30px;"><span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">TMI</span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#E4FF97;margin-left:5px;"></span></td></tr><tr><td style="padding:34px 30px 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.7;">
${body}
</td></tr><tr><td style="padding:6px 30px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><div style="border-top:1px solid #eceee4;margin-top:8px;padding-top:16px;font-size:12px;line-height:1.6;color:#9a9ba5;">TMI Technology &middot; TMI Venture Studio<br><a href="https://www.tmitechai.com" style="color:#6f8f2a;text-decoration:none;">tmitechai.com</a></div></td></tr></table></td></tr></table></body></html>`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const {
    first_name, last_name, email, phone,
    industry, years_experience, customers, goal, source,
  } = req.body || {};

  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  if (!first_name) return res.status(400).json({ error: 'First name required' });

  const fullName = [first_name, last_name].filter(Boolean).join(' ');
  const cleanEmail = email.toLowerCase().trim();

  // 1) Application record + contact + activity (best-effort)
  try {
    const record = await db.insert('venture_applications', {
      first_name: first_name.trim(),
      last_name: (last_name || '').trim() || null,
      email: cleanEmail,
      phone: phone || null,
      industry: industry || null,
      years_experience: years_experience || null,
      customers: customers || null,
      goal: goal || null,
      source: source || 'venture-studio-page',
      status: 'new',
    });

    const contact = await db.upsertByField('contacts', 'email', cleanEmail, {
      first_name: first_name.trim(),
      last_name: (last_name || '').trim() || null,
      email: cleanEmail,
      phone: phone || null,
      notes: `Venture Studio applicant${industry ? ' — ' + industry : ''}`,
    });

    if (contact?.id && record?.id) {
      await db.update('venture_applications', record.id, { contact_id: contact.id }).catch(() => {});
      await db.insert('activities', {
        contact_id: contact.id,
        type: 'note',
        title: 'Venture Studio application submitted',
        body: `Industry: ${industry || '—'}\nExperience: ${years_experience || '—'}\nCustomers: ${customers || '—'}\nGoal: ${goal || '—'}`,
      }).catch(() => {});
    }
  } catch (e) {
    console.error('venture-apply DB:', e.message);
  }

  // 2) Emails: applicant confirmation + owner alert (best-effort)
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);

      resend.emails.send({
        from: 'TMI <support@tmitechai.com>',
        to: cleanEmail,
        subject: `Got your Venture Studio application, ${first_name}`,
        html: emailWrap(
          `<p style="margin:0 0 6px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">TMI Venture Studio</p>
<h2 style="margin:0 0 20px;font-size:28px;font-weight:800;letter-spacing:-0.02em;line-height:1.1;">We got your application.</h2>
<p style="font-size:15px;color:#444;margin:0 0 20px;line-height:1.65;">Thanks, ${first_name}. We'll review what you shared about your industry and reach out within 3 business days to set up your strategy session, where we map what an AI company in your space could look like.</p>
<p style="font-size:15px;color:#444;margin:0 0 32px;line-height:1.65;">You bring the industry expertise. We bring the research, the engineers, and the plan.</p>`
        ),
      }).catch(e => console.error('venture confirmation email:', e.message));

      resend.emails.send({
        from: 'TMI <support@tmitechai.com>',
        to: OWNER_EMAIL,
        subject: `Venture Studio application: ${fullName}${industry ? ' — ' + industry : ''}`,
        html: emailWrap(
          `<p style="margin:0 0 4px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">New Venture Studio Application</p>
<h2 style="margin:0 0 20px;font-size:22px;font-weight:800;">${fullName}</h2>
<table width="100%" style="border-collapse:collapse;background:#f9f9f9;border-radius:8px;overflow:hidden;margin-bottom:20px;">
  <tr><td style="padding:8px 14px;font-size:13px;color:#888;width:38%">Email</td><td style="padding:8px 14px;font-size:13px;font-weight:600"><a href="mailto:${cleanEmail}" style="color:#5a9e00">${cleanEmail}</a></td></tr>
  <tr style="background:#f3f3f3"><td style="padding:8px 14px;font-size:13px;color:#888">Phone</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${phone || '—'}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#888">Industry</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${industry || '—'}</td></tr>
  <tr style="background:#f3f3f3"><td style="padding:8px 14px;font-size:13px;color:#888">Experience</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${years_experience || '—'}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#888">Customers</td><td style="padding:8px 14px;font-size:13px">${customers || '—'}</td></tr>
  <tr style="background:#f3f3f3"><td style="padding:8px 14px;font-size:13px;color:#888">Goal</td><td style="padding:8px 14px;font-size:13px">${goal || '—'}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#888">Source</td><td style="padding:8px 14px;font-size:13px">${source || '—'}</td></tr>
</table>
<a href="https://admin.tmitechai.com/admin-venture" style="font-size:13px;color:#5a9e00">View in Admin &rarr;</a>`
        ),
      }).catch(e => console.error('venture owner email:', e.message));
    } catch (e) {
      console.error('venture email:', e.message);
    }
  }

  // 3) Owner SMS alert on every submission (best-effort)
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const sms = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      sms.messages.create({
        body: `Venture Studio app: ${fullName} | ${cleanEmail}${phone ? ' | ' + phone : ''}${industry ? ' | ' + industry : ''}${goal ? ' | goal: ' + goal : ''}`,
        from: FROM_NUMBER,
        to: ALERT_NUMBER,
      }).catch(e => console.error('venture SMS:', e.message));
    } catch (e) {
      console.error('venture Twilio:', e.message);
    }
  }

  res.status(200).json({ ok: true });
};
