import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// Fetch a company website and extract useful content (under 3000 chars)
async function fetchWebsite(url) {
  if (!url) return null;
  try {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    const res = await fetch(fullUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TMI-Research/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Strip HTML tags, collapse whitespace
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000);
    return text || null;
  } catch {
    return null;
  }
}

// Use Claude to analyze what we know about a company and extract GTM insights
export async function researchCompany({ name, website, industry, location, employeeCount, reviewCount }) {
  const websiteContent = await fetchWebsite(website);

  const context = [
    `Company: ${name}`,
    `Industry: ${industry || 'unknown'}`,
    `Location: ${location || 'unknown'}`,
    `Employees: ${employeeCount || 'unknown'}`,
    `Google reviews: ${reviewCount || 'unknown'}`,
    websiteContent ? `\nWebsite content (excerpt):\n${websiteContent}` : '',
  ].filter(Boolean).join('\n');

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Analyze this trade/field service company and extract 3 specific operational pain points they likely have based on their size and industry. Be concrete - think about dispatch, invoicing, compliance, crew management, field documentation.

${context}

Return JSON only:
{
  "companySize": "small/medium/large",
  "likelyPainPoints": ["pain 1", "pain 2", "pain 3"],
  "primaryPain": "the single most likely pain point in one sentence",
  "crewCount": "estimated number of crews/trucks based on size",
  "goodFit": true/false,
  "fitReason": "one sentence why they are or aren't a fit for TMI"
}`
    }],
  });

  try {
    const raw = message.content[0].text;
    const json = raw.match(/\{[\s\S]*\}/)?.[0];
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}
