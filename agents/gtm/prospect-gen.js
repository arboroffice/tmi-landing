// Prospect-gen runner — the top-of-funnel agents that feed the SDR pipeline.
//
// Runs the four sourcing/expansion agents in sequence, each isolated so one failing
// never blocks the rest, then logs a run. The main daily orchestrator (orchestrator.js)
// still does cold prospecting + audit + send; this adds the compounding + owned-asset
// sources on top of it:
//
//   1. Intent agent      — job/social/permit/expansion/new-authority signals -> leads
//   2. Reactivation      — re-work dormant leads you already own
//   3. Lookalike         — clone your wins into near-identical companies
//   4. SMS sweep         — text owners whose audit is ready (Twilio)
//
// CLI:  node agents/gtm/prospect-gen.js
// HTTP: POST /api/prospect-gen  (bearer GTM_RUN_SECRET or admin JWT)

import { fileURLToPath } from 'url';
import path from 'path';
import * as db from './tools/db.js';
import { runIntentAgent } from './intent-agent.js';
import { reactivateLeads } from './reactivate.js';
import { expandLookalikes } from './lookalike.js';
import { sweepSms } from './sms-outreach.js';
import { routeLeads } from './lead-router.js';
import { sendDigest } from './tools/email.js';

const num = (v, d) => (v != null && !Number.isNaN(parseInt(v, 10)) ? parseInt(v, 10) : d);

export async function runProspectGen(opts = {}) {
  const started = Date.now();
  const out = {};
  const step = async (name, fn) => {
    try { out[name] = await fn(); }
    catch (e) { out[name] = { error: e.message }; console.error(`prospect-gen ${name}:`, e.message); }
  };

  console.log('Prospect-gen: starting');
  await step('intent', () => runIntentAgent());
  await step('reactivation', () => reactivateLeads({ limit: opts.reactivateLimit ?? num(process.env.GTM_REACTIVATE_LIMIT, 25) }));
  await step('lookalike', () => expandLookalikes({ limit: opts.lookalikeLimit ?? num(process.env.GTM_LOOKALIKE_LIMIT, 60) }));
  await step('routing', () => routeLeads({}));
  await step('sms', () => sweepSms({ limit: opts.smsLimit ?? num(process.env.GTM_SMS_LIMIT, 40) }));

  const elapsed = Math.round((Date.now() - started) / 1000);
  const summary = { kind: 'prospect-gen', elapsed_s: elapsed, ...out, at: new Date().toISOString() };
  try { await db.logRun(summary); } catch {}

  // Email briefing so the new agents do not run blind.
  try {
    const n = (o, k) => (o && typeof o === 'object' && o[k] != null) ? o[k] : 0;
    const body = [
      `Prospect-gen run — ${elapsed}s`,
      ``,
      `Intent signals:   ${n(out.intent, 'signals')} found, ${n(out.intent, 'routed')} routed`,
      `Reactivation:     ${n(out.reactivation, 'reactivated')} dormant leads re-queued`,
      `Lookalike:        ${n(out.lookalike, 'inserted')} new from ${n(out.lookalike, 'seeds')} wins`,
      `SMS sweep:        ${n(out.sms, 'sent')} texted, ${n(out.sms, 'queuedCalls')} calls queued`,
      ``,
      `Work the call queue: https://admin.tmitechai.com/admin-call-tasks`,
    ].join('\n');
    await sendDigest({ subject: `Prospect-gen — ${n(out.lookalike, 'inserted') + n(out.intent, 'routed')} new, ${n(out.sms, 'queuedCalls')} to call`, body });
  } catch (e) { console.error('prospect-gen digest:', e.message); }

  console.log(`Prospect-gen: done in ${elapsed}s`, JSON.stringify(out));
  return summary;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runProspectGen().then(() => process.exit(0)).catch(e => { console.error('Fatal:', e); process.exit(1); });
}
