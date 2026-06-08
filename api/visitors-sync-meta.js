const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');
const { sha256, GRAPH_VERSION } = require('./_meta-capi');

// Push identified visitor emails into a Meta Custom Audience for retargeting.
// Deliberately manual (button-triggered from the admin Visitors page) rather
// than auto-firing on every webhook hit.
//
// Env:
//   META_CAPI_ACCESS_TOKEN  (reused from the CAPI helper)
//   META_CUSTOM_AUDIENCE_ID (target audience; if unset and META_AD_ACCOUNT_ID
//                            is set, an audience named "RB2B Site Visitors" is created)
//   META_AD_ACCOUNT_ID      (numeric or act_-prefixed; only needed to auto-create)
//
// POST body: { all: true } to (re)sync every visitor with an email; otherwise
// only visitors not yet synced (synced_meta = false) are sent.

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

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;

  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!token) return res.status(503).json({ error: 'META_CAPI_ACCESS_TOKEN not set' });

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  const all = !!(req.body && req.body.all);
  let q = db.from('site_visitors').select('id, email, personal_email').limit(10000);
  if (!all) q = q.eq('synced_meta', false);
  const { data: rows, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const withEmail = (rows || []).filter(r => r.email || r.personal_email);
  if (!withEmail.length) return res.json({ ok: true, synced: 0, note: 'No visitor emails to sync' });

  let audienceId;
  try { audienceId = await ensureAudience(token); }
  catch (e) { return res.status(502).json({ error: e.message }); }

  const data = withEmail.map(r => [sha256email(r.email || r.personal_email)]);

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${audienceId}/users`;
  let json;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: { schema: ['EMAIL'], data },
        access_token: token,
      }),
    });
    json = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: 'Meta add-users failed', body: json });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }

  // Mark synced (best effort).
  const ids = withEmail.map(r => r.id);
  await db.from('site_visitors')
    .update({ synced_meta: true, synced_meta_at: new Date().toISOString() })
    .in('id', ids);

  return res.json({
    ok: true,
    audience_id: audienceId,
    synced: withEmail.length,
    received: json.num_received,
    matched: json.num_invalid_entries != null ? withEmail.length - json.num_invalid_entries : undefined,
  });
};
