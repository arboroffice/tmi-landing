import Anthropic from '@anthropic-ai/sdk';
import Parser from 'rss-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const RSS_FEEDS = [
  { url: 'https://www.constructiondive.com/feeds/news/', label: 'Construction Dive' },
  { url: 'https://www.achrnews.com/rss/news', label: 'ACHR News (HVAC)' },
  { url: 'https://www.bdcnetwork.com/rss.xml', label: 'Building Design+Construction' },
  { url: 'https://www.theverge.com/rss/ai/index.xml', label: 'The Verge AI' },
  { url: 'https://www.oilandgas360.com/feed/', label: 'Oil and Gas 360' },
  { url: 'https://www.constructionequipment.com/rss/news', label: 'Construction Equipment' },
  { url: 'https://www.contractingbusiness.com/rss/news', label: 'Contracting Business' },
  { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', label: 'TechCrunch AI' },
];

async function fetchFeeds() {
  const parser = new Parser({ timeout: 8000 });
  const items = [];

  for (const feed of RSS_FEEDS) {
    try {
      const result = await parser.parseURL(feed.url);
      const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000; // last 3 days
      const recent = result.items
        .filter(item => !item.pubDate || new Date(item.pubDate).getTime() > cutoff)
        .slice(0, 6)
        .map(item => ({
          source: feed.label,
          title: item.title?.trim() || '',
          summary: (item.contentSnippet || item.summary || '').slice(0, 400).trim(),
          link: item.link || '',
          date: item.pubDate || '',
        }));
      items.push(...recent);
      console.log(`  ${feed.label}: ${recent.length} items`);
    } catch (err) {
      console.warn(`  Feed failed: ${feed.label} - ${err.message}`);
    }
  }

  return items;
}

async function analyzeTopics(feedItems) {
  const client = new Anthropic();

  const claudeMd = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
  const existingMatch = claudeMd.match(/^- article-.*$/gm);
  const existingArticles = existingMatch ? existingMatch.join('\n') : '';

  const fallbackTopics = claudeMd.match(/^- ".*"$/gm)?.join('\n') || '';

  const feedSection = feedItems.length > 0
    ? feedItems.map(i => `[${i.source}] ${i.title}\n${i.summary}`).join('\n\n---\n\n')
    : 'No feed items available. Use your knowledge of current industry trends.';

  const today = new Date().toISOString().split('T')[0];

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `You are a research editor for TMI Field Notes, a blog for operators and owners in the trades (construction, HVAC, plumbing, electrical, oil & gas, manufacturing, landscaping, fleet).

TODAY'S INDUSTRY NEWS:
${feedSection}

BACKUP TOPIC IDEAS (use if news is thin):
${fallbackTopics}

ALREADY COVERED - do not suggest these topics:
${existingArticles}

Identify 4 strong article angles for TMI's blog. Good angles:
- Connect a real operational problem to a specific industry trend or data point
- Are written for owners and operators, not software buyers or tech teams
- Can be written with real numbers and specific scenarios
- Have not been covered in the existing article list

Bad angles: generic AI hype, topics already in the existing list, anything that sounds like a press release.

Return ONLY valid JSON, no other text:
{
  "date": "${today}",
  "topics": [
    {
      "angle": "One-sentence description of the specific angle",
      "why_it_matters": "Why operators and field managers care about this",
      "data_points": "Specific numbers, stats, or facts to anchor the piece",
      "tmi_category": "Operations",
      "suggested_title": "Draft title in TMI voice - direct, no hedging, no em dashes",
      "suggested_slug": "article-short-slug-here",
      "related_to": "construction|hvac|oil-gas|manufacturing|fleet|trades|general"
    }
  ]
}

Categories must be one of: Operations, The Trades, AI & Tech, Finance, Leadership`
    }]
  });

  const text = response.content[0].text.trim();

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Failed to parse Claude response as JSON:\n${text.slice(0, 500)}`);
  }
}

async function main() {
  console.log('TMI Research Agent - ' + new Date().toISOString());
  console.log('Fetching RSS feeds...');
  const feedItems = await fetchFeeds();
  console.log(`Total: ${feedItems.length} feed items`);

  console.log('Analyzing with Claude Haiku...');
  const brief = await analyzeTopics(feedItems);

  const outputPath = path.join(ROOT, 'daily-brief.json');
  fs.writeFileSync(outputPath, JSON.stringify(brief, null, 2));
  console.log(`Wrote ${brief.topics.length} topics to daily-brief.json`);
  brief.topics.forEach((t, i) => console.log(`  ${i + 1}. ${t.suggested_title}`));
}

main().catch(err => {
  console.error('Research agent failed:', err.message);
  process.exit(1);
});
