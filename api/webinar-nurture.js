// QStash consumer for the webinar reminder / follow-up chain.
// Steps: reminder_24h, reminder_1h, live_now, followup_2h.
// The step->email logic lives in _webinar-mail (shared with the cron fallback).

const db = require('./_db');
const { sendStep } = require('./_webinar-mail');
const { sendStepSms } = require('./_webinar-sms');

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const raw = await getRawBody(req);

  // Verify the request came from QStash (skip only if keys are unset).
  if (process.env.QSTASH_CURRENT_SIGNING_KEY) {
    try {
      const { Receiver } = require('@upstash/qstash');
      const receiver = new Receiver({
        currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
        nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
      });
      await receiver.verify({ signature: req.headers['upstash-signature'], body: raw });
    } catch {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  let payload = {};
  try { payload = JSON.parse(raw); } catch { return res.status(400).end(); }
  const { regId, step } = payload;

  const reg = await db.getById('webinar_registrations', regId).catch(() => null);
  if (!reg || !reg.email) return res.status(200).json({ ok: true, skipped: 'no-reg' });

  // SMS steps are prefixed 'sms_'; everything else is an email step.
  const sent = step.startsWith('sms_')
    ? await sendStepSms(db, reg, step)
    : await sendStep(db, reg, step);
  return res.status(200).json({ ok: true, step, sent });
}

module.exports = handler;
