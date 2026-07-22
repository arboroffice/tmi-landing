// TMI OS — customer memory, tenant-facing. Read and manage the durable contact
// book that the inbound rails build up: list contacts, recall one contact with
// its threads and messages for grounding a reply, or upsert a contact by hand.
// Every operation is scoped to the caller's tenant.
//
// POST { action }:
//   'contacts'                   -> { contacts }
//   'get'    { contact_id }      -> { contact, threads, messages }
//   'upsert' { data }  (manager) -> { contact }

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');
const memory = require('./_osmemory');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;

  const tid = t.tenant_id;
  const b = req.body || {};
  const action = String(b.action || '');

  try {
    if (action === 'contacts') {
      const contacts = await db.list('os_contacts', {
        where: [['tenant_id', '==', tid]],
        order: 'updated_at', ascending: false, limit: 500,
      });
      return res.status(200).json({ contacts });
    }

    if (action === 'get') {
      const contact_id = String(b.contact_id || '');
      if (!contact_id) return res.status(400).json({ error: 'contact_id required' });
      const recalled = await memory.recall(tid, { contact_id });
      if (!recalled.contact) return res.status(404).json({ error: 'Contact not found' });
      return res.status(200).json(recalled);
    }

    if (action === 'upsert') {
      if (!requireRole(t, res, 'manager')) return;
      const data = b.data && typeof b.data === 'object' ? b.data : {};
      const contact = await memory.upsertContact(tid, data);
      return res.status(200).json({ contact });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-memory:', e.message);
    return res.status(500).json({ error: 'Could not complete that' });
  }
};
