const { getSupabase } = require('./_supabase');
const { renderIssue, SITE } = require('./_newsletter-render');

// Public archive ("the vault") for Founders of the Future.
// Only issues with status 'sent' are ever exposed - drafts and tests stay private.
//   GET            -> { issues: [{id,title,subject,sent_at,format}] } (newest first)
//   GET ?id=<id>   -> the rendered letter as a standalone HTML page
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  const { id } = req.query;
  if (id) {
    const { data: issue } = await db.from('newsletter_issues').select('*').eq('id', id).eq('status', 'sent').maybeSingle();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!issue) return res.status(404).send('<!doctype html><meta charset="utf-8"><body style="font-family:Arial;max-width:480px;margin:80px auto;text-align:center;color:#555;">That issue is not available.<br><a href="/founders-vault" style="color:#0a7a3a;">Back to the vault</a></body>');
    return res.status(200).send(renderIssue(issue, SITE + '/api/nl-unsubscribe'));
  }

  const { data, error } = await db.from('newsletter_issues')
    .select('id,title,subject,sent_at,format').eq('status', 'sent')
    .order('sent_at', { ascending: false }).limit(500);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ issues: data || [] });
};
