// Marks a registrant as attended when they enter the live room, so the 2h
// follow-up sends the "book your audit" email instead of the "here's the
// replay" no-show email. Idempotent and best-effort.
//
// POST { token } -> { ok }

const db = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const token = ((req.body && req.body.token) || '').trim();
  if (!token) return res.status(400).json({ error: 'token required' });

  try {
    const reg = await db.findOne('webinar_registrations', 'token', token);
    if (reg && reg.id && !reg.attended) {
      await db.update('webinar_registrations', reg.id, {
        attended: true, status: 'attended', attended_at: new Date().toISOString(),
      });
    }
  } catch (e) { console.error('webinar-attend:', e.message); }

  return res.status(200).json({ ok: true });
};
