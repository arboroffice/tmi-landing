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

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5ef;-webkit-font-smoothing:antialiased;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5ef;"><tr><td align="center" style="padding:28px 14px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid #e7e8e1;border-radius:16px;overflow:hidden;"><tr><td style="background:#0a0b14;padding:18px 30px;"><span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">TMI</span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#E4FF97;margin-left:5px;"></span></td></tr><tr><td style="padding:34px 30px 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.7;">
<p style="margin:0 0 4px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">TMI · Weekly Visitor Digest</p>
<h2 style="margin:0 0 16px;font-size:22px;">${visitors.length} identified visitor${visitors.length === 1 ? '' : 's'} this week</h2>
<p style="font-size:14px;color:#444;margin:0 0 20px;">${enrolled} enrolled · ${visitors.length - enrolled} awaiting review.</p>
<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.1em;color:#888;margin:24px 0 8px;">Hottest visitors</h3>
<table width="100%" style="border-collapse:collapse;background:#fafafa;border-radius:8px;overflow:hidden;">${hotRows}</table>
<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.1em;color:#888;margin:24px 0 8px;">Top accounts</h3>
<table width="100%" style="border-collapse:collapse;background:#fafafa;border-radius:8px;overflow:hidden;">${acctRows}</table>
<p style="margin:28px 0 0;"><a href="${ADMIN}" style="display:inline-block;background:#E4FF97;color:#0a0b14;font-weight:700;font-size:14px;padding:12px 28px;border-radius:999px;text-decoration:none;">Review &amp; enroll &rarr;</a></p>
<p style="margin:28px 0 0;font-size:12px;color:#aaa;">${SITE}</p>
</td></tr><tr><td style="padding:6px 30px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><div style="border-top:1px solid #eceee4;margin-top:8px;padding-top:16px;font-size:12px;line-height:1.6;color:#9a9ba5;">TMI Technology &middot; chaos control for growing companies<br><a href="https://www.tmitechai.com" style="color:#6f8f2a;text-decoration:none;">tmitechai.com</a></div></td></tr></table></td></tr></table></body></html>`;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({ from: 'TMI <support@tmitechai.com>', to: OWNER_EMAIL, subject: `Visitor digest: ${visitors.length} this week, ${hot.length ? 'top score ' + hot[0]._score : ''}`, html });
  } catch (e) {
    return res.status(502).json({ error: 'Email failed: ' + e.message });
  }

  return res.json({ ok: true, sent: true, visitors: visitors.length, top_accounts: topAccounts.length });
};
