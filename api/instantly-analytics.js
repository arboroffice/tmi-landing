// Instantly campaign analytics for the admin command center (deliverability + funnel).

const { cors, requireAuth } = require('./_auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  const key = process.env.INSTANTLY_API_KEY;
  const cid = process.env.INSTANTLY_CAMPAIGN_ID;
  if (!key || !cid) return res.json({ configured: false });

  try {
    const r = await fetch(`https://api.instantly.ai/api/v2/campaigns/analytics?id=${encodeURIComponent(cid)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) return res.status(502).json({ configured: true, error: `Instantly ${r.status}` });
    const data = await r.json();
    const a = Array.isArray(data) ? data[0] : (data.items ? data.items[0] : data);
    // Normalize the common metric names Instantly returns.
    const pick = (...keys) => { for (const k of keys) if (a && a[k] != null) return a[k]; return null; };
    return res.json({
      configured: true,
      sent: pick('emails_sent_count', 'sent', 'sent_count'),
      opened: pick('open_count', 'opened', 'unique_opens'),
      replied: pick('reply_count', 'replied', 'replies'),
      bounced: pick('bounced_count', 'bounce_count', 'bounced'),
      leads: pick('leads_count', 'total_leads', 'leads'),
      opportunities: pick('total_opportunities', 'opportunities'),
      raw: a || data,
    });
  } catch (e) {
    return res.status(500).json({ configured: true, error: e.message });
  }
};
