// TMI OS - Team Performance. The other half of Human Performance: get every
// person on the team actually using AI, and watch output rise without new
// headcount. The owner tracks each seat, where they are on the AI adoption
// curve, which copilots and digital employees they lean on, and the team's
// overall readiness. Where a person has a Human Design chart on file, we surface
// their type and a one-line cue for how to move THEM up the curve, because a
// Projector and a Manifesting Generator do not adopt the same way.
//
// POST { action, ... }
//   'state'                          -> { members, readiness, summary, stages }
//   'save'   { id?, name, role, seat, stage, tools[], output_note } (manager)
//   'remove' { id }                  (manager)
//   'nudge'  { id }                  (manager) -> { message }  a coach line for this person

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');
const { scope } = require('./_ostenantdb');

// The AI adoption curve. A person moves up one stage at a time.
const STAGES = [
  { v: 0, key: 'not_started', label: 'Not started', blurb: 'Has not touched the tools yet.' },
  { v: 1, key: 'trying', label: 'Trying it', blurb: 'Poking at it, not part of the day yet.' },
  { v: 2, key: 'weekly', label: 'Using weekly', blurb: 'Reaches for it on the big tasks.' },
  { v: 3, key: 'daily', label: 'Daily driver', blurb: 'It is how the work gets done now.' },
  { v: 4, key: 'teaching', label: 'Teaching others', blurb: 'Pulling the rest of the team up.' },
];

// How to move each Human Design type up the curve. Short, blunt, in the grain.
const HD_ADOPTION = {
  'Generator': 'Let them try the tool on real work they already enjoy. Response drives them, so give them something to react to, not a mandate.',
  'Manifesting Generator': 'Give them several things to try at once and let them drop what does not click. They adopt fast when they are not boxed in.',
  'Projector': 'Invite them in and ask them to guide the rollout. They see the system better than anyone, but only when recognized, not when told.',
  'Manifestor': 'Tell them the why, then let them run with it alone. They will build the workflow their way and inform the team once it works.',
  'Reflector': 'Give them a full cycle to feel it out and the right people around them. Do not rush the verdict, it will be worth waiting for.',
};

function tipForType(type) {
  if (!type) return null;
  return HD_ADOPTION[type] || null;
}

function card(m, hdByName) {
  const hd = m.name ? hdByName[String(m.name).trim().toLowerCase()] : null;
  return {
    id: m.id, name: m.name || 'Team member', role: m.role || null, seat: m.seat || null,
    stage: typeof m.stage === 'number' ? m.stage : 0,
    tools: Array.isArray(m.tools) ? m.tools : [],
    output_note: m.output_note || null,
    hd_type: hd ? hd.type : null,
    hd_tip: hd ? tipForType(hd.type) : null,
    updated_at: m.updated_at || null,
  };
}

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
      const [members, hdProfiles] = await Promise.all([
        tdb.list('os_team_perf', { limit: 500 }),
        tdb.list('os_hd_profiles', { limit: 500 }).catch(() => []),
      ]);
      const hdByName = {};
      (hdProfiles || []).forEach(p => { if (p.name) hdByName[String(p.name).trim().toLowerCase()] = p; });
      const cards = members.map(m => card(m, hdByName));
      // Readiness: how far up the curve the team is, on average, as a percent.
      const readiness = cards.length
        ? Math.round((cards.reduce((s, c) => s + (c.stage || 0), 0) / (cards.length * 4)) * 100)
        : 0;
      return res.status(200).json({
        members: cards, readiness,
        summary: { people: cards.length, daily_or_better: cards.filter(c => c.stage >= 3).length, teaching: cards.filter(c => c.stage >= 4).length },
        stages: STAGES,
      });
    }

    // Everything below changes data: manager only.
    if (!requireRole(t, res, 'manager')) return;

    if (action === 'save') {
      const now = new Date().toISOString();
      const stage = Math.max(0, Math.min(4, Number(b.stage) || 0));
      const rec = {
        name: String(b.name || '').slice(0, 120).trim() || 'Team member',
        role: String(b.role || '').slice(0, 120).trim() || null,
        seat: String(b.seat || '').slice(0, 120).trim() || null,
        stage,
        tools: Array.isArray(b.tools) ? b.tools.map(x => String(x).slice(0, 80)).slice(0, 20) : [],
        output_note: String(b.output_note || '').slice(0, 500).trim() || null,
        updated_at: now,
      };
      const id = String(b.id || '');
      let member;
      if (id) {
        member = await tdb.update('os_team_perf', id, rec);
      } else {
        member = await tdb.insert('os_team_perf', Object.assign({ created_at: now }, rec));
        await db.insert('os_build_log', { tenant_id: tid, kind: 'team-performance', summary: `${rec.name} added to Team Performance at "${STAGES[stage].label}".`, created_at: now }).catch(() => {});
      }
      return res.status(200).json({ member });
    }

    if (action === 'remove') {
      const ok = await tdb.remove('os_team_perf', String(b.id || ''));
      return res.status(200).json({ ok });
    }

    if (action === 'nudge') {
      const m = await tdb.getById('os_team_perf', String(b.id || ''));
      if (!m) return res.status(404).json({ error: 'Not found' });
      const hd = (await tdb.list('os_hd_profiles', { limit: 500 }).catch(() => [])).find(p => p.name && String(p.name).trim().toLowerCase() === String(m.name || '').trim().toLowerCase());
      const stage = typeof m.stage === 'number' ? m.stage : 0;
      const next = STAGES[Math.min(4, stage + 1)];
      let msg = stage >= 4
        ? `${m.name} is already teaching others. Give them one more person to bring up the curve.`
        : `Move ${m.name} from "${STAGES[stage].label}" to "${next.label}". ${next.blurb}`;
      const tip = hd ? tipForType(hd.type) : null;
      if (tip) msg += ` They are a ${hd.type}: ${tip}`;
      return res.status(200).json({ message: msg });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-teamperf:', e.message);
    return res.status(500).json({ error: 'Could not complete that' });
  }
};

module.exports.config = { maxDuration: 30 };
