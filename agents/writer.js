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
      content: `Pick one strong article topic for TMI Field Notes. Use the topic ideas in this CLAUDE.md file. Do not repeat any existing articles.

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
    system: `You are the editor of TMI Field Notes. Write one complete article as a full HTML file.

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

OUTPUT: Return ONLY the complete HTML file. No preamble, no explanation, no markdown fences.`,
    messages: [{
      role: 'user',
      content: `Write this Field Notes article:

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

  // Save title for git commit message
  fs.writeFileSync(path.join(ROOT, '.last-title'), topic.suggested_title);

  console.log(`Done. Article: ${filename} | ${readTime} min read`);
}

main().catch(err => {
  console.error('Writer agent failed:', err.message);
  process.exit(1);
});
