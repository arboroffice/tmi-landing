// Public member signup. Creates a member, captures them as a lead/contact, returns a token.
const db = require('./_db');
const { cors } = require('./_auth');
const { hashPassword, signMember } = require('./_member-auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  const { email, password, name, company, phone } = req.body || {};
  if (!email || !email.includes('@') || !password || String(password).length < 8) {
    return res.status(400).json({ error: 'Valid email and a password of at least 8 characters are required' });
  }
  const em = String(email).toLowerCase().trim();
  try {
    if (await db.findOne('members', 'email', em)) return res.status(409).json({ error: 'An account with that email already exists' });
    const member = await db.insert('members', {
      email: em, name: name || null, company: company || null, phone: phone || null,
      password: hashPassword(password), created_at: new Date().toISOString(), status: 'active',
    });
    // Capture into the funnel (contact + lead), best-effort.
    try {
      await db.upsertByField('contacts', 'email', em, { email: em, first_name: (name || '').split(' ')[0] || null, company: company || null, tags: ['member'] });
      if (!(await db.findOne('leads', 'email', em))) {
        await db.insert('leads', { email: em, owner_name: name || null, company_name: company || null, phone: phone || null, source: 'member_signup', status: 'new', score: 'warm', unsubscribed: false, created_at: new Date().toISOString() });
      }
    } catch (e) { console.error('signup capture:', e.message); }
    const token = signMember(member);
    return res.status(201).json({ token, member: { id: member.id, email: em, name: member.name, company: member.company } });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
