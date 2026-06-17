// Generate (or refresh) a build proposal from a paid Complete Audit and send it
// to the client. Grounds the three priced paths in the audit and the latest PRD
// from the strategy call. POST { submissionId, notes? }  (auth required)

const { cors, requireAuth } = require('./_auth');
const { generateProposal } = require('./_proposal-gen');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!requireAuth(req, res)) return;

  const { submissionId, notes } = req.body || {};
  if (!submissionId) return res.status(400).json({ error: 'submissionId required' });

  try {
    const out = await generateProposal({ submissionId, notes: notes || '', send: true });
    return res.json({ ok: true, id: out.id, link: out.link, build: out.build, status: out.status });
  } catch (e) {
    const code = /not ready/.test(e.message) ? 409 : /not found/.test(e.message) ? 404 : 500;
    return res.status(code).json({ error: e.message });
  }
};
