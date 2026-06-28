// Trigger-event source adapters for the intent agent — the signals unique to the
// physical economy that hiring/social chatter miss: new permits, new carrier
// authority, and expansion news. Each returns normalized candidate items and
// degrades to [] (never throws) when its source/key is not configured, matching
// intent-sources.js. The intent agent classifies + dedupes + routes them.
//
//   normalized: { source, sourceId, url, text, company, person, location, typeHint }

import { braveSearch } from './brave.js';

const clip = (s, n = 600) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

// ── Building / trade permits via Socrata open-data (no key needed; optional token) ──
// Configure sources as: { id, url, companyField, textFields:[...], cityField, dateField, label }
// url is a SODA resource endpoint (…/resource/xxxx-xxxx.json). We pull the newest rows.
export async function fetchPermitSignals(sources = [], perSource = 15) {
  const token = process.env.SOCRATA_APP_TOKEN;
  const out = [];
  for (const src of sources) {
    if (!src?.url || !src?.companyField) continue;
    try {
      const params = new URLSearchParams({ $limit: String(perSource) });
      if (src.dateField) params.set('$order', `${src.dateField} DESC`);
      const res = await fetch(`${src.url}?${params.toString()}`, {
        headers: token ? { 'X-App-Token': token } : {},
      });
      if (!res.ok) throw new Error(`Socrata ${res.status}`);
      const rows = await res.json();
      for (const r of (rows || [])) {
        const company = r[src.companyField];
        if (!company || String(company).length < 3) continue;
        const text = (src.textFields || []).map(f => r[f]).filter(Boolean).join(' — ');
        out.push({
          source: 'permit',
          sourceId: `permit:${src.id}:${r[src.idField || 'id'] || `${company}:${r[src.dateField] || ''}`}`,
          url: src.portalUrl || src.url,
          text: clip(`Permit pulled by ${company}${text ? `. ${text}` : ''}${src.label ? ` (${src.label})` : ''}`),
          company: String(company).trim(),
          person: null,
          location: src.label || null,
          typeHint: 'permit',
        });
      }
    } catch (e) { console.warn(`permit source "${src.id}": ${e.message}`); }
  }
  return out;
}

// ── Expansion / new-contract / new-facility news via Brave search ──────────
export async function fetchExpansionSignals(queries = [], perQuery = 6) {
  if (!process.env.BRAVE_API_KEY) return [];
  const out = [];
  for (const q of queries) {
    try {
      const results = await braveSearch(q, { count: perQuery });
      for (const r of (results || [])) {
        const title = r.title || '';
        // best-effort company extraction: text before a growth verb
        const m = title.match(/^(.{2,60}?)\s+(opens|announces|expands|breaks ground|wins|acquires|to build|adds|invests)/i);
        out.push({
          source: 'expansion',
          sourceId: `expansion:${r.url || title}`,
          url: r.url || null,
          text: clip(`${title}. ${r.description || ''}`),
          company: m ? m[1].trim() : null,
          person: null,
          location: null,
          typeHint: 'expansion',
        });
      }
    } catch (e) { console.warn(`expansion query "${q}": ${e.message}`); }
  }
  return out;
}

// ── New carrier authority (FMCSA) — best effort ────────────────────────────
// FMCSA's clean "new authority" feed is the weekly L&I snapshot, not the live API.
// When FMCSA_NEW_AUTHORITY_URL points at a JSON list of recent carriers
// (your own mirror of the L&I file), we ingest it; otherwise this is a no-op.
export async function fetchFmcsaSignals(perRun = 25) {
  const url = process.env.FMCSA_NEW_AUTHORITY_URL;
  if (!url) return [];
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FMCSA ${res.status}`);
    const rows = await res.json();
    return (Array.isArray(rows) ? rows : []).slice(0, perRun).map(r => ({
      source: 'fmcsa',
      sourceId: `fmcsa:${r.dot_number || r.docket || r.legal_name}`,
      url: r.dot_number ? `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${r.dot_number}` : null,
      text: clip(`New motor carrier authority: ${r.legal_name || r.dba_name}${r.city ? `, ${r.city} ${r.state || ''}` : ''}. Power units: ${r.power_units || '?'}.`),
      company: r.legal_name || r.dba_name || null,
      person: null,
      location: [r.city, r.state].filter(Boolean).join(', ') || null,
      typeHint: 'new_authority',
    })).filter(c => c.company);
  } catch (e) { console.warn(`fmcsa: ${e.message}`); return []; }
}
