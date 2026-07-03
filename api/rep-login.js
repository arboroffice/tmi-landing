// City-lead rep login, and admin-only rep creation.
//   POST { email, password }                     -> { token, rep }
//   POST { action:'create', name,email,password,city,phone }  (admin bearer) -> creates a rep
const db = require('./_db');
const { cors, verifyToken } = require('./_auth');
const { hashPassword, verifyPassword, signRep } = require('./_rep-auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  const body = req.body || {};

  // Admin creates a rep account for a new city lead.
  if (body.action === 'create') {
    const admin = verifyToken && verifyToken(req);
    if (!admin) return res.status(401).json({ error: 'Admin auth required' });
    const { name, email, password, city, phone } = body;
    if (!email || !email.includes('@') || !password || String(password).length < 8) {
      return res.status(400).json({ error: 'Email and an 8+ character password are required' });
    }
    const em = String(email).toLowerCase().trim();
    if (await db.findOne('reps', 'email', em)) return res.status(409).json({ error: 'A rep with that email already exists' });
    const rep = await db.insert('reps', {
      name: name || em, email: em, city: city || null, phone: phone || null,
      password: hashPassword(password), status: 'active', created_at: new Date().toISOString(),
    });
    return res.status(201).json({ ok: true, rep: { id: rep.id, name: rep.name, email: em, city: rep.city } });
  }

  // Rep login.
  const { email, password } = body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const em = String(email).toLowerCase().trim();
  try {
    // Match on the normalized email (trim + lowercase), not just the exact
    // stored string. This self-heals a stored email with a stray space or odd
    // case, and duplicate rep rows created during setup: we authenticate against
    // whichever active record actually matches the password.
    const candidates = [];
    const exact = await db.findOne('reps', 'email', em);
    if (exact) candidates.push(exact);
    const all = await db.list('reps', { limit: 500 }).catch(() => []);
    for (const r of all) {
      if (r && r.email && String(r.email).toLowerCase().trim() === em && !candidates.some((c) => c.id === r.id)) {
        candidates.push(r);
      }
    }
    const active = candidates.filter((r) => r.status !== 'disabled');
    const rep = active.find((r) => verifyPassword(password, r.password));
    if (!rep) {
      // Diagnostic (no secrets): how many rows matched the email, and did any password verify.
      console.log(`rep-login fail email=${JSON.stringify(em)} total=${(all || []).length} candidates=${candidates.length} active=${active.length} pwMatched=false`);
      return res.status(401).json({ error: 'Wrong email or password' });
    }
    return res.json({ token: signRep(rep), rep: { id: rep.id, name: rep.name, email: rep.email || em, city: rep.city, phone: rep.phone } });
  } catch (e) { console.error('rep-login error:', e.message); return res.status(500).json({ error: e.message }); }
};
