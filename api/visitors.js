const db = require('./_db');
const { requireAuth, cors } = require('./_auth');
const { scoreVisitor } = require('./_visitor-score');

// Admin read/manage for identified site visitors (RB2B).
//   GET            -> list visitors (scored, with dedup/suppression flags)
//   PUT  ?id=      -> update safe fields (linkedin_status)
//   DELETE ?id=    -> remove a visitor row

const OWN_DOMAINS = ['tmitechai.com', 'tmi-technology.com', 'arboroffice.io'];

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    let data;
    try {
      // Firestore allows one orderBy direction per query without a composite
      // index; sort by score desc then last_seen desc in JS to match the old query.
      data = await db.list('site_visitors', { order: 'score', ascending: false, limit: 1000 });
      data.sort((a, b) => (b.score || 0) - (a.score || 0) || String(b.last_seen || '').localeCompare(String(a.last_seen || '')));
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }

    // Build suppression sets so the UI can flag known people / clients / opt-outs.
    const emails = [...new Set((data || []).map(v => (v.email || v.personal_email || '').toLowerCase()).filter(Boolean))];
    const known = new Set(), unsub = new Set(), clients = new Set();
    if (emails.length) {
      // Firestore 'in' is capped at 30 values, so chunk the email lists.
      const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
      const fetchIn = async (coll, field, vals) => {
        const out = [];
        for (const part of chunk(vals, 30)) {
          try { out.push(...await db.list(coll, { where: [[field, 'in', part]] })); } catch { /* best effort */ }
        }
        return out;
      };
      const [c, l, cl] = await Promise.all([
        fetchIn('contacts', 'email', emails),
        fetchIn('leads', 'email', emails),
        fetchIn('clients', 'email', emails),
      ]);
      c.forEach(r => r.email && known.add(r.email.toLowerCase()));
      l.forEach(r => { if (r.email && r.status === 'unsubscribed') unsub.add(r.email.toLowerCase()); });
      cl.forEach(r => r.email && clients.add(r.email.toLowerCase()));
    }

    const out = (data || []).map(v => {
      const email = (v.email || v.personal_email || '').toLowerCase();
      const domain = email.includes('@') ? email.split('@')[1] : '';
      const score = (v.score != null && v.score > 0) ? v.score : scoreVisitor(v).score;
      return {
        ...v, score,
        flags: {
          known: known.has(email),
          client: clients.has(email),
          unsubscribed: unsub.has(email),
          own_domain: OWN_DOMAINS.includes(domain),
        },
      };
    });
    return res.json(out);
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const body = req.body || {};
    const patch = {};
    if (typeof body.linkedin_status === 'string') patch.linkedin_status = body.linkedin_status;
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'nothing to update' });
    try {
      const data = await db.update('site_visitors', id, patch);
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      await db.remove('site_visitors', id);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
};
