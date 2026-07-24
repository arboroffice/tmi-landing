// TMI OS — build requests. This is the seam between the client and TMI: the OS is
// where a client lays out everything they want their operation to be, and a
// request is how they hand a piece to TMI to build the real backend for. A worker
// they want wired to their actual dispatch system, a connection to their books, a
// report they need. The client creates and tracks it here; TMI fulfills it from
// the admin console (tmi-clients) and marks it live, which shows up right here.
//
// POST { action, ... }
//   'list'                              -> { requests }
//   'create' { title, detail, category }-> { request }
//   'cancel' { id }                     -> { ok: true }

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');

const CATEGORIES = ['worker', 'integration', 'data', 'workflow', 'report', 'other'];

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;
  const tid = t.tenant_id;
  const b = req.body || {};
  const action = String(b.action || 'list');

  try {
    if (action === 'list') {
      const requests = await db.list('os_requests', { where: [['tenant_id', '==', tid]], order: 'created_at', ascending: false, limit: 200 });
      return res.status(200).json({ requests });
    }

    if (!requireRole(t, res, 'manager')) return;

    if (action === 'create') {
      const title = String(b.title || '').slice(0, 200).trim();
      if (!title) return res.status(400).json({ error: 'Tell TMI what you want built' });
      const category = CATEGORIES.includes(b.category) ? b.category : 'other';
      const now = new Date().toISOString();
      const request = await db.insert('os_requests', {
        tenant_id: tid, title, detail: String(b.detail || '').slice(0, 4000),
        category, status: 'requested', tmi_note: null,
        requested_by: t.email || null, created_at: now, updated_at: now,
      });
      await db.insert('os_build_log', { tenant_id: tid, kind: 'request', summary: `Requested from TMI: ${title}.`, created_at: now }).catch(() => {});
      return res.status(201).json({ request });
    }

    if (action === 'update') {
      const id = String(b.id || '');
      const cur = await db.getById('os_requests', id);
      if (!cur || cur.tenant_id !== tid) return res.status(404).json({ error: 'Request not found' });
      if (['live', 'building'].includes(cur.status)) return res.status(400).json({ error: 'TMI is already building this one. Message us to change it.' });
      const patch = { updated_at: new Date().toISOString() };
      if (b.title !== undefined) { const tt = String(b.title || '').slice(0, 200).trim(); if (!tt) return res.status(400).json({ error: 'A title is required' }); patch.title = tt; }
      if (b.detail !== undefined) patch.detail = String(b.detail || '').slice(0, 4000);
      if (b.category !== undefined && CATEGORIES.includes(b.category)) patch.category = b.category;
      const request = await db.update('os_requests', id, patch);
      return res.status(200).json({ request });
    }

    if (action === 'cancel') {
      const id = String(b.id || '');
      const cur = await db.getById('os_requests', id);
      if (!cur || cur.tenant_id !== tid) return res.status(404).json({ error: 'Request not found' });
      if (['live', 'building'].includes(cur.status)) return res.status(400).json({ error: 'TMI is already on this one. Message us to change it.' });
      await db.update('os_requests', id, { status: 'cancelled', updated_at: new Date().toISOString() });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-requests:', e.message);
    return res.status(500).json({ error: 'Could not save that request' });
  }
};
