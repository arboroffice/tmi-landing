// City-lead rep Human Design. Brings the OS Human Design engine into the field
// tool, rep-scoped instead of tenant-scoped. Two subjects:
//   - the rep's own chart  -> "how you sell best" guide (stored in rep_hd/{rep})
//   - a prospect's chart   -> "how to approach this owner" + rep<->owner fit
//     (stored on the rep_leads doc: hd, hd_guide, hd_fit)
// The math is 100% in-house (_oshd + _oshdmeaning); birth data never leaves the
// platform. AI is only used for the plain-language guides, and every guide is
// cached so we do not pay per open.
//
//   POST { action:'me' }                                  -> { chart, meaning, guide }
//   POST { action:'submit_self', date, time, tz_offset }  -> { chart, meaning }
//   POST { action:'guide_self', refresh? }                -> { guide }
//   POST { action:'lead', lead_id }                       -> { chart, meaning, guide, fit }
//   POST { action:'submit_lead', lead_id, date, time, tz_offset } -> { chart, meaning }
//   POST { action:'approach', lead_id, refresh? }         -> { guide }
//   POST { action:'fit', lead_id, refresh? }              -> { fit }

const db = require('./_db');
const { cors } = require('./_auth');
const { requireRep } = require('./_rep-auth');
const HD = require('./_oshd');
const M = require('./_oshdmeaning');

const MODEL = 'claude-haiku-4-5-20251001'; // rep subsystem: fast on mobile

function computeFrom(b) {
  const date = String(b.date || '').trim();
  const time = String(b.time || '').trim() || '12:00';
  const tz = Number(b.tz_offset);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Enter a birth date');
  return HD.computeChart({ date, time, tz_offset: Number.isFinite(tz) ? tz : 0 });
}

// One Claude call that returns { guide } prose. Falls back to the deterministic
// meaning layer when the key is missing or the call fails, so the field tool
// never shows an error where a guide should be.
async function llmGuide(system, facts, fallback) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 850, system, messages: [{ role: 'user', content: facts }] }),
    });
    if (!r.ok) return fallback;
    const data = await r.json();
    const txt = (data && data.content && data.content[0] && data.content[0].text) || '';
    return String(txt || fallback).trim().replace(/—/g, '-') || fallback;
  } catch { return fallback; }
}

const RULES = 'Write for a field sales rep, not a spiritual reader. Plain words, short sentences, blunt and practical. No spiritual language, no jargon beyond the Human Design terms themselves, no emojis, no em dashes (use plain dashes). Use 3 to 4 short labeled sections, each label on its own line ending with a colon, then one or two sentences. Never frame a person as a problem.';

const SYS_SELF = `You coach a TMI field rep who door-knocks business owners and books them onto a paid Intelligent Company Audit. Given the rep's own Human Design, tell them how THEY sell best in the field. Sections: "Your rhythm" (how your type should work a day of doors), "How you decide" (your authority, so you know when to trust a snap call and when to sit on it), "Your move at the door" (your strategy applied to the knock and the pitch), "What drains you" (what to watch so you do not burn out or force it). ${RULES}`;

const SYS_APPROACH = `You coach a TMI field rep on how to approach ONE specific business owner, using that owner's Human Design, to earn a short Intelligent Company Audit call. The rep is not closing on the spot and does not lead with price. Sections: "How they decide" (their authority, so the rep paces the ask and never pushes a same-second yes to an owner who needs to sleep on it), "What lands" (how to frame the audit for this type), "What to avoid" (what makes this owner shut down), "How to get the yes" (the cleanest way to book the call in this owner's design). ${RULES}`;

const SYS_FIT = `You coach a TMI field rep on the chemistry between them and one business owner, using the facts about how their two Human Design charts interact. Sections: "Where you click" (the natural pull, lean into it), "Where you will grind" (the friction, how to soften it), "How to run this pitch" (given both wirings, the play that works). ${RULES}`;

function selfFallback(chart) {
  const e = M.enrich(chart);
  return [
    'Your rhythm:\n' + ((e.type && (e.type.work)) || chart.type),
    'How you decide:\n' + ((e.authority && e.authority.how) || chart.authority),
    'Your move at the door:\n' + ((e.strategy && e.strategy.text) || chart.strategy),
  ].join('\n\n');
}
function approachFallback(chart) {
  const e = M.enrich(chart);
  return [
    'How they decide:\n' + ((e.authority && e.authority.rule) || chart.authority),
    'What lands:\n' + ((e.type && e.type.give) || chart.type),
    'How to get the yes:\n' + ((e.strategy && e.strategy.text) || chart.strategy),
  ].join('\n\n');
}

async function getLead(rep, id) {
  const lead = await db.getById('rep_leads', String(id || ''));
  if (!lead || lead.rep_id !== rep.sub) return null;
  return lead;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const rep = await requireRep(req, res); if (!rep) return;
  const b = req.body || {};
  const action = String(b.action || '');

  try {
    if (action === 'me') {
      const doc = await db.getById('rep_hd', rep.sub).catch(() => null);
      if (!doc || !doc.chart) return res.json({ chart: null });
      return res.json({ chart: doc.chart, meaning: M.enrich(doc.chart), guide: doc.guide || null });
    }

    if (action === 'submit_self') {
      const chart = computeFrom(b);
      // db.update() uses set({merge:true}), which creates the doc if missing, so
      // this upserts one chart per rep keyed by the rep id.
      await db.update('rep_hd', rep.sub, { rep_id: rep.sub, chart, guide: null, guide_at: null, updated_at: new Date().toISOString() });
      return res.json({ chart, meaning: M.enrich(chart) });
    }

    if (action === 'guide_self') {
      const doc = await db.getById('rep_hd', rep.sub).catch(() => null);
      if (!doc || !doc.chart) return res.status(400).json({ error: 'Add your birth details first' });
      if (doc.guide && !b.refresh) return res.json({ guide: doc.guide });
      const facts = M.summaryLine(doc.chart, rep.name || 'the rep');
      const guide = await llmGuide(SYS_SELF, facts, selfFallback(doc.chart));
      await db.update('rep_hd', rep.sub, { guide, guide_at: new Date().toISOString() });
      return res.json({ guide });
    }

    if (action === 'lead') {
      const lead = await getLead(rep, b.lead_id); if (!lead) return res.status(404).json({ error: 'Lead not found' });
      if (!lead.hd) return res.json({ chart: null });
      return res.json({ chart: lead.hd, meaning: M.enrich(lead.hd), guide: lead.hd_guide || null, fit: lead.hd_fit || null });
    }

    if (action === 'submit_lead') {
      const lead = await getLead(rep, b.lead_id); if (!lead) return res.status(404).json({ error: 'Lead not found' });
      const chart = computeFrom(b);
      await db.update('rep_leads', lead.id, { hd: chart, hd_guide: null, hd_fit: null, updated_at: new Date().toISOString() });
      return res.json({ chart, meaning: M.enrich(chart) });
    }

    if (action === 'approach') {
      const lead = await getLead(rep, b.lead_id); if (!lead) return res.status(404).json({ error: 'Lead not found' });
      if (!lead.hd) return res.status(400).json({ error: 'Add the owner birth details first' });
      if (lead.hd_guide && !b.refresh) return res.json({ guide: lead.hd_guide });
      const owner = (lead.contact_name || lead.business_name || 'the owner');
      const facts = 'Owner: ' + owner + ' at ' + (lead.business_name || 'their company') + '.\n' + M.summaryLine(lead.hd, owner);
      const guide = await llmGuide(SYS_APPROACH, facts, approachFallback(lead.hd));
      await db.update('rep_leads', lead.id, { hd_guide: guide, hd_guide_at: new Date().toISOString() });
      return res.json({ guide });
    }

    if (action === 'fit') {
      const lead = await getLead(rep, b.lead_id); if (!lead) return res.status(404).json({ error: 'Lead not found' });
      if (!lead.hd) return res.status(400).json({ error: 'Add the owner birth details first' });
      const mine = await db.getById('rep_hd', rep.sub).catch(() => null);
      if (!mine || !mine.chart) return res.status(400).json({ error: 'Add your own Human Design first' });
      if (lead.hd_fit && !b.refresh) return res.json({ fit: lead.hd_fit });
      const conn = M.connection(mine.chart, lead.hd);
      const repName = (rep.name || 'You').split(' ')[0] || 'You';
      const owner = (lead.contact_name || lead.business_name || 'the owner').split(' ')[0];
      const facts = M.connectionSummary(mine.chart, lead.hd, repName, owner, conn);
      const fb = 'Where you click:\n' + (conn.counts.click ? 'You naturally pull together in ' + conn.counts.click + ' place(s). Lean on that rapport.' : 'No strong electromagnetic pull. Keep it about their business, not chemistry.') +
        '\n\nWhere you will grind:\n' + (conn.counts.grind ? 'There are ' + conn.counts.grind + ' spot(s) where one of you can feel pushed. Slow down and give room.' : 'Little built-in friction here.');
      const brief = await llmGuide(SYS_FIT, facts, fb);
      const fit = { counts: conn.counts, brief, click: conn.click, grind: conn.grind, a_shapes_b: conn.a_shapes_b, b_shapes_a: conn.b_shapes_a };
      await db.update('rep_leads', lead.id, { hd_fit: fit, hd_fit_at: new Date().toISOString() });
      return res.json({ fit });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('rep-hd:', e.message);
    return res.status(400).json({ error: e.message || 'Could not compute chart' });
  }
};

module.exports.config = { maxDuration: 30 };
