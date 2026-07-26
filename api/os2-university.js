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
//
// Scores are appended to os_scores (history, never overwritten) because the
// chart of the number moving over months is the whole retention loop.
//
// Grading is deliberately NOT here. A member owns their own tenant, so letting
// this endpoint verify would let a member self-verify and unlock floors, which
// is exactly the not-a-course failure this whole design exists to prevent.
// Verification is TMI-side, cross-tenant, and lives in the staff grading surface.

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');
const { scope } = require('./_ostenantdb');
const U = require('./_osuniversity');
const { contentFor } = require('./_osunicontent');
const { personalize, variantKey } = require('./_osunipersonalize');
const { startTrace, finishTrace } = require('./_ostrace');

const LESSON_IDS = new Set(U.FLOORS.flatMap(f => f.lessons.map(l => l.id)));

function log(tid, summary) {
  return db.insert('os_build_log', { tenant_id: tid, kind: 'university', summary, created_at: new Date().toISOString() }).catch(() => {});
}

// Stamp activity onto the tenant's uni object so the nudge sweep (os2-cron) can
// decide who has gone quiet and who is due for a rescore from tenant docs alone,
// without a per-member sub-query. Read-merge so we never clobber enrolled_at or
// the last nudge record.
async function stampUni(tid, patch) {
  try {
    const tnt = await db.getById('os_tenants', tid);
    const uni = Object.assign({}, tnt && tnt.uni, patch);
    await db.update('os_tenants', tid, { uni });
  } catch (e) { /* best effort */ }
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
      const now = new Date().toISOString();
      const uni = Object.assign({ enrolled_at: now }, tenant.uni || {}, { last_activity: now });
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
        lessons: f.lessons.map(l => {
          const c = contentFor(l.id) || {};
          return { id: l.id, title: l.title, cold_open: l.cold_open, teach: c.teach || '', example: c.example || '', step: l.step, artifact: l.artifact, moves: l.moves, watched: watched.has(l.id) };
        }),
        artifacts: f.artifacts,
      }));
      return res.status(200).json({
        curriculum, standing,
        scores: scores.map(s => ({ date: s.date, total: s.total, areas: s.areas, owner_dependency: s.owner_dependency })),
        artifacts,
        levels: U.LEVELS, areas: U.AREAS, area_label: U.AREA_LABEL, scorecard: U.SCORECARD, cert: U.CERT,
      });
    }

    // Tailor one lesson to this member's industry and level. The teaching is
    // universal; the example and the for-you line are generated for their kind
    // of business and cached per (industry, level, lesson) so it is shared and
    // cheap. Read-side: available to viewers too, it only produces content.
    if (action === 'lesson') {
      const lessonId = String(b.lesson_id || '');
      let lesson = null;
      for (const f of U.FLOORS) { const l = f.lessons.find(x => x.id === lessonId); if (l) { lesson = l; break; } }
      if (!lesson) return res.status(400).json({ error: 'Unknown lesson' });
      const c = contentFor(lessonId) || {};
      const base = { id: lesson.id, title: lesson.title, cold_open: lesson.cold_open, teach: c.teach || '', example: c.example || '', step: lesson.step, artifact: lesson.artifact, moves: lesson.moves };

      const tenant = await db.getById('os_tenants', tid);
      const industry = (tenant && tenant.profile && tenant.profile.industry) || (tenant && tenant.business_type) || '';
      const scoreRows = await tdb.list('os_scores', { order: 'date', ascending: false, limit: 1 });
      scoreRows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      const level = scoreRows[0] ? U.levelForScore(scoreRows[0].total) : U.LEVELS[0];
      if (!industry) return res.status(200).json({ lesson: base, tailored: null });

      const key = variantKey(industry, level.level, lessonId);
      const cached = (await db.list('os_lesson_variants', { where: [['key', '==', key]], limit: 1 }))[0];
      if (cached) return res.status(200).json({ lesson: Object.assign({}, base, { example: cached.example || base.example, for_you: cached.for_you || '' }), tailored: industry, level: level.level });

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(200).json({ lesson: base, tailored: null });
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });
      const trace = startTrace(tid, { kind: 'university', label: 'personalize ' + lessonId, meta: { industry, level: level.level } });
      let v = null;
      try { v = await personalize(client, base, industry, level.name, { tenantId: tid, trace }); await finishTrace(trace, { status: 'ok' }); }
      catch (e) { await finishTrace(trace, { error: e }); }
      if (!v) return res.status(200).json({ lesson: base, tailored: null });
      await db.insert('os_lesson_variants', { key, industry, level: level.level, lesson_id: lessonId, example: v.example, for_you: v.for_you, created_at: new Date().toISOString() }).catch(() => {});
      return res.status(200).json({ lesson: Object.assign({}, base, { example: v.example || base.example, for_you: v.for_you || '' }), tailored: industry, level: level.level });
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
      const iso = new Date().toISOString();
      await stampUni(tid, { last_score_at: iso, last_activity: iso });
      const { standing } = await loadStanding(tdb);
      return res.status(200).json({ score: rec, standing });
    }

    if (action === 'watch') {
      const lesson_id = String(b.lesson_id || '');
      if (!LESSON_IDS.has(lesson_id)) return res.status(400).json({ error: 'Unknown lesson' });
      const existing = (await tdb.list('os_progress', { where: [['lesson_id', '==', lesson_id]], limit: 1 }))[0];
      if (!existing) await tdb.insert('os_progress', { lesson_id, watched_at: new Date().toISOString() });
      await stampUni(tid, { last_activity: new Date().toISOString() });
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
      await stampUni(tid, { last_activity: new Date().toISOString() });
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
