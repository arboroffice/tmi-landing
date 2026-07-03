// Loads a prospected CSV into the leads collection as fresh, uncontacted leads
// so the daily campaign-send can pick them up. Idempotent: upserts by email, so
// re-running never double-adds and never re-contacts a lead already in campaign.
//
// CSV columns expected (from the prospecting export):
//   email, first_name, company, website, phone, city, state, category,
//   industry, industry_bucket, industry_angle, role_account
//
// CLI:  node agents/gtm/import-leads.js agents/gtm/data/lafayette-oil-gas-manufacturing.csv

import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import * as db from './tools/db.js';

// Minimal CSV parser (handles quoted fields + escaped quotes).
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export async function importLeadsFromCsv(csvText, { source = 'prospecting' } = {}) {
  const rows = parseCsv(csvText).filter(r => r.length > 1);
  if (!rows.length) return { total: 0, added: 0, skipped: 0 };
  const header = rows.shift().map(h => h.trim());
  const idx = (name) => header.indexOf(name);

  const stats = { total: 0, added: 0, existing: 0, skipped: 0 };
  for (const r of rows) {
    const email = String(r[idx('email')] || '').toLowerCase().trim();
    if (!email.includes('@')) { stats.skipped++; continue; }
    stats.total++;

    const existing = await db.findLead('email', email).catch(() => null);
    if (existing) { stats.existing++; continue; }

    await db.insertLead({
      email,
      owner_name: String(r[idx('first_name')] || '').trim() || null,
      company_name: String(r[idx('company')] || '').trim() || null,
      website: String(r[idx('website')] || '').trim() || null,
      phone: String(r[idx('phone')] || '').trim() || null,
      location: [r[idx('city')], r[idx('state')]].filter(Boolean).join(', '),
      industry: String(r[idx('industry')] || '').trim() || null,
      industry_bucket: String(r[idx('industry_bucket')] || '').trim() || null,
      status: 'new',
      unsubscribed: false,
      reply_received: false,
      source,
    }).catch((e) => { console.warn('import insert', email, e.message); stats.skipped++; });
    stats.added++;
  }
  console.log(`import-leads: ${stats.added} added, ${stats.existing} already present, ${stats.skipped} skipped (of ${stats.total})`);
  return stats;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const file = process.argv[2] || 'agents/gtm/data/lafayette-oil-gas-manufacturing.csv';
  const text = fs.readFileSync(file, 'utf8');
  importLeadsFromCsv(text)
    .then((s) => { console.log(JSON.stringify(s)); process.exit(0); })
    .catch((e) => { console.error('Fatal:', e); process.exit(1); });
}
