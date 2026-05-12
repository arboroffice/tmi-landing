const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');
const { Resend } = require('resend');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return res.status(503).json({ error: 'RESEND_API_KEY not configured' });

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  const { campaign_id } = req.body || {};
  if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });

  // Fetch campaign
  const { data: campaign, error: ce } = await db
    .from('email_campaigns')
    .select('*')
    .eq('id', campaign_id)
    .single();
  if (ce || !campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.status === 'sent') return res.status(409).json({ error: 'Campaign already sent' });

  // Fetch recipients
  let contacts = [];
  if (campaign.audience_type === 'all') {
    const { data } = await db.from('contacts').select('id, email, first_name, last_name').neq('email', null).eq('unsubscribed', false);
    contacts = (data || []).filter(c => c.email);
  } else if (campaign.audience_type === 'segment') {
    const f = campaign.audience_filter || {};
    let query = db.from('contacts').select('id, email, first_name, last_name, audience, niche').neq('email', null).eq('unsubscribed', false);
    if (f.audiences?.length) query = query.in('audience', f.audiences);
    if (f.niches?.length) query = query.in('niche', f.niches);
    const { data } = await query;
    contacts = (data || []).filter(c => c.email);
  } else if (campaign.audience_type === 'custom') {
    const raw = campaign.audience_filter?.custom_emails || '';
    const emails = raw.split(/[\n,]/).map(e => e.trim().toLowerCase()).filter(Boolean);
    const { data } = await db.from('contacts').select('id, email, first_name').in('email', emails).eq('unsubscribed', false);
    const found = new Set((data || []).map(c => c.email));
    // Include raw email addresses not in contacts DB
    emails.forEach(e => { if (!found.has(e)) contacts.push({ id: null, email: e, first_name: '' }); });
    contacts = [...(data || []), ...contacts.filter(c => !c.id)];
  }

  if (!contacts.length) {
    return res.status(400).json({ error: 'No contacts match this audience' });
  }

  // Mark as sending
  await db.from('email_campaigns').update({ status: 'sending' }).eq('id', campaign_id);

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
          await db.from('email_sends').insert({
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
          await db.from('email_sends').insert({
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
  await db.from('email_campaigns').update({
    status: failed > 0 && sent === 0 ? 'failed' : 'sent',
    sent_count: sent,
    sent_at: new Date().toISOString()
  }).eq('id', campaign_id);

  return res.json({ ok: true, sent, failed, errors: errors.slice(0, 5) });
};
