// Web Push (VAPID) helper. Optional: no-ops cleanly when VAPID keys aren't set,
// mirroring how Twilio is optional for SMS. Subscriptions live on the rep doc as
// `push_subs` (array of PushSubscription JSON, deduped by endpoint).
//
// Generate keys once with:  npx web-push generate-vapid-keys
// then set env VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...).
const db = require('./_db');

let webpush = null;
try { webpush = require('web-push'); } catch { webpush = null; }

const PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hello@tmitechai.com';

let ready = false;
function configure() {
  if (ready) return true;
  if (!webpush || !PUBLIC || !PRIVATE) return false;
  try { webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE); ready = true; return true; }
  catch { return false; }
}

const configured = () => !!(webpush && PUBLIC && PRIVATE);
const publicKey = () => PUBLIC;

// Send one notification. Returns { ok, gone } — gone===true means the sub is dead
// (404/410) and the caller should drop it.
async function sendOne(sub, payload) {
  if (!configure()) return { ok: false, gone: false };
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
    return { ok: true, gone: false };
  } catch (e) {
    const code = e && e.statusCode;
    return { ok: false, gone: code === 404 || code === 410 };
  }
}

// Send to every subscription on a rep, pruning dead ones from the rep doc.
async function sendToRep(rep, payload) {
  if (!configure() || !rep) return 0;
  const subs = Array.isArray(rep.push_subs) ? rep.push_subs : [];
  if (!subs.length) return 0;
  const alive = [];
  let sent = 0;
  for (const s of subs) {
    const r = await sendOne(s, payload);
    if (r.ok) sent++;
    if (!r.gone) alive.push(s);
  }
  if (alive.length !== subs.length) await db.update('reps', rep.id, { push_subs: alive }).catch(() => {});
  return sent;
}

module.exports = { configured, publicKey, sendOne, sendToRep };
