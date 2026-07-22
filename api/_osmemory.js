// TMI OS — durable customer and contact memory. This is the layer that lets a
// worker remember who it is talking to: every inbound person becomes a contact,
// deduped by phone or email, and every thread and message stays tied to them, so
// the next time they reach out the OS can recall the whole history and ground a
// reply in it instead of starting cold.
//
// Collections:
//   os_contacts { tenant_id, name, phone, email, company, notes, meta, created_at, updated_at }
//   os_threads  { tenant_id, ..., contact_id, ... }
//   os_messages { tenant_id, thread_id, ... }
//
// All queries push at most one filter to Firestore and refine the rest in JS, so
// no composite index is ever required.

const db = require('./_db');

function clean(v, max) {
  if (v == null) return '';
  const s = String(v).trim();
  return max ? s.slice(0, max) : s;
}

// Create or merge a contact for this tenant. Dedupe by phone first, then email.
// On a hit, only fill or overwrite fields that were actually supplied.
async function upsertContact(tenantId, data = {}) {
  const phone = clean(data.phone, 40);
  const email = clean(data.email, 200).toLowerCase();
  const name = clean(data.name, 120);
  const company = clean(data.company, 160);
  const notes = clean(data.notes, 4000);
  const meta = data.meta && typeof data.meta === 'object' ? data.meta : null;
  const now = new Date().toISOString();

  let existing = null;
  if (phone) existing = await db.findOne('os_contacts', 'phone', phone).catch(() => null);
  if (!existing && email) existing = await db.findOne('os_contacts', 'email', email).catch(() => null);
  // Guard cross-tenant collisions: a match from another tenant is not ours.
  if (existing && existing.tenant_id !== tenantId) existing = null;

  if (existing) {
    const patch = { updated_at: now };
    if (name) patch.name = name;
    if (phone) patch.phone = phone;
    if (email) patch.email = email;
    if (company) patch.company = company;
    if (notes) patch.notes = notes;
    if (meta) patch.meta = Object.assign({}, existing.meta || {}, meta);
    return db.update('os_contacts', existing.id, patch);
  }

  return db.insert('os_contacts', {
    tenant_id: tenantId,
    name, phone, email, company, notes,
    meta: meta || {},
    created_at: now,
    updated_at: now,
  });
}

// Look up one contact by id, phone, or email (scoped to the tenant).
async function findContact(tenantId, { phone, email, id } = {}) {
  if (id) {
    const c = await db.getById('os_contacts', String(id));
    return c && c.tenant_id === tenantId ? c : null;
  }
  const p = clean(phone, 40);
  if (p) {
    const c = await db.findOne('os_contacts', 'phone', p).catch(() => null);
    if (c && c.tenant_id === tenantId) return c;
  }
  const e = clean(email, 200).toLowerCase();
  if (e) {
    const c = await db.findOne('os_contacts', 'email', e).catch(() => null);
    if (c && c.tenant_id === tenantId) return c;
  }
  return null;
}

// Pull everything a worker needs to answer this contact with memory: the contact
// record, their recent threads, and the recent messages across those threads.
async function recall(tenantId, { contact_id } = {}) {
  const contact = await findContact(tenantId, { id: contact_id });
  if (!contact) return { contact: null, threads: [], messages: [] };

  const threads = (await db.list('os_threads', {
    where: [['contact_id', '==', contact.id]],
    order: 'last_at', ascending: false, limit: 10,
  })).filter(t => t.tenant_id === tenantId);

  const threadIds = new Set(threads.map(t => t.id));
  let messages = [];
  if (threadIds.size) {
    // One filter to Firestore (tenant), refine to this contact's threads in JS.
    const all = await db.list('os_messages', {
      where: [['tenant_id', '==', tenantId]],
      order: 'created_at', ascending: false, limit: 200,
    });
    messages = all.filter(m => threadIds.has(m.thread_id)).slice(0, 40);
  }

  return { contact, threads, messages };
}

module.exports = { upsertContact, findContact, recall };
