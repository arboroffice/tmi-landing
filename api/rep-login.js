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
    const rep = await db.findOne('reps', 'email', em);
    if (!rep || rep.status === 'disabled' || !verifyPassword(password, rep.password)) {
      return res.status(401).json({ error: 'Wrong email or password' });
    }
    return res.json({ token: signRep(rep), rep: { id: rep.id, name: rep.name, email: em, city: rep.city, phone: rep.phone } });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
