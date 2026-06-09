const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

// Statuses that mean the lead is done / out of the active worklist.
const TERMINAL = ['won', 'lost', 'unsubscribed', 'booked'];

// Stage weights — earlier-but-engaged stages get priority because they need a
// timely touch; proposal sits highest because money is on the table.
const STAGE_WEIGHT = {
  proposal: 40,
  qualified: 30,
  contacted: 20,
  new: 25,
};

// How many days of staleness we keep counting before capping out.
const RECENCY_CAP_DAYS = 14;
// Points awarded per stale day (older untouched = more urgent), up to the cap.
const RECENCY_PER_DAY = 2;

function daysSince(dateStr) {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (isNaN(t)) return null;
  const d = (Date.now() - t) / 86400000;
  return d < 0 ? 0 : d;
}

// Build a transparent priority score from stage, recency, and fit hints.
function scoreLead(lead) {
  const l = lead || {};
  const c = (l && l.contacts) || {};
  const reasons = [];
  let score = 0;

  // 1. Stage weight
  const status = (l.status || 'new').toLowerCase();
  const stagePts = STAGE_WEIGHT[status] != null ? STAGE_WEIGHT[status] : 10;
  score += stagePts;
  reasons.push('Stage: ' + status + ' (+' + stagePts + ')');

  // 2. Recency — measure from last activity if we have it, else creation.
  const lastTouch = l.last_contact || l.updated_at || null;
  const refDate = lastTouch || l.created_at || null;
  const ageDays = daysSince(refDate);
  let recencyPts = 0;
  if (ageDays != null) {
    const capped = Math.min(ageDays, RECENCY_CAP_DAYS);
    recencyPts = Math.round(capped * RECENCY_PER_DAY);
    score += recencyPts;
    const rounded = Math.round(ageDays);
    const ageLabel = rounded <= 0 ? 'today'
      : rounded === 1 ? '1 day' : rounded + ' days';
    if (lastTouch) {
      reasons.push('No activity for ' + ageLabel + ' (+' + recencyPts + ')');
    } else {
      reasons.push('Untouched for ' + ageLabel + ' (+' + recencyPts + ')');
    }
  }

  // 3. Fit hints from the contact record.
  const hasCompany = !!(c.company && String(c.company).trim());
  const hasPhone = !!(c.phone && String(c.phone).trim());
  const hasEmail = !!(c.email && String(c.email).trim());
  if (hasCompany) { score += 8; reasons.push('Has company (+8)'); }
  if (hasPhone) { score += 5; reasons.push('Phone on file (+5)'); }
  if (hasEmail) { score += 4; reasons.push('Email on file (+4)'); }
  if (!hasPhone && !hasEmail) { reasons.push('No contact method on file'); }

  // Deal value is a soft tiebreaker so bigger opportunities float up.
  const value = Number(l.value);
  if (!isNaN(value) && value > 0) {
    const valPts = Math.min(10, Math.round(value / 1000));
    if (valPts > 0) { score += valPts; reasons.push('Deal value (+' + valPts + ')'); }
  }

  return {
    score,
    reasons,
    status,
    ageDays: ageDays == null ? null : Math.round(ageDays),
    hasPhone,
    hasEmail,
    usedActivity: !!lastTouch,
  };
}

// Short, human suggested action derived from the scored signals.
function suggestAction(s) {
  const ageStr = s.ageDays == null ? 'unknown age'
    : s.ageDays <= 0 ? 'today'
    : s.ageDays === 1 ? '1 day'
    : s.ageDays + ' days';

  if (s.status === 'proposal') {
    return 'Follow up - proposal sent, no reply ' + ageStr;
  }
  if (s.status === 'qualified') {
    return 'Advance - qualified, ' + ageStr + ' since last touch';
  }
  if (s.status === 'contacted') {
    if (s.usedActivity) return 'Follow up - contacted, no reply ' + ageStr;
    return 'Follow up - contacted ' + ageStr + ' ago';
  }
  // new (or anything else)
  if (s.hasPhone) return 'Call - new, untouched ' + ageStr;
  if (s.hasEmail) return 'Email - new, untouched ' + ageStr;
  return 'Reach out - new, untouched ' + ageStr;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  const { data, error } = await db
    .from('leads')
    .select('*, contacts(*)')
    .not('status', 'in', '(' + TERMINAL.join(',') + ')')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });

  const leads = Array.isArray(data) ? data : [];

  const ranked = leads
    // Defensive: skip any terminal statuses that slipped through (e.g. null
    // handling differences) but keep null/unknown statuses in the worklist.
    .filter(l => !TERMINAL.includes(String((l && l.status) || '').toLowerCase()))
    .map(lead => {
      const s = scoreLead(lead);
      return {
        lead,
        score: s.score,
        reasons: s.reasons,
        suggested_action: suggestAction(s),
      };
    })
    .sort((a, b) => b.score - a.score);

  return res.json(ranked);
};
