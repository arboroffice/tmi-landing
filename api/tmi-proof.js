// The Proof Engine. Closes the flywheel: a client's real OS build becomes TMI's
// marketing. Scores every OS tenant on the Company Intelligence Score, and on
// demand turns one client into a case study (saved to the company brain) and a
// content draft (dropped into the Company Intelligence approval queue, since it
// is public). Fulfillment to certification to distribution to demand. Admin only.
//
// POST { action }
//   'list'                  -> { tenants: [{tenant_id,name,score,owner_dependency,tier,certified}] }
//   'generate' { tenant_id } -> { case_study, content, score }

const db = require('./_db');
const { requireAuth, cors } = require('./_auth');
const { scoreTenant } = require('./_osscore');
const { tenantState, generateProof } = require('./_tmiproof');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!requireAuth(req, res)) return;

  const b = req.body || {};
  const action = String(b.action || 'list');

  try {
    if (action === 'list') {
      const tenants = await db.list('os_tenants', { limit: 200 });
      const rows = [];
      for (const t of tenants) {
        if (!t.onboarded) continue;
        const st = await tenantState(t.id);
        const sc = scoreTenant(Object.assign({ onboarded: true }, st));
        rows.push({
          tenant_id: t.id, name: t.name, business_type: t.business_type || null,
          score: sc.score, owner_dependency: sc.owner_dependency, tier: sc.tier, certified: sc.certified,
        });
      }
      rows.sort((a, b) => b.score - a.score);
      return res.status(200).json({ tenants: rows });
    }

    if (action === 'generate') {
      const tid = String(b.tenant_id || '');
      const tenant = await db.getById('os_tenants', tid);
      if (!tenant) return res.status(404).json({ error: 'Client not found' });
      const out = await generateProof(tenant, 'manual');
      await db.update('os_tenants', tid, { proof_fired_at: new Date().toISOString() }).catch(() => {});
      return res.status(200).json(out);
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('tmi-proof:', e.message);
    return res.status(500).json({ error: e.message || 'Something went wrong' });
  }
};
