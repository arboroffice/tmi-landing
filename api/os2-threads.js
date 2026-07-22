// TMI OS — the shared inbox. This is the tenant-facing side of the inbound rails:
// list threads, open one with its full message history and contact, reply (which
// also attempts real delivery through the action layer), assign a thread to a
// worker, or change its status. Every operation is scoped to the caller's tenant
// and verified on the thread before anything is read or written.
//
// POST { action }:
//   'list'   { status? }                      -> { threads }
//   'get'    { thread_id }                     -> { thread, messages, contact }
//   'reply'  { thread_id, body }  (manager)    -> { message }
//   'assign' { thread_id, worker_id, department_id } (manager) -> { thread }
//   'status' { thread_id, status } (manager)   -> { thread }

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');

const STATUSES = ['open', 'snoozed', 'closed'];

async function ownThread(tid, thread_id) {
  const id = String(thread_id || '');
  if (!id) return null;
  const thread = await db.getById('os_threads', id);
  if (!thread || thread.tenant_id !== tid) return null;
  return thread;
}

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
    if (action === 'list') {
      let threads = await db.list('os_threads', {
        where: [['tenant_id', '==', tid]],
        order: 'last_at', ascending: false, limit: 100,
      });
      if (b.status) threads = threads.filter(x => x.status === b.status);
      return res.status(200).json({ threads });
    }

    if (action === 'get') {
      const thread = await ownThread(tid, b.thread_id);
      if (!thread) return res.status(404).json({ error: 'Thread not found' });
      const messages = (await db.list('os_messages', {
        where: [['thread_id', '==', thread.id]],
        order: 'created_at', ascending: true, limit: 500,
      })).filter(m => m.tenant_id === tid);
      const contact = thread.contact_id ? await db.getById('os_contacts', thread.contact_id) : null;
      return res.status(200).json({ thread, messages, contact: contact && contact.tenant_id === tid ? contact : null });
    }

    if (action === 'reply') {
      if (!requireRole(t, res, 'manager')) return;
      const thread = await ownThread(tid, b.thread_id);
      if (!thread) return res.status(404).json({ error: 'Thread not found' });
      const body = String(b.body || '').slice(0, 8000);
      if (!body) return res.status(400).json({ error: 'Reply body required' });
      const now = new Date().toISOString();

      // Attempt real delivery through the action layer. Never let a delivery
      // failure lose the reply: it is always recorded, sent flag reflects reality.
      let sent = false;
      try {
        const { deliver } = require('./_osact');
        const channel = thread.channel === 'sms' ? 'sms' : 'email';
        const result = await deliver({ channel, to: thread.from, subject: thread.subject, body });
        sent = result && result.status === 'sent';
      } catch (e) {
        console.error('os2-threads deliver:', e.message);
      }

      const message = await db.insert('os_messages', {
        tenant_id: tid,
        thread_id: thread.id,
        direction: 'out',
        body,
        author: t.email || 'team',
        channel: thread.channel,
        sent,
        created_at: now,
      });
      await db.update('os_threads', thread.id, { last_at: now, status: 'open' });
      return res.status(200).json({ message });
    }

    if (action === 'assign') {
      if (!requireRole(t, res, 'manager')) return;
      const thread = await ownThread(tid, b.thread_id);
      if (!thread) return res.status(404).json({ error: 'Thread not found' });
      const patch = {};
      if (b.worker_id !== undefined) patch.worker_id = b.worker_id ? String(b.worker_id) : null;
      if (b.department_id !== undefined) patch.department_id = b.department_id ? String(b.department_id) : null;
      const updated = await db.update('os_threads', thread.id, patch);
      return res.status(200).json({ thread: updated });
    }

    if (action === 'status') {
      if (!requireRole(t, res, 'manager')) return;
      const thread = await ownThread(tid, b.thread_id);
      if (!thread) return res.status(404).json({ error: 'Thread not found' });
      const status = String(b.status || '');
      if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status' });
      const updated = await db.update('os_threads', thread.id, { status });
      return res.status(200).json({ thread: updated });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-threads:', e.message);
    return res.status(500).json({ error: 'Could not complete that' });
  }
};

module.exports.config = { maxDuration: 30 };
