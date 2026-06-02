import { Resend } from 'resend';
import { SENDER } from '../config.js';

let _resend;
function resend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_OUTREACH_API_KEY || process.env.RESEND_API_KEY);
  return _resend;
}

export async function sendEmail({ to, toName, subject, body }) {
  // body should be plain text - we wrap it in minimal HTML
  const html = `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.7;color:#1a1a1a;max-width:580px;">
${body.split('\n').map(line => line.trim() ? `<p style="margin:0 0 14px;">${line}</p>` : '').join('')}
</div>`;

  const { data, error } = await resend().emails.send({
    from: `${SENDER.name} <${SENDER.from}>`,
    reply_to: SENDER.replyTo,
    to: toName ? `${toName} <${to}>` : to,
    subject,
    html,
    text: body,
    tags: [{ name: 'type', value: 'outbound_gtm' }],
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
  return data?.id;
}

export async function sendDigest({ subject, body }) {
  const digestEmail = process.env.GTM_DIGEST_EMAIL;
  if (!digestEmail) return;
  await resend().emails.send({
    from: `TMI GTM Agent <${SENDER.from}>`,
    to: digestEmail,
    subject,
    text: body,
  });
}
