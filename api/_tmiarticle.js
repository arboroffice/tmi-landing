// Turns an approved piece of TMI content into a published Founders of the Future
// Letters article: Claude expands it into structured, answer-engine-optimized
// sections, and this module assembles the exact site article template around them
// (so the HTML is always valid and on-brand) plus the news.html story card.

const MODEL = 'claude-opus-4-8';

const CATEGORIES = ['Operations', 'The Trades', 'AI & Tech', 'Finance', 'Leadership'];
const PEXELS = ['3184465', '3184291', '1181686', '1216589', '1078884', '3964736', '1108101', '3229014', '2381463'];

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => String(s || 'story').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'story';
const stripDash = (s) => String(s || '').replace(/—/g, '-').replace(/–/g, '-');

// Ask Claude to expand an approved content item into a full, AEO-optimized article.
async function writeArticle(item) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });

  const system = `You write Founders of the Future Letters for TMI, the Intelligent Company Firm. Voice: direct, operator to operator, specific numbers and scenarios, no hedging. Never use emojis. Never use em dashes, use plain dashes. Never say "leverage AI" or generic AI hype. Write about systems and operations.

Answer-engine optimization is required: the title matches a real question an operator would ask; the opening answers it directly in 2 to 3 self-contained sentences; H2 headings are the specific questions a reader would ask; every factual claim is specific and self-contained.

You are given an approved internal content item. Expand it into a complete article (900 to 1200 words) without inventing client names, dollar figures, or outcomes that are not implied by the source.

Return ONLY valid JSON:
{
  "title": "the headline, a real question or claim",
  "category": "one of: Operations, The Trades, AI & Tech, Finance, Leadership",
  "read_time": 6,
  "deck": "one sentence, 20 to 30 words, that frames the piece",
  "meta_description": "a direct one-sentence answer, under 155 characters",
  "sections": [ { "h2": "a question heading", "paragraphs": ["...", "..."] } ],
  "blockquote": "one punchy unattributed insight",
  "callout_header": "short label",
  "callout_body": "a practical framework in prose, no bullet lists",
  "faq": [ { "q": "a question", "a": "a self-contained answer" } ]
}
Use 3 to 4 sections and 3 to 4 FAQ entries.`;

  const src = `TITLE OR ANGLE: ${item.title || item.angle || 'Untitled'}\nFORMAT OF SOURCE: ${item.format || 'note'}\n\nSOURCE CONTENT:\n${String(item.body || '').slice(0, 6000)}`;

  const msg = await client.messages.create({
    model: MODEL, max_tokens: 4000, system,
    messages: [{ role: 'user', content: src }],
  });
  const text = (msg.content || []).map((b) => b.text || '').join('').trim();
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  let raw = {};
  if (s !== -1 && e !== -1) { try { raw = JSON.parse(text.slice(s, e + 1)); } catch { raw = {}; } }

  const category = CATEGORIES.includes(raw.category) ? raw.category : 'Operations';
  const sections = Array.isArray(raw.sections) ? raw.sections.slice(0, 5).map((x) => ({
    h2: stripDash(String(x.h2 || '')).slice(0, 160),
    paragraphs: (Array.isArray(x.paragraphs) ? x.paragraphs : []).slice(0, 6).map((p) => stripDash(String(p)).slice(0, 1600)),
  })).filter((x) => x.h2 && x.paragraphs.length) : [];
  const faq = Array.isArray(raw.faq) ? raw.faq.slice(0, 4).map((x) => ({
    q: stripDash(String(x.q || '')).slice(0, 200), a: stripDash(String(x.a || '')).slice(0, 600),
  })).filter((x) => x.q && x.a) : [];

  return {
    title: stripDash(String(raw.title || item.title || 'A Founders of the Future Letter')).slice(0, 160),
    category, read_time: Math.max(3, Math.min(12, parseInt(raw.read_time, 10) || 6)),
    deck: stripDash(String(raw.deck || '')).slice(0, 320),
    meta_description: stripDash(String(raw.meta_description || raw.deck || '')).slice(0, 160),
    sections,
    blockquote: stripDash(String(raw.blockquote || '')).slice(0, 400),
    callout_header: stripDash(String(raw.callout_header || '')).slice(0, 120),
    callout_body: stripDash(String(raw.callout_body || '')).slice(0, 1200),
    faq,
  };
}

function pexelsUrl(id) { return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1400&q=80`; }
function pickPhoto(seedStr) { let h = 0; for (const c of String(seedStr)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PEXELS[h % PEXELS.length]; }

const dateStr = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

// Assemble the full article HTML from structured fields (the CLAUDE.md template).
function buildArticleHTML(f, filename, now) {
  const photo = pexelsUrl(f.photo_id);
  const url = `https://tmi-technology.com/${filename}`;
  const date = dateStr(now || new Date());

  const bodyHtml = f.sections.map((s, i) => {
    let h = `    <h2>${esc(s.h2)}</h2>\n`;
    h += s.paragraphs.map((p) => `    <p>${esc(p)}</p>`).join('\n') + '\n';
    if (i === 0 && f.blockquote) h += `    <blockquote>${esc(f.blockquote)}</blockquote>\n`;
    if (i === f.sections.length - 2 && f.callout_header) h += `    <div class="callout"><strong>${esc(f.callout_header)}:</strong> ${esc(f.callout_body)}</div>\n`;
    return h;
  }).join('\n');

  const faqHtml = f.faq.length ? `    <h2>Common questions</h2>\n` + f.faq.map((q) =>
    `    <p><strong>${esc(q.q)}</strong><br/>${esc(q.a)}</p>`).join('\n') + '\n' : '';

  const faqLd = f.faq.length ? {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: f.faq.map((q) => ({ '@type': 'Question', name: q.q, acceptedAnswer: { '@type': 'Answer', text: q.a } })),
  } : null;
  const articleLd = {
    '@context': 'https://schema.org', '@type': 'Article', headline: f.title,
    description: f.meta_description, image: photo, datePublished: (now || new Date()).toISOString(),
    author: { '@type': 'Organization', name: 'TMI' }, publisher: { '@type': 'Organization', name: 'TMI' },
    mainEntityOfPage: url,
  };
  const ld = [articleLd].concat(faqLd ? [faqLd] : []).map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n');

  const md = esc(f.meta_description), title = esc(f.title);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<link rel="icon" href="favicon.svg" type="image/svg+xml"/>
<link rel="apple-touch-icon" href="favicon.svg"/>
<meta name="description" content="${md}"/>
<meta property="og:title" content="${title} | TMI"/>
<meta property="og:description" content="${md}"/>
<meta property="og:type" content="article"/>
<meta property="og:url" content="${url}"/>
<meta property="og:image" content="${photo}"/>
<meta property="og:site_name" content="TMI"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${title} | TMI"/>
<meta name="twitter:description" content="${md}"/>
<meta name="twitter:image" content="${photo}"/>
<link rel="canonical" href="${url}"/>
<title>${title} | TMI</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,600&display=swap" rel="stylesheet"/>
${ld}
<style>
  :root {
    --bg:#ffffff;--bg-alt:#f5f5f7;--bg-deep:#0a0b14;
    --ink:#1a1a1a;--ink-2:#505060;--muted:#86868b;
    --line:rgba(0,0,0,0.08);--line-strong:rgba(0,0,0,0.13);
    --accent:#1a1a1a;--accent-2:#000;
    --chart:#E4FF97;--chart-dark:#D0FF6A;
    --serif:"Barlow",system-ui,sans-serif;
    --sans:"Neue Haas Grotesk Display","Neue Haas Grotesk",system-ui,-apple-system,sans-serif;
  }
  *{box-sizing:border-box;}html,body{margin:0;padding:0;}html{scroll-behavior:smooth;}
  body{font-family:var(--sans);color:var(--ink);background:var(--bg);-webkit-font-smoothing:antialiased;line-height:1.55;overflow-x:hidden;}
  a{color:inherit;text-decoration:none;}img{display:block;max-width:100%;}
  ::selection{background:var(--ink);color:var(--bg);}
  h1,h2,h3,h4{font-family:var(--serif);font-weight:400;letter-spacing:-0.02em;line-height:1.05;margin:0;}
  p{margin:0;}
  .article-header{position:fixed;top:0;left:0;right:0;z-index:100;height:56px;background:rgba(255,255,255,0.94);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--line);display:flex;align-items:center;}
  .article-header-inner{max-width:1320px;margin:0 auto;padding:0 32px;width:100%;display:flex;align-items:center;gap:20px;}
  .ah-brand{display:flex;align-items:center;gap:8px;font-family:var(--sans);font-size:15px;font-weight:700;color:var(--ink);flex:1;}
  .ah-brand img{height:22px;width:auto;}
  .ah-nav{display:flex;align-items:center;gap:2px;}
  .ah-nav a{font-family:var(--sans);font-size:13px;color:var(--ink-2);padding:6px 12px;border-radius:6px;transition:color 0.15s,background 0.15s;}
  .ah-nav a:hover{color:var(--ink);background:var(--bg-alt);}
  .ah-cta{font-family:var(--sans);font-size:12px;font-weight:600;background:var(--chart);color:#0a0b14;padding:8px 16px;border-radius:999px;transition:background 0.15s;white-space:nowrap;flex:none;}
  .ah-cta:hover{background:var(--chart-dark);}
  @media(max-width:640px){.ah-nav{display:none;}.article-header-inner{padding:0 16px;}}
  .article-hero{padding:104px 0 72px;border-bottom:1px solid var(--line);}
  .article-back{font-family:var(--sans);font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:var(--muted);margin-bottom:36px;display:inline-flex;align-items:center;gap:8px;transition:color 0.2s;}
  .article-back:hover{color:var(--accent);}
  .article-meta{font-family:var(--sans);font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:var(--muted);display:flex;gap:20px;align-items:center;margin-bottom:28px;}
  .article-meta .cat{color:var(--accent);}
  .article-title{font-family:var(--serif);font-size:clamp(40px,5vw,76px);font-weight:400;line-height:1.05;letter-spacing:-0.02em;max-width:20ch;margin:0 0 32px;}
  .article-deck{font-family:var(--serif);font-size:clamp(18px,1.5vw,22px);font-weight:400;line-height:1.5;color:var(--ink-2);max-width:56ch;}
  .container-article{max-width:760px;margin:0 auto;padding:0 32px;}
  .container{max-width:1320px;margin:0 auto;padding:0 32px;}
  .article-cover{width:100%;height:clamp(320px,45vw,560px);background-size:cover;background-position:center;margin:64px 0;border-radius:2px;}
  .article-body{font-family:var(--serif);font-size:19px;font-weight:400;line-height:1.75;color:var(--ink-2);}
  .article-body p{margin-bottom:1.6em;}
  .article-body h2{font-family:var(--serif);font-size:clamp(24px,2.2vw,34px);font-weight:400;letter-spacing:-0.02em;line-height:1.15;color:var(--ink);margin:2.8em 0 0.8em;}
  .article-body blockquote{border-left:3px solid var(--accent);margin:2.5em 0;padding:0 0 0 28px;font-size:clamp(22px,2vw,28px);font-style:italic;color:var(--ink);font-weight:400;line-height:1.35;}
  .article-body .callout{background:var(--bg-alt);border-radius:4px;padding:28px 32px;margin:2.5em 0;font-family:var(--sans);font-size:15px;line-height:1.6;color:var(--ink-2);}
  .article-body .callout strong{font-weight:600;color:var(--ink);}
  .article-end{padding:56px 0;border-top:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:20px;margin-top:48px;}
  .article-end .byline{font-family:var(--sans);font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:var(--muted);}
  .article-end .back-link{font-size:13px;padding:10px 20px;border:1px solid var(--line-strong);border-radius:999px;font-family:var(--sans);color:var(--ink);transition:background 0.2s,color 0.2s,border-color 0.2s;}
  .article-end .back-link:hover{background:var(--ink);color:var(--bg);border-color:var(--ink);}
  footer{background:var(--bg-alt);padding:72px 0 36px;border-top:1px solid var(--line);}
  .foot-bottom{display:flex;justify-content:space-between;font-family:var(--sans);font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:var(--muted);padding-top:32px;border-top:1px solid var(--line);}
  .reveal{opacity:0;transform:translateY(20px);transition:opacity 0.8s ease,transform 0.8s cubic-bezier(.2,.7,.2,1);}
  .reveal.in{opacity:1;transform:translateY(0);}
  @media(max-width:640px){.article-hero{padding:80px 0 48px;}.container-article{padding:0 20px;}.article-body{font-size:17px;}}
</style>
</head>
<body>

<header class="article-header">
  <div class="article-header-inner">
    <a href="stratum.html" class="ah-brand"><img src="logo.svg" alt="TMI"/> TMI</a>
    <nav class="ah-nav">
      <a href="news.html">Founders of the Future Letters</a>
      <a href="about.html">About</a>
    </nav>
    <a href="/complete-audit" class="ah-cta">Apply &rarr;</a>
  </div>
</header>

<section class="article-hero">
  <div class="container-article">
    <a href="news.html" class="article-back">&larr; Back to Founders of the Future Letters</a>
    <div class="article-meta"><span class="cat">${esc(f.category)}</span><span>${f.read_time} min read</span><span>${esc(date)}</span></div>
    <h1 class="article-title">${title}</h1>
    <p class="article-deck">${esc(f.deck)}</p>
  </div>
</section>

<div class="container-article">
  <div class="article-cover" style="background-image:url('${photo}');background-position:center;"></div>
  <div class="article-body reveal">

${bodyHtml}
${faqHtml}
    <div class="article-end">
      <div class="byline">TMI Founders of the Future Letters &middot; ${esc(f.category)}</div>
      <a href="news.html" class="back-link">&larr; All stories</a>
    </div>
  </div>
</div>

<footer>
  <div class="container">
    <div class="foot-bottom">
      <span>&copy; 2026 TMI Technology</span>
      <span>Founders of the Future Letters</span>
    </div>
  </div>
</footer>

<script>
const obs = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); } });
}, { threshold: 0.08 });
document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
</script>
</body>
</html>
`;
}

// The news.html story card, matching the live markup.
function newsCard(f, filename) {
  const photo = pexelsUrl(f.photo_id).replace('w=1400', 'w=900');
  const cat = esc(f.category);
  const teaser = esc(f.meta_description || f.deck);
  return `      <a class="story reveal" href="${filename}" data-cat="${cat}">
        <div class="story-photo" style="background-image:url('${photo}')"></div>
        <div class="story-meta"><span class="cat">${cat}</span><span>${f.read_time} min</span></div>
        <h3>${esc(f.title)}</h3>
        <p>${teaser}</p>
        <span class="story-read">Read &#8594;</span>
      </a>`;
}

// Prepend the card into the stories grid and bump the visible article count.
function insertCard(newsHtml, cardHtml) {
  const anchor = '<div class="stories-grid">';
  const idx = newsHtml.indexOf(anchor);
  if (idx === -1) throw new Error('Could not find the stories grid in news.html');
  const at = idx + anchor.length;
  let out = newsHtml.slice(0, at) + '\n\n' + cardHtml + '\n' + newsHtml.slice(at);
  out = out.replace(/(\d+)(\s*articles)/, (m, n, tail) => (parseInt(n, 10) + 1) + tail);
  return out;
}

module.exports = { writeArticle, buildArticleHTML, newsCard, insertCard, slugify, pickPhoto, PEXELS };
