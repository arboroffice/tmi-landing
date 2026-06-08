// Inbound-email webhook. Configure your inbound email provider (Resend Inbound,
// SendGrid Inbound Parse, Postmark, CloudMailin, etc.) to POST replies sent to
// support@tmitechai.com here. Logs the reply to the person's timeline.
//
// Accepts the common payload shapes across providers and pulls out the sender,
// subject, and text body defensively.

const { getSupabase } = require('./_supabase');
const { logEmail } = require('./_comms');

const FIRST_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== '') return obj[k];
  }
  return '';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const b = req.body || {};
  const rawFrom = pick(b, ['from', 'From', 'sender', 'from_email', 'FromFull']) ||
                  (b.envelope && b.envelope.from) || '';
  const fromStr = typeof rawFrom === 'object' ? (rawFrom.email || rawFrom.address || JSON.stringify(rawFrom)) : String(rawFrom);
  const fromEmail = (fromStr.match(FIRST_EMAIL) || [''])[0].toLowerCase();

  const subject = pick(b, ['subject', 'Subject']) || '(no subject)';
  const text = pick(b, ['text', 'Text', 'body', 'body-plain', 'TextBody', 'plain', 'stripped-text', 'html', 'HtmlBody']);

  if (fromEmail) {
    try {
      const db = getSupabase();
      await logEmail(db, { direction: 'inbound', address: fromEmail, subject, body: text });
    } catch (e) { console.error('[email-inbound] log:', e.message); }
  } else {
    console.error('[email-inbound] no sender email found in payload');
  }

  return res.status(200).json({ ok: true });
};
