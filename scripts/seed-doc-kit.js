#!/usr/bin/env node
// Seed the TMI Company Kit into the LIVE backend. Run this once (and again when
// a template changes). It does two things, both against private infrastructure:
//
//   1. Uploads each kit PDF to private Firebase Storage at doc-kit/<file>.
//   2. If SIGNNOW_ACCESS_TOKEN is set, creates a SignNow template from each PDF
//      and records its template id.
//
// It writes one Firestore doc per template into the `doc_templates` collection:
//   { doc_id, file, storage_path, signnow_template_id }
// which api/doc-agent.js reads at Approve & Send time.
//
// The PDFs are NEVER committed to the (public) repo. Point this at your local
// unzipped kit folder:
//
//   FIREBASE_SERVICE_ACCOUNT=... SIGNNOW_ACCESS_TOKEN=... \
//     node scripts/seed-doc-kit.js /path/to/TMI-COMPANY-KIT
//
// Requires: firebase-admin (already a dependency), and Node 18+ (global fetch).

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const kit = require('../api/_doc-kit');

const KIT_DIR = process.argv[2] || process.env.KIT_DIR;
if (!KIT_DIR) { console.error('Usage: node scripts/seed-doc-kit.js /path/to/TMI-COMPANY-KIT'); process.exit(1); }

const CATEGORY_DIR = { client: '01-client', addenda: '02-addenda', vendor: '03-vendor' };

function initFirebase() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
  const sa = JSON.parse(raw.trim().charAt(0) === '{' ? raw : Buffer.from(raw, 'base64').toString('utf8'));
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa), storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${sa.project_id}.firebasestorage.app` });
  return { db: admin.firestore(), bucket: admin.storage().bucket() };
}

function findPdf(doc) {
  const sub = CATEGORY_DIR[doc.category] || '';
  const p = path.join(KIT_DIR, sub, doc.file);
  if (fs.existsSync(p)) return p;
  // fall back to a recursive search by filename
  const hit = walk(KIT_DIR).find(f => path.basename(f) === doc.file);
  return hit || null;
}
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const f = path.join(dir, d.name);
    return d.isDirectory() ? walk(f) : [f];
  });
}

async function createSignNowTemplate(pdfPath, name) {
  const token = process.env.SIGNNOW_ACCESS_TOKEN;
  if (!token) return null;
  const base = process.env.SIGNNOW_API_BASE || 'https://api.signnow.com';
  // Upload the PDF as a document, then convert it to a reusable template.
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(pdfPath)], { type: 'application/pdf' }), path.basename(pdfPath));
  const up = await fetch(`${base}/document`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const upJson = await up.json();
  if (!up.ok) throw new Error('SignNow upload failed: ' + JSON.stringify(upJson));
  const tpl = await fetch(`${base}/template`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ document_id: upJson.id, document_name: name }) });
  const tplJson = await tpl.json();
  if (!tpl.ok) throw new Error('SignNow template create failed: ' + JSON.stringify(tplJson));
  return tplJson.id;
}

(async () => {
  const { db, bucket } = initFirebase();
  const signnowOn = !!process.env.SIGNNOW_ACCESS_TOKEN;
  console.log(`Seeding ${kit.DOCUMENTS.length} documents from ${KIT_DIR}. SignNow: ${signnowOn ? 'on' : 'off (storage only)'}`);

  for (const doc of kit.DOCUMENTS) {
    const pdf = findPdf(doc);
    if (!pdf) { console.warn(`  ! ${doc.id}: PDF not found (${doc.file}) - skipping`); continue; }
    const storagePath = `doc-kit/${doc.file}`;
    await bucket.upload(pdf, { destination: storagePath, metadata: { contentType: 'application/pdf' } });

    let tplId = null;
    if (signnowOn) {
      try { tplId = await createSignNowTemplate(pdf, `TMI - ${doc.title}`); }
      catch (e) { console.warn(`  ! ${doc.id}: SignNow template failed: ${e.message}`); }
    }

    await db.collection('doc_templates').doc(doc.id).set({
      doc_id: doc.id, file: doc.file, title: doc.title, category: doc.category,
      storage_path: storagePath, signnow_template_id: tplId || null,
      updated_at: new Date().toISOString(),
    }, { merge: true });
    console.log(`  ok ${doc.id}${tplId ? ' (template ' + tplId + ')' : ''}`);
  }
  console.log('Done. Templates are in private Firebase Storage and the doc_templates collection.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
