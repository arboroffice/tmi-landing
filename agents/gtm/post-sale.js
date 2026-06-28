// Post-sale runner — the lifecycle agents that run after a deal closes.
// Each is isolated so one failing never blocks the rest. Runs the same way as
// prospect-gen.js: CLI, HTTP (/api/post-sale), or the gtm-post-sale workflow.
//
//   1. Onboarding      — kick off newly closed clients
//   2. Delivery        — draft the client's build deliverables (SOPs, plan, docs)
//   3. Client success  — health scoring + monthly value reports (QBR)
//   4. Case studies     — turn wins into proof + testimonial/referral asks
//   5. Expansion       — surface upsell opportunities (audit -> build -> retainer)
//   6. Collections     — chase overdue invoices
//   7. Founder brief   — daily brief for the founder
//
// CLI:  node agents/gtm/post-sale.js

import { fileURLToPath } from 'url';
import path from 'path';
import * as db from './tools/db.js';
import { runOnboarding } from './onboarding.js';
import { runDelivery } from './delivery.js';
import { runClientSuccess } from './client-success.js';
import { runCaseStudies } from './case-study.js';
import { runExpansion } from './expansion.js';
import { runCollections } from './collections.js';
import { runFounderBrief } from './founder-brief.js';

export async function runPostSale(opts = {}) {
  const started = Date.now();
  const out = {};
  const step = async (name, fn) => {
    try { out[name] = await fn(); }
    catch (e) { out[name] = { error: e.message }; console.error(`post-sale ${name}:`, e.message); }
  };

  console.log('Post-sale: starting');
  await step('onboarding', () => runOnboarding({ limit: opts.onboardingLimit ?? 10 }));
  await step('delivery', () => runDelivery({ limit: opts.deliveryLimit ?? 5 }));
  await step('clientSuccess', () => runClientSuccess({ limit: opts.successLimit ?? 25 }));
  await step('caseStudies', () => runCaseStudies({ limit: opts.caseStudyLimit ?? 10 }));
  await step('expansion', () => runExpansion({ limit: opts.expansionLimit ?? 15 }));
  await step('collections', () => runCollections({ limit: opts.collectionsLimit ?? 50 }));
  await step('founderBrief', () => runFounderBrief());

  const elapsed = Math.round((Date.now() - started) / 1000);
  const summary = { kind: 'post-sale', elapsed_s: elapsed, ...out, at: new Date().toISOString() };
  try { await db.logRun(summary); } catch {}
  console.log(`Post-sale: done in ${elapsed}s`, JSON.stringify(out));
  return summary;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runPostSale().then(() => process.exit(0)).catch(e => { console.error('Fatal:', e); process.exit(1); });
}
