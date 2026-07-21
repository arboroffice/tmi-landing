// Lead capture for the Intelligent Company Scorecard quiz. Fires when a visitor
// finishes the quiz and submits their info to see results. Stores the lead with
// the full score, emails the owner, and texts the owner line. Best-effort
// throughout so a failure never blocks the results screen.
//
// POST { name, email, company?, phone?, level, level_name, score, gap, answers }
//   -> { ok }

const db = require('./_db');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const OWNER_EMAIL = ['support@tmitechai.com', 'mia@tmitechai.com'];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const b = req.body || {};
  const name = (b.name || '').trim();
  const email = (b.email || '').toLowerCase().trim();
  const company = (b.company || '').trim() || null;
  const phone = (b.phone || '').trim() || null;
  const level = Number(b.level) || null;
  const levelName = (b.level_name || '').trim() || null;
  const score = (b.score != null) ? Number(b.score) : null;
  const gap = (b.gap || '').trim() || null;
  const answers = Array.isArray(b.answers) ? b.answers : null;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

  const scoreLine = `Level ${level != null ? level : '?'}${levelName ? ' - ' + levelName : ''}` +
    (score != null ? ` (${score}/100)` : '') + (gap ? ` | biggest gap: ${gap}` : '');

  // 1) Store (scorecard_leads + lead + contact) - best-effort
  try {
    await db.insert('scorecard_leads', {
      name: name || null, email, company, phone,
      level, level_name: levelName, score, gap, answers,
      resource: 'intelligence-scorecard',
      source: 'scorecard-quiz', status: 'new', created_at: new Date().toISOString(),
    });
    if (!(await db.findOne('leads', 'email', email))) {
      await db.insert('leads', {
        email, owner_name: name || null, company_name: company, phone,
        source: 'quiz:intelligence-scorecard', status: 'new', score: 'warm',
        unsubscribed: false, created_at: new Date().toISOString(),
      });
    }
    await db.upsertByField('contacts', 'email', email, {
      email, first_name: name || null, company, phone,
      notes: `Intelligence Scorecard - ${scoreLine}`,
    }).catch(() => {});
  } catch (e) {
    console.error('scorecard-lead DB:', e.message);
  }

  // 2) Owner email (best-effort)
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      const answerLines = answers
        ? '\n\nAnswers:\n' + answers.map(a => `- ${a.dimension}: ${a.label} (${a.value}/4)`).join('\n')
        : '';
      resend.emails.send({
        from: 'TMI <support@tmitechai.com>',
        to: OWNER_EMAIL,
        subject: `Scorecard: ${name || email} - ${scoreLine}`,
        text: `The Intelligent Company Scorecard was completed by:\n\nName: ${name || '-'}\nEmail: ${email}\nCompany: ${company || '-'}\nPhone: ${phone || '-'}\n\nResult: ${scoreLine}${answerLines}`,
      }).catch(e => console.error('scorecard-lead email:', e.message));
    } catch (e) { console.error('scorecard-lead email:', e.message); }
  }

  // 3) Owner SMS (best-effort)
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const sms = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      sms.messages.create({
        body: `Scorecard: ${name || email}${company ? ' | ' + company : ''} | ${scoreLine} | ${email}`,
        from: FROM_NUMBER, to: ALERT_NUMBER,
      }).catch(e => console.error('scorecard-lead SMS:', e.message));
    } catch (e) { console.error('scorecard-lead Twilio:', e.message); }
  }

  res.status(200).json({ ok: true });
};
