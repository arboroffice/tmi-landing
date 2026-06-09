const { getSupabase } = require('./_supabase');
const { cors } = require('./_auth');

// PUBLIC self-serve proposal acceptance. No requireAuth - the prospect signs
// this themselves via a shared link. The critical write is flipping the
// proposal to 'accepted' and recording the typed-name signature. Creating the
// client / invoice / activity rows is best-effort and must never block or fail
// the acceptance.
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'id required' });

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    const { data, error } = await db
      .from('proposals')
      .select('id, title, total, sections, line_items, status, expires_at, contact_id')
      .eq('id', id)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Proposal not found' });
    return res.json(data);
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const typedName = (body.typed_name || '').trim();
    const email = (body.email || '').trim();
    if (!typedName) return res.status(400).json({ error: 'typed_name required' });

    // Load the proposal first so we can validate state and use its fields.
    const { data: proposal, error: pErr } = await db
      .from('proposals')
      .select('id, title, total, status, notes, contact_id')
      .eq('id', id)
      .single();
    if (pErr || !proposal) return res.status(404).json({ error: 'Proposal not found' });

    if (proposal.status === 'accepted' || proposal.status === 'won') {
      return res.json({ ok: true, accepted: true, already: true, client_created: false, invoice_created: false });
    }

    // Critical write: mark accepted and append the signature to notes.
    const signedAt = new Date().toISOString();
    const signature = `Accepted & signed by ${typedName}${email ? ' (' + email + ')' : ''} on ${signedAt}`;
    const newNotes = proposal.notes ? `${proposal.notes}\n\n${signature}` : signature;

    const { error: upErr } = await db
      .from('proposals')
      .update({ status: 'accepted', notes: newNotes })
      .eq('id', id);
    if (upErr) return res.status(500).json({ error: upErr.message });

    // ---- Best-effort downstream creates. Never 500 from here. ----
    let clientCreated = false;
    let invoiceCreated = false;
    let newClientId = null;

    // Create a client row from the proposal contact.
    try {
      if (proposal.contact_id) {
        const total = parseFloat(proposal.total || 0);
        const looksMonthly = /month|\/mo\b|mrr|retainer|monthly|per month/i.test(proposal.title || '');
        const mrr = looksMonthly ? total : 0;
        const { data: client, error: cErr } = await db
          .from('clients')
          .insert({
            contact_id: proposal.contact_id,
            plan: proposal.title || null,
            status: 'active',
            mrr: mrr,
            start_date: signedAt,
          })
          .select('id')
          .single();
        if (!cErr && client) {
          clientCreated = true;
          newClientId = client.id;
        }
      }
    } catch (e) { /* skip - acceptance already saved */ }

    // Create an invoice row for the accepted amount.
    try {
      const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error: iErr } = await db
        .from('invoices')
        .insert({
          client_id: newClientId,
          contact_id: proposal.contact_id || null,
          amount: proposal.total != null ? parseFloat(proposal.total) : null,
          status: 'unpaid',
          description: proposal.title || null,
          due_date: due,
        });
      if (!iErr) invoiceCreated = true;
    } catch (e) { /* skip - acceptance already saved */ }

    // Log an activity row.
    try {
      await db
        .from('activities')
        .insert({
          contact_id: proposal.contact_id || null,
          type: 'note',
          title: 'Proposal accepted & signed',
          body: `${proposal.title || 'Proposal'} accepted & signed by ${typedName}${email ? ' (' + email + ')' : ''} on ${signedAt}.`,
        });
    } catch (e) { /* skip - acceptance already saved */ }

    return res.json({ ok: true, accepted: true, client_created: clientCreated, invoice_created: invoiceCreated });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
