const { cors } = require('./_auth');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_KEY || '';

  let supabase_connect = 'not tested';
  let supabase_error = null;
  try {
    const db = createClient(url, key);
    const { error } = await db.from('contacts').select('id').limit(1);
    supabase_connect = error ? 'query_error' : 'ok';
    if (error) supabase_error = error.message;
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
    jwt_secret:            !!process.env.JWT_SECRET,
    admin_password:        !!process.env.ADMIN_PASSWORD,
    resend:                !!process.env.RESEND_API_KEY,
    anthropic:             !!process.env.ANTHROPIC_API_KEY,
    openai:                !!process.env.OPENAI_API_KEY,
  });
};
