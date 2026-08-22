// Step 2 of webinar sign-up: enrich an already-created registration with the
// business details (company, website, revenue, goal). Best-effort and never
// required. Matched by token, with email as a fallback.
//
//   POST { token?, email?, company?, website?, revenue?, goal? } -> { ok }

const db = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const b = req.body || {};
  const token = (b.token || '').trim();
  const email = (b.email || '').trim().toLowerCase();
  const company = (b.company || '').trim();
  const website = (b.website || '').trim();
  const revenue = (b.revenue || '').trim();
  const goal = (b.goal || '').trim();

  if (!token && !email) return res.status(400).json({ error: 'token or email required' });

  // Only write fields the visitor actually filled in.
  const fields = {};
  if (company) fields.company = company;
  if (website) fields.website = website;
  if (revenue) fields.revenue = revenue;
  if (goal) fields.goal = goal;
  if (!Object.keys(fields).length) return res.status(200).json({ ok: true, empty: true });

  // 1) Update the registration record.
  let reg = null;
  try {
    reg = token ? await db.findOne('webinar_registrations', 'token', token) : null;
    if (!reg && email) reg = await db.findOne('webinar_registrations', 'email', email);
    if (reg && reg.id) await db.update('webinar_registrations', reg.id, fields);
  } catch (e) { console.error('webinar-enrich reg:', e.message); }

  // 2) Update the contact so the rest of the CRM sees the details.
  const contactEmail = email || (reg && reg.email);
  if (contactEmail) {
    try {
      const existing = await db.findOne('contacts', 'email', contactEmail).catch(() => null);
      const note = [existing && existing.notes, goal ? `Wants off their plate: ${goal}` : null, revenue ? `Revenue: ${revenue}` : null]
        .filter(Boolean).join('\n');
      await db.upsertByField('contacts', 'email', contactEmail, {
        email: contactEmail,
        company: company || (existing && existing.company) || null,
        website: website || (existing && existing.website) || null,
        revenue: revenue || (existing && existing.revenue) || null,
        notes: note || (existing && existing.notes) || null,
      });
    } catch (e) { console.error('webinar-enrich contact:', e.message); }
  }

  return res.status(200).json({ ok: true });
};
