// TMI OS - Human Design, the member side. A person computes their own chart in
// the OS, and an owner can send an intake link to anyone on the team (or a
// client) to take it, keeping every chart as a record on the company. All
// computation is in-house (_oshd), so birth data never leaves the platform.
//
// POST { action, ... }
//   'state'                                  -> { me, team, invites }
//   'submit' { name, date, time, tz_offset } -> { profile }   compute + store the caller's own chart
//   'get'    { id }                          -> { profile }   full chart (tenant-scoped)
//   'invite' { name }        (manager)       -> { invite, url } shareable intake link for a teammate
//   'revoke' { id }          (manager)       -> { ok }         cancel a pending invite
//   'remove' { id }          (manager)       -> { ok }         delete a stored chart

const crypto = require('crypto');
const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');
const { scope } = require('./_ostenantdb');
const HD = require('./_oshd');
const M = require('./_oshdmeaning');
const llm = require('./_osllm');
const { startTrace, finishTrace } = require('./_ostrace');

const INTAKE_BASE = 'https://www.tmitechai.com/hd-intake?token=';
const MODEL = 'claude-opus-4-8';

const SYSTEM_GUIDE = `You write a short, practical working guide for one person on a company team, from their Human Design chart. You are talking to that person's owner or manager, and to the person themselves. This is about work: how they decide, how to hand them work, how to communicate with them, what drains them, and where they do their best work.

Rules:
- Simple words. Short sentences. No spiritual language. No em dashes. No emojis.
- Never tell someone their type is a limit. Frame everything as how to work with how they are wired.
- Be concrete and operational. An owner should be able to change how they manage this person tomorrow.
- Do not invent birth data or mechanics. Use only what you are given.`;

const SYSTEM_TEAM = `You write a practical operating brief for a company owner about how their team is wired, using each person's Human Design. This is about running the team: who should own which kinds of decisions, how to run meetings given the mix, who to pair, and where the friction and the gaps are.

Rules:
- Simple words. Short sentences. No spiritual language. No em dashes. No emojis.
- Concrete and operational. Every point should change how the owner runs the team.
- Use people's names and their types. Do not invent anyone who was not given.
- Never frame a person as a problem. Frame it as how to set them up to win.`;

// The light shape shown in a team list (no raw birth data, no full bodygraph).
function teamCard(p) {
  return {
    id: p.id, name: p.name || 'Someone', role: p.role || null, source: p.source || null,
    type: p.type, authority: p.authority, profile: p.profile, strategy: p.strategy,
    definition: (M.definitionOf(p) || {}).label || null,
    has_guide: !!p.guide, computed_at: p.computed_at || null,
  };
}

// Generate (or return cached) the working guide for one stored chart.
async function makeGuide(tid, tdb, profile, force) {
  if (profile.guide && !force) return { guide: profile.guide, cached: true };
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { guide: null, error: 'The guide is not available right now.' };
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });
  const who = profile.name || 'This person';
  const prompt = `${M.summaryLine(profile, who)}

Write the working guide for ${who} as five short labelled parts, each two to four sentences:
How they decide. How to hand them work. How to communicate with them. What drains them. Where they do their best work.`;
  const trace = startTrace(tid, { kind: 'human-design', label: 'working guide', meta: { type: profile.type } });
  let text;
  try {
    const msg = await llm.create(client, {
      model: MODEL, max_tokens: 900, system: SYSTEM_GUIDE,
      messages: [{ role: 'user', content: prompt }],
    }, { tenantId: tid, label: 'hd:guide', workflow: 'human_design_guide', trace });
    text = (msg.content || []).map(x => x.text || '').join('').trim();
    await finishTrace(trace, { status: 'ok' });
  } catch (e) { await finishTrace(trace, { error: e }); return { guide: null, error: 'Could not build the guide. Try again.' }; }
  if (!text) return { guide: null, error: 'Could not build the guide. Try again.' };
  const saved = await tdb.update('os_hd_profiles', profile.id, { guide: text, guide_at: new Date().toISOString() });
  return { guide: text, cached: false, profile: saved };
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
      const [profiles, invites] = await Promise.all([
        tdb.list('os_hd_profiles', { limit: 500 }),
        tdb.list('os_hd_invites', { limit: 200 }),
      ]);
      const me = profiles.find(p => p.user_id === t.sub) || null;
      const team = profiles.filter(p => p.user_id !== t.sub).map(teamCard);
      const pending = invites.filter(i => i.status === 'pending').map(i => ({ id: i.id, token: i.token, invited_name: i.invited_name || null, url: INTAKE_BASE + i.token, created_at: i.created_at }));
      return res.status(200).json({ me: me || null, me_meaning: me ? M.enrich(me) : null, team, invites: pending, team_count: team.length });
    }

    if (action === 'get') {
      const p = await tdb.getById('os_hd_profiles', String(b.id || ''));
      if (!p) return res.status(404).json({ error: 'Chart not found' });
      return res.status(200).json({ profile: p, meaning: M.enrich(p) });
    }

    if (action === 'guide') {
      const p = await tdb.getById('os_hd_profiles', String(b.id || ''));
      if (!p) return res.status(404).json({ error: 'Chart not found' });
      const mine = p.user_id && p.user_id === t.sub;
      const force = !!b.refresh;
      // Reading a cached guide is open to the team. Generating one (or forcing a
      // refresh) is manager-only, unless it is the caller's own chart.
      if ((!p.guide || force) && !mine && !requireRole(t, res, 'manager')) return;
      const out = await makeGuide(tid, tdb, p, force);
      if (!out.guide) return res.status(out.error ? 503 : 500).json({ error: out.error || 'Could not build the guide.' });
      return res.status(200).json({ guide: out.guide, cached: !!out.cached });
    }

    if (action === 'team_reading') {
      if (!requireRole(t, res, 'manager')) return;
      const force = !!b.refresh;
      const existing = (await tdb.list('os_hd_readings', { limit: 1 }))[0] || null;
      const profiles = await tdb.list('os_hd_profiles', { limit: 500 });
      const withCharts = profiles.filter(p => p.type);
      if (withCharts.length < 2) return res.status(400).json({ error: 'Add at least two charts to read the team.' });
      // Reuse the cached reading unless the roster changed or a refresh is asked.
      const signature = withCharts.map(p => p.id + ':' + (p.updated_at || p.computed_at || '')).sort().join('|');
      if (existing && !force && existing.signature === signature) {
        return res.status(200).json({ reading: existing.reading, cached: true, count: withCharts.length });
      }
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return res.status(503).json({ error: 'The team reading is not available right now.' });
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: key });
      const roster = withCharts.map(p => M.summaryLine(p, p.name || 'Team member')).join('\n');
      const prompt = `Here is the team, ${withCharts.length} people:\n\n${roster}\n\nWrite the operating brief in four short labelled parts, each two to four sentences:\nDecision ownership (who should own gut calls, who should sleep on it, who informs first). How to run meetings for this mix. Who to pair and why. The one gap or friction to watch and what to do about it.`;
      const trace = startTrace(tid, { kind: 'human-design', label: 'team reading', meta: { count: withCharts.length } });
      let text;
      try {
        const msg = await llm.create(client, {
          model: MODEL, max_tokens: 1100, system: SYSTEM_TEAM,
          messages: [{ role: 'user', content: prompt }],
        }, { tenantId: tid, label: 'hd:team', workflow: 'human_design_team', trace });
        text = (msg.content || []).map(x => x.text || '').join('').trim();
        await finishTrace(trace, { status: 'ok' });
      } catch (e) { await finishTrace(trace, { error: e }); return res.status(500).json({ error: 'Could not read the team. Try again.' }); }
      if (!text) return res.status(500).json({ error: 'Could not read the team. Try again.' });
      const now = new Date().toISOString();
      if (existing) await tdb.update('os_hd_readings', existing.id, { reading: text, signature, updated_at: now });
      else await tdb.insert('os_hd_readings', { reading: text, signature, created_at: now, updated_at: now });
      return res.status(200).json({ reading: text, cached: false, count: withCharts.length });
    }

    if (action === 'submit') {
      // Any signed-in member can compute their own chart.
      let chart;
      try { chart = HD.computeChart({ date: b.date, time: b.time, tz_offset: b.tz_offset }); }
      catch (e) { return res.status(400).json({ error: 'Check the birth date and time.' }); }
      const now = new Date().toISOString();
      const rec = Object.assign({ user_id: t.sub, name: String(b.name || t.email || 'Me').slice(0, 120), source: 'self', updated_at: now }, chart);
      const existing = (await tdb.list('os_hd_profiles', { where: [['user_id', '==', t.sub]], limit: 1 }))[0];
      const profile = existing ? await tdb.update('os_hd_profiles', existing.id, rec) : await tdb.insert('os_hd_profiles', rec);
      await db.insert('os_build_log', { tenant_id: tid, kind: 'human-design', summary: `${rec.name} took the Human Design assessment: ${chart.type}.`, created_at: now }).catch(() => {});
      return res.status(200).json({ profile });
    }

    // Writes below are manager-only.
    if (!requireRole(t, res, 'manager')) return;

    if (action === 'invite') {
      const token = crypto.randomBytes(12).toString('hex');
      const invite = await tdb.insert('os_hd_invites', {
        token, invited_name: String(b.name || '').slice(0, 120) || null,
        status: 'pending', created_by: t.email || t.sub, created_at: new Date().toISOString(),
      });
      return res.status(200).json({ invite: { id: invite.id, token, invited_name: invite.invited_name }, url: INTAKE_BASE + token });
    }

    if (action === 'revoke') {
      const ok = await tdb.remove('os_hd_invites', String(b.id || ''));
      return res.status(200).json({ ok });
    }

    if (action === 'remove') {
      const ok = await tdb.remove('os_hd_profiles', String(b.id || ''));
      return res.status(200).json({ ok });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-hd:', e.message);
    return res.status(500).json({ error: 'Could not complete that' });
  }
};

module.exports.config = { maxDuration: 30 };
