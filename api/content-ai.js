const { requireAuth, cors } = require('./_auth');

const TMI_SYSTEM = `You are a content writer for TMI Technology. TMI builds AI infrastructure and robotic systems for trade businesses (HVAC, roofing, construction, plumbing, landscaping, oil & gas, fleet) and online businesses (coaches, course creators, e-commerce).

TMI Voice Rules:
- Direct. No hedging. No corporate speak.
- Written for operators, owners, and field managers - not tech people.
- Real numbers and specific scenarios, not abstractions.
- Short sentences. Blunt. Occasionally a long run-on to land a point.
- Never say "leverage AI" - say "when the system is built to capture this..."
- Never use em dashes - use regular dashes or restructure.
- Never say "Not theory. Not hype." - banned phrase.
- Never teach the mechanism - show the result.
- Never soften a take.
- Start talking heads mid-thought. Never with hello, hey, or what is up.
- Never finish the list in an If I Owned a post.
- Always end abruptly. No call to action.`;

const PLATFORM_GUIDE = {
  tiktok:    'TikTok caption/script. Hook in first 2 words. Under 150 words. No hashtags.',
  instagram: 'Instagram caption. Strong hook first line. Line breaks for breathing room. 100-200 words.',
  linkedin:  'LinkedIn post. Can be 200-300 words. Still punchy. No corporate fluff. No emojis.',
  youtube:   'YouTube Short script. Under 60 seconds spoken. Direct. Include [on-screen text] notes.',
};

const FORMAT_GUIDE = {
  caption:   'Write a post caption. No hashtags. Minimal emojis. End abruptly.',
  script:    'Write a talking-head video script. Include [on-screen text] in brackets. Shot notes in (parentheses). Start mid-thought.',
  hooks:     'Write 5 different hook options for this idea. Just the opening line/phrase for each, numbered. No explanation.',
  thread:    'Write a 5-post thread. Each post under 150 words. Numbered. First post is the hook.',
};

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();

  const { action, idea, platform, format, topic, image_prompt } = req.body || {};

  // ── Write copy with Claude ────────────────────────────────────────────────
  if (action === 'write') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });

    const userMsg = `Write ${format === 'hooks' ? '5 hook options' : `a ${platform || 'social media'} ${format || 'caption'}`} for this content idea:

"${idea}"

${PLATFORM_GUIDE[platform] || 'Social media post.'}
${FORMAT_GUIDE[format] || ''}

Write it now. No preamble. Just the content.`;

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-7',
          max_tokens: 1024,
          system: TMI_SYSTEM,
          messages: [{ role: 'user', content: userMsg }],
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: e.error?.message || 'Anthropic error' });
      }
      const data = await r.json();
      return res.json({ content: data.content[0].text });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Research with Claude ──────────────────────────────────────────────────
  if (action === 'research') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });

    const userMsg = `Research this topic for TMI content: "${topic || idea}"

Give me:
1. Key facts and numbers (3-5 specific stats an operator would care about)
2. The real pain behind this - what is the operator actually losing or dealing with
3. What most people get wrong about this
4. One concrete real-world scenario I could film or describe
5. The TMI angle - how does AI infrastructure or robotics change this specifically

Keep it tight. Just usable facts. No fluff.`;

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-7',
          max_tokens: 1200,
          system: TMI_SYSTEM,
          messages: [{ role: 'user', content: userMsg }],
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: e.error?.message || 'Anthropic error' });
      }
      const data = await r.json();
      return res.json({ content: data.content[0].text });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Generate image with DALL-E 3 ─────────────────────────────────────────
  if (action === 'image') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return res.status(503).json({ error: 'OPENAI_API_KEY not configured' });

    const size = req.body.size || '1024x1024';
    const basePrompt = image_prompt || (idea
      ? `Industrial/trade photography. ${idea}. Real job site. Cinematic lighting. No text.`
      : 'Trade business operations. Real workers. Cinematic. No text overlay.');

    try {
      const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key,
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: basePrompt,
          n: 1,
          size,
          quality: 'standard',
          style: 'natural',
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: e.error?.message || 'OpenAI error' });
      }
      const data = await r.json();
      return res.json({ url: data.data[0].url, revised_prompt: data.data[0].revised_prompt });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Generate ad variations ────────────────────────────────────────────────
  if (action === 'ad-variants') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });

    const userMsg = `Write 3 ad variants for this TMI content idea: "${idea}"

Each variant should have:
- Headline (under 8 words)
- Body copy (2-3 sentences max)
- CTA (3-5 words)

Format as:
VARIANT 1
Headline: ...
Body: ...
CTA: ...

[repeat for 2 and 3]

TMI ads are direct, operator-focused, specific. No hype words.`;

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-7',
          max_tokens: 800,
          system: TMI_SYSTEM,
          messages: [{ role: 'user', content: userMsg }],
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: e.error?.message || 'Anthropic error' });
      }
      const data = await r.json();
      return res.json({ content: data.content[0].text });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action. Use: write, research, image, ad-variants' });
};
