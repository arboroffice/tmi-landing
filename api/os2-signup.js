// TMI OS — company sign up. Creates a tenant and its owner user, returns a token.
// Best-effort owner alert so we know when a company joins.
//
// POST { name, email, password, company, business_type? } -> { token, user, tenant }

const db = require('./_db');
const { hashPassword, signTenant, cors } = require('./_tenant-auth');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const OWNER_EMAIL = ['support@tmitechai.com', 'mia@tmitechai.com'];

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const b = req.body || {};
  const name = (b.name || '').trim();
  const email = (b.email || '').toLowerCase().trim();
  const password = String(b.password || '');
  const company = (b.company || '').trim();
  const businessType = (b.business_type || '').trim() || null;

  if (!name) return res.status(400).json({ error: 'Name required' });
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (!company) return res.status(400).json({ error: 'Company required' });

  try {
    if (await db.findOne('os_users', 'email', email)) {
      return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
    }

    const tenant = await db.insert('os_tenants', {
      name: company,
      business_type: businessType,
      profile: {},
      onboarded: false,
      plan: 'trial',
      created_at: new Date().toISOString(),
    });

    const user = await db.insert('os_users', {
      tenant_id: tenant.id,
      email,
      name,
      role: 'owner',
      password_hash: hashPassword(password),
      created_at: new Date().toISOString(),
    });

    const token = signTenant(user);

    // Best-effort owner alerts
    ownerAlert({ name, email, company, businessType }).catch(() => {});
    // Mirror into the CRM so OS signups show up alongside every other lead.
    db.upsertByField('contacts', 'email', email, {
      email, first_name: name, company, notes: 'Signed up for TMI OS',
    }).catch(() => {});
    if (!(await db.findOne('leads', 'email', email).catch(() => null))) {
      db.insert('leads', {
        email, owner_name: name, company_name: company,
        source: 'os-signup', status: 'new', score: 'hot',
        unsubscribed: false, created_at: new Date().toISOString(),
      }).catch(() => {});
    }

    const safeUser = { id: user.id, tenant_id: tenant.id, email, name, role: 'owner' };
    return res.status(201).json({ token, user: safeUser, tenant: { id: tenant.id, name: company, onboarded: false } });
  } catch (e) {
    console.error('os2-signup:', e.message);
    return res.status(500).json({ error: 'Could not create your account. Try again.' });
  }
};

async function ownerAlert({ name, email, company, businessType }) {
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'TMI OS <support@tmitechai.com>',
        to: OWNER_EMAIL,
        subject: `New TMI OS signup: ${company}`,
        text: `A company just signed up for TMI OS.\n\nName: ${name}\nEmail: ${email}\nCompany: ${company}\nType: ${businessType || '-'}`,
      });
    } catch (e) { console.error('os2-signup email:', e.message); }
  }
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const sms = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await sms.messages.create({
        body: `New TMI OS signup: ${company} (${name} | ${email})`,
        from: FROM_NUMBER, to: ALERT_NUMBER,
      });
    } catch (e) { console.error('os2-signup sms:', e.message); }
  }
}
