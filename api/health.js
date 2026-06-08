const { cors } = require('./_auth');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  let supabase_connect = 'not tested';
  let supabase_error = null;
  let visitors_table = 'not tested';
  try {
    const db = createClient(url, key);
    const { error } = await db.from('contacts').select('id').limit(1);
    supabase_connect = error ? 'query_error' : 'ok';
    if (error) supabase_error = error.message;

    // RB2B pipeline: does the site_visitors table exist yet?
    const v = await db.from('site_visitors').select('id').limit(1);
    visitors_table = v.error ? 'missing' : 'ok';
  } catch (e) {
    supabase_connect = 'client_error';
    supabase_error = e.message;
  }

  return res.json({
    supabase_url:          !!url,
    supabase_url_value:    url.slice(0, 30) + (url.length > 30 ? '...' : ''),
    supabase_service_key:  !!key,
    supabase_connect,
    supabase_error,
    supabase_role_key:     !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    next_public_url:       !!process.env.NEXT_PUBLIC_SUPABASE_URL,
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
