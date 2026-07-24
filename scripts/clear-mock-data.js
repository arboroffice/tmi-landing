#!/usr/bin/env node
// TMI OS - production data cleanup. Clears the test/mock data that piles up in
// the live database during development so a real launch starts from a clean slate.
//
// SAFE BY DEFAULT. Every destructive path is a DRY RUN until you add --yes. With
// no arguments it only takes inventory (read-only). It never deletes without an
// explicit target (a tenant id or an email) AND --yes, so you cannot wipe the
// database by fat-fingering a flag.
//
// Requires the same credential the app uses: env FIREBASE_SERVICE_ACCOUNT (raw
// service-account JSON or its base64). Run it from the repo root:
//
//   node scripts/clear-mock-data.js                          # inventory (read-only)
//   node scripts/clear-mock-data.js --email you@test.com     # find test accounts + leads for an email
//   node scripts/clear-mock-data.js --tenant <id>            # preview deleting one tenant + all its OS data
//   node scripts/clear-mock-data.js --tenant <id> --yes      # actually delete that tenant
//   node scripts/clear-mock-data.js --leads-by-email you@test.com --yes   # delete lead submissions for an email
//
// A tenant delete removes the tenant and every row in every tenant-scoped os_*
// collection (metrics, workers, records, secrets, users, ...). Lead cleanup only
// ever targets docs whose email matches what you pass, so real leads are never
// touched unless their email is the one you name.

const path = require('path');
const db = require(path.join(__dirname, '..', 'api', '_db.js'));

// Every collection scoped to a tenant by a tenant_id field. os_tenants (keyed by
// doc id) is handled separately. Global/ephemeral collections keyed by token or a
// global key (os_kv, os_resets, os_oauth_states) are intentionally excluded - a
// tenant filter would match nothing and they are not per-tenant data.
const TENANT_COLLECTIONS = [
  'os_metrics', 'os_workers', 'os_workflows', 'os_workflow_runs', 'os_departments',
  'os_goals', 'os_knowledge', 'os_tasks', 'os_subtasks', 'os_reports', 'os_outputs',
  'os_actions', 'os_requests', 'os_connections', 'os_signals', 'os_threads',
  'os_messages', 'os_contacts', 'os_build_log', 'os_records', 'os_policies',
  'os_secrets', 'os_audit', 'os_candidates', 'os_recruiters', 'os_meetings',
  'os_initiatives', 'os_issues', 'os_wins', 'os_advisor_notes', 'os_competitor_ads',
  'os_social_posts', 'os_journey_stages', 'os_scorecard_entries', 'os_scorecard_metrics',
  'os_team_members', 'os_users',
];

// Marketing lead-capture collections. These are global (not tenant-scoped); test
// submissions from exercising the funnels land here. Cleared only by email match.
const LEAD_COLLECTIONS = [
  'leads', 'book_leads', 'audit_submissions', 'assessments', 'assessment_applications',
  'mma_submissions', 'distro_submissions', 'call_requests', 'call_tasks', 'downloads',
  'city_leads', 'applications', 'contacts',
];

function parseArgs(argv) {
  const a = { yes: false };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--yes') a.yes = true;
    else if (t === '--tenant') a.tenant = argv[++i];
    else if (t === '--email') a.email = argv[++i];
    else if (t === '--leads-by-email') a.leadsByEmail = argv[++i];
    else { console.error('Unknown argument:', t); process.exit(1); }
  }
  return a;
}

// Delete docs in batches (Firestore caps a batch at 500 writes).
async function deleteDocs(coll, ids) {
  const fs = db.db();
  let done = 0;
  for (let i = 0; i < ids.length; i += 450) {
    const batch = fs.batch();
    for (const id of ids.slice(i, i + 450)) batch.delete(fs.collection(coll).doc(String(id)));
    await batch.commit();
    done += Math.min(450, ids.length - i);
  }
  return done;
}

async function inventory() {
  console.log('=== TENANTS (os_tenants) ===');
  const tenants = await db.list('os_tenants', {});
  if (!tenants.length) console.log('  (none)');
  for (const t of tenants) {
    console.log(`  ${t.id}  ${t.name || '(no name)'}  onboarded=${!!t.onboarded}  plan=${t.plan || 'trial'}  created=${(t.created_at || '').toString().slice(0, 10)}`);
  }
  console.log(`  -> ${tenants.length} tenant(s)\n`);

  console.log('=== LEAD COLLECTIONS (global) ===');
  for (const c of LEAD_COLLECTIONS) {
    const n = (await db.list(c, {}).catch(() => [])).length;
    if (n) console.log(`  ${c}: ${n}`);
  }
  console.log('\nRun with --tenant <id> to preview clearing one tenant, or --email <addr> to locate test data.');
}

async function findByEmail(email) {
  const e = String(email).toLowerCase();
  console.log(`=== Looking for "${e}" ===\n`);

  const users = (await db.list('os_users', {}).catch(() => [])).filter(u => String(u.email || '').toLowerCase() === e);
  console.log('os_users:', users.length);
  const tenantIds = [...new Set(users.map(u => u.tenant_id).filter(Boolean))];
  for (const tid of tenantIds) {
    const t = await db.getById('os_tenants', tid).catch(() => null);
    console.log(`  tenant ${tid}  ${t ? (t.name || '(no name)') : '(tenant doc missing)'}`);
  }
  if (tenantIds.length) console.log(`  -> delete with:  node scripts/clear-mock-data.js --tenant ${tenantIds[0]} --yes`);

  console.log('\nLead submissions with this email:');
  let total = 0;
  for (const c of LEAD_COLLECTIONS) {
    const rows = (await db.list(c, {}).catch(() => [])).filter(r => String(r.email || '').toLowerCase() === e);
    if (rows.length) { console.log(`  ${c}: ${rows.length}`); total += rows.length; }
  }
  if (total) console.log(`  -> delete with:  node scripts/clear-mock-data.js --leads-by-email ${e} --yes`);
  else console.log('  (none)');
}

async function clearTenant(tid, yes) {
  const tenant = await db.getById('os_tenants', tid).catch(() => null);
  console.log(`=== ${yes ? 'DELETING' : 'DRY RUN - would delete'} tenant ${tid} ===`);
  console.log(`Tenant: ${tenant ? (tenant.name || '(no name)') : '(no os_tenants doc - clearing scoped data anyway)'}\n`);

  let grand = 0;
  const plan = [];
  for (const coll of TENANT_COLLECTIONS) {
    const rows = await db.list(coll, { where: [['tenant_id', '==', String(tid)]] }).catch(() => []);
    if (rows.length) { plan.push([coll, rows.map(r => r.id)]); grand += rows.length; console.log(`  ${coll}: ${rows.length}`); }
  }
  console.log(`  os_tenants: ${tenant ? 1 : 0}`);
  console.log(`\n  Total rows: ${grand + (tenant ? 1 : 0)}`);

  if (!yes) { console.log('\nDRY RUN. Re-run with --yes to delete.'); return; }

  console.log('\nDeleting...');
  for (const [coll, ids] of plan) { const n = await deleteDocs(coll, ids); console.log(`  ${coll}: deleted ${n}`); }
  if (tenant) { await db.remove('os_tenants', tid); console.log('  os_tenants: deleted 1'); }
  console.log('\nDone.');
}

async function clearLeadsByEmail(email, yes) {
  const e = String(email).toLowerCase();
  console.log(`=== ${yes ? 'DELETING' : 'DRY RUN - would delete'} lead submissions for "${e}" ===\n`);
  let grand = 0;
  const plan = [];
  for (const c of LEAD_COLLECTIONS) {
    const rows = (await db.list(c, {}).catch(() => [])).filter(r => String(r.email || '').toLowerCase() === e);
    if (rows.length) { plan.push([c, rows.map(r => r.id)]); grand += rows.length; console.log(`  ${c}: ${rows.length}`); }
  }
  console.log(`\n  Total rows: ${grand}`);
  if (!grand) { console.log('  Nothing to delete.'); return; }
  if (!yes) { console.log('\nDRY RUN. Re-run with --yes to delete.'); return; }
  console.log('\nDeleting...');
  for (const [c, ids] of plan) { const n = await deleteDocs(c, ids); console.log(`  ${c}: deleted ${n}`); }
  console.log('\nDone.');
}

(async () => {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error('FIREBASE_SERVICE_ACCOUNT is not set. Export the service-account JSON (or its base64) first.');
    process.exit(1);
  }
  const a = parseArgs(process.argv);
  try {
    if (a.tenant) await clearTenant(a.tenant, a.yes);
    else if (a.leadsByEmail) await clearLeadsByEmail(a.leadsByEmail, a.yes);
    else if (a.email) await findByEmail(a.email);
    else await inventory();
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
  process.exit(0);
})();
