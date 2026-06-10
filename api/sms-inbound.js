// Twilio inbound-SMS webhook. Point your Twilio number's "A message comes in"
// webhook (Messaging) at https://www.tmi-technology.com/api/sms-inbound (POST).
// Logs the reply to the timeline and alerts the team. Returns empty TwiML.

const { logSms } = require('./_comms');
const twilio = require('twilio');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';

function twiml(res) {
  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return twiml(res);

  const b = req.body || {};
  const from = b.From || b.from || '';
  const body = b.Body || b.body || '';
  const sid  = b.MessageSid || b.SmsSid || b.SmsMessageSid || null;

  if (from) {
    // Record the inbound message
    try {
      await logSms(null, { direction: 'inbound', phone: from, body, status: 'received', twilioSid: sid });
    } catch (e) { console.error('[sms-inbound] log:', e.message); }

    // Alert the team that a reply came in
    try {
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await sms.messages.create({
          body: `Reply from ${from}: ${String(body).slice(0, 400)}`,
          from: FROM_NUMBER,
          to: ALERT_NUMBER,
        });
      }
    } catch (e) { console.error('[sms-inbound] alert:', e.message); }
  }

  return twiml(res);
};
