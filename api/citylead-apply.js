const { getSupabase } = require('./_supabase');
const { Resend } = require('resend');

const OWNER_EMAIL = 'mia@tmitechai.com';
const ADMIN_URL = 'https://admin.tmitechai.com/admin-applications';

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

  const { name, email, phone, city, state, connections, message } = req.body || {};
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  if (!name) return res.status(400).json({ error: 'Name required' });

  const formattedPhone = formatPhone(phone);
  const territory = [city, state].filter(Boolean).join(', ');
  const firstName = (name || '').split(' ')[0] || 'there';
  const fullMessage = [
    message,
    connections ? `Business connections in area: ${connections}` : null,
    territory ? `Territory: ${territory}` : null,
  ].filter(Boolean).join('\n\n');

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: 'DB unavailable' }); }

  // Save to applications table
  try {
    const { error: aErr } = await db.from('applications').insert({
      name,
      email: email.toLowerCase().trim(),
      phone: formattedPhone,
      company: territory || null,
      audience: 'cityleads',
      source: 'cityleads-apply',
      status: 'new',
      message: fullMessage,
    });
    if (aErr) console.error('citylead application insert:', aErr.message);
  } catch (e) {
    console.error('Supabase:', e.message);
  }

  // Send emails
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Internal alert
    resend.emails.send({
      from: 'TMI <support@tmitechai.com>',
      to: OWNER_EMAIL,
      subject: `New City Lead Application: ${name} — ${territory || 'no territory'}`,
      html: `<!DOCTYPE html><html><body style="background:#fff;font-family:Arial,sans-serif;color:#111;max-width:480px;margin:0 auto;padding:32px 24px;line-height:1.6;">
<p style="margin:0 0 4px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">New City Lead Application</p>
<h2 style="margin:0 0 20px;font-size:22px;font-weight:800;">${name}</h2>
<table width="100%" style="border-collapse:collapse;background:#f9f9f9;border-radius:8px;overflow:hidden;margin-bottom:20px;">
  <tr><td style="padding:8px 14px;font-size:13px;color:#888;width:30%">Email</td><td style="padding:8px 14px;font-size:13px;font-weight:600"><a href="mailto:${email}" style="color:#5a9e00">${email}</a></td></tr>
  <tr style="background:#f3f3f3"><td style="padding:8px 14px;font-size:13px;color:#888">Phone</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${phone || '—'}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#888">Territory</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${territory || '—'}</td></tr>
  <tr style="background:#f3f3f3"><td style="padding:8px 14px;font-size:13px;color:#888">Connections</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${connections || '—'}</td></tr>
</table>
<p style="font-size:13px;color:#888;margin-bottom:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Why they want to join</p>
<p style="font-size:14px;color:#333;line-height:1.65;margin:0 0 24px;padding:16px;background:#f5f5f5;border-radius:6px;">${message || '—'}</p>
<a href="${ADMIN_URL}?audience=cityleads" style="font-size:13px;color:#5a9e00;font-weight:600;">View in Admin &rarr;</a>
</body></html>`,
    }).catch(e => console.error('internal email:', e.message));

    // Confirmation to applicant
    resend.emails.send({
      from: 'TMI <support@tmitechai.com>',
      to: email,
      subject: `City Lead application received, ${firstName}`,
      html: `<!DOCTYPE html><html><body style="background:#fff;font-family:Arial,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:40px 24px;line-height:1.7;">
<p style="margin:0 0 6px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">TMI City Leads</p>
<h2 style="margin:0 0 20px;font-size:28px;font-weight:800;letter-spacing:-0.02em;line-height:1.1;">Application received.</h2>
<p style="font-size:15px;color:#444;margin:0 0 16px;line-height:1.65;">We review every City Lead application personally. You'll hear back within 48 hours.</p>
<p style="font-size:15px;color:#444;margin:0 0 28px;line-height:1.65;">In the meantime, here's what you need to know: City Leads work in their own market, at their own pace. Your job is identifying businesses. Our job is everything else.</p>
<p style="margin:36px 0 0;font-size:14px;line-height:1.7;">Mia &amp; Tyler<br><span style="color:#888;font-size:13px;">TMI &mdash; AI Infrastructure for Field Operations</span></p>
</body></html>`,
    }).catch(e => console.error('confirmation email:', e.message));
  } catch (e) {
    console.error('Resend:', e.message);
  }

  res.status(200).json({ ok: true });
};
