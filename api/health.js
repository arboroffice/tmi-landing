const { cors, verifyToken } = require('./_auth');
const db = require('./_db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authed = !!verifyToken(req);
  const hasCreds = !!(process.env.FIREBASE_SERVICE_ACCOUNT || '');

  let firestore_connect = 'not tested';
  let firestore_error = null;
  let visitors_table = 'not tested';
  try {
    await db.list('contacts', { limit: 1 });
    firestore_connect = 'ok';

    // RB2B pipeline: is the site_visitors collection reachable?
    try {
      await db.list('site_visitors', { limit: 1 });
      visitors_table = 'ok';
    } catch (ve) {
      visitors_table = 'missing';
    }
  } catch (e) {
    firestore_connect = 'client_error';
    firestore_error = e.message;
  }

  return res.json({
    db_backend:               'firestore',
    firebase_service_account: hasCreds,
    firestore_connect,
    firestore_error,
    // Back-compat aliases so the admin status badge (reads supabase_connect) keeps working.
    supabase_connect:         firestore_connect,
    supabase_error:           firestore_error,
    visitors_table,
    // Env-presence flags are reconnaissance-sensitive: only for authenticated admins.
    ...(authed ? {
      next_public_url:          hasCreds,
      jwt_secret:               !!process.env.JWT_SECRET,
      admin_password:           !!process.env.ADMIN_PASSWORD,
      // TMI OS production readiness
      os_secrets_key:           !!process.env.OS_SECRETS_KEY,
      os_cron_secret:           !!process.env.CRON_SECRET,
      stripe:                   !!process.env.STRIPE_SECRET_KEY,
      resend:                   !!process.env.RESEND_API_KEY,
      anthropic:                !!process.env.ANTHROPIC_API_KEY,
      openai:                   !!process.env.OPENAI_API_KEY,
      rb2b_webhook_secret:      !!process.env.RB2B_WEBHOOK_SECRET,
      meta_capi_token:          !!process.env.META_CAPI_ACCESS_TOKEN,
      meta_custom_audience_id:  !!process.env.META_CUSTOM_AUDIENCE_ID,
      meta_ad_account_id:       !!process.env.META_AD_ACCOUNT_ID,
    } : {}),
  });
};
