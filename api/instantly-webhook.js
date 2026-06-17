// Instantly reply webhook -> autonomous reply agent.
// Point your Instantly campaign's "reply received" webhook here:
//   https://www.tmitechai.com/api/instantly-webhook?secret=<INSTANTLY_WEBHOOK_SECRET>
//
// The reply agent classifies intent and (when AUTO_REPLY=true) answers, drives to
// the booking link, and books the call - so you only show up to the call.

const { cors } = require('./_auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Optional shared-secret guard
  const secret = process.env.INSTANTLY_WEBHOOK_SECRET;
  if (secret) {
    const got = req.headers['x-webhook-secret'] || (req.query && req.query.secret);
    if (got !== secret) return res.status(401).json({ error: 'unauthorized' });
  }

  const p = req.body || {};
  const event = String(p.event_type || p.event || p.type || '').toLowerCase();
  const fromEmail = String(p.lead_email || p.email || p.from_email || p.from || '').toLowerCase();
  const body = p.reply_text || p.reply_text_snippet || p.reply || p.text || p.body || p.message || '';
  const subject = p.reply_subject || p.subject || 'Re: your operational review';

  // Only act on reply events that carry content.
  if (!/reply|replied|response/.test(event) || !fromEmail || !body) {
    return res.json({ ok: true, ignored: true });
  }

  try {
    const { handleReply } = await import('../agents/gtm/reply-handler.js');
    handleReply({ fromEmail, subject, body, inReplyToMessageId: null })
      .catch(e => console.error('reply-handler error:', e));
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
