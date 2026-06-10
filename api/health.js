const { cors } = require('./_auth');
const db = require('./_db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = process.env.FIREBASE_SERVICE_ACCOUNT || '';

  let supabase_connect = 'not tested';
  let supabase_error = null;
  let visitors_table = 'not tested';
  try {
    await db.list('contacts', { limit: 1 });
    supabase_connect = 'ok';

    // RB2B pipeline: is the site_visitors collection reachable?
    try {
      await db.list('site_visitors', { limit: 1 });
      visitors_table = 'ok';
    } catch (ve) {
      visitors_table = 'missing';
    }
  } catch (e) {
    supabase_connect = 'client_error';
    supabase_error = e.message;
  }

  return res.json({
    supabase_url:          !!url,
    supabase_url_value:    'firestore',
    supabase_service_key:  !!url,
    supabase_connect,
    supabase_error,
    supabase_role_key:     !!url,
    next_public_url:       !!url,
    jwt_secret:            !!process.env.JWT_SECRET,
    admin_password:        !!process.env.ADMIN_PASSWORD,
    resend:                !!process.env.RESEND_API_KEY,
    anthropic:             !!process.env.ANTHROPIC_API_KEY,
    openai:                !!process.env.OPENAI_API_KEY,

    // RB2B visitor-identification pipeline
    visitors_table,
    rb2b_webhook_secret:     !!process.env.RB2B_WEBHOOK_SECRET,
    meta_capi_token:         !!process.env.META_CAPI_ACCESS_TOKEN,
    meta_custom_audience_id: !!process.env.META_CUSTOM_AUDIENCE_ID,
    meta_ad_account_id:      !!process.env.META_AD_ACCOUNT_ID,
  });
};
