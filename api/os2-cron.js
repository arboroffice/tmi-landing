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
const { scoreTenant } = require('./_osscore');
const { tenantState, generateProof } = require('./_tmiproof');

const HOUR = 3600 * 1000;
const MAX_PER_RUN = 40;   // safety cap so one sweep can never run unbounded
const CONCURRENCY = 3;
const MAX_PROOF_PER_RUN = 3;   // Claude is expensive; cap auto-proof per sweep

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

    const proofed = await autoProof();

    return res.status(200).json({ ran, failed, considered: workers.length, due: due.length, proofed });
  } catch (e) {
    console.error('os2-cron:', e.message);
    return res.status(500).json({ error: 'cron failed' });
  }
};
