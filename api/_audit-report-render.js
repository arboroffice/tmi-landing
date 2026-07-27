// Renders the paid Intelligent Company Audit deliverable as a branded, on-brand report:
// a markdown -> HTML converter plus the full report page with the Intelligence
// Score visualized. Shared by api/audit-report.js (hosted page) and
// api/audit-intake.js (the delivery email). No external deps.

const CHART = '#E4FF97';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Inline: **bold**, *italic*, `code`. Input is already HTML-escaped.
function inline(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

// Minimal, robust markdown -> HTML for the model's output (headings, lists,
// blockquotes, hr, paragraphs).
function mdToHtml(md) {
  const lines = esc(md || '').replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let listType = null; // 'ul' | 'ol'
  let para = [];

  const flushPara = () => {
    if (para.length) { html += `<p>${inline(para.join(' '))}</p>\n`; para = []; }
  };
  const closeList = () => { if (listType) { html += `</${listType}>\n`; listType = null; } };

  for (let raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { flushPara(); closeList(); continue; }

    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flushPara(); closeList();
      const lvl = m[1].length;
      html += `<h${lvl}>${inline(m[2].trim())}</h${lvl}>\n`;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { flushPara(); closeList(); html += '<hr/>\n'; continue; }
    if ((m = line.match(/^\s*>\s?(.*)$/))) {
      flushPara(); closeList();
      html += `<blockquote>${inline(m[1].trim())}</blockquote>\n`;
      continue;
    }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      flushPara();
      if (listType !== 'ul') { closeList(); html += '<ul>\n'; listType = 'ul'; }
      html += `<li>${inline(m[1].trim())}</li>\n`;
      continue;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (listType !== 'ol') { closeList(); html += '<ol>\n'; listType = 'ol'; }
      html += `<li>${inline(m[1].trim())}</li>\n`;
      continue;
    }
    closeList();
    para.push(line.trim());
  }
  flushPara(); closeList();
  return html;
}

// Pull the 0-100 AI Score and any per-function scores (X/100) out of the md.
function parseAuditMeta(md) {
  const text = String(md || '');
  let score = null;
  const near = text.match(/AI Score[\s\S]{0,240}?\b(\d{1,3})\s*\/\s*100/i)
    || text.match(/Intelligence Score[\s\S]{0,240}?\b(\d{1,3})\s*\/\s*100/i)
    || text.match(/\b(\d{1,3})\s*\/\s*100/);
  if (near) { const n = parseInt(near[1], 10); if (n >= 0 && n <= 100) score = n; }

  // Per-function scores, written as "Sales — 42 / 100 — why".
  const categories = [];
  const catRe = /(Sales|Marketing|Operations|Finance|Customer Service|Leadership|HR|Visibility|Automation|Reporting|Lead flow)\b[^\d]{0,12}(\d{1,3})\s*\/\s*100/gi;
  let c;
  while ((c = catRe.exec(text)) && categories.length < 8) {
    const label = c[1], val = parseInt(c[2], 10);
    if (val >= 0 && val <= 100 && !categories.some(x => x.label.toLowerCase() === label.toLowerCase())) {
      categories.push({ label, score: val });
    }
  }
  return { score, categories };
}

function scoreRing(score) {
  if (score == null) return '';
  const r = 52, c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  return `<svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
    <circle cx="66" cy="66" r="${r}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="12"/>
    <circle cx="66" cy="66" r="${r}" fill="none" stroke="${CHART}" stroke-width="12" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 66 66)"/>
    <text x="66" y="62" text-anchor="middle" fill="#fff" font-family="Barlow,sans-serif" font-size="34" font-weight="700">${score}</text>
    <text x="66" y="84" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-family="Barlow,sans-serif" font-size="12" letter-spacing="1">/ 100</text>
  </svg>`;
}

function categoryBars(categories) {
  if (!categories || !categories.length) return '';
  return `<div class="cats">${categories.map(c => `
    <div class="cat">
      <div class="cat-top"><span>${esc(c.label)}</span><span>${c.score}/100</span></div>
      <div class="cat-track"><div class="cat-fill" style="width:${Math.max(0, Math.min(100, c.score))}%"></div></div>
    </div>`).join('')}</div>`;
}

// Full hosted report page.
function renderReportPage({ company, md, date }) {
  const meta = parseAuditMeta(md);
  const body = mdToHtml(md);
  const dateStr = date ? new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>Business Intelligence Audit${company ? ' — ' + esc(company) : ''} | TMI</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>
  :root{--bg:#0a0b14;--card:#111324;--ink:#fff;--ink2:rgba(255,255,255,0.66);--ink3:rgba(255,255,255,0.42);--line:rgba(255,255,255,0.1);--chart:${CHART};--serif:"Barlow",system-ui,sans-serif;}
  *{box-sizing:border-box;}html,body{margin:0;padding:0;}
  body{font-family:var(--serif);background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased;line-height:1.6;}
  a{color:inherit;}
  .top{height:56px;border-bottom:1px solid var(--line);display:flex;align-items:center;}
  .wrap{max-width:820px;margin:0 auto;padding:0 26px;}
  .brand{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;}
  .brand img{height:22px;filter:brightness(0) invert(1);}
  .hero{padding:56px 0 30px;border-bottom:1px solid var(--line);}
  .eyebrow{font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:var(--chart);margin-bottom:14px;}
  h1.title{font-weight:400;font-size:clamp(30px,4.4vw,46px);letter-spacing:-0.02em;line-height:1.05;margin:0 0 10px;}
  .sub{color:var(--ink3);font-size:14px;}
  .scorecard{display:flex;gap:30px;align-items:center;flex-wrap:wrap;margin-top:30px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:26px 28px;}
  .scorecard .sc-label{font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:var(--ink3);margin-bottom:6px;}
  .scorecard .sc-name{font-size:20px;}
  .cats{flex:1;min-width:240px;display:flex;flex-direction:column;gap:12px;}
  .cat-top{display:flex;justify-content:space-between;font-size:12px;color:var(--ink2);margin-bottom:5px;}
  .cat-track{height:7px;background:rgba(255,255,255,0.08);border-radius:99px;overflow:hidden;}
  .cat-fill{height:100%;background:var(--chart);border-radius:99px;}
  .content{padding:14px 0 60px;}
  .content h1{font-weight:400;font-size:30px;letter-spacing:-0.01em;margin:42px 0 14px;}
  .content h2{font-weight:400;font-size:24px;letter-spacing:-0.01em;margin:38px 0 12px;padding-top:24px;border-top:1px solid var(--line);}
  .content h3{font-weight:600;font-size:16px;margin:24px 0 8px;color:var(--chart);}
  .content p{color:var(--ink2);margin:0 0 16px;}
  .content ul,.content ol{color:var(--ink2);margin:0 0 16px;padding-left:22px;}
  .content li{margin:0 0 7px;}
  .content strong{color:var(--ink);font-weight:600;}
  .content blockquote{border-left:3px solid var(--chart);margin:18px 0;padding:4px 0 4px 18px;color:var(--ink);font-style:italic;}
  .content code{background:rgba(255,255,255,0.08);padding:1px 6px;border-radius:5px;font-size:0.9em;}
  .content hr{border:0;border-top:1px solid var(--line);margin:28px 0;}
  .cta{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:26px 28px;margin:24px 0 0;}
  .cta h3{margin:0 0 8px;color:var(--chart);font-size:16px;}
  .cta p{margin:0 0 16px;color:var(--ink2);font-size:14px;}
  .btn{display:inline-block;background:var(--chart);color:#0a0b14;font-weight:700;font-size:14px;padding:13px 26px;border-radius:999px;text-decoration:none;}
  .toolbar{display:flex;justify-content:flex-end;padding:16px 0 0;}
  .print{font-size:12px;color:var(--ink3);border:1px solid var(--line);border-radius:999px;padding:8px 16px;cursor:pointer;background:none;font-family:inherit;}
  .print:hover{color:var(--ink);}
  @media print{.top,.toolbar,.print{display:none;}body{background:#fff;color:#111;}.scorecard,.cta{background:#f5f5f7;border-color:#ddd;}.content h2{border-color:#ddd;}.content p,.content ul,.content ol{color:#333;}}
</style></head>
<body>
<div class="top"><div class="wrap"><a href="/" class="brand"><img src="/logo.svg" alt="TMI"/> TMI</a></div></div>
<div class="wrap">
  <div class="toolbar"><button class="print" onclick="window.print()">Print / Save as PDF</button></div>
  <div class="hero">
    <div class="eyebrow">Business Intelligence Audit</div>
    <h1 class="title">${company ? esc(company) : 'Your operation'}</h1>
    <div class="sub">${dateStr ? 'Prepared ' + dateStr + ' · ' : ''}TMI Technology</div>
    ${meta.score != null ? `<div class="scorecard">
      <div style="text-align:center;">${scoreRing(meta.score)}<div class="sc-label" style="margin-top:6px;">AI Score</div></div>
      ${categoryBars(meta.categories)}
    </div>` : ''}
  </div>
  <div class="content">${body}</div>
  <div class="cta">
    <h3>Ready to build it?</h3>
    <p>Your 30-minute strategy call is where we walk through this together and choose your path: do it yourself, do it with us, or have us build and install it for you.</p>
    <a class="btn" href="/complete-audit-intake">Continue</a>
  </div>
  <div style="padding:30px 0 50px;color:var(--ink3);font-size:12px;border-top:1px solid var(--line);margin-top:40px;">&copy; 2026 TMI Technology</div>
</div>
</body></html>`;
}

module.exports = { mdToHtml, parseAuditMeta, renderReportPage, esc };
