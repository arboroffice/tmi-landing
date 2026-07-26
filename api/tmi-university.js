// TMI University - the staff grading surface. Admin only, cross-tenant. This is
// the other half of what makes the school not-a-course: a member submits an
// artifact, and TMI verifies it against a short rubric before it counts. A
// member can never verify their own work, so a floor only opens on built, seen
// work. That check happens here, never in the member endpoint.
//
// POST { action, ... }   (admin auth via _auth)
//   'queue'                                   -> { items }   all submitted artifacts awaiting review, across members
//   'member' { tenant_id }                    -> { member, standing, scores, artifacts }
//   'review' { artifact_id, verdict, note }   -> { artifact, standing }   verify | return

const db = require('./_db');
const { verifyToken, cors } = require('./_auth');
const U = require('./_osuniversity');

async function standingFor(tid) {
  const w = [['tenant_id', '==', tid]];
  const [scores, artifacts] = await Promise.all([
    db.list('os_scores', { where: w }),
    db.list('os_artifacts', { where: w }),
  ]);
  scores.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return { standing: U.computeStanding(scores[0] || null, artifacts), scores, artifacts };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const admin = verifyToken(req);
  if (!admin) return res.status(401).json({ error: 'Unauthorized' });

  const b = req.body || {};
  const action = String(b.action || 'queue');

  try {
    if (action === 'queue') {
      const submitted = await db.list('os_artifacts', { where: [['status', '==', 'submitted']], limit: 500 });
      // Attach the member/company name so the reviewer has context.
      const tids = [...new Set(submitted.map(a => a.tenant_id).filter(Boolean))];
      const tenants = {};
      await Promise.all(tids.map(async id => { tenants[id] = await db.getById('os_tenants', id).catch(() => null); }));
      const items = submitted.map(a => ({
        id: a.id, tenant_id: a.tenant_id, company: (tenants[a.tenant_id] || {}).name || 'Unknown',
        key: a.key, label: a.label, floor: a.floor, lesson: a.lesson,
        content: a.content, created_at: a.created_at, updated_at: a.updated_at,
      })).sort((x, y) => String(x.updated_at || x.created_at || '').localeCompare(String(y.updated_at || y.created_at || '')));
      return res.status(200).json({ items });
    }

    if (action === 'member') {
      const tid = String(b.tenant_id || '');
      if (!tid) return res.status(400).json({ error: 'tenant_id required' });
      const tenant = await db.getById('os_tenants', tid);
      if (!tenant) return res.status(404).json({ error: 'Member not found' });
      const { standing, scores, artifacts } = await standingFor(tid);
      return res.status(200).json({ member: { id: tenant.id, name: tenant.name, plan: tenant.plan }, standing, scores, artifacts });
    }

    if (action === 'review') {
      const id = String(b.artifact_id || '');
      const cur = await db.getById('os_artifacts', id);
      if (!cur) return res.status(404).json({ error: 'Artifact not found' });
      const verdict = String(b.verdict || '');
      if (!['verify', 'return'].includes(verdict)) return res.status(400).json({ error: 'verdict must be verify or return' });
      const status = verdict === 'verify' ? 'verified' : 'returned';
      const artifact = await db.update('os_artifacts', id, {
        status, review_note: String(b.note || '').slice(0, 2000) || null,
        reviewed_by: admin.email || admin.sub || 'tmi', reviewed_at: new Date().toISOString(),
      });
      await db.insert('os_build_log', {
        tenant_id: cur.tenant_id, kind: 'university',
        summary: `${verdict === 'verify' ? 'TMI verified' : 'TMI sent back'} your artifact: ${cur.label || cur.key}.`,
        created_at: new Date().toISOString(),
      }).catch(() => {});
      const { standing } = await standingFor(cur.tenant_id);
      return res.status(200).json({ artifact, standing });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('tmi-university:', e.message);
    return res.status(500).json({ error: 'Could not complete that' });
  }
};

module.exports.config = { maxDuration: 30 };
