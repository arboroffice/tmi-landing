// Instantly.ai integration — push researched, audited leads into a campaign with
// the personalized audit as custom variables. Instantly handles sending, inbox
// rotation, warmup, and the follow-up sequence; the campaign template references
// {{audit_link}}, {{audit_card}}, {{intel_score}}, {{primary_bottleneck}}, etc.
//
// Env:
//   INSTANTLY_API_KEY       - Instantly API v2 key
//   INSTANTLY_CAMPAIGN_ID   - target campaign id

const BASE = 'https://api.instantly.ai/api/v2';

export function instantlyEnabled() {
  return !!(process.env.INSTANTLY_API_KEY && process.env.INSTANTLY_CAMPAIGN_ID);
}

export async function addLeadToInstantly({
  email,
  firstName,
  lastName,
  companyName,
  variables = {},
  campaignId = process.env.INSTANTLY_CAMPAIGN_ID,
}) {
  const apiKey = process.env.INSTANTLY_API_KEY;
  if (!apiKey) throw new Error('INSTANTLY_API_KEY not set');
  if (!campaignId) throw new Error('INSTANTLY_CAMPAIGN_ID not set');
  if (!email) throw new Error('email required');

  const res = await fetch(`${BASE}/leads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaign: campaignId,
      email,
      first_name: firstName || undefined,
      last_name: lastName || undefined,
      company_name: companyName || undefined,
      // Arbitrary merge fields available in the campaign template as {{key}}
      custom_variables: variables,
      // Don't duplicate a lead already present in the workspace
      skip_if_in_workspace: true,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Instantly ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.json().catch(() => ({}));
}
