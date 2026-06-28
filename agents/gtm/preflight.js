// GTM pre-flight check — run this once your keys are set to verify the whole stack
// before the first real run. It checks env vars per capability, confirms Firestore
// actually connects, and imports every agent module so nothing fails silently on cron.
//
//   node agents/gtm/preflight.js
//   (or admin: GET /api/preflight)
//
// Exit code 0 if the minimum to run a dry run is present, 1 otherwise.

import { fileURLToPath } from 'url';
import path from 'path';

const has = (k) => !!(process.env[k] && String(process.env[k]).trim());

// Capability -> the env it needs. "min" = required to do a dry run at all.
const CAPS = [
  { name: 'Core (research + audit + Firestore)', min: true, vars: ['ANTHROPIC_API_KEY', 'FIREBASE_SERVICE_ACCOUNT'] },
  { name: 'Prospecting (Apollo ICP search + email reveal)', min: true, vars: ['APOLLO_API_KEY'] },
  { name: 'Sending via Instantly (recommended)', min: false, vars: ['INSTANTLY_API_KEY', 'INSTANTLY_CAMPAIGN_ID'] },
  { name: 'Sending via Resend (fallback)', min: false, vars: ['RESEND_OUTREACH_API_KEY', 'OUTREACH_FROM_EMAIL'] },
  { name: 'Intent: jobs/social (Apify)', min: false, vars: ['APIFY_API_TOKEN'] },
  { name: 'Intent/expansion search (Brave)', min: false, vars: ['BRAVE_API_KEY'] },
  { name: 'Email verification (NeverBounce)', min: false, vars: ['NEVERBOUNCE_API_KEY'] },
  { name: 'Enrichment waterfall (optional)', min: false, vars: ['FINDYMAIL_API_KEY', 'DROPCONTACT_API_KEY'] },
  { name: 'SMS / phone channel (Twilio)', min: false, vars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'] },
  { name: 'Booking -> auto-prep (QStash)', min: false, vars: ['QSTASH_TOKEN'] },
  { name: 'Visitor de-anon webhook', min: false, vars: ['VISITOR_REVEAL_SECRET'] },
  { name: 'Daily briefings', min: false, vars: ['GTM_DIGEST_EMAIL'] },
  { name: 'Ad-hoc HTTP triggers', min: false, vars: ['GTM_RUN_SECRET'] },
];

const AGENT_MODULES = [
  'orchestrator.js', 'outbound.js', 'intent-agent.js', 'reactivate.js', 'lookalike.js',
  'sms-outreach.js', 'prospect-gen.js', 'onboarding.js', 'delivery.js', 'client-success.js',
  'case-study.js', 'expansion.js', 'collections.js', 'founder-brief.js', 'post-sale.js',
];

export async function preflight() {
  const report = { caps: [], firestore: null, modules: { ok: 0, failed: [] }, ready: {}, ts: new Date().toISOString() };

  for (const c of CAPS) {
    const present = c.vars.filter(has);
    const missing = c.vars.filter(k => !has(k));
    report.caps.push({ name: c.name, min: !!c.min, ok: missing.length === 0, present, missing });
  }

  // Firestore connectivity (the most common silent failure)
  if (has('FIREBASE_SERVICE_ACCOUNT')) {
    try {
      const db = await import('./tools/db.js');
      const n = await db.count('leads');
      report.firestore = { connected: true, leads: n };
    } catch (e) { report.firestore = { connected: false, error: e.message }; }
  } else {
    report.firestore = { connected: false, error: 'FIREBASE_SERVICE_ACCOUNT not set' };
  }

  // Every agent module imports cleanly
  for (const m of AGENT_MODULES) {
    try { await import('./' + m); report.modules.ok++; }
    catch (e) { report.modules.failed.push({ module: m, error: e.message }); }
  }

  const coreOk = report.caps.filter(c => c.min).every(c => c.ok);
  const canSend = report.caps.find(c => c.name.includes('Instantly'))?.ok || report.caps.find(c => c.name.includes('Resend'))?.ok;
  report.ready = {
    dryRun: coreOk && report.modules.failed.length === 0,
    send: !!(coreOk && canSend),
    sms: has('TWILIO_ACCOUNT_SID') && has('TWILIO_AUTH_TOKEN'),
  };
  return report;
}

function printReport(r) {
  const mark = (b) => (b ? 'OK ' : 'XX ');
  console.log('\nTMI GTM pre-flight\n==================');
  for (const c of r.caps) {
    const tag = c.min ? '[required]' : '[optional]';
    console.log(`${mark(c.ok)}${tag} ${c.name}` + (c.missing.length ? `  missing: ${c.missing.join(', ')}` : ''));
  }
  console.log('\nFirestore: ' + (r.firestore.connected ? `connected (${r.firestore.leads} leads)` : `NOT connected (${r.firestore.error})`));
  console.log(`Agent modules: ${r.modules.ok} ok` + (r.modules.failed.length ? `, ${r.modules.failed.length} FAILED` : ''));
  for (const f of r.modules.failed) console.log(`   XX ${f.module}: ${f.error}`);
  console.log('\nReady to:');
  console.log(`  Dry run (find + audit, no send): ${r.ready.dryRun ? 'YES' : 'NO'}`);
  console.log(`  Send outreach:                   ${r.ready.send ? 'YES' : 'NO'}`);
  console.log(`  SMS channel:                     ${r.ready.sms ? 'YES' : 'NO'}`);
  console.log('');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  preflight().then(r => { printReport(r); process.exit(r.ready.dryRun ? 0 : 1); })
    .catch(e => { console.error('Pre-flight crashed:', e); process.exit(1); });
}
