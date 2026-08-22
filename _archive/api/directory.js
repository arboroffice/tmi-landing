// Member directory: members who opted in (signed-in members only). Minimal fields.
const db = require('./_db');
const { cors } = require('./_auth');
const { requireMember } = require('./_member-auth');
module.exports = async function handler(req, res) {
  cors(res); if (req.method === 'OPTIONS') return res.status(200).end();
  const m = requireMember(req, res); if (!m) return;
  try {
    const rows = await db.list('members', { where: [['directory_opt_in', '==', true]], limit: 500 });
    return res.json(rows.map(r => ({ id: r.id, name: r.name || null, company: r.company || null, title: r.title || null, bio: r.bio || null })));
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
