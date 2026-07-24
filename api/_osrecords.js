// TMI OS — the company graph. A single entity layer the whole OS reads and
// writes: customers, leads, invoices, payments, jobs, deals. Until now the OS
// stored verbs and totals (metrics, tasks, outputs) but no NOUNS, so a worker or
// cascade could never act on "invoice #4471 for Acme" and 4 of 5 event triggers
// could never fire. os_records is that noun layer. Connectors feed it real
// records instead of collapsing everything to a scalar metric, the COO and Brain
// ground on it, and cascades carry an entity through their steps.
//
// os_records shape:
//   { tenant_id, type, source, external_id, title, status, amount, customer_id,
//     customer_name, due_at, fields{}, created_at, updated_at }
// Upserts are keyed on (tenant_id, type, source, external_id) so a connector
// sync updates the same record instead of duplicating it.

const db = require('./_db');

const TYPES = ['customer', 'lead', 'invoice', 'payment', 'job', 'deal'];

function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function findByExternal(rows, source, externalId) {
  if (!externalId) return null;
  return rows.find(r => String(r.external_id || '') === String(externalId) && String(r.source || '') === String(source)) || null;
}

// Upsert a record. spec: { type, source, external_id?, title, status?, amount?,
// customer_id?, customer_name?, due_at?, fields? }. Returns { record, created, prev }.
async function upsertRecord(tenantId, spec) {
  const tid = String(tenantId);
  const type = TYPES.includes(String(spec.type)) ? String(spec.type) : 'customer';
  const source = String(spec.source || 'manual').slice(0, 40);
  const externalId = spec.external_id != null ? String(spec.external_id).slice(0, 160) : '';
  const now = new Date().toISOString();

  const base = {
    tenant_id: tid, type, source, external_id: externalId,
    title: String(spec.title || '').slice(0, 200),
    status: spec.status != null ? String(spec.status).slice(0, 40) : null,
    amount: num(spec.amount),
    customer_id: spec.customer_id != null ? String(spec.customer_id) : null,
    customer_name: spec.customer_name != null ? String(spec.customer_name).slice(0, 200) : null,
    due_at: spec.due_at || null,
    fields: (spec.fields && typeof spec.fields === 'object' && !Array.isArray(spec.fields)) ? spec.fields : {},
    updated_at: now,
  };

  let existing = null;
  if (externalId) {
    const rows = await db.list('os_records', { where: [['tenant_id', '==', tid], ['type', '==', type]] }).catch(() => []);
    existing = findByExternal(rows, source, externalId);
  }
  if (existing) {
    const merged = Object.assign({}, base, { fields: Object.assign({}, existing.fields || {}, base.fields) });
    const rec = await db.update('os_records', existing.id, merged);
    return { record: rec || Object.assign({ id: existing.id }, existing, merged), created: false, prev: existing };
  }
  const rec = await db.insert('os_records', Object.assign({ created_at: now }, base));
  return { record: rec, created: true, prev: null };
}

async function listRecords(tenantId, type, opts = {}) {
  const where = [['tenant_id', '==', String(tenantId)]];
  if (type) where.push(['type', '==', String(type)]);
  return db.list('os_records', { where, limit: opts.limit || 500 }).catch(() => []);
}

// Is an invoice past due and not paid? Used to fire invoice_overdue.
function isOverdue(r, now) {
  if (!r || r.type !== 'invoice') return false;
  const status = String(r.status || '').toLowerCase();
  if (status === 'paid' || status === 'void' || status === 'draft') return false;
  if (!r.due_at) return false;
  return Date.parse(r.due_at) < (now || Date.now());
}

// Counts by type + a few headline aggregates, for os2-state and the UI.
async function graphStats(tenantId) {
  const rows = await listRecords(tenantId, null, { limit: 2000 });
  const counts = {};
  let openInvoices = 0, overdueInvoices = 0, outstanding = 0;
  const now = Date.now();
  for (const r of rows) {
    counts[r.type] = (counts[r.type] || 0) + 1;
    if (r.type === 'invoice') {
      const st = String(r.status || '').toLowerCase();
      if (st !== 'paid' && st !== 'void' && st !== 'draft') { openInvoices++; if (typeof r.amount === 'number') outstanding += r.amount; }
      if (isOverdue(r, now)) overdueInvoices++;
    }
  }
  return { total: rows.length, counts, openInvoices, overdueInvoices, outstanding: Math.round(outstanding) };
}

// A compact, quotable text view of the graph for grounding the COO and Brain.
// Kept tight so it never blows the prompt.
async function graphSummary(tenantId, opts = {}) {
  const rows = await listRecords(tenantId, null, { limit: 1000 });
  if (!rows.length) return '';
  const byType = {};
  for (const r of rows) (byType[r.type] = byType[r.type] || []).push(r);
  const out = [];
  const now = Date.now();

  const customers = (byType.customer || []).concat(byType.lead || []);
  if (customers.length) {
    out.push(`Customers/leads (${customers.length}):`);
    customers.slice(0, opts.perType || 20).forEach(c => {
      const f = c.fields || {};
      out.push(`- ${c.title || c.customer_name || 'Customer'}${f.email ? ' <' + f.email + '>' : ''}${c.status ? ' [' + c.status + ']' : ''}`);
    });
  }
  const invoices = (byType.invoice || []).slice().sort((a, b) => String(b.due_at || '').localeCompare(String(a.due_at || '')));
  if (invoices.length) {
    out.push(`Invoices (${invoices.length}):`);
    invoices.slice(0, opts.perType || 20).forEach(i => {
      const overdue = isOverdue(i, now);
      out.push(`- ${i.title || 'Invoice'} for ${i.customer_name || 'a customer'}: ${i.amount != null ? '$' + i.amount : 'amount unknown'} [${i.status || 'open'}${overdue ? ', OVERDUE' : ''}]${i.due_at ? ' due ' + String(i.due_at).slice(0, 10) : ''}`);
    });
  }
  const jobs = byType.job || [];
  if (jobs.length) {
    out.push(`Jobs (${jobs.length}):`);
    jobs.slice(0, opts.perType || 15).forEach(j => out.push(`- ${j.title || 'Job'} for ${j.customer_name || 'a customer'} [${j.status || 'open'}]`));
  }
  const payments = byType.payment || [];
  if (payments.length) {
    const total = payments.reduce((s, p) => s + (typeof p.amount === 'number' ? p.amount : 0), 0);
    out.push(`Payments (${payments.length}): $${Math.round(total)} received total.`);
  }
  return out.join('\n');
}

module.exports = { upsertRecord, listRecords, graphSummary, graphStats, isOverdue, TYPES };
