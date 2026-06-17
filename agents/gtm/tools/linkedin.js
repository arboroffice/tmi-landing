// LinkedIn channel — pushes a lead into your LinkedIn outreach tool so the same
// audited prospect gets a connect + DM touch alongside email (multi-channel lifts
// reply rate substantially). Works with any tool that accepts an inbound webhook
// (HeyReach, Expandi, Phantombuster, Make/Zapier, etc.).
//
// Env: LINKEDIN_WEBHOOK_URL (required), LINKEDIN_WEBHOOK_SECRET (optional)

export function linkedinEnabled() {
  return !!process.env.LINKEDIN_WEBHOOK_URL;
}

export async function pushToLinkedIn(payload) {
  const url = process.env.LINKEDIN_WEBHOOK_URL;
  if (!url) throw new Error('LINKEDIN_WEBHOOK_URL not set');
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.LINKEDIN_WEBHOOK_SECRET) headers['X-Webhook-Secret'] = process.env.LINKEDIN_WEBHOOK_SECRET;

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`LinkedIn webhook ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}
