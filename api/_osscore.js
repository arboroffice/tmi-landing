// Company Intelligence Score. A deterministic 0 to 100 read of how much a
// company runs on systems vs on its owner, computed from its OS state. Used by
// the client OS (show the owner their score and certification progress) and by
// the admin Proof Engine (find certification-ready clients). The same number
// the whole movement is built around.

function clamp01(x) { return Math.max(0, Math.min(1, x || 0)); }

// Certified at 70. Tiers below and above.
const THRESHOLD = 70;

function scoreTenant(s) {
  const m = Array.isArray(s.metrics) ? s.metrics : [];
  const w = Array.isArray(s.workers) ? s.workers : [];
  const f = Array.isArray(s.workflows) ? s.workflows : [];
  const k = Array.isArray(s.knowledge) ? s.knowledge : [];

  const liveMetrics = m.filter(x => x.updated_at).length;
  const activeWorkers = w.filter(x => x.status === 'active').length;
  const autonomous = w.filter(x => x.status === 'active' && (x.autonomy === 'auto' || x.autonomy === 'approve')).length;

  const dim = {
    foundation: s.onboarded ? 1 : 0,
    systems: clamp01(f.length / 3),
    workforce: clamp01(activeWorkers / 3),
    autonomy: clamp01(autonomous / 3),
    knowledge: clamp01(k.length / 5),
    data: clamp01(m.length ? liveMetrics / m.length : 0),
  };
  const weight = { foundation: 0.10, systems: 0.20, workforce: 0.20, autonomy: 0.15, knowledge: 0.15, data: 0.20 };

  let score = 0;
  for (const d in weight) score += (dim[d] || 0) * weight[d];
  score = Math.round(score * 100);

  // Owner dependency: how much still runs through the owner. Lower is better.
  const ownerDependency = Math.max(0, Math.min(100, Math.round(
    100 - (dim.workforce * 30 + dim.autonomy * 25 + dim.systems * 20 + dim.data * 15 + dim.knowledge * 10)
  )));

  const certified = score >= THRESHOLD;
  const tier = score >= 85 ? 'Advanced' : score >= THRESHOLD ? 'Certified' : score >= 40 ? 'Building' : 'Starting';

  return {
    score,
    owner_dependency: ownerDependency,
    tier,
    certified,
    to_certify: Math.max(0, THRESHOLD - score),
    dimensions: dim,
    threshold: THRESHOLD,
  };
}

module.exports = { scoreTenant, THRESHOLD };
