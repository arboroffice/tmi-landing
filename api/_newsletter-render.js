// On-brand HTML renderer for Founders of the Future letters.
// Shared by api/newsletter.js (real sends) and api/newsletter-test.js (test sends).
// Email-safe inline styles; Barlow web font with a system fallback. Chartreuse accent.

const SITE = 'https://www.tmitechai.com';
const CHART = '#E4FF97';
const INK = '#1a1a1a';

function bodyToHtml(body) {
  const s = (body || '').trim();
  if (!s) return '';
  if (/<(p|div|h[1-6]|ul|ol|table|img|a|br|blockquote)\b/i.test(s)) return s; // already HTML
  return s.split(/\n{2,}/).map(p =>
    `<p style="margin:0 0 18px;font-size:16px;line-height:1.72;color:#33343d;">${p.trim().replace(/\n/g, '<br>')}</p>`
  ).join('');
}

function renderIssue(issue = {}, unsubUrl = SITE + '/api/nl-unsubscribe') {
  const fmt = issue.format || 'standard';
  const title = issue.title || '';
  const preheader = issue.preheader || '';
  const content = bodyToHtml(issue.body);
  const font = "'Barlow','Helvetica Neue',Helvetica,Arial,sans-serif";

  const titlePx = fmt === 'long-read' ? 36 : fmt === 'digest' ? 26 : 30;
  const center = fmt === 'announcement';

  const titleBlock = title ? `<h1 style="margin:0 0 22px;font-family:${font};font-size:${titlePx}px;font-weight:800;letter-spacing:-0.02em;line-height:1.12;color:${INK};${center ? 'text-align:center;' : ''}">${title}</h1>` : '';
  const divider = fmt === 'digest' ? `<div style="height:1px;background:#ececf0;margin:0 0 22px;"></div>` : '';

  const cta = (fmt === 'announcement' || fmt === 'standard')
    ? `<div style="${center ? 'text-align:center;' : ''}margin:30px 0 0;"><a href="${SITE}/audit" style="display:inline-block;background:${CHART};color:#0a0b14;font-family:${font};font-weight:700;font-size:14px;padding:14px 30px;border-radius:999px;text-decoration:none;">Get your free audit &rarr;</a></div>`
    : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:#f5f5f7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:32px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ececf0;">
  <tr><td style="background:#0a0b14;padding:22px 32px;">
    <table role="presentation" width="100%"><tr>
      <td style="font-family:${font};font-size:16px;font-weight:800;letter-spacing:0.04em;color:#ffffff;">TMI</td>
      <td align="right" style="font-family:${font};font-size:10px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:${CHART};">Founders of the Future</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:40px 36px 36px;">
    ${titleBlock}${divider}
    <div style="font-family:${font};">${content}</div>
    ${cta}
  </td></tr>
  <tr><td style="background:#f7f7f9;padding:22px 36px;border-top:1px solid #ececf0;">
    <p style="margin:0 0 6px;font-family:${font};font-size:12px;color:#8a8f9c;line-height:1.6;">Founders of the Future &middot; a weekly letter from the community we are building at TMI.</p>
    <p style="margin:0;font-family:${font};font-size:11px;color:#b3b7c2;">TMI Technology &middot; <a href="${unsubUrl}" style="color:#b3b7c2;">Unsubscribe</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

module.exports = { renderIssue, bodyToHtml, SITE };
