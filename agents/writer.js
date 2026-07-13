import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Load .env.local for local runs (GitHub Actions uses repo secrets)
if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const envFile = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
    for (const line of envFile.split('\n')) {
      const m = line.match(/^([A-Z_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
      if (m) process.env[m[1]] = m[2];
    }
  } catch {}
}

const PEXELS = {
  construction:   ['1216589', '1078884', '1117452'],
  hvac:           ['3964736', '3721272'],
  'oil-gas':      ['3229014', '247763'],
  manufacturing:  ['1108101', '3862627'],
  fleet:          ['2101137', '1078884'],
  trades:         ['2381463', '1216589'],
  finance:        ['3184465', '3184291'],
  general:        ['3184465', '1181686', '3184291'],
};

function pexelsUrl(id) {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1400&q=80`;
}

function pickPhoto(relatedTo) {
  const ids = PEXELS[relatedTo] || PEXELS.general;
  return ids[Math.floor(Math.random() * ids.length)];
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

function formatDate(d) {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function estimateReadTime(html) {
  const words = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(4, Math.ceil(words / 200));
}

function buildStoryCard({ filename, imageUrl, category, readTime, dateStr, title, deck }) {
  const amp = category.includes('&') ? category.replace(/&/g, '&amp;') : category;
  return `
      <a class="story reveal" href="${filename}" data-cat="${amp}">
        <div class="story-photo" style="background-image:url('${imageUrl}')"></div>
        <div class="story-meta"><span class="cat">${amp}</span><span>${readTime} min</span></div>
        <h3>${title}</h3>
        <p>${deck}</p>
        <span class="story-read">Read &#8594;</span>
      </a>
`;
}

async function pickTopic() {
  const briefPath = path.join(ROOT, 'daily-brief.json');
  if (fs.existsSync(briefPath)) {
    const brief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
    if (brief.topics?.length > 0) {
      console.log(`Using topic from daily-brief.json: ${brief.topics[0].suggested_title}`);
      return brief.topics[0];
    }
  }

  // Fallback: ask Claude to pick a topic from CLAUDE.md ideas
  console.log('No daily-brief.json found. Generating topic from CLAUDE.md ideas...');
  const client = new Anthropic();
  const claudeMd = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');

  const existingMatch = claudeMd.match(/^- article-[^\n]+/gm);
  const existing = existingMatch ? existingMatch.join('\n') : '';

  const resp = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `Pick one strong article topic for TMI Founders of the Future Letters. Use the topic ideas in this CLAUDE.md file. Do not repeat any existing articles.

EXISTING ARTICLES:
${existing}

CLAUDE.md TOPIC IDEAS SECTION:
${claudeMd.split('### Good topic ideas')[1]?.split('###')[0] || ''}

Return ONLY valid JSON:
{
  "angle": "The specific angle",
  "why_it_matters": "Why operators care",
  "data_points": "Real industry numbers to use",
  "tmi_category": "Operations",
  "suggested_title": "Title in TMI voice",
  "suggested_slug": "article-short-slug",
  "related_to": "construction"
}`
    }]
  });

  const text = resp.content[0].text.trim();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Failed to generate fallback topic');
  }
}

async function writeArticleHtml(topic, { filename, imageUrl, dateStr }) {
  const client = new Anthropic();
  const claudeMd = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');

  // Extract the HTML template from CLAUDE.md
  const templateStart = claudeMd.indexOf('```html\n<!doctype html>');
  const templateEnd = claudeMd.indexOf('\n```\n', templateStart);
  const template = templateStart !== -1 && templateEnd !== -1
    ? claudeMd.slice(templateStart + 7, templateEnd)
    : '';

  // Read a sample article for style reference
  const samplePath = path.join(ROOT, 'article-revenue-leakage.html');
  const sampleExists = fs.existsSync(samplePath);
  const sampleSnippet = sampleExists
    ? fs.readFileSync(samplePath, 'utf8').slice(0, 3000)
    : '';

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system: `You are the editor of TMI Founders of the Future Letters. Write one complete article as a full HTML file.

TMI VOICE RULES - follow these exactly:
- Written for operators, owners, field managers. Not tech people, not software buyers.
- Direct. No hedging. No "leverage AI strategically." No "harness the power of."
- Uses real numbers and specific scenarios. Not abstractions.
- Short paragraphs. Blunt sentences. Occasional long run-on sentence to land a point.
- Narrative structure with 3-4 H2 sections. NOT a listicle.
- Never says "AI will solve this" - says "when the system captures this" or "a field system built for this."
- NEVER use em dashes (- or --). Use regular hyphens with spaces or restructure.
- NO bullet points or numbered lists anywhere in the article body.
- Category arc: what's the operational problem -> why it happens -> what the system-built version looks like -> what changes when you fix it.

AEO / ANSWER-ENGINE OPTIMIZATION - this article must rank in search and be quotable by AI answer engines (Google AI Overviews, ChatGPT, Perplexity):
- The title and the H1 must directly match a real question or query an industrial operator would type or ask out loud.
- The first paragraph of the body must answer that question directly in 2 to 3 plain sentences, so a machine can lift a clean, correct, self-contained answer. Then widen into the narrative.
- Phrase most H2 section headings as the specific questions a reader would ask (still in TMI voice, not generic).
- Make factual claims specific and self-contained. An answer engine should be able to quote any single sentence without surrounding context.
- The meta description must be a direct one-sentence answer to the title question, under 155 characters.

OUTPUT: Return ONLY the complete HTML file. No preamble, no explanation, no markdown fences.`,
    messages: [{
      role: 'user',
      content: `Write this Founders of the Future Letters article:

TOPIC: ${topic.angle}
WHY IT MATTERS: ${topic.why_it_matters}
DATA POINTS TO USE: ${topic.data_points || 'Use realistic industry figures'}
CATEGORY: ${topic.tmi_category}
TITLE: ${topic.suggested_title}
DATE: ${dateStr}
FILENAME: ${filename}
HERO IMAGE URL: ${imageUrl}

Target length: 950-1200 words of body copy.

Use this exact HTML template structure:
${template}

For the READ NEXT section, pick 2 related articles from this list and use real image URLs from those articles:
- article-revenue-leakage.html (Finance) - image: https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=1400&q=80
- article-admin-burden.html (Operations) - image: https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=1400&q=80
- article-trades-and-ai.html (AI & Tech) - image: https://images.pexels.com/photos/1216589/pexels-photo-1216589.jpeg?auto=compress&cs=tinysrgb&w=1400&q=80
- article-labor-shortage.html (The Trades) - image: https://images.pexels.com/photos/2381463/pexels-photo-2381463.jpeg?auto=compress&cs=tinysrgb&w=1400&q=80
- article-scaling-trap.html (Leadership) - image: https://images.pexels.com/photos/1181686/pexels-photo-1181686.jpeg?auto=compress&cs=tinysrgb&w=1400&q=80
- article-idle-time.html (Operations) - image: https://images.pexels.com/photos/2101137/pexels-photo-2101137.jpeg?auto=compress&cs=tinysrgb&w=1400&q=80

REQUIRED: Include this audit CTA block immediately before <div class="article-end"> (every article must have it):
<div class="oi-cta">
  <h3>[Write a short punchy heading relevant to this article's topic]</h3>
  <p>[One sentence: what the TMI audit reveals for an operator in this situation. Max 25 words.]</p>
  <a href="/complete-audit" class="btn">Get the Complete Audit &nearr;</a>
</div>

And include this CSS in the <style> block:
  .oi-cta{margin:3em 0 0;padding:46px 40px;background:var(--bg-deep);border-radius:8px;text-align:center;}
  .oi-cta h3{font-family:var(--serif);font-size:clamp(24px,3vw,32px);color:#fff;margin-bottom:14px;letter-spacing:-0.02em;}
  .oi-cta p{font-family:var(--sans);font-size:15px;line-height:1.6;color:rgba(255,255,255,0.78);max-width:48ch;margin:0 auto 26px;}
  .oi-cta .btn{display:inline-block;font-family:var(--sans);font-size:14px;font-weight:600;background:var(--chart);color:#0a0b14;padding:14px 28px;border-radius:999px;transition:background 0.15s;}
  .oi-cta .btn:hover{background:var(--chart-dark);}

REQUIRED FOR AEO - an FAQ block and structured data:

1. Immediately AFTER the closing </p> of the last body paragraph and BEFORE the oi-cta block, add a short FAQ section with 3 or 4 real questions an operator would ask about this topic, each answered in 2 to 3 self-contained sentences in TMI voice:
<section class="article-faq">
  <h2>Common questions</h2>
  <div class="faq-q"><h3>[Question 1 - phrased exactly as a person would search it]</h3><p>[Direct answer, 2-3 sentences.]</p></div>
  <div class="faq-q"><h3>[Question 2]</h3><p>[Direct answer.]</p></div>
  <div class="faq-q"><h3>[Question 3]</h3><p>[Direct answer.]</p></div>
</section>

2. Add this CSS to the <style> block:
  .article-faq{margin:3em 0 0;padding-top:2em;border-top:1px solid var(--line);}
  .article-faq > h2{font-family:var(--serif);font-size:clamp(24px,2.2vw,32px);font-weight:400;letter-spacing:-0.02em;color:var(--ink);margin-bottom:1em;}
  .article-faq .faq-q{margin-bottom:1.6em;}
  .article-faq .faq-q h3{font-family:var(--sans);font-size:18px;font-weight:600;color:var(--ink);margin-bottom:8px;line-height:1.35;}
  .article-faq .faq-q p{font-family:var(--serif);font-size:17px;line-height:1.7;color:var(--ink-2);}

3. In the <head>, add TWO JSON-LD <script type="application/ld+json"> blocks:
   a) An "Article" schema with headline (the title), description (the meta description), datePublished (${dateStr} in ISO 8601), author and publisher set to Organization "TMI Technology" (url https://www.tmitechai.com), and mainEntityOfPage set to https://www.tmitechai.com/${filename.replace('.html','')}.
   b) A "FAQPage" schema whose mainEntity array contains EXACTLY the same questions and answers as the visible FAQ section above - same count, same wording. The acceptedAnswer text must match the visible answer text.

Return ONLY the complete HTML file.`
    }]
  });

  let html = response.content[0].text.trim();

  // Strip markdown code fences if Claude wrapped it anyway
  if (html.startsWith('```')) {
    html = html.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
  }

  return html;
}

function prependStoryToNews({ card }) {
  const newsPath = path.join(ROOT, 'news.html');
  let content = fs.readFileSync(newsPath, 'utf8');

  // Insert after opening of stories-grid div
  const marker = '<div class="stories-grid">';
  const idx = content.indexOf(marker);
  if (idx === -1) throw new Error('Could not find stories-grid in news.html');

  const insertAt = idx + marker.length;
  content = content.slice(0, insertAt) + card + content.slice(insertAt);

  // Increment article count
  content = content.replace(/(\d+) articles/, (m, n) => `${parseInt(n, 10) + 1} articles`);

  fs.writeFileSync(newsPath, content);
}

async function main() {
  console.log('TMI Writer Agent - ' + new Date().toISOString());

  const topic = await pickTopic();
  console.log(`Writing: "${topic.suggested_title}"`);

  // Build filename
  const rawSlug = topic.suggested_slug?.replace(/^article-/, '') || slugify(topic.suggested_title);
  const filename = `article-${rawSlug}.html`;
  const articlePath = path.join(ROOT, filename);

  if (fs.existsSync(articlePath)) {
    console.error(`Article already exists: ${filename}. Skipping to avoid duplicate.`);
    process.exit(0);
  }

  const photoId = pickPhoto(topic.related_to || 'general');
  const imageUrl = pexelsUrl(photoId);
  const dateStr = formatDate(new Date());

  console.log(`Photo ID: ${photoId}`);
  console.log('Writing article HTML with Claude Sonnet...');

  const html = await writeArticleHtml(topic, { filename, imageUrl, dateStr });

  fs.writeFileSync(articlePath, html);
  console.log(`Wrote ${filename} (${html.length} chars)`);

  const readTime = estimateReadTime(html);

  // Extract deck from the article for the news card
  const deckMatch = html.match(/class="article-deck"[^>]*>([^<]+)</);
  const deck = deckMatch ? deckMatch[1].trim() : topic.angle;

  const card = buildStoryCard({
    filename,
    imageUrl,
    category: topic.tmi_category,
    readTime,
    dateStr,
    title: topic.suggested_title,
    deck,
  });

  prependStoryToNews({ card });
  console.log('Updated news.html');

  // Save title and filename for git commit message and email-sender
  fs.writeFileSync(path.join(ROOT, '.last-title'), topic.suggested_title);
  fs.writeFileSync(path.join(ROOT, '.last-article'), filename);

  console.log(`Done. Article: ${filename} | ${readTime} min read`);
}

main().catch(err => {
  console.error('Writer agent failed:', err.message);
  process.exit(1);
});
