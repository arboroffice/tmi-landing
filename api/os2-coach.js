// TMI University - the AI coach. This is the faculty a video library cannot bolt
// on, and the reason a member picks this over any other program. It is not a
// chatbot on a lesson page. It knows the member: their six scores and history,
// their level, their current floor, their industry and headcount, and every
// artifact in their binder including the ones they got stuck on.
//
// It runs on the same rails as the rest of the OS: _osllm for the call plus cost
// capture, _ostrace for a reconstructable trace. Scoped to the caller's tenant.
//
// POST { action, ... }
//   'ask'  { message }  (manager) -> { reply }
//   'log'               -> { messages }   recent coach turns for this member

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');
const { scope } = require('./_ostenantdb');
const U = require('./_osuniversity');
const llm = require('./_osllm');
const { startTrace, finishTrace } = require('./_ostrace');

const MODEL = 'claude-opus-4-8';

const SYSTEM = `You are the coach inside TMI University. You speak to owners of real companies, not students.

Rules:
- Simple words. Short sentences. Third grade reading level. No corporate language. No emojis. No em dashes.
- Never give a general business answer. Always answer for THIS member's company, using their scores, their industry, their headcount, and their artifacts.
- Never recommend a tool before knowing which floor they are on. If the floor underneath is missing, say so plainly and send them down, not up.
- Never let them skip a floor because it sounds boring.
- If they ask about something the school covers later, tell them which floor it lives on and why the ones underneath come first.
- If they are stuck, ask what actually got in the way. Usually it is time, a team member, or that the step was too big. Make it smaller.
- Do not sell. If a member is clearly past what they can build alone, say that plainly and mention the Intelligent Company Audit once. Then drop it.
- Never invent a number about their business. If you do not have it, ask for it.
- If their Human Design is known, coach in the grain of it, do not lecture about it. A Generator or Manifesting Generator should build the thing that lights them up and let the rest wait for a response. A Projector should not grind alone, they need the right people to invite them in and should spend their energy on who to guide, not on doing every task. A Manifestor should inform the team before they move so nothing gets blindsided. A Reflector needs a full month and the right environment before a big call. Point the next step at their Strategy and Authority. Never tell them their type is a limit.`;

// Turn the member's real standing into the context block the coach reasons over.
function contextBlock(tenant, standing, scores, artifacts, hd) {
  const p = tenant.profile || {};
  const latest = scores[0] || null;
  const prev = scores[1] || null;
  const dir = latest && prev ? (latest.total > prev.total ? 'up' : latest.total < prev.total ? 'down' : 'flat') : 'no history yet';
  const areaLine = latest ? U.AREAS.map(a => `${U.AREA_LABEL[a]} ${latest.areas[a] ?? '-'}`).join(', ') : 'not scored yet';
  const cur = standing.floors.find(f => f.key === standing.current_floor) || {};
  const missing = (cur.artifacts || []).filter(a => a.status !== 'verified').map(a => a.label);
  const returned = (artifacts || []).filter(a => a.status === 'returned').map(a => a.label);
  return [
    `Company: ${tenant.name || 'unknown'}${tenant.business_type ? ' (' + tenant.business_type + ')' : ''}`,
    `Industry: ${p.industry || tenant.business_type || 'unspecified'}. Headcount: ${p.headcount || 'unspecified'}.`,
    `Level: ${standing.level} (${standing.level_name}). Score: ${latest ? latest.total + '/100 and trending ' + dir : 'not taken yet'}.`,
    `Six areas: ${areaLine}.`,
    latest && typeof latest.owner_dependency === 'number' ? `Owner dependency: ${latest.owner_dependency}%.` : '',
    `Current floor: ${cur.title || standing.current_floor}.`,
    `Artifacts still open on this floor: ${missing.length ? missing.join('; ') : 'none, ready to move up'}.`,
    returned.length ? `Sent back for more work: ${returned.join('; ')}.` : '',
    `Degree progress: ${standing.artifacts_verified} of ${standing.artifacts_total} artifacts verified.`,
    hd && hd.type ? `Human Design: ${hd.type}. Strategy: ${hd.strategy || 'unknown'}. Authority: ${hd.authority || 'unknown'}. Profile: ${hd.profile || 'unknown'}.` : '',
  ].filter(Boolean).join('\n');
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
  const action = String(b.action || 'ask');

  try {
    if (action === 'log') {
      const messages = await tdb.list('os_coach_msgs', { order: 'created_at', ascending: false, limit: 40 });
      messages.reverse();
      return res.status(200).json({ messages });
    }

    if (action !== 'ask') return res.status(400).json({ error: 'Unknown action' });
    if (!requireRole(t, res, 'manager')) return;

    const message = String(b.message || '').slice(0, 4000).trim();
    if (!message) return res.status(400).json({ error: 'Ask the coach something.' });

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(503).json({ error: 'The coach is not available right now.' });

    const [tenant, scoresRaw, artifacts, history, hdRows] = await Promise.all([
      db.getById('os_tenants', tid),
      tdb.list('os_scores', { order: 'date', ascending: false, limit: 12 }),
      tdb.list('os_artifacts'),
      tdb.list('os_coach_msgs', { order: 'created_at', ascending: false, limit: 8 }),
      tdb.list('os_hd_profiles', { where: [['user_id', '==', t.sub]], limit: 1 }).catch(() => []),
    ]);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    scoresRaw.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const standing = U.computeStanding(scoresRaw[0] || null, artifacts);
    const context = contextBlock(tenant, standing, scoresRaw, artifacts, (hdRows && hdRows[0]) || null);

    // Recent turns become prior messages so the coach has short-term memory.
    history.reverse();
    const priorMsgs = history.slice(-6).flatMap(m => ([
      { role: 'user', content: String(m.question || '') },
      { role: 'assistant', content: String(m.reply || '') },
    ])).filter(m => m.content);

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: key });

    const trace = startTrace(tid, { kind: 'coach', label: 'University coach', meta: { floor: standing.current_floor, level: standing.level } });
    let reply;
    try {
      const msg = await llm.create(client, {
        model: MODEL, max_tokens: 900, system: SYSTEM,
        messages: priorMsgs.concat([{ role: 'user', content: `--- THIS MEMBER ---\n${context}\n\n--- THEIR QUESTION ---\n${message}` }]),
      }, { tenantId: tid, label: 'coach:ask', workflow: 'university_coach', trace });
      reply = (msg.content || []).map(x => x.text || '').join('').trim() || 'Tell me a bit more and I will point you to the exact next step.';
    } catch (e) {
      await finishTrace(trace, { error: e });
      throw e;
    }
    await finishTrace(trace, { status: 'ok' });

    const saved = await tdb.insert('os_coach_msgs', {
      question: message, reply, floor: standing.current_floor, level: standing.level, created_at: new Date().toISOString(),
    });
    return res.status(200).json({ reply, message_id: saved.id });
  } catch (e) {
    console.error('os2-coach:', e.message);
    return res.status(500).json({ error: 'The coach could not answer that. Try again.' });
  }
};

module.exports.config = { maxDuration: 60 };
