const { createClient } = require('@supabase/supabase-js');

// Accept either env var name. Different endpoints historically used
// SUPABASE_SERVICE_KEY vs SUPABASE_SERVICE_ROLE_KEY; tolerating both prevents
// a read/write split where, e.g., audits write under one name but the admin
// reads under the other (which silently empties the Audits tab).
function getServiceKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

// Accept either URL name too — the Vercel/Supabase integration provisions
// NEXT_PUBLIC_SUPABASE_URL, while this codebase historically used SUPABASE_URL.
function getUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function getSupabase() {
  const url = getUrl();
  const key = getServiceKey();
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

module.exports = { getSupabase, getServiceKey, getUrl };
