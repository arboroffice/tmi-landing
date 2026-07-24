// TMI OS — password reset. Two steps, anti-enumeration on the request step.
//   POST { action:'request', email }            -> { ok:true }  (always)
//   POST { action:'confirm', token, password }   -> { ok:true }
// A one-hour, single-use token is stored in os_resets and emailed as a link.

const db = require('./_db');
const crypto = require('crypto');
const { hashPassword, cors } = require('./_tenant-auth');

const BASE = process.env.OS_BASE_URL || 'https://os.tmitechai.com';
const FROM = 'TMI OS <support@tmitechai.com>';
const TTL_MS = 60 * 60 * 1000;

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const b = req.body || {};
  const action = String(b.action || 'request');

  try {
    if (action === 'request') {
      const email = String(b.email || '').toLowerCase().trim();
      if (!email) return res.status(400).json({ error: 'Email required' });
      const user = await db.findOne('os_users', 'email', email).catch(() => null);
      if (user) {
        const token = crypto.randomBytes(32).toString('base64url');
        await db.insert('os_resets', {
          token, user_id: user.id, tenant_id: user.tenant_id, email,
          expires: Date.now() + TTL_MS, used: false, created_at: new Date().toISOString(),
        });
        const link = `${BASE}/os/reset?token=${encodeURIComponent(token)}`;
        if (process.env.RESEND_API_KEY) {
          try {
            const { Resend } = require('resend');
            await new Resend(process.env.RESEND_API_KEY).emails.send({
              from: FROM, to: email, subject: 'Reset your TMI OS password',
              html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a"><p>Reset your TMI OS password with the link below. It expires in one hour and can be used once.</p><p><a href="${link}" style="background:#E4FF97;color:#0a0b14;font-weight:700;padding:11px 20px;border-radius:8px;text-decoration:none;display:inline-block">Reset my password</a></p><p style="color:#888;font-size:13px">If you did not request this, ignore this email and your password stays the same.</p></div>`,
            });
          } catch (e) { console.error('os2-reset email:', e.message); }
        }
      }
      // Same response whether or not the email exists, so accounts cannot be enumerated.
      return res.status(200).json({ ok: true });
    }

    if (action === 'confirm') {
      const token = String(b.token || '');
      const password = String(b.password || '');
      if (!token || password.length < 8) return res.status(400).json({ error: 'A valid link and a password of at least 8 characters are required.' });
      const rec = await db.findOne('os_resets', 'token', token).catch(() => null);
      if (!rec || rec.used || !rec.expires || Number(rec.expires) < Date.now()) {
        return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
      }
      const user = await db.getById('os_users', rec.user_id).catch(() => null);
      if (!user) return res.status(400).json({ error: 'Account not found.' });
      await db.update('os_users', user.id, { password_hash: hashPassword(password) });
      await db.update('os_resets', rec.id, { used: true });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-reset:', e.message);
    return res.status(500).json({ error: 'Could not process that. Try again.' });
  }
};
