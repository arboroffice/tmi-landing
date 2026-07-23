// TMI OS — scheduled data-sync endpoint. Runs on its own frequent cron (see
// vercel.json) so companies that pointed the OS at a source URL keep running on
// current numbers between the once-a-day worker sweep. Pulls every tenant with a
// sync_url set. Also callable by an owner from the app to force a refresh.
//
// Protected: if CRON_SECRET is set, the caller must present it (Authorization:
// Bearer, or ?key=). Vercel's own cron header is also accepted.
//
// GET | POST -> { synced, failed }

const db = require('./_db');
const { syncSweep } = require('./_ossync');

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || '';
    const key = (req.query && req.query.key) || '';
    const ok = auth === `Bearer ${secret}` || key === secret || req.headers['x-vercel-cron'];
    if (!ok) return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const r = await syncSweep(db);
    return res.status(200).json(r);
  } catch (e) {
    console.error('os2-sync:', e.message);
    return res.status(500).json({ error: 'sync failed' });
  }
};
