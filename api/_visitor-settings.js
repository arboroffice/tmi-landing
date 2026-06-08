// Visitor-automation settings. Stored as a single os_kv row (key
// 'visitor_automation') so the admin Visitors page can tune the pipeline
// without a deploy. Server-side callers (webhook, visitor-process) read it
// straight from Supabase; the admin UI reads/writes it through /api/os-kv.

const KEY = 'visitor_automation';

const DEFAULTS = {
  enabled: true,            // master switch for all automation
  auto_enrich: true,        // auto-run Apollo enrichment
  enrich_min_score: 40,     // ... for visitors at/above this score
  auto_outbound: true,      // auto-enroll into the email nurture + Meta audience
  outbound_min_score: 70,   // ... for visitors at/above this score (ICP bar)
  require_work_email: true, // outbound only to a real work email (not personal)
};

// Merge stored settings over the defaults. `db` is a Supabase client.
async function getAutomationSettings(db) {
  try {
    const { data } = await db.from('os_kv').select('value').eq('key', KEY).maybeSingle();
    const v = (data && data.value) || {};
    return { ...DEFAULTS, ...v };
  } catch {
    return { ...DEFAULTS };
  }
}

module.exports = { getAutomationSettings, VISITOR_AUTOMATION_KEY: KEY, VISITOR_AUTOMATION_DEFAULTS: DEFAULTS };
