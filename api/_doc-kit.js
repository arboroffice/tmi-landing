// TMI Company Kit - document manifest (server-only, no secrets).
//
// Machine-readable version of the kit's DOCUMENT-MAP.md + FILL-INS.md. It
// encodes every template, the fields that must be filled, the trigger that
// decides whether a packet needs it, who drafts vs who sends, and the hard
// gate rules. NO legal body text and NO secret values live here - the actual
// PDF templates live in private Firebase Storage (see scripts/seed-doc-kit.js),
// and never-store values (EIN, bank numbers, ROI) are never persisted at all.
//
// Source of truth: TMI-COMPANY-KIT/04-agents/DOCUMENT-MAP.md and
// TMI-COMPANY-KIT/03-vendor/FILL-INS.md. Keep this file in sync with the kit.

// Values an agent must NEVER invent or store. If a document needs one, the
// packet flags it for Mia / counsel to fill by hand before any send.
const NEVER_STORE = [
  'ein',
  'bank_routing',
  'bank_account',
  'bank_name',
  'account_holder',
  'tmi_legal_entity',      // exact Secretary of State legal name
  'client_legal_name',     // as the client's SOS has it
  'insurance_policy_number',
  'insurance_limits',
  'roi',
  'client_results',
  'certifications',
];

// The eight hard gates. Every prepared packet carries these; nothing leaves
// TMI without Mia's explicit yes (the Approve & Send click).
const GATES = [
  'send external communication',
  'publish content',
  'spend money',
  'delete records',
  'change production systems',
  'grant access',
  'make binding commitments',
  'export sensitive client data',
];

// Trigger questions that decide which documents a packet needs. The admin
// packet builder asks these; answers drive `appliesWhen`.
const TRIGGERS = [
  { key: 'is_sow',          label: 'Is this a paid SOW (Design/Build/Integrate)?', help: 'Assess is free. A paid SOW pulls in the Service Agreement + exhibits and invoicing.' },
  { key: 'post_audit',      label: 'Has the Intelligent Company Audit happened?',  help: 'Audit notes + thank-you + proposal live here.' },
  { key: 'on_site',         label: 'Will there be an on-site day?',                help: 'Pulls in site intake + access request before the first on-site day.' },
  { key: 'controlled_data', label: 'Any CUI / ITAR / EAR controlled data?',        help: 'STOP. Requires the CUI/ITAR addendum, signed before any access.' },
  { key: 'union_site',      label: 'Is the site a union floor?',                   help: 'Requires the union site addendum.' },
  { key: 'brand_in_fee',    label: 'Is brand / attention / footage in the fee (Exhibit E)?', help: 'Requires per-person camera releases.' },
  { key: 'tmi_hosts',       label: 'Does TMI host any piece of the system?',       help: 'Requires the hosting & data addendum. Not a substitute for a full DPA.' },
  { key: 'subcontractor',   label: 'Is a subcontractor used?',                     help: 'Requires the subcontractor agreement. IP flows through TMI to the client.' },
  { key: 'scope_change',    label: 'Is scope moving after signing?',               help: 'New site, new brand, new integration, extra days: requires a signed change order before work starts.' },
  { key: 'vendor_setup',    label: 'Setting up payment / insurance with the client as a vendor?', help: 'ACH instructions + insurance request.' },
];

// Every document. `fields` are fill-ins; `never` marks fields an agent must
// not invent (flagged for Mia/counsel). `appliesWhen` is an array of trigger
// keys - the doc is included if ANY listed trigger is true (or always).
const DOCUMENTS = [
  {
    id: 'service-agreement', file: '01-SERVICE-AGREEMENT.pdf', category: 'client', order: 1,
    title: 'Service Agreement', purpose: 'The master agreement (v3.0 counsel draft). 3.1 names the packet.',
    drafts: 'Operations fills, Counsel reads', sends: 'Counsel then Mia', gate: 'binding commitment',
    appliesWhen: ['is_sow'],
    fields: ['tmi_legal_entity', 'client_legal_name', 'venue_parish', 'section2_amounts', 'exhibit_b1_sentence', 'operating_system_checkboxes', 'agreement_number', 'date', 'delivery_guarantee_311'],
    never: ['tmi_legal_entity', 'client_legal_name'],
    relatedSection: 'Whole agreement. Exhibits A-E.',
    counselReads: ['3.8 IP', '3.12 liability', '3.19 Louisiana venue', 'Exhibit D floor'],
  },
  {
    id: 'proposal', file: '02-PROPOSAL.pdf', category: 'client', order: 2,
    title: 'Proposal', purpose: 'One-page proposal after a fit. Valid 21 days. Section 02 blank until scoped.',
    drafts: 'Growth', sends: 'Mia', gate: 'binding commitment',
    appliesWhen: ['post_audit'],
    fields: ['client_name', 'owner', 'date', 'proposal_number', 'agreement_number', 'exhibit_b1_sentence', 'baseline_metric', 'deposit', 'total', 'valid_until'],
    never: ['roi', 'client_results'],
    relatedSection: 'Exhibit B. Section 02 blank until scoped.',
  },
  {
    id: 'invoice', file: '03-INVOICE.pdf', category: 'client', order: 3,
    title: 'Invoice', purpose: 'Billed on the milestones in the agreement. 3.8 ownership transfers on full payment.',
    drafts: 'Operations', sends: 'Mia', gate: 'spend money / send external',
    appliesWhen: ['is_sow'],
    fields: ['invoice_number', 'bill_to', 'line_items', 'deposit_vs_balance', 'due_terms', 'ach_pointer', 'amount'],
    never: ['bank_routing', 'bank_account'],
    relatedSection: 'Section 02 (payment). 3.8.',
  },
  {
    id: 'audit-notes', file: '04-AUDIT-NOTES.pdf', category: 'client', order: 4,
    title: 'Audit Notes', purpose: 'Same day as the audit. Nine fields on page 1; page 2 email brackets derive from them.',
    drafts: 'Growth', sends: 'Internal only (thank-you is separate)', gate: 'internal',
    appliesWhen: ['post_audit'],
    fields: ['date', 'company', 'owner', 'largest_constraint', 'business_consequence', 'highest_value_opportunity', 'what_stays', 'what_changes', 'where_tmi_starts'],
    never: ['roi'],
    relatedSection: 'Assess. Not the SOW.',
  },
  {
    id: 'change-order', file: '05-CHANGE-ORDER.pdf', category: 'client', order: 5,
    title: 'Change Order', purpose: 'Scope moves. Signed before work starts.',
    drafts: 'Operations + Growth', sends: 'Mia', gate: 'binding commitment',
    appliesWhen: ['scope_change'],
    fields: ['change_order_number', 'master_agreement_number', 'kind', 'added_fee', 'start_date'],
    never: [],
    relatedSection: '3.7.',
  },
  {
    id: 'site-intake', file: '06-SITE-INTAKE.pdf', category: 'client', order: 6,
    title: 'Site Intake', purpose: 'Before the first on-site day. If union is yes, also use the union addendum.',
    drafts: 'Operations', sends: 'Mia', gate: 'send external',
    appliesWhen: ['on_site'],
    fields: ['ppe', 'orientation', 'escort', 'no_go_zones', 'phones_on_floor', 'photography', 'union_yes_no', 'production_windows', 'emergency_contact', 'safety_officer'],
    never: [],
    relatedSection: '3.3 Client side. D.1 site rules.',
  },
  {
    id: 'access-request', file: '07-ACCESS-REQUEST.pdf', category: 'client', order: 7,
    title: 'Access Request', purpose: 'Before the first on-site day. No standing production passwords. CUI/ITAR flag STOPS and uses addendum 09.',
    drafts: 'Operations', sends: 'Mia', gate: 'grant access',
    appliesWhen: ['on_site'],
    fields: ['named_people', 'named_systems', 'duration', 'revoke_method', 'client_it_counterpart', 'controlled_data_flag'],
    never: [],
    relatedSection: '3.3, 3.9, D.5.',
  },
  {
    id: 'camera-release', file: '08-CAMERA-RELEASE.pdf', category: 'client', order: 8,
    title: 'Camera Release', purpose: 'Per person. Only if Exhibit E / brand is in the fee.',
    drafts: 'Brand + Content', sends: 'Mia', gate: 'send external',
    appliesWhen: ['brand_in_fee'],
    fields: ['full_legal_name', 'role', 'site', 'agree_or_not'],
    never: [],
    relatedSection: 'Exhibit E. B.4.',
  },
  {
    id: 'cui-itar-addendum', file: '09-CUI-ITAR-ADDENDUM.pdf', category: 'addenda', order: 9,
    title: 'CUI / ITAR Addendum', purpose: 'Signed before any access to controlled data.',
    drafts: 'Operations + Counsel', sends: 'Counsel then Mia', gate: 'binding commitment',
    appliesWhen: ['controlled_data'],
    fields: ['regime', 'systems', 'rooms'],
    never: [],
    relatedSection: '3.9 controlled data.',
  },
  {
    id: 'union-site-addendum', file: '10-UNION-SITE-ADDENDUM.pdf', category: 'addenda', order: 10,
    title: 'Union Site Addendum', purpose: 'When the site is a union floor.',
    drafts: 'Operations + Counsel', sends: 'Counsel then Mia', gate: 'binding commitment',
    appliesWhen: ['union_site'],
    fields: ['site_address', 'cba_or_local'],
    never: [],
    relatedSection: 'Union floor.',
  },
  {
    id: 'hosting-and-data', file: '11-HOSTING-AND-DATA.pdf', category: 'addenda', order: 11,
    title: 'Hosting & Data', purpose: 'Only if Exhibit B says TMI hosts a piece. Not a substitute for a full DPA.',
    drafts: 'Operations + Counsel', sends: 'Counsel then Mia', gate: 'binding commitment',
    appliesWhen: ['tmi_hosts'],
    fields: ['named_system', 'term_start', 'term_end', 'hosting_fee'],
    never: [],
    relatedSection: 'Hosting piece of Exhibit B.',
  },
  {
    id: 'subcontractor-agreement', file: '12-SUBCONTRACTOR-AGREEMENT.pdf', category: 'addenda', order: 12,
    title: 'Subcontractor Agreement', purpose: 'IP flows through TMI to the client per 3.8.',
    drafts: 'Operations + Counsel', sends: 'Counsel then Mia', gate: 'binding commitment',
    appliesWhen: ['subcontractor'],
    fields: ['sub_legal_name', 'named_slice', 'pay_and_terms', 'insurance_limits'],
    never: ['insurance_limits'],
    relatedSection: '3.8.',
  },
  {
    id: 'ach-instructions', file: '13-ACH-INSTRUCTIONS.pdf', category: 'vendor', order: 13,
    title: 'ACH Instructions', purpose: 'Remit to TMI legal entity. Invoice number in memo. Bank numbers only pasted by Mia at send time.',
    drafts: 'Operations', sends: 'Mia', gate: 'export sensitive data',
    appliesWhen: ['vendor_setup'],
    fields: ['bank_name', 'bank_routing', 'bank_account', 'account_holder', 'card_fee_note'],
    never: ['bank_name', 'bank_routing', 'bank_account', 'account_holder'],
    relatedSection: 'Payment. Section 02.',
  },
  {
    id: 'insurance-request', file: '14-INSURANCE-REQUEST.pdf', category: 'vendor', order: 14,
    title: 'Insurance Request', purpose: 'Limits and policy numbers by counsel. Client keeps property, WC, auto, cyber.',
    drafts: 'Operations + Counsel', sends: 'Mia', gate: 'send external',
    appliesWhen: ['vendor_setup'],
    fields: ['insurance_limits', 'insurance_policy_number', 'additional_insured', 'certificate_holder'],
    never: ['insurance_limits', 'insurance_policy_number'],
    relatedSection: 'Insurance.',
  },
];

function documentById(id) { return DOCUMENTS.find(d => d.id === id) || null; }

// Given the trigger answers, return the documents a packet needs, in order.
function documentsForTriggers(answers = {}) {
  return DOCUMENTS.filter(d => d.appliesWhen.some(k => !!answers[k])).sort((a, b) => a.order - b.order);
}

// Fields on a document that must never be auto-filled (flag for Mia/counsel).
function protectedFields(doc) {
  const set = new Set([...(doc.never || []), ...NEVER_STORE]);
  return (doc.fields || []).filter(f => set.has(f));
}

module.exports = {
  NEVER_STORE, GATES, TRIGGERS, DOCUMENTS,
  documentById, documentsForTriggers, protectedFields,
  version: '2026-09-01',
};
