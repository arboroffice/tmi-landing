const db = require('./_db');
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

  if (req.method === 'GET') {
    try {
      const data = await db.getById('proposals', id);
      if (!data) return res.status(404).json({ error: 'Proposal not found' });
      return res.json(data);
    } catch (e) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const typedName = (body.typed_name || '').trim();
    const email = (body.email || '').trim();
    if (!typedName) return res.status(400).json({ error: 'typed_name required' });

    // Load the proposal first so we can validate state and use its fields.
    let proposal;
    try {
      proposal = await db.getById('proposals', id);
    } catch (e) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

    if (proposal.status === 'accepted' || proposal.status === 'won') {
      return res.json({ ok: true, accepted: true, already: true, client_created: false, invoice_created: false });
    }

    // Critical write: mark accepted and append the signature to notes.
    const signedAt = new Date().toISOString();
    const signature = `Accepted & signed by ${typedName}${email ? ' (' + email + ')' : ''} on ${signedAt}`;
    const newNotes = proposal.notes ? `${proposal.notes}\n\n${signature}` : signature;

    try {
      await db.update('proposals', id, { status: 'accepted', notes: newNotes });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }

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
        const client = await db.insert('clients', {
          contact_id: proposal.contact_id,
          plan: proposal.title || null,
          status: 'active',
          mrr: mrr,
          start_date: signedAt,
        });
        if (client) {
          clientCreated = true;
          newClientId = client.id;
        }
      }
    } catch (e) { /* skip - acceptance already saved */ }

    // Create an invoice row for the accepted amount.
    try {
      const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await db.insert('invoices', {
        client_id: newClientId,
        contact_id: proposal.contact_id || null,
        amount: proposal.total != null ? parseFloat(proposal.total) : null,
        status: 'unpaid',
        description: proposal.title || null,
        due_date: due,
      });
      invoiceCreated = true;
    } catch (e) { /* skip - acceptance already saved */ }

    // Log an activity row.
    try {
      await db.insert('activities', {
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
