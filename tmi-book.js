/* TMI booking widget - a floating embed (like a chat bubble, but it opens a
   scheduler, not a chat). Include this script on a page and a launcher pins to
   the bottom-right; clicking it expands the booking card with a live weekday
   strip that opens the Cal.com booking. Also fills any inline .bc-dates cards. */
(function () {
  var CAL_LINK = 'mia-elianaa-a4n2hk/30min';

  // Cal.com embed bootstrap (binds any element with data-cal-link).
  (function (C, A, L) {
    var p = function (a, ar) { a.q.push(ar); };
    var d = C.document;
    C.Cal = C.Cal || function () {
      var cal = C.Cal; var ar = arguments;
      if (!cal.loaded) { cal.ns = {}; cal.q = cal.q || []; d.head.appendChild(d.createElement('script')).src = A; cal.loaded = true; }
      if (ar[0] === L) { var api = function () { p(api, arguments); }; var ns = ar[1]; api.q = api.q || []; typeof ns === 'string' ? (cal.ns[ns] = api) && p(api, ar) : p(cal, ar); return; }
      p(cal, ar);
    };
  })(window, 'https://app.cal.com/embed/embed.js', 'init');
  try {
    Cal('init', { origin: 'https://cal.com' });
    Cal('ui', { styles: { branding: { brandColor: '#0a0b14' } }, hideEventTypeDetails: false, layout: 'month_view' });
  } catch (e) {}

  function track() { try { if (typeof fbq === 'function') fbq('track', 'Lead', { content_name: 'Business Intelligence Audit' }); } catch (e) {} }

  function renderDates(host) {
    if (!host || host.dataset.filled) return;
    host.dataset.filled = '1';
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var d = new Date(); var added = 0;
    while (added < 5) {
      d.setDate(d.getDate() + 1);
      var wd = d.getDay();
      if (wd === 0 || wd === 6) continue;
      var el = document.createElement('button');
      el.className = 'bc-date'; el.type = 'button';
      el.setAttribute('data-cal-link', CAL_LINK);
      el.setAttribute('data-cal-config', '{"layout":"month_view"}');
      el.innerHTML = '<span class="d">' + days[wd] + '</span><span class="n">' + d.getDate() + '</span>';
      el.addEventListener('click', track);
      host.appendChild(el); added++;
    }
  }

  function build() {
    // Fill any inline booking cards on the page.
    document.querySelectorAll('.bc-dates').forEach(renderDates);

    // Inject the floating widget once.
    if (document.getElementById('tbwLaunch')) return;
    var w = document.createElement('div');
    w.innerHTML =
      '<button class="tbw-launch" id="tbwLaunch" type="button" aria-label="Book a call"><span class="pulse"></span><span>Book a 30-min call</span></button>' +
      '<div class="tbw-panel" id="tbwPanel" role="dialog" aria-label="Book a call">' +
        '<button class="tbw-x" id="tbwX" aria-label="Close">&times;</button>' +
        '<div class="book-card">' +
          '<div class="bc-title">Book your audit</div>' +
          '<div class="bc-sub">A 30-minute look at where your operation is leaking, and the first system we would build to fix it.</div>' +
          '<div class="bc-dates" id="tbwDates"></div>' +
          '<button class="btn btn-lime bc-btn" type="button" id="tbwBtn" data-cal-link="' + CAL_LINK + '" data-cal-config=\'{"layout":"month_view"}\'>Schedule my call</button>' +
          '<div class="bc-foot">Free &middot; No pitch &middot; 30 min</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(w);

    renderDates(document.getElementById('tbwDates'));
    var panel = document.getElementById('tbwPanel');
    var launch = document.getElementById('tbwLaunch');
    launch.addEventListener('click', function () { panel.classList.toggle('open'); launch.classList.toggle('hide'); });
    document.getElementById('tbwX').addEventListener('click', function () { panel.classList.remove('open'); launch.classList.remove('hide'); });
    document.getElementById('tbwBtn').addEventListener('click', track);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
