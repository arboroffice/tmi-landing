// TMI OS — scheduled worker sweep. Runs on a schedule (see vercel.json crons)
// and executes every active worker that is due on its cadence, across all
// tenants. This is what makes an active worker run without anyone clicking:
// the company keeps operating on its own.
//
// Protected: if CRON_SECRET is set, the caller must present it (Authorization:
// Bearer, or ?key=). Vercel's own cron header is also accepted.
//
// GET | POST -> { ran, failed, considered, due }

const db = require('./_db');
const { executeWorker } = require('./_osrun');
const { advance } = require('./_osflow');
const { scoreTenant } = require('./_osscore');
const { tenantState, generateProof } = require('./_tmiproof');
const { runScan } = require('./os2-pulse');
const { notify } = require('./_osmail');

const HOUR = 3600 * 1000;
const MAX_PER_RUN = 40;   // safety cap so one sweep can never run unbounded
const CONCURRENCY = 3;
const MAX_RESUME_PER_RUN = 40;  // cap on paused cascade runs resumed per sweep

// Resume every workflow run that was waiting on a timer whose time has come, so a
// cascade with a "wait 2 days" step continues on its own. Best-effort per run.
async function resumeWaitingRuns() {
  let resumed = 0;
  try {
    const now = Date.now();
    const runs = (await db.list('os_workflow_runs', { where: [['status', '==', 'waiting']], limit: 200 }).catch(() => []))
      .filter(r => r && (r.resume_at == null || Number(r.resume_at) <= now))
      .slice(0, MAX_RESUME_PER_RUN);
    for (const r of runs) {
      try { await advance(r, new Date().toISOString()); resumed++; }
      catch (e) { console.error('resumeWaitingRuns', r.id, e.message); }
    }
  } catch (e) { console.error('resumeWaitingRuns sweep:', e.message); }
  return resumed;
}
const MAX_PROOF_PER_RUN = 3;   // Claude is expensive; cap auto-proof per sweep
const MAX_PULSE_PER_RUN = 10;  // one Pulse scan per onboarded tenant, capped for cron time

// Refresh every onboarded company's Pulse so signals are current each morning.
async function pulseSweep() {
  let scanned = 0;
  try {
    const tenants = await db.list('os_tenants', { limit: 300 });
    const onboarded = tenants.filter((t) => t.onboarded).slice(0, MAX_PULSE_PER_RUN);
    for (const t of onboarded) {
      try { await runScan(t.id); scanned++; }
      catch (e) { console.error('pulseSweep', t.id, e.message); }
    }
  } catch (e) { console.error('pulseSweep sweep:', e.message); }
  return scanned;
}

// The moment a client crosses the Certified line, the flywheel should turn on its
// own: fire the Proof Engine once, dropping a case study and a content draft into
// the approval queue. Guarded by proof_fired_at so each client fires exactly once.
async function autoProof() {
  let fired = 0;
  try {
    const tenants = await db.list('os_tenants', { limit: 300 });
    for (const t of tenants) {
      if (fired >= MAX_PROOF_PER_RUN) break;
      if (!t.onboarded || t.proof_fired_at) continue;
      const st = await tenantState(t.id);
      const sc = scoreTenant(Object.assign({ onboarded: true }, st));
      if (!sc.certified) continue;
      try {
        await generateProof(t, 'auto');
        await db.update('os_tenants', t.id, { proof_fired_at: new Date().toISOString() });
        fired++;
      } catch (e) { console.error('autoProof', t.id, e.message); }
    }
  } catch (e) { console.error('autoProof sweep:', e.message); }
  return fired;
}

function isDue(w, now) {
  const last = w.last_run ? Date.parse(w.last_run) : 0;
  const elapsed = now - (isNaN(last) ? 0 : last);
  if (w.cadence === 'weekly') return elapsed > 6.5 * 24 * HOUR;
  // realtime and daily both run on the daily sweep
  return elapsed > 20 * HOUR;
}

// TMI University nudges. The retention loop lives here. Using only the activity
// stamps os2-university writes onto each tenant's uni object (no per-member
// sub-queries), decide who to nudge and send one email per member per sweep:
//   30+ days since their last score  -> rescore (the retention event)
//   14+ days quiet                   -> do the one ten-minute artifact
//   7+ days quiet                    -> what got in the way, make the step smaller
// Never nudge the same member more than once every six days.
const DAY = 24 * HOUR;
async function universityNudges(now) {
  let sent = 0;
  try {
    const members = (await db.list('os_tenants', { limit: 500 }).catch(() => [])).filter(t => t.plan === 'university');
    for (const t of members) {
      if (sent >= 60) break;
      const uni = t.uni || {};
      const nudgedAt = Date.parse(uni.last_nudge && uni.last_nudge.at || 0) || 0;
      if (nudgedAt && (now - nudgedAt) < 6 * DAY) continue; // at most one nudge a week
      const enrolled = Date.parse(uni.enrolled_at || 0) || 0;
      const lastScore = Date.parse(uni.last_score_at || 0) || 0;
      const lastAct = Date.parse(uni.last_activity || uni.enrolled_at || 0) || 0;
      const scoreBase = lastScore || enrolled;
      const lastKind = uni.last_nudge && uni.last_nudge.kind;

      let kind = null, subject, title, lines;
      if (scoreBase && (now - scoreBase) >= 30 * DAY && lastKind !== 'rescore') {
        kind = 'rescore'; subject = '30 days in. Rescore your company.'; title = 'Time to rescore';
        lines = ['You have been building for a month. Take the assessment again and watch the number move.', 'The rescore is the whole point. It is how you see the work pay off.', 'Open TMI University and hit Rescore.'];
      } else if (lastAct && (now - lastAct) >= 14 * DAY) {
        kind = 'day14'; subject = 'One artifact. Ten minutes.'; title = 'Pick the small one';
        lines = ['You have been quiet for two weeks. Do not restart the whole thing.', 'Open your current floor and build the one artifact that takes ten minutes.', 'Momentum beats a perfect plan.'];
      } else if (lastAct && (now - lastAct) >= 7 * DAY) {
        kind = 'day7'; subject = 'What got in the way?'; title = 'Still with us?';
        lines = ['You started a floor and it went quiet. That is almost always time, a team member, or a step that was too big.', 'Whatever it is, the fix is to make the next step smaller.', 'Ask your coach in the OS what to build next.'];
      }
      if (!kind) continue;

      await notify(t, subject, title, lines).catch(() => {});
      await db.update('os_tenants', t.id, { uni: Object.assign({}, uni, { last_nudge: { kind, at: new Date(now).toISOString() } }) }).catch(() => {});
      sent++;
    }
  } catch (e) { console.error('universityNudges sweep:', e.message); }
  return sent;
}

// Watch every company's alert rules against its real numbers and fire the ones
// that crossed a line, into the feed plus email/SMS. This is the awareness
// promise: you hear about it the day it happens.
async function alertsSweep() {
  let fired = 0;
  try {
    const { scope } = require('./_ostenantdb');
    const A = require('./_osalerts');
    const tenants = (await db.list('os_tenants', { limit: 500 }).catch(() => [])).filter(t => t.onboarded);
    for (const t of tenants.slice(0, 200)) {
      try {
        const out = await A.evaluate(scope(t.id), db, t.id, { cooldownHours: 12 });
        fired += out.length;
      } catch (e) { console.error('alertsSweep', t.id, e.message); }
    }
  } catch (e) { console.error('alertsSweep sweep:', e.message); }
  return fired;
}

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || '';
    const key = (req.query && req.query.key) || '';
    const ok = auth === `Bearer ${secret}` || key === secret || req.headers['x-vercel-cron'];
    if (!ok) return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const workers = await db.list('os_workers', { where: [['status', '==', 'active']] });
    const now = Date.now();
    const due = workers.filter(w => isDue(w, now)).slice(0, MAX_PER_RUN);

    let ran = 0, failed = 0;
    const queue = due.slice();
    async function drain() {
      while (queue.length) {
        const w = queue.shift();
        try { await executeWorker(w, 'scheduled'); ran++; }
        catch (e) { failed++; console.error('os2-cron worker', w.id, e.message); }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, drain));

    const resumed = await resumeWaitingRuns();
    const proofed = await autoProof();
    const pulsed = await pulseSweep();
    const nudged = await universityNudges(now);
    const alerted = await alertsSweep();
    // Data sync runs on its own dedicated cron (os2-sync, every 6h) so it is
    // never starved by the Opus-heavy sweeps above under a tight maxDuration.

    return res.status(200).json({ ran, failed, considered: workers.length, due: due.length, resumed, proofed, pulsed, nudged, alerted });
  } catch (e) {
    console.error('os2-cron:', e.message);
    return res.status(500).json({ error: 'cron failed' });
  }
};
