const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');
const { addEmailsToAudience } = require('./_meta-audience');
const { Client: QStashClient } = require('@upstash/qstash');

const SITE = 'https://www.tmi-technology.com';

// Admin "approve & enroll" for an identified visitor.
//   POST { id }  (or { ids: [...] })
// For each visitor with a work email:
//   - create/link a contact and a lead (source 'rb2b-visitor')
//   - schedule the email-only nurture (visitor_day0/3/7) via QStash -> /api/followup
//   - add the email to the Meta Custom Audience (Facebook/IG retargeting)
//   - mark the visitor enrolled
// No SMS is ever scheduled for these (no express consent / TCPA).
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  const body = req.body || {};
  const ids = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
  if (!ids.length) return res.status(400).json({ error: 'id or ids[] required' });

  const { data: visitors, error } = await db.from('site_visitors').select('*').in('id', ids);
  if (error) return res.status(500).json({ error: error.message });
  if (!visitors || !visitors.length) return res.status(404).json({ error: 'No visitors found' });

  const qstash = process.env.QSTASH_TOKEN ? new QStashClient({ token: process.env.QSTASH_TOKEN }) : null;
  const results = [];

  for (const v of visitors) {
    const email = v.email || v.personal_email;
    if (!email) { results.push({ id: v.id, skipped: 'no email' }); continue; }
    if (v.enrolled) { results.push({ id: v.id, skipped: 'already enrolled' }); continue; }

    // Suppression: don't cold-enroll your own team or anyone who opted out
    // (unless the admin explicitly forces it).
    const domain = email.includes('@') ? email.split('@')[1].toLowerCase() : '';
    if (!body.force && ['tmitechai.com', 'tmi-technology.com', 'arboroffice.io'].includes(domain)) {
      results.push({ id: v.id, skipped: 'own domain' }); continue;
    }
    if (!body.force) {
      const unsub = await db.from('leads').select('id').eq('email', email).eq('status', 'unsubscribed').maybeSingle();
      if (unsub.data) { results.push({ id: v.id, skipped: 'unsubscribed' }); continue; }
    }

    try {
      // 1. Contact (reuse linked contact, else upsert by email)
      let contactId = v.contact_id;
      if (!contactId) {
        const existing = await db.from('contacts').select('id').eq('email', email).maybeSingle();
        if (existing.data) {
          contactId = existing.data.id;
        } else {
          const { data: c } = await db.from('contacts').insert({
            first_name: v.first_name || 'Visitor',
            last_name:  v.last_name,
            email,
            company:    v.company,
            title:      v.title,
            niche:      v.industry,
            notes:      'Identified site visitor (RB2B)',
          }).select('id').single();
          contactId = c ? c.id : null;
        }
      }

      // 2. Lead
      const name = [v.first_name, v.last_name].filter(Boolean).join(' ') || v.company || 'Site visitor';
      const notes = JSON.stringify({
        company: v.company || '', title: v.title || '', industry: v.industry || '',
        linkedin: v.linkedin_url || '', last_page: v.last_page || '', source: 'rb2b-visitor',
        intro: v.ai_intro || '',
      });
      const { data: lead, error: lErr } = await db.from('leads').insert({
        contact_id: contactId, name, email, status: 'new', source: 'rb2b-visitor', notes,
      }).select('id').single();
      if (lErr) throw new Error('lead insert: ' + lErr.message);
      const leadId = lead.id;

      // 3. Email-only nurture via QStash
      let scheduled = 0;
      if (qstash) {
        const url = `${SITE}/api/followup`;
        for (const { delay, step } of [
          { delay: 60,     step: 'visitor_day0_email' },
          { delay: 259200, step: 'visitor_day3_email' },
          { delay: 604800, step: 'visitor_day7_email' },
        ]) {
          try { await qstash.publishJSON({ url, delay, body: { leadId, step } }); scheduled++; }
          catch (e) { console.error(`[visitor-enroll] QStash ${step}:`, e.message); }
        }
      }

      // 4. Facebook/Meta retargeting audience (best effort)
      const meta = await addEmailsToAudience([email]);

      // 5. Mark enrolled
      await db.from('site_visitors').update({
        contact_id: contactId, lead_id: leadId,
        enrolled: true, enrolled_at: new Date().toISOString(),
        synced_meta: meta.ok ? true : v.synced_meta,
        synced_meta_at: meta.ok ? new Date().toISOString() : v.synced_meta_at,
      }).eq('id', v.id);

      // 6. Timeline
      db.from('activities').insert({
        contact_id: contactId, lead_id: leadId, type: 'note',
        title: 'Enrolled identified visitor (email nurture + Meta audience)',
        body: [v.title, v.company, v.last_page].filter(Boolean).join(' · ') || null,
      }).then(() => {}).catch(() => {});

      results.push({ id: v.id, ok: true, lead_id: leadId, emails_scheduled: scheduled, meta: meta.ok });
    } catch (e) {
      console.error('[visitor-enroll] failed:', e.message);
      results.push({ id: v.id, error: e.message });
    }
  }

  const enrolled = results.filter(r => r.ok).length;
  return res.json({
    ok: true,
    enrolled,
    qstash: !!qstash,
    meta_warning: results.some(r => r.ok && !r.meta) ? 'Enrolled, but Meta audience push failed (check META_CAPI_ACCESS_TOKEN / audience id)' : undefined,
    results,
  });
};
