/* TMI Admin — shared auth, API, and UI utilities */

const TMIAdmin = (() => {
  const TOKEN_KEY = 'tmi_admin_tk';

  const NICHES = {
    physical: ['HVAC','Construction','Plumbing','Roofing','Electrician','Landscaping',
      'Manufacturing','Mining','Oil & Gas','Heavy Equipment','Painting','Concrete',
      'Pipeline','Welding','Agriculture','Utilities','Home Service','Machine Shops','Fleet'],
    online: ['Coaching','Course Creators','Content Creators','Info Products','E-Commerce'],
    fotf: ['General','Enterprise','Partner']
  };

  const SOURCES = ['Website','Referral','LinkedIn','Instagram','Cold Outreach','Event','Founders of the Future Letters','Founders of the Future','Other'];

  // ── Icons ─────────────────────────────────────────────────────────────────
  const I = {
    dashboard:    `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
    pipeline:     `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><rect x="3" y="3" width="4" height="18" rx="1"/><rect x="10" y="3" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="10" rx="1"/></svg>`,
    audits:       `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4" stroke-linecap="round"/></svg>`,
    clientHealth: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    partners:     `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11A2.98 2.98 0 0 0 18 8a3 3 0 1 0-3-3c0 .24.04.47.09.7L8.04 9.81A3 3 0 0 0 6 9a3 3 0 0 0 0 6c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65a3 3 0 1 0 3-3z"/></svg>`,
    activity:     `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    bookings:     `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke-linecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke-linecap="round"/><circle cx="12" cy="15" r="1.5" fill="currentColor"/></svg>`,
    meetings:     `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke-linecap="round"/><line x1="12" y1="19" x2="12" y2="23" stroke-linecap="round"/></svg>`,
    team:         `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="12" cy="8" r="4"/><path stroke-linecap="round" d="M6 20v-1a6 6 0 0 1 12 0v1"/><circle cx="20" cy="8" r="3"/><path stroke-linecap="round" d="M23 20v-1a4 4 0 0 0-3-3.87"/></svg>`,
    glassBox:     `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" stroke-linecap="round"/></svg>`,
    stageLetters: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6" stroke-linecap="round"/></svg>`,
    stories:      `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h8M8 14h5" stroke-linecap="round"/></svg>`,
    revenue:   `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" stroke-linecap="round" stroke-linejoin="round"/><polyline points="16 7 22 7 22 13" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    apps:      `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" stroke-linecap="round"/></svg>`,
    followup:  `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14" stroke-linecap="round"/></svg>`,
    leads:     `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path stroke-linecap="round" d="M3 6h18M7 12h10M11 18h2"/></svg>`,
    proposals: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13" stroke-linecap="round"/><line x1="16" y1="17" x2="8" y2="17" stroke-linecap="round"/></svg>`,
    clients:   `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><rect x="2" y="7" width="20" height="14" rx="2"/><path stroke-linecap="round" d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>`,
    projects:  `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="8" width="5" height="13" rx="1"/><rect x="17" y="5" width="5" height="16" rx="1"/></svg>`,
    invoices:  `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4" stroke-linecap="round"/><circle cx="17" cy="17" r="3" fill="none"/><path d="M17 16v1l.75.5" stroke-linecap="round"/></svg>`,
    onboarding:`<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke-linecap="round"/><polyline points="22 4 12 14.01 9 11.01" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    contacts:  `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="9" cy="7" r="4"/><path stroke-linecap="round" d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.87"/></svg>`,
    email:     `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><rect x="2" y="4" width="20" height="16" rx="2"/><path stroke-linecap="round" d="m2 7 10 7 10-7"/></svg>`,
    sms:       `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    content:   `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
    ideas:     `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M6.343 6.343a8 8 0 1 0 11.314 11.314A8 8 0 0 0 6.343 6.343z" opacity=".3"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2" stroke-linecap="round"/></svg>`,
    settings:  `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    logout:    `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7" width="15" height="15"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke-linecap="round"/><polyline points="16 17 21 12 16 7" stroke-linecap="round" stroke-linejoin="round"/><line x1="21" y1="12" x2="9" y2="12" stroke-linecap="round"/></svg>`,
    fotf:      `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    newsletter:`<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13" stroke-linecap="round"/><line x1="16" y1="17" x2="8" y2="17" stroke-linecap="round"/><line x1="10" y1="9" x2="8" y2="9" stroke-linecap="round"/></svg>`,
    community: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path stroke-linecap="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path stroke-linecap="round" d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    rituals:   `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke-linecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke-linecap="round"/></svg>`,
    identity:  `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="12" cy="8" r="6"/><path stroke-linecap="round" d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>`,
    library:   `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
    growth_fotf:`<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path stroke-linecap="round" d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14" stroke-linecap="round"/><line x1="23" y1="11" x2="17" y2="11" stroke-linecap="round"/></svg>`,
    analytics:  `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><line x1="18" y1="20" x2="18" y2="10" stroke-linecap="round"/><line x1="12" y1="20" x2="12" y2="4" stroke-linecap="round"/><line x1="6" y1="20" x2="6" y2="14" stroke-linecap="round"/></svg>`,
    cityPin:    `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
    cityMap:    `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18" stroke-linecap="round"/><line x1="16" y1="6" x2="16" y2="22" stroke-linecap="round"/></svg>`,
    cityMoney:  `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><rect x="1" y="4" width="22" height="16" rx="2"/><circle cx="12" cy="12" r="4"/><path d="M6 12h.01M18 12h.01" stroke-linecap="round" stroke-width="2.5"/></svg>`,
    command:    `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke-linecap="round"/></svg>`,
    level10:    `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3" stroke-linecap="round"/></svg>`,
    recruiting: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="9" cy="8" r="4"/><path stroke-linecap="round" d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1M19 8v6M22 11h-6"/></svg>`,
    journey:    `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h6a4 4 0 0 0 0-8H10a4 4 0 0 1 0-8h6" stroke-linecap="round"/></svg>`,
    flywheel:   `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M21 12a9 9 0 1 1-3-6.7" stroke-linecap="round"/><polyline points="21 4 21 9 16 9" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    vision:     `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
    strategy:   `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><polygon points="15.5 8.5 11 11 8.5 15.5 13 13 15.5 8.5" stroke-linejoin="round"/></svg>`
  };

  function navItem(page, label, icon, badge, href) {
    const url = href !== undefined ? href : `/admin-${page}`;
    const badgeId = (typeof badge === 'string') ? badge : page;
    return `<a href="${url}" class="sb-item" data-page="${page}">${icon}${label}${badge ? `<span class="sb-badge" id="sb-badge-${badgeId}" style="display:none"></span>` : ''}</a>`;
  }

  // ── Navigation model ────────────────────────────────────────────────────
  // Single source of truth for both the desktop sidebar and the mobile "more"
  // sheet. Every surviving admin page is reachable from exactly one workspace
  // group; hub tabs link to their hub#hash destination.
  // item: { page, label, icon, href?, badge? }  (page also drives active state)
  const NAV_GROUPS = [
    { label: 'Home', items: [
      { page:'brief',     label:'Command Brief', icon:I.stageLetters },
      { page:'dashboard', label:'Dashboard',     icon:I.dashboard },
      { page:'worklist',  label:'Today',         icon:I.level10 },
      { page:'command',   label:'Command Center', icon:I.command },
      { page:'flywheel',  label:'Flywheel',      icon:I.flywheel },
    ]},
    { label: 'Sales', items: [
      { page:'pipeline',  label:'Pipeline',      icon:I.pipeline,  href:'/admin-sales#pipeline' },
      { page:'audits',    label:'Audits',        icon:I.audits,    href:'/admin-sales#audits' },
      { page:'bookings',  label:'Bookings',      icon:I.bookings,  href:'/admin-sales#bookings' },
      { page:'leads',     label:'Leads',         icon:I.leads },
      { page:'proposals', label:'Proposals',     icon:I.proposals },
      { page:'cockpit',   label:'Sales Cockpit', icon:I.command },
      { page:'meetings',  label:'Meetings',      icon:I.meetings },
      { page:'campaign',  label:'Campaigns',     icon:I.growth_fotf },
    ]},
    { label: 'Outbound', items: [
      { page:'outbound',   label:'Outbound',        icon:I.journey },
      { page:'prospect',   label:'Prospecting',     icon:I.recruiting },
      { page:'signals',    label:'Intent Signals',  icon:I.vision },
      { page:'visitors',   label:'Site Visitors',   icon:I.analytics },
      { page:'call-tasks', label:'Call Queue',      icon:I.followup },
      { page:'lifecycle',  label:'Lifecycle Agents', icon:I.strategy },
    ]},
    { label: 'Inbox', items: [
      { page:'applications', label:'Applications', icon:I.apps,     href:'/admin-inbox#apps', badge:'inbox' },
      { page:'followups',    label:'Follow-ups',   icon:I.followup, href:'/admin-inbox#followups' },
      { page:'assessment',   label:'Assessments',  icon:I.audits },
    ]},
    { label: 'Clients', items: [
      { page:'clients',        label:'Clients',        icon:I.clients,     href:'/admin-clients' },
      { page:'client-health',  label:'Client Health',  icon:I.clientHealth, href:'/admin-clients#health' },
      { page:'retention-plan', label:'Retention Plan', icon:I.strategy },
      { page:'account',        label:'Account',        icon:I.identity,    href:'/admin-account' },
    ]},
    { label: 'Delivery', items: [
      { page:'projects',   label:'Projects',   icon:I.projects,  href:'/admin-work#projects' },
      { page:'invoices',   label:'Invoices',   icon:I.invoices,  href:'/admin-work#invoices' },
      { page:'os-clients', label:'Client OS',  icon:I.glassBox,  href:'/admin-os-clients' },
      { page:'payments',   label:'Payments',   icon:I.cityMoney },
      { page:'onboarding', label:'Onboarding', icon:I.onboarding },
      { page:'university', label:'University', icon:I.library },
    ]},
    { label: 'People', items: [
      { page:'contacts', label:'Contacts', icon:I.contacts, href:'/admin-people#contacts' },
      { page:'partners', label:'Partners', icon:I.partners, href:'/admin-people#partners' },
      { page:'activity', label:'Activity', icon:I.activity, href:'/admin-people#activity' },
    ]},
    { label: 'Comms', items: [
      { page:'email',         label:'Email',         icon:I.email, href:'/admin-comms#email' },
      { page:'sms',           label:'SMS',           icon:I.sms,   href:'/admin-comms#sms' },
      { page:'email-compose', label:'Compose Email', icon:I.content, href:'/admin-email-compose' },
    ]},
    { label: 'Content', items: [
      { page:'content',          label:'Letters',     icon:I.stageLetters, href:'/admin-content-hub#articles' },
      { page:'content-ideas',    label:'Ideas',       icon:I.ideas,   href:'/admin-content-hub#ideas' },
      { page:'content-calendar', label:'Calendar',    icon:I.rituals, href:'/admin-content-hub#calendar' },
      { page:'content-compose',  label:'Compose',     icon:I.content },
      { page:'newsletter',       label:'Newsletter',  icon:I.newsletter },
      { page:'brand-plan',       label:'Brand Plan',  icon:I.identity },
      { page:'webinar',          label:'Weekly Class', icon:I.meetings, href:'/admin-webinar' },
    ]},
    { label: 'Intelligence', items: [
      { page:'revenue',              label:'Revenue',              icon:I.revenue,   href:'/admin-reports#revenue' },
      { page:'analytics',            label:'Analytics',            icon:I.analytics, href:'/admin-reports#analytics' },
      { page:'level10',              label:'Level 10',             icon:I.level10,   href:'/admin-reports#level10' },
      { page:'company-intelligence', label:'Company Intelligence', icon:I.vision },
      { page:'financial-model',      label:'Financial Model',      icon:I.revenue },
      { page:'seo',                  label:'SEO',                  icon:I.growth_fotf },
    ]},
    { label: 'City Leads', items: [
      { page:'city-leads', label:'City Leads',     icon:I.cityPin, href:'/admin-city-leads' },
      { page:'city-team',  label:'City Team',      icon:I.team,    href:'/admin-cityleads-team' },
      { page:'city-sop',   label:'City Lead SOP',  icon:I.stories, href:'/admin-city-sop' },
      { page:'venture',    label:'Venture Studio', icon:I.command, href:'/admin-venture' },
    ]},
    { label: 'Automation', sep:true, items: [
      { page:'agents', label:'Agent Builder', icon:I.recruiting },
      { page:'system', label:'System',        icon:I.command },
    ]},
    { label: 'Settings', items: [
      { page:'settings', label:'Settings', icon:I.settings },
    ]},
  ];

  const self = {
    niches: NICHES,
    sources: SOURCES,

    token: () => localStorage.getItem(TOKEN_KEY),

    requireAuth() {
      if (!self.token()) { window.location.replace('/admin'); }
    },

    logout() {
      localStorage.removeItem(TOKEN_KEY);
      window.location.replace('/admin');
    },

    // ── Global Search (Cmd+K / Ctrl+K) ────────────────────────────────────
    initSearch() {
      if (document.getElementById('global-search-overlay')) return;

      // Inject modal markup
      const overlay = document.createElement('div');
      overlay.id = 'global-search-overlay';
      overlay.innerHTML = `
        <div id="gs-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9998;display:none;align-items:flex-start;justify-content:center;padding-top:80px">
          <div id="gs-modal" style="background:var(--surface,#fff);border-radius:12px;width:100%;max-width:600px;box-shadow:0 24px 64px rgba(0,0,0,0.22);overflow:hidden">
            <div style="display:flex;align-items:center;padding:0 16px;border-bottom:1px solid var(--line)">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7" style="width:18px;height:18px;color:var(--muted,#86868b);flex-shrink:0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input id="gs-input" type="search" placeholder="Search leads, clients, contacts..." autocomplete="off" style="flex:1;border:none;outline:none;font-size:16px;padding:16px 12px;background:transparent;color:var(--ink,#1a1a1a);font-family:inherit"/>
              <kbd style="font-size:11px;padding:2px 7px;border-radius:4px;border:1px solid var(--line);color:var(--muted);background:var(--bg-alt,#f5f5f7);cursor:default;flex-shrink:0">Esc</kbd>
            </div>
            <div id="gs-results" style="max-height:400px;overflow-y:auto;padding:8px 0"></div>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const backdrop = document.getElementById('gs-backdrop');
      const input    = document.getElementById('gs-input');
      const results  = document.getElementById('gs-results');

      function open() {
        backdrop.style.display = 'flex';
        input.value = '';
        results.innerHTML = `<div style="padding:20px 18px;font-size:13px;color:var(--muted)">Type to search...</div>`;
        setTimeout(() => input.focus(), 50);
      }

      function close() {
        backdrop.style.display = 'none';
        input.value = '';
        results.innerHTML = '';
      }

      // Keyboard shortcuts
      document.addEventListener('keydown', e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); open(); return; }
        if (e.key === 'Escape') close();
      });

      // Click backdrop to close
      backdrop.addEventListener('mousedown', e => { if (e.target === backdrop) close(); });

      // Search logic with debounce
      let debounceTimer;
      input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const q = input.value.trim();
        if (!q) {
          results.innerHTML = `<div style="padding:20px 18px;font-size:13px;color:var(--muted)">Type to search...</div>`;
          return;
        }
        results.innerHTML = `<div style="padding:20px 18px;font-size:13px;color:var(--muted)">Searching...</div>`;
        debounceTimer = setTimeout(() => self._runSearch(q, results, close), 200);
      });
    },

    async _runSearch(q, resultsEl, closeFn) {
      const ql = q.toLowerCase();
      try {
        const [leads, clients, contacts] = await Promise.all([
          self.api('/api/leads').catch(() => []),
          self.api('/api/clients').catch(() => []),
          self.api('/api/contacts').catch(() => [])
        ]);

        function matchLead(l) {
          const c = l.contacts || {};
          return [l.title, c.first_name, c.last_name, c.company, c.email].filter(Boolean).join(' ').toLowerCase().includes(ql);
        }
        function matchClient(cl) {
          const c = cl.contacts || {};
          return [c.first_name, c.last_name, c.company, c.email, cl.plan].filter(Boolean).join(' ').toLowerCase().includes(ql);
        }
        function matchContact(c) {
          return [c.first_name, c.last_name, c.company, c.email].filter(Boolean).join(' ').toLowerCase().includes(ql);
        }

        const matchedLeads    = (leads    || []).filter(matchLead).slice(0, 4);
        const matchedClients  = (clients  || []).filter(matchClient).slice(0, 4);
        const matchedContacts = (contacts || []).filter(matchContact).slice(0, 4);

        if (!matchedLeads.length && !matchedClients.length && !matchedContacts.length) {
          resultsEl.innerHTML = `<div style="padding:24px 18px;text-align:center;font-size:13px;color:var(--muted)">No results for "${q}"</div>`;
          return;
        }

        function section(title, items, renderFn) {
          if (!items.length) return '';
          return `<div style="padding:8px 0">
            <div style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:var(--muted);padding:6px 18px 4px">${title}</div>
            ${items.map(renderFn).join('')}
          </div>`;
        }

        function item(href, primary, secondary, closeFn) {
          return `<a href="${href}" onclick="event.preventDefault();window.location='${href}'" style="display:flex;flex-direction:column;padding:10px 18px;text-decoration:none;transition:background 0.1s;border-radius:0" onmouseenter="this.style.background='var(--bg-alt,#f5f5f7)'" onmouseleave="this.style.background='transparent'">
            <span style="font-size:13px;font-weight:500;color:var(--ink)">${primary}</span>
            ${secondary ? `<span style="font-size:11px;color:var(--muted);margin-top:2px">${secondary}</span>` : ''}
          </a>`;
        }

        resultsEl.innerHTML =
          section('Leads', matchedLeads, l => {
            const c = l.contacts || {};
            const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || l.title || 'Unknown';
            const sub  = [c.company, c.email].filter(Boolean).join(' · ');
            return item('/admin-leads', name, sub || l.title || '', closeFn);
          }) +
          section('Clients', matchedClients, cl => {
            const c = cl.contacts || {};
            const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company || 'Unknown';
            const sub  = [c.company, cl.plan].filter(Boolean).join(' · ');
            return item('/admin-clients', name, sub, closeFn);
          }) +
          section('Contacts', matchedContacts, c => {
            const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company || 'Unknown';
            const sub  = [c.company, c.email].filter(Boolean).join(' · ');
            return item('/admin-people#contacts', name, sub, closeFn);
          });

        // Wire up clicks to also close modal
        resultsEl.querySelectorAll('a').forEach(a => {
          a.addEventListener('click', () => closeFn());
        });
      } catch (err) {
        resultsEl.innerHTML = `<div style="padding:20px 18px;font-size:13px;color:var(--muted)">Search unavailable.</div>`;
      }
    },

    // ── Sidebar injection ──────────────────────────────────────────────────
    initSidebar(active) {
      const root = document.getElementById('sidebar-root');
      if (!root) return;
      root.innerHTML = `
<aside class="sidebar">
  <div class="sb-brand">
    <img src="/logo.svg" alt="TMI"/>
    <div><div class="sb-brand-label">TMI</div><div class="sb-brand-sub">Admin</div></div>
  </div>
  <nav class="sb-nav">
    ${NAV_GROUPS.map(g =>
      `${g.sep ? '<div class="sb-sep"></div>' : ''}<div class="sb-group-label">${g.label}</div>
    ${g.items.map(it => navItem(it.page, it.label, it.icon, it.badge, it.href)).join('\n    ')}`
    ).join('\n    ')}
  </nav>
  <div class="sb-foot">
    <button class="sb-logout" onclick="TMIAdmin.logout()">${I.logout}Log out</button>
  </div>
</aside>`;
      // Mark active by key
      root.querySelectorAll(`[data-page="${active}"]`).forEach(el => el.classList.add('active'));
      // Also mark items whose hashed href matches the current URL (so Ops Machine
      // tabs like #level10 / #journey / #success highlight correctly).
      const here = location.pathname.replace(/\/$/, '') + location.hash;
      root.querySelectorAll('.sb-item[href*="#"]').forEach(el => {
        const href = (el.getAttribute('href') || '').replace(/\/$/, '');
        if (href && href === here) el.classList.add('active');
      });
      // Load badge counts async
      self._loadBadges();
      // Init global search
      self.initSearch();
      // Mobile bottom nav
      self.initMobileNav(active);
    },

    // ── Mobile bottom nav ──────────────────────────────────────────────────
    initMobileNav(active) {
      if (document.getElementById('mobile-nav')) return;

      const navPages = [
        { page: 'dashboard', label: 'Home',    icon: I.dashboard },
        { page: 'leads',     label: 'Leads',   icon: I.leads     },
        { page: 'clients',   label: 'Clients', icon: I.clients   },
        { page: 'comms',     label: 'Comms',   icon: I.email     },
      ];

      const nav = document.createElement('nav');
      nav.id = 'mobile-nav';
      nav.className = 'mobile-nav';
      nav.innerHTML = `<div class="mobile-nav-inner">
        ${navPages.map(n => `
          <a href="/admin-${n.page}" class="mobile-nav-item${active===n.page?' active':''}" data-page="${n.page}">
            ${n.icon}${n.label}
          </a>`).join('')}
        <button class="mobile-nav-item" onclick="TMIAdmin.openMoreSheet()" id="mn-more-btn">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
          More
        </button>
      </div>`;
      document.body.appendChild(nav);

      // More sheet: same workspace groups and destinations as the desktop sidebar
      const groups = NAV_GROUPS;

      const sheet = document.createElement('div');
      sheet.id = 'more-sheet-overlay';
      sheet.className = 'more-sheet-overlay';
      sheet.innerHTML = `
        <div class="more-sheet-bg" onclick="TMIAdmin.closeMoreSheet()"></div>
        <div class="more-sheet">
          <div class="more-sheet-grip"></div>
          ${groups.map(g => `
            <div class="more-sheet-group">
              <span class="more-sheet-group-label">${g.label}</span>
              ${g.items.map(it => `
                <a href="${it.href || '/admin-'+it.page}" class="more-sheet-item${active===it.page?' active':''}" onclick="TMIAdmin.closeMoreSheet()">
                  ${it.icon}${it.label}
                </a>`).join('')}
            </div>`).join('')}
          <button class="more-sheet-logout" onclick="TMIAdmin.logout()">
            ${I.logout} Log out
          </button>
          <div style="height:env(safe-area-inset-bottom,8px)"></div>
        </div>`;
      document.body.appendChild(sheet);
    },

    openMoreSheet() {
      const el = document.getElementById('more-sheet-overlay');
      if (el) el.classList.add('open');
    },

    closeMoreSheet() {
      const el = document.getElementById('more-sheet-overlay');
      if (el) el.classList.remove('open');
    },

    async _loadBadges() {
      try {
        const t = self.token();
        const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t };
        const [apps, fu] = await Promise.all([
          fetch('/api/applications', { headers: h }).then(r => r.ok ? r.json() : []).catch(() => []),
          fetch('/api/followups', { headers: h }).then(r => r.ok ? r.json() : []).catch(() => [])
        ]);
        const newApps = Array.isArray(apps) ? apps.filter(a => a.status === 'new').length : 0;
        const now = new Date();
        const overdueFu = Array.isArray(fu) ? fu.filter(f => !f.completed && new Date(f.due_at) < now).length : 0;
        const total = newApps + overdueFu;
        if (total > 0) {
          const el = document.getElementById('sb-badge-inbox');
          if (el) { el.textContent = total; el.style.display = 'inline-flex'; }
        }
      } catch {}
    },

    // ── Activity log helpers ───────────────────────────────────────────────
    async logActivity(contactId, type, title, body = '') {
      return self.api('/api/activities', 'POST', { contact_id: contactId, type, title, body });
    },

    async renderActivityPanel(contactId, containerId) {
      const el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = `<div style="padding:8px 0;font-size:13px;color:var(--muted)">Loading...</div>`;
      const data = await self.api(`/api/activities?contact_id=${contactId}`);
      if (!data?.length) {
        el.innerHTML = `<div style="font-size:13px;color:var(--muted);padding:8px 0;">No activity yet.</div>`;
        return;
      }
      const dotColor = { call:'blue', email:'chart', meeting:'green', note:'', sms:'blue', task:'' };
      el.innerHTML = `<div class="tl-list">${data.map(a => `
        <div class="tl-item">
          <div class="tl-dot ${dotColor[a.type] || ''}"></div>
          <div class="tl-body">
            <div class="tl-title">${a.title}</div>
            ${a.body ? `<div class="tl-text">${a.body}</div>` : ''}
            <div class="tl-time">${self.fmt(a.created_at)}</div>
          </div>
        </div>`).join('')}</div>`;
    },

    activityLogHtml(contactId) {
      return `
        <div class="panel-sec-label" style="margin-top:0">Activity Log</div>
        <div id="activity-feed-${contactId}" style="margin-bottom:16px"></div>
        <button class="btn btn-ghost btn-sm" onclick="logActivity_${contactId}()">+ Log Activity</button>
        <script>
          TMIAdmin.renderActivityPanel('${contactId}', 'activity-feed-${contactId}');
          function logActivity_${contactId}() {
            const type = prompt('Type (call/note/meeting/email):','note');
            if (!type) return;
            const title = prompt('Summary:');
            if (!title) return;
            const body = prompt('Details (optional):') || '';
            TMIAdmin.logActivity('${contactId}', type, title, body).then(() => {
              TMIAdmin.toast('Activity logged');
              TMIAdmin.renderActivityPanel('${contactId}', 'activity-feed-${contactId}');
            });
          }
        <\/script>`;
    },

    // ── API ────────────────────────────────────────────────────────────────
    async api(path, method = 'GET', body = null) {
      try {
        const opts = {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + self.token()
          }
        };
        if (body) opts.body = JSON.stringify(body);
        const r = await fetch(path, opts);
        if (r.status === 401) { self.logout(); return null; }
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || 'Request failed');
        return json;
      } catch (e) {
        self.toast(e.message || 'Network error', 'error');
        return null;
      }
    },

    // ── UI Helpers ─────────────────────────────────────────────────────────
    toast(msg, type = 'success') {
      const root = document.getElementById('toast-root');
      if (!root) return;
      const el = document.createElement('div');
      el.className = 'toast ' + type;
      el.textContent = msg;
      root.appendChild(el);
      requestAnimationFrame(() => el.classList.add('visible'));
      setTimeout(() => { el.classList.remove('visible'); setTimeout(() => el.remove(), 300); }, 3500);
    },

    fmt(d) {
      if (!d) return '—';
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    },

    reltime(d) {
      if (!d) return '—';
      const diff = Date.now() - new Date(d).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      const days = Math.floor(hrs / 24);
      if (days < 30) return `${days}d ago`;
      return self.fmt(d);
    },

    currency(n) {
      if (!n && n !== 0) return '—';
      return '$' + Number(n).toLocaleString('en-US');
    },

    badge(status) {
      const cls = {
        new:'badge-new', contacted:'badge-contacted', qualified:'badge-qualified',
        proposal:'badge-proposal', won:'badge-won', lost:'badge-lost',
        active:'badge-active', paused:'badge-paused', churned:'badge-churned',
        draft:'badge-draft', sending:'badge-sending', sent:'badge-sent', failed:'badge-failed',
        physical:'badge-physical', online:'badge-online', fotf:'badge-fotf',
        'day-one':'badge-new', 'online-creator':'badge-online', 'online-ecom':'badge-online',
        'online-agency':'badge-online', 'online-saas':'badge-online', 'trades':'badge-physical',
        'retail':'badge-physical', 'restaurant':'badge-physical', 'not-yet':'badge-draft',
        reviewed:'badge-contacted', scheduled:'badge-qualified', accepted:'badge-won', rejected:'badge-lost',
        idea:'badge-draft', writing:'badge-qualified', ready:'badge-proposal', published:'badge-won',
        scripted:'badge-new', filming:'badge-physical', editing:'badge-proposal', scheduled:'badge-qualified', posted:'badge-won', archived:'badge-lost',
        scoping:'badge-new', delivered:'badge-won', cancelled:'badge-lost',
        paid:'badge-won', overdue:'badge-failed', unpaid:'badge-proposal',
        high:'badge-failed', normal:'badge-draft', low:'badge-lost',
        completed:'badge-won', pending:'badge-new', open:'badge-new',
        declined:'badge-lost', viewed:'badge-contacted', accepted_proposal:'badge-won'
      };
      return `<span class="badge ${cls[status] || ''}">${status || '—'}</span>`;
    },

    initials(first, last) {
      return ((first?.[0] || '') + (last?.[0] || '')).toUpperCase() || '?';
    },

    // ── Form modal: a styled replacement for prompt() ───────────────────────
    // fields: [{ name, label, type, value, placeholder, options, rows, required }]
    // types: 'text' | 'number' | 'textarea' | 'select'  → resolves to values, or null.
    formModal({ title = 'Add', fields = [], submitLabel = 'Save' } = {}) {
      return new Promise(resolve => {
        const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
        const fieldHtml = fields.map((f, i) => {
          const id = `fm-f-${i}`;
          let control;
          if (f.type === 'textarea') {
            control = `<textarea class="form-input" id="${id}" rows="${f.rows || 4}" placeholder="${esc(f.placeholder)}" style="resize:vertical">${esc(f.value)}</textarea>`;
          } else if (f.type === 'select') {
            const opts = (f.options || []).map(o => {
              const val = (o && typeof o === 'object') ? o.value : o;
              const lab = (o && typeof o === 'object') ? o.label : o;
              return `<option value="${esc(val)}" ${String(val) === String(f.value) ? 'selected' : ''}>${esc(lab)}</option>`;
            }).join('');
            control = `<select class="form-input" id="${id}">${opts}</select>`;
          } else {
            control = `<input class="form-input" id="${id}" type="${f.type || 'text'}" value="${esc(f.value)}" placeholder="${esc(f.placeholder)}"/>`;
          }
          return `<div style="margin-bottom:14px"><label class="form-label">${esc(f.label)}</label>${control}</div>`;
        }).join('');

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay open';
        overlay.innerHTML = `<div class="modal" style="max-width:460px;padding:28px">
          <div class="modal-hd"><h3 class="modal-title" style="font-size:18px">${esc(title)}</h3><button class="modal-close" id="fm-x">&times;</button></div>
          <div class="modal-bd" style="margin:8px 0 4px">${fieldHtml}</div>
          <div class="modal-ft" style="margin-top:8px">
            <button class="btn btn-ghost btn-sm" id="fm-cancel">Cancel</button>
            <button class="btn btn-primary btn-sm" id="fm-ok">${esc(submitLabel)}</button>
          </div>
        </div>`;
        document.body.appendChild(overlay);

        const close = val => { overlay.remove(); resolve(val); };
        const submit = () => {
          const out = {};
          for (let i = 0; i < fields.length; i++) {
            const f = fields[i];
            let v = document.getElementById(`fm-f-${i}`).value;
            if (f.type === 'number') v = v === '' ? null : Number(v);
            else if (typeof v === 'string') v = v.trim();
            if (f.required && (v === '' || v == null)) { document.getElementById(`fm-f-${i}`).focus(); return; }
            out[f.name] = v;
          }
          close(out);
        };
        overlay.querySelector('#fm-ok').onclick = submit;
        overlay.querySelector('#fm-cancel').onclick = () => close(null);
        overlay.querySelector('#fm-x').onclick = () => close(null);
        overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(null); });
        overlay.addEventListener('keydown', e => {
          if (e.key === 'Escape') close(null);
          if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') submit();
        });
        const first = overlay.querySelector('.form-input');
        if (first) setTimeout(() => { first.focus(); }, 50);
      });
    },

    async confirm(msg, danger = true) {
      return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay open';
        overlay.innerHTML = `<div class="modal" style="max-width:360px;padding:28px">
          <div class="modal-hd"><h3 class="modal-title" style="font-size:18px">Confirm</h3></div>
          <p style="font-size:14px;color:var(--ink-2);margin-bottom:24px;line-height:1.5">${msg}</p>
          <div class="modal-ft">
            <button class="btn btn-ghost btn-sm" id="conf-no">Cancel</button>
            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-sm" id="conf-yes">${danger ? 'Delete' : 'Confirm'}</button>
          </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#conf-yes').onclick = () => { overlay.remove(); resolve(true); };
        overlay.querySelector('#conf-no').onclick  = () => { overlay.remove(); resolve(false); };
      });
    },

    openModal(id)  { document.getElementById(id)?.classList.add('open'); },
    closeModal(id) { document.getElementById(id)?.classList.remove('open'); },
    openPanel(id)  { document.getElementById(id)?.classList.add('open'); },
    closePanel(id) { document.getElementById(id)?.classList.remove('open'); },

    renderNichePills(containerId, audience, selectedNiches = []) {
      const el = document.getElementById(containerId);
      if (!el) return;
      const list = audience ? (NICHES[audience] || []) : [...NICHES.physical, ...NICHES.online, ...NICHES.fotf];
      el.innerHTML = list.map(n =>
        `<span class="niche-pill${selectedNiches.includes(n) ? ' active' : ''}" data-niche="${n}">${n}</span>`
      ).join('');
      el.querySelectorAll('.niche-pill').forEach(p => {
        p.addEventListener('click', () => p.classList.toggle('active'));
      });
    },

    getSelectedNiches(containerId) {
      return [...document.querySelectorAll(`#${containerId} .niche-pill.active`)].map(p => p.dataset.niche);
    }
  };

  return self;
})();
