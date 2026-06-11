// Global signup, injected site-wide: one form that subscribes to Founders of the
// Future, with an opt-in for The Brief (daily) and a required terms agreement.
// Feeds /api/subscribe with a `sources` array. Self-skips on admin/embed/news pages
// and any page that opts out via [data-no-footer-signup] or its own #newsletter-form.
(function () {
  if (window.__tmiFooterSignup) return;
  window.__tmiFooterSignup = true;

  function start() {
    var path = location.pathname.toLowerCase();
    if (/(^|\/)admin/.test(path) || /founders-embed|proposal-sign|\/news\b|news\.html/.test(path)) return;
    if (document.getElementById('newsletter-form')) return;
    if (document.body && document.body.hasAttribute('data-no-footer-signup')) return;
    if (document.getElementById('tmi-fsignup')) return;

    var css = '\
.tmi-fsignup{background:#0a0b14;color:#fff;font-family:"Barlow",system-ui,-apple-system,sans-serif;padding:56px 24px;border-top:1px solid rgba(255,255,255,0.08);}\
.tmi-fsignup .in{max-width:560px;margin:0 auto;}\
.tmi-fsignup .tag{font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#E4FF97;margin:0 0 10px;}\
.tmi-fsignup h3{font-size:24px;font-weight:800;letter-spacing:-0.01em;margin:0 0 6px;color:#fff;}\
.tmi-fsignup .sub{font-size:14px;color:rgba(255,255,255,0.55);line-height:1.5;margin:0 0 20px;}\
.tmi-fsignup .row{display:flex;gap:8px;flex-wrap:wrap;}\
.tmi-fsignup input[type=email]{flex:1;min-width:200px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.16);color:#fff;padding:12px 14px;border-radius:9px;font:inherit;font-size:14px;outline:none;}\
.tmi-fsignup input[type=email]::placeholder{color:rgba(255,255,255,0.35);}\
.tmi-fsignup input[type=email]:focus{border-color:#E4FF97;}\
.tmi-fsignup button{background:#E4FF97;color:#0a0b14;border:none;font:inherit;font-weight:700;font-size:13px;padding:12px 22px;border-radius:9px;cursor:pointer;white-space:nowrap;transition:background .15s;}\
.tmi-fsignup button:hover{background:#D0FF6A;}\
.tmi-fsignup button:disabled{opacity:.6;cursor:not-allowed;}\
.tmi-fsignup .opt{display:flex;align-items:flex-start;gap:9px;margin:14px 0 0;font-size:13px;color:rgba(255,255,255,0.6);line-height:1.45;cursor:pointer;}\
.tmi-fsignup .opt input{margin:2px 0 0;accent-color:#E4FF97;width:15px;height:15px;flex:none;}\
.tmi-fsignup .opt b{color:rgba(255,255,255,0.85);font-weight:700;}\
.tmi-fsignup .opt a{color:#E4FF97;text-decoration:underline;}\
.tmi-fsignup .err{font-size:12px;color:#ff8585;margin:12px 0 0;display:none;}\
.tmi-fsignup .ok{font-size:15px;color:#E4FF97;font-weight:600;}\
.tmi-fsignup .nt{font-size:11px;color:rgba(255,255,255,0.35);margin:14px 0 0;}';
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var sec = document.createElement('section');
    sec.className = 'tmi-fsignup';
    sec.id = 'tmi-fsignup';
    sec.innerHTML = '<div class="in">\
<div class="tag">Newsletter</div>\
<h3>Join Founders of the Future</h3>\
<p class="sub">Sharp dispatches for owners and builders. Zero AI hype.</p>\
<form id="tmi-fs-form">\
<div class="row"><input type="email" required placeholder="you@company.com"/><button type="submit">Sign up</button></div>\
<label class="opt"><input type="checkbox" name="brief" checked/> <span>Also send me <b>The Brief</b>: a custom daily AI briefing, tuned to your job, your business, and your tech stack.</span></label>\
<label class="opt"><input type="checkbox" name="terms"/> <span>I agree to the <a href="/terms" target="_blank" rel="noopener">terms</a>.</span></label>\
<div class="err" id="tmi-fs-err">Please agree to the terms to continue.</div>\
</form>\
<p class="nt">No spam &middot; unsubscribe anytime</p>\
</div>';

    var footer = document.querySelector('footer');
    if (footer && footer.parentNode) footer.parentNode.insertBefore(sec, footer);
    else document.body.appendChild(sec);

    sec.addEventListener('submit', function (e) {
      e.preventDefault();
      var form = document.getElementById('tmi-fs-form');
      if (!form) return;
      var input = form.querySelector('input[type=email]');
      var brief = form.querySelector('input[name=brief]');
      var terms = form.querySelector('input[name=terms]');
      var btn = form.querySelector('button');
      var err = document.getElementById('tmi-fs-err');
      var email = (input.value || '').trim();
      err.style.display = 'none';
      if (!email || email.indexOf('@') < 0) { input.focus(); return; }
      if (!terms.checked) { err.style.display = 'block'; return; }
      btn.disabled = true; btn.textContent = '...';
      // The Brief is a separate service (external waitlist) — fire-and-forget opt-in.
      if (brief.checked) {
        try { fetch('https://thebrief.foundersotf.com/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email }) }); } catch (_) {}
      }
      fetch('/api/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, source: 'founders-of-the-future' })
      }).then(function (r) {
        if (!r.ok) throw new Error('failed');
        try { if (typeof fbq === 'function') fbq('track', 'Lead', { content_name: 'Founders of the Future' + (brief.checked ? ' + The Brief' : '') }); } catch (_) {}
        sec.querySelector('.in').innerHTML = '<div class="ok">You\'re in. Check your inbox' + (brief.checked ? ' &mdash; The Brief lands tomorrow morning.' : '.') + '</div>';
      }).catch(function () { btn.disabled = false; btn.textContent = 'Sign up'; alert('Something went wrong. Please try again.'); });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
