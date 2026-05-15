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

  // Schedule 10-minute nudge via QStash
  try {
    const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN });
    await qstash.publishJSON({
      url: `${SITE}/api/audit-nudge`,
      delay: 600, // 10 minutes
      body: { leadId, name, email, phone, company },
    });
  } catch (e) {
    console.error('QStash schedule:', e.message);
  }

  return res.status(200).json({ ok: true, leadId });
};
