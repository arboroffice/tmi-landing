// TMI OS — small notification mailer. Lets TMI tell a client something happened
// in their OS (a build went live, a connection is now flowing) by emailing the
// company's owners and managers. Degrades safely: no email provider or no
// recipients means it is a quiet no-op, never an error. Uses the same sender as
// the weekly digest.

const db = require('./_db');

const FROM = 'TMI OS <support@tmitechai.com>';
const APP_URL = 'https://os.tmitechai.com';

async function owners(tid) {
  const users = await db.list('os_users', { where: [['tenant_id', '==', tid]] }).catch(() => []);
  return users
    .filter((u) => u.email && u.status !== 'invited' && ['owner', 'manager'].includes(u.role || 'owner'))
    .map((u) => u.email);
}

function shell(title, lines) {
  const body = lines.map((l) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#1a1a1a">${l}</p>`).join('');
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:28px 24px">
    <div style="font-weight:800;font-size:16px;letter-spacing:-0.01em;color:#0a0b14;margin-bottom:20px">TMI OS</div>
    <h1 style="font-size:21px;line-height:1.25;color:#0a0b14;margin:0 0 16px">${title}</h1>
    ${body}
    <a href="${APP_URL}/os/app" style="display:inline-block;margin-top:8px;background:#E4FF97;color:#0a0b14;font-weight:700;font-size:14px;text-decoration:none;padding:11px 20px;border-radius:999px">Open your OS</a>
  </div>`;
}

// Notify a tenant's owners/managers. Returns { sent } (0 when quiet).
async function notify(tenant, subject, title, lines) {
  if (!process.env.RESEND_API_KEY) return { sent: 0 };
  const to = await owners(tenant.id);
  if (!to.length) return { sent: 0 };
  try {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const html = shell(title, lines);
    const text = title + '\n\n' + lines.join('\n\n').replace(/<[^>]+>/g, '');
    await resend.emails.send({ from: FROM, to, subject, html, text });
    return { sent: to.length };
  } catch (e) {
    console.error('_osmail:', e.message);
    return { sent: 0 };
  }
}

module.exports = { notify, owners, FROM };
