const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');
const { Resend } = require('resend');

// Founders of the Future newsletter - admin compose/manage/send.
//   GET                     -> { issues:[...], subscriber_count }
//   POST {id?, title, subject, preheader, format, body, audience_tag}
//                           -> create or update a draft issue
//   POST {action:'send', id, test_email?}
//                           -> render + send via Resend (test = just that address)
//   DELETE ?id=             -> delete a draft

const SITE = 'https://www.tmitechai.com';
const FROM = 'Founders of the Future <support@tmitechai.com>';

function bodyToHtml(body) {
  const s = (body || '').trim();
  if (!s) return '';
  if (/<(p|div|h[1-6]|ul|ol|table|img|a|br|blockquote)\b/i.test(s)) return s; // already HTML
  return s.split(/\n{2,}/).map(p => `<p style="margin:0 0 18px;">${p.trim().replace(/\n/g, '<br>')}</p>`).join('');
}

function renderIssue(issue, unsubUrl) {
  const content = bodyToHtml(issue.body);
  const fmt = issue.format || 'standard';
  const kicker = `<p style="margin:0 0 6px;font-size:11px;color:#8a8f9c;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">Founders of the Future</p>`;
  const cta = `<p style="margin:28px 0 0;"><a href="${SITE}/audit" style="display:inline-block;background:#E4FF97;color:#0a0b14;font-weight:700;font-size:14px;padding:13px 28px;border-radius:999px;text-decoration:none;">Get your free audit &rarr;</a></p>`;

  let head;
  if (fmt === 'long-read') {
    head = `${kicker}<h1 style="margin:0 0 24px;font-size:34px;font-weight:800;letter-spacing:-0.02em;line-height:1.1;">${issue.title || ''}</h1>`;
  } else if (fmt === 'announcement') {
    head = `<div style="text-align:center;">${kicker}<h1 style="margin:0 0 20px;font-size:32px;font-weight:800;letter-spacing:-0.02em;line-height:1.1;">${issue.title || ''}</h1></div>`;
  } else if (fmt === 'digest') {
    head = `${kicker}<h2 style="margin:0 0 20px;font-size:24px;font-weight:800;letter-spacing:-0.01em;">${issue.title || ''}</h2><div style="height:1px;background:#eee;margin:0 0 20px;"></div>`;
  } else { // standard
    head = `${kicker}<h1 style="margin:0 0 22px;font-size:28px;font-weight:800;letter-spacing:-0.02em;line-height:1.12;">${issue.title || ''}</h1>`;
  }

  const align = fmt === 'announcement' ? 'text-align:center;' : '';
  return `<!DOCTYPE html><html><body style="margin:0;background:#f5f5f7;">
<div style="max-width:600px;margin:0 auto;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.7;padding:40px 32px;${align}">
${head}
<div style="font-size:16px;color:#333;">${content}</div>
${fmt === 'announcement' || fmt === 'standard' ? cta : ''}
<div style="margin:40px 0 0;border-top:1px solid #eee;padding-top:16px;font-size:11px;color:#aaa;line-height:1.6;text-align:left;">
TMI Technology &middot; AI infrastructure for intelligent companies<br>
<a href="${unsubUrl}" style="color:#aaa;">Unsubscribe</a>
</div>
</div></body></html>`;
}

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
