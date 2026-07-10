// A rep's recorded interactions (transcript + AI recap), for the lead timeline.
//   GET ?lead_id=<id>              -> [ interactions ] (this rep's, newest first)
//   POST { lead_id, channel, ... } -> log a manual interaction (call/text/note)
const db = require('./_db');
const { cors } = require('./_auth');
const { requireRep } = require('./_rep-auth');

const CHANNELS = ['call', 'text', 'note', 'visit', 'email'];
const OUTCOMES = ['booked', 'interested', 'follow_up', 'not_interested', 'no_decision'];

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const rep = await requireRep(req, res); if (!rep) return;

  try {
    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.lead_id) return res.status(400).json({ error: 'lead_id required' });
      const lead = await db.getById('rep_leads', b.lead_id);
      if (!lead || lead.rep_id !== rep.sub) return res.status(404).json({ error: 'Not found' });
      const channel = CHANNELS.includes(b.channel) ? b.channel : 'note';
      const outcome = OUTCOMES.includes(b.outcome) ? b.outcome : null;
      const now = new Date().toISOString();
      const row = await db.insert('rep_interactions', {
        rep_id: rep.sub, lead_id: b.lead_id, channel,
        summary: (b.summary || '').slice(0, 800) || null,
        transcript: (b.transcript || '').slice(0, 4000) || null,
        outcome, next_step: (b.next_step || '').slice(0, 300) || null,
        sentiment: null, source: 'manual', created_at: now,
      });
      // Touch the lead so it counts as worked and rises in the list.
      const patch = { updated_at: now };
      if (lead.status === 'new' && (channel === 'call' || channel === 'text' || channel === 'visit')) {
        patch.status = channel === 'text' ? 'contacted' : 'attempted';
        if (!lead.visited_at) patch.visited_at = now;
      }
      const up = await db.update('rep_leads', b.lead_id, patch).catch(() => null);
      return res.status(201).json({ interaction: row, lead: up });
    }

    const leadId = req.query && req.query.lead_id;
    const where = [['rep_id', '==', rep.sub]];
    if (leadId) where.push(['lead_id', '==', leadId]);
    const rows = await db.list('rep_interactions', { where, order: 'created_at', ascending: false, limit: 100 });
    return res.json(rows || []);
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
