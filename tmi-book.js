/* TMI booking card - inline scheduler. Renders the next weekdays as a date strip
   and opens the Cal.com booking on click. Any page with a .bc-dates element and
   the Cal link gets it. Not a chat; one clean card, one action. */
(function () {
  var CAL_LINK = 'mia-elianaa-a4n2hk/30min';

  // Cal.com embed bootstrap (binds any element with data-cal-link, including ones we add).
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

  function render() {
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    document.querySelectorAll('.bc-dates').forEach(function (host) {
      if (host.dataset.filled) return;
      host.dataset.filled = '1';
      var d = new Date();
      var added = 0;
      while (added < 5) {
        d.setDate(d.getDate() + 1);
        var wd = d.getDay();
        if (wd === 0 || wd === 6) continue; // weekdays only
        var el = document.createElement('button');
        el.className = 'bc-date';
        el.type = 'button';
        el.setAttribute('data-cal-link', CAL_LINK);
        el.setAttribute('data-cal-config', '{"layout":"month_view"}');
        el.innerHTML = '<span class="d">' + days[wd] + '</span><span class="n">' + d.getDate() + '</span>';
        el.addEventListener('click', track);
        host.appendChild(el);
        added++;
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
