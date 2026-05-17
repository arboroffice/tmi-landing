/* TMI City Leads — shared auth, Supabase client, sidebar, utilities */

const CL = (() => {
  const SB_URL  = 'https://nxvymsgwohpzntfbwmqt.supabase.co';
  const SB_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54dnltc2d3b2hwem50ZmJ3bXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNDYxNDUsImV4cCI6MjA5MzgyMjE0NX0.Wx-gzfZUbrwrhWnvdRRiNqNp7_m034NOKUenVBIBx-8';
  const SESSION_KEY = 'cl_session';

  const PIPELINE_STAGES = [
    { id:'seed',               label:'Seed' },
    { id:'met_owner',          label:'Met Owner' },
    { id:'second_visit',       label:'2nd Visit' },
    { id:'problem_identified', label:'Problem ID\'d' },
    { id:'warm',               label:'Warm' },
    { id:'audit_booked',       label:'Audit Booked' },
    { id:'proposal_sent',      label:'Proposal Sent' },
    { id:'closed',             label:'Closed' },
    { id:'build_live',         label:'Build Live' },
    { id:'support_active',     label:'Support Active' },
    { id:'expansion',          label:'Expansion' },
  ];

  const VISIT_TYPES = ['Walk-in','Coffee','Call','Email','Text','Other'];

  const BIZ_TYPES = [
    'HVAC','Plumbing','Roofing','Electrician','Landscaping','Painting',
    'Construction','Concrete','Welding','Pipeline','Heavy Equipment',
    'Manufacturing','Mining','Oil & Gas','Agriculture','Home Service',
    'Auto Repair','Pest Control','Cleaning','Other'
  ];

  // ── Icons ───────────────────────────────────────────────────────────────
  const I = {
    home:      `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke-linecap="round" stroke-linejoin="round"/><polyline points="9 22 9 12 15 12 15 22" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    map:       `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" stroke-linecap="round" stroke-linejoin="round"/><line x1="8" y1="2" x2="8" y2="18" stroke-linecap="round"/><line x1="16" y1="6" x2="16" y2="22" stroke-linecap="round"/></svg>`,
    list:      `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><line x1="8" y1="6" x2="21" y2="6" stroke-linecap="round"/><line x1="8" y1="12" x2="21" y2="12" stroke-linecap="round"/><line x1="8" y1="18" x2="21" y2="18" stroke-linecap="round"/><line x1="3" y1="6" x2="3.01" y2="6" stroke-linecap="round" stroke-width="2"/><line x1="3" y1="12" x2="3.01" y2="12" stroke-linecap="round" stroke-width="2"/><line x1="3" y1="18" x2="3.01" y2="18" stroke-linecap="round" stroke-width="2"/></svg>`,
    capture:   `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" stroke-linecap="round"/></svg>`,
    pipeline:  `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><rect x="3" y="3" width="4" height="18" rx="1"/><rect x="10" y="3" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="10" rx="1"/></svg>`,
    more:      `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>`,
    followup:  `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14" stroke-linecap="round"/></svg>`,
    search:    `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65" stroke-linecap="round"/></svg>`,
    visit:     `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke-linecap="round"/><circle cx="12" cy="10" r="3"/></svg>`,
    handoff:   `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><polyline points="9 18 15 12 9 6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    earnings:  `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><line x1="12" y1="1" x2="12" y2="23" stroke-linecap="round"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke-linecap="round"/></svg>`,
    route:     `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    heat:      `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    chat:      `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke-linecap="round"/></svg>`,
    playbook:  `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
    scripts:   `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13" stroke-linecap="round"/><line x1="16" y1="17" x2="8" y2="17" stroke-linecap="round"/></svg>`,
    trophy:    `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><polyline points="8 21 12 17 16 21" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="17" x2="12" y2="9" stroke-linecap="round"/><path d="M4 3h16v4a8 8 0 0 1-8 8 8 8 0 0 1-8-8V3z" stroke-linecap="round"/><path d="M4 7H1M20 7h3" stroke-linecap="round"/></svg>`,
    ai:        `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M6.343 6.343a8 8 0 1 0 11.314 11.314A8 8 0 0 0 6.343 6.343z" opacity=".3"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2" stroke-linecap="round"/></svg>`,
    settings:  `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    logout:    `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7" width="15" height="15"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke-linecap="round"/><polyline points="16 17 21 12 16 7" stroke-linecap="round" stroke-linejoin="round"/><line x1="21" y1="12" x2="9" y2="12" stroke-linecap="round"/></svg>`,
    dashboard: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
    cities:    `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke-linecap="round" stroke-linejoin="round"/><polyline points="9 22 9 12 15 12 15 22" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    team:      `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="12" cy="8" r="4"/><path stroke-linecap="round" d="M6 20v-1a6 6 0 0 1 12 0v1"/><circle cx="20" cy="8" r="3"/><path stroke-linecap="round" d="M23 20v-1a4 4 0 0 0-3-3.87"/></svg>`,
    money:     `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10" stroke-linecap="round"/></svg>`,
    lookup:    `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" stroke-linecap="round"/><path d="M11 8a3 3 0 0 1 3 3" stroke-linecap="round"/></svg>`,
    week:      `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke-linecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke-linecap="round"/></svg>`,
    target:    `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
    camera:    `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke-linecap="round"/><circle cx="12" cy="13" r="4"/></svg>`,
    upload:    `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><polyline points="16 16 12 12 8 16" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="12" x2="12" y2="21" stroke-linecap="round"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" stroke-linecap="round"/></svg>`,
    bug:       `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M8 2h8M9 8h6M12 2v6M9 14v2M15 14v2M12 22v-4" stroke-linecap="round"/><path d="M20 13v1a8 8 0 0 1-16 0v-1a8 8 0 0 1 16 0z" stroke-linecap="round"/><path d="M4 10l-2-2M20 10l2-2M4 18l-2 2M20 18l2 2" stroke-linecap="round"/></svg>`,
    star:      `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    ref:       `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11A2.98 2.98 0 0 0 18 8a3 3 0 1 0-3-3c0 .24.04.47.09.7L8.04 9.81A3 3 0 0 0 6 9a3 3 0 0 0 0 6c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65a3 3 0 1 0 3-3z"/></svg>`,
    birthday:  `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke-linecap="round"/><circle cx="12" cy="7" r="4"/></svg>`,
    add:       `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><line x1="12" y1="5" x2="12" y2="19" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke-linecap="round"/></svg>`,
    back:      `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><polyline points="15 18 9 12 15 6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    calc:      `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6" stroke-linecap="round"/><line x1="8" y1="10" x2="10" y2="10" stroke-linecap="round"/><line x1="12" y1="10" x2="14" y2="10" stroke-linecap="round"/><line x1="16" y1="10" x2="16" y2="14" stroke-linecap="round"/><line x1="8" y1="14" x2="10" y2="14" stroke-linecap="round"/><line x1="12" y1="14" x2="12" y2="18" stroke-linecap="round"/><line x1="8" y1="18" x2="10" y2="18" stroke-linecap="round"/></svg>`,
    tax:       `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13" stroke-linecap="round"/><line x1="16" y1="17" x2="8" y2="17" stroke-linecap="round"/></svg>`,
    hours:     `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14" stroke-linecap="round"/></svg>`,
    note:      `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
    conv:      `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke-linecap="round"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke-linecap="round"/></svg>`,
    research:  `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><line x1="18" y1="20" x2="18" y2="10" stroke-linecap="round"/><line x1="12" y1="20" x2="12" y2="4" stroke-linecap="round"/><line x1="6" y1="20" x2="6" y2="14" stroke-linecap="round"/></svg>`,
    wins:      `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" stroke-linecap="round" stroke-linejoin="round"/><polyline points="16 7 22 7 22 13" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    posts:     `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21" stroke-linecap="round"/><line x1="12" y1="17" x2="12" y2="21" stroke-linecap="round"/></svg>`,
    help:      `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" stroke-linecap="round"/><line x1="12" y1="17" x2="12.01" y2="17" stroke-linecap="round" stroke-width="2"/></svg>`,
    suggest:   `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke-linecap="round"/><line x1="12" y1="8" x2="12" y2="12" stroke-linecap="round"/><line x1="12" y1="16" x2="12.01" y2="16" stroke-linecap="round" stroke-width="2"/></svg>`,
    scan:      `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8h10M7 12h10M7 16h10" stroke-linecap="round"/></svg>`,
    objection: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15" stroke-linecap="round"/><line x1="9" y1="9" x2="15" y2="15" stroke-linecap="round"/></svg>`,
  };

  // ── City Lead sidebar nav ──────────────────────────────────────────────
  const LEAD_NAV = [
    { group: 'Home' },
    { id:'cl-lead-home', label:'Dashboard',   icon:'home',    href:'cl-lead-home.html' },
    { id:'cl-plan',      label:'Plan',         icon:'week',    href:'cl-plan.html' },
    { group: 'My City' },
    { id:'cl-map',          label:'City Map',      icon:'map',    href:'cl-map.html' },
    { id:'cl-search',       label:'Search',        icon:'search', href:'cl-search.html' },
    { id:'cl-my-list',      label:'My List',       icon:'list',   href:'cl-my-list.html' },
    { id:'cl-add-business', label:'Add Business',  icon:'add',    href:'cl-add-business.html' },
    { group: 'Work' },
    { id:'cl-quick-capture', label:'Quick Capture', icon:'capture',  href:'cl-quick-capture.html', badge:true },
    { id:'cl-activity',      label:'Activity',      icon:'visit',    href:'cl-activity.html' },
    { id:'cl-follow-ups',    label:'Follow-Ups',    icon:'followup', href:'cl-follow-ups.html', badge:true },
    { group: 'Pipeline' },
    { id:'cl-pipeline', label:'Pipeline Board', icon:'pipeline', href:'cl-pipeline.html' },
    { id:'cl-earnings',  label:'Earnings',       icon:'earnings', href:'cl-earnings.html' },
    { group: 'Learn' },
    { id:'cl-learn', label:'Playbook & Scripts', icon:'playbook', href:'cl-learn.html' },
    { id:'cl-leaderboard', label:'Leaderboard', icon:'trophy', href:'cl-leaderboard.html' },
    { group: 'Content & Community' },
    { id:'cl-content', label:'Content & Chat', icon:'upload', href:'cl-content.html' },
    { group: 'AI Tools' },
    { id:'cl-owner-lookup', label:'Owner Lookup', icon:'lookup', href:'cl-owner-lookup.html' },
    { id:'cl-ai-chat',      label:'AI Assistant', icon:'ai',     href:'cl-ai-chat.html' },
    { group: 'Account' },
    { id:'cl-settings', label:'Settings', icon:'settings', href:'cl-settings.html' },
    { id:'cl-help',     label:'Help',     icon:'help',     href:'cl-help.html' },
  ];

  // ── Admin sidebar nav ─────────────────────────────────────────────────
  const ADMIN_NAV = [
    { group: 'Overview' },
    { id:'cl-admin',              label:'Dashboard',         icon:'dashboard', href:'cl-admin.html' },
    { id:'cl-cities',             label:'All Cities',        icon:'cities',    href:'cl-cities.html' },
    { id:'cl-money',              label:'Money',             icon:'money',     href:'cl-money.html' },
    { group: 'Team' },
    { id:'cl-roster',    label:'City Lead Roster', icon:'team',  href:'cl-roster.html' },
    { id:'cl-add-lead',  label:'Add City Lead',    icon:'add',   href:'cl-add-lead.html' },
    { id:'cl-leaderboard',label:'Leaderboard',     icon:'trophy',href:'cl-leaderboard.html' },
    { group: 'Businesses' },
    { id:'cl-master-businesses', label:'All Businesses', icon:'list',   href:'cl-master-businesses.html' },
    { id:'cl-owner-lookup',      label:'Owner Lookup',   icon:'lookup', href:'cl-owner-lookup.html' },
    { group: 'Tools' },
    { id:'cl-ai-chat',  label:'AI Assistant', icon:'ai',       href:'cl-ai-chat.html' },
    { id:'cl-settings', label:'Settings',     icon:'settings', href:'cl-settings.html' },
  ];

  // ── Bottom nav tabs (City Lead primary 5) ─────────────────────────────
  const LEAD_BOTTOM_NAV = [
    { id:'cl-lead-home',     label:'Home',     icon:'home',    href:'cl-lead-home.html' },
    { id:'cl-map',           label:'Map',      icon:'map',     href:'cl-map.html' },
    { id:'cl-quick-capture', label:'Capture',  icon:'capture', href:'cl-quick-capture.html' },
    { id:'cl-my-list',       label:'My List',  icon:'list',    href:'cl-my-list.html' },
    { id:'cl-pipeline',      label:'Pipeline', icon:'pipeline',href:'cl-pipeline.html' },
  ];

  const ADMIN_BOTTOM_NAV = [
    { id:'cl-admin',   label:'Home',   icon:'dashboard', href:'cl-admin.html' },
    { id:'cl-cities',  label:'Cities', icon:'cities',    href:'cl-cities.html' },
    { id:'cl-roster',  label:'Roster', icon:'team',      href:'cl-roster.html' },
    { id:'cl-money',   label:'Money',  icon:'money',     href:'cl-money.html' },
  ];

  function sbItem(item, active) {
    if (item.group) return `<div class="sb-group-label">${item.group}</div>`;
    const isActive = active === item.id;
    return `<a href="${item.href}" class="sb-item${isActive ? ' active' : ''}" data-page="${item.id}">${I[item.icon] || ''}${item.label}${item.badge ? `<span class="sb-badge" id="sb-badge-${item.id}" style="display:none"></span>` : ''}</a>`;
  }

  const self = {
    stages: PIPELINE_STAGES,
    visitTypes: VISIT_TYPES,
    bizTypes: BIZ_TYPES,
    icons: I,

    // ── Auth ──────────────────────────────────────────────────────────────
    getSession() {
      try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
    },

    setSession(s) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    },

    clearSession() {
      localStorage.removeItem(SESSION_KEY);
    },

    getUser() {
      return self.getSession()?.user || null;
    },

    getRole() {
      return self.getSession()?.user?.user_metadata?.role || 'city_lead';
    },

    getCityLeadId() {
      return self.getSession()?.user?.user_metadata?.city_lead_id || null;
    },

    requireAuth() {
      if (!self.getSession()) {
        window.location.replace('index.html');
        return false;
      }
      return true;
    },

    requireAdmin() {
      if (!self.requireAuth()) return false;
      if (self.getRole() !== 'admin') {
        window.location.replace('cl-lead-home.html');
        return false;
      }
      return true;
    },

    logout() {
      self.clearSession();
      window.location.replace('index.html');
    },

    // ── Sidebar ───────────────────────────────────────────────────────────
    initSidebar(active) {
      const root = document.getElementById('sidebar-root');
      if (!root) return;
      const role = self.getRole();
      const nav = role === 'admin' ? ADMIN_NAV : LEAD_NAV;
      const logoSub = role === 'admin' ? 'Admin' : 'City Lead';
      root.innerHTML = `
<aside class="sidebar">
  <div class="sb-brand">
    <img src="../logo.svg" alt="TMI"/>
    <div><div class="sb-brand-label">TMI</div><div class="sb-brand-sub">${logoSub}</div></div>
  </div>
  <nav class="sb-nav">
    ${nav.map(item => sbItem(item, active)).join('')}
  </nav>
  <div class="sb-foot">
    <button class="sb-logout" onclick="CL.logout()">${I.logout} Log out</button>
  </div>
</aside>`;
    },

    // ── Bottom nav ────────────────────────────────────────────────────────
    initBottomNav(active) {
      if (document.getElementById('bottom-nav')) return;
      const role = self.getRole();
      const tabs = role === 'admin' ? ADMIN_BOTTOM_NAV : LEAD_BOTTOM_NAV;

      const nav = document.createElement('nav');
      nav.id = 'bottom-nav';
      nav.className = 'bottom-nav';
      nav.innerHTML = `<div class="bottom-nav-inner">
        ${tabs.map(t => `
          <a href="${t.href}" class="bn-item${active === t.id ? ' active' : ''}" data-page="${t.id}">
            ${I[t.icon] || ''}
            <span>${t.label}</span>
            ${t.badge ? `<span class="bn-badge" id="bn-badge-${t.id}"></span>` : ''}
          </a>`).join('')}
        <button class="bn-item" onclick="CL.openMoreSheet()" id="bn-more">
          ${I.more}
          <span>More</span>
        </button>
      </div>`;
      document.body.appendChild(nav);

      // More sheet
      const role2 = self.getRole();
      const allNav = role2 === 'admin' ? ADMIN_NAV : LEAD_NAV;
      const sheetGroups = [];
      let currentGroup = null;
      allNav.forEach(item => {
        if (item.group) { currentGroup = { label: item.group, items: [] }; sheetGroups.push(currentGroup); }
        else if (currentGroup) currentGroup.items.push(item);
      });

      const sheet = document.createElement('div');
      sheet.id = 'more-sheet-overlay';
      sheet.className = 'more-sheet-overlay';
      sheet.innerHTML = `
        <div class="more-sheet-bg" onclick="CL.closeMoreSheet()"></div>
        <div class="more-sheet">
          <div class="more-sheet-grip"></div>
          ${sheetGroups.map(g => `
            <div class="more-sheet-group">
              <span class="more-sheet-group-label">${g.label}</span>
              ${g.items.map(it => `
                <a href="${it.href}" class="more-sheet-item${active === it.id ? ' active' : ''}" onclick="CL.closeMoreSheet()">
                  ${I[it.icon] || ''}${it.label}
                </a>`).join('')}
            </div>`).join('')}
          <button class="more-sheet-logout" onclick="CL.logout()">
            ${I.logout} Log out
          </button>
          <div style="height:env(safe-area-inset-bottom,8px)"></div>
        </div>`;
      document.body.appendChild(sheet);
    },

    openMoreSheet() {
      document.getElementById('more-sheet-overlay')?.classList.add('open');
    },

    closeMoreSheet() {
      document.getElementById('more-sheet-overlay')?.classList.remove('open');
    },

    // ── Init page (auth + sidebar + bottom nav + toast root) ─────────────
    initPage(activeId, { adminOnly = false } = {}) {
      if (adminOnly) { if (!self.requireAdmin()) return; }
      else { if (!self.requireAuth()) return; }
      self.initSidebar(activeId);
      self.initBottomNav(activeId);
      if (!document.getElementById('toast-root')) {
        const t = document.createElement('div');
        t.id = 'toast-root';
        document.body.appendChild(t);
      }
    },

    // ── UI helpers ────────────────────────────────────────────────────────
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

    openModal(id)  { document.getElementById(id)?.classList.add('open'); },
    closeModal(id) { document.getElementById(id)?.classList.remove('open'); },
    openPanel(id)  { document.getElementById(id)?.classList.add('open'); },
    closePanel(id) { document.getElementById(id)?.classList.remove('open'); },

    async confirm(msg, danger = true) {
      return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay open';
        overlay.innerHTML = `<div class="modal" style="padding:24px 20px calc(24px + env(safe-area-inset-bottom,0px))">
          <div class="modal-grip"></div>
          <p style="font-size:15px;color:var(--ink-2);margin-bottom:24px;line-height:1.5">${msg}</p>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-full" id="conf-yes">${danger ? 'Delete' : 'Confirm'}</button>
            <button class="btn btn-ghost btn-full" id="conf-no">Cancel</button>
          </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#conf-yes').onclick = () => { overlay.remove(); resolve(true); };
        overlay.querySelector('#conf-no').onclick  = () => { overlay.remove(); resolve(false); };
      });
    },

    // ── Formatting ────────────────────────────────────────────────────────
    fmt(d) {
      if (!d) return '—';
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    },

    reltime(d) {
      if (!d) return '—';
      const diff = Date.now() - new Date(d).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 2) return 'Just now';
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

    stageBadge(stage) {
      const s = stage || 'seed';
      const slug = s.replace(/_/g, '-');
      const found = PIPELINE_STAGES.find(p => p.id === s);
      const label = found ? found.label : s;
      return `<span class="badge badge-${slug}">${label}</span>`;
    },

    scoreDot(score) {
      return `<span class="score-dot ${score || 'cold'}"></span>`;
    },

    initials(name) {
      if (!name) return '?';
      const parts = name.trim().split(' ');
      return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
    },

    // ── Supabase client (loaded via CDN — init after supabase-js loads) ───
    sb: null,

    initSupabase() {
      if (typeof window.supabase === 'undefined') return null;
      if (!self.sb) {
        self.sb = window.supabase.createClient(SB_URL, SB_KEY);
      }
      return self.sb;
    },

    async api(table, query = {}) {
      const sb = self.initSupabase();
      if (!sb) return { data: null, error: { message: 'Supabase not initialized' } };
      let req = sb.from(table).select(query.select || '*');
      if (query.eq)     Object.entries(query.eq).forEach(([k,v]) => req = req.eq(k, v));
      if (query.order)  req = req.order(query.order, { ascending: query.asc ?? false });
      if (query.limit)  req = req.limit(query.limit);
      if (query.single) req = req.single();
      return req;
    },

    // ── Stub for pages to override with real Supabase calls ───────────────
    async loadPage() {},
  };

  return self;
})();
