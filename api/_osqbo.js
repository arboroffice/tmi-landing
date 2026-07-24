// TMI OS — QuickBooks live data. After the OAuth connect (os2-oauth), this pulls
// the company's revenue from the Profit and Loss report and writes it onto the
// command center, refreshing the access token as needed. Read-only.

const { getSecret, putSecret } = require('./_ossecrets');
const { refreshToken } = require('./_osoauth');
const { matches, applyValue } = require('./_osmetric');

const API_BASE = 'https://quickbooks.api.intuit.com';

function money(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); }

// Ensure a live access token, refreshing (and re-storing) if it is near expiry.
async function freshToken(db, tid) {
  const tok = await getSecret(tid, 'oauth:quickbooks');
  if (!tok || !tok.access_token) return null;
  if (tok.expires_at && Date.now() < tok.expires_at) return tok;
  if (!tok.refresh_token) return tok; // can't refresh; try what we have
  const refreshed = await refreshToken('quickbooks', tok.refresh_token);
  const merged = Object.assign({}, tok, refreshed);
  await putSecret(tid, 'oauth:quickbooks', merged).catch(() => {});
  return merged;
}

async function qboGet(token, realmId, path) {
  const r = await fetch(`${API_BASE}/v3/company/${realmId}${path}`, {
    headers: { Authorization: 'Bearer ' + token.access_token, Accept: 'application/json' },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) { const msg = (body && body.Fault && body.Fault.Error && body.Fault.Error[0] && body.Fault.Error[0].Message) || `QuickBooks returned ${r.status}`; throw new Error(msg); }
  return body;
}

// Turn QuickBooks Invoice objects into company-graph record specs: one invoice
// record per invoice (with paid/open status and due date), plus one customer per
// distinct CustomerRef so the graph knows who the invoice is for.
function invoiceSpecs(invoices) {
  const specs = [];
  const seen = new Set();
  for (const inv of invoices || []) {
    if (!inv || !inv.Id) continue;
    const balance = Number(inv.Balance);
    const total = Number(inv.TotalAmt);
    const ref = inv.CustomerRef || {};
    const custName = ref.name || null;
    specs.push({
      type: 'invoice', source: 'quickbooks', external_id: String(inv.Id),
      title: `Invoice ${inv.DocNumber || inv.Id}`,
      status: !isNaN(balance) && balance <= 0 ? 'paid' : 'open',
      amount: isNaN(total) ? null : total,
      customer_id: ref.value != null ? String(ref.value) : null,
      customer_name: custName,
      due_at: inv.DueDate ? `${inv.DueDate}T00:00:00Z` : null,
      fields: { balance: isNaN(balance) ? undefined : balance, doc: inv.DocNumber || undefined },
    });
    const cid = ref.value != null ? String(ref.value) : null;
    if (cid && !seen.has(cid) && custName) {
      seen.add(cid);
      specs.push({
        type: 'customer', source: 'quickbooks', external_id: cid,
        title: custName, status: 'active', customer_id: cid, customer_name: custName, fields: {},
      });
    }
  }
  return specs;
}

// Walk a QuickBooks P&L report and pull the total income (revenue) amount.
function totalIncome(report) {
  try {
    const rows = report && report.Rows && report.Rows.Row;
    if (!Array.isArray(rows)) return null;
    // Income section is a Section row with group "Income"; its Summary holds the total.
    for (const r of rows) {
      if (r.group === 'Income' && r.Summary && r.Summary.ColData) {
        const cols = r.Summary.ColData;
        const last = cols[cols.length - 1];
        const v = parseFloat(String(last && last.value).replace(/[^0-9.\-]/g, ''));
        if (!isNaN(v)) return v;
      }
    }
  } catch (_e) {}
  return null;
}

async function upsertMetric(db, tid, metrics, key, label, value) {
  let m = metrics.find((x) => matches(x, key)) || metrics.find((x) => matches(x, label));
  if (!m) {
    const sort = metrics.reduce((a, r) => Math.max(a, r.sort || 0), 0) + 1;
    m = await db.insert('os_metrics', { tenant_id: tid, key, label, value: '-', unit: '', sort, created_at: new Date().toISOString() });
    metrics.push(m);
  }
  await applyValue(db, m, value, 'quickbooks');
}

// Pull QuickBooks and write revenue onto the tenant's metrics.
async function syncQuickbooks(db, tenant) {
  const tid = tenant.id;
  const token = await freshToken(db, tid);
  if (!token || !token.access_token) return { skipped: true };
  const realmId = token.realmId || tenant.realm_id;
  if (!realmId) return { skipped: 'no_realm' };

  // P&L for the current calendar year to date.
  const now = new Date();
  const start = `${now.getFullYear()}-01-01`;
  const end = now.toISOString().slice(0, 10);
  const report = await qboGet(token, realmId, `/reports/ProfitAndLoss?start_date=${start}&end_date=${end}&minorversion=65`);
  const income = totalIncome(report);

  const metrics = await db.list('os_metrics', { where: [['tenant_id', '==', tid]] });
  if (income != null) await upsertMetric(db, tid, metrics, 'revenue_ytd', 'Revenue (year to date)', money(income));

  // Pull invoices into the company graph and fire invoice_overdue for any that
  // are past due. Best-effort: a records/query failure never breaks the revenue
  // metric that already saved above.
  let ingested = null;
  try {
    const q = encodeURIComponent('SELECT * FROM Invoice ORDERBY MetaData.LastUpdatedTime DESC MAXRESULTS 200');
    const res = await qboGet(token, realmId, `/query?query=${q}&minorversion=65`);
    const invoices = (res && res.QueryResponse && res.QueryResponse.Invoice) || [];
    const { ingest } = require('./_osingest');
    ingested = await ingest(tenant, invoiceSpecs(invoices), { source: 'quickbooks' });
  } catch (_e) { /* invoices are additive; revenue metric already saved */ }

  const conns = await db.list('os_connections', { where: [['tenant_id', '==', tid]] });
  const c = conns.find((x) => x.oauth_provider === 'quickbooks');
  if (c) await db.update('os_connections', c.id, { last_data_at: new Date().toISOString(), status: 'live' });

  return { income, records: ingested };
}

async function quickbooksConnected(tid) {
  const tok = await getSecret(tid, 'oauth:quickbooks').catch(() => null);
  return !!(tok && tok.access_token);
}

module.exports = { syncQuickbooks, quickbooksConnected, totalIncome, invoiceSpecs, money };
