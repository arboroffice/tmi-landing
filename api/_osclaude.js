// Shared Claude extraction for Ops Machine meeting ingestion.

const EXTRACT_SYSTEM = `You are the operations analyst for TMI, an agency that builds custom AI operating systems for physical-economy and online businesses. You read a leadership or advisor meeting transcript and extract a structured digest for an EOS/Traction "Level 10" dashboard.

Return ONLY valid JSON (no markdown, no prose) matching exactly this shape:
{
  "summary": "2-4 sentence recap",
  "wins": ["short win statement", ...],
  "issues": [{"title": "issue or opportunity", "notes": "optional context"}],
  "scorecard_updates": [{"metric": "metric name as discussed", "value": number}],
  "initiative_updates": [{"title": "initiative name", "status": "on-track|behind|done", "progress": number, "notes": "optional"}],
  "action_items": [{"title": "task", "owner": "name or null", "level": "week"}]
}
Keep items concise and operational. Return empty arrays for anything you cannot populate. Never invent numbers that were not stated.`;

async function extractFromTranscript(transcript) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: [{ type: 'text', text: EXTRACT_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Meeting transcript:\n\n${transcript}` }]
    })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Claude API ${r.status}: ${t.slice(0, 300)}`);
  }
  const json = await r.json();
  const text = (json.content || []).map(b => b.text || '').join('').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON in Claude response');
  return JSON.parse(text.slice(start, end + 1));
}

module.exports = { extractFromTranscript };
