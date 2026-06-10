// Global footer email signups: The Brief (daily) + Founders of the Future (monthly).
// Injected site-wide. Self-skips on the admin portal, the embed/sign pages, and any
// page that already has its own newsletter form (e.g. the Founders of the Future page),
// so the signups never double up. Both feed /api/subscribe with a distinct source tag.
(function () {
  if (window.__tmiFooterSignup) return;
  window.__tmiFooterSignup = true;

  function start() {
    var path = location.pathname.toLowerCase();
    // Skip: admin portal, embed form, proposal signing, and the dedicated Founders page.
    if (/(^|\/)admin/.test(path) || /founders-embed|proposal-sign|\/news\b|news\.html/.test(path)) return;
    // Skip if a page already shows its own newsletter signup, or opts out.
    if (document.getElementById('newsletter-form')) return;
    if (document.body && document.body.hasAttribute('data-no-footer-signup')) return;
    if (document.getElementById('tmi-fsignup')) return;

    var css = '\
.tmi-fsignup{background:#0a0b14;color:#fff;font-family:"Barlow",system-ui,-apple-system,sans-serif;padding:56px 24px;border-top:1px solid rgba(255,255,255,0.08);}\
.tmi-fsignup .in{max-width:1080px;margin:0 auto;}\
.tmi-fsignup .hd{font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin:0 0 20px;}\
.tmi-fsignup .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;}\
.tmi-fsignup .c{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:24px;}\
.tmi-fsignup .c h3{font-size:20px;font-weight:800;letter-spacing:-0.01em;margin:0 0 4px;color:#fff;}\
.tmi-fsignup .c .tag{font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#E4FF97;margin:0 0 10px;}\
.tmi-fsignup .c p{font-size:13px;color:rgba(255,255,255,0.55);line-height:1.5;margin:0 0 16px;}\
.tmi-fsignup form{display:flex;gap:8px;flex-wrap:wrap;}\
.tmi-fsignup input{flex:1;min-width:160px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.16);color:#fff;padding:11px 14px;border-radius:9px;font:inherit;font-size:14px;outline:none;}\
.tmi-fsignup input::placeholder{color:rgba(255,255,255,0.35);}\
.tmi-fsignup input:focus{border-color:#E4FF97;}\
.tmi-fsignup button{background:#E4FF97;color:#0a0b14;border:none;font:inherit;font-weight:700;font-size:13px;padding:11px 20px;border-radius:9px;cursor:pointer;white-space:nowrap;transition:background .15s;}\
.tmi-fsignup button:hover{background:#D0FF6A;}\
.tmi-fsignup button:disabled{opacity:.6;cursor:not-allowed;}\
.tmi-fsignup .ok{font-size:14px;color:#E4FF97;font-weight:600;}\
.tmi-fsignup .nt{font-size:11px;color:rgba(255,255,255,0.35);margin:10px 0 0;}\
@media(max-width:640px){.tmi-fsignup .grid{grid-template-columns:1fr;}}';
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var card = function (tag, title, desc, src, ph) {
      return '<div class="c">\
<div class="tag">' + tag + '</div>\
<h3>' + title + '</h3>\
<p>' + desc + '</p>\
<form data-src="' + src + '"><input type="email" required placeholder="' + ph + '"/><button type="submit">Subscribe</button></form>\
<p class="nt">No spam &middot; unsubscribe anytime</p>\
</div>';
    };

    var sec = document.createElement('section');
    sec.className = 'tmi-fsignup';
    sec.id = 'tmi-fsignup';
    sec.innerHTML = '<div class="in"><div class="grid">' +
      card('Daily', 'The Brief', 'A short daily read on building a company that runs on systems. Two minutes, every morning.', 'the-brief', 'you@company.com') +
      card('Community', 'Founders of the Future', 'The community we are building at TMI. Long reads and sharp dispatches for owners and the founders of the future. Zero AI hype.', 'founders-of-the-future', 'you@company.com') +
      '</div></div>';

    var footer = document.querySelector('footer');
    if (footer && footer.parentNode) footer.parentNode.insertBefore(sec, footer);
    else document.body.appendChild(sec);

    sec.addEventListener('submit', function (e) {
      var form = e.target.closest('form');
      if (!form) return;
      e.preventDefault();
      var input = form.querySelector('input');
      var btn = form.querySelector('button');
      var email = (input.value || '').trim();
      if (!email || email.indexOf('@') < 0) return;
      btn.disabled = true; btn.textContent = '...';
      fetch('/api/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, source: form.getAttribute('data-src') })
      }).then(function (r) {
        if (!r.ok) throw new Error('failed');
        try { if (typeof fbq === 'function') fbq('track', 'Lead', { content_name: 'Newsletter: ' + form.getAttribute('data-src') }); } catch (_) {}
        form.outerHTML = '<div class="ok">You\'re in. Check your inbox.</div>';
      }).catch(function () { btn.disabled = false; btn.textContent = 'Subscribe'; alert('Something went wrong. Please try again.'); });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
