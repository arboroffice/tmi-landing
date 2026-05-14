const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured in Vercel env' });
  }

  const { project_name, context } = req.body || {};
  if (!context) return res.status(400).json({ error: 'context required' });

  const prompt = `You are a senior product manager. Based on the following raw context for a project called "${project_name || 'Untitled Project'}", write a structured PRD.

CONTEXT:
${context}

Return ONLY a JSON object with exactly these keys (no markdown, no explanation, just the JSON):
{
  "overview": "1-2 sentence project overview",
  "problem": "Problem statement -- who has this problem, what it costs them",
  "goals": "Goals and success metrics (be specific, measurable where possible)",
  "stories": "User stories -- one per line, format: As a [role], I want [feature] so that [benefit]",
  "requirements": "Numbered list of functional requirements",
  "nonfunc": "Non-functional requirements (performance, security, browser support, etc.)",
  "outofscope": "What is explicitly NOT included in this project",
  "tech": "Technical notes for the dev team -- stack, APIs, constraints, integrations",
  "criteria": "Acceptance criteria -- how do we know each major feature is done"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({ error: data.error?.message || 'Anthropic API error' });
    }

    const text = data.content?.[0]?.text || '';

    // Extract JSON from response (strip any surrounding text)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(502).json({ error: 'Could not parse PRD from response' });

    const prd = JSON.parse(jsonMatch[0]);
    return res.json({ prd });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
