const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const twilio = require('twilio');
const { Client: QStashClient } = require('@upstash/qstash');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const OWNER_EMAIL = 'mialouviere@gmail.com';
const SITE = 'https://www.tmi-technology.com';

function formatPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  return digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
}

function emailWrap(body, unsubUrl) {
  return `<!DOCTYPE html><html><body style="background:#fff;font-family:Arial,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:40px 24px;line-height:1.7;">
${body}
<p style="margin:40px 0 0;font-size:11px;color:#bbb;border-top:1px solid #eee;padding-top:16px;"><a href="${unsubUrl}" style="color:#bbb;">Unsubscribe</a></p>
</body></html>`;
}

const TIER_NAMES = {
  tier1:'Just Starting Out', tier2:'Growing Fast', tier3:'Ready To Scale',
  tier4:'Scaling Hard', tier5:'Multi Crew / Multi Location',
  tier6:'Hitting $10 Million', tier7:'Above $10 Million',
};

const TIER_DESCS = {
  tier1:'You are earlier than most. That is your advantage. The infrastructure you build right now determines who owns your market in 24 months.',
  tier2:'You have proven the model works. The problem is you are still the engine. Every lead, every decision, every fire routes through you and that is the ceiling.',
  tier3:'You have the volume, the crew, and the reputation. What you are missing is the infrastructure that turns what you have built into something that grows without you.',
  tier4:'Revenue is moving but the pressure is everywhere. Hiring, quality, customer experience, and cash flow are all getting harder to manage at the same time.',
  tier5:'You have built something real. The complexity is creating cracks. Communication breaks down, standards drift, and things fall through the gaps between locations.',
  tier6:'Hitting $10M is something most never reach. It is also where everything that got you here starts to break. Margins compress. Management stops working. Old tools cannot carry the weight.',
  tier7:'You are not running a trades business anymore. You are running a company. The infrastructure, systems, and decisions need to reflect that reality.',
};

const DEP_INFO = (pct) => {
  if (pct >= 70) return { label:'Critical Dependency', color:'#e05a2b' };
  if (pct >= 45) return { label:'High Dependency', color:'#d49320' };
  if (pct >= 20) return { label:'Moderate Dependency', color:'#8aa82a' };
  return { label:'Low Dependency', color:'#4caf7d' };
};

const CAT_PAIN_TITLES = {
  leads:'Your Pipeline Leaks At Every Stage',
  ops:'Every Decision Routes Through You',
  people:'Your Business Runs On Memory Not Systems',
  finance:'Money You Earned Is Not Getting Collected',
  comms:'You Are The Communication Hub For Everything',
};

const TIER_STEP_NAMES = {
  tier1:'Build The Foundation Before Volume Forces You To',
  tier2:'Stop Being The Engine',
  tier3:'Install The Systems That Make Growth Automatic',
  tier4:'Build Infrastructure That Keeps Up With The Pace',
  tier5:'Connect Everything Into One Command Layer',
  tier6:'Rebuild The Infrastructure Your Revenue Has Outgrown',
  tier7:'Build Like The Company You Actually Are',
};

function buildResultsEmail(firstName, contact, results, unsubUrl) {
  const tierName = TIER_NAMES[results.tierKey] || '';
  const tierDesc = TIER_DESCS[results.tierKey] || '';
  const dep = DEP_INFO(results.depPct);
  const worstPain = CAT_PAIN_TITLES[results.worstCat] || '';
  const firstStep = TIER_STEP_NAMES[results.tierKey] || '';

  return emailWrap(`
<p style="margin:0 0 6px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">TMI Business Audit Results</p>
<h1 style="margin:0 0 12px;font-size:34px;font-weight:800;line-height:1.05;letter-spacing:-0.02em;color:#0a0b14;">${tierName}</h1>
<p style="margin:0 0 32px;font-size:15px;color:#444;line-height:1.65;">${tierDesc}</p>

<div style="background:#f5f5f7;border-radius:12px;padding:24px 28px;margin-bottom:28px;">
  <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#888;">Dependency Score</p>
  <p style="margin:0 0 2px;font-size:52px;font-weight:800;color:${dep.color};line-height:1;letter-spacing:-0.03em;">${results.depPct}%</p>
  <p style="margin:0;font-size:12px;font-weight:700;color:${dep.color};letter-spacing:0.08em;text-transform:uppercase;">${dep.label}</p>
</div>

<table width="100%" style="margin-bottom:28px;border-collapse:collapse;">
  <tr>
    <td style="padding:16px 20px;border:1px solid #eee;border-radius:10px 0 0 10px;vertical-align:top;width:50%;">
      <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#888;">Biggest Leak</p>
      <p style="margin:0;font-size:14px;font-weight:700;color:#111;line-height:1.4;">${worstPain}</p>
    </td>
    <td style="padding:16px 20px;border:1px solid #eee;border-left:none;border-radius:0 10px 10px 0;vertical-align:top;width:50%;">
      <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#888;">First Move</p>
      <p style="margin:0;font-size:14px;font-weight:700;color:#111;line-height:1.4;">${firstStep}</p>
    </td>
  </tr>
</table>

<a href="${SITE}/booking" style="display:inline-block;background:#E4FF97;color:#0a0b14;font-weight:700;font-size:14px;padding:14px 32px;border-radius:999px;text-decoration:none;">Book My Free Strategy Call →</a>

<p style="margin:28px 0 0;font-size:14px;color:#555;line-height:1.65;">We'll walk through exactly what to install in your operation, what it will do, and what the path looks like. No pitch. No pressure. Just a plan.</p>

<p style="margin:24px 0 0;font-size:14px;">Mia<br><span style="color:#888;font-size:13px;">TMI — AI Infrastructure for Field Operations</span></p>
`, unsubUrl);
}

const CAT_LABELS = { leads:'Lead & Sales', ops:'Operations', people:'People & Systems', finance:'Finance & Admin', comms:'Communication' };

function buildInternalEmail(contact, results, answers) {
  const tierName = TIER_NAMES[results.tierKey] || results.tierKey;
  const dep = DEP_INFO(results.depPct);

  const catRows = Object.entries(results.catPct || {}).map(([k, v]) =>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#555;">${CAT_LABELS[k]||k}</td><td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;font-weight:700;color:${DEP_INFO(v).color};">${v}%</td></tr>`
  ).join('');

  const scoredQs = ['q3','q4','q5','q6','q7','q8','q9','q10','q11','q12','q13','q14'];
  const qLabels = ['Leads followed up without you','Lead response speed','Who closes jobs','Crew problem handling','Schedule/dispatch without you','Decisions routed to you','Hiring process','Impact if best person leaves','Invoice/payment without you','Know real job margin','Customer update handling','Impact of phone-off day'];
  const answerScaleLabels = [['System handles it','Team handles it','Some would get called','Almost none — it\'s you'],['Under 5 min automated','Within an hour','A few hours','Next day or longer'],['Mostly team','Mix of both','Mostly me','Just me'],['Use documented process','Handle it, call on big issues','Try but usually call me','Call me first always'],['Yes fully automated','Yes but messy','Partially','No — I run it'],['Almost never','1-3x/day','4-8x/day','Constantly'],['System handles it','Someone helps, I\'m involved','Mostly me','All me'],['Manageable','Tough but recoverable','Really painful','Devastating'],['System handles it','Someone handles it manually','Slows way down','Pile up until I\'m back'],['Always — real time','Monthly','Rarely — I estimate','Basically never'],['Automated or team always','Usually team','Mix of both','Me — I handle it all'],['Nothing critical','A few things slow','Several things stall','A lot — I\'m the hub']];

  const answerRows = scoredQs.map((qid, i) => {
    const score = answers?.[qid];
    if (score === undefined) return '';
    const label = answerScaleLabels[i]?.[score] || score;
    return `<tr><td style="padding:5px 10px;border-bottom:1px solid #f9f9f9;font-size:12px;color:#666;width:55%;">${qLabels[i]}</td><td style="padding:5px 10px;border-bottom:1px solid #f9f9f9;font-size:12px;font-weight:600;color:#111;">${label} <span style="color:#aaa;font-weight:400;">(${score}/3)</span></td></tr>`;
  }).join('');

  return `<!DOCTYPE html><html><body style="background:#fff;font-family:Arial,sans-serif;color:#111;max-width:620px;margin:0 auto;padding:32px 24px;line-height:1.6;">
<p style="margin:0 0 4px;font-size:11px;color:#888;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">New Audit Submission</p>
<h2 style="margin:0 0 20px;font-size:22px;font-weight:800;">${contact.name} — ${tierName}</h2>

<table width="100%" style="border-collapse:collapse;margin-bottom:24px;background:#f9f9f9;border-radius:10px;overflow:hidden;">
  <tr><td style="padding:8px 14px;font-size:13px;color:#888;width:30%;">Name</td><td style="padding:8px 14px;font-size:13px;font-weight:600;">${contact.name}</td></tr>
  <tr style="background:#f3f3f3;"><td style="padding:8px 14px;font-size:13px;color:#888;">Company</td><td style="padding:8px 14px;font-size:13px;font-weight:600;">${contact.company || '—'}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#888;">Email</td><td style="padding:8px 14px;font-size:13px;font-weight:600;"><a href="mailto:${contact.email}" style="color:#5a9e00;">${contact.email}</a></td></tr>
  <tr style="background:#f3f3f3;"><td style="padding:8px 14px;font-size:13px;color:#888;">Phone</td><td style="padding:8px 14px;font-size:13px;font-weight:600;">${contact.phone || '—'}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#888;">Industry</td><td style="padding:8px 14px;font-size:13px;font-weight:600;">${answers?.q2 || '—'}</td></tr>
</table>

<table width="100%" style="border-collapse:collapse;margin-bottom:24px;">
  <tr style="background:#0a0b14;"><td colspan="2" style="padding:10px 14px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#E4FF97;">Audit Results</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#888;border-bottom:1px solid #f0f0f0;">Tier</td><td style="padding:8px 14px;font-size:13px;font-weight:700;border-bottom:1px solid #f0f0f0;">${tierName}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#888;border-bottom:1px solid #f0f0f0;">Dependency Score</td><td style="padding:8px 14px;font-size:14px;font-weight:800;border-bottom:1px solid #f0f0f0;color:${dep.color};">${results.depPct}% — ${dep.label}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#888;border-bottom:1px solid #f0f0f0;">Worst Category</td><td style="padding:8px 14px;font-size:13px;font-weight:700;border-bottom:1px solid #f0f0f0;">${CAT_LABELS[results.worstCat]||results.worstCat}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#888;">Composite Score</td><td style="padding:8px 14px;font-size:13px;font-weight:600;">${typeof results.composite === 'number' ? results.composite.toFixed(1) : '—'} / 28</td></tr>
</table>

<table width="100%" style="border-collapse:collapse;margin-bottom:24px;">
  <tr style="background:#0a0b14;"><td colspan="2" style="padding:10px 14px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#E4FF97;">Category Scores</td></tr>
  ${catRows}
</table>

<table width="100%" style="border-collapse:collapse;margin-bottom:8px;">
  <tr style="background:#0a0b14;"><td colspan="2" style="padding:10px 14px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#E4FF97;">All Answers</td></tr>
  ${answerRows}
</table>
</body></html>`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { contact, results, answers } = req.body || {};
  if (!contact?.email || !results?.tierKey) return res.status(400).json({ error: 'Missing required fields' });

  const firstName = (contact.name || 'there').split(' ')[0];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // 1. Insert into leads table for follow-up chain
  let leadId = null;
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .insert({ name: contact.name, email: contact.email.toLowerCase(), phone: contact.phone || null, status: 'new' })
    .select()
    .single();
  if (!leadErr) leadId = lead.id;
  else console.error('Lead insert:', leadErr.message);

  // 2. Insert full audit record
  const { error: auditErr } = await supabase.from('audit_submissions').insert({
    lead_id: leadId,
    name: contact.name,
    company: contact.company || null,
    email: contact.email.toLowerCase(),
    phone: contact.phone || null,
    tier: results.tierKey,
    dep_pct: results.depPct,
    composite_score: results.composite,
    industry: answers?.q2 || null,
    pain_group: results.painGroup,
    worst_cat: results.worstCat,
    second_cat: results.secondCat,
    cat_scores: results.catPct,
    answers: answers,
  });
  if (auditErr) console.error('Audit insert:', auditErr.message);

  const unsubUrl = leadId
    ? `${SITE}/api/unsubscribe?id=${leadId}`
    : `${SITE}/api/unsubscribe?email=${encodeURIComponent(contact.email)}`;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  // 3. Send personalized results email
  resend.emails.send({
    from: 'TMI <support@tmitechai.com>',
    to: contact.email,
    subject: `Your TMI Audit — ${TIER_NAMES[results.tierKey]}`,
    html: buildResultsEmail(firstName, contact, results, unsubUrl),
  }).catch(e => console.error('Resend:', e.message));

  // 4. SMS to lead
  if (contact.phone) {
    sms.messages.create({
      body: `Hey ${firstName} - your TMI Audit is done. You're in the "${TIER_NAMES[results.tierKey]}" tier. ${results.depPct}% dependency score. Full results sent to your email. Book a call: ${SITE}/booking`,
      from: FROM_NUMBER,
      to: formatPhone(contact.phone),
    }).catch(e => console.error('Lead SMS:', e.message));
  }

  // 5. Internal email to Mia with full results + all answers
  resend.emails.send({
    from: 'TMI <support@tmitechai.com>',
    to: OWNER_EMAIL,
    subject: `Audit: ${contact.name} — ${TIER_NAMES[results.tierKey]} (${results.depPct}% dep)`,
    html: buildInternalEmail(contact, results, answers),
  }).catch(e => console.error('Internal email:', e.message));

  // Internal SMS alert to Mia
  sms.messages.create({
    body: `Audit: ${contact.name} | ${contact.company || '—'} | ${contact.email} | ${contact.phone || 'no phone'} | ${TIER_NAMES[results.tierKey]} | ${results.depPct}% dep | ${answers?.q2 || 'no industry'}`,
    from: FROM_NUMBER,
    to: ALERT_NUMBER,
  }).catch(e => console.error('Alert SMS:', e.message));

  // 6. Schedule follow-up chain
  if (leadId) {
    const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN });
    const followupUrl = `${SITE}/api/followup`;
    const schedule = [
      { delay: 86400,   step: 'day1_sms' },
      { delay: 259200,  step: 'day3_email' },
      { delay: 604800,  step: 'day7_email_sms' },
      { delay: 1209600, step: 'day14_email' },
    ];
    for (const { delay, step } of schedule) {
      qstash.publishJSON({ url: followupUrl, delay, body: { leadId, step } })
        .catch(e => console.error(`QStash ${step}:`, e.message));
    }
  }

  res.status(200).json({ ok: true });
};
