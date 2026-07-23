// TMI OS — Plaid banking connector. Powers the "connect your bank" moment in
// onboarding: the customer links their bank through Plaid Link (Plaid holds the
// credentials, we never see them), and the OS pulls cash on hand onto the
// command center. Read-only.
//
// Inert until PLAID_CLIENT_ID + PLAID_SECRET are set, so onboarding simply skips
// the step until then. PLAID_ENV picks the host (sandbox | development | production).

const { putSecret, getSecret, delSecret, hasSecret } = require('./_ossecrets');

function env() { return (process.env.PLAID_ENV || 'sandbox').toLowerCase(); }
function base() {
  const e = env();
  if (e === 'production') return 'https://production.plaid.com';
  if (e === 'development') return 'https://development.plaid.com';
  return 'https://sandbox.plaid.com';
}
function creds() { return { client_id: process.env.PLAID_CLIENT_ID, secret: process.env.PLAID_SECRET }; }
function isConfigured() { const c = creds(); return !!(c.client_id && c.secret); }

function money(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); }

async function plaidPost(path, body) {
  const c = creds();
  const r = await fetch(base() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ client_id: c.client_id, secret: c.secret }, body)),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) { const msg = (json && (json.error_message || json.error_code)) || `Plaid returned ${r.status}`; throw new Error(String(msg)); }
  return json;
}

// Create a Link token to open Plaid Link in the browser for this tenant.
async function createLinkToken(tenant) {
  if (!isConfigured()) throw new Error('Bank connections are not set up yet.');
  const j = await plaidPost('/link/token/create', {
    client_name: 'TMI OS',
    language: 'en',
    country_codes: ['US'],
    user: { client_user_id: String(tenant.id) },
    products: ['transactions'],
  });
  return j.link_token;
}

// Exchange the public token from Link for a permanent access token and store it.
async function exchangePublicToken(db, tenant, publicToken) {
  if (!isConfigured()) throw new Error('Bank connections are not set up yet.');
  const j = await plaidPost('/item/public_token/exchange', { public_token: publicToken });
  await putSecret(tenant.id, 'plaid', { access_token: j.access_token, item_id: j.item_id });
  const now = new Date().toISOString();
  const conns = await db.list('os_connections', { where: [['tenant_id', '==', tenant.id]] });
  const existing = conns.find((c) => c.provider === 'plaid');
  const fields = { status: 'live', last_data_at: now, provider: 'plaid', name: 'Bank (Plaid)', feeds: [{ key: 'cash_on_hand', label: 'Cash on hand' }] };
  if (existing) await db.update('os_connections', existing.id, fields);
  else await db.insert('os_connections', Object.assign({ tenant_id: tenant.id, created_at: now }, fields));
  await db.insert('os_build_log', { tenant_id: tenant.id, kind: 'data', summary: 'Connected a bank. Cash on hand now syncs automatically.', created_at: now }).catch(() => {});
  return { ok: true };
}

// Sum available balance across the depository (cash) accounts = cash on hand.
function cashFromBalances(resp) {
  const accts = (resp && Array.isArray(resp.accounts)) ? resp.accounts : [];
  let cash = 0;
  for (const a of accts) {
    if (a.type === 'depository') { // checking/savings = cash
      const bal = a.balances || {};
      const v = (bal.available != null) ? bal.available : bal.current;
      if (typeof v === 'number') cash += v;
    }
  }
  return cash;
}

// Pull the bank balance and write cash on hand onto the tenant's metrics.
async function syncPlaid(db, tenant) {
  const tid = tenant.id;
  if (!(await hasSecret(tid, 'plaid'))) return { skipped: true };
  const tok = await getSecret(tid, 'plaid');
  if (!tok || !tok.access_token) return { skipped: true };

  const resp = await plaidPost('/accounts/balance/get', { access_token: tok.access_token });
  const cash = cashFromBalances(resp);

  const { matches, applyValue } = require('./_osmetric');
  const metrics = await db.list('os_metrics', { where: [['tenant_id', '==', tid]] });
  let m = metrics.find((x) => matches(x, 'cash_on_hand')) || metrics.find((x) => matches(x, 'Cash on hand'));
  if (!m) {
    const sort = metrics.reduce((a, r) => Math.max(a, r.sort || 0), 0) + 1;
    m = await db.insert('os_metrics', { tenant_id: tid, key: 'cash_on_hand', label: 'Cash on hand', value: '-', unit: '', hint: 'Available bank balance', sort, created_at: new Date().toISOString() });
  }
  await applyValue(db, m, money(cash), 'bank');

  const conns = await db.list('os_connections', { where: [['tenant_id', '==', tid]] });
  const c = conns.find((x) => x.provider === 'plaid');
  if (c) await db.update('os_connections', c.id, { last_data_at: new Date().toISOString(), status: 'live' });
  return { cash };
}

async function plaidConnected(tid) { return hasSecret(tid, 'plaid'); }

async function disconnectPlaid(db, tenant) {
  const tid = tenant.id;
  await delSecret(tid, 'plaid').catch(() => {});
  const conns = await db.list('os_connections', { where: [['tenant_id', '==', tid]] });
  const c = conns.find((x) => x.provider === 'plaid');
  if (c) await db.update('os_connections', c.id, { status: 'paused' });
  return { ok: true };
}

module.exports = { isConfigured, createLinkToken, exchangePublicToken, syncPlaid, plaidConnected, disconnectPlaid, cashFromBalances, money, env };
