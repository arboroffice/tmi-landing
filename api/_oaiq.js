// TMI — OpenAI (ChatGPT) Ads server-side conversions. The browser pixel fires
// lead_created client-side, but ad blockers and privacy settings drop a chunk
// of those. This posts the same conversion from the server (the Conversions
// API) so it still counts. Pass the SAME event_id the client used and OpenAI
// de-duplicates the pair; if the client event never arrived, the server one
// stands alone.
//
// Inert until OPENAI_ADS_API_KEY is set in the environment, so it is safe to
// deploy now and turn on later.

const PIXEL_ID = '1SVHHxEVsMKxiFJd8MnXZm';
const ENDPOINT = 'https://bzr.openai.com/v1/events?pid=' + PIXEL_ID;

// Fire a lead_created conversion. Best-effort: never throws, returns a small
// status object. `opts`: { eventId, sourceUrl }.
async function fireLead(opts) {
  const key = process.env.OPENAI_ADS_API_KEY;
  if (!key) return { skipped: 'no_key' };
  const o = opts || {};
  const body = {
    validate_only: false,
    events: [{
      id: o.eventId || ('srv_' + Date.now() + '_' + Math.random().toString(36).slice(2)),
      type: 'lead_created',
      timestamp_ms: Date.now(),
      source_url: o.sourceUrl || 'https://www.tmitechai.com',
      action_source: 'web',
      data: { type: 'customer_action' },
    }],
  };
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, error: e && e.message };
  }
}

module.exports = { fireLead, PIXEL_ID };
