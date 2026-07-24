// TMI OS — connector ingestion. A connector sync (Stripe, QuickBooks, ...) pulls
// real records and hands them here as specs. This upserts each into the company
// graph (os_records) and emits the entity events their state transitions imply,
// so a synced invoice that is past due fires the collections cascade and a first
// paying customer fires the client-won cascade - the wiring the OS already had
// but nothing was firing.
//
// Two safety rules matter:
//  1. Best-effort. A failure on one record never blocks the rest, and event
//     emission never blocks ingestion. The metric sync must not break because a
//     record could not be written.
//  2. No first-sync storm. The very first sync of a source (seed) backfills
//     history without firing events: it marks already-overdue invoices as fired
//     and does not emit client_won for historical customers. Only changes on
//     later syncs fire cascades.

const db = require('./_db');
const { upsertRecord, isOverdue } = require('./_osrecords');
const { emitEvent } = require('./_osevents');

// Has this source ever written a record for this tenant? If not, the batch is a
// seed (historical backfill) and must not fire events.
async function isSeed(tenantId, source) {
  const rows = await db.list('os_records', { where: [['tenant_id', '==', String(tenantId)], ['source', '==', String(source)]], limit: 1 }).catch(() => []);
  return !rows.length;
}

// Ingest a batch of connector record specs for one tenant.
// opts: { source, wonOnNewCustomer?: bool, seed?: bool (auto-detected if omitted) }
// Returns { upserted, created, events: [{type, runs}] }.
async function ingest(tenant, specs, opts = {}) {
  const out = { upserted: 0, created: 0, events: [] };
  if (!tenant || !tenant.id || !Array.isArray(specs) || !specs.length) return out;
  const source = String(opts.source || (specs[0] && specs[0].source) || 'manual');
  const seed = opts.seed != null ? !!opts.seed : await isSeed(tenant.id, source);
  const now = Date.now();

  for (const spec of specs) {
    let res;
    try { res = await upsertRecord(tenant.id, spec); }
    catch (e) { continue; }
    out.upserted++;
    if (res.created) out.created++;
    const r = res.record, prev = res.prev;

    // Invoice that is past due and not yet flagged. On seed we flag without
    // firing; afterward we fire the collections cascade exactly once.
    if (r && r.type === 'invoice' && isOverdue(r, now)) {
      const firedBefore = prev && prev.fields && prev.fields._overdue_fired;
      if (!firedBefore) {
        if (!seed) await fire(tenant, 'invoice_overdue', { invoice: r.title, customer_name: r.customer_name, amount: r.amount, record_id: r.id }, out);
        try { await db.update('os_records', r.id, { fields: Object.assign({}, r.fields || {}, { _overdue_fired: true }) }); } catch (_e) {}
      }
    }

    // A brand-new customer from a real payment source = a client won. Never on
    // seed (historical customers are not "just won").
    if (!seed && opts.wonOnNewCustomer && res.created && r && r.type === 'customer') {
      await fire(tenant, 'client_won', { customer_name: r.customer_name || r.title, record_id: r.id }, out);
    }

    // An invoice that was open and is now paid closes the loop: reset the overdue
    // flag so a re-opened invoice can fire again later.
    if (r && r.type === 'invoice' && String(r.status || '').toLowerCase() === 'paid' && prev && prev.fields && prev.fields._overdue_fired) {
      try { await db.update('os_records', r.id, { fields: Object.assign({}, r.fields || {}, { _overdue_fired: false }) }); } catch (_e) {}
    }
  }
  return out;
}

async function fire(tenant, type, ctx, out) {
  try { const runs = await emitEvent(tenant, type, ctx); out.events.push({ type, runs: (runs || []).length }); }
  catch (_e) {}
}

module.exports = { ingest, isSeed };
