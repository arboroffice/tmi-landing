const { createClient } = require('@supabase/supabase-js');
const { Client: QStashClient } = require('@upstash/qstash');
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

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);

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

  // Meta Conversions API — Schedule conversion (a call was booked). This is the
  // high-intent conversion after the audit. The booking happens on the website
  // via the Cal embed, but this confirmation arrives as a Cal webhook (so the
  // request IP/UA are Cal's, not the user's) - match on hashed email/phone/name
  // instead, and dedup with the browser pixel via the Cal booking uid.
  try {
    const { sendLeadEvent } = require('./_meta-capi');
    const uid = body?.payload?.uid || body?.payload?.bookingId || '';
    const nameParts = (lead.name || '').trim().split(/\s+/);
    sendLeadEvent({
      eventName: 'Schedule',
      actionSource: 'website',
      eventSourceUrl: `${SITE}/booking`,
      eventId: uid ? `booking_${uid}` : undefined,
      email,
      phone: lead.phone,
      firstName: nameParts[0] || undefined,
      lastName: nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined,
      leadId: lead.id,
    }).catch(() => {});
  } catch (e) { console.error('Meta CAPI Schedule:', e.message); }

  const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  // Log the confirmation SMS to the lead (the phone filter excludes the team alert).
  try { require('./_comms').instrument(supabase, { sms, leadId: lead.id, phone: lead.phone }); } catch (e) { console.error('comms instrument:', e.message); }
  const dateStr = startTime
    ? new Date(startTime).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'TBD';

  // Confirmation SMS to lead
  if (lead.phone) {
    sms.messages.create({
      body: `You're confirmed, ${firstName}. See you then. If anything comes up before the call, reply here.`,
      from: FROM_NUMBER,
      to: formatPhone(lead.phone),
    }).catch(e => console.error('Confirmation SMS error:', e));
  }

  // Internal alert
  sms.messages.create({
    body: `Call booked: ${lead.name} | ${lead.email} | ${dateStr} CT`,
    from: FROM_NUMBER,
    to: ALERT_NUMBER,
  }).catch(e => console.error('Internal alert error:', e));

  // Schedule pre-call reminder sequence
  if (startTime) {
    const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN });
    const followupUrl = `${SITE}/api/followup`;
    const callMs = new Date(startTime).getTime();
    const nowMs = Date.now();

    const delay24h = Math.floor((callMs - 86400000 - nowMs) / 1000);
    const delay2h  = Math.floor((callMs - 7200000  - nowMs) / 1000);

    // 24h before: email nudge to submit audit
    if (delay24h > 60) {
      qstash.publishJSON({
        url: followupUrl,
        delay: delay24h,
        body: { leadId: lead.id, step: 'pre_call_24h' },
      }).catch(e => console.error('QStash pre_call_24h error:', e));
    }

    // 2h before: SMS reminder
    if (delay2h > 60) {
      qstash.publishJSON({
        url: followupUrl,
        delay: delay2h,
        body: { leadId: lead.id, step: 'pre_call_2h' },
      }).catch(e => console.error('QStash pre_call_2h error:', e));
    }
  }

  res.status(200).json({ ok: true });
};
