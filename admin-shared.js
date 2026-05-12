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

    toast(msg, type = 'success') {
      const root = document.getElementById('toast-root');
      if (!root) return;
      const el = document.createElement('div');
      el.className = 'toast ' + type;
      el.textContent = msg;
      root.appendChild(el);
      requestAnimationFrame(() => el.classList.add('visible'));
      setTimeout(() => {
        el.classList.remove('visible');
        setTimeout(() => el.remove(), 300);
      }, 3500);
    },

    fmt(d) {
      if (!d) return '—';
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
        physical:'badge-physical', online:'badge-online', fotf:'badge-fotf'
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

    /* Render niche pills for a given audience into a container */
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

    /* Get currently selected niche pills from a container */
    getSelectedNiches(containerId) {
      return [...document.querySelectorAll(`#${containerId} .niche-pill.active`)].map(p => p.dataset.niche);
    }
  };

  return self;
})();
