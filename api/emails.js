const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    const { id } = req.query;
    if (id) {
      try {
        const data = await db.getById('email_campaigns', id);
        if (!data) return res.status(404).json({ error: 'Not found' });
        return res.json(data);
      } catch (e) { return res.status(404).json({ error: e.message }); }
    }
    try {
      const data = await db.list('email_campaigns', { order: 'created_at', ascending: false, limit: 200 });
      return res.json(data);
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    try {
      const data = await db.insert('email_campaigns', {
        subject: body.subject,
        body: body.body,
        from_name: body.from_name || 'TMI',
        from_email: body.from_email,
        reply_to: body.reply_to || null,
        audience_type: body.audience_type || 'all',
        audience_filter: body.audience_filter || null,
        status: body.status || 'draft'
      });
      return res.status(201).json(data);
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (req.method === 'PUT') {
    const body = req.body || {};
    const { id } = body;
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      const data = await db.update('email_campaigns', id, {
        subject: body.subject,
        body: body.body,
        from_name: body.from_name || 'TMI',
        from_email: body.from_email,
        reply_to: body.reply_to || null,
        audience_type: body.audience_type || 'all',
        audience_filter: body.audience_filter || null,
        status: body.status || 'draft'
      });
      return res.json(data);
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      await db.remove('email_campaigns', id);
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  res.status(405).json({ error: 'Method not allowed' });
};
