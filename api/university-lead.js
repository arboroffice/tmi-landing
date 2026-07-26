// TMI University - public assessment lead. Someone takes the interactive audit
// on /university, then leaves their name, company and email to get their build
// plan. We store the lead with their six scores, notify the team, and send the
// submitter a plain confirmation. All external calls are best-effort so a
// missing key never blocks the lead from being captured.
//
// POST { name, company, email, score:{ total, level, level_name, areas, start_floor } }

const db = require('./_db');

const OWNER_EMAIL = 'support@tmitechai.com';
const FROM = 'TMI <support@tmitechai.com>';
const ALERT_NUMBER = '+13373809059';
const FROM_NUMBER = '+18557171044';

const AREA_LABEL = { memory: 'Memory', awareness: 'Awareness', action: 'Action', learning: 'Learning', integration: 'Integration', decision: 'Decision' };

function scoreLines(areas) {
  if (!areas || typeof areas !== 'object') return '';
  return Object.keys(AREA_LABEL)
    .filter(k => areas[k] != null)
    .map(k => `${AREA_LABEL[k]}: ${Math.round(Number(areas[k]) * 10) / 10} / 5`)
    .join('\n');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const b = req.body || {};
  const email = String(b.email || '').toLowerCase().trim();
  const name = String(b.name || '').trim();
  const company = String(b.company || '').trim();
  const score = b.score && typeof b.score === 'object' ? b.score : null;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

  const total = score && Number.isFinite(Number(score.total)) ? Number(score.total) : null;
  const level = score ? Number(score.level) || null : null;
  const levelName = score ? String(score.level_name || '') : '';
  const startFloor = score ? String(score.start_floor || '') : '';
  const areasText = score ? scoreLines(score.areas) : '';

  const notes = [
    total != null ? `Intelligence score: ${total}/100` : '',
    level ? `Level ${level}${levelName ? ' (' + levelName + ')' : ''}` : '',
    startFloor ? `Starting floor: ${startFloor}` : '',
    areasText ? `Six areas:\n${areasText}` : '',
  ].filter(Boolean).join('\n');

  let leadId = null, contactId = null;

  // Store the contact + lead. Best-effort so capture never hard-fails.
  try {
    const contact = await db.upsertByField('contacts', 'email', email, {
      first_name: name || null, email, company: company || null,
      source: 'university-assessment', notes: notes || null,
    });
    contactId = contact && contact.id;
  } catch (e) { console.error('university-lead contact:', e.message); }

  try {
    const lead = await db.insert('leads', {
      contact_id: contactId, name: name || null, email, company: company || null,
      status: 'new', source: 'university-assessment', notes: notes || null,
    });
    leadId = lead && lead.id;
  } catch (e) { console.error('university-lead lead:', e.message); }

  // Keep the raw assessment result on its own table for the University funnel.
  try {
    await db.insert('university_assessments', {
      lead_id: leadId, email, name: name || null, company: company || null,
      total, level, level_name: levelName || null, start_floor: startFloor || null,
      areas: score ? score.areas || null : null, created_at: new Date().toISOString(),
    });
  } catch (e) { console.error('university-lead assessment:', e.message); }

  // Notify the team + confirm to the submitter (best-effort).
  try {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    resend.emails.send({
      from: FROM, to: email,
      subject: `Your intelligence score${total != null ? ': ' + total + '/100' : ''}`,
      html: confirmationHtml({ name, company, total, level, levelName, startFloor, areasText }),
    }).catch(e => console.error('university confirm email:', e.message));

    resend.emails.send({
      from: FROM, to: OWNER_EMAIL,
      subject: `University assessment: ${name || email}${total != null ? ' - ' + total + '/100' : ''}`,
      html: internalHtml({ name, company, email, total, level, levelName, startFloor, areasText }),
    }).catch(e => console.error('university internal email:', e.message));
  } catch (e) { console.error('university-lead resend:', e.message); }

  // SMS alert (best-effort).
  try {
    const twilio = require('twilio');
    const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    sms.messages.create({
      body: `University audit: ${name || email} | ${company || 'no company'} | ${total != null ? total + '/100 (L' + level + ')' : 'no score'} | ${email}`,
      from: FROM_NUMBER, to: ALERT_NUMBER,
    }).catch(e => console.error('university alert SMS:', e.message));
  } catch (e) { console.error('university-lead twilio:', e.message); }

  return res.status(200).json({ ok: true });
};

function shellEmail(inner) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5ef;-webkit-font-smoothing:antialiased;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5ef;"><tr><td align="center" style="padding:28px 14px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid #e7e8e1;border-radius:16px;overflow:hidden;"><tr><td style="background:#0a0b14;padding:18px 30px;"><span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">TMI</span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#E4FF97;margin-left:5px;"></span></td></tr><tr><td style="padding:34px 30px 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.7;">${inner}</td></tr><tr><td style="padding:6px 30px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><div style="border-top:1px solid #eceee4;margin-top:8px;padding-top:16px;font-size:12px;line-height:1.6;color:#9a9ba5;">TMI Technology &middot; The Intelligent Company School<br><a href="https://www.tmitechai.com/university" style="color:#6f8f2a;text-decoration:none;">tmitechai.com/university</a></div></td></tr></table></td></tr></table></body></html>`;
}

function areasTableHtml(areasText) {
  if (!areasText) return '';
  const rows = areasText.split('\n').map((line, i) => {
    const bg = i % 2 ? '#f3f3f3' : '#f9f9f9';
    const [label, val] = line.split(': ');
    return `<tr style="background:${bg}"><td style="padding:8px 14px;font-size:13px;color:#888;width:40%">${label}</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${val || ''}</td></tr>`;
  }).join('');
  return `<table width="100%" style="border-collapse:collapse;border-radius:8px;overflow:hidden;margin:16px 0 20px;">${rows}</table>`;
}

function confirmationHtml({ name, company, total, level, levelName, startFloor, areasText }) {
  const floorUrl = startFloor ? `https://www.tmitechai.com/university/${startFloor}` : 'https://www.tmitechai.com/university';
  return shellEmail(`
<p style="margin:0 0 6px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">TMI University</p>
<h2 style="margin:0 0 18px;font-size:28px;font-weight:800;letter-spacing:-0.02em;line-height:1.1;">${total != null ? `You scored ${total} out of 100.` : 'Your assessment is saved.'}</h2>
<p style="font-size:15px;color:#444;margin:0 0 8px;line-height:1.65;">${name ? name + ', here' : 'Here'} is where ${company || 'your company'} stands today${level ? `: Level ${level}${levelName ? ', ' + levelName : ''}` : ''}. The score is not a grade. It is a description of how the company runs when you are not in the room.</p>
${areasTableHtml(areasText)}
<p style="font-size:15px;color:#444;margin:0 0 22px;line-height:1.65;">Everyone starts with Orientation, then goes to their starting floor. Reading is not building, so each lesson ends with one real thing to build in your business.</p>
<a href="${floorUrl}" style="display:inline-block;background:#E4FF97;color:#0a0b14;font-weight:700;font-size:14px;padding:14px 30px;border-radius:999px;text-decoration:none;">Open your starting floor &rarr;</a>
<p style="margin:26px 0 0;font-size:14px;line-height:1.7;">Then build it inside the operating system: <a href="https://os.tmitechai.com" style="color:#6f8f2a;">os.tmitechai.com</a></p>
<p style="margin:30px 0 0;font-size:14px;line-height:1.7;">Mia<br><span style="color:#888;font-size:13px;">TMI &middot; The Intelligent Company School</span></p>`);
}

function internalHtml({ name, company, email, total, level, levelName, startFloor, areasText }) {
  return shellEmail(`
<p style="margin:0 0 4px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">New University Assessment</p>
<h2 style="margin:0 0 18px;font-size:22px;font-weight:800;">${name || email}</h2>
<table width="100%" style="border-collapse:collapse;background:#f9f9f9;border-radius:8px;overflow:hidden;margin-bottom:12px;">
  <tr><td style="padding:8px 14px;font-size:13px;color:#888;width:30%">Email</td><td style="padding:8px 14px;font-size:13px;font-weight:600"><a href="mailto:${email}" style="color:#5a9e00">${email}</a></td></tr>
  <tr style="background:#f3f3f3"><td style="padding:8px 14px;font-size:13px;color:#888">Company</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${company || '&mdash;'}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#888">Score</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${total != null ? total + ' / 100' : '&mdash;'}</td></tr>
  <tr style="background:#f3f3f3"><td style="padding:8px 14px;font-size:13px;color:#888">Level</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${level ? level + (levelName ? ' (' + levelName + ')' : '') : '&mdash;'}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#888">Starting floor</td><td style="padding:8px 14px;font-size:13px;font-weight:600">${startFloor || '&mdash;'}</td></tr>
</table>
${areasTableHtml(areasText)}
<a href="https://admin.tmitechai.com/admin-leads" style="font-size:13px;color:#5a9e00">View in Admin &rarr;</a>`);
}
