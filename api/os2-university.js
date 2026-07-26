// TMI University - the member endpoint. A University member is a tenant on the
// plan 'university'; member_id is the tenant_id. Everything a member does routes
// through here and is scoped to their own tenant, so one member can never read
// or grade another's binder.
//
// It is built to enforce the one rule that makes this not a course: a floor only
// unlocks when the floor below has every required artifact VERIFIED. Watching a
// lesson does nothing on its own.
//
// POST { action, ... }
//   'enroll'                                  -> { standing }        put this tenant on the university plan
//   'state'                                   -> { curriculum?, standing, scores, progress }
//   'assess'  { answers }                     -> { score, standing }  admissions or 30-day rescore (writes history)
//   'watch'   { lesson_id }                   -> { ok }               mark a lesson watched
//   'submit'  { artifact_key, content }       -> { artifact, standing } put/replace an artifact in the binder
//   'review'  { artifact_id, verdict, note }  (manager) -> { artifact, standing }  grade: verify or return
//
// Scores are appended to os_scores (history, never overwritten) because the
// chart of the number moving over months is the whole retention loop.

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');
const { scope } = require('./_ostenantdb');
const U = require('./_osuniversity');

const LESSON_IDS = new Set(U.FLOORS.flatMap(f => f.lessons.map(l => l.id)));

function log(tid, summary) {
  return db.insert('os_build_log', { tenant_id: tid, kind: 'university', summary, created_at: new Date().toISOString() }).catch(() => {});
}

// Load the member's latest score and all artifacts, then hand to the engine.
async function loadStanding(tdb) {
  const [scores, artifacts] = await Promise.all([
    tdb.list('os_scores', { order: 'date', ascending: false, limit: 60 }),
    tdb.list('os_artifacts'),
  ]);
  scores.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const latest = scores[0] || null;
  const standing = U.computeStanding(latest, artifacts);
  return { standing, scores, artifacts };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;
  const tid = t.tenant_id;
  const tdb = scope(tid);
  const b = req.body || {};
  const action = String(b.action || 'state');

  try {
    if (action === 'enroll') {
      const tenant = await db.getById('os_tenants', tid);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      const uni = Object.assign({ enrolled_at: new Date().toISOString() }, tenant.uni || {});
      await db.update('os_tenants', tid, { plan: 'university', uni });
      await log(tid, 'Enrolled in TMI University.');
      const { standing } = await loadStanding(tdb);
      return res.status(200).json({ standing });
    }

    if (action === 'state') {
      const { standing, scores, artifacts } = await loadStanding(tdb);
      const progress = await tdb.list('os_progress').catch(() => []);
      const watched = new Set(progress.map(p => p.lesson_id));
      // Attach the watched flag onto the curriculum so the app can render it.
      const curriculum = U.FLOORS.map(f => ({
        key: f.key, order: f.order, title: f.title, subtitle: f.subtitle,
        lessons: f.lessons.map(l => ({ id: l.id, title: l.title, cold_open: l.cold_open, step: l.step, artifact: l.artifact, moves: l.moves, watched: watched.has(l.id) })),
        artifacts: f.artifacts,
      }));
      return res.status(200).json({
        curriculum, standing,
        scores: scores.map(s => ({ date: s.date, total: s.total, areas: s.areas, owner_dependency: s.owner_dependency })),
        artifacts,
        levels: U.LEVELS, areas: U.AREAS, area_label: U.AREA_LABEL, scorecard: U.SCORECARD, cert: U.CERT,
      });
    }

    // Everything below writes: viewers are read-only.
    if (!requireRole(t, res, 'manager')) return;

    if (action === 'assess') {
      const answers = (b.answers && typeof b.answers === 'object') ? b.answers : {};
      const result = U.scoreAssessment(answers);
      const od = typeof b.owner_dependency === 'number' ? Math.max(0, Math.min(100, b.owner_dependency)) : null;
      const rec = await tdb.insert('os_scores', {
        date: new Date().toISOString(),
        total: result.total, areas: result.areas, level: result.level,
        owner_dependency: od, answers, answered: result.answered, complete: result.complete,
      });
      await log(tid, `Scored ${result.total}/100 (Level ${result.level}).`);
      const { standing } = await loadStanding(tdb);
      return res.status(200).json({ score: rec, standing });
    }

    if (action === 'watch') {
      const lesson_id = String(b.lesson_id || '');
      if (!LESSON_IDS.has(lesson_id)) return res.status(400).json({ error: 'Unknown lesson' });
      const existing = (await tdb.list('os_progress', { where: [['lesson_id', '==', lesson_id]], limit: 1 }))[0];
      if (!existing) await tdb.insert('os_progress', { lesson_id, watched_at: new Date().toISOString() });
      return res.status(200).json({ ok: true });
    }

    if (action === 'submit') {
      const key = String(b.artifact_key || '');
      const meta = U.ARTIFACT_META[key];
      if (!meta) return res.status(400).json({ error: 'Unknown artifact' });
      const content = String(b.content || '').slice(0, 20000);
      if (!content.trim()) return res.status(400).json({ error: 'Add what you built before submitting.' });
      // One artifact per key per member: replace in place if it already exists.
      const existing = (await tdb.list('os_artifacts', { where: [['key', '==', key]], limit: 1 }))[0];
      let artifact;
      if (existing) {
        artifact = await tdb.update('os_artifacts', existing.id, { content, status: 'submitted', updated_at: new Date().toISOString(), reviewed_at: null, review_note: null });
      } else {
        artifact = await tdb.insert('os_artifacts', {
          key, floor: meta.floor, lesson: meta.lesson, label: meta.label,
          content, status: 'submitted', created_at: new Date().toISOString(),
        });
      }
      await log(tid, `Submitted artifact: ${meta.label}.`);
      const { standing } = await loadStanding(tdb);
      return res.status(200).json({ artifact, standing });
    }

    if (action === 'review') {
      // Grading. A verdict of 'verify' is what unlocks the next floor; 'return'
      // sends it back with a note. Verification is deliberately a separate step
      // from submission so progress reflects built work, not claimed work.
      const id = String(b.artifact_id || '');
      const cur = await tdb.getById('os_artifacts', id);
      if (!cur) return res.status(404).json({ error: 'Artifact not found' });
      const verdict = String(b.verdict || '');
      if (!['verify', 'return'].includes(verdict)) return res.status(400).json({ error: 'verdict must be verify or return' });
      const status = verdict === 'verify' ? 'verified' : 'returned';
      const artifact = await tdb.update('os_artifacts', id, {
        status, review_note: String(b.note || '').slice(0, 2000) || null, reviewed_at: new Date().toISOString(),
      });
      await log(tid, `${verdict === 'verify' ? 'Verified' : 'Returned'} artifact: ${cur.label || cur.key}.`);
      const { standing } = await loadStanding(tdb);
      return res.status(200).json({ artifact, standing });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-university:', e.message);
    return res.status(500).json({ error: 'Could not complete that' });
  }
};

module.exports.config = { maxDuration: 30 };
