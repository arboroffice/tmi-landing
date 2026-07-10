// City-lead rep web-push subscription management.
//   GET                       -> { enabled, publicKey }
//   POST { subscription }     -> save this device's PushSubscription for the rep
//   DELETE { endpoint }       -> drop a subscription (e.g. on opt-out)
const db = require('./_db');
const { cors } = require('./_auth');
const { requireRep } = require('./_rep-auth');
const push = require('./_push');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const rep = await requireRep(req, res); if (!rep) return;

  try {
    if (req.method === 'GET') {
      return res.json({ enabled: push.configured(), publicKey: push.publicKey() });
    }

    const profile = await db.getById('reps', rep.sub);
    const subs = Array.isArray(profile && profile.push_subs) ? profile.push_subs : [];

    if (req.method === 'POST') {
      const sub = req.body && req.body.subscription;
      if (!sub || !sub.endpoint) return res.status(400).json({ error: 'subscription required' });
      const next = subs.filter((s) => s && s.endpoint !== sub.endpoint);
      next.push(sub);
      await db.update('reps', rep.sub, { push_subs: next.slice(-8) }); // cap devices
      return res.json({ ok: true, count: Math.min(next.length, 8) });
    }

    if (req.method === 'DELETE') {
      const endpoint = (req.body && req.body.endpoint) || req.query.endpoint;
      if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
      const next = subs.filter((s) => s && s.endpoint !== endpoint);
      await db.update('reps', rep.sub, { push_subs: next });
      return res.json({ ok: true, count: next.length });
    }

    return res.status(405).end();
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
