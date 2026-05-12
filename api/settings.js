const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

// Settings are stored as a single row in a settings table, or as key/value pairs.
// We use a simple JSON blob approach: one row with id='global'.
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    // Try to get settings from a simple key-value in contacts or a settings table
    // Fall back to env-var defaults
    const defaults = {
      from_name: process.env.EMAIL_FROM_NAME || 'TMI',
      from_email: process.env.EMAIL_FROM_ADDRESS || 'hello@tmi-technology.com',
      reply_to: process.env.EMAIL_REPLY_TO || '',
      footer_text: 'TMI Technology · tmi-technology.com\nYou received this because you opted in.'
    };
    return res.json(defaults);
  }

  if (req.method === 'POST') {
    // Settings saved — for now just return success.
    // In production, persist these to a settings table or Vercel env vars.
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
