// Lead-fit scoring for identified visitors. Pure function, no I/O — used by the
// webhook (on ingest), enroll, and the admin list. 0-100 with human reasons.

const PHYSICAL = ['oil', 'gas', 'construction', 'trades', 'manufacturing', 'fleet', 'mining', 'utilities', 'home service', 'plumbing', 'hvac', 'roofing', 'electrical', 'landscaping', 'concrete', 'welding', 'pipeline', 'heavy', 'agriculture', 'field service', 'excavation', 'paving'];
const SENIOR = ['owner', 'founder', 'co-founder', 'ceo', 'president', 'principal', 'partner', 'chief', 'coo', 'cfo', 'cto', 'vp ', 'vice president'];
const MID = ['director', 'head of', 'gm', 'general manager', 'operations manager', 'ops manager', 'superintendent', 'manager', 'lead'];
const INTENT_PAGES = ['/audit', '/complete-audit', '/booking', '/pricing', '/marketplace', '/contact', '/demo', '/buy', 'savings-calculator'];

function scoreVisitor(v = {}) {
  let score = 0;
  const reasons = [];

  const ind = (v.industry || '').toLowerCase();
  if (PHYSICAL.some(k => ind.includes(k))) { score += 30; reasons.push('ICP industry'); }

  const title = (v.title || '').toLowerCase();
  if (SENIOR.some(k => title.includes(k))) { score += 25; reasons.push('Senior decision-maker'); }
  else if (MID.some(k => title.includes(k))) { score += 15; reasons.push('Manager-level'); }

  if (v.email) { score += 10; reasons.push('Work email'); }

  const visits = v.visit_count || 1;
  if (visits > 1) { score += Math.min((visits - 1) * 5, 20); reasons.push(`${visits} visits`); }

  const page = (v.last_page || '').toLowerCase();
  if (INTENT_PAGES.some(p => page.includes(p))) { score += 25; reasons.push('High-intent page'); }

  if (v.company_size) { score += 8; reasons.push('Company size known'); }
  if (v.linkedin_url) { score += 5; reasons.push('LinkedIn'); }

  if (score > 100) score = 100;
  return { score, reasons };
}

// >= this is a "hot" visitor worth a real-time alert and top-of-queue placement.
const HOT_THRESHOLD = 70;

module.exports = { scoreVisitor, HOT_THRESHOLD };
