// TMI OS — scheduled data pull. The push side (os2-ingest) lets any tool send a
// webhook in. This is the pull side: a company points the OS at one HTTPS URL
// that returns their live numbers as JSON, and the OS reads it on a schedule so
// the command center runs on actuals without anyone wiring a webhook. Same
// metric pipeline as ingest (stamps time + source, keeps history, auto-creates
// unknown keys, proves any wired connection live).
//
// Accepted JSON shapes at the source URL (any of):
//   { "metrics": [ { "key": "revenue_mtd", "value": "$212,400", "unit": "" } ] }
//   { "metric": "revenue_mtd", "value": 212400 }
//   { "revenue_mtd": 212400, "unpaid_invoices": 38100 }

const { matches, applyValue, slug } = require('./_osmetric');
const { safeFetch, assertPublicUrl } = require('./_osnet');

// Back-compat: callers still import isBlockedHost from here. Delegate to the
// shared guard's hostname check so there is one source of truth.
const { isBlockedHostname } = require('./_osnet');
function isBlockedHost(host) { return isBlockedHostname(host); }

// Fetch and parse the source URL as JSON. Throws a readable error on failure so
// a manual "sync now" can tell the user exactly what went wrong. SSRF-guarded
// (resolves + validates every IP, refuses redirects) via _osnet.safeFetch.
async function fetchJSON(url) {
  const r = await safeFetch(url, { headers: { 'User-Agent': 'TMI-OS-Sync/1.0', 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`The source returned ${r.status}.`);
  const text = (await r.text()).slice(0, 200000);
  try { return JSON.parse(text); }
  catch (e) { throw new Error('The source did not return valid JSON.'); }
}

// Turn a parsed JSON body into [{ ref, value, unit }] metric items.
function itemsFrom(body) {
  const b = body || {};
  let items = [];
  if (Array.isArray(b.metrics)) {
    items = b.metrics.map(m => ({ ref: m.key || m.label || m.metric, value: m.value, unit: m.unit }));
  } else if (b.metric != null) {
    items = [{ ref: b.metric, value: b.value }];
  } else if (Array.isArray(b)) {
    items = b.map(m => ({ ref: m && (m.key || m.label || m.metric), value: m && m.value, unit: m && m.unit }));
  } else {
    for (const k of Object.keys(b)) {
      if (b[k] != null && typeof b[k] !== 'object') items.push({ ref: k, value: b[k] });
    }
  }
  return items.filter(it => it.ref != null && it.value != null).slice(0, 40);
}

// Pull one tenant's source URL and write the values onto its metrics.
// Returns { updated, created }. Throws on fetch/parse errors.
async function syncTenant(db, tenant) {
  if (!tenant || !tenant.sync_url) return { updated: 0, created: 0 };
  const body = await fetchJSON(tenant.sync_url);
  const items = itemsFrom(body);
  if (!items.length) return { updated: 0, created: 0 };

  const metrics = await db.list('os_metrics', { where: [['tenant_id', '==', tenant.id]] });
  let updated = 0, created = 0;
  for (const it of items) {
    let m = metrics.find(x => matches(x, it.ref));
    if (!m) {
      const sort = metrics.reduce((a, r) => Math.max(a, r.sort || 0), 0) + 1;
      m = await db.insert('os_metrics', {
        tenant_id: tenant.id, label: String(it.ref).slice(0, 60), value: '-',
        unit: it.unit ? String(it.unit).slice(0, 12) : '', sort, created_at: new Date().toISOString(),
      });
      metrics.push(m); created++;
    }
    await applyValue(db, m, it.value, 'sync');
    updated++;
  }

  const now = new Date().toISOString();
  await db.update('os_tenants', tenant.id, { last_sync_at: now }).catch(() => {});

  // Any TMI-wired connection that feeds one of these metrics is now proven live.
  try {
    const touched = new Set(items.map(it => slug(it.ref)));
    const conns = await db.list('os_connections', { where: [['tenant_id', '==', tenant.id]] });
    for (const c of conns) {
      const feedsTouched = (c.feeds || []).some(f => touched.has(f.key) || touched.has(slug(f.label)));
      if (feedsTouched || !c.feeds || !c.feeds.length) {
        const patch = { last_data_at: now };
        if (c.status !== 'live') patch.status = 'live';
        await db.update('os_connections', c.id, patch);
      }
    }
  } catch (e) { console.error('syncTenant connections:', e.message); }

  return { updated, created };
}

// Cron entry: pull every tenant's live data on schedule. Two sources, both
// capped for cron time: a source URL (syncTenant) and a connected Stripe account
// (syncStripe). A tenant can have either, both, or neither.
async function syncSweep(db, cap = 40) {
  const { syncStripe, stripeConnected } = require('./_osstripe');
  let synced = 0, failed = 0, stripeSynced = 0;
  try {
    const tenants = await db.list('os_tenants', { limit: 300 });
    const onboarded = tenants.filter(t => t.onboarded);
    for (const t of onboarded.filter(t => t.sync_url).slice(0, cap)) {
      try { await syncTenant(db, t); synced++; }
      catch (e) { failed++; console.error('syncSweep url', t.id, e.message); }
    }
    for (const t of onboarded.slice(0, cap)) {
      try {
        if (await stripeConnected(t.id)) { await syncStripe(db, t); stripeSynced++; }
      } catch (e) { failed++; console.error('syncSweep stripe', t.id, e.message); }
    }
  } catch (e) { console.error('syncSweep:', e.message); }
  return { synced, stripeSynced, failed };
}

module.exports = { isBlockedHost, fetchJSON, syncTenant, syncSweep };
