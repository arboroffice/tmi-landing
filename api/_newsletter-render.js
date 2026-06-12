// On-brand HTML renderer for Field Notes letters.
// Shared by api/newsletter.js (real sends) and api/newsletter-test.js (test sends).
//
// Design: white background (force-held in dark mode via prefers-color-scheme +
// Gmail's data-ogsc selectors on classed elements), chartreuse #E4FF97 accents,
// ink #1a1a1a text. Web fonts (Barlow/Neue Haas) load in clients that support them
// (Apple Mail); Gmail strips them and falls back to Helvetica/Arial, which is the
// closest match to Neue Haas Grotesk. Editorial structure: chartreuse section
// labels, a pull-quote, and chartreuse number badges - not a wall of paragraphs.
//
// Composing markdown:  ## Section label   > pull quote   1. numbered   - bullet
//                      *italic*  **bold**  [text](https://url)   (or paste raw HTML)

const SITE = 'https://www.tmitechai.com';
const CHART = '#E4FF97';
const INK = '#1a1a1a';
const BODY = '#33343d';
const FONT = "'Neue Haas Grotesk Display','Helvetica Neue',Helvetica,Arial,sans-serif";
const HFONT = "'Barlow','Helvetica Neue',Helvetica,Arial,sans-serif";

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function inline(t) {
  let x = esc(t);
  x = x.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" style="color:' + INK + ';text-decoration:underline;">$1</a>');
  x = x.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:' + INK + ';font-weight:700;">$1</strong>');
  x = x.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return x;
}

function bodyToHtml(body) {
  const s = (body || '').trim();
  if (!s) return '';
  if (/<(p|div|h[1-6]|ul|ol|table|img|blockquote)\b/i.test(s)) return s; // raw HTML passthrough

  return s.split(/\n{2,}/).map(block => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return '';

    if (lines.length === 1 && /^##\s+/.test(lines[0])) {
      return `<div style="margin:40px 0 18px;"><span class="fc-chart" style="display:inline-block;background:${CHART};color:#0a0b14;font-family:${FONT};font-size:11px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;padding:7px 14px;border-radius:6px;">${inline(lines[0].replace(/^##\s+/, ''))}</span></div>`;
    }
    if (lines.every(l => /^>\s?/.test(l))) {
      const q = lines.map(l => inline(l.replace(/^>\s?/, ''))).join('<br>');
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr><td style="border-left:4px solid ${CHART};padding:2px 0 2px 22px;"><p style="margin:0;font-family:${HFONT};font-size:23px;font-style:italic;font-weight:400;line-height:1.38;color:${INK};">${q}</p></td></tr></table>`;
    }
    if (lines.every(l => /^\d+[.)]\s+/.test(l))) {
      const rows = lines.map((l, i) =>
        `<tr><td valign="top" style="padding:0 14px 14px 0;"><span class="fc-chart" style="display:inline-block;width:26px;height:26px;background:${CHART};color:#0a0b14;border-radius:50%;text-align:center;line-height:26px;font-family:${HFONT};font-size:13px;font-weight:800;">${i + 1}</span></td><td valign="top" style="padding:2px 0 14px;font-family:${FONT};font-size:17px;line-height:1.55;color:${BODY};">${inline(l.replace(/^\d+[.)]\s+/, ''))}</td></tr>`).join('');
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 14px;">${rows}</table>`;
    }
    if (lines.every(l => /^[-*]\s+/.test(l))) {
      const rows = lines.map(l =>
        `<tr><td valign="top" style="padding:0 13px 11px 0;"><span style="display:inline-block;width:7px;height:7px;background:${INK};border-radius:50%;margin-top:9px;"></span></td><td valign="top" style="padding:0 0 11px;font-family:${FONT};font-size:17px;line-height:1.55;color:${BODY};">${inline(l.replace(/^[-*]\s+/, ''))}</td></tr>`).join('');
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 14px;">${rows}</table>`;
    }
    return `<p style="margin:0 0 18px;font-family:${FONT};font-size:17px;line-height:1.75;color:${BODY};">${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}

function renderIssue(issue = {}, unsubUrl = SITE + '/api/nl-unsubscribe') {
  const fmt = issue.format || 'standard';
  const title = issue.title || '';
  const preheader = issue.preheader || '';
  const content = bodyToHtml(issue.body);

  const titlePx = fmt === 'long-read' ? 40 : fmt === 'digest' ? 30 : 34;
  const center = fmt === 'announcement';
  const titleBlock = title
    ? `<h1 class="fc-ink" style="margin:0 0 26px;font-family:${HFONT};font-size:${titlePx}px;font-weight:500;letter-spacing:-0.025em;line-height:1.08;color:${INK};${center ? 'text-align:center;' : ''}">${inline(title)}</h1>`
    : '';
  const cta = (fmt === 'announcement' || fmt === 'standard')
    ? `<div style="${center ? 'text-align:center;' : ''}margin:36px 0 4px;"><a class="fc-chart" href="${SITE}/audit" style="display:inline-block;background:${CHART};color:#0a0b14;font-family:${FONT};font-weight:700;font-size:14px;letter-spacing:0.01em;padding:15px 34px;border-radius:999px;text-decoration:none;">Get your free audit &rarr;</a></div>`
    : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light only"/>
<meta name="supported-color-schemes" content="light only"/>
<link href="https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet"/>
<style>
  :root{color-scheme:light only;supported-color-schemes:light only;}
  html,body{background-color:#ffffff!important;}
  /* Keep it light in clients that auto-dark (prefers-color-scheme aware) */
  @media (prefers-color-scheme:dark){
    html,body,.fc-bg{background-color:#ffffff!important;}
    .fc-ink{color:#111111!important;}
    .fc-body,.fc-body p,.fc-body td,.fc-body span,.fc-body li,.fc-body strong{color:${BODY}!important;}
    .fc-chart{background-color:${CHART}!important;color:#0a0b14!important;}
    .fc-mut,.fc-mut a{color:#888888!important;}
  }
  /* Gmail / Outlook dark-mode re-coloring: data-ogsc (text) + data-ogsb (background) */
  [data-ogsc] .fc-ink{color:#111111!important;}
  [data-ogsc] .fc-body,[data-ogsc] .fc-body p,[data-ogsc] .fc-body td,[data-ogsc] .fc-body span,[data-ogsc] .fc-body li,[data-ogsc] .fc-body strong{color:${BODY}!important;}
  [data-ogsc] .fc-chart{color:#0a0b14!important;}
  [data-ogsc] .fc-mut,[data-ogsc] .fc-mut a{color:#888888!important;}
  [data-ogsb] .fc-bg{background-color:#ffffff!important;}
  [data-ogsb] .fc-chart{background-color:${CHART}!important;}
  u + #body .fc-bg{background-color:#ffffff!important;}
</style>
</head>
<body id="body" class="fc-bg" style="margin:0;padding:0;background-color:#ffffff;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" class="fc-bg" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background-color:#ffffff;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" class="fc-bg" width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width:600px;max-width:600px;background-color:#ffffff;">
  <tr><td style="padding:0 8px 20px;border-bottom:2px solid ${CHART};">
    <table role="presentation" width="100%"><tr>
      <td class="fc-ink" style="font-family:${HFONT};font-size:19px;font-weight:800;letter-spacing:0.06em;color:#111111;">TMI</td>
      <td class="fc-mut" align="right" style="font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#888888;">Field Notes</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:36px 8px 8px;">
    ${titleBlock}
    <div class="fc-body">${content}</div>
    ${cta}
  </td></tr>
  <tr><td class="fc-mut" style="padding:30px 8px 0;border-top:1px solid #e6e6e6;">
    <p style="margin:18px 0 6px;font-family:${FONT};font-size:12px;color:#888888;line-height:1.6;">Field Notes &middot; the community we are building at TMI.</p>
    <p style="margin:0;font-family:${FONT};font-size:11px;color:#aaaaaa;">TMI Technology &middot; intelligent infrastructure for any business &middot; <a href="${unsubUrl}" style="color:#888888;">Unsubscribe</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

module.exports = { renderIssue, bodyToHtml, SITE };
