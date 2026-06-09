const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');
const { Resend } = require('resend');
const { renderIssue } = require('./_newsletter-render');

// Founders of the Future newsletter - admin compose/manage/send.
//   GET                     -> { issues:[...], subscriber_count }
//   POST {id?, title, subject, preheader, format, body, audience_tag}
//                           -> create or update a draft issue
//   POST {action:'send', id, test_email?}
//                           -> render + send via Resend (test = just that address)
//   DELETE ?id=             -> delete a draft

const SITE = 'https://www.tmitechai.com';
const FROM = 'Founders of the Future <support@tmitechai.com>';

async function getSubscribers(db, audienceTag) {
  let q = db.from('contacts').select('email,first_name,tags,audience').not('email', 'is', null).limit(50000);
  q = q.or('unsubscribed.is.null,unsubscribed.eq.false');
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  let rows = (data || []).filter(r => r.email && r.email.includes('@'));
  if (audienceTag) {
    rows = rows.filter(r => (Array.isArray(r.tags) && r.tags.includes(audienceTag)) || r.audience === audienceTag);
  }
  // de-dupe by email
  const seen = new Set();
  return rows.filter(r => { const e = r.email.toLowerCase(); if (seen.has(e)) return false; seen.add(e); return true; });
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    const { data: issues, error } = await db.from('newsletter_issues').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) return res.status(500).json({ error: error.message });
    let subscriber_count = 0;
    try { subscriber_count = (await getSubscribers(db)).length; } catch (e) { /* best effort */ }
    return res.json({ issues: issues || [], subscriber_count });
  }

  if (req.method === 'POST') {
    const body = req.body || {};

    // ---- SEND ----
    if (body.action === 'send') {
      if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: 'RESEND_API_KEY not set' });
      if (!body.id) return res.status(400).json({ error: 'id required' });
      const { data: issue, error } = await db.from('newsletter_issues').select('*').eq('id', body.id).single();
      if (error || !issue) return res.status(404).json({ error: 'Issue not found' });

      const resend = new Resend(process.env.RESEND_API_KEY);
      const subject = issue.subject || issue.title || 'Founders of the Future';

      // Test send: single address, doesn't change issue status.
      if (body.test_email) {
        const unsub = `${SITE}/api/nl-unsubscribe?e=${encodeURIComponent(body.test_email)}`;
        try {
          await resend.emails.send({ from: FROM, to: body.test_email, subject: `[TEST] ${subject}`, html: renderIssue(issue, unsub) });
          return res.json({ ok: true, test: true });
        } catch (e) { return res.status(502).json({ error: 'Send failed: ' + e.message }); }
      }

      let subs;
      try { subs = await getSubscribers(db, issue.audience_tag); }
      catch (e) { return res.status(500).json({ error: e.message }); }
      if (!subs.length) return res.json({ ok: true, sent: 0, note: 'No subscribers' });

      let sent = 0;
      for (let i = 0; i < subs.length; i += 100) {
        const batch = subs.slice(i, i + 100).map(s => {
          const unsub = `${SITE}/api/nl-unsubscribe?e=${encodeURIComponent(s.email)}`;
          return { from: FROM, to: s.email, subject, html: renderIssue(issue, unsub) };
        });
        try { await resend.batch.send(batch); sent += batch.length; }
        catch (e) { console.error('[newsletter] batch failed:', e.message); }
      }

      await db.from('newsletter_issues').update({ status: 'sent', sent_at: new Date().toISOString(), recipient_count: sent }).eq('id', issue.id);
      return res.json({ ok: true, sent });
    }

    // ---- CREATE / UPDATE ----
    const fields = {
      title: body.title || null, subject: body.subject || null, preheader: body.preheader || null,
      format: body.format || 'standard', body: body.body || null, audience_tag: body.audience_tag || null,
      updated_at: new Date().toISOString(),
    };
    if (body.id) {
      const { data, error } = await db.from('newsletter_issues').update(fields).eq('id', body.id).select('*').single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }
    const { data, error } = await db.from('newsletter_issues').insert(fields).select('*').single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await db.from('newsletter_issues').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
