// Admin review of city-lead (rep) applicants. Reviewing is a PATCH of
// status/notes/rating. Approving is special: setting status to "approved" on an
// applicant who has no rep yet provisions a real rep login, links it back to the
// applicant, and emails them how to sign in. Idempotent, so re-approving or
// approving someone who already has a rep account never duplicates.
const crypto = require('crypto');
const { Resend } = require('resend');
const db = require('./_db');
const { requireAuth, cors } = require('./_auth');
const { hashPassword } = require('./_rep-auth');

const REP_APP_URL = 'https://www.tmitechai.com/cityleads';

// A readable, always-alphanumeric temp password, comfortably over the 8-char
// minimum the rep login enforces.
function tempPassword() {
  return 'R' + crypto.randomBytes(4).toString('hex') + '7'; // R + 8 hex + 7 = 10 chars
}

function inviteEmail(email, firstName, pw) {
  if (!process.env.RESEND_API_KEY) return Promise.resolve();
  const resend = new Resend(process.env.RESEND_API_KEY);
  const name = firstName || 'there';
  return resend.emails.send({
    from: 'TMI <support@tmitechai.com>',
    to: email,
    subject: 'You are approved — your TMI City Leads login',
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5ef;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5ef;"><tr><td align="center" style="padding:28px 14px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#fff;border:1px solid #e7e8e1;border-radius:16px;overflow:hidden;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<tr><td style="background:#0a0b14;padding:18px 30px;"><span style="font-size:19px;font-weight:800;color:#fff;">TMI</span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#E4FF97;margin-left:5px;"></span></td></tr>
<tr><td style="padding:34px 30px 8px;color:#1a1a1a;font-size:16px;line-height:1.7;">
<h2 style="margin:0 0 18px;font-size:26px;font-weight:800;letter-spacing:-0.02em;">You are in, ${name}.</h2>
<p style="font-size:15px;color:#444;margin:0 0 18px;">Your City Leads app is live. Sign in, walk your cluster, and start booking audits.</p>
<table width="100%" style="background:#f9f9f9;border-radius:10px;margin:0 0 22px;"><tr><td style="padding:14px 16px;font-size:13px;color:#888;width:38%">Sign in at</td><td style="padding:14px 16px;font-size:14px;font-weight:700"><a href="${REP_APP_URL}" style="color:#5a9e00">tmitechai.com/cityleads</a></td></tr>
<tr style="background:#f3f3f3"><td style="padding:14px 16px;font-size:13px;color:#888">Email</td><td style="padding:14px 16px;font-size:14px;font-weight:700">${email}</td></tr>
<tr><td style="padding:14px 16px;font-size:13px;color:#888">Temporary password</td><td style="padding:14px 16px;font-size:14px;font-weight:700;font-family:monospace">${pw}</td></tr></table>
<a href="${REP_APP_URL}" style="display:inline-block;background:#E4FF97;color:#0a0b14;font-weight:700;font-size:14px;padding:14px 32px;border-radius:999px;text-decoration:none;">Open City Leads &rarr;</a>
<p style="margin:26px 0 0;font-size:13px;color:#888;line-height:1.6;">Use the temporary password to get in, then ask your admin to reset it to one you choose. Add it to your home screen so it opens like an app.</p>
<p style="margin:26px 0 0;font-size:14px;">Mia<br><span style="color:#888;font-size:13px;">TMI</span></p>
</td></tr></table></td></tr></table></body></html>`,
  });
}

// Provision (or link) a rep for an approved applicant. Never duplicates: if a rep
// with the same email exists, we link to it instead of creating a second one.
async function provisionRep(applicant) {
  const email = String(applicant.email || '').toLowerCase().trim();
  if (!email || !email.includes('@')) return null;
  const existing = await db.findOne('reps', 'email', email).catch(() => null);
  if (existing) return { rep_id: existing.id, created: false, email };
  const name = [applicant.first_name, applicant.last_name].filter(Boolean).join(' ').trim() || email;
  const pw = tempPassword();
  const rep = await db.insert('reps', {
    name, email, city: applicant.city || null, phone: applicant.phone || null,
    password: hashPassword(pw), status: 'active',
    source: 'city-lead-approval', city_lead_id: applicant.id || null,
    created_at: new Date().toISOString(),
  });
  inviteEmail(email, applicant.first_name, pw).catch((e) => console.error('rep invite email:', e.message));
  return { rep_id: rep.id, created: true, email };
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      const data = await db.list('city_leads', { order: 'created_at', ascending: false });
      return res.json(data || []);
    }

    if (req.method === 'PATCH') {
      const { id, status, notes, rating } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });

      const cur = await db.getById('city_leads', id);
      if (!cur) return res.status(404).json({ error: 'Applicant not found' });

      const updates = {};
      if (status !== undefined) updates.status = status;
      if (notes  !== undefined) updates.notes  = notes;
      if (rating !== undefined) updates.rating = rating;

      // The admin "Accept" button sends status 'accepted'; treat 'approved' as an
      // alias. Either one, on an applicant without a rep yet, provisions the login.
      let provisioned = null;
      if ((status === 'accepted' || status === 'approved') && !cur.rep_id) {
        provisioned = await provisionRep(cur);
        if (provisioned) {
          updates.rep_id = provisioned.rep_id;
          updates.rep_provisioned_at = new Date().toISOString();
        }
      }

      const data = await db.update('city_leads', id, updates);
      return res.json(Object.assign({}, data, provisioned ? { provisioned } : {}));
    }
  } catch (e) {
    console.error('city-leads:', e.message);
    return res.status(500).json({ error: e.message });
  }

  res.status(405).json({ error: 'Method not allowed' });
};

module.exports.config = { maxDuration: 30 };
