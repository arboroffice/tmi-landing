// TMI OS - People. One place to see each person on the team as a whole: their
// Human Design (how they are wired), where they are on the AI adoption curve,
// and which University floors they are working. It reads from the three stores
// we already keep (charts, team performance, University assignments) plus the
// OS member list, and merges them by name into one record per person.
//
// POST { action }
//   'state' -> { people, stages }

const db = require('./_db');
const { requireTenant, cors } = require('./_tenant-auth');
const { scope } = require('./_ostenantdb');
const M = require('./_oshdmeaning');
const U = require('./_osuniversity');

const STAGES = ['Not started', 'Trying it', 'Using weekly', 'Daily driver', 'Teaching others'];
const FLOOR_TITLE = {}; U.FLOORS.forEach(f => { FLOOR_TITLE[f.key] = f.title.replace(/^Floor \d+:\s*/, ''); });

const normName = s => String(s || '').trim().toLowerCase();

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;
  const tid = t.tenant_id;
  const tdb = scope(tid);

  try {
    const [members, charts, perf, assigns] = await Promise.all([
      db.list('os_users', { where: [['tenant_id', '==', tid]] }).catch(() => []),
      tdb.list('os_hd_profiles', { limit: 500 }).catch(() => []),
      tdb.list('os_team_perf', { limit: 500 }).catch(() => []),
      tdb.list('os_uni_assignments', { limit: 500 }).catch(() => []),
    ]);

    // Merge everything into one record per person, keyed by name.
    const byName = {};
    function rec(name) {
      const k = normName(name);
      if (!byName[k]) byName[k] = { name: name || 'Someone', is_member: false, is_me: false, role: null, hd: null, adoption: null, university: [] };
      return byName[k];
    }

    (members || []).forEach(u => {
      const r = rec(u.name || u.email || 'Member');
      r.is_member = true;
      if (u.id === t.sub) r.is_me = true;
      r.role = r.role || u.role || null;
      r.member_role = u.role || null;
    });

    (charts || []).forEach(p => {
      if (!p.type) return;
      const r = rec(p.name || 'Someone');
      if (p.user_id && p.user_id === t.sub) r.is_me = true;
      r.hd = {
        id: p.id, type: p.type, authority: p.authority, profile: p.profile,
        definition: (M.definitionOf(p) || {}).label || null, has_guide: !!p.guide,
      };
      if (!r.role && p.role) r.role = p.role;
    });

    (perf || []).forEach(m => {
      const r = rec(m.name || 'Someone');
      const stage = typeof m.stage === 'number' ? m.stage : 0;
      r.adoption = { id: m.id, stage, stage_label: STAGES[stage] || STAGES[0], tools: Array.isArray(m.tools) ? m.tools : [] };
      if (!r.role && (m.role || m.seat)) r.role = m.role || m.seat;
    });

    (assigns || []).forEach(a => {
      const r = rec(a.assignee || 'Someone');
      r.university.push({ id: a.id, floor_key: a.floor_key, floor_title: FLOOR_TITLE[a.floor_key] || a.floor_key, status: a.status || 'assigned' });
    });

    const people = Object.keys(byName).map(k => {
      const r = byName[k];
      const done = r.university.filter(x => x.status === 'done').length;
      r.university_summary = r.university.length ? (done + '/' + r.university.length + ' floors done') : null;
      return r;
    }).sort((a, b) => {
      if (a.is_me !== b.is_me) return a.is_me ? -1 : 1;
      return String(a.name).localeCompare(String(b.name));
    });

    return res.status(200).json({ people, stages: STAGES });
  } catch (e) {
    console.error('os2-people:', e.message);
    return res.status(500).json({ error: 'Could not load people' });
  }
};

module.exports.config = { maxDuration: 20 };
