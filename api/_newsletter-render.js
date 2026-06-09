// On-brand HTML renderer for Founders of the Future letters.
// Shared by api/newsletter.js (real sends) and api/newsletter-test.js (test sends).
// Brand: white, Barlow (light-weight serif-style headings), chartreuse #E4FF97 accent,
// ink #1a1a1a, generous whitespace. Email-safe inline styles, 600px container.
//
// Composing: plain text supports a little markdown so letters can carry structure:
//   ## Subhead          -> section heading
//   - item / * item     -> bullet list (chartreuse markers)
//   1. item             -> numbered list
//   *italic*  **bold**  [text](https://url)
// Or paste raw HTML and it passes through untouched.

const SITE = 'https://www.tmitechai.com';
const CHART = '#E4FF97';
const INK = '#1a1a1a';
const FONT = "'Barlow','Helvetica Neue',Helvetica,Arial,sans-serif";

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function inline(t) {
  let x = esc(t);
  x = x.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" style="color:#0a7a3a;text-decoration:underline;">$1</a>');
  x = x.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:' + INK + ';font-weight:700;">$1</strong>');
  x = x.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return x;
}

function bodyToHtml(body) {
  const s = (body || '').trim();
  if (!s) return '';
  if (/<(p|div|h[1-6]|ul|ol|table|img|blockquote)\b/i.test(s)) return s; // raw HTML passthrough

  const li = 'margin:0 0 9px;padding-left:22px;position:relative;font-size:17px;line-height:1.6;color:#3a3b45;';
  return s.split(/\n{2,}/).map(block => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return '';
    if (lines.length === 1 && /^##\s+/.test(lines[0])) {
      return `<h2 style="margin:34px 0 14px;font-family:${FONT};font-size:21px;font-weight:600;letter-spacing:-0.01em;color:${INK};">${inline(lines[0].replace(/^##\s+/, ''))}</h2>`;
    }
    if (lines.every(l => /^[-*]\s+/.test(l))) {
      return `<ul style="margin:0 0 20px;padding:0;list-style:none;">` + lines.map(l =>
        `<li style="${li}"><span style="position:absolute;left:0;top:1px;color:#9ab534;font-weight:700;">&bull;</span>${inline(l.replace(/^[-*]\s+/, ''))}</li>`).join('') + `</ul>`;
    }
    if (lines.every(l => /^\d+[.)]\s+/.test(l))) {
      return `<ol style="margin:0 0 20px;padding:0;list-style:none;">` + lines.map((l, i) =>
        `<li style="${li}"><span style="position:absolute;left:0;top:0;color:#9ab534;font-weight:700;">${i + 1}.</span>${inline(l.replace(/^\d+[.)]\s+/, ''))}</li>`).join('') + `</ol>`;
    }
    return `<p style="margin:0 0 18px;font-family:${FONT};font-size:17px;line-height:1.75;color:#3a3b45;">${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}

function renderIssue(issue = {}, unsubUrl = SITE + '/api/nl-unsubscribe') {
  const fmt = issue.format || 'standard';
  const title = issue.title || '';
  const preheader = issue.preheader || '';
  const content = bodyToHtml(issue.body);

  const titlePx = fmt === 'long-read' ? 38 : fmt === 'digest' ? 28 : 33;
  const center = fmt === 'announcement';
  const titleBlock = title
    ? `<h1 style="margin:0 0 26px;font-family:${FONT};font-size:${titlePx}px;font-weight:400;letter-spacing:-0.025em;line-height:1.08;color:${INK};${center ? 'text-align:center;' : ''}">${inline(title)}</h1>`
    : '';
  const divider = fmt === 'digest' ? `<div style="height:1px;background:#ececf0;margin:0 0 24px;"></div>` : '';
  const cta = (fmt === 'announcement' || fmt === 'standard')
    ? `<div style="${center ? 'text-align:center;' : ''}margin:34px 0 4px;"><a href="${SITE}/audit" style="display:inline-block;background:${CHART};color:#0a0b14;font-family:${FONT};font-weight:700;font-size:14px;letter-spacing:0.01em;padding:15px 32px;border-radius:999px;text-decoration:none;">Get your free audit &rarr;</a></div>`
    : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<link href="https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:#eceef2;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceef2;padding:36px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 12px 40px rgba(10,11,20,0.07);">
  <tr><td style="height:5px;background:${CHART};font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="padding:26px 40px 0;">
    <table role="presentation" width="100%"><tr>
      <td style="font-family:${FONT};font-size:17px;font-weight:800;letter-spacing:0.06em;color:${INK};">TMI</td>
      <td align="right" style="font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:#9aa0ad;">Founders of the Future</td>
    </tr></table>
    <div style="height:1px;background:#ececf0;margin:20px 0 30px;"></div>
  </td></tr>
  <tr><td style="padding:0 40px 40px;">
    ${titleBlock}${divider}
    <div>${content}</div>
    ${cta}
  </td></tr>
  <tr><td style="background:#fafafb;padding:24px 40px;border-top:1px solid #ececf0;">
    <p style="margin:0 0 6px;font-family:${FONT};font-size:12px;color:#8a8f9c;line-height:1.6;">Founders of the Future &middot; the community we are building at TMI.</p>
    <p style="margin:0;font-family:${FONT};font-size:11px;color:#b3b7c2;">TMI Technology &middot; intelligent infrastructure for any business &middot; <a href="${unsubUrl}" style="color:#b3b7c2;">Unsubscribe</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

module.exports = { renderIssue, bodyToHtml, SITE };
