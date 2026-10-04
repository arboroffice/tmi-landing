// Rep compensation: one ledger (rep_commissions) for the audit a rep sells and
// every upsell on that account after it (implementation fee, retainer, add-on).
// Rates live in settings/rep_commission_rates so admin can change them without
// a deploy. Each row keeps the rate it was earned at.
const db = require('./_db');

const DEFAULT_RATES = { audit: 0.20, upsell: 0.20 };
const KINDS = {
  audit: 'Intelligent Company Audit',
  implementation: 'Implementation fee',
  retainer: 'Monthly retainer',
  addon: 'Add-on',
  other: 'Other upsell',
};

async function getRates() {
  const doc = await db.getById('settings', 'rep_commission_rates').catch(() => null);
  const n = (v, d) => (v != null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 1 ? Number(v) : d);
  return { audit: n(doc && doc.audit, DEFAULT_RATES.audit), upsell: n(doc && doc.upsell, DEFAULT_RATES.upsell) };
}
async function setRates({ audit, upsell }) {
  const cur = await getRates();
  const pct = (v, d) => (v == null || v === '' ? d : Math.max(0, Math.min(1, Number(v) > 1 ? Number(v) / 100 : Number(v))));
  const next = { audit: pct(audit, cur.audit), upsell: pct(upsell, cur.upsell), updated_at: new Date().toISOString() };
  await db.update('settings', 'rep_commission_rates', next);
  return next;
}

// Which rep sourced this customer? The application carries rep_id once a
// rep's audit link was paid; fall back to the email on a rep lead.
async function findRepFor({ applicationId, email }) {
  let app = applicationId ? await db.getById('applications', applicationId).catch(() => null) : null;
  const em = String(email || (app && app.email) || '').toLowerCase().trim();
  if (!app && em) app = await db.findOne('applications', 'email', em).catch(() => null);
  if (app && app.rep_id) return { rep_id: app.rep_id, rep_lead_id: app.rep_lead_id || null, application_id: app.id, business_name: app.company || app.name || null };
  if (em) {
    const leads = await db.list('rep_leads', { where: [['email', '==', em]], limit: 5 }).catch(() => []);
    const won = (leads || []).find((l) => l.status === 'won') || (leads || [])[0];
    if (won) return { rep_id: won.rep_id, rep_lead_id: won.id, application_id: app ? app.id : null, business_name: won.business_name || null };
  }
  return null;
}

// Write (or refresh) one commission row. id makes it idempotent per source.
async function writeCommission({ id, rep_id, rep_lead_id, application_id, business_name, kind, amount, rate, note, source }) {
  const now = new Date().toISOString();
  const deal = amount != null ? Math.round(Number(amount)) : null;
  const row = {
    rep_id, rep_lead_id: rep_lead_id || null, application_id: application_id || null,
    business_name: business_name || null, kind: kind || 'other', kind_label: KINDS[kind] || KINDS.other,
    deal_value: deal, rate, commission: deal != null ? Math.round(deal * rate) : 0,
    note: note || null, source: source || null, updated_at: now,
  };
  const existing = await db.getById('rep_commissions', id).catch(() => null);
  if (existing) return db.update('rep_commissions', id, row); // keep payout status
  return db.insert('rep_commissions', Object.assign({ id, status: 'pending', created_at: now }, row));
}

// An upsell on an account a rep brought in. Returns the rep's name or null.
async function creditUpsell({ sourceId, applicationId, email, amount, kind = 'implementation', business_name, note }) {
  const who = await findRepFor({ applicationId, email });
  if (!who) return null;
  const rates = await getRates();
  await writeCommission({
    id: `cm_${kind}_${sourceId}`, rep_id: who.rep_id, rep_lead_id: who.rep_lead_id, application_id: who.application_id,
    business_name: business_name || who.business_name, kind, amount, rate: rates.upsell, note, source: 'stripe',
  });
  const rep = await db.getById('reps', who.rep_id).catch(() => null);
  return (rep && rep.name) || 'a rep';
}

module.exports = { KINDS, DEFAULT_RATES, getRates, setRates, findRepFor, writeCommission, creditUpsell };
