const db = require('./_db');
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

  const settings = await getAutomationSettings();

  let pipeline = {};
  try {
    // Firestore has no count() aggregate here, so pull the rows and tally in JS.
    // Limit is generous; counts are advisory health stats for the admin page.
    const rows = await db.list('site_visitors', { limit: 10000 });
    const total = rows.length;
    const enrolled = rows.filter(r => r.enrolled === true).length;
    const hot = rows.filter(r => (r.score || 0) >= 70).length;
    const enriched = rows.filter(r => r.enrichment != null).length;
    let last_ingest = null;
    for (const r of rows) {
      if (r.last_seen && (!last_ingest || String(r.last_seen) > String(last_ingest))) last_ingest = r.last_seen;
    }
    pipeline = {
      total, enrolled, hot, enriched,
      awaiting: total - enrolled,
      last_ingest,
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
