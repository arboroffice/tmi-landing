const db = require('./_db');
const { cors } = require('./_auth');
const { Client: QStashClient } = require('@upstash/qstash');

const SITE = 'https://www.tmitechai.com';

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { name, email, phone, company, intent } = req.body || {};
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'email required' });

  // intent 'book' = they chose "skip the audit and book a call." We still create
  // the lead so booking-confirmed can match them by email, and the pre-call
  // sequence (api/followup) texts them to finish the 5-min audit before the call.
  const skippedToBook = intent === 'book';

  let leadId = null;
  try {
    const lead = await db.upsertByField('leads', 'email', email.toLowerCase().trim(), {
      name: name || null,
      email: email.toLowerCase().trim(),
      phone: phone || null,
      status: skippedToBook ? 'audit_skipped' : 'audit_started',
      notes: JSON.stringify({
        company,
        audit_started_at: new Date().toISOString(),
        nudge_sent: false,
        ...(skippedToBook ? { booking_intent: true } : {}),
      }),
    });
    if (lead) leadId = lead.id;

    // Also subscribe them to Field Notes (tag the contact). We never
    // touch `unsubscribed`, so anyone who previously opted out stays opted out.
    try {
      const em = email.toLowerCase().trim();
      const ex = await db.findOne('contacts', 'email', em);
      const tags = Array.isArray(ex && ex.tags) ? ex.tags.slice() : [];
      if (!tags.includes('founders-of-the-future')) tags.push('founders-of-the-future');
      if (!tags.includes('audit')) tags.push('audit');
      const first = (name || '').trim().split(' ')[0] || em.split('@')[0];
      const last = (name && name.trim().includes(' ')) ? name.trim().split(' ').slice(1).join(' ') : null;
      await db.upsertByField('contacts', 'email', em,
        { first_name: first, last_name: last, email: em, company: company || null, tags }
      );
    } catch (e) { console.error('audit-start fotf subscribe:', e.message); }
  } catch (e) {
    console.error('audit-start db:', e.message);
  }

  // Schedule the abandon-chaser sequence via QStash. Each step no-ops once the
  // audit is completed, the lead converts/books, or unsubscribes (see audit-nudge.js).
  try {
    const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN });
    const nudgeUrl = `${SITE}/api/audit-nudge`;
    const schedule = [
      { delay: 600,    step: 'abandon_10min' }, // 10 min — finish the audit
      { delay: 86400,  step: 'abandon_day1' },  // 1 day  — text the booking link, still push the audit
      { delay: 259200, step: 'abandon_day3' },  // 3 days — final touch, both doors
    ];
    for (const { delay, step } of schedule) {
      qstash.publishJSON({ url: nudgeUrl, delay, body: { leadId, name, email, phone, company, step } })
        .catch(e => console.error(`QStash nudge ${step}:`, e.message));
    }
  } catch (e) {
    console.error('QStash schedule:', e.message);
  }

  return res.status(200).json({ ok: true, leadId });
};
