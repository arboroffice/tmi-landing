const { cors, verifyToken } = require('./_auth');
const fs = require('fs');
const path = require('path');

// Admin action: load a prospected list (bundled CSV) into the leads collection
// as fresh, uncontacted leads so the daily campaign-send can pick them up.
// Idempotent (upsert by email). Powers the "Import list" button on the Campaign tab.
const LISTS = {
  'lafayette-oil-gas-manufacturing': 'agents/gtm/data/lafayette-oil-gas-manufacturing.csv',
};

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!verifyToken(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const key = (req.body && req.body.list) || 'lafayette-oil-gas-manufacturing';
    const rel = LISTS[key];
    if (!rel) return res.status(400).json({ error: 'unknown list: ' + key });

    const file = path.join(process.cwd(), rel);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'list file not found: ' + rel });
    const csv = fs.readFileSync(file, 'utf8');

    const { importLeadsFromCsv } = await import('../agents/gtm/import-leads.js');
    const stats = await importLeadsFromCsv(csv, { source: 'apify_maps' });
    return res.json({ ok: true, list: key, ...stats });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};

module.exports.config = { maxDuration: 120 };
