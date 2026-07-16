import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const envFile = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
    for (const line of envFile.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]+)"?\s*$/);
      if (m) process.env[m[1]] = m[2];
    }
  } catch {}
}

import Anthropic from '@anthropic-ai/sdk';
import * as db from './tools/db.js';

const anthropic = new Anthropic();

// ── Extract article text from HTML ────────────────────────────────────────

function extractArticleText(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

// ── Find the most recently written article ────────────────────────────────

function getLatestArticle() {
  const newsDir = ROOT;
  const files = fs.readdirSync(newsDir)
    .filter(f => f.startsWith('article-') && f.endsWith('.html'))
    .map(f => ({ file: f, mtime: fs.statSync(path.join(newsDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (!files.length) return null;
  const latest = files[0];
  return {
    filename: latest.file,
    text: extractArticleText(fs.readFileSync(path.join(newsDir, latest.file), 'utf8')),
  };
}

// ── Generate social content ───────────────────────────────────────────────

async function generateSocialContent(article) {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: `You create social media content for TMI Technology.
TMI builds AI operating systems for trade businesses and field service companies.
Voice: direct, operator-centric, tight. Written for trade business owners and field service operators.
No em dashes. No generic AI hype. No "leverage". Talk about operations, crews, dispatch, invoices.`,
    messages: [{
      role: 'user',
      content: `Based on this article, generate social content for TMI. Return JSON only.

Article: ${article.text.slice(0, 3000)}

Generate:
{
  "linkedin_posts": [
    {"hook": "opening line (scroll-stopper, direct, no question mark)", "body": "2-3 short paragraphs expanding the insight", "cta": "closing line with soft CTA"},
    {"hook": "...", "body": "...", "cta": "..."},
    {"hook": "...", "body": "...", "cta": "..."}
  ],
  "twitter_thread": [
    "tweet 1 (the hook - under 280 chars)",
    "tweet 2 (first point)",
    "tweet 3 (second point)",
    "tweet 4 (third point)",
    "tweet 5 (the closer + CTA)"
  ],
  "newsletter_blurb": "2-3 sentences that could open a newsletter email - sets up this article as worth reading"
}`
    }]
  });

  try {
    const raw = message.content[0].text;
    const json = raw.match(/\{[\s\S]*\}/)?.[0];
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

// ── Main repurpose agent ───────────────────────────────────────────────────

export async function runContentRepurpose(articleFilename) {
  // Get article to repurpose
  let article;
  if (articleFilename) {
    const filePath = path.join(ROOT, articleFilename);
    article = {
      filename: articleFilename,
      text: extractArticleText(fs.readFileSync(filePath, 'utf8')),
    };
  } else {
    article = getLatestArticle();
  }

  if (!article) {
    console.log('No article found to repurpose');
    return;
  }

  // Check if already repurposed
  const alreadyRepurposed = await db.contentAlreadyRepurposed(article.filename);

  if (alreadyRepurposed) {
    console.log(`${article.filename} already repurposed`);
    return;
  }

  console.log(`Repurposing: ${article.filename}`);
  const content = await generateSocialContent(article);

  if (!content) {
    console.error('Failed to generate content');
    return;
  }

  // Save all generated content to queue
  const rows = [];

  for (const post of content.linkedin_posts || []) {
    rows.push({
      source_article: article.filename,
      platform: 'linkedin',
      content: `${post.hook}\n\n${post.body}\n\n${post.cta}`,
      status: 'pending',
    });
  }

  for (const tweet of content.twitter_thread || []) {
    rows.push({
      source_article: article.filename,
      platform: 'twitter',
      content: tweet,
      status: 'pending',
    });
  }

  if (content.newsletter_blurb) {
    rows.push({
      source_article: article.filename,
      platform: 'newsletter',
      content: content.newsletter_blurb,
      status: 'pending',
    });
  }

  await db.queueContent(rows);

  console.log(`Generated ${rows.length} pieces of content from ${article.filename}`);
  console.log(`  ${content.linkedin_posts?.length || 0} LinkedIn posts`);
  console.log(`  ${content.twitter_thread?.length || 0} tweets`);
  console.log(`  ${content.newsletter_blurb ? 1 : 0} newsletter blurb`);

  return { article: article.filename, count: rows.length };
}

// Run if called directly
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const articleArg = process.argv[2]; // optional: pass specific article filename
  runContentRepurpose(articleArg).catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
