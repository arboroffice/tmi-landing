// TMI OS — Stripe live data connector (read-only). The customer pastes a Stripe
// restricted/secret key once; the OS stores it encrypted (vault), validates it,
// and then pulls real numbers on the sync schedule so the command center runs on
// actuals: cash on hand (Stripe balance) and revenue over the last 30 days
// (successful charges). No OAuth app registration needed - the customer's own
// read-only key is the credential, and it is never returned to the browser.
//
// Everything here is read-only against Stripe: GET /v1/balance and GET /v1/charges.

const { putSecret, getSecret, hasSecret, delSecret } = require('./_ossecrets');
const { matches, applyValue } = require('./_osmetric');

const BASE = 'https://api.stripe.com';

// The two metrics Stripe feeds. Matched against a tenant's existing metrics by
// key/label; created if absent so a fresh account just lights up.
const FEEDS = [
  { key: 'cash_on_hand', label: 'Cash on hand', hint: 'Available balance in Stripe' },
  { key: 'revenue_30d', label: 'Revenue (30 days)', hint: 'Successful charges, last 30 days' },
];

async function stripeGet(key, path) {
  const r = await fetch(BASE + path, { method: 'GET', headers: { Authorization: `Bearer ${key}` } });
  let body = null;
  try { body = await r.json(); } catch (e) { body = null; }
  if (!r.ok) {
    const msg = (body && body.error && body.error.message) || `Stripe returned ${r.status}`;
    const err = new Error(msg); err.status = r.status; throw err;
  }
  return body;
}

// Validate a key by hitting the balance endpoint. Throws a readable error if the
// key is wrong or lacks read access.
async function validateKey(key) {
  const k = String(key || '').trim();
  if (!/^(sk|rk)_(live|test)_[A-Za-z0-9]+$/.test(k)) {
    throw new Error('That does not look like a Stripe secret or restricted key (sk_ or rk_).');
  }
  await stripeGet(k, '/v1/balance'); // throws on bad key / missing permission
  return k;
}

// Sum available balance across currencies, in major units. Stripe amounts are in
// the currency's minor unit (cents); we divide by 100 for display.
function sumBalance(balance) {
  const avail = (balance && Array.isArray(balance.available)) ? balance.available : [];
  return avail.reduce((s, a) => s + (Number(a.amount) || 0), 0) / 100;
}

// Sum successful charges over the last 30 days. Paginates, capped so one sync can
// never run unbounded; the cap is logged as an approximation when hit. Also
// returns the successful charges themselves so the sync can write them into the
// company graph as payment records.
async function revenue30d(key) {
  const since = Math.floor((nowMs() - 30 * 24 * 3600 * 1000) / 1000);
  let total = 0, starting_after = null, pages = 0, capped = false;
  const charges = [];
  const MAX_PAGES = 10; // up to 1000 charges
  while (pages < MAX_PAGES) {
    let path = `/v1/charges?limit=100&created[gte]=${since}`;
    if (starting_after) path += `&starting_after=${starting_after}`;
    const page = await stripeGet(key, path);
    const data = (page && Array.isArray(page.data)) ? page.data : [];
    for (const c of data) {
      if (c && c.paid && c.status === 'succeeded' && !c.refunded) {
        total += (Number(c.amount) || 0) - (Number(c.amount_refunded) || 0);
        if (charges.length < 500) charges.push(c);
      }
    }
    pages++;
    if (page && page.has_more && data.length) { starting_after = data[data.length - 1].id; }
    else { break; }
    if (pages === MAX_PAGES && page.has_more) capped = true;
  }
  return { total: total / 100, capped, charges };
}

// Turn Stripe charges into company-graph record specs: one payment per charge,
// and one customer per distinct payer (deduped by Stripe customer id or email).
function chargeSpecs(charges) {
  const specs = [];
  const seenCustomers = new Set();
  for (const c of charges || []) {
    const bd = c.billing_details || {};
    const name = bd.name || null;
    const email = bd.email || c.receipt_email || null;
    const custId = c.customer || (email ? 'email:' + email : null);
    const amount = ((Number(c.amount) || 0) - (Number(c.amount_refunded) || 0)) / 100;
    specs.push({
      type: 'payment', source: 'stripe', external_id: c.id,
      title: c.description || `Payment ${money(amount)}`,
      status: 'succeeded', amount,
      customer_id: c.customer || null, customer_name: name,
      fields: { email: email || undefined, currency: (c.currency || '').toUpperCase() || undefined },
    });
    if (custId && !seenCustomers.has(custId) && (name || email)) {
      seenCustomers.add(custId);
      specs.push({
        type: 'customer', source: 'stripe', external_id: custId,
        title: name || email, status: 'active',
        customer_id: c.customer || null, customer_name: name || email,
        fields: { email: email || undefined },
      });
    }
  }
  return specs;
}

// Injected so the module stays testable and avoids Date.now() in restricted
// contexts; defaults to real time in production.
let nowMs = () => Date.now();
function _setNow(fn) { nowMs = fn; }

function money(n) {
  const v = Math.round(Number(n) || 0);
  return '$' + v.toLocaleString('en-US');
}

// Upsert one of the Stripe feed metrics and write the value through the shared
// metric pipeline (stamps time + source 'stripe', keeps history).
async function writeMetric(db, tenantId, metrics, feed, value) {
  let m = metrics.find((x) => matches(x, feed.key)) || metrics.find((x) => matches(x, feed.label));
  if (!m) {
    const sort = metrics.reduce((a, r) => Math.max(a, r.sort || 0), 0) + 1;
    m = await db.insert('os_metrics', {
      tenant_id: tenantId, key: feed.key, label: feed.label, value: '-', unit: '',
      hint: feed.hint, sort, created_at: new Date().toISOString(),
    });
    metrics.push(m);
  }
  await applyValue(db, m, value, 'stripe');
}

// Pull Stripe and write cash + revenue onto the tenant's metrics.
// Returns { cash, revenue }. Throws on a bad/again-invalid key.
async function syncStripe(db, tenant) {
  const tid = tenant.id;
  if (!(await hasSecret(tid, 'stripe'))) return { skipped: true };
  const secret = await getSecret(tid, 'stripe');
  const key = secret && secret.key;
  if (!key) return { skipped: true };

  const balance = await stripeGet(key, '/v1/balance');
  const cash = sumBalance(balance);
  const rev = await revenue30d(key);

  const metrics = await db.list('os_metrics', { where: [['tenant_id', '==', tid]] });
  await writeMetric(db, tid, metrics, FEEDS[0], money(cash));
  await writeMetric(db, tid, metrics, FEEDS[1], money(rev.total));

  // Write the charges into the company graph as payment + customer records, and
  // fire client_won for a first-time paying customer. Best-effort: never let a
  // records failure break the metric sync.
  let ingested = null;
  try {
    const { ingest } = require('./_osingest');
    ingested = await ingest(tenant, chargeSpecs(rev.charges), { source: 'stripe', wonOnNewCustomer: true });
  } catch (_e) { /* records are additive; metrics already saved */ }

  const now = new Date().toISOString();
  await touchConnection(db, tid, now);
  return { cash, revenue: rev.total, capped: rev.capped, records: ingested };
}

// Create/refresh the os_connections row that the Live-data view shows.
async function touchConnection(db, tid, now) {
  const rows = await db.list('os_connections', { where: [['tenant_id', '==', tid]] });
  const existing = rows.find((c) => c.provider === 'stripe');
  const patch = { status: 'live', last_data_at: now, feeds: FEEDS.map((f) => ({ key: f.key, label: f.label })) };
  if (existing) return db.update('os_connections', existing.id, patch);
  return db.insert('os_connections', Object.assign({ tenant_id: tid, provider: 'stripe', name: 'Stripe', created_at: now }, patch));
}

// Connect: validate the key, store it encrypted, create the connection, and do a
// first sync so numbers appear immediately. Never returns the key.
async function connectStripe(db, tenant, rawKey) {
  const key = await validateKey(rawKey);
  await putSecret(tenant.id, 'stripe', { key });
  const result = await syncStripe(db, tenant);
  await db.insert('os_build_log', { tenant_id: tenant.id, kind: 'data', summary: 'Connected Stripe. Cash and revenue now sync automatically.', created_at: new Date().toISOString() }).catch(() => {});
  return result;
}

async function disconnectStripe(db, tenant) {
  const tid = tenant.id;
  // Remove the stored key and mark the connection paused.
  await delSecret(tid, 'stripe').catch(() => {});
  const rows = await db.list('os_connections', { where: [['tenant_id', '==', tid]] });
  const existing = rows.find((c) => c.provider === 'stripe');
  if (existing) await db.update('os_connections', existing.id, { status: 'paused', last_data_at: existing.last_data_at || null });
  await db.insert('os_build_log', { tenant_id: tid, kind: 'data', summary: 'Disconnected Stripe.', created_at: new Date().toISOString() }).catch(() => {});
  return { ok: true };
}

async function stripeConnected(tid) {
  return hasSecret(tid, 'stripe');
}

module.exports = { connectStripe, disconnectStripe, syncStripe, stripeConnected, validateKey, sumBalance, money, chargeSpecs, _setNow, FEEDS };
