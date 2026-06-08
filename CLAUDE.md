# TMI Landing — Claude Agent Guide

## Project Overview

Static HTML site for TMI Technology. No build system. All CSS is inline in `<style>` tags in each file. Deployed to Vercel via GitHub push to `main`. Every `git push origin main` triggers a live deploy.

**Live URL:** https://tmi-technology.com  
**GitHub:** https://github.com/arboroffice/tmi-landing  
**Stack:** Pure HTML/CSS/JS, no frameworks, no bundler

---

## Design Systems

### Main Site (stratum.html, industry pages, platform pages)
CSS variables:
```css
--bg: #ffffff
--bg-alt: #f5f5f7
--bg-deep: #0d0e1a
--bg-dark: #0a0b14
--ink: #1a1a1a
--ink-2: #505060
--muted: #86868b
--line: rgba(0,0,0,0.07)
--chart: #E4FF97        /* chartreuse accent */
--chart-dark: #D0FF6A
--serif: "Barlow", system-ui, sans-serif
--sans: "Neue Haas Grotesk Display", system-ui, sans-serif
```

### Field Notes Articles (article-*.html)
Same design system as the main site — white background, Barlow, dark accent:
```css
--bg: #ffffff
--bg-alt: #f5f5f7
--bg-deep: #0a0b14
--ink: #1a1a1a
--ink-2: #505060
--muted: #86868b
--line: rgba(0,0,0,0.08)
--line-strong: rgba(0,0,0,0.13)
--accent: #1a1a1a
--accent-2: #000
--chart: #E4FF97
--chart-dark: #D0FF6A
--serif: "Barlow", system-ui, sans-serif
--sans: "Neue Haas Grotesk Display", "Neue Haas Grotesk", system-ui, sans-serif
```
Font: `family=Barlow:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,600` only. No Playfair Display. No Inter. No warm paper colors.

---

## Article Categories
- `Operations`
- `The Trades`
- `AI & Tech`
- `Finance`
- `Leadership`

---

## Existing Articles (do not duplicate these topics)
- article-admin-burden.html — Admin overhead killing margins
- article-ai-dispatch.html — AI for dispatching
- article-best-guy-quit.html — Knowledge retention when key people leave
- article-budget-overruns.html — Construction budget overruns
- article-change-orders.html — Change order management
- article-crew-accountability.html — Crew accountability systems
- article-crew-ignores-apps.html — Why crews ignore software
- article-equipment-lost.html — Equipment tracking
- article-expensive-dispatcher.html — Cost of human dispatchers
- article-idle-time.html — Idle time and labor waste
- article-job-costing.html — Job costing accuracy
- article-labor-shortage.html — Trades labor shortage
- article-missed-maintenance.html — Predictive vs reactive maintenance
- article-paperless-offline.html — Going paperless in the field
- article-pricing-accuracy.html — Estimating and pricing
- article-revenue-leakage.html — Revenue leakage in field ops
- article-scaling-trap.html — The scaling trap for growing companies
- article-servicetitan-alternative.html — ServiceTitan alternatives
- article-subcontractors.html — Managing subcontractors
- article-training-replacement.html — Training and replacement costs
- article-15-billion.html — $15B market opportunity
- article-concrete.html — Concrete industry
- article-construction.html — Construction industry AI
- article-electrician.html — Electricians
- article-estimators.html — Estimators
- article-foreman.html — Foreman role
- article-heavy-equipment.html — Heavy equipment
- article-hvac.html — HVAC
- article-landscaping.html — Landscaping
- article-manufacturing.html — Manufacturing
- article-mining.html — Mining
- article-oil-gas-software.html — Oil & gas software
- article-one-molly.html — One Molly story
- article-painting.html — Painting contractors
- article-pipeline.html — Pipeline operations
- article-plumbing.html — Plumbing
- article-predictive-maintenance.html — Predictive maintenance
- article-roofing.html — Roofing
- article-trades-and-ai.html — Trades and AI overview
- article-welding.html — Welding
- ai-for-oil-gas-companies.html — AI for oil & gas
- article-backlog-cash-timing.html — Cash flow timing and backlog vs. actual cash
- article-power-ai-projects-crew-safety.html — Data center / power gen crew readiness

---

## Daily Blog Poster Agent

### What it does
Writes and publishes one new Field Notes article per day. Picks a topic not already covered, writes 800–1400 words in TMI's voice, generates the full HTML file, and adds it to news.html.

### TMI Voice & Tone
- Direct. No hedging. No "leverage AI strategically."
- Written for operators, owners, and field managers — not tech people
- Uses real numbers and specific scenarios, not abstractions
- Short paragraphs. Blunt sentences. Occasional long Faulkner-esque run-on to land a point
- No bullet-point listicles. Narrative structure with 3–4 H2 sections
- Category framing: what's the operational problem → why it happens → what the system-built version looks like → what changes when you fix it
- Never says "AI will solve this" — says "when the system is built to capture this..."

### Good topic ideas (use these or similar)
- "The job that cost you more than the invoice said"
- "Why your best crews run on feel, not process"
- "What happens to your business when the owner goes on vacation"
- "The dispatcher who can't be replaced (and why that's a problem)"
- "How construction companies lose money between approval and invoice"
- "The float game: why invoice timing is quietly killing your cash flow"
- "What a 30-person operation looks like on one screen"
- "The difference between a busy company and a profitable one"
- "Why field crews ignore every app you buy them"
- "The real cost of a callback"
- "What your competitors figured out before you"
- "How to build a company your best people want to stay in"
- "What 'fully booked' actually means for your margins"
- "The paperwork that costs more than the job"

### Article HTML Template

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<link rel="icon" href="favicon.svg" type="image/svg+xml"/>
<link rel="apple-touch-icon" href="favicon.svg"/>
<meta name="description" content="{META_DESCRIPTION}"/>
<meta property="og:title" content="{TITLE} | TMI"/>
<meta property="og:description" content="{META_DESCRIPTION}"/>
<meta property="og:type" content="article"/>
<meta property="og:url" content="https://tmi-technology.com/{FILENAME}"/>
<meta property="og:image" content="{PEXELS_IMAGE_URL}"/>
<meta property="og:site_name" content="TMI"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="{TITLE} | TMI"/>
<meta name="twitter:description" content="{META_DESCRIPTION}"/>
<meta name="twitter:image" content="{PEXELS_IMAGE_URL}"/>
<link rel="canonical" href="https://tmi-technology.com/{FILENAME}"/>
<title>{TITLE} | TMI</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,600&display=swap" rel="stylesheet"/>
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
  .article-title em{font-style:italic;color:var(--accent-2);}
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
  .read-next{background:var(--bg-alt);padding:80px 0;border-top:1px solid var(--line);}
  .read-next h3{font-family:var(--sans);font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:var(--muted);margin-bottom:36px;}
  .read-next-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:32px;}
  .next-card{display:flex;flex-direction:column;gap:12px;}
  .next-card .photo{height:200px;background-size:cover;background-position:center;border-radius:2px;}
  .next-card .meta{font-family:var(--sans);font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:var(--muted);display:flex;gap:14px;}
  .next-card .meta .cat{color:var(--accent);}
  .next-card h4{font-family:var(--serif);font-size:22px;font-weight:400;letter-spacing:-0.01em;line-height:1.2;}
  .next-card .read{font-family:var(--sans);font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:var(--ink);display:inline-flex;align-items:center;gap:8px;transition:gap 0.2s,color 0.2s;}
  .next-card:hover .read{gap:12px;color:var(--accent);}
  footer{background:var(--bg-alt);padding:72px 0 36px;border-top:1px solid var(--line);}
  .foot-bottom{display:flex;justify-content:space-between;font-family:var(--sans);font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:var(--muted);padding-top:32px;border-top:1px solid var(--line);}
  .reveal{opacity:0;transform:translateY(20px);transition:opacity 0.8s ease,transform 0.8s cubic-bezier(.2,.7,.2,1);}
  .reveal.in{opacity:1;transform:translateY(0);}
  @media(max-width:640px){.article-hero{padding:80px 0 48px;}.container-article{padding:0 20px;}.article-body{font-size:17px;}.read-next-grid{grid-template-columns:1fr;}}
</style>
</head>
<body>

<header class="article-header">
  <div class="article-header-inner">
    <a href="stratum.html" class="ah-brand"><img src="logo.svg" alt="TMI"/> TMI</a>
    <nav class="ah-nav">
      <a href="news.html">Field Notes</a>
      <a href="about.html">About</a>
    </nav>
    <a href="/audit" class="ah-cta">Apply &rarr;</a>
  </div>
</header>

<section class="article-hero">
  <div class="container-article">
    <a href="news.html" class="article-back">← Back to Field Notes</a>
    <div class="article-meta"><span class="cat">{CATEGORY}</span><span>{READ_TIME} min read</span><span>{DATE}</span></div>
    <h1 class="article-title">{TITLE_LINE_1} <em>{TITLE_LINE_2_ITALIC}</em></h1>
    <p class="article-deck">{DECK — one sentence, 20–30 words, Playfair voice}</p>
  </div>
</section>

<div class="container-article">
  <div class="article-cover" style="background-image:url('{PEXELS_IMAGE_URL}');background-position:center;"></div>
  <div class="article-body reveal">

    <p>{OPENING — set the scene with a specific operator/situation. No abstractions.}</p>

    <p>{Second paragraph — widen the lens to the industry pattern.}</p>

    <h2>{Section 1 heading}</h2>

    <p>{Body paragraphs. 2–4 per section.}</p>

    <blockquote>{One punchy quote — not attributed, just the insight.}</blockquote>

    <h2>{Section 2 heading}</h2>

    <p>{Body.}</p>

    <h2>{Section 3 heading}</h2>

    <p>{Body.}</p>

    <div class="callout"><strong>{Callout header}:</strong> {Practical list or framework in prose form.}</div>

    <p>{Closing paragraph — what changes when this is fixed.}</p>

    <div class="article-end">
      <div class="byline">TMI Field Notes · {CATEGORY}</div>
      <a href="news.html" class="back-link">← All stories</a>
    </div>
  </div>
</div>

<div class="read-next">
  <div class="container">
    <h3>Read next</h3>
    <div class="read-next-grid">
      <a class="next-card" href="{RELATED_ARTICLE_1_FILENAME}">
        <div class="photo" style="background-image:url('{RELATED_1_IMAGE}')"></div>
        <div class="meta"><span class="cat">{RELATED_1_CATEGORY}</span><span>{RELATED_1_MINS} min</span></div>
        <h4>{RELATED_1_TITLE}</h4>
        <span class="read">Read &rarr;</span>
      </a>
      <a class="next-card" href="{RELATED_ARTICLE_2_FILENAME}">
        <div class="photo" style="background-image:url('{RELATED_2_IMAGE}')"></div>
        <div class="meta"><span class="cat">{RELATED_2_CATEGORY}</span><span>{RELATED_2_MINS} min</span></div>
        <h4>{RELATED_2_TITLE}</h4>
        <span class="read">Read &rarr;</span>
      </a>
    </div>
  </div>
</div>

<footer>
  <div class="container">
    <div class="foot-bottom">
      <span>&copy; 2026 TMI Technology</span>
      <span>Field Notes</span>
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
```

### Adding article to news.html

After writing the article file, find the article grid in news.html and prepend a new card. The card format is:

```html
<article class="news-card" data-category="{category-lowercase-hyphenated}">
  <a href="{FILENAME}" class="news-card-img" style="background-image:url('{PEXELS_IMAGE_URL}')"></a>
  <div class="news-card-body">
    <div class="news-card-meta"><span class="news-cat">{CATEGORY}</span><span>{READ_TIME} min read</span><span>{DATE}</span></div>
    <h3><a href="{FILENAME}">{TITLE}</a></h3>
    <p>{DECK}</p>
    <a href="{FILENAME}" class="news-read">Read &rarr;</a>
  </div>
</article>
```

`data-category` values: `operations`, `the-trades`, `ai-tech`, `finance`, `leadership`

### Pexels image selection
Pick a Pexels photo relevant to the topic. Always use this format:
`https://images.pexels.com/photos/{PHOTO_ID}/pexels-photo-{PHOTO_ID}.jpeg?auto=compress&cs=tinysrgb&w=1400&q=80`

Good TMI photo IDs by topic:
- Construction/jobsite: 1216589, 1078884, 1117452
- HVAC/trades: 3964736, 3721272
- Office/finance: 3184465, 3184291
- Manufacturing: 1108101, 3862627
- Pipeline/oil: 3229014, 247763
- Crew/people: 2381463, 3184465
- Equipment: 2101137, 1078884
- General operations: 3184465, 3184291, 1181686

### Deploy after posting

After writing the article file and updating news.html:
```bash
git add {ARTICLE_FILENAME} news.html
git commit -m "Add Field Notes: {TITLE}"
git push origin main
```

---

## Agent Rules

1. **Never change branding** — colors, fonts, and CSS variables are locked
2. **Never use em dashes** — use regular dashes or restructure the sentence
3. **No bullet point listicles** — write in prose
4. **No generic AI hype** — "leverage AI" is banned. Write about systems and operations
5. **Always deploy after changes** — push to main triggers live deploy
6. **Article filenames** — `article-{short-slug}.html`, all lowercase, hyphens only
7. **Read before writing** — use the Write tool only after reading the file (if it already exists)
8. **One article per run** — quality over quantity. One well-written piece beats three mediocre ones
