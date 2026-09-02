// Client Document Agent (admin-only). Prepares, queues, and - only on Mia's
// explicit Approve & Send - sends TMI kit documents for e-signature.
//
// Honors the kit's eight gates: this endpoint DRAFTS and PREPARES freely, but
// nothing goes to a client until an admin (Mia) calls action:'approve_send'.
// That authenticated click is the explicit yes the kit requires.
//
// Actions (POST body.action):
//   'manifest'      -> library: documents, triggers, gates, config
//   'prepare'       -> build a packet for a client from trigger answers
//   'approve_send'  -> Mia's yes: create SignNow docs + invites, mark sent
//   'refresh'       -> poll SignNow for signer status
//   'list'          -> recent packets
// GET ?packet_id= returns one packet (with fresh status if sent).

const db = require('./_db');
const kit = require('./_doc-kit');
const signnow = require('./_signnow');
const { requireAuth, cors } = require('./_auth');

const COLL = 'client_documents';

// Best-effort mapping from a client/contact record to a document's fill-in
// fields. Only safe, non-protected fields are auto-filled. Protected fields
// (SOS names, bank, ROI, insurance) are never filled - they are flagged.
function autofill(doc, client) {
  const c = client || {};
  const today = new Date().toISOString().slice(0, 10);
  const src = {
    client_name: c.name || c.company || c.client_name,
    company: c.name || c.company,
    owner: c.owner || c.contact_name || c.primary_contact,
    date: today,
    valid_until: new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10),
    bill_to: c.name || c.company,
    site: c.site || c.address,
    site_address: c.address,
    certificate_holder: c.name || c.company,
  };
  const protectedFields = new Set(kit.protectedFields(doc));
  const filled = {};
  const missing = [];
  const needsHand = [];
  for (const f of doc.fields || []) {
    if (protectedFields.has(f)) { needsHand.push(f); continue; }
    if (src[f] != null && src[f] !== '') filled[f] = src[f];
    else missing.push(f);
  }
  return { filled, missing, needsHand };
}

async function loadClient(client_id, contact_id) {
  if (client_id) {
    const c = await db.getById('clients', client_id).catch(() => null);
    if (c) return c;
  }
  if (contact_id) {
    const c = await db.getById('contacts', contact_id).catch(() => null);
    if (c) return c;
  }
  return null;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return; // admin (Mia) only - this is the gate

  try {
    if (req.method === 'GET') {
      if (req.query.packet_id) {
        let p = await db.getById(COLL, req.query.packet_id);
        if (!p) return res.status(404).json({ error: 'packet not found' });
        if (p.status === 'sent' && signnow.isConfigured()) p = await refreshPacket(p).catch(() => p);
        return res.json(p);
      }
      const rows = await db.list(COLL, { order: 'created_at', ascending: false, limit: 50 });
      return res.json(rows || []);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
    const body = req.body || {};
    const action = body.action;

    if (action === 'manifest') {
      return res.json({
        version: kit.version,
        documents: kit.DOCUMENTS,
        triggers: kit.TRIGGERS,
        gates: kit.GATES,
        never_store: kit.NEVER_STORE,
        signnow_connected: signnow.isConfigured(),
      });
    }

    if (action === 'prepare') {
      const { client_id, contact_id, answers, engagement_name } = body;
      const docs = kit.documentsForTriggers(answers || {});
      if (!docs.length) return res.status(400).json({ error: 'No documents match those answers. Check at least one trigger.' });
      const client = await loadClient(client_id, contact_id);

      const items = docs.map(doc => {
        const { filled, missing, needsHand } = autofill(doc, client);
        return {
          id: doc.id, file: doc.file, title: doc.title, category: doc.category, order: doc.order,
          purpose: doc.purpose, drafts: doc.drafts, sends: doc.sends, gate: doc.gate,
          related_section: doc.relatedSection,
          filled, missing, needs_hand: needsHand,
          status: 'DO_NOT_SEND',
        };
      });

      const packet = await db.insert(COLL, {
        client_id: client_id || null,
        contact_id: contact_id || null,
        client_name: (client && (client.name || client.company)) || engagement_name || 'Unnamed engagement',
        engagement_name: engagement_name || null,
        answers: answers || {},
        items,
        status: 'prepared',       // prepared -> approved -> sent -> signed
        do_not_send: true,
        gates: kit.GATES,
        approvals_log: [],
        created_at: new Date().toISOString(),
      });
      return res.json({ ok: true, packet, note: 'Prepared as DO NOT SEND. Review, fill the flagged fields, then Approve & Send.' });
    }

    if (action === 'approve_send') {
      // ---- Mia's explicit yes. This is the gate crossing. ----
      const { packet_id, document_ids, sender_email, prefill_overrides } = body;
      const packet = await db.getById(COLL, packet_id);
      if (!packet) return res.status(404).json({ error: 'packet not found' });
      if (!signnow.isConfigured()) {
        return res.status(400).json({ error: 'SignNow is not connected. Set SIGNNOW_ACCESS_TOKEN and seed templates before sending.', code: 'SIGNNOW_NOT_CONFIGURED' });
      }
      const signerEmail = body.signer_email;
      if (!signerEmail) return res.status(400).json({ error: 'signer_email (the client signer) is required to send.' });

      // SignNow template ids are seeded into the doc_templates collection
      // (see scripts/seed-doc-kit.js), keyed by document id.
      const tplRows = await db.list('doc_templates', {}).catch(() => []);
      const tplMap = {};
      for (const r of tplRows || []) if (r.doc_id || r.id) tplMap[r.doc_id || r.id] = r.signnow_template_id;

      const chosen = (packet.items || []).filter(it => !document_ids || document_ids.includes(it.id));
      const results = [];
      for (const it of chosen) {
        const tplId = tplMap[it.id]; // seeded SignNow template id
        if (!tplId) { results.push({ id: it.id, ok: false, error: 'No SignNow template seeded for this document.' }); continue; }
        const overrides = (prefill_overrides && prefill_overrides[it.id]) || {};
        const prefill = Object.entries({ ...it.filled, ...overrides }).map(([field_name, prefilled_text]) => ({ field_name, prefilled_text }));
        try {
          const { documentId } = await signnow.createFromTemplate(tplId, { documentName: `${packet.client_name} - ${it.title}`, prefill });
          await signnow.sendInvite(documentId, {
            signers: [{ email: signerEmail, role: 'Signer', order: 1 }],
            from: sender_email || 'mia@tmitechai.com',
            subject: `Please sign: ${it.title} - TMI`,
            message: 'Your document from TMI is ready for signature.',
          });
          it.status = 'SENT'; it.signnow_document_id = documentId; it.sent_at = new Date().toISOString();
          results.push({ id: it.id, ok: true, documentId });
        } catch (e) {
          results.push({ id: it.id, ok: false, error: e.message });
        }
      }

      const anySent = results.some(r => r.ok);
      const logEntry = {
        at: new Date().toISOString(),
        action: 'approve_send',
        signer_email: signerEmail,
        documents: chosen.map(c => c.id),
        results,
      };
      await db.update(COLL, packet_id, {
        items: packet.items,
        status: anySent ? 'sent' : packet.status,
        do_not_send: false,
        approvals_log: [...(packet.approvals_log || []), logEntry],
      });
      return res.json({ ok: anySent, results, note: anySent ? 'Sent for signature. Reminders are on.' : 'Nothing sent - see errors.' });
    }

    if (action === 'refresh') {
      const packet = await db.getById(COLL, body.packet_id);
      if (!packet) return res.status(404).json({ error: 'packet not found' });
      const updated = await refreshPacket(packet);
      return res.json(updated);
    }

    if (action === 'list') {
      const rows = await db.list(COLL, { order: 'created_at', ascending: false, limit: 50 });
      return res.json(rows || []);
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

async function refreshPacket(packet) {
  if (!signnow.isConfigured()) return packet;
  let changed = false;
  let allSigned = true;
  for (const it of packet.items || []) {
    if (!it.signnow_document_id) { if (it.status !== 'SIGNED') allSigned = false; continue; }
    try {
      const st = await signnow.getStatus(it.signnow_document_id);
      const next = st.signed ? 'SIGNED' : 'SENT';
      if (next !== it.status) { it.status = next; changed = true; }
      if (!st.signed) allSigned = false;
      it.signers = st.invites;
    } catch { allSigned = false; }
  }
  const status = allSigned && (packet.items || []).length ? 'signed' : packet.status;
  if (changed || status !== packet.status) {
    await db.update(COLL, packet.id, { items: packet.items, status });
    packet.status = status;
  }
  return packet;
}
