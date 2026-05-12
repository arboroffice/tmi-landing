const { cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseOk = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
  const resendOk   = !!process.env.RESEND_API_KEY;
  const authOk     = !!(process.env.ADMIN_PASSWORD && process.env.JWT_SECRET);

  return res.json({ supabase: supabaseOk, resend: resendOk, auth: authOk });
};
