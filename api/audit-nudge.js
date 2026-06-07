const { getSupabase } = require('./_supabase');
const { Resend } = require('resend');
const twilio = require('twilio');

const FROM_NUMBER = '+18557171044';
const SITE = 'https://www.tmitechai.com';

function formatPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  return digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
}

function resumeEmailHtml(firstName, resumeLink, unsubUrl) {
  return `<!DOCTYPE html><html><body style="background:#fff;font-family:Arial,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:40px 24px;line-height:1.7;">
<p style="margin:0 0 6px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">TMI Business Audit</p>
<h1 style="margin:0 0 16px;font-size:28px;font-weight:800;line-height:1.1;letter-spacing:-0.02em;color:#0a0b14;">You're a few minutes from your results</h1>
<p style="margin:0 0 20px;font-size:15px;color:#444;line-height:1.65;">Hey ${firstName}, you started your TMI audit but didn't quite finish. It takes about 3 more minutes, and at the end you get your dependency score, your biggest operational leak, and the first move to fix it.</p>
<p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.65;">Pick up right where you left off. Your answers are pre-filled.</p>
<a href="${resumeLink}" style="display:inline-block;background:#E4FF97;color:#0a0b14;font-weight:700;font-size:14px;padding:14px 32px;border-radius:999px;text-decoration:none;">Finish my audit →</a>
<p style="margin:28px 0 0;font-size:14px;color:#555;line-height:1.65;">It's free, and there's no pitch at the end. Just a clear read on your operation.</p>
<p style="margin:24px 0 0;font-size:14px;">Mia<br><span style="color:#888;font-size:13px;">TMI — Intelligent Infrastructure for Field Operations</span></p>
<p style="margin:40px 0 0;font-size:11px;color:#bbb;border-top:1px solid #eee;padding-top:16px;"><a href="${unsubUrl}" style="color:#bbb;">Unsubscribe</a></p>
</body></html>`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const { leadId, name, email, phone, company } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });

  let db;
  try { db = getSupabase(); } catch (e) {
    return res.status(503).json({ error: 'db not configured' });
  }

  // Check if audit was fully completed
  const { data: submission } = await db
    .from('audit_submissions')
    .select('id, created_at')
    .eq('email', email.toLowerCase().trim())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (submission) {
    // Audit complete — no nudge needed
    return res.status(200).json({ ok: true, skipped: 'audit_complete' });
  }

  // Check if we already sent a nudge for this lead
  if (leadId) {
    const { data: lead } = await db.from('leads').select('notes, status').eq('id', leadId).single();
    const notes = (() => { try { return JSON.parse(lead?.notes || '{}'); } catch { return {}; } })();
    if (notes.nudge_sent || lead?.status === 'audit_nudge_sent') {
      return res.status(200).json({ ok: true, skipped: 'nudge_already_sent' });
    }
  }

  // Build resume link — pre-fills contact form and jumps back into the quiz
  const params = new URLSearchParams({
    n: name || '',
    e: email,
    p: phone || '',
    c: company || '',
  });
  const resumeLink = `${SITE}/audit?resume=1&${params.toString()}`;
  const firstName = (name || 'there').split(' ')[0];
  const unsubUrl = leadId
    ? `${SITE}/api/unsubscribe?id=${leadId}`
    : `${SITE}/api/unsubscribe?email=${encodeURIComponent(email.toLowerCase().trim())}`;

  let emailSent = false;
  let smsSent = false;

  // Email nudge — always sent, since email is the one contact field we always have
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'TMI <support@tmitechai.com>',
      to: email,
      subject: `${firstName}, your TMI audit is almost done`,
      html: resumeEmailHtml(firstName, resumeLink, unsubUrl),
    });
    emailSent = true;
  } catch (e) {
    console.error('nudge email:', e.message);
  }

  // SMS nudge — only when we captured a phone number
  if (phone) {
    try {
      const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await sms.messages.create({
        body: `Hey ${firstName} - looks like you didn't finish your TMI audit. Pick up where you left off: ${resumeLink}`,
        from: FROM_NUMBER,
        to: formatPhone(phone),
      });
      smsSent = true;
    } catch (e) {
      console.error('nudge SMS:', e.message);
    }
  }

  // If neither touch went out, leave the lead un-nudged so a retry can try again
  if (!emailSent && !smsSent) {
    return res.status(500).json({ error: 'nudge failed to send', email_sent: false, sms_sent: false });
  }

  // Mark nudge sent so it never fires again
  if (leadId) {
    const { data: lead } = await db.from('leads').select('notes').eq('id', leadId).single();
    const notes = (() => { try { return JSON.parse(lead?.notes || '{}'); } catch { return {}; } })();
    await db.from('leads').update({
      status: 'audit_nudge_sent',
      notes: JSON.stringify({
        ...notes,
        nudge_sent: true,
        nudge_sent_at: new Date().toISOString(),
        nudge_channels: { email: emailSent, sms: smsSent },
      }),
    }).eq('id', leadId);
  }

  return res.status(200).json({ ok: true, email_sent: emailSent, sms_sent: smsSent });
};
