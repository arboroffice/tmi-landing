// City Lead onboarding packet for TMI Tech AI field reps (1099 independent
// contractors). Twelve parts, in order. Each one renders from the company
// settings and the rep's own details, so the rep reads and signs the exact text
// that gets stored. Plain English on purpose. Have a Louisiana attorney review
// before relying on it.
//
// render(docId, ctx) -> HTML body (no <html> wrapper)
// ctx = { company, terms, rates, rep, tin, payout, equipment, signedList, date }

const V = '2026-10-2';
const DOCS = [
  { id: 'info_sheet', n: '01', title: 'City Lead Information Form', version: V },
  { id: 'w9', n: '02', title: 'Form W-9 (Substitute): Taxpayer ID and Certification', version: V },
  { id: 'contractor_agreement', n: '03', title: 'Independent Contractor Agreement', version: V, countersign: true },
  { id: 'compensation', n: '04', title: 'Commission and Compensation Agreement', version: V, countersign: true },
  { id: 'nda_ip', n: '05', title: 'Confidentiality, NDA and Work Product Agreement', version: V, countersign: true },
  { id: 'data_portal', n: '06', title: 'Data and Portal Use Agreement', version: V },
  { id: 'conduct', n: '07', title: 'Sales Conduct Agreement', version: V },
  { id: 'brand_media', n: '08', title: 'Brand, Social Media and Likeness Release', version: V },
  { id: 'driver', n: '09', title: 'Driver and Insurance Documentation', version: V },
  { id: 'payment', n: '10', title: 'Payment Setup and ACH Authorization', version: V },
  { id: 'equipment', n: '11', title: 'Equipment and Materials Receipt', version: V, optional: true },
  { id: 'final_ack', n: '12', title: 'City Lead Final Acknowledgment', version: V, last: true },
];

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = (r) => `${Math.round((Number(r) || 0) * 1000) / 10}%`;
const TAX = {
  individual: 'Individual / sole proprietor or single-member LLC',
  c_corp: 'C corporation', s_corp: 'S corporation', partnership: 'Partnership',
  trust: 'Trust / estate', llc: 'Limited liability company', other: 'Other',
};
const PAY = { direct_deposit: 'Direct deposit (ACH)', zelle: 'Zelle', check: 'Paper check' };

const p = (t) => `<p>${t}</p>`;
const h = (t) => `<h3>${esc(t)}</h3>`;
const ul = (items) => '<ul>' + items.map((x) => `<li>${x}</li>`).join('') + '</ul>';
const kv = (rows) => '<table class="kv">' + rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('') + '</table>';
function addr(r) {
  return [r.address1, r.address2, [r.city, r.state].filter(Boolean).join(', ') + (r.zip ? ' ' + r.zip : '')].filter((x) => x && String(x).trim()).map(esc).join('<br>');
}
const co = (c) => `${esc(c.legal_name)} (doing business as TMI Tech AI)`;
function parties(c, r) {
  return p(`This agreement is between ${co(c)}, ${esc(c.address)} ("TMI"), and <b>${esc(r.legal_name)}</b>${r.business_name ? `, doing business as ${esc(r.business_name)}` : ''} ("City Lead" or "you"). Effective date: ${esc(r.start_date)}.`);
}

function info_sheet({ rep: r, company: c }) {
  return p(`Information for ${co(c)}. Keep it current in the City Lead app.`) + kv([
    ['Legal name', esc(r.legal_name)],
    ['Business name, if any', esc(r.business_name || 'None')],
    ['Mailing address', addr(r)],
    ['Phone', esc(r.phone)],
    ['Email', esc(r.personal_email)],
    ['Territory / city', esc(r.territory || 'As assigned in the City Lead app')],
    ['Emergency contact', esc([r.emergency_name, r.emergency_phone].filter(Boolean).join(', ') || 'None given')],
    ['Start date', esc(r.start_date)],
  ]) + p('I confirm this information is true and complete, and I will update it in the app within 5 days of any change.');
}

function w9({ rep: r, tin }) {
  const tinLabel = r.tin_type === 'ein' ? 'Employer identification number (EIN)' : 'Social Security number (SSN)';
  return [
    p(`<i>This is a substitute Form W-9 provided by TMI. It asks for the same information and certification as IRS Form W-9.</i>`),
    kv([
      ['1. Name (as shown on your income tax return)', esc(r.legal_name)],
      ['2. Business name / disregarded entity name, if different', esc(r.business_name || '')],
      ['3. Federal tax classification', esc(TAX[r.tax_class] || r.tax_class || '') + (r.tax_class === 'llc' && r.llc_code ? ' (tax classification ' + esc(r.llc_code) + ')' : '')],
      ['5-6. Address', addr(r)],
      ['Part I. Taxpayer identification number', `${esc(tinLabel)}: <b>${esc(tin || '')}</b>`],
    ]),
    h('Part II. Certification'),
    p('Under penalties of perjury, I certify that:'),
    `<ol>
      <li>The number shown on this form is my correct taxpayer identification number (or I am waiting for a number to be issued to me); and</li>
      <li>I am not subject to backup withholding because: (a) I am exempt from backup withholding, or (b) I have not been notified by the Internal Revenue Service (IRS) that I am subject to backup withholding as a result of a failure to report all interest or dividends, or (c) the IRS has notified me that I am no longer subject to backup withholding; and</li>
      <li>I am a U.S. citizen or other U.S. person; and</li>
      <li>The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct.</li>
    </ol>`,
    r.backup_withholding ? p('<b>I have been notified by the IRS that I am currently subject to backup withholding</b> (item 2 is crossed out).') : '',
    p('The Internal Revenue Service does not require your consent to any provision of this document other than the certifications required to avoid backup withholding.'),
  ].join('');
}

function contractor_agreement({ company: c, terms: t, rep: r }) {
  return [
    parties(c, r),
    h('1. What a City Lead does'),
    p(`You find and visit established businesses and introduce them to TMI. Your goal is results: owners who buy TMI's Intelligent Company Audit or book a Fit Call. TMI delivers all audits and all later work. You do not provide TMI's services yourself.`),
    h('2. Territory'),
    p(`Your territory is ${esc(r.territory || 'the area shown in the City Lead app')}. TMI may add to or change territories and lead lists with notice in the app. A territory is where TMI focuses your leads. It is not a promise that no one else will sell there.`),
    h('3. You run your own work'),
    p(`You are an independent contractor running your own business. You decide your own days, hours, routes, and how many businesses to visit, and you use your own judgment on how to sell. There are no required hours, shifts, quotas or minimum visits. The City Lead app, lead lists, suggested daily stops, scripts, guides and training are optional resources TMI offers to help you; you may use them or not. TMI cares about the result, not how you get there, except that you must follow the law and the Sales Conduct, Data and Brand agreements. You may sell for other companies at the same time, as long as you do not sell services that directly compete with TMI's while this agreement is in effect. You may not hand TMI leads or logins to anyone else to work for you without TMI's written OK.`),
    h('4. No guaranteed income'),
    p(`You are paid only by commission, as set out in the separate Commission and Compensation Agreement. There is no salary, hourly pay, draw, advance or minimum. You could earn nothing if no sale is made.`),
    h('5. Taxes, expenses and benefits'),
    p(`You are not an employee. TMI does not withhold income tax, Social Security or Medicare, and you pay your own taxes. TMI will send you a Form 1099-NEC when the law requires it and will report it to the IRS and the Louisiana Department of Revenue as required. You pay your own normal business expenses, like your vehicle, gas, phone, data plan, meals and supplies, unless TMI agrees in writing ahead of time to cover a specific expense. You get no employee benefits: no health insurance, retirement plan, paid time off, workers' compensation or unemployment insurance through TMI. You are responsible for any licenses your own business needs and for your own auto insurance.`),
    h('6. No authority to bind TMI'),
    p(`You are not an owner, officer, employee or agent of TMI. You cannot sign contracts for TMI, make promises for TMI, change prices, offer discounts, or say you hold a title at TMI, unless TMI authorizes it in writing. You use only TMI's published prices and TMI's payment links.`),
    h('7. Customers belong to TMI'),
    p(`Every business you introduce becomes TMI's customer, not yours. Your right is to the commission described in the Commission and Compensation Agreement.`),
    h('8. Ending the agreement'),
    p(`Either side may end this agreement at any time, for any reason or no reason, by written notice (email or text is enough). When it ends: (a) TMI turns off your app access the same day; (b) all leads, notes and accounts in the app stay with TMI and may be given to other reps; (c) within 5 days you delete or return all TMI information, as the Confidentiality and Data agreements say, and return any equipment marked for return; (d) TMI keeps paying the commission you are owed, including lifetime commission on your Credited Clients, as the Commission and Compensation Agreement says.`),
    h('9. Responsibility'),
    p(`Each side is responsible for its own acts. You will cover TMI for claims caused by your own illegal acts, false statements, or careless driving or conduct while doing this work.`),
    h('10. General'),
    p(`Louisiana law governs this agreement. Any dispute goes to the courts of ${esc(t.venue_parish)} Parish, Louisiana. This agreement and the other documents in the City Lead onboarding packet are the whole agreement on this subject. Changes must be in writing. If one part is unenforceable, the rest still applies. Electronic signatures count the same as handwritten ones.`),
  ].join('');
}

function compensation({ company: c, terms: t, rates, rep: r }) {
  const same = Number(rates.audit) === Number(rates.upsell);
  const rate = same ? `<b>${pct(rates.audit)}</b> of all Collected Revenue` : `<b>${pct(rates.audit)}</b> of Collected Revenue from the Intelligent Company Audit and <b>${pct(rates.upsell)}</b> of all other Collected Revenue`;
  return [
    parties(c, r),
    p('This agreement is the commission plan. It is kept separate so TMI can update the plan without rewriting the Independent Contractor Agreement.'),
    h('1. Your commission'),
    p(`TMI pays you ${rate} TMI receives from each of your Credited Clients, for as long as that client pays TMI. That is lifetime commission. It covers the audit, implementation and build fees, monthly or recurring fees, renewals, and anything else that client buys from TMI later.`),
    h('2. Words used here'),
    ul([
      `<b>Credited Client</b>: a business you introduced to TMI or sold. A business is credited to you when (a) it pays through your payment link or QR code, (b) it books a call or audit through you in the app, or (c) you logged a real conversation with its owner or a decision maker in the app within the ${esc(t.attribution_days)} days before it first paid TMI.`,
      `<b>Collected Revenue</b>: money TMI actually receives and keeps from a Credited Client, not counting sales tax, refunds, chargebacks, or third-party costs TMI passes through to the client at cost (for example, software licenses or hardware bought for the client).`,
      `<b>Sale</b>: a Credited Client's payment that TMI receives and that clears.`,
    ]),
    h('3. When it is earned and paid'),
    p(`Commission is earned only when the client's payment clears. TMI pays by the ${esc(t.pay_day)}th of each month for payments that cleared in the month before. Your statement is in the City Lead app. Balances under $25 roll into the next month. Questions about a statement must be raised within 60 days.`),
    h('4. Refunds, failed payments, cancellations and chargebacks'),
    ul([
      'No commission is earned on a payment that fails, bounces or never clears.',
      'If TMI refunds a client, a payment is charged back, or a client cancels and gets money back (including right after signing up), the matching commission is reversed and subtracted from your future commission.',
      'If a client stops paying, commission stops with it and starts again if the client pays again.',
      'If there is no future commission to subtract from within 90 days, TMI will not ask you to pay it back unless the sale involved fraud or a false statement by you.',
    ]),
    h('5. Who gets credit'),
    ul([
      'If a client paid through a rep\'s payment link or booked through a rep in the app, that rep gets the credit.',
      `Otherwise, credit goes to the rep who first logged a real conversation with the owner or decision maker in the app within the ${esc(t.attribution_days)} days before the first payment.`,
      'If two reps both played a real part, TMI may split the credit. TMI decides in good faith using the app records, and its decision is final.',
    ]),
    h('6. House accounts'),
    p('No commission is paid on house accounts unless TMI agrees in writing. A house account is a business that, before your first logged contact, (a) was already a TMI client, (b) was already in active talks with TMI (contact in the 90 days before), or (c) came to TMI on its own through TMI\'s website, ads, events, referrals or the founders\' own network without you.'),
    h('7. Bonuses'),
    p('There are no bonuses unless TMI announces one in writing (email or the app) with its rules and dates. A bonus applies only as written.'),
    h('8. After the agreement ends'),
    p(`Lifetime commission on your Credited Clients keeps being paid after this agreement ends, on the same schedule, as long as TMI has your current W-9 and payment details. You lose future commission only if you committed fraud, or materially broke the Confidentiality, NDA and Work Product Agreement or the Data and Portal Use Agreement. Leads you never turned into Credited Clients do not earn commission after the end date.`),
    h('9. Changes to this plan'),
    p('TMI may change this plan with 14 days\' written notice. A change applies only to clients first credited after the change. Your existing Credited Clients keep the rate they had.'),
    h('10. Not wages'),
    p('Commission is payment to an independent business for results. It is not wages, and no taxes are withheld.'),
  ].join('');
}

function nda_ip({ company: c, rep: r }) {
  return [
    parties(c, r),
    h('1. What is confidential'),
    p('"Confidential Information" means anything you get from TMI or learn through this work that is not public, including leads and lead lists, business and contact details, notes and history in the City Lead app, customer information, audit results, prices and offers that are not published, sales processes, playbooks, scripts, software, systems and plans.'),
    h('2. What you agree to'),
    ul([
      'Use Confidential Information only to do work for TMI.',
      'Never take, copy, export, download, screenshot in bulk, forward, sell or share it, and never use it for yourself or another company, during or after this work.',
      'Keep it private and secure, and tell TMI right away if it may have been seen by someone who should not see it.',
    ]),
    h('3. Work product belongs to TMI'),
    p('Everything you create for TMI as part of this work belongs to TMI, including account notes, lead records, voice notes, photos, videos, sales materials, content, and business data. You assign to TMI all rights you have in it. You keep ownership of things you made before this work or outside it, and you will not put them into TMI materials without telling TMI.'),
    h('4. When the work ends'),
    p('When this work ends, or when TMI asks, you stop using and delete or return all Confidential Information within 5 days, including anything saved on your phone, computer, email, cloud storage or social accounts, and you confirm in writing that you did.'),
    h('5. How long this lasts'),
    p('These duties last during the work and for 3 years after it ends. Duties about trade secrets and customer data last as long as the law protects them. Information that becomes public through no fault of yours is not covered.'),
    h('6. If this is broken'),
    p('Leads and customer information are the core of TMI\'s business. TMI may ask a court to stop a breach right away, in addition to its other rights. Louisiana law governs this agreement.'),
  ].join('');
}

function data_portal({ company: c, rep: r }) {
  return [
    p(`Rules for using TMI's City Lead app (the rep portal), customer data, leads and records, agreed by <b>${esc(r.legal_name)}</b> with ${co(c)}.`),
    h('Your login'),
    ul(['Your login is for you only. Never share it, lend your phone with the app open, or let anyone else work your account.', 'Use a phone lock (PIN, face or fingerprint) and keep your phone\'s software up to date.', 'If your phone is lost or stolen, or you think someone used your login, tell TMI within 24 hours so TMI can lock the account.']),
    h('Leads, customer data and records'),
    ul(['Use leads and customer data only to work for TMI.', 'No exporting, downloading, copying lists, bulk screenshots, forwarding records, or pasting them into other apps, spreadsheets or AI tools, unless TMI says yes in writing.', 'Keep app records true. Log visits, calls, texts and outcomes honestly, and never enter fake visits, fake leads, fake accounts or fake sales.', 'Do not delete records to hide activity.']),
    h('Monitoring'),
    p('TMI logs activity in the app (for example sign-ins, check-in locations you choose to share, and changes to records) to keep data safe and to credit sales. The app only uses your location when you tap to check in or open the map.'),
    h('When access ends'),
    p('TMI may pause or end your access at any time. When this work ends, your access is turned off the same day, and you delete any TMI data you still have within 5 days.'),
  ].join('');
}

function conduct({ company: c, rep: r }) {
  const rules = [
    'Lie about TMI, its services or results, or promise anything TMI does not offer.',
    'Change, discount or make up prices, or say the audit fee credits toward anything. The only free thing is the Fit Call.',
    'Promise results, savings, percentages or dollar figures, or quote build or implementation prices.',
    'Say I am an owner, officer, partner or employee of TMI.',
    'Take cash, checks or card numbers myself. Payment only goes through TMI\'s payment link or QR code.',
    'Create fake accounts, or enter fake visits, leads or sales.',
    'Harass anyone, ignore a "no" or a request to leave, or come back after being asked not to.',
    'Make calls or send texts the law does not allow, ignore a STOP reply, or contact anyone who asked not to be contacted.',
    'Invent clients, stories or reviews.',
    'Use customer or lead information for myself or anyone else.',
  ];
  return p(`As a City Lead for ${co(c)}, I, <b>${esc(r.legal_name)}</b>, agree that I will not:`) + '<ol>' + rules.map((x) => `<li>${esc(x)}</li>`).join('') + '</ol>' +
    p('Breaking these rules can end the agreement right away and can cost future commission on any sale involving fraud.');
}

function brand_media({ company: c, rep: r }) {
  return [
    p(`Agreed by <b>${esc(r.legal_name)}</b> with ${co(c)}.`),
    h('1. Brand use'),
    ul(['Use the TMI Tech AI name and logo only in materials TMI gives you or approves in writing. Do not change the logo or make your own versions.', 'Only make claims TMI publishes. Describe yourself as an independent City Lead working with TMI Tech AI.']),
    h('2. Social media'),
    ul(['You may share TMI\'s public posts. Anything else you post about TMI or its customers needs TMI\'s OK first.', 'Never post customer names, logos, photos, locations, numbers or private details without written permission from that customer and TMI.', 'Do not create pages, accounts, groups or handles using the TMI name. Any TMI or City Lead page, account or content made for this work belongs to TMI, and you will hand over logins when asked.']),
    h('3. Filming people and businesses'),
    p('Only film or photograph a person or business with their clear permission, and never film customer screens, documents or private areas.'),
    h('4. Likeness release'),
    p(`You allow TMI to use your name, image, voice, video and statements you give TMI, in TMI's ads, social media, website, training and recruiting, in any media, without extra pay. TMI may keep using material it has already published. You may ask in writing at any time that TMI stop making new uses, and TMI will stop new uses within 30 days. TMI will not use your likeness to say you endorse something you did not.`),
  ].join('');
}

function driver({ rep: r }) {
  return [
    p(`Because City Lead work involves driving, <b>${esc(r.legal_name)}</b> confirms:`),
    kv([
      ['Driver\'s license state', esc(r.dl_state || '')],
      ['Driver\'s license expires', esc(r.dl_expires || '')],
      ['Driver\'s license photo', r.dl_on_file ? 'On file (stored encrypted)' : 'Not provided'],
      ['Auto insurance company', esc(r.ins_carrier || '')],
      ['Insurance policy expires', esc(r.ins_expires || '')],
      ['Insurance card photo', r.ins_on_file ? 'On file (stored encrypted)' : 'Not provided'],
    ]),
    ul(['I have a valid driver\'s license and auto insurance that meets at least Louisiana\'s required minimums for any vehicle I drive for this work.', 'I will tell TMI within 5 days if my license is suspended or expires or my insurance lapses, and I will not drive for this work until it is fixed.', 'I am responsible for my own vehicle, driving, tickets and accidents. TMI does not provide a vehicle or insurance.', 'I will not text or use the app while driving.']),
    p('TMI only keeps these documents to confirm the above and deletes them after the relationship ends and any records duty has passed.'),
  ].join('');
}

function payment({ company: c, terms: t, rep: r, payout }) {
  let how;
  if (r.payout_method === 'direct_deposit') how = kv([['Method', 'Direct deposit (ACH)'], ['Bank', esc(r.bank_name || '')], ['Account type', esc(r.account_type || 'checking')], ['Routing number', esc(payout && payout.routing ? payout.routing : '')], ['Account number', 'Ending in ' + esc(r.account_last4 || '')]]);
  else if (r.payout_method === 'zelle') how = kv([['Method', 'Zelle'], ['Zelle phone or email', esc(r.zelle_handle || '')]]);
  else how = kv([['Method', 'Paper check'], ['Mailed to', addr(r)]]);
  return [
    p(`I, <b>${esc(r.legal_name)}</b>, ask ${co(c)} to pay my commissions this way:`),
    how,
    r.payout_method === 'direct_deposit' ? p(`I authorize TMI and its bank to make ACH credit entries to the account above, and, only to fix a deposit made in error, a debit entry for that same amount. This authorization stays in effect until I change it in the City Lead app or cancel it in writing, giving TMI reasonable time to act.`) : '',
    p(`Commissions are paid by the ${esc(t.pay_day)}th of each month for client payments that cleared the month before. Payments sent to the details on file before I update them count as paid. Account numbers are stored encrypted.`),
  ].join('');
}

function equipment({ rep: r, equipment: items }) {
  const list = (items || []).length
    ? '<table class="kv"><tr><th>Item</th><th>Qty</th><th>Date received</th><th>Must return</th></tr>' + items.map((x) => `<tr><td>${esc(x.item)}</td><td>${esc(x.qty)}</td><td>${esc(x.date)}</td><td>${x.return_required ? 'Yes' : 'No'}</td></tr>`).join('') + '</table>'
    : p('No equipment or materials have been issued.');
  return p(`<b>${esc(r.legal_name)}</b> received the following from TMI:`) + list +
    p('I will keep these items in good shape, use them only for TMI work, and return every item marked "Must return" within 10 days after this work ends or when TMI asks.');
}

function final_ack({ company: c, rep: r, signedList }) {
  const items = ['the Commission and Compensation Agreement (10% lifetime commission on Credited Clients, how sales are credited, refunds and house accounts)', 'the data and portal rules', 'the Sales Conduct Agreement', 'the brand, social media and likeness rules', 'my territory and that it can change', 'that customers belong to TMI', 'what happens when this work ends: app access off, leads stay with TMI, return or delete TMI information, and how commission keeps being paid'];
  return [
    p(`I, <b>${esc(r.legal_name)}</b>, confirm that I received, read and understand each document in my City Lead onboarding packet with ${co(c)}:`),
    (signedList && signedList.length) ? '<table class="kv"><tr><th>Document</th><th>Signed</th></tr>' + signedList.map((x) => `<tr><td>${esc(x.title)}</td><td>${esc(x.at)}</td></tr>`).join('') + '</table>' : '',
    p('In particular I understand:'), ul(items.map(esc)),
    p('I had the chance to ask questions and to have someone review these documents. I am signing as an independent contractor.'),
  ].join('');
}

const RENDER = { info_sheet, w9, contractor_agreement, compensation, nda_ip, data_portal, conduct, brand_media, driver, payment, equipment, final_ack };
function render(docId, ctx) { const f = RENDER[docId]; return f ? f(ctx) : ''; }

const STYLE = `body{font-family:Georgia,'Times New Roman',serif;color:#111;max-width:760px;margin:32px auto;padding:0 20px;line-height:1.55;font-size:15px}
h1{font-family:Helvetica,Arial,sans-serif;font-size:21px;margin:0 0 4px}h3{font-family:Helvetica,Arial,sans-serif;font-size:15px;margin:20px 0 4px}
.meta{font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#555;margin-bottom:18px}.kv{border-collapse:collapse;width:100%;margin:8px 0}.kv th,.kv td{border:1px solid #ccc;padding:7px 9px;text-align:left;vertical-align:top;font-size:14px}.kv th{width:42%;background:#f6f6f6;font-weight:600}
li{margin:3px 0}.sig{margin-top:28px;border-top:2px solid #111;padding-top:12px;font-family:Helvetica,Arial,sans-serif;font-size:13px}.sig img{max-height:70px;display:block;margin:6px 0}
@media print{body{margin:0}}`;

function section(doc, body, sig, company) {
  return `<h1>${esc(doc.n)} ${esc(doc.title)}</h1><div class="meta">${esc(company.legal_name)} (TMI Tech AI) · Version ${esc(doc.version)}</div>
${body}
<div class="sig"><b>Signed by the City Lead</b>${sig.png ? `<img src="${esc(sig.png)}" alt="signature">` : ''}<div>${esc(sig.name)}</div><div>${esc(sig.at)} · electronically signed${sig.ip ? ' · IP ' + esc(sig.ip) : ''}</div><div style="color:#555;margin-top:4px">The City Lead agreed to use electronic records and signatures for this document.</div></div>`;
}

// The signed record: document text plus the signature block, as one page.
function page(doc, body, sig, company) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.n + ' ' + doc.title)}</title><style>${STYLE}</style></head><body>
${section(doc, body, sig, company)}
<!--COUNTERSIGN-->
</body></html>`;
}

function countersignBlock(cs) {
  return `<div class="sig"><b>Signed for ${esc(cs.company)}</b><div>${esc(cs.name)}${cs.title ? ', ' + esc(cs.title) : ''}</div><div>${esc(cs.at)} · electronically signed</div></div>`;
}

module.exports = { DOCS, render, page, section, countersignBlock, STYLE, TAX, PAY };
