// Session tracking for the Intelligent Company Scorecard. Saves each visitor's
// contact info and answers as they go, so a started-but-unfinished quiz can be
// followed up on (see scorecard-followup.js) and resumed from a link.
//
// POST { session_id, action:'start'|'progress', name?, email?, phone?, company?, sms_consent?, answers?, answered? } -> { ok }
// GET  ?session_id=...  -> { session: { name, email, phone, company, sms_consent, answers, completed } }
//
// Sessions live in the `scorecard_sessions` collection, keyed by session_id.

const db = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ---- GET: fetch a session so the quiz can resume where they left off ----
  if (req.method === 'GET') {
    const id = ((req.query && req.query.session_id) || '').toString().trim();
    if (!id) return res.status(400).json({ error: 'session_id required' });
    try {
      const s = await db.getById('scorecard_sessions', id);
      if (!s) return res.status(404).json({ session: null });
      return res.status(200).json({
        session: {
          name: s.name || '', email: s.email || '', phone: s.phone || '', company: s.company || '',
          sms_consent: !!s.sms_consent,
          answers: Array.isArray(s.answers) ? s.answers : [],
          completed: !!s.completed,
        },
      });
    } catch (e) {
      return res.status(200).json({ session: null });
    }
  }

  if (req.method !== 'POST') return res.status(405).end();

  const b = req.body || {};
  const id = (b.session_id || '').toString().trim();
  if (!id) return res.status(400).json({ error: 'session_id required' });
  const action = b.action || 'progress';
  const nowIso = new Date().toISOString();

  // ---- start: open the session and capture the lead immediately ----
  if (action === 'start') {
    const name = (b.name || '').trim() || null;
    const email = (b.email || '').toLowerCase().trim() || null;
    const phone = (b.phone || '').trim() || null;
    const company = (b.company || '').trim() || null;
    const sms_consent = !!b.sms_consent;
    try {
      await db.update('scorecard_sessions', id, {
        session_id: id, name, email, phone, company, sms_consent,
        answers: Array.isArray(b.answers) ? b.answers : [],
        answered: Array.isArray(b.answers) ? b.answers.filter(Boolean).length : 0,
        completed: false, status: 'started', follow_up_sent: false,
        started_at: nowIso, updated_at: nowIso, created_at: nowIso,
      });
      // Capture the lead + contact right away, before they can drop off.
      if (email) {
        if (!(await db.findOne('leads', 'email', email))) {
          await db.insert('leads', {
            email, owner_name: name, company_name: company, phone,
            source: 'quiz:intelligence-scorecard', status: 'new', score: 'warm',
            unsubscribed: false, created_at: nowIso,
          });
        }
        await db.upsertByField('contacts', 'email', email, {
          email, first_name: name, company, phone,
          notes: 'Started the Intelligence Scorecard',
        }).catch(() => {});
      }
    } catch (e) {
      console.error('scorecard-progress start:', e.message);
    }
    return res.status(200).json({ ok: true });
  }

  // ---- progress: update answers as they go (avoid undefined for Firestore) ----
  const upd = { updated_at: nowIso };
  if (Array.isArray(b.answers)) upd.answers = b.answers;
  if (b.answered != null) upd.answered = Number(b.answered);
  try {
    await db.update('scorecard_sessions', id, upd);
  } catch (e) {
    console.error('scorecard-progress update:', e.message);
  }
  return res.status(200).json({ ok: true });
};
