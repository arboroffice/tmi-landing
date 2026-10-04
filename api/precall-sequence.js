// Sends one step of the pre-call sequence (see _precall.js). Called by QStash.
//   POST ?secret=...  { id, key, call_at }      -> send that step (at most once)
//   POST ?secret=...  { id, relay, call_at }    -> schedule steps that were > 6 days out
//   GET  ?stop=<id>&t=<token>                   -> prospect clicked "stop these emails"
const { Client: QStashClient } = require('@upstash/qstash');
const db = require('./_db');
const pc = require('./_precall');

module.exports = async function handler(req, res) {
  if (req.method === 'GET' && req.query.stop) {
    const id = String(req.query.stop);
    if (req.query.t !== pc.stopToken(id)) return res.status(403).send('Invalid link');
    await db.update('precall_bookings', id, { stopped: true, updated_at: new Date().toISOString() }).catch(() => {});
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui,sans-serif;padding:48px 20px;text-align:center;color:#1a1a1a"><h2 style="font-weight:600">Done.</h2><p style="color:#555">You will not get any more pre-call emails or texts. Your call is still on the calendar.</p></body>');
  }
  if (req.method !== 'POST') return res.status(405).end();
  const want = process.env.GTM_RUN_SECRET || process.env.JWT_SECRET || '';
  if (!want || req.query.secret !== want) return res.status(401).json({ error: 'Unauthorized' });

  const b = req.body || {};
  try {
    if (b.relay) {
      const doc = await db.getById('precall_bookings', b.id);
      if (!doc || doc.cancelled || doc.stopped || doc.call_at !== b.call_at) return res.json({ ok: true, skipped: true });
      const out = await pc.schedule({ email: doc.email, name: doc.name, phone: doc.phone, startTime: doc.call_at, link: doc.link, uid: doc.uid },
        { qs: new QStashClient({ token: process.env.QSTASH_TOKEN }) });
      return res.json({ ok: true, relay: out });
    }
    if (!b.id || !b.key) return res.status(400).json({ error: 'id and key required' });
    const out = await pc.sendStep(b);
    return res.json(Object.assign({ ok: true }, out));
  } catch (e) {
    console.error('precall-sequence:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
