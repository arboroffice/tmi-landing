#!/usr/bin/env node
// One-time data migration: Supabase (Postgres) -> Firestore.
// Preserves row ids as Firestore doc ids so all foreign keys keep working.
// Idempotent (set overwrites). Re-runnable. Reports per-collection counts.
//
// Requires env:
//   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
//   SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY)
//   FIREBASE_SERVICE_ACCOUNT  (raw JSON or base64 of the service-account file)
//
// Usage:
//   node scripts/migrate-supabase-to-firestore.js              # all tables
//   node scripts/migrate-supabase-to-firestore.js contacts leads   # subset
//   DRY_RUN=1 node scripts/migrate-supabase-to-firestore.js    # counts only

const { createClient } = require('@supabase/supabase-js');
const admin = require('firebase-admin');

const TABLES = [
  // CRM core
  'contacts', 'leads', 'clients', 'activities', 'applications', 'followups',
  'proposals', 'projects', 'invoices', 'sms_log',
  // comms / newsletter
  'email_campaigns', 'email_templates', 'email_sends', 'newsletter_issues',
  'city_leads', 'audit_submissions',
  // content
  'content_items', 'content_ideas', 'content_posts',
  // visitors
  'site_visitors',
  // ops OS
  'os_goals', 'os_subtasks', 'os_meetings', 'os_kv',
  'os_scorecard_metrics', 'os_scorecard_entries', 'os_recruiters', 'os_candidates',
  // FOTF (verify which are live before relying on these)
  'fotf_members', 'fotf_receipts', 'fotf_stories', 'fotf_sprints',
  'fotf_glass_box', 'fotf_issues', 'fotf_library', 'fotf_rituals', 'fotf_stage_letters',
];

const DRY = !!process.env.DRY_RUN;
const PAGE = 1000;     // Supabase max rows per request
const BATCH = 450;     // Firestore batch limit is 500

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env not set');
  return createClient(url, key);
}

function fs() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
    const json = raw.trim().charAt(0) === '{' ? raw : Buffer.from(raw, 'base64').toString('utf8');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
  }
  return admin.firestore();
}

async function migrateTable(db, supabase, table) {
  let from = 0, total = 0, wrote = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1);
    if (error) {
      if (/does not exist|not found|schema cache/i.test(error.message)) {
        console.log(`  - ${table}: skipped (${error.message})`);
        return { table, total: 0, skipped: true };
      }
      throw new Error(`${table}: ${error.message}`);
    }
    if (!data || !data.length) break;
    total += data.length;
    if (!DRY) {
      for (let i = 0; i < data.length; i += BATCH) {
        const batch = db.batch();
        for (const row of data.slice(i, i + BATCH)) {
          const id = row.id != null ? String(row.id) : db.collection(table).doc().id;
          const doc = Object.assign({}, row); delete doc.id;
          batch.set(db.collection(table).doc(id), doc, { merge: true });
        }
        await batch.commit();
        wrote += Math.min(BATCH, data.length - i);
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`  - ${table}: ${total} rows${DRY ? ' (dry run)' : ' -> ' + wrote + ' written'}`);
  return { table, total };
}

(async () => {
  const tables = process.argv.slice(2).length ? process.argv.slice(2) : TABLES;
  const supabase = sb();
  const db = DRY ? null : fs();
  console.log(`${DRY ? '[DRY RUN] ' : ''}Migrating ${tables.length} collections...`);
  const summary = [];
  for (const t of tables) {
    try { summary.push(await migrateTable(db, supabase, t)); }
    catch (e) { console.error(`  ! ${t}: ${e.message}`); summary.push({ table: t, error: e.message }); }
  }
  const grand = summary.reduce((n, s) => n + (s.total || 0), 0);
  console.log(`\nDone. ${grand} total rows across ${summary.length} collections.`);
  const errs = summary.filter(s => s.error);
  if (errs.length) { console.log('Errors:', errs.map(e => e.table).join(', ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
