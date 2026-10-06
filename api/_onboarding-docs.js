// Contractor onboarding paperwork for City Leads reps (1099 independent
// contractors). Each document renders from the company settings and the rep's
// own details, so the rep reads and signs the exact text that gets stored.
// Plain English on purpose. Have a Louisiana attorney review before relying on it.
//
// render(docId, ctx) -> HTML body (no <html> wrapper)
// ctx = { company, terms, rates, rep, tin, payout, date }

const DOCS = [
  { id: 'contractor_agreement', title: 'Independent Sales Representative Agreement', version: '2026-10-1', countersign: true },
  { id: 'confidentiality', title: 'Confidentiality and Lead Data Agreement', version: '2026-10-1', countersign: true },
  { id: 'w9', title: 'Form W-9 (Substitute): Taxpayer ID and Certification', version: '2026-10-1', countersign: false },
  { id: 'payment', title: 'Commission Payment Authorization', version: '2026-10-1', countersign: false },
  { id: 'conduct', title: 'Field Rules and Brand Acknowledgment', version: '2026-10-1', countersign: false },
];

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = (r) => `${Math.round((Number(r) || 0) * 1000) / 10}%`;
const TAX = {
  individual: 'Individual / sole proprietor or single-member LLC',
  c_corp: 'C corporation', s_corp: 'S corporation', partnership: 'Partnership',
  trust: 'Trust / estate', llc: 'Limited liability company', other: 'Other',
};

function addr(r) {
  return [r.address1, r.address2, [r.city, r.state].filter(Boolean).join(', ') + (r.zip ? ' ' + r.zip : '')].filter((x) => x && String(x).trim()).map(esc).join('<br>');
}
const p = (t) => `<p>${t}</p>`;
const h = (t) => `<h3>${esc(t)}</h3>`;
function parties(c, r) {
  return p(`This agreement is between <b>${esc(c.legal_name)}</b>, doing business as TMI Tech AI, ${esc(c.address)} ("TMI"), and <b>${esc(r.legal_name)}</b>${r.business_name ? `, doing business as ${esc(r.business_name)}` : ''}, ${esc([r.address1, r.city, r.state].filter(Boolean).join(', '))} ("Rep"). It starts on ${esc(r.start_date)}.`);
}

function contractor({ company: c, terms: t, rates, rep: r }) {
  return [
    parties(c, r),
    h('1. What the Rep does'),
    p(`The Rep finds and visits established businesses in the Rep's assigned area (currently ${esc(r.territory || 'as assigned in the City Leads app')}) and sells TMI's Intelligent Company Audit. The Rep may also introduce owners to TMI for a Fit Call. TMI delivers all audits and all later work. TMI may change the Rep's assigned area or lead list at any time.`),
    h('2. Independent contractor'),
    p(`The Rep is an independent contractor, not an employee, partner or agent of TMI. The Rep decides when, where and how many hours to work and uses their own phone, vehicle and equipment. TMI does not withhold income tax, Social Security or Medicare, and does not provide workers' compensation, unemployment insurance, health insurance or other employee benefits. The Rep pays their own taxes and will receive a Form 1099 when required by law. The Rep may sell for other companies, as long as they are not direct competitors of TMI while this agreement is in effect.`),
    h('3. No authority to bind TMI'),
    p(`The Rep cannot sign contracts for TMI, change TMI's prices, offer discounts, promise results, quote build or implementation prices, or say an audit fee credits toward anything. The Rep only uses the prices and descriptions TMI publishes, and the payment links TMI provides.`),
    h('4. Commission'),
    p(`TMI pays the Rep a commission of <b>${pct(rates.audit)}</b> of the Intelligent Company Audit fee TMI actually collects on each audit credited to the Rep, and <b>${pct(rates.upsell)}</b> of implementation and build fees TMI actually collects from that same client within ${esc(t.upsell_window_months)} months after the client's audit is paid. A sale is credited to the Rep when the client pays through the Rep's payment link or QR code, books through the Rep, or TMI's records otherwise show the Rep sourced the client. If two reps claim a client, TMI decides in good faith.`),
    p(`Commission is earned only when TMI receives the client's payment. TMI pays commissions by the ${esc(t.pay_day)}th of each month for client payments received in the month before. If TMI refunds a client or a payment is reversed, the matching commission is subtracted from the Rep's next payments. There is no salary, draw, advance or minimum. TMI may change commission rates going forward with 14 days' written notice (email or the City Leads app); changes never reduce commission already earned.`),
    h('5. Expenses'),
    p(`The Rep pays their own expenses (gas, mileage, phone, meals) unless TMI agrees in writing ahead of time to cover a specific expense.`),
    h('6. Ending the agreement'),
    p(`Either side may end this agreement at any time, for any reason, by written notice (email or text is fine). After it ends, TMI still pays commission on client payments received within ${esc(t.post_term_days)} days after the end date for audits that were credited to the Rep before the end date. The Rep returns or deletes TMI information as described in the Confidentiality and Lead Data Agreement, and TMI turns off the Rep's app access.`),
    h('7. Compliance'),
    p(`The Rep follows all laws that apply to their work, including rules on texting and calling businesses, and TMI's Field Rules. The Rep is responsible for any licenses or registrations their own business needs.`),
    h('8. Liability'),
    p(`Each side is responsible for its own acts. The Rep will cover TMI for claims caused by the Rep's own illegal acts, false statements or serious carelessness. The Rep carries their own auto insurance as required by law.`),
    h('9. General'),
    p(`Louisiana law governs this agreement. Any dispute goes to the courts of ${esc(t.venue_parish)} Parish, Louisiana. This agreement, together with the Confidentiality and Lead Data Agreement and the Field Rules, is the whole agreement on this subject. Changes must be in writing. If one part is found unenforceable, the rest still applies. Electronic signatures count the same as handwritten ones.`),
  ].join('');
}

function confidentiality({ company: c, rep: r }) {
  return [
    parties(c, r),
    h('1. What is confidential'),
    p(`"Confidential Information" means anything the Rep gets from TMI or learns through this work that is not public, including lead lists, business names and contact details TMI provides, notes and history in the City Leads app, client information, audit results, prices that are not published, playbooks, scripts, and how TMI's systems work.`),
    h('2. What the Rep agrees to'),
    p(`The Rep uses Confidential Information only to do work for TMI. The Rep does not copy, export, screenshot in bulk, sell or share TMI's lead lists or client information with anyone else, and does not use them for any other company or for their own business. The Rep keeps their app login private and tells TMI right away if a phone is lost or a login may have been shared.`),
    h('3. Leads and work product'),
    p(`Leads, notes, voice notes, photos and records the Rep creates in the City Leads app belong to TMI. Any ideas, scripts or materials the Rep creates for TMI's business belong to TMI.`),
    h('4. When the work ends'),
    p(`When the agreement ends, or when TMI asks, the Rep stops using and deletes or returns all Confidential Information within 5 days, including anything saved outside the app.`),
    h('5. How long this lasts'),
    p(`These duties last while the Rep works with TMI and for 3 years after. Duties about trade secrets last as long as the information stays a trade secret. Information that becomes public through no fault of the Rep is not covered.`),
    h('6. If this is broken'),
    p(`Because lead and client information is the core of TMI's business, TMI may ask a court to stop a breach right away, in addition to any other rights it has. Louisiana law governs this agreement.`),
  ].join('');
}

function w9({ rep: r, tin }) {
  const tinLabel = r.tin_type === 'ein' ? 'Employer identification number (EIN)' : 'Social Security number (SSN)';
  return [
    p(`<i>This is a substitute Form W-9 provided by TMI. It asks for the same information and certification as IRS Form W-9.</i>`),
    `<table class="kv">
      <tr><th>1. Name (as shown on your income tax return)</th><td>${esc(r.legal_name)}</td></tr>
      <tr><th>2. Business name / disregarded entity name, if different</th><td>${esc(r.business_name || '')}</td></tr>
      <tr><th>3. Federal tax classification</th><td>${esc(TAX[r.tax_class] || r.tax_class || '')}${r.tax_class === 'llc' && r.llc_code ? ' (tax classification ' + esc(r.llc_code) + ')' : ''}</td></tr>
      <tr><th>5-6. Address</th><td>${addr(r)}</td></tr>
      <tr><th>Part I. Taxpayer identification number</th><td>${esc(tinLabel)}: <b>${esc(tin || '')}</b></td></tr>
    </table>`,
    h('Part II. Certification'),
    p(`Under penalties of perjury, I certify that:`),
    `<ol>
      <li>The number shown on this form is my correct taxpayer identification number (or I am waiting for a number to be issued to me); and</li>
      <li>I am not subject to backup withholding because: (a) I am exempt from backup withholding, or (b) I have not been notified by the Internal Revenue Service (IRS) that I am subject to backup withholding as a result of a failure to report all interest or dividends, or (c) the IRS has notified me that I am no longer subject to backup withholding; and</li>
      <li>I am a U.S. citizen or other U.S. person; and</li>
      <li>The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct.</li>
    </ol>`,
    r.backup_withholding ? p(`<b>I have been notified by the IRS that I am currently subject to backup withholding</b> (item 2 is crossed out).`) : '',
    p(`The Internal Revenue Service does not require your consent to any provision of this document other than the certifications required to avoid backup withholding.`),
  ].join('');
}

function payment({ company: c, terms: t, rep: r, payout }) {
  let how = '';
  if (r.payout_method === 'direct_deposit') how = `Direct deposit to ${esc(r.bank_name || 'my bank')}, ${esc(r.account_type || 'checking')} account ending in <b>${esc(r.account_last4 || '')}</b>, routing number ${esc(payout && payout.routing ? payout.routing : '')}.`;
  else if (r.payout_method === 'zelle') how = `Zelle to <b>${esc(r.zelle_handle || '')}</b>.`;
  else how = `Paper check mailed to the address on my W-9.`;
  return [
    p(`I, <b>${esc(r.legal_name)}</b>, ask ${esc(c.legal_name)} (TMI Tech AI) to pay the commissions I earn as follows:`),
    p(how),
    p(`I authorize TMI to send payments this way, and, if a deposit is made in error, to reverse that deposit or subtract it from my next payment. Commissions are paid by the ${esc(t.pay_day)}th of each month for client payments TMI received the month before. I will update my payment details in the City Leads app if they change; payments sent to the details on file before I update them count as paid.`),
  ].join('');
}

function conduct() {
  const rules = [
    'I say I am with TMI Tech AI, out of Lafayette, Louisiana. I never pretend to be with another company, a government office, or a customer.',
    'I describe the Intelligent Company Audit the way TMI publishes it: $5,000, 30 to 45 minutes, in person or by phone, a Business Intelligence Score out of 100 across ten areas, a five-page report, and the Intelligent Company Roadmap the client keeps. The only free thing is the Fit Call.',
    'I never promise results, savings, percentages or dollar figures, never quote build or implementation prices, never offer discounts, and never say the audit fee credits toward anything.',
    'I never invent clients, stories or reviews.',
    'I only take payment through TMI\'s payment link or QR code. I never take cash, checks or card numbers myself.',
    'If someone says no, asks me to leave, or asks not to be contacted, I stop, mark them in the app, and do not contact them again. I honor every STOP reply to a text.',
    'I respect "No Soliciting" signs and private property, and I visit during normal business hours.',
    'I log my visits, calls and texts honestly in the City Leads app.',
    'I keep TMI\'s leads and client information private, as the Confidentiality and Lead Data Agreement says.',
    'I dress and act professionally. I do not drive or text at the same time.',
  ];
  return p('As a TMI Tech AI field rep, I agree to these rules:') + '<ol>' + rules.map((x) => `<li>${esc(x)}</li>`).join('') + '</ol>' +
    p('Breaking these rules can end my agreement with TMI right away.');
}

const RENDER = { contractor_agreement: contractor, confidentiality, w9, payment, conduct };

function render(docId, ctx) { const f = RENDER[docId]; return f ? f(ctx) : ''; }

// The signed record: document text plus the Rep's signature block, as one page.
function page(doc, body, sig, company) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.title)}</title>
<style>body{font-family:Georgia,'Times New Roman',serif;color:#111;max-width:760px;margin:32px auto;padding:0 20px;line-height:1.55;font-size:15px}
h1{font-family:Helvetica,Arial,sans-serif;font-size:21px;margin:0 0 4px}h3{font-family:Helvetica,Arial,sans-serif;font-size:15px;margin:20px 0 4px}
.meta{font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#555;margin-bottom:18px}.kv{border-collapse:collapse;width:100%;margin:8px 0}.kv th,.kv td{border:1px solid #ccc;padding:7px 9px;text-align:left;vertical-align:top;font-size:14px}.kv th{width:42%;background:#f6f6f6;font-weight:600}
.sig{margin-top:28px;border-top:2px solid #111;padding-top:12px;font-family:Helvetica,Arial,sans-serif;font-size:13px}.sig img{max-height:70px;display:block;margin:6px 0}
@media print{body{margin:0}}</style></head><body>
<h1>${esc(doc.title)}</h1><div class="meta">${esc(company.legal_name)} (TMI Tech AI) · Version ${esc(doc.version)}</div>
${body}
<div class="sig"><b>Signed by the Rep</b>${sig.png ? `<img src="${esc(sig.png)}" alt="signature">` : ''}<div>${esc(sig.name)}</div><div>${esc(sig.at)} · electronically signed · IP ${esc(sig.ip || '')}</div><div style="color:#555;margin-top:4px">The Rep agreed to use electronic records and signatures for this document.</div></div>
<!--COUNTERSIGN-->
</body></html>`;
}

function countersignBlock(cs) {
  return `<div class="sig"><b>Signed for ${esc(cs.company)}</b><div>${esc(cs.name)}${cs.title ? ', ' + esc(cs.title) : ''}</div><div>${esc(cs.at)} · electronically signed</div></div>`;
}

module.exports = { DOCS, render, page, countersignBlock, TAX };
