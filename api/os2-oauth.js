// TMI OS — OAuth connect endpoint. Two steps, driven by the generic framework:
//
//   start (authenticated JSON):
//     POST /api/os2-oauth  { action:'start', provider }  (owner)
//       -> { authorizeUrl }   the SPA navigates the browser there
//     POST /api/os2-oauth  { action:'providers' }        -> { providers, connected }
//     POST /api/os2-oauth  { action:'disconnect', provider } (owner) -> { ok }
//
//   callback (browser redirect from the provider):
//     GET  /api/os2-oauth/<provider>/callback?code=&state=&realmId=
//       -> exchanges the code, stores tokens encrypted, records the connection,
//          then 302-redirects back into the OS.
//
// State + PKCE verifier live in os_oauth_states (short-lived, single-use), so the
// tenant identity is carried across the redirect without trusting the browser.

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');
const { putSecret, getSecret, delSecret } = require('./_ossecrets');
const oauth = require('./_osoauth');
const crypto = require('crypto');

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes to complete the dance

function isCallback(req) {
  // Rewritten by vercel.json: /api/os2-oauth/:provider/:step -> ?provider&step
  const q = req.query || {};
  return String(q.step || '') === 'callback' || (q.code && q.state && q.provider);
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // --- Provider callback (GET, from the browser redirect) ---
  if (req.method === 'GET' && isCallback(req)) return callback(req, res);

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;
  const tid = t.tenant_id;
  const b = req.body || {};
  const action = String(b.action || 'providers');

  try {
    if (action === 'providers') {
      if (!requireRole(t, res, 'manager')) return;
      const rows = await db.list('os_connections', { where: [['tenant_id', '==', tid]] });
      const connected = rows.filter((c) => c.oauth_provider).map((c) => c.oauth_provider);
      return res.status(200).json({ providers: oauth.listProviders(), connected });
    }

    if (action === 'start') {
      if (!requireRole(t, res, 'owner')) return;
      const provider = String(b.provider || '');
      const p = oauth.get(provider);
      if (!p) return res.status(400).json({ error: 'Unknown provider' });
      if (!oauth.isConfigured(p)) return res.status(400).json({ error: `${p.name} is not set up yet. TMI needs to add its credentials first.` });

      const state = crypto.randomBytes(24).toString('base64url');
      const verifier = p.pkce ? oauth.makeVerifier() : null;
      await db.insert('os_oauth_states', {
        state, tenant_id: tid, provider, code_verifier: verifier,
        created_at: new Date().toISOString(), expires_ms: Date.now() + STATE_TTL_MS,
      });
      const authorizeUrl = oauth.buildAuthUrl(provider, state, verifier ? oauth.challengeFor(verifier) : null);
      return res.status(200).json({ authorizeUrl });
    }

    if (action === 'disconnect') {
      if (!requireRole(t, res, 'owner')) return;
      const provider = String(b.provider || '');
      await delSecret(tid, 'oauth:' + provider).catch(() => {});
      const rows = await db.list('os_connections', { where: [['tenant_id', '==', tid]] });
      const conn = rows.find((c) => c.oauth_provider === provider);
      if (conn) await db.update('os_connections', conn.id, { status: 'paused' });
      await db.insert('os_build_log', { tenant_id: tid, kind: 'data', summary: `Disconnected ${provider}.`, created_at: new Date().toISOString() }).catch(() => {});
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-oauth:', e.message);
    return res.status(500).json({ error: 'OAuth request failed' });
  }
};

// The provider redirects the browser here with ?code&state. Finish the exchange
// and send the user back into the OS.
async function callback(req, res) {
  const q = req.query || {};
  const provider = String(q.provider || '');
  const back = (ok, extra) => {
    const base = (oauth.BASE_URL || 'https://os.tmitechai.com') + '/os/app?view=integrations&' + (ok ? 'connected=' + encodeURIComponent(provider) : 'connect_error=' + encodeURIComponent(extra || provider));
    res.writeHead(302, { Location: base }); res.end();
  };
  try {
    if (q.error) return back(false, String(q.error).slice(0, 60));
    const code = String(q.code || ''); const state = String(q.state || '');
    if (!code || !state) return back(false, 'missing_code');

    const rows = await db.list('os_oauth_states', { where: [['state', '==', state]] });
    const st = rows[0];
    if (!st || st.provider !== provider) return back(false, 'bad_state');
    if (st.expires_ms && Date.now() > st.expires_ms) { await db.remove('os_oauth_states', st.id).catch(() => {}); return back(false, 'expired'); }
    const tid = st.tenant_id;

    const tokens = await oauth.exchangeCode(provider, code, st.code_verifier || null);
    const realmId = q.realmId ? String(q.realmId) : (tokens.realmId || null);

    await putSecret(tid, 'oauth:' + provider, Object.assign({}, tokens, realmId ? { realmId } : {}));

    const now = new Date().toISOString();
    const p = oauth.get(provider);
    const conns = await db.list('os_connections', { where: [['tenant_id', '==', tid]] });
    const existing = conns.find((c) => c.oauth_provider === provider);
    const fields = { status: 'live', last_data_at: now, oauth_provider: provider, realm_id: realmId || null };
    if (existing) await db.update('os_connections', existing.id, fields);
    else await db.insert('os_connections', Object.assign({ tenant_id: tid, provider, name: p ? p.name : provider, created_at: now }, fields));

    await db.remove('os_oauth_states', st.id).catch(() => {});
    await db.insert('os_build_log', { tenant_id: tid, kind: 'data', summary: `Connected ${p ? p.name : provider}.`, created_at: now }).catch(() => {});

    return back(true);
  } catch (e) {
    console.error('os2-oauth callback:', e.message);
    return back(false, 'exchange_failed');
  }
}
