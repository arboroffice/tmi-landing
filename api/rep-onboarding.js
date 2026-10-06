// Contractor onboarding for City Leads reps: they fill in their details once,
// every document pre-fills from them, and they sign in the app (typed name plus
// drawn signature, consent to e-sign, time and IP recorded). Tax ID and bank
// numbers are encrypted (see _vault.js); admin sees last 4 only, except in the
// 1099 export. Signed copies are stored encrypted and can be printed to PDF.
//
// Rep:   GET -> status | GET ?preview=doc | GET ?copy=doc
//        POST { action:'profile', ...fields } | POST { action:'sign', doc, name, png, consent }
// Admin: GET ?admin=1 | GET ?admin=1&record=id | GET ?admin=1&export=1099&year=YYYY
//        POST { action:'company', ... } | POST { action:'countersign', record_id }
const crypto = require('crypto');
const db = require('./_db');
const { cors, verifyToken } = require('./_auth');
const { verifyRep } = require('./_rep-auth');
const vault = require('./_vault');
const D = require('./_onboarding-docs');
const { getRates } = require('./_rep-comp');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const TERMS = { pay_day: 15, upsell_window_months: 12, post_term_days: 90, venue_parish: 'Lafayette' };
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const digits = (v) => String(v || '').replace(/\D/g, '');
const today = () => new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric' });
const stamp = () => new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT';

async function company() {
  const s = (await db.getById('settings', 'company').catch(() => null)) || {};
  const terms = Object.assign({}, TERMS);
  ['pay_day', 'upsell_window_months', 'post_term_days'].forEach((k) => { if (s[k]) terms[k] = Number(s[k]); });
  if (s.venue_parish) terms.venue_parish = s.venue_parish;
  const c = { legal_name: s.legal_name || '', address: s.address || '', signer_name: s.signer_name || '', signer_title: s.signer_title || '' };
  return { c, terms, ready: !!(c.legal_name && c.address && c.signer_name) };
}

// What the rep (and admin) may see of the stored profile. Never full numbers.
function safeProfile(k) {
  k = k || {};
  const out = {};
  ['legal_name', 'business_name', 'tax_class', 'llc_code', 'address1', 'address2', 'city', 'state', 'zip', 'phone', 'personal_email',
    'tin_type', 'tin_last4', 'backup_withholding', 'payout_method', 'bank_name', 'account_type', 'account_last4', 'routing_last4', 'zelle_handle',
    'emergency_name', 'emergency_phone', 'start_date', 'territory'].forEach((f) => { if (k[f] !== undefined) out[f] = k[f]; });
  return out;
}

function missing(k) {
  k = k || {};
  const need = [];
  if (!k.legal_name) need.push('legal name');
  if (!k.tax_class) need.push('tax classification');
  if (!k.address1 || !k.city || !k.state || !k.zip) need.push('address');
  if (!k.phone) need.push('phone');
  if (!k.tin_enc) need.push('SSN or EIN');
  if (!k.payout_method) need.push('how you want to be paid');
  if (k.payout_method === 'direct_deposit' && (!k.routing_enc || !k.account_enc)) need.push('bank routing and account number');
  if (k.payout_method === 'zelle' && !k.zelle_handle) need.push('Zelle phone or email');
  return need;
}

function status(rep, co) {
  const k = rep.contractor || {};
  const signed = (rep.onboarding && rep.onboarding.docs) || {};
  const docs = D.DOCS.map((d) => {
    const s = signed[d.id];
    return { id: d.id, title: d.title, version: d.version, signed_at: s ? s.signed_at : null, record_id: s ? s.record_id : null,
      outdated: !!(s && s.version !== d.version), countersign: d.countersign, countersigned_at: s ? s.countersigned_at || null : null };
  });
  const need = missing(k);
  return { company_ready: co.ready, profile: safeProfile(k), missing: need, docs,
    complete: !need.length && docs.every((d) => d.signed_at && !d.outdated) };
}

function fmtTin(k, full) {
  if (!full) return (k.tin_type === 'ein' ? 'XX-XXX' : 'XXX-XX-') + (k.tin_last4 || '');
  return k.tin_type === 'ein' ? full.slice(0, 2) + '-' + full.slice(2) : full.slice(0, 3) + '-' + full.slice(3, 5) + '-' + full.slice(5);
}

async function ctxFor(rep, co, full) {
  const k = rep.contractor || {};
  const rates = await getRates().catch(() => ({ audit: 0.10, upsell: 0.10 }));
  const r = Object.assign({}, k, { start_date: k.start_date || today(), territory: k.territory || rep.city || '' });
  const tin = full ? fmtTin(k, vault.open(k.tin_enc)) : fmtTin(k);
  const payout = { routing: full ? vault.open(k.routing_enc) : (k.routing_last4 ? 'ending ' + k.routing_last4 : '') };
  return { company: co.c, terms: co.terms, rates, rep: r, tin, payout };
}

async function saveProfile(rep, b) {
  const k = Object.assign({}, rep.contractor || {});
  const set = (f, n) => { if (b[f] !== undefined) k[f] = clip(b[f], n) || null; };
  set('legal_name', 100); set('business_name', 100); set('llc_code', 2); set('address1', 120); set('address2', 120);
  set('city', 60); set('zip', 10); set('phone', 30); set('personal_email', 120); set('bank_name', 80); set('zelle_handle', 120);
  set('emergency_name', 80); set('emergency_phone', 30);
  if (b.state !== undefined) k.state = clip(b.state, 2).toUpperCase() || null;
  if (b.tax_class !== undefined) { if (!D.TAX[b.tax_class]) throw new Error('Pick a tax classification'); k.tax_class = b.tax_class; }
  if (b.backup_withholding !== undefined) k.backup_withholding = !!b.backup_withholding;
  if (b.account_type !== undefined) k.account_type = b.account_type === 'savings' ? 'savings' : 'checking';
  if (b.payout_method !== undefined) { if (!['direct_deposit', 'zelle', 'check'].includes(b.payout_method)) throw new Error('Pick how you want to be paid'); k.payout_method = b.payout_method; }
  if (b.tin !== undefined && String(b.tin).trim()) {
    const t = digits(b.tin);
    if (t.length !== 9) throw new Error('SSN or EIN must be 9 digits');
    k.tin_type = b.tin_type === 'ein' ? 'ein' : 'ssn';
    k.tin_enc = vault.seal(t); k.tin_last4 = t.slice(-4);
  } else if (b.tin_type && k.tin_enc) k.tin_type = b.tin_type === 'ein' ? 'ein' : 'ssn';
  if (b.routing !== undefined && String(b.routing).trim()) {
    const t = digits(b.routing);
    if (t.length !== 9) throw new Error('Routing number must be 9 digits');
    k.routing_enc = vault.seal(t); k.routing_last4 = t.slice(-4);
  }
  if (b.account !== undefined && String(b.account).trim()) {
    const t = digits(b.account);
    if (t.length < 4 || t.length > 17) throw new Error('Account number looks wrong');
    k.account_enc = vault.seal(t); k.account_last4 = t.slice(-4);
  }
  if (!k.start_date) k.start_date = today();
  if (!k.territory) k.territory = rep.city || null;
  k.updated_at = new Date().toISOString();
  await db.update('reps', rep.id, { contractor: k });
  return Object.assign({}, rep, { contractor: k });
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

async function sign(rep, b, req) {
  const co = await company();
  if (!co.ready) throw new Error('TMI has not finished setting up the paperwork yet. Check back soon.');
  const doc = D.DOCS.find((d) => d.id === b.doc);
  if (!doc) throw new Error('Unknown document');
  const k = rep.contractor || {};
  const need = missing(k);
  if (need.length) throw new Error('Finish your info first: ' + need.join(', '));
  if (b.consent !== true) throw new Error('Check the box to agree to sign electronically');
  const name = clip(b.name, 100);
  if (norm(name) !== norm(k.legal_name)) throw new Error('Type your full legal name exactly as entered: ' + k.legal_name);
  const png = String(b.png || '');
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(png) || png.length > 200000) throw new Error('Draw your signature in the box');

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;
  const at = stamp();
  const body = D.render(doc.id, await ctxFor(rep, co, true));
  const html = D.page(doc, body, { name, png, at, ip }, co.c);
  const hash = crypto.createHash('sha256').update(html).digest('hex');
  const now = new Date().toISOString();
  const rec = await db.insert('rep_documents', {
    rep_id: rep.id, doc: doc.id, title: doc.title, version: doc.version, html_enc: vault.seal(html), hash,
    signed_name: name, signed_at: now, ip, ua: clip(req.headers['user-agent'], 300), created_at: now,
  });
  const ob = Object.assign({ docs: {} }, rep.onboarding || {});
  ob.docs = Object.assign({}, ob.docs, { [doc.id]: { record_id: rec.id, version: doc.version, signed_at: now, hash } });
  const after = Object.assign({}, rep, { onboarding: ob });
  const st = status(after, co);
  if (st.complete && !ob.completed_at) {
    ob.completed_at = now;
    if (process.env.TWILIO_ACCOUNT_SID) {
      require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN).messages.create({
        body: `${rep.name || k.legal_name} finished their City Leads paperwork. Countersign it in Admin > Field Team.`, from: FROM_NUMBER, to: ALERT_NUMBER,
      }).catch(() => {});
    }
  }
  await db.update('reps', rep.id, { onboarding: ob });
  return status(Object.assign({}, rep, { onboarding: ob }), co);
}

async function signedCopy(recordId) {
  const rec = await db.getById('rep_documents', recordId);
  if (!rec) return null;
  let html = vault.open(rec.html_enc);
  if (rec.countersigned_at) html = html.replace('<!--COUNTERSIGN-->', D.countersignBlock({ company: rec.countersign_company, name: rec.countersigned_by, title: rec.countersign_title, at: rec.countersign_stamp }));
  return { rec, html };
}

function csvCell(v) { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const q = req.query || {};
  const b = req.body || {};
  try {
    // ---------------- Admin ----------------
    if (q.admin || b.admin) {
      const admin = verifyToken(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });
      const co = await company();
      if (req.method === 'GET' && q.record) {
        const out = await signedCopy(String(q.record));
        if (!out) return res.status(404).json({ error: 'Not found' });
        return res.json({ html: out.html, title: out.rec.title, hash: out.rec.hash });
      }
      if (req.method === 'GET' && q.export === '1099') {
        const year = parseInt(q.year, 10) || new Date().getFullYear();
        const [reps, comms] = await Promise.all([db.list('reps', { limit: 300 }), db.list('rep_commissions', { limit: 20000 }).catch(() => [])]);
        const paid = {};
        (comms || []).forEach((c) => { if (c.status === 'paid' && String(c.paid_at || '').startsWith(String(year))) paid[c.rep_id] = (paid[c.rep_id] || 0) + (Number(c.commission) || 0); });
        const rows = [['Rep', 'Legal name', 'Business name', 'Tax classification', 'TIN type', 'TIN', 'Address', 'City', 'State', 'ZIP', 'Email', `Commissions paid ${year}`, 'W-9 signed']];
        (reps || []).forEach((r) => {
          const k = r.contractor || {};
          if (!k.legal_name && !paid[r.id]) return;
          const tin = k.tin_enc ? fmtTin(k, vault.open(k.tin_enc)) : '';
          const w9 = r.onboarding && r.onboarding.docs && r.onboarding.docs.w9;
          rows.push([r.name, k.legal_name, k.business_name, D.TAX[k.tax_class] || '', (k.tin_type || '').toUpperCase(), tin, [k.address1, k.address2].filter(Boolean).join(' '), k.city, k.state, k.zip, k.personal_email || r.email, (paid[r.id] || 0).toFixed(2), w9 ? w9.signed_at.slice(0, 10) : 'NOT SIGNED']);
        });
        await db.insert('admin_audit', { action: 'export_1099', year, by: admin.email || admin.sub || 'admin', at: new Date().toISOString() }).catch(() => {});
        return res.json({ csv: rows.map((r) => r.map(csvCell).join(',')).join('\n'), year });
      }
      if (req.method === 'GET') {
        const reps = await db.list('reps', { limit: 300 });
        return res.json({
          company: Object.assign({}, co.c, co.terms), company_ready: co.ready,
          reps: (reps || []).filter((r) => r.status !== 'disabled').map((r) => Object.assign({ id: r.id, name: r.name, email: r.email }, status(r, co))),
        });
      }
      if (req.method === 'POST' && b.action === 'company') {
        const up = {};
        ['legal_name', 'address', 'signer_name', 'signer_title', 'venue_parish'].forEach((f) => { if (b[f] !== undefined) up[f] = clip(b[f], 200) || null; });
        ['pay_day', 'upsell_window_months', 'post_term_days'].forEach((f) => { if (b[f] !== undefined && b[f] !== '') { const n = parseInt(b[f], 10); if (!(n > 0 && n < 400)) throw new Error('Check the number for ' + f.replace(/_/g, ' ')); up[f] = n; } });
        up.updated_at = new Date().toISOString();
        await db.update('settings', 'company', up);
        const c2 = await company();
        return res.json({ company: Object.assign({}, c2.c, c2.terms), company_ready: c2.ready });
      }
      if (req.method === 'POST' && b.action === 'countersign') {
        if (!co.ready) return res.status(400).json({ error: 'Fill in the company info first' });
        const rec = await db.getById('rep_documents', String(b.record_id || ''));
        if (!rec) return res.status(404).json({ error: 'Not found' });
        const now = new Date().toISOString();
        await db.update('rep_documents', rec.id, { countersigned_at: now, countersigned_by: co.c.signer_name, countersign_title: co.c.signer_title, countersign_company: co.c.legal_name, countersign_stamp: stamp() });
        const rep = await db.getById('reps', rec.rep_id);
        if (rep && rep.onboarding && rep.onboarding.docs && rep.onboarding.docs[rec.doc] && rep.onboarding.docs[rec.doc].record_id === rec.id) {
          const ob = Object.assign({}, rep.onboarding); ob.docs = Object.assign({}, ob.docs, { [rec.doc]: Object.assign({}, ob.docs[rec.doc], { countersigned_at: now }) });
          await db.update('reps', rep.id, { onboarding: ob });
        }
        return res.json({ ok: true, countersigned_at: now });
      }
      return res.status(400).json({ error: 'Unknown action' });
    }

    // ---------------- Rep ----------------
    const who = await verifyRep(req);
    if (!who) return res.status(401).json({ error: 'Sign in required' });
    const rep = await db.getById('reps', who.sub);
    if (!rep) return res.status(404).json({ error: 'Not found' });
    const co = await company();

    if (req.method === 'GET' && q.preview) {
      const doc = D.DOCS.find((d) => d.id === q.preview);
      if (!doc) return res.status(404).json({ error: 'Unknown document' });
      if (!co.ready) return res.json({ title: doc.title, html: '<p>TMI is finishing this document. Check back soon.</p>', ready: false });
      return res.json({ title: doc.title, version: doc.version, html: D.render(doc.id, await ctxFor(rep, co, false)), ready: true });
    }
    if (req.method === 'GET' && q.copy) {
      const s = rep.onboarding && rep.onboarding.docs && rep.onboarding.docs[q.copy];
      if (!s) return res.status(404).json({ error: 'Not signed yet' });
      const out = await signedCopy(s.record_id);
      if (!out || out.rec.rep_id !== rep.id) return res.status(404).json({ error: 'Not found' });
      return res.json({ html: out.html, title: out.rec.title });
    }
    if (req.method === 'GET') return res.json(status(rep, co));
    if (req.method === 'POST' && b.action === 'profile') return res.json(status(await saveProfile(rep, b), co));
    if (req.method === 'POST' && b.action === 'sign') return res.json(await sign(rep, b, req));
    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    const known = /^(Pick|SSN|Routing|Account|Finish|Check|Type|Draw|Unknown|TMI has|Fill)/.test(e.message);
    if (!known) console.error('rep-onboarding:', e.message);
    return res.status(known ? 400 : 500).json({ error: known ? e.message : 'Something went wrong. Try again.' });
  }
};
