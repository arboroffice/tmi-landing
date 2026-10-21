// TMI OS is invitation only. An invite is a one-time link Mia sends from admin
// (or that goes out on its own when someone pays for the Intelligent Company
// Audit). The raw token only lives in the link; the database keeps a hash.
//   create({ email, name, company, plan, source }) -> { id, link }
//   check(token) -> invite or null (unused and not expired)
//   use(token, tenantId)
const crypto = require('crypto');
const db = require('./_db');

const OS = 'https://os.tmitechai.com';
const DAYS = 30;
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function create({ email, name, company, plan, source, by }) {
  const token = crypto.randomBytes(24).toString('base64url');
  const now = new Date();
  await db.update('os_invites', hash(token), {
    email: email ? String(email).toLowerCase().trim() : null, name: name || null, company: company || null,
    plan: plan || 'trial', source: source || 'admin', created_by: by || null,
    created_at: now.toISOString(), expires_at: new Date(now.getTime() + DAYS * 864e5).toISOString(), used_at: null,
  });
  return { id: hash(token), link: `${OS}/?invite=${encodeURIComponent(token)}` };
}

async function check(token) {
  if (!token) return null;
  const inv = await db.getById('os_invites', hash(token)).catch(() => null);
  if (!inv || inv.used_at || inv.revoked_at || new Date(inv.expires_at) < new Date()) return null;
  return inv;
}

async function use(token, tenantId) {
  await db.update('os_invites', hash(token), { used_at: new Date().toISOString(), tenant_id: tenantId || null });
}

// The invite email. Plain and short, signed by Mia.
async function send({ email, name, company, link, paid }) {
  if (!email || !process.env.RESEND_API_KEY) return false;
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';
  const intro = paid
    ? `Your Intelligent Company Audit is paid, so your ${esc(company || 'company')} workspace in TMI OS is ready for you.`
    : `You're invited to TMI OS, the workspace where TMI Tech AI builds and runs the operating system for ${esc(company || 'your company')}.`;
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#f0efe9;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0efe9;"><tr><td align="center" style="padding:28px 14px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#fff;border:1px solid #e7e8e1;border-radius:16px;overflow:hidden;">
<tr><td style="background:#0a0b14;padding:18px 30px;"><span style="font-family:Helvetica,Arial,sans-serif;font-size:19px;font-weight:800;color:#fff;">TMI OS</span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#c9ff19;margin-left:6px;"></span></td></tr>
<tr><td style="padding:32px 30px 26px;font-family:Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.65;">
<p style="margin:0 0 16px;">Hey ${esc(first)},</p>
<p style="margin:0 0 16px;">${intro}</p>
<p style="margin:0 0 16px;">It takes about 5 minutes to set up. Tell it your website and it lays out your departments, the numbers to watch, and where the work gets stuck. Everything we build for you shows up there too.</p>
<p style="margin:0 0 26px;"><a href="${link}" style="display:inline-block;background:#c9ff19;color:#0a0b14;font-weight:800;text-decoration:none;padding:13px 22px;border-radius:999px;">Set up my workspace &rarr;</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#666;">This link is just for you and works once. It expires in ${DAYS} days.</p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">TMI Tech AI</span></p></td></tr></table></td></tr></table></body></html>`;
  try {
    const { Resend } = require('resend');
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: 'Mia at TMI Tech AI <support@tmitechai.com>', to: email, reply_to: 'support@tmitechai.com',
      subject: paid ? 'Your TMI OS workspace is ready' : 'Your invite to TMI OS', html,
    });
    return true;
  } catch (e) { console.error('os invite email:', e.message); return false; }
}

module.exports = { create, check, use, send, hash };
