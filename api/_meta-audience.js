// Meta Custom Audience helper — create/find the audience and push hashed emails.
// Used by api/visitors-sync-meta (bulk) and api/visitor-enroll (per visitor).
//
// Env:
//   META_CAPI_ACCESS_TOKEN   (reused from the CAPI helper)
//   META_CUSTOM_AUDIENCE_ID  target audience; if unset and META_AD_ACCOUNT_ID is
//                            set, an audience named "RB2B Site Visitors" is created
//   META_AD_ACCOUNT_ID       numeric or act_-prefixed; only needed to auto-create

const { sha256, GRAPH_VERSION } = require('./_meta-capi');

const sha256email = e => sha256(String(e).trim().toLowerCase());

async function ensureAudience(token) {
  let audienceId = process.env.META_CUSTOM_AUDIENCE_ID;
  if (audienceId) return audienceId;

  let acct = process.env.META_AD_ACCOUNT_ID;
  if (!acct) throw new Error('Set META_CUSTOM_AUDIENCE_ID or META_AD_ACCOUNT_ID');
  if (!acct.startsWith('act_')) acct = 'act_' + acct;

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${acct}/customaudiences`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'RB2B Site Visitors',
      subtype: 'CUSTOM',
      customer_file_source: 'USER_PROVIDED_ONLY',
      description: 'Visitors identified by RB2B on tmi-technology.com',
      access_token: token,
    }),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok || !json.id) throw new Error('Create audience failed: ' + JSON.stringify(json));
  return json.id;
}

// Push a list of plain emails (hashed here) into the Custom Audience.
// Returns { ok, audience_id, sent, ... } or { ok:false, error }. Never throws.
async function addEmailsToAudience(emails) {
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!token) return { ok: false, error: 'META_CAPI_ACCESS_TOKEN not set' };

  const list = [...new Set((emails || []).filter(Boolean).map(e => String(e).toLowerCase()))];
  if (!list.length) return { ok: true, sent: 0, note: 'no emails' };

  let audienceId;
  try { audienceId = await ensureAudience(token); }
  catch (e) { return { ok: false, error: e.message }; }

  const data = list.map(e => [sha256email(e)]);
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${audienceId}/users`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: { schema: ['EMAIL'], data }, access_token: token }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: 'Meta add-users failed', body: json };
    return { ok: true, audience_id: audienceId, sent: list.length, received: json.num_received };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { ensureAudience, addEmailsToAudience };
