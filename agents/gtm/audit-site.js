// TMI Personalized Audit Microsite generator.
// Renders a prospect-facing "Intelligent Company Audit" page from a data object,
// served at /audit/<slug>. This is the asset the outbound rep links to:
// the prospect sees a miniature version of their future company before any pitch.
//
// Usage:
//   import { renderAuditPage, writeAuditPage } from './audit-site.js';
//   const file = writeAuditPage(auditData);   // writes /audit/<slug>.html
//
// CLI (generate the demo page):
//   node agents/gtm/audit-site.js --sample

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

export function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60);
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtMoney = (n) => '$' + Number(n || 0).toLocaleString('en-US');

// Score ring color: chartreuse regardless, but label shifts by band
function scoreBand(score) {
  if (score >= 75) return 'Strong';
  if (score >= 55) return 'Developing';
  if (score >= 40) return 'At risk';
  return 'Critical';
}

/**
 * @param {object} d audit data
 *  slug, companyName, ownerFirstName, industry, revenueEst, employees, locations,
 *  score (0-100), categories [{name, score /10}], bottlenecks [str],
 *  current [str], future [str], savingsAnnual (num), hoursPerWeek (num),
 *  demoUrl (optional), summary (str)
 */
export function renderAuditPage(d) {
  const slug = d.slug || slugify(d.companyName);
  const url = `https://www.tmitechai.com/audit/${slug}`;
  const score = Math.max(0, Math.min(100, Math.round(d.score ?? 0)));
  const ring = (score / 100) * 339.292; // 2*pi*54
  const cats = (d.categories || []).map(c => {
    const pct = Math.max(0, Math.min(100, (c.score / 10) * 100));
    return `<div class="cat"><div class="cat-top"><span>${esc(c.name)}</span><span class="cat-n">${c.score}/10</span></div><div class="cat-bar"><i style="width:${pct}%"></i></div></div>`;
  }).join('\n');
  const bottlenecks = (d.bottlenecks || []).map(b => `<li>${esc(b)}</li>`).join('\n');
  const current = (d.current || []).map(c => `<li>${esc(c)}</li>`).join('\n');
  const future = (d.future || []).map(f => `<li>${esc(f)}</li>`).join('\n');
  const demo = d.demoUrl
    ? `<section class="sec demo"><div class="wrap"><div class="eyebrow">90-second walkthrough</div><h2>How we'd build it</h2><div class="vid"><iframe src="${esc(d.demoUrl)}" allow="autoplay; fullscreen" allowfullscreen loading="lazy"></iframe></div></div></section>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
<meta name="description" content="An operational intelligence review for ${esc(d.companyName)} by TMI. What an intelligent company could look like."/>
<meta property="og:title" content="${esc(d.companyName)} — Intelligent Company Audit | TMI"/>
<meta property="og:description" content="We mapped where efficiency may be getting lost at ${esc(d.companyName)}, and what the future state could look like."/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="${url}"/>
<meta property="og:image" content="https://www.tmitechai.com/hero-bg.png"/>
<title>${esc(d.companyName)} — Intelligent Company Audit | TMI</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400&display=swap" rel="stylesheet"/>
<style>
  :root{--bg:#0a0b14;--bg2:#0d0e1a;--card:#111324;--ink:#fff;--ink2:rgba(255,255,255,0.62);--ink3:rgba(255,255,255,0.4);--line:rgba(255,255,255,0.08);--chart:#E4FF97;--chart2:#D0FF6A;--serif:"Barlow",system-ui,sans-serif;--sans:"Neue Haas Grotesk Display","Neue Haas Grotesk",system-ui,-apple-system,sans-serif;}
  *{box-sizing:border-box;}html,body{margin:0;padding:0;}html{scroll-behavior:smooth;}
  body{font-family:var(--sans);background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased;line-height:1.55;overflow-x:hidden;}
  a{color:inherit;text-decoration:none;}
  h1,h2,h3{font-family:var(--serif);font-weight:400;letter-spacing:-0.02em;line-height:1.05;margin:0;}
  p{margin:0;}
  .wrap{max-width:980px;margin:0 auto;padding:0 28px;}
  .eyebrow{font-family:var(--sans);font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:var(--chart);margin-bottom:16px;}
  .hd{height:60px;display:flex;align-items:center;border-bottom:1px solid var(--line);position:sticky;top:0;background:rgba(10,11,20,0.9);backdrop-filter:blur(10px);z-index:50;}
  .hd .wrap{display:flex;align-items:center;justify-content:space-between;width:100%;}
  .brand{display:flex;align-items:center;gap:8px;font-family:var(--sans);font-size:15px;font-weight:700;}
  .brand img{height:22px;filter:brightness(0) invert(1);}
  .hd-cta{font-family:var(--sans);font-size:12px;font-weight:700;background:var(--chart);color:#0a0b14;padding:9px 16px;border-radius:999px;}
  .sec{padding:72px 0;border-top:1px solid var(--line);}
  .sec:first-of-type{border-top:none;}
  /* hero / card */
  .hero{padding:64px 0 24px;}
  .hero .meta{font-family:var(--sans);font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:var(--ink3);margin-bottom:20px;}
  .hero h1{font-family:var(--serif);font-size:clamp(34px,5vw,60px);line-height:1.02;max-width:18ch;margin-bottom:18px;}
  .hero h1 em{font-style:italic;color:var(--ink3);}
  .hero p.lede{font-family:var(--serif);font-size:clamp(17px,1.6vw,21px);color:var(--ink2);max-width:54ch;}
  /* the personalized visual card (the "image") */
  .card{margin:40px 0 8px;background:linear-gradient(150deg,#141733,#0a0b14);border:1px solid var(--line);border-radius:18px;padding:40px 38px;box-shadow:0 40px 90px rgba(0,0,0,0.45);}
  .card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;flex-wrap:wrap;}
  .card-co{font-family:var(--serif);font-size:clamp(22px,2.4vw,30px);}
  .card-tag{font-family:var(--sans);font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:var(--chart);margin-top:6px;}
  .ring{position:relative;width:128px;height:128px;flex:none;}
  .ring svg{transform:rotate(-90deg);}
  .ring .num{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}
  .ring .num b{font-family:var(--serif);font-size:38px;line-height:1;}
  .ring .num span{font-family:var(--sans);font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:var(--ink3);margin-top:4px;}
  .cf{display:grid;grid-template-columns:1fr auto 1fr;gap:24px;align-items:center;margin-top:34px;}
  .cf .col h4{font-family:var(--sans);font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:var(--ink3);margin:0 0 14px;}
  .cf .col.future h4{color:var(--chart);}
  .cf ul{list-style:none;margin:0;padding:0;}
  .cf li{font-family:var(--sans);font-size:14px;color:var(--ink2);padding:7px 0;border-top:1px solid var(--line);}
  .cf .future li{color:var(--ink);}
  .cf li:first-child{border-top:none;}
  .cf .arrow{font-size:26px;color:var(--chart);}
  /* metrics */
  .metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;border:1px solid var(--line);border-radius:14px;overflow:hidden;margin-top:8px;}
  .metric{background:var(--card);padding:30px 24px;text-align:center;}
  .metric .n{font-family:var(--serif);font-size:clamp(30px,4vw,46px);color:var(--chart);line-height:1;margin-bottom:8px;}
  .metric .l{font-family:var(--sans);font-size:13px;color:var(--ink2);}
  h2.big{font-family:var(--serif);font-size:clamp(26px,3vw,40px);margin-bottom:8px;}
  .sub{font-family:var(--serif);font-size:17px;color:var(--ink2);max-width:54ch;margin-bottom:30px;}
  .cats{display:grid;gap:18px;max-width:620px;}
  .cat-top{display:flex;justify-content:space-between;font-family:var(--sans);font-size:14px;margin-bottom:8px;}
  .cat-n{color:var(--chart);font-weight:600;}
  .cat-bar{height:7px;border-radius:4px;background:rgba(255,255,255,0.08);overflow:hidden;}
  .cat-bar i{display:block;height:100%;background:var(--chart);border-radius:4px;}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:40px;}
  .list{list-style:none;margin:14px 0 0;padding:0;}
  .list li{font-family:var(--sans);font-size:15px;color:var(--ink2);padding:11px 0;border-top:1px solid var(--line);padding-left:22px;position:relative;}
  .list li:before{content:"";position:absolute;left:0;top:18px;width:7px;height:7px;border-radius:50%;background:var(--chart);}
  .vid{position:relative;width:100%;aspect-ratio:16/9;border-radius:14px;overflow:hidden;border:1px solid var(--line);background:#000;margin-top:24px;}
  .vid iframe{position:absolute;inset:0;width:100%;height:100%;border:0;}
  /* cta */
  .cta{text-align:center;background:var(--bg2);}
  .cta h2{font-family:var(--serif);font-size:clamp(28px,3.4vw,46px);max-width:20ch;margin:0 auto 16px;}
  .cta p{color:var(--ink2);font-size:18px;margin-bottom:30px;}
  .btn{display:inline-flex;align-items:center;gap:9px;background:var(--chart);color:#0a0b14;font-family:var(--sans);font-size:16px;font-weight:700;padding:18px 42px;border-radius:999px;transition:background .15s;}
  .btn:hover{background:var(--chart2);}
  .note{font-family:var(--sans);font-size:12px;color:var(--ink3);margin-top:16px;}
  .foot{padding:40px 0;border-top:1px solid var(--line);font-family:var(--sans);font-size:12px;color:var(--ink3);display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;}
  @media(max-width:760px){.cf{grid-template-columns:1fr;gap:18px;}.cf .arrow{transform:rotate(90deg);}.metrics{grid-template-columns:1fr;}.cols{grid-template-columns:1fr;gap:24px;}.card{padding:28px 22px;}}
</style>
</head>
<body>

<header class="hd"><div class="wrap"><a href="/" class="brand"><img src="/logo.svg" alt="TMI"/> TMI</a><a href="/audit" class="hd-cta">Book the audit &rarr;</a></div></header>

<section class="hero"><div class="wrap">
  <div class="meta">Operational intelligence review &middot; Prepared for ${esc(d.companyName)}</div>
  <h1>${esc(d.companyName)}: <em>what an intelligent company could look like.</em></h1>
  <p class="lede">${esc(d.summary || `We spent some time looking at ${d.companyName} and mapped a few places where time and money may be leaking. Here's the picture, and what the future state could look like.`)}</p>

  <div class="card">
    <div class="card-top">
      <div>
        <div class="card-co">${esc(d.companyName)}</div>
        <div class="card-tag">Current state &rarr; Future state &middot; Built by TMI</div>
      </div>
      <div class="ring">
        <svg width="128" height="128"><circle cx="64" cy="64" r="54" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="9"/><circle cx="64" cy="64" r="54" fill="none" stroke="#E4FF97" stroke-width="9" stroke-linecap="round" stroke-dasharray="${ring.toFixed(1)} 339.292"/></svg>
        <div class="num"><b>${score}</b><span>Intel score</span></div>
      </div>
    </div>
    <div class="cf">
      <div class="col current"><h4>Today</h4><ul>${current || '<li>Disconnected tools</li><li>Spreadsheets</li><li>Phone &amp; text</li>'}</ul></div>
      <div class="arrow">&rarr;</div>
      <div class="col future"><h4>With TMI</h4><ul>${future || '<li>One command center</li><li>Automated reporting</li><li>Dispatch &amp; approvals</li>'}</ul></div>
    </div>
  </div>
</div></section>

<section class="sec"><div class="wrap">
  <div class="eyebrow">The numbers</div>
  <div class="metrics">
    <div class="metric"><div class="n">${score}/100</div><div class="l">Intelligence score &middot; ${scoreBand(score)}</div></div>
    <div class="metric"><div class="n">${fmtMoney(d.savingsAnnual)}</div><div class="l">Potential annual savings</div></div>
    <div class="metric"><div class="n">${esc(d.hoursPerWeek || 0)} hrs</div><div class="l">Potential hours recovered / week</div></div>
  </div>
</div></section>

<section class="sec"><div class="wrap">
  <div class="eyebrow">Score breakdown</div>
  <h2 class="big">Where the friction shows up.</h2>
  <p class="sub">Not a claim that anything is broken. Just where, at your size and shape, time and money usually leak.</p>
  <div class="cats">${cats || '<div class="cat"><div class="cat-top"><span>Operations</span><span class="cat-n">4/10</span></div><div class="cat-bar"><i style="width:40%"></i></div></div>'}</div>
</div></section>

<section class="sec"><div class="wrap">
  <div class="eyebrow">Current vs future</div>
  <div class="cols">
    <div><h2 class="big">What we found</h2><ul class="list">${bottlenecks || '<li>Customer communication</li><li>Scheduling</li><li>Work order flow</li><li>Reporting</li>'}</ul></div>
    <div><h2 class="big">What we'd build</h2><ul class="list"><li>A single command center for the whole operation</li><li>Scheduling, dispatch, and approvals in one place</li><li>Reporting that builds itself</li><li>The backend you own, run from your phone</li></ul></div>
  </div>
</div></section>

${demo}

<section class="sec cta"><div class="wrap">
  <h2>Want the full version of this?</h2>
  <p>The free Intelligent Company Audit goes deeper, with the real numbers for ${esc(d.companyName)}. No pitch.</p>
  <a href="/audit" class="btn">Book the intelligent company audit &rarr;</a>
  <p class="note">Prepared by TMI &middot; This is a preliminary review from public information.</p>
</div></section>

<div class="wrap"><div class="foot"><span>&copy; ${new Date().getFullYear()} TMI Technology</span><span>${esc(d.ownerFirstName ? `For ${d.ownerFirstName}` : 'Operational intelligence')}</span></div></div>

</body>
</html>`;
}

export function writeAuditPage(d) {
  const slug = d.slug || slugify(d.companyName);
  const dir = path.join(ROOT, 'audit');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slug}.html`);
  fs.writeFileSync(file, renderAuditPage({ ...d, slug }));
  return { file, slug, url: `https://www.tmitechai.com/audit/${slug}` };
}

// ── Sample data for the demo page ───────────────────────────────────────────
export const SAMPLE = {
  companyName: 'ABC Manufacturing',
  ownerFirstName: 'John',
  industry: 'Manufacturing',
  revenueEst: '$18.4M',
  employees: 67,
  locations: 3,
  score: 47,
  summary: 'We spent some time looking at ABC Manufacturing and mapped a few places where time and money may be getting lost between the floor, the office, and the customer. Here is the picture, and what the future state could look like.',
  categories: [
    { name: 'Lead flow', score: 6 },
    { name: 'Operations', score: 4 },
    { name: 'Visibility', score: 7 },
    { name: 'Automation', score: 2 },
    { name: 'Reporting', score: 3 },
  ],
  bottlenecks: ['Customer communication', 'Scheduling', 'Work order flow', 'Manual approvals', 'Reporting', 'Data visibility'],
  current: ['5 software tools', '12 spreadsheets', 'Phone calls', 'Text messages'],
  future: ['One command center', 'Scheduling &amp; dispatch', 'Reporting', 'Approvals'],
  savingsAnnual: 184000,
  hoursPerWeek: 31,
  demoUrl: '',
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain && process.argv.includes('--sample')) {
  const out = writeAuditPage(SAMPLE);
  console.log('Wrote sample audit page:', out.file, '->', out.url);
}
