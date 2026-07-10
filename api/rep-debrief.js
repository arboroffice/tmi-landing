// End-of-day AI debrief for a city-lead rep. Pulls today's leads + recorded
// interactions, asks Claude for a short recap and 3 concrete moves for tomorrow.
//   GET -> { date, doors, conversations, booked, summary, tomorrow: [ ... ] }
const db = require('./_db');
const { cors } = require('./_auth');
const { requireRep } = require('./_rep-auth');

const isToday = (iso) => { if (!iso) return false; const d = new Date(iso), n = new Date(); return d.toDateString() === n.toDateString(); };

async function coach(stats, lines) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const fallback = {
    summary: `You logged ${stats.doors} door${stats.doors === 1 ? '' : 's'} today with ${stats.conversations} real conversation${stats.conversations === 1 ? '' : 's'} and ${stats.booked} audit${stats.booked === 1 ? '' : 's'} booked. Keep the streak going.`,
    tomorrow: [
      stats.due ? `Clear your ${stats.due} due follow-up${stats.due === 1 ? '' : 's'} first thing.` : 'Pick one cluster and pull 12-15 targets before you leave.',
      'Catch owners at the yard between 6:30 and 8:00 before crews roll out.',
      'Book at least one audit onto Mia\'s calendar.',
    ],
  };
  if (!apiKey || !lines.length) return fallback;
  const prompt = `You are a sales coach for a field rep who door-knocks industrial and trades business owners for TMI. Their job is to spark interest and book a free 15-minute audit call, not to close. Here is today's activity.

Stats: ${stats.doors} doors logged, ${stats.conversations} conversations, ${stats.booked} audits booked, ${stats.due} follow-ups still due.

Today's notes and recaps:
${lines.slice(0, 25).map((l, i) => `${i + 1}. ${l}`).join('\n')}

Return STRICT JSON only, no prose, with keys:
"summary" (2-3 blunt sentences recapping the day in a direct, no-hype voice — plain dashes, never em dashes),
"tomorrow" (array of exactly 3 short, specific, imperative moves for tomorrow based on what happened today).`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) return fallback;
    const data = await r.json();
    const txt = (data && data.content && data.content[0] && data.content[0].text) || '';
    const jm = txt.match(/\{[\s\S]*\}/); if (!jm) return fallback;
    const o = JSON.parse(jm[0]);
    const tomorrow = Array.isArray(o.tomorrow) ? o.tomorrow.map((s) => String(s).slice(0, 200)).slice(0, 3) : fallback.tomorrow;
    return { summary: String(o.summary || fallback.summary).slice(0, 700).replace(/—/g, '-'), tomorrow };
  } catch { return fallback; }
};

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const rep = await requireRep(req, res); if (!rep) return;
  try {
    const [leads, inter] = await Promise.all([
      db.list('rep_leads', { where: [['rep_id', '==', rep.sub]], limit: 2000 }).catch(() => []),
      db.list('rep_interactions', { where: [['rep_id', '==', rep.sub]], order: 'created_at', ascending: false, limit: 100 }).catch(() => []),
    ]);
    const todayLeads = (leads || []).filter((l) => isToday(l.created_at) || isToday(l.visited_at) || isToday(l.updated_at));
    const doors = (leads || []).filter((l) => isToday(l.created_at)).length;
    const conversations = todayLeads.filter((l) => ['contacted', 'booked', 'callback', 'won'].includes(l.status)).length;
    const booked = todayLeads.filter((l) => ['booked', 'won'].includes(l.status)).length;
    const due = (leads || []).filter((l) => l.next_action_at && new Date(l.next_action_at) <= new Date() && !['won', 'lost', 'not_interested'].includes(l.status)).length;

    const lines = [];
    for (const l of todayLeads) {
      const name = l.business_name || l.contact_name || 'a business';
      if (l.notes) lines.push(`${name} (${l.status}): ${String(l.notes).slice(0, 240)}`);
      else lines.push(`${name}: ${l.status}`);
    }
    for (const x of (inter || [])) {
      if (isToday(x.created_at) && (x.summary || x.transcript)) lines.push(`Visit recap: ${String(x.summary || x.transcript).slice(0, 240)}`);
    }

    const stats = { doors, conversations, booked, due };
    const out = await coach(stats, lines);
    return res.json(Object.assign({ date: new Date().toISOString().slice(0, 10) }, stats, out));
  } catch (e) { return res.status(500).json({ error: e.message }); }
};

module.exports.config = { maxDuration: 30 };
