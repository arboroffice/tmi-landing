const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

const BEEHIIV_API = 'https://api.beehiiv.com/v2';

function assembleContentHtml(issue) {
  const sec = (label, text) =>
    text ? `<h2>${label}</h2><p>${(text || '').replace(/\n/g, '<br/>')}</p>` : '';
  return [
    issue.cold_open   ? `<p><strong>${issue.cold_open.replace(/\n/g,'<br/>')}</strong></p>` : '',
    sec('Setup',          issue.setup),
    sec('The Turn',       issue.the_turn),
    sec('The Proof',      issue.the_proof),
    issue.pull_quote ? `<blockquote>${issue.pull_quote}</blockquote>` : '',
    sec('Online Business', issue.online_example),
    sec('Physical Business', issue.physical_example),
    sec('What To Do Next', issue.next_step),
  ].filter(Boolean).join('\n');
}

async function pushToBeehiiv(issue) {
  const apiKey = process.env.BEEHIIV_API_KEY;
  const pubId  = process.env.BEEHIIV_PUB_ID;
  if (!apiKey || !pubId) throw new Error('BEEHIIV_API_KEY or BEEHIIV_PUB_ID not configured');

  const payload = {
    title:        issue.headline || '(untitled)',
    subtitle:     issue.dek || '',
    content_html: assembleContentHtml(issue),
    status:       issue.scheduled_at ? 'confirmed' : 'draft',
  };
  if (issue.scheduled_at) payload.schedule_for = issue.scheduled_at;

  const url    = issue.beehiiv_id
    ? `${BEEHIIV_API}/publications/${pubId}/posts/${issue.beehiiv_id}`
    : `${BEEHIIV_API}/publications/${pubId}/posts`;
  const method = issue.beehiiv_id ? 'PUT' : 'POST';

  const resp = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || `Beehiiv API error ${resp.status}`);
  }
  return resp.json();
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    const { id, status, series } = req.query;

    if (id) {
      const { data, error } = await db.from('fotf_issues').select('*').eq('id', id).single();
      if (error) return res.status(404).json({ error: error.message });
      return res.json(data);
    }

    let query = db.from('fotf_issues').select('*').order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    if (series) query = query.eq('series', series);

    const { data, error } = await query.limit(200);
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'POST') {
    const { action, ...body } = req.body || {};

    // Push existing issue to Beehiiv
    if (action === 'push-beehiiv') {
      const { id } = body;
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data: issue, error: fe } = await db.from('fotf_issues').select('*').eq('id', id).single();
      if (fe) return res.status(404).json({ error: fe.message });

      try {
        const bData = await pushToBeehiiv(issue);
        const beehiivId = bData.data?.id || issue.beehiiv_id;
        await db.from('fotf_issues').update({ beehiiv_id: beehiivId, updated_at: new Date().toISOString() }).eq('id', id);
        return res.json({ ok: true, beehiiv_id: beehiivId });
      } catch (e) {
        return res.status(502).json({ error: e.message });
      }
    }

    // Create new issue
    const { data, error } = await db
      .from('fotf_issues')
      .insert({ ...body, status: 'draft', updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'PUT') {
    const { id, ...fields } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    fields.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from('fotf_issues')
      .update(fields)
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { data: issue } = await db.from('fotf_issues').select('status').eq('id', id).single();
    if (issue?.status === 'sent') return res.status(400).json({ error: 'Cannot delete a sent issue' });
    const { error } = await db.from('fotf_issues').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
