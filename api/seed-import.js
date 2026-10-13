// One-time load of Jentci's Longview, TX industrial list into her City Leads.
// Locked to a one-time key; delete this file once the leads are in.
//   GET ?k=<key>&dry=1 -> who it would go to and how many are new
//   GET ?k=<key>       -> loads them, skips any she already has, puts the
//                         top 50 with a named owner on her list
const crypto = require('crypto');
const db = require('./_db');

const LOCK = 'e9a459ef26b2afa150ab901aadc2da71fe0d30a9d106ba6e065235ff3b361b3a';
const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

module.exports = async (req, res) => {
  const k = crypto.createHash('sha256').update(String(req.query.k || '')).digest('hex');
  if (k !== LOCK) return res.status(404).end();
  try {
    const reps = (await db.list('reps', { limit: 300 })) || [];
    const hits = reps.filter((r) => /jentci/i.test([r.name, r.email].join(' ')));
    if (hits.length !== 1) return res.json({ ok: false, error: 'Expected one rep named Jentci', found: hits.map((r) => ({ id: r.id, name: r.name, email: r.email })) });
    const rep = hits[0];
    const items = require('./_seed/longview-jentci.json');
    const mine = (await db.list('rep_leads', { where: [['rep_id', '==', rep.id]], limit: 10000 })) || [];
    const have = new Set(mine.map((l) => key(l.business_name)));
    const fresh = items.filter((it) => !have.has(key(it.business_name)));
    if (req.query.dry) return res.json({ ok: true, dry: true, rep: { id: rep.id, name: rep.name, email: rep.email }, total: items.length, already_has: items.length - fresh.length, new: fresh.length, existing_leads: mine.length });

    const now = new Date().toISOString();
    const fs = db.db();
    const ids = [];
    for (let i = 0; i < fresh.length; i += 400) {
      const batch = fs.batch();
      fresh.slice(i, i + 400).forEach((it) => {
        const ref = fs.collection('rep_leads').doc();
        const { has_name, ...row } = it;
        batch.set(ref, Object.assign(row, {
          rep_id: rep.id, phone: row.phone || null, email: null, approx_location: false, status: 'new',
          next_action_at: null, lead_id: null, source: 'assigned', created_at: now, updated_at: now, visited_at: null,
        }));
        if (has_name) ids.push(ref.id);
      });
      await batch.commit();
    }
    // Her list: whatever she already has, then the top 50 with a named owner (already sorted closest first).
    const list = (await db.getById('rep_lists', rep.id).catch(() => null)) || {};
    const keep = Array.isArray(list.lead_ids) ? list.lead_ids : [];
    const add = ids.slice(0, 50).filter((id) => !keep.includes(id));
    const names = fresh.filter((it) => it.has_name).slice(0, 50).map((it) => String(it.business_name).toLowerCase().trim());
    await db.update('rep_lists', rep.id, { rep_id: rep.id, lead_ids: keep.concat(add).slice(0, 500), names: (Array.isArray(list.names) ? list.names : []).concat(names).slice(0, 500), updated_at: now });
    return res.json({ ok: true, rep: rep.name, loaded: fresh.length, skipped_already_had: items.length - fresh.length, added_to_list: add.length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
