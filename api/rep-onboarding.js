// City Lead onboarding packet. Reps fill in their details once, every document
// pre-fills from them, and they sign in the app (typed name plus drawn
// signature, consent to e-sign, time and IP recorded). Tax ID, bank numbers,
// license and insurance photos, and signed copies are encrypted (_vault.js);
// admin sees last 4 only, except in the 1099 export. Until the packet is done
// (and once the company info is set), the rep's leads stay locked.
//
// Rep:   GET -> status | GET ?preview=doc | GET ?copy=doc
//        POST { action:'profile', ...fields } | { action:'upload', kind:'dl'|'ins', data }
//             { action:'sign', doc, name, png, consent }
// Admin: GET ?admin=1 | ?admin=1&record=id | ?admin=1&file=repId:kind | ?admin=1&export=1099&year=YYYY
//        POST { admin:1, action:'company'|'countersign'|'equipment', ... }
const crypto = require('crypto');
const db = require('./_db');
const { cors, verifyToken } = require('./_auth');
const { verifyRep } = require('./_rep-auth');
const vault = require('./_vault');
const D = require('./_onboarding-docs');
const { getRates } = require('./_rep-comp');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const TERMS = { pay_day: 15, attribution_days: 90, venue_parish: 'Lafayette', require_packet: true };
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const digits = (v) => String(v || '').replace(/\D/g, '');
const today = () => new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric' });
const stampOf = (d) => new Date(d || Date.now()).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT';

async function company() {
  const s = (await db.getById('settings', 'company').catch(() => null)) || {};
  const terms = Object.assign({}, TERMS);
  ['pay_day', 'attribution_days'].forEach((k) => { if (s[k]) terms[k] = Number(s[k]); });
  if (s.venue_parish) terms.venue_parish = s.venue_parish;
  if (s.require_packet === false) terms.require_packet = false;
  const c = { legal_name: s.legal_name || '', address: s.address || '', signer_name: s.signer_name || '', signer_title: s.signer_title || '' };
  return { c, terms, ready: !!(c.legal_name && c.address && c.signer_name) };
}

const PROFILE_FIELDS = ['legal_name', 'business_name', 'tax_class', 'llc_code', 'address1', 'address2', 'city', 'state', 'zip', 'phone', 'personal_email',
  'tin_type', 'tin_last4', 'backup_withholding', 'payout_method', 'bank_name', 'account_type', 'account_last4', 'routing_last4', 'zelle_handle',
  'emergency_name', 'emergency_phone', 'start_date', 'territory', 'dl_state', 'dl_expires', 'ins_carrier', 'ins_expires', 'dl_on_file', 'ins_on_file'];
function safeProfile(k) { k = k || {}; const out = {}; PROFILE_FIELDS.forEach((f) => { if (k[f] !== undefined) out[f] = k[f]; }); return out; }

function missing(k) {
  k = k || {};
  const need = [];
  if (!k.legal_name) need.push('legal name');
  if (!k.tax_class) need.push('tax classification');
  if (!k.address1 || !k.city || !k.state || !k.zip) need.push('mailing address');
  if (!k.phone) need.push('phone');
  if (!k.personal_email) need.push('email');
  if (!k.tin_enc) need.push('SSN or EIN');
  if (!k.payout_method) need.push('how you want to be paid');
  if (k.payout_method === 'direct_deposit' && (!k.routing_enc || !k.account_enc || !k.bank_name)) need.push('bank name, routing and account number');
  if (k.payout_method === 'zelle' && !k.zelle_handle) need.push('Zelle phone or email');
  return need;
}
function driverMissing(k) {
  k = k || {};
  const need = [];
  if (!k.dl_state || !k.dl_expires) need.push('license state and expiration');
  if (!k.dl_on_file) need.push('license photo');
  if (!k.ins_carrier || !k.ins_expires) need.push('insurance company and expiration');
  if (!k.ins_on_file) need.push('insurance card photo');
  return need;
}

function status(rep, co) {
  const k = rep.contractor || {};
  const signed = (rep.onboarding && rep.onboarding.docs) || {};
  const equip = rep.equipment || [];
  const need = missing(k);
  const isDone = (d) => { const s = signed[d.id]; return !!(s && s.version === d.version); };
  const required = (d) => !(d.optional && !equip.length);
  const docs = D.DOCS.map((d) => {
    const s = signed[d.id];
    let blocked = null;
    if (!co.ready) blocked = 'TMI is finishing this document';
    else if (need.length) blocked = 'Finish your info first';
    else if (d.id === 'driver' && driverMissing(k).length) blocked = 'Add: ' + driverMissing(k).join(', ');
    else if (d.last && D.DOCS.some((x) => !x.last && required(x) && !isDone(x))) blocked = 'Sign everything else first';
    return { id: d.id, n: d.n, title: d.title, version: d.version, required: required(d), blocked,
      signed_at: s ? s.signed_at : null, record_id: s ? s.record_id : null, outdated: !!(s && s.version !== d.version),
      countersign: !!d.countersign, countersigned_at: s ? s.countersigned_at || null : null };
  });
  const complete = !need.length && docs.every((d) => !d.required || (d.signed_at && !d.outdated));
  return { company_ready: co.ready, require_packet: co.terms.require_packet, profile: safeProfile(k), sig: k.sig_png ? { name: k.sig_name, png: k.sig_png } : null, missing: need, driver_missing: driverMissing(k), equipment: equip, docs, complete };
}

// True when this rep may work leads: packet done, or the gate is off / not set up yet.
async function cleared(repId) {
  const co = await company();
  if (!co.ready || !co.terms.require_packet) return true;
  const rep = await db.getById('reps', repId).catch(() => null);
  if (!rep) return true;
  if (rep.onboarding && rep.onboarding.waived) return true;
  // The equipment receipt never locks leads; everything else required does.
  const st = status(rep, co);
  return !st.missing.length && st.docs.every((d) => d.id === 'equipment' || !d.required || (d.signed_at && !d.outdated));
}

function fmtTin(k, full) {
  if (!full) return (k.tin_type === 'ein' ? 'XX-XXX' : 'XXX-XX-') + (k.tin_last4 || '');
  return k.tin_type === 'ein' ? full.slice(0, 2) + '-' + full.slice(2) : full.slice(0, 3) + '-' + full.slice(3, 5) + '-' + full.slice(5);
}

async function ctxFor(rep, co, full) {
  const k = rep.contractor || {};
  const rates = await getRates().catch(() => ({ audit: 0.10, upsell: 0.10 }));
  const r = Object.assign({}, k, { start_date: k.start_date || today(), territory: k.territory || rep.city || '' });
  const signed = (rep.onboarding && rep.onboarding.docs) || {};
  const signedList = D.DOCS.filter((d) => !d.last && signed[d.id]).map((d) => ({ title: d.n + ' ' + d.title, at: stampOf(signed[d.id].signed_at) }));
  return {
    company: co.c, terms: co.terms, rates, rep: r, equipment: rep.equipment || [], signedList,
    tin: full ? fmtTin(k, vault.open(k.tin_enc)) : fmtTin(k),
    payout: { routing: full ? vault.open(k.routing_enc) : (k.routing_last4 ? 'ending ' + k.routing_last4 : '') },
  };
}

async function saveProfile(rep, b) {
  const k = Object.assign({}, rep.contractor || {});
  const set = (f, n) => { if (b[f] !== undefined) k[f] = clip(b[f], n) || null; };
  set('legal_name', 100); set('business_name', 100); set('llc_code', 1); set('address1', 120); set('address2', 120);
  set('city', 60); set('zip', 10); set('phone', 30); set('personal_email', 120); set('bank_name', 80); set('zelle_handle', 120);
  set('emergency_name', 80); set('emergency_phone', 30); set('ins_carrier', 80);
  ['dl_expires', 'ins_expires'].forEach((f) => { if (b[f] !== undefined) { const v = clip(b[f], 10); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Check the date format'); k[f] = v || null; } });
  if (b.state !== undefined) k.state = clip(b.state, 2).toUpperCase() || null;
  if (b.dl_state !== undefined) k.dl_state = clip(b.dl_state, 2).toUpperCase() || null;
  if (b.personal_email !== undefined && k.personal_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k.personal_email)) throw new Error('Check your email address');
  if (b.tax_class !== undefined) { if (!D.TAX[b.tax_class]) throw new Error('Pick a tax classification'); k.tax_class = b.tax_class; }
  if (b.backup_withholding !== undefined) k.backup_withholding = !!b.backup_withholding;
  if (b.account_type !== undefined) k.account_type = b.account_type === 'savings' ? 'savings' : 'checking';
  if (b.payout_method !== undefined) { if (!D.PAY[b.payout_method]) throw new Error('Pick how you want to be paid'); k.payout_method = b.payout_method; }
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

// License and insurance card photos: a small JPEG/PNG from the phone, encrypted.
async function upload(rep, b) {
  const kind = b.kind === 'ins' ? 'ins' : b.kind === 'dl' ? 'dl' : null;
  if (!kind) throw new Error('Unknown upload');
  const data = String(b.data || '');
  if (!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(data)) throw new Error('Pick a photo');
  if (data.length > 700000) throw new Error('That photo is too big. Try again.');
  await db.update('rep_files', `${rep.id}_${kind}`, { rep_id: rep.id, kind, data_enc: vault.seal(data), uploaded_at: new Date().toISOString() });
  const k = Object.assign({}, rep.contractor || {}, { [kind + '_on_file']: true });
  await db.update('reps', rep.id, { contractor: k });
  return Object.assign({}, rep, { contractor: k });
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

// One signed record per document; returns the rep with onboarding updated.
async function signOne(rep, doc, sig, co) {
  const body = D.render(doc.id, await ctxFor(rep, co, true));
  const html = D.page(doc, body, { name: sig.name, png: sig.png, at: stampOf(), ip: sig.ip }, co.c);
  const hash = crypto.createHash('sha256').update(html).digest('hex');
  const now = new Date().toISOString();
  const rec = await db.insert('rep_documents', {
    rep_id: rep.id, doc: doc.id, title: doc.title, version: doc.version, html_enc: vault.seal(html), hash,
    signed_name: sig.name, signed_at: now, ip: sig.ip, ua: sig.ua, batch: sig.batch || null, created_at: now,
  });
  const ob = Object.assign({ docs: {} }, rep.onboarding || {});
  ob.docs = Object.assign({}, ob.docs, { [doc.id]: { record_id: rec.id, version: doc.version, signed_at: now, hash } });
  return Object.assign({}, rep, { onboarding: ob });
}

function checkSig(rep, b, req) {
  if (b.consent !== true) throw new Error('Check the box to agree to sign electronically');
  const k = rep.contractor || {};
  const name = clip(b.name || k.sig_name, 100);
  if (norm(name) !== norm(k.legal_name)) throw new Error('Type your full legal name exactly as entered: ' + k.legal_name);
  const png = String(b.png || k.sig_png || '');
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(png) || png.length > 200000) throw new Error('Draw your signature in the box');
  return { name, png, ip: String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null, ua: clip(req.headers['user-agent'], 300) };
}

async function finish(before, after, co) {
  const out = status(after, co);
  const ob = after.onboarding;
  if (out.complete && !ob.completed_at) {
    ob.completed_at = new Date().toISOString();
    if (process.env.TWILIO_ACCOUNT_SID) {
      require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN).messages.create({
        body: `${before.name || (before.contractor || {}).legal_name} finished their City Lead packet. Countersign in Admin > Field Team.`, from: FROM_NUMBER, to: ALERT_NUMBER,
      }).catch(() => {});
    }
  }
  await db.update('reps', after.id, { onboarding: ob });
  return out;
}

// Signs one document.
async function sign(rep, b, req) {
  const co = await company();
  const doc = D.DOCS.find((d) => d.id === b.doc);
  if (!doc) throw new Error('Unknown document');
  const st = status(rep, co).docs.find((d) => d.id === doc.id);
  if (st.blocked) throw new Error(st.blocked === 'TMI is finishing this document' ? 'TMI has not finished setting up the paperwork yet. Check back soon.' : st.blocked);
  const sig = checkSig(rep, b, req);
  return finish(rep, await signOne(rep, doc, sig, co), co);
}

// Save the signature the rep drew once, so it goes on every page.
async function adopt(rep, b) {
  const k = Object.assign({}, rep.contractor || {});
  const name = clip(b.name, 100);
  if (norm(name) !== norm(k.legal_name)) throw new Error('Type your full legal name exactly as entered: ' + (k.legal_name || 'in Your info'));
  const png = String(b.png || '');
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(png) || png.length > 200000) throw new Error('Draw your signature in the box');
  k.sig_name = name; k.sig_png = png; k.sig_adopted_at = new Date().toISOString();
  await db.update('reps', rep.id, { contractor: k });
  return Object.assign({}, rep, { contractor: k });
}

// The whole packet after review: every unsigned document, in order, with the
// adopted signature. The final acknowledgment goes last so it lists the rest.
async function signAll(rep, b, req) {
  const co = await company();
  if (!co.ready) throw new Error('TMI has not finished setting up the paperwork yet. Check back soon.');
  const need = missing(rep.contractor);
  if (need.length) throw new Error('Finish your info first: ' + need.join(', '));
  const dm = driverMissing(rep.contractor);
  if (dm.length) throw new Error('Add: ' + dm.join(', '));
  const sig = Object.assign(checkSig(rep, b, req), { batch: crypto.randomBytes(6).toString('hex') });
  let cur = rep;
  const todo = status(rep, co).docs.filter((d) => d.required && !(d.signed_at && !d.outdated));
  for (const d of todo.filter((x) => x.id !== 'final_ack')) cur = await signOne(cur, D.DOCS.find((x) => x.id === d.id), sig, co);
  if (todo.some((x) => x.id === 'final_ack')) cur = await signOne(cur, D.DOCS.find((x) => x.id === 'final_ack'), sig, co);
  return finish(rep, cur, co);
}

async function signedCopy(recordId) {
  const rec = await db.getById('rep_documents', recordId);
  if (!rec) return null;
  let html = vault.open(rec.html_enc);
  if (rec.countersigned_at) html = html.replace('<!--COUNTERSIGN-->', D.countersignBlock({ company: rec.countersign_company, name: rec.countersigned_by, title: rec.countersign_title, at: rec.countersign_stamp }));
  return { rec, html };
}

function csvCell(v) { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

async function admin(req, res, q, b) {
  const who = verifyToken(req);
  if (!who) return res.status(401).json({ error: 'Unauthorized' });
  const co = await company();
  if (req.method === 'GET' && q.record) {
    const out = await signedCopy(String(q.record));
    if (!out) return res.status(404).json({ error: 'Not found' });
    return res.json({ html: out.html, title: out.rec.title, hash: out.rec.hash });
  }
  if (req.method === 'GET' && q.file) {
    const f = await db.getById('rep_files', String(q.file).replace(':', '_'));
    if (!f) return res.status(404).json({ error: 'Not found' });
    await db.insert('admin_audit', { action: 'view_rep_file', file: f.id, by: who.email || who.sub || 'admin', at: new Date().toISOString() }).catch(() => {});
    return res.json({ data: vault.open(f.data_enc), kind: f.kind, uploaded_at: f.uploaded_at });
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
      const w9 = r.onboarding && r.onboarding.docs && r.onboarding.docs.w9;
      rows.push([r.name, k.legal_name, k.business_name, D.TAX[k.tax_class] || '', (k.tin_type || '').toUpperCase(), k.tin_enc ? fmtTin(k, vault.open(k.tin_enc)) : '',
        [k.address1, k.address2].filter(Boolean).join(' '), k.city, k.state, k.zip, k.personal_email || r.email, (paid[r.id] || 0).toFixed(2), w9 ? String(w9.signed_at).slice(0, 10) : 'NOT SIGNED']);
    });
    await db.insert('admin_audit', { action: 'export_1099', year, by: who.email || who.sub || 'admin', at: new Date().toISOString() }).catch(() => {});
    return res.json({ csv: rows.map((r) => r.map(csvCell).join(',')).join('\n'), year });
  }
  if (req.method === 'GET') {
    const reps = await db.list('reps', { limit: 300 });
    return res.json({
      company: Object.assign({}, co.c, co.terms), company_ready: co.ready,
      reps: (reps || []).filter((r) => r.status !== 'disabled').map((r) => Object.assign({ id: r.id, name: r.name, email: r.email, waived: !!(r.onboarding && r.onboarding.waived) }, status(r, co))),
    });
  }
  if (req.method === 'POST' && b.action === 'company') {
    const up = {};
    ['legal_name', 'address', 'signer_name', 'signer_title', 'venue_parish'].forEach((f) => { if (b[f] !== undefined) up[f] = clip(b[f], 200) || null; });
    ['pay_day', 'attribution_days'].forEach((f) => { if (b[f] !== undefined && b[f] !== '') { const n = parseInt(b[f], 10); if (!(n > 0 && n < 400)) throw new Error('Check the number for ' + f.replace(/_/g, ' ')); up[f] = n; } });
    if (b.require_packet !== undefined) up.require_packet = !!b.require_packet;
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
    await db.update('rep_documents', rec.id, { countersigned_at: now, countersigned_by: co.c.signer_name, countersign_title: co.c.signer_title, countersign_company: co.c.legal_name, countersign_stamp: stampOf() });
    const rep = await db.getById('reps', rec.rep_id);
    if (rep && rep.onboarding && rep.onboarding.docs && rep.onboarding.docs[rec.doc] && rep.onboarding.docs[rec.doc].record_id === rec.id) {
      const ob = Object.assign({}, rep.onboarding); ob.docs = Object.assign({}, ob.docs, { [rec.doc]: Object.assign({}, ob.docs[rec.doc], { countersigned_at: now }) });
      await db.update('reps', rep.id, { onboarding: ob });
    }
    return res.json({ ok: true, countersigned_at: now });
  }
  if (req.method === 'POST' && b.action === 'equipment') {
    const rep = await db.getById('reps', String(b.rep_id || ''));
    if (!rep) return res.status(404).json({ error: 'Rep not found' });
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 30).map((x) => ({ item: clip(x.item, 80), qty: Math.max(1, parseInt(x.qty, 10) || 1), date: clip(x.date, 20) || today(), return_required: !!x.return_required })).filter((x) => x.item);
    await db.update('reps', rep.id, { equipment: items });
    return res.json({ ok: true, equipment: items });
  }
  if (req.method === 'POST' && b.action === 'waive') {
    const rep = await db.getById('reps', String(b.rep_id || ''));
    if (!rep) return res.status(404).json({ error: 'Rep not found' });
    await db.update('reps', rep.id, { onboarding: Object.assign({}, rep.onboarding || {}, { waived: !!b.waived }) });
    return res.json({ ok: true });
  }
  return res.status(400).json({ error: 'Unknown action' });
}

async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const q = req.query || {};
  const b = req.body || {};
  try {
    if (q.admin || b.admin) return await admin(req, res, q, b);

    const who = await verifyRep(req);
    if (!who) return res.status(401).json({ error: 'Sign in required' });
    const rep = await db.getById('reps', who.sub);
    if (!rep) return res.status(404).json({ error: 'Not found' });
    const co = await company();

    if (req.method === 'GET' && q.preview) {
      const doc = D.DOCS.find((d) => d.id === q.preview);
      if (!doc) return res.status(404).json({ error: 'Unknown document' });
      if (!co.ready) return res.json({ title: doc.title, html: '<p>TMI is finishing this document. Check back soon.</p>', ready: false });
      return res.json({ title: doc.n + ' ' + doc.title, version: doc.version, html: D.render(doc.id, await ctxFor(rep, co, false)), ready: true });
    }
    // The whole packet for review before submitting, with the rep's info filled in.
    if (req.method === 'GET' && q.preview_all) {
      if (!co.ready) return res.json({ ready: false, docs: [] });
      const ctx = await ctxFor(rep, co, false);
      const st = status(rep, co);
      const list = D.DOCS.filter((d) => st.docs.find((x) => x.id === d.id).required);
      ctx.signedList = list.filter((d) => !d.last).map((d) => ({ title: d.n + ' ' + d.title, at: 'when you submit' }));
      return res.json({ ready: true, docs: list.map((d) => ({ id: d.id, n: d.n, title: d.title, countersign: !!d.countersign, html: D.render(d.id, ctx) })) });
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
    if (req.method === 'POST' && b.action === 'upload') return res.json(status(await upload(rep, b), co));
    if (req.method === 'POST' && b.action === 'sign') return res.json(await sign(rep, b, req));
    if (req.method === 'POST' && b.action === 'adopt') return res.json(status(await adopt(rep, b), co));
    if (req.method === 'POST' && b.action === 'sign_all') return res.json(await signAll(rep, b, req));
    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    const known = /^(Pick|SSN|Routing|Account|Finish|Check|Type|Draw|Unknown|TMI has|Fill|Add:|Sign everything|That photo|Rep not)/.test(e.message);
    if (!known) console.error('rep-onboarding:', e.message);
    return res.status(known ? 400 : 500).json({ error: known ? e.message : 'Something went wrong. Try again.' });
  }
}

module.exports = handler;
module.exports.cleared = cleared;
