const { cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  return res.json({
    supabase_url:          !!process.env.SUPABASE_URL,
    supabase_service_key:  !!process.env.SUPABASE_SERVICE_KEY,
    supabase_role_key:     !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    jwt_secret:            !!process.env.JWT_SECRET,
    admin_password:        !!process.env.ADMIN_PASSWORD,
    resend:                !!process.env.RESEND_API_KEY,
    anthropic:             !!process.env.ANTHROPIC_API_KEY,
    openai:                !!process.env.OPENAI_API_KEY,
  });
};
