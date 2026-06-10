const db = require('./_db');
const { verifyToken, cors } = require('./_auth');
const { Resend } = require('resend');
const { scoreVisitor } = require('./_visitor-score');

// Weekly identified-visitor digest. Emails the owner a summary of the last 7
// days: top accounts, hottest visitors, recommended actions.
// Triggered by Vercel Cron (Mondays) or manually with an admin JWT / ?secret=CRON_SECRET.

const OWNER_EMAIL = 'support@tmitechai.com';
const SITE = 'https://www.tmi-technology.com';
const ADMIN = 'https://admin.tmitechai.com/admin-visitors';

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const isCron = !!req.headers['x-vercel-cron'];
  const secret = process.env.CRON_SECRET;
  const okSecret = secret && req.query.secret === secret;
  if (!isCron && !okSecret && !verifyToken(req)) return res.status(401).json({ error: 'Unauthorized' });

  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  let data;
  try {
    data = await db.list('site_visitors', {
      where: [['last_seen', '>=', since]],
      order: 'last_seen', ascending: false, limit: 2000,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const visitors = (data || []).map(v => ({ ...v, _score: v.score || scoreVisitor(v).score }));
  if (!visitors.length) {
    return res.json({ ok: true, sent: false, note: 'No visitors in the last 7 days' });
  }

  // Top accounts by company
  const byCo = {};
  for (const v of visitors) {
    const k = v.company || v.company_domain || '(unknown)';
    (byCo[k] = byCo[k] || { count: 0, top: 0 }).count++;
    byCo[k].top = Math.max(byCo[k].top, v._score);
  }
  const topAccounts = Object.entries(byCo).sort((a, b) => b[1].top - a[1].top || b[1].count - a[1].count).slice(0, 8);
  const hot = [...visitors].sort((a, b) => b._score - a._score).slice(0, 10);
  const enrolled = visitors.filter(v => v.enrolled).length;

  const row = (l, r) => `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:13px">${l}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:right;font-weight:600">${r}</td></tr>`;
  const hotRows = hot.map(v => {
    const name = [v.first_name, v.last_name].filter(Boolean).join(' ') || '(no name)';
    return row(`${name}${v.company ? ' · ' + v.company : ''}${v.title ? ' · ' + v.title : ''}`, v._score);
  }).join('');
  const acctRows = topAccounts.map(([co, m]) => row(co, `${m.count} visit${m.count === 1 ? '' : 's'} · top ${m.top}`)).join('');

  const html = `<!DOCTYPE html><html><body style="background:#fff;font-family:Arial,sans-serif;color:#111;max-width:620px;margin:0 auto;padding:32px 24px;line-height:1.6;">
<p style="margin:0 0 4px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">TMI · Weekly Visitor Digest</p>
<h2 style="margin:0 0 16px;font-size:22px;">${visitors.length} identified visitor${visitors.length === 1 ? '' : 's'} this week</h2>
<p style="font-size:14px;color:#444;margin:0 0 20px;">${enrolled} enrolled · ${visitors.length - enrolled} awaiting review.</p>
<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.1em;color:#888;margin:24px 0 8px;">Hottest visitors</h3>
<table width="100%" style="border-collapse:collapse;background:#fafafa;border-radius:8px;overflow:hidden;">${hotRows}</table>
<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.1em;color:#888;margin:24px 0 8px;">Top accounts</h3>
<table width="100%" style="border-collapse:collapse;background:#fafafa;border-radius:8px;overflow:hidden;">${acctRows}</table>
<p style="margin:28px 0 0;"><a href="${ADMIN}" style="display:inline-block;background:#E4FF97;color:#0a0b14;font-weight:700;font-size:14px;padding:12px 28px;border-radius:999px;text-decoration:none;">Review &amp; enroll &rarr;</a></p>
<p style="margin:28px 0 0;font-size:12px;color:#aaa;">${SITE}</p>
</body></html>`;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({ from: 'TMI <support@tmitechai.com>', to: OWNER_EMAIL, subject: `Visitor digest: ${visitors.length} this week, ${hot.length ? 'top score ' + hot[0]._score : ''}`, html });
  } catch (e) {
    return res.status(502).json({ error: 'Email failed: ' + e.message });
  }

  return res.json({ ok: true, sent: true, visitors: visitors.length, top_accounts: topAccounts.length });
};
