const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');
const { getAutomationSettings } = require('./_visitor-settings');

// Read-only status for the admin Visitors page: which integrations are wired
// (env presence only — never the secret values), the current automation
// settings, and pipeline counts. Lets the operator confirm the RB2B pipeline is
// "set up right" without leaving the admin subdomain.

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  const has = (k) => !!process.env[k];
  const integrations = {
    rb2b_secret:   has('RB2B_WEBHOOK_SECRET'),                                  // authenticates the inbound webhook
    qstash:        has('QSTASH_TOKEN'),                                         // queues the automation job
    cron_secret:   has('CRON_SECRET'),                                          // authenticates the automation job
    apollo:        has('APOLLO_API_KEY'),                                       // enrichment + buying committee
    anthropic:     has('ANTHROPIC_API_KEY'),                                    // AI first-touch drafts
    meta_audience: has('META_CAPI_ACCESS_TOKEN') && (has('META_CUSTOM_AUDIENCE_ID') || has('META_AD_ACCOUNT_ID')),
    resend:        has('RESEND_API_KEY'),                                       // outbound email
    twilio:        has('TWILIO_ACCOUNT_SID') && has('TWILIO_AUTH_TOKEN'),       // hot-visitor SMS alerts
  };

  // Automation can only fully run end-to-end when these are all present.
  const automationReady = integrations.qstash && integrations.cron_secret;
  const outboundReady = integrations.resend;

  const settings = await getAutomationSettings(db);

  const count = async (mut) => {
    let q = db.from('site_visitors').select('id', { count: 'exact', head: true });
    if (mut) q = mut(q);
    const { count } = await q;
    return count || 0;
  };

  let pipeline = {};
  try {
    const [total, enrolled, hot, enriched] = await Promise.all([
      count(),
      count(q => q.eq('enrolled', true)),
      count(q => q.gte('score', 70)),
      count(q => q.not('enrichment', 'is', null)),
    ]);
    const recent = await db.from('site_visitors').select('last_seen').order('last_seen', { ascending: false }).limit(1).maybeSingle();
    pipeline = {
      total, enrolled, hot, enriched,
      awaiting: total - enrolled,
      last_ingest: recent && recent.data ? recent.data.last_seen : null,
    };
  } catch (e) {
    pipeline = { error: e.message };
  }

  return res.json({
    ok: true,
    integrations,
    automation_ready: automationReady,
    outbound_ready: outboundReady,
    webhook_url: 'https://www.tmi-technology.com/api/rb2b-webhook',
    settings,
    pipeline,
  });
};
