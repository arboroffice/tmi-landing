// Company Intelligence — TMI's own intelligence layer (TMI as Client Zero).
// Admin-gated. Turns an internal meeting transcript into content (held for
// approval, since it is public), and SOPs, company knowledge, and tasks (saved
// automatically, since they are internal). Also lists and manages all of it.
//
// POST { action, ... }
//   'route'    { title, transcript }        -> { meeting, counts }
//   'list'     { kind }                     -> { items }
//   'approve'  { id }                       -> { item }     (content -> approved)
//   'complete' { id }                       -> { item }     (task -> done)
//   'update'   { kind, id, data }           -> { item }
//   'delete'   { kind, id }                 -> { ok: true }

const db = require('./_db');
const { requireAuth, cors } = require('./_auth');
const { routeTranscript, briefFocus } = require('./_tmiintel');

const DAY = 24 * 3600 * 1000;
async function safeList(coll, opts) { try { return await db.list(coll, opts); } catch { return []; } }

const COLL = {
  meetings: 'tmi_meetings',
  content: 'tmi_content',
  sops: 'tmi_sops',
  knowledge: 'tmi_knowledge',
  tasks: 'tmi_tasks',
};
const FIELDS = {
  content: ['title', 'body', 'format', 'angle', 'status'],
  sops: ['title', 'purpose', 'steps', 'status'],
  knowledge: ['title', 'body', 'kind'],
  tasks: ['title', 'owner', 'due', 'status'],
};

async function listColl(kind, limit) {
  const rows = await db.list(COLL[kind], { order: 'created_at', ascending: false, limit: limit || 200 });
  return rows;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!requireAuth(req, res)) return;

  const b = req.body || {};
  const action = String(b.action || '');

  try {
    if (action === 'route') {
      const transcript = String(b.transcript || '').trim();
      const title = String(b.title || 'Internal meeting').slice(0, 160);
      if (transcript.length < 40) return res.status(400).json({ error: 'Paste a longer transcript' });

      const routed = await routeTranscript(transcript, { title });
      const now = new Date().toISOString();

      const meeting = await db.insert('tmi_meetings', {
        title, summary: routed.summary, decisions: routed.decisions,
        transcript: transcript.slice(0, 100000), created_at: now,
      });
      const mid = meeting.id;

      // Content is public: hold for approval. Everything else is internal: save.
      await Promise.all([
        ...routed.content.map(c => db.insert('tmi_content', Object.assign({ meeting_id: mid, status: 'pending', created_at: now }, c))),
        ...routed.sops.map(x => db.insert('tmi_sops', Object.assign({ meeting_id: mid, status: 'active', created_at: now }, x))),
        ...routed.knowledge.map(k => db.insert('tmi_knowledge', Object.assign({ meeting_id: mid, created_at: now }, k))),
        ...routed.tasks.map(t => db.insert('tmi_tasks', Object.assign({ meeting_id: mid, status: 'open', created_at: now }, t))),
      ]);

      return res.status(200).json({
        meeting: { id: mid, title, summary: routed.summary, decisions: routed.decisions },
        routed,
        counts: { content: routed.content.length, sops: routed.sops.length, knowledge: routed.knowledge.length, tasks: routed.tasks.length },
      });
    }

    if (action === 'list') {
      const kind = String(b.kind || '');
      if (!COLL[kind]) return res.status(400).json({ error: 'Unknown kind' });
      return res.status(200).json({ items: await listColl(kind, b.limit) });
    }

    if (action === 'brief') {
      const [content, tasks, meetings, knowledge, leads, tenants] = await Promise.all([
        safeList('tmi_content', { order: 'created_at', ascending: false, limit: 60 }),
        safeList('tmi_tasks', { order: 'created_at', ascending: false, limit: 60 }),
        safeList('tmi_meetings', { order: 'created_at', ascending: false, limit: 6 }),
        safeList('tmi_knowledge', { order: 'created_at', ascending: false, limit: 20 }),
        safeList('leads', { order: 'created_at', ascending: false, limit: 400 }),
        safeList('os_tenants', { limit: 500 }),
      ]);
      const pending = content.filter(c => c.status === 'pending');
      const openTasks = tasks.filter(t => t.status !== 'done');
      const cutoff = Date.now() - 7 * DAY;
      const newLeads = leads.filter(l => l.created_at && Date.parse(l.created_at) > cutoff).length;
      const decisions = meetings.flatMap(m => Array.isArray(m.decisions) ? m.decisions : []);
      const counts = {
        pending_content: pending.length, open_tasks: openTasks.length,
        new_leads_7d: newLeads, os_signups: tenants.length, meetings_captured: meetings.length,
      };
      const focus = await briefFocus({ counts, pending, openTasks, decisions });
      return res.status(200).json({ counts, focus, pending: pending.slice(0, 5), openTasks: openTasks.slice(0, 6) });
    }

    if (action === 'approve') {
      const item = await db.update('tmi_content', String(b.id || ''), { status: 'approved', approved_at: new Date().toISOString() });
      return res.status(200).json({ item });
    }
    if (action === 'complete') {
      const item = await db.update('tmi_tasks', String(b.id || ''), { status: 'done' });
      return res.status(200).json({ item });
    }
    if (action === 'update') {
      const kind = String(b.kind || '');
      if (!FIELDS[kind]) return res.status(400).json({ error: 'Unknown kind' });
      const data = {};
      for (const f of FIELDS[kind]) if (b.data && b.data[f] !== undefined) data[f] = b.data[f];
      const item = await db.update(COLL[kind], String(b.id || ''), data);
      return res.status(200).json({ item });
    }
    if (action === 'delete') {
      const kind = String(b.kind || '');
      if (!COLL[kind]) return res.status(400).json({ error: 'Unknown kind' });
      await db.remove(COLL[kind], String(b.id || ''));
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('tmi-intel:', e.message);
    return res.status(500).json({ error: e.message || 'Something went wrong' });
  }
};
