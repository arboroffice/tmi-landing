// Current rep's profile from their token.
const db = require('./_db');
const { cors } = require('./_auth');
const { requireRep } = require('./_rep-auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const r = await requireRep(req, res); if (!r) return;
  try {
    const rep = await db.getById('reps', r.sub);
    if (!rep) return res.status(404).json({ error: 'Not found' });
    return res.json({ id: rep.id, name: rep.name, email: rep.email, city: rep.city, phone: rep.phone });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
