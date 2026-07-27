// TMI OS - University assignments. Turns the University from the owner's private
// climb into a team training system: an owner or manager assigns a floor to a
// specific person and tracks whether it is done. The company binder stays
// shared (one company, one build), so this is a lightweight who-should-work-what
// tracker layered on top, not a separate per-person binder.
//
// POST { action, ... }
//   'state'                                   -> { assignments, roster, floors }
//   'assign' { assignee, assignee_ref?, floor_key } (manager) -> { assignment }
//   'status' { id, status }                   (manager)       -> { assignment }
//   'remove' { id }                           (manager)       -> { ok }

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');
const { scope } = require('./_ostenantdb');
const U = require('./_osuniversity');

const STATUSES = ['assigned', 'in_progress', 'done'];
const FLOOR_KEYS = new Set(U.FLOORS.map(f => f.key));
const FLOORS_LITE = U.FLOORS.map(f => ({ key: f.key, title: f.title.replace(/^Floor \d+:\s*/, ''), order: f.order }));
const FLOOR_TITLE = {}; U.FLOORS.forEach(f => { FLOOR_TITLE[f.key] = f.title.replace(/^Floor \d+:\s*/, ''); });

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;
  const tid = t.tenant_id;
  const tdb = scope(tid);
  const b = req.body || {};
  const action = String(b.action || 'state');

  try {
    if (action === 'state') {
      const [assignments, users, hd] = await Promise.all([
        tdb.list('os_uni_assignments', { limit: 500 }),
        db.list('os_users', { where: [['tenant_id', '==', tid]] }).catch(() => []),
        tdb.list('os_hd_profiles', { limit: 500 }).catch(() => []),
      ]);
      // Roster of names to assign to: OS members plus anyone with a chart.
      const seen = new Set();
      const roster = [];
      (users || []).forEach(u => { const n = (u.name || u.email || '').trim(); if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); roster.push({ name: n, ref: u.id, source: 'member' }); } });
      (hd || []).forEach(p => { const n = (p.name || '').trim(); if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); roster.push({ name: n, ref: p.id, source: 'chart' }); } });
      const out = assignments.map(a => ({
        id: a.id, assignee: a.assignee || 'Someone', assignee_ref: a.assignee_ref || null,
        floor_key: a.floor_key, floor_title: FLOOR_TITLE[a.floor_key] || a.floor_key,
        status: a.status || 'assigned', assigned_by: a.assigned_by || null,
        created_at: a.created_at || null, done_at: a.done_at || null,
      }));
      const can_manage = t.role === 'owner' || t.role === 'manager';
      return res.status(200).json({ assignments: out, roster, floors: FLOORS_LITE, can_manage });
    }

    // A member who was assigned a floor can mark their own done; everything else
    // is manager-only.
    if (action === 'status') {
      const id = String(b.id || '');
      const a = await tdb.getById('os_uni_assignments', id);
      if (!a) return res.status(404).json({ error: 'Assignment not found' });
      const isAssignee = a.assignee_ref && a.assignee_ref === t.sub;
      if (!isAssignee && !requireRole(t, res, 'manager')) return;
      const status = STATUSES.includes(b.status) ? b.status : 'assigned';
      const patch = { status, done_at: status === 'done' ? new Date().toISOString() : null };
      const updated = await tdb.update('os_uni_assignments', id, patch);
      return res.status(200).json({ assignment: updated });
    }

    if (!requireRole(t, res, 'manager')) return;

    if (action === 'assign') {
      const assignee = String(b.assignee || '').slice(0, 120).trim();
      const floor_key = String(b.floor_key || '');
      if (!assignee) return res.status(400).json({ error: 'Pick or name who this is for.' });
      if (!FLOOR_KEYS.has(floor_key)) return res.status(400).json({ error: 'Pick a floor.' });
      // Do not double-assign the same floor to the same person.
      const dup = (await tdb.list('os_uni_assignments', { where: [['floor_key', '==', floor_key]], limit: 500 }))
        .find(x => String(x.assignee || '').trim().toLowerCase() === assignee.toLowerCase());
      if (dup) return res.status(200).json({ assignment: dup, already: true });
      const now = new Date().toISOString();
      const assignment = await tdb.insert('os_uni_assignments', {
        assignee, assignee_ref: b.assignee_ref ? String(b.assignee_ref) : null,
        floor_key, status: 'assigned', assigned_by: t.email || t.sub, created_at: now,
      });
      await db.insert('os_build_log', { tenant_id: tid, kind: 'university', summary: `Assigned ${FLOOR_TITLE[floor_key] || floor_key} to ${assignee}.`, created_at: now }).catch(() => {});
      return res.status(200).json({ assignment });
    }

    if (action === 'remove') {
      const ok = await tdb.remove('os_uni_assignments', String(b.id || ''));
      return res.status(200).json({ ok });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-uniassign:', e.message);
    return res.status(500).json({ error: 'Could not complete that' });
  }
};

module.exports.config = { maxDuration: 20 };
