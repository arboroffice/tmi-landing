const { getSupabase } = require('./_supabase');
const { cors } = require('./_auth');
const { Client: QStashClient } = require('@upstash/qstash');

const SITE = 'https://www.tmitechai.com';

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { name, email, phone, company } = req.body || {};
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'email required' });

  let leadId = null;
  try {
    const db = getSupabase();
    const { data: lead } = await db.from('leads')
      .upsert({
        name: name || null,
        email: email.toLowerCase().trim(),
        phone: phone || null,
        status: 'audit_started',
        notes: JSON.stringify({ company, audit_started_at: new Date().toISOString(), nudge_sent: false }),
      }, { onConflict: 'email' })
      .select()
      .single();
    if (lead) leadId = lead.id;
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
