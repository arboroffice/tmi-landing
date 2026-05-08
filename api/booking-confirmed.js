const { createClient } = require('@supabase/supabase-js');
const twilio = require('twilio');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const SITE = 'https://www.tmi-technology.com';

function formatPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  return digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body || {};
  const attendees = body?.payload?.attendees || [];
  const email = attendees[0]?.email;
  const startTime = body?.payload?.startTime;

  if (!email) return res.status(400).json({ error: 'No email in payload' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: lead } = await supabase
    .from('leads')
    .update({ status: 'booked', booked_at: new Date().toISOString() })
    .eq('email', email.toLowerCase())
    .select()
    .single();

  if (!lead) {
    console.log('No lead found for:', email);
    return res.status(200).json({ ok: true, note: 'No matching lead' });
  }

  const firstName = lead.name.split(' ')[0];
  const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  // Confirmation SMS to lead
  if (lead.phone) {
    sms.messages.create({
      body: `You're confirmed, ${firstName}. We'll talk then. If anything comes up before, reply here.`,
      from: FROM_NUMBER,
      to: formatPhone(lead.phone),
    }).catch(e => console.error('Confirmation SMS error:', e));
  }

  // Internal alert
  const dateStr = startTime
    ? new Date(startTime).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'TBD';

  sms.messages.create({
    body: `Call booked: ${lead.name} | ${lead.email} | ${dateStr} CT`,
    from: FROM_NUMBER,
    to: ALERT_NUMBER,
  }).catch(e => console.error('Internal alert error:', e));

  res.status(200).json({ ok: true });
};
