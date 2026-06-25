// TEMPORARY diagnostic endpoint - verifies the audit research keys fire end to end.
// Runs one real research pass on a FIXED company (no user input, so it cannot be
// abused for arbitrary scraping). Remove after testing.
//   GET /api/audit-research-selftest          -> reports which env keys are present
//   GET /api/audit-research-selftest?run=1     -> executes a live research pass

const { cors } = require('./_auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const env = {
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    BRAVE_API_KEY: !!process.env.BRAVE_API_KEY,
    APOLLO_API_KEY: !!process.env.APOLLO_API_KEY,
    APIFY_API_TOKEN: !!process.env.APIFY_API_TOKEN,
    FIREBASE_SERVICE_ACCOUNT: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
  };

  // Fast probe: just confirm the research module (and its @anthropic-ai/sdk
  // dependency) resolves and loads in the deployed function. Returns instantly.
  if (req.query && req.query.probe === '1') {
    try {
      const mod = await import('../agents/gtm/audit-research.js');
      return res.json({ env, moduleLoads: typeof mod.researchForAudit === 'function' });
    } catch (e) {
      return res.json({ env, moduleLoads: false, error: e.message });
    }
  }

  if (!req.query || req.query.run !== '1') {
    return res.json({ env, note: 'add ?probe=1 to confirm the module loads, or ?run=1 to execute a full research pass' });
  }

  const t0 = Date.now();
  let result = null, error = null;
  try {
    const { researchForAudit } = await import('../agents/gtm/audit-research.js');
    result = await researchForAudit({ company: 'Roto-Rooter', website: 'rotorooter.com' });
  } catch (e) { error = e.message; }
  const ms = Date.now() - t0;

  const summary = result ? {
    confidence: result.confidence,
    pagesCrawled: result.pagesCrawled,
    techStack: result.techStack,
    opsSignals: result.opsSignals,
    sourcesFired: {
      site_crawl: !!(result.pagesCrawled && result.pagesCrawled.length),
      brave_web: !!result.web,
      apollo: !!result.firmographics,
      apify_maps: !!result.maps,
      linkedin: !!result.linkedin,
      claude_synthesis: !!result.summary,
    },
    webResultCount: result.web ? result.web.results.length : 0,
    foundCount: (result.found || []).length,
    found: result.found,
    prefillKeys: Object.keys(result.prefill || {}),
    hypothesesKeys: Object.keys(result.hypotheses || {}),
    summary: result.summary,
  } : null;

  return res.json({ env, ms, error, summary });
};

module.exports.config = { maxDuration: 60 };
