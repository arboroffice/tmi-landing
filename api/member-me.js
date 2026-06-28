// Current member profile.
const db = require('./_db');
const { cors } = require('./_auth');
const { requireMember } = require('./_member-auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const m = requireMember(req, res); if (!m) return;
  try {
    if (req.method === 'GET') {
      const row = await db.getById('members', m.sub);
      if (!row) return res.status(404).json({ error: 'Not found' });
      delete row.password;
      return res.json(row);
    }
    if (req.method === 'PATCH' || req.method === 'PUT') {
      const { name, company, password, ...rest } = req.body || {};
      const fields = {};
      if (name != null) fields.name = name;
      if (company != null) fields.company = company;
      await db.update('members', m.sub, fields);
      return res.json({ ok: true });
    }
    return res.status(405).end();
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
