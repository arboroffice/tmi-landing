// One-time bootstrap: create the FIRST city-lead rep when none exist yet.
// Refuses once any rep exists (use Admin > City Team after that). Safe to remove.
const db = require('./_db');
const { hashPassword } = require('./_rep-auth');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const existing = await db.list('reps', { limit: 1 });
    if (existing && existing.length) {
      return res.status(403).json({ error: 'Setup already complete. Add reps in Admin > City Team.' });
    }
    const { email, password, name, city, phone } = req.body || {};
    if (!email || !email.includes('@') || !password || String(password).length < 8) {
      return res.status(400).json({ error: 'A valid email and an 8+ character password are required' });
    }
    const em = String(email).toLowerCase().trim();
    const rep = await db.insert('reps', {
      name: name || em, email: em, city: city || null, phone: phone || null,
      password: hashPassword(password), status: 'active', created_at: new Date().toISOString(),
    });
    return res.status(201).json({ ok: true, rep: { id: rep.id, email: em, name: rep.name } });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
