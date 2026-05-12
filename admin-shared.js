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

  const SOURCES = ['Website','Referral','LinkedIn','Instagram','Cold Outreach','Event','Field Notes','Other'];

  // ── Icons ─────────────────────────────────────────────────────────────────
  const I = {
    dashboard: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
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
    settings:  `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    logout:    `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.7" width="15" height="15"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke-linecap="round"/><polyline points="16 17 21 12 16 7" stroke-linecap="round" stroke-linejoin="round"/><line x1="21" y1="12" x2="9" y2="12" stroke-linecap="round"/></svg>`
  };

  function navItem(page, label, icon, badge) {
    return `<a href="/admin-${page}" class="sb-item" data-page="${page}">${icon}${label}${badge ? `<span class="sb-badge" id="sb-badge-${page}" style="display:none"></span>` : ''}</a>`;
  }

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
    <div class="sb-group-label">Overview</div>
    ${navItem('dashboard', 'Dashboard', I.dashboard)}
    ${navItem('revenue', 'Revenue', I.revenue)}
    <div class="sb-group-label">Sales</div>
    ${navItem('applications', 'Applications', I.apps, true)}
    ${navItem('followups', 'Follow-ups', I.followup, true)}
    ${navItem('leads', 'Leads', I.leads)}
    ${navItem('proposals', 'Proposals', I.proposals)}
    <div class="sb-group-label">Clients</div>
    ${navItem('clients', 'Clients', I.clients)}
    ${navItem('projects', 'Projects', I.projects)}
    ${navItem('invoices', 'Invoices', I.invoices)}
    ${navItem('onboarding', 'Onboarding', I.onboarding)}
    <div class="sb-group-label">People</div>
    ${navItem('contacts', 'Contacts', I.contacts)}
    <div class="sb-group-label">Comms</div>
    ${navItem('email', 'Email', I.email)}
    ${navItem('sms', 'SMS', I.sms)}
    <div class="sb-group-label">Content</div>
    ${navItem('content', 'Field Notes', I.content)}
    <div class="sb-sep"></div>
    ${navItem('settings', 'Settings', I.settings)}
  </nav>
  <div class="sb-foot">
    <button class="sb-logout" onclick="TMIAdmin.logout()">${I.logout}Log out</button>
  </div>
</aside>`;
      // Mark active
      root.querySelectorAll(`[data-page="${active}"]`).forEach(el => el.classList.add('active'));
      // Load badge counts async
      self._loadBadges();
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
        if (newApps > 0) {
          const el = document.getElementById('sb-badge-applications');
          if (el) { el.textContent = newApps; el.style.display = 'inline-flex'; }
        }
        if (overdueFu > 0) {
          const el = document.getElementById('sb-badge-followups');
          if (el) { el.textContent = overdueFu; el.style.display = 'inline-flex'; }
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
        reviewed:'badge-contacted', scheduled:'badge-qualified', accepted:'badge-won', rejected:'badge-lost',
        idea:'badge-draft', writing:'badge-qualified', ready:'badge-proposal', published:'badge-won',
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
