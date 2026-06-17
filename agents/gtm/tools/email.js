import { Resend } from 'resend';
import { SENDER } from '../config.js';

let _resend;
function resend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_OUTREACH_API_KEY || process.env.RESEND_API_KEY);
  return _resend;
}

// ── Sending inbox rotation (deliverability at volume) ───────────────────────
// Spread sends across multiple verified from-addresses / domains. Configure with:
//   OUTREACH_INBOXES="Mia <mia@mail.tmitechai.com>, Mia Louviere <mia@send.tmitechai.com>"
// Each domain must be verified in Resend. Falls back to SENDER.from.
function parseInbox(s) {
  const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: (m[1] || SENDER.name).trim(), from: m[2].trim() };
  return { name: SENDER.name, from: s.trim() };
}
const INBOXES = (process.env.OUTREACH_INBOXES || '')
  .split(',').map(x => x.trim()).filter(Boolean).map(parseInbox);
if (!INBOXES.length) INBOXES.push({ name: SENDER.name, from: SENDER.from });

let _rr = 0;
function pickInbox() {
  const box = INBOXES[_rr % INBOXES.length];
  _rr++;
  return box;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Embed the personalized audit card image in cold emails by default; disable with EMBED_AUDIT_IMAGE=false
const EMBED_IMAGE = String(process.env.EMBED_AUDIT_IMAGE ?? 'true').toLowerCase() !== 'false';

export async function sendEmail({ to, toName, subject, body, imageUrl, auditUrl, cc }) {
  const box = pickInbox();
  // Break-in safety: CC yourself on sends via OUTREACH_CC (or per-call cc).
  const ccAddr = cc || process.env.OUTREACH_CC || undefined;

  const paras = body.split('\n').map(l => l.trim()).filter(Boolean)
    .map(l => `<p style="margin:0 0 14px;">${esc(l)}</p>`).join('');

  const imageBlock = (EMBED_IMAGE && imageUrl) ? `
    <a href="${esc(auditUrl || imageUrl)}" style="display:block;margin:20px 0 6px;text-decoration:none;">
      <img src="${esc(imageUrl)}" alt="${esc(toName ? toName + "'s" : 'Your')} operational intelligence review" width="560" style="display:block;width:100%;max-width:560px;height:auto;border-radius:10px;border:1px solid #e6e8ee;"/>
    </a>` : '';

  const html = `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.7;color:#1a1a1a;max-width:580px;">
${paras}${imageBlock}
</div>`;

  const text = body + ((imageUrl && auditUrl && !body.includes(auditUrl)) ? `\n\n${auditUrl}` : '');

  const { data, error } = await resend().emails.send({
    from: `${box.name} <${box.from}>`,
    reply_to: SENDER.replyTo,
    to: toName ? `${toName} <${to}>` : to,
    cc: ccAddr,
    subject,
    html,
    text,
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
