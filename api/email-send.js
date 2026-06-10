const db = require('./_db');
const { requireAuth, cors } = require('./_auth');
const { Resend } = require('resend');

// Chunk an array into groups of `size` (Firestore 'in' supports up to 30 values).
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Best-effort per-send log. Never throws so a logging failure can't break a send.
async function logSend(fields) {
  try { await db.insert('email_sends', fields); }
  catch (e) { console.error('[email-send] log:', e.message); }
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return res.status(503).json({ error: 'RESEND_API_KEY not configured' });

  const { campaign_id } = req.body || {};
  if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });

  // Fetch campaign
  let campaign;
  try { campaign = await db.getById('email_campaigns', campaign_id); }
  catch (e) { return res.status(404).json({ error: 'Campaign not found' }); }
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.status === 'sent') return res.status(409).json({ error: 'Campaign already sent' });

  // Fetch recipients
  let contacts = [];
  try {
    if (campaign.audience_type === 'all') {
      // Firestore can't express .neq('email',null); fetch unsubscribed===false then
      // drop rows without an email in JS. Large read - up to 50000 contacts.
      const data = await db.list('contacts', { where: [['unsubscribed', '==', false]], limit: 50000 });
      contacts = (data || []).filter(c => c.email);
    } else if (campaign.audience_type === 'segment') {
      const f = campaign.audience_filter || {};
      // Pull the unsubscribed===false set (large read, up to 50000) then apply the
      // audience/niche filters and the not-null email check in JS - replaces the
      // .in('audience',...) / .in('niche',...) chained queries.
      let data = await db.list('contacts', { where: [['unsubscribed', '==', false]], limit: 50000 });
      data = (data || []).filter(c => c.email);
      if (f.audiences?.length) data = data.filter(c => f.audiences.includes(c.audience));
      if (f.niches?.length) data = data.filter(c => f.niches.includes(c.niche));
      contacts = data;
    } else if (campaign.audience_type === 'custom') {
      const raw = campaign.audience_filter?.custom_emails || '';
      const emails = raw.split(/[\n,]/).map(e => e.trim().toLowerCase()).filter(Boolean);
      // .in('email', emails) -> chunk into groups of 30 and concat. unsubscribed
      // filtered in JS so the chunked query stays a single-field 'in'.
      let data = [];
      for (const c of chunk(emails, 30)) {
        const rows = await db.list('contacts', { where: [['email', 'in', c]] });
        data = data.concat(rows || []);
      }
      data = data.filter(c => c.unsubscribed === false);
      const found = new Set(data.map(c => c.email));
      // Include raw email addresses not in contacts DB
      const extras = [];
      emails.forEach(e => { if (!found.has(e)) extras.push({ id: null, email: e, first_name: '' }); });
      contacts = [...data, ...extras];
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  if (!contacts.length) {
    return res.status(400).json({ error: 'No contacts match this audience' });
  }

  // Mark as sending
  await db.update('email_campaigns', campaign_id, { status: 'sending' });

  const resend = new Resend(resendKey);
  const unsubUrl = `https://tmi-technology.com/api/unsubscribe?id=`;
  let sent = 0;
  let failed = 0;
  const errors = [];

  // Send in batches of 10 (Resend free tier rate limit)
  const BATCH = 10;
  for (let i = 0; i < contacts.length; i += BATCH) {
    const batch = contacts.slice(i, i + BATCH);
    await Promise.all(batch.map(async contact => {
      const firstName = contact.first_name || 'there';
      const unsubLink = unsubUrl + (contact.id || contact.email);
      const bodyWithFooter = `${campaign.body}\n\n---\nTo unsubscribe, click here: ${unsubLink}`;

      try {
        await resend.emails.send({
          from: `${campaign.from_name} <${campaign.from_email}>`,
          to: contact.email,
          reply_to: campaign.reply_to || undefined,
          subject: campaign.subject,
          text: bodyWithFooter
        });

        // Log send
        if (contact.id) {
          await logSend({
            campaign_id,
            contact_id: contact.id,
            email: contact.email,
            status: 'sent'
          });
        }
        sent++;
      } catch (e) {
        failed++;
        errors.push({ email: contact.email, error: e.message });
        if (contact.id) {
          await logSend({
            campaign_id,
            contact_id: contact.id,
            email: contact.email,
            status: 'failed'
          });
        }
      }
    }));

    // Small pause between batches to avoid rate limits
    if (i + BATCH < contacts.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // Update campaign status
  await db.update('email_campaigns', campaign_id, {
    status: failed > 0 && sent === 0 ? 'failed' : 'sent',
    sent_count: sent,
    sent_at: new Date().toISOString()
  });

  return res.json({ ok: true, sent, failed, errors: errors.slice(0, 5) });
};
