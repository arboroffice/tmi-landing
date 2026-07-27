/* TMI University inside the OS. Multi-page, authenticated, wired to the real
   curriculum engine (os2-university). The hub renders the member's standing and
   the interactive audit; each floor page renders its lessons and lets the member
   submit the artifact that gates the next floor. Shares the OS session token. */
(function () {
  'use strict';

  var TOKEN_KEY = 'tmios_token';
  var tok;
  try { tok = localStorage.getItem(TOKEN_KEY); } catch (e) {}
  if (!tok) { location.href = '/os/'; return; }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function signout() { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} location.href = '/os/'; }
  function toast(m) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = m; t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('on'); }, 3200);
  }
  async function api(path, body) {
    var r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(body || {}) });
    var j = await r.json().catch(function () { return {}; });
    if (r.status === 401) { signout(); throw new Error('signed out'); }
    if (!r.ok) throw new Error(j.error || 'Something went wrong');
    return j;
  }
  function paras(text) {
    return String(text || '').split(/\n\n+/).map(function (p) { return p.trim(); }).filter(Boolean).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
  }
  window._uniSignout = signout;

  var DATA = null;

  var STATUS_BADGE = {
    verified: '<span class="badge good">Verified</span>',
    submitted: '<span class="badge warn">In review</span>',
    returned: '<span class="badge warn">Sent back</span>',
    missing: '<span class="badge">Not built yet</span>',
  };

  // ---- HUB ----------------------------------------------------------------
  function renderHub() {
    var host = document.getElementById('uniHost');
    var s = DATA.standing || {};
    var latest = (DATA.scores && DATA.scores[0]) || s.score || null;
    var levels = DATA.levels || [];
    var lvl = levels.filter(function (l) { return l.level === s.level; })[0] || {};

    var tiles = '<div class="tiles">'
      + tile('Your level', 'Level ' + (s.level || 1) + ' <small>' + esc(s.level_name || '') + '</small>')
      + tile('Intelligence score', latest ? (latest.total + ' <small>/100</small>') : 'Not taken')
      + tile('Degree progress', (s.artifacts_verified || 0) + ' <small>/ ' + (s.artifacts_total || 0) + ' built</small>')
      + tile('Building now', esc(currentFloorTitle(s)))
      + '</div>';

    var hero = '<section class="uhero"><div class="wrap uhero-in">'
      + '<div class="ey">TMI University &middot; The Intelligent Company School</div>'
      + '<h1>' + (latest ? 'Here is where the company stands.' : 'Start with the audit.') + '</h1>'
      + '<p>' + (latest
        ? esc(s.level_blurb || 'Work the floors in order. Every lesson ends with one real thing built in the business.')
        : 'Answer eighteen honest questions. You get your intelligence score across six areas, the level you are really operating at, and the floor to start building on.') + '</p>'
      + tiles
      + '</div></section>';

    var assess = '<section class="sec"><div class="wrap">'
      + '<div class="sec-h"><div><span class="lbl">The audit</span><h2>' + (latest ? 'Rescore the company' : 'Take the assessment') + '</h2></div>'
      + (latest ? '<button class="btn ghost sm" onclick="_uniStartAssess()">Retake</button>' : '') + '</div>'
      + '<div id="assessMount">' + (latest ? assessTeaser(latest) : '') + '</div>'
      + '</div></section>';

    var floorsHtml = (s.floors || []).map(floorCard).join('');
    var floors = '<section class="sec" style="padding-top:8px"><div class="wrap">'
      + '<div class="sec-h"><div><span class="lbl">The curriculum</span><h2>Eight floors. Build them in order.</h2></div></div>'
      + '<div class="floors">' + floorsHtml + '</div>'
      + '<p class="sub" style="margin-top:18px">A floor opens when the floor below it is verified in your binder. That is the whole difference between this and a course.</p>'
      + '</div></section>';

    host.innerHTML = hero + assess + floors;
    if (!latest) _uniStartAssess();
  }

  function tile(k, v) { return '<div class="tile"><div class="k">' + esc(k) + '</div><div class="v">' + v + '</div></div>'; }
  function currentFloorTitle(s) {
    var f = (s.floors || []).filter(function (x) { return x.key === s.current_floor; })[0];
    return f ? shortTitle(f.title) : 'Orientation';
  }
  function shortTitle(t) { return String(t || '').replace(/^Floor \d+:\s*/, ''); }
  function assessTeaser(latest) {
    var bars = barsHtml(latest.areas || {});
    return '<div class="kcard"><div class="scorebig"><div class="n">' + latest.total + '</div><div class="of">/ 100</div></div>'
      + '<div class="bars">' + bars + '</div>'
      + '<p class="sub" style="margin-top:14px">Last scored ' + esc(fmtDate(latest.date)) + '. Rescore every thirty days and watch it move because the company changed.</p></div>';
  }
  function barsHtml(areas) {
    var labels = DATA.area_label || {};
    var keys = DATA.areas || Object.keys(labels);
    var lowest = null, lowVal = 99;
    keys.forEach(function (a) { var v = Number(areas[a] || 0); if (v < lowVal) { lowVal = v; lowest = a; } });
    return keys.map(function (a) {
      var v = Number(areas[a] || 0), pct = Math.round((v / 5) * 100);
      return '<div class="bar' + (a === lowest ? ' low' : '') + '"><div class="bl">' + esc(labels[a] || a) + '</div><div class="bt"><i style="width:' + pct + '%"></i></div><div class="bv">' + (Math.round(v * 10) / 10) + '</div></div>';
    }).join('');
  }
  function floorCard(f) {
    var locked = !f.unlocked;
    var pct = f.artifact_count ? Math.round((f.verified_count / f.artifact_count) * 100) : 100;
    var status = f.complete ? '<span class="badge good">Complete</span>' : locked ? '<span class="badge">Locked</span>' : '<span class="badge on">Open</span>';
    var n = f.key === 'orientation' ? 'Start here' : ('Floor ' + f.order);
    var inner = '<div class="fn"><span>' + esc(n) + '</span>' + status + '</div>'
      + '<h3>' + esc(shortTitle(f.title)) + '</h3>'
      + '<p>' + esc(f.subtitle) + '</p>'
      + '<div class="frow"><span class="lbl">' + f.verified_count + '/' + f.artifact_count + ' built</span><div class="mini"><i style="width:' + pct + '%"></i></div></div>';
    if (locked) return '<div class="fcard locked">' + inner + '</div>';
    return '<a class="fcard" href="/university/' + esc(f.key) + '">' + inner + '</a>';
  }
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return ''; } }

  // ---- ASSESSMENT (interactive audit) -------------------------------------
  var A = { ans: {}, step: 0, od: null };
  window._uniStartAssess = function () {
    A.ans = {}; A.step = 0; A.od = null;
    renderAssessStep();
    var m = document.getElementById('assessMount');
    if (m) m.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  function areaItems(area) { return (DATA.scorecard || []).filter(function (s) { return s.area === area; }); }
  function renderAssessStep() {
    var areas = DATA.areas || [];
    var labels = DATA.area_label || {};
    var area = areas[A.step];
    var items = areaItems(area);
    var html = '<div class="assess"><div class="pmeta"><span>Area ' + (A.step + 1) + ' of ' + areas.length + '</span><span id="pPct">' + Math.round((A.step / areas.length) * 100) + '%</span></div>'
      + '<div class="pbar"><i style="width:' + Math.round((A.step / areas.length) * 100) + '%"></i></div>'
      + '<div class="qgroup"><h3>' + esc(labels[area] || area) + '</h3></div>';
    items.forEach(function (it) {
      html += '<div class="q"><div class="qt">' + esc(it.q) + '</div><div class="opts">';
      [5, 3, 1].forEach(function (v) {
        var on = A.ans[it.id] === v ? ' on' : '';
        html += '<div class="opt' + on + '" role="button" tabindex="0" data-q="' + it.id + '" data-v="' + v + '"><span class="dot"></span><span>' + esc(it.a[v]) + '</span></div>';
      });
      html += '</div></div>';
    });
    var last = A.step === areas.length - 1;
    if (last) {
      html += '<div class="odwrap"><div class="qt">One more, optional. What percent of decisions still route through you?</div>'
        + '<input id="odRange" type="range" min="0" max="100" step="5" value="' + (A.od == null ? 50 : A.od) + '"/>'
        + '<div class="pmeta" style="margin-top:6px"><span>All the team</span><span id="odVal">' + (A.od == null ? '50' : A.od) + '%</span><span>All you</span></div></div>';
    }
    html += '<div class="arow"><button class="btn ghost sm" id="aBack" ' + (A.step === 0 ? 'style="visibility:hidden"' : '') + '>&larr; Back</button>'
      + '<span class="muted" id="aNote"></span>'
      + '<button class="btn dark sm" id="aNext">' + (last ? 'See my score →' : 'Next →') + '</button></div></div>';
    var m = document.getElementById('assessMount');
    m.innerHTML = html;
    // wire
    m.querySelectorAll('.opt').forEach(function (el) {
      el.addEventListener('click', function () {
        var q = el.getAttribute('data-q'), v = Number(el.getAttribute('data-v'));
        A.ans[q] = v;
        el.parentNode.querySelectorAll('.opt').forEach(function (o) { o.classList.remove('on'); });
        el.classList.add('on');
        updateNote();
      });
    });
    var od = document.getElementById('odRange');
    if (od) od.addEventListener('input', function () { A.od = Number(od.value); document.getElementById('odVal').textContent = od.value + '%'; });
    document.getElementById('aNext').addEventListener('click', nextStep);
    var back = document.getElementById('aBack'); if (back) back.addEventListener('click', prevStep);
    updateNote();
  }
  function updateNote() {
    var area = (DATA.areas || [])[A.step], items = areaItems(area);
    var done = items.filter(function (it) { return A.ans[it.id]; }).length;
    var n = document.getElementById('aNote'); if (n) n.textContent = done + ' of ' + items.length + ' answered';
  }
  function nextStep() {
    var areas = DATA.areas || [];
    var area = areas[A.step], items = areaItems(area);
    if (items.some(function (it) { return !A.ans[it.id]; })) { var n = document.getElementById('aNote'); if (n) n.textContent = 'Answer all ' + items.length + ' to continue'; return; }
    if (A.step < areas.length - 1) { A.step++; renderAssessStep(); document.getElementById('assessMount').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else submitAssess();
  }
  function prevStep() { if (A.step > 0) { A.step--; renderAssessStep(); document.getElementById('assessMount').scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
  async function submitAssess() {
    var btn = document.getElementById('aNext'); if (btn) { btn.disabled = true; btn.textContent = 'Scoring...'; }
    try {
      var body = { action: 'assess', answers: A.ans };
      if (A.od != null) body.owner_dependency = A.od;
      var j = await api('/api/os2-university', body);
      toast('Scored ' + j.score.total + '/100. Level ' + j.score.level + '.');
      DATA = await api('/api/os2-university', { action: 'state' });
      renderHub();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { if (e.message !== 'signed out') toast(e.message); if (btn) { btn.disabled = false; btn.textContent = 'See my score →'; } }
  }

  // ---- FLOOR PAGE ---------------------------------------------------------
  function renderFloor(key) {
    var host = document.getElementById('uniHost');
    var floor = (DATA.curriculum || []).filter(function (f) { return f.key === key; })[0];
    var standingFloor = ((DATA.standing || {}).floors || []).filter(function (f) { return f.key === key; })[0] || {};
    if (!floor) { host.innerHTML = '<section class="sec"><div class="wrap"><div class="empty"><p>That floor was not found.</p><p style="margin-top:10px"><a class="link" href="/university">Back to University</a></p></div></div></section>'; return; }

    var artByKey = {};
    (DATA.artifacts || []).forEach(function (a) { artByKey[a.key] = a; });

    var floors = (DATA.standing || {}).floors || [];
    var idx = floors.map(function (f) { return f.key; }).indexOf(key);
    var prev = idx > 0 ? floors[idx - 1] : null;
    var next = idx >= 0 && idx < floors.length - 1 ? floors[idx + 1] : null;
    var n = key === 'orientation' ? 'Start here' : ('Floor ' + floor.order);

    var hero = '<section class="uhero"><div class="wrap uhero-in">'
      + '<a href="/university" class="uback">&larr; TMI University</a>'
      + '<div class="ey">' + esc(n) + '</div>'
      + '<h1>' + esc(shortTitle(floor.title)) + '</h1>'
      + '<p>' + esc(floor.subtitle) + '</p></div></section>';

    var locked = standingFloor.unlocked === false;
    var body = '<section class="sec"><div class="wrap">';
    if (locked && prev) body += '<div class="lockbanner">Finish ' + esc(shortTitle(prev.title)) + ' first. This floor opens when its binder is verified. You can still read ahead.</div>';

    floor.lessons.forEach(function (l) {
      var art = l.artifact ? artByKey[l.artifact.key] : null;
      var status = art ? art.status : 'missing';
      body += '<div class="lesson"><div class="lid">Lesson ' + esc(l.id) + '</div><h2>' + esc(l.title) + '</h2>'
        + '<p class="open">' + esc(l.cold_open) + '</p>';
      if (l.teach) body += '<div class="teach">' + paras(l.teach) + '</div>';
      if (l.example) body += '<div class="callout"><span class="k">For example</span>' + esc(l.example) + '</div>';
      body += '<div class="doblock"><div class="k">Do this</div><p>' + esc(l.step) + '</p></div>';
      if (l.artifact) {
        var content = art && art.content ? art.content : '';
        var review = art && art.status === 'returned' && art.review_note ? '<div class="review"><b>Sent back:</b> ' + esc(art.review_note) + '</div>' : '';
        body += '<div class="artbox" data-key="' + esc(l.artifact.key) + '">'
          + '<div class="ah"><span class="al">Build: ' + esc(l.artifact.label) + '</span>' + (STATUS_BADGE[status] || STATUS_BADGE.missing) + '</div>'
          + review
          + '<textarea placeholder="Paste or describe what you built. A link, the numbers, the document.">' + esc(content) + '</textarea>'
          + '<div class="ar"><span class="muted lbl">' + (status === 'verified' ? 'Verified in your binder' : 'Saved to your binder as In review') + '</span>'
          + '<button class="btn sm" data-submit="' + esc(l.artifact.key) + '">' + (art ? 'Update' : 'Submit') + '</button></div>'
          + '</div>';
      }
      body += '</div>';
    });

    body += '<div class="fpnav">'
      + (prev ? '<a href="/university/' + esc(prev.key) + '"><div class="d">&larr; Previous</div><div class="t">' + esc(shortTitle(prev.title)) + '</div></a>'
        : '<a href="/university"><div class="d">&larr; Back</div><div class="t">All floors</div></a>')
      + (next ? '<a class="next" href="/university/' + esc(next.key) + '"><div class="d">Next &rarr;</div><div class="t">' + esc(shortTitle(next.title)) + '</div></a>'
        : '<a class="next" href="/app"><div class="d">Next &rarr;</div><div class="t">Back to the OS</div></a>')
      + '</div>';

    body += '</div></section>';
    host.innerHTML = hero + body;

    host.querySelectorAll('[data-submit]').forEach(function (btn) {
      btn.addEventListener('click', function () { submitArtifact(btn.getAttribute('data-submit'), btn); });
    });
  }

  async function submitArtifact(key, btn) {
    var box = btn.closest('.artbox');
    var ta = box.querySelector('textarea');
    var content = (ta && ta.value || '').trim();
    if (!content) { toast('Add what you built before submitting.'); return; }
    btn.disabled = true; var old = btn.textContent; btn.textContent = 'Saving...';
    try {
      await api('/api/os2-university', { action: 'submit', artifact_key: key, content: content });
      toast('Saved to your binder. It shows as In review until it is verified.');
      DATA = await api('/api/os2-university', { action: 'state' });
      renderFloor(window.UNI_FLOOR);
    } catch (e) { if (e.message !== 'signed out') toast(e.message); btn.disabled = false; btn.textContent = old; }
  }

  // ---- BOOT ---------------------------------------------------------------
  async function boot() {
    var host = document.getElementById('uniHost');
    try {
      DATA = await api('/api/os2-university', { action: 'state' });
    } catch (e) {
      if (e.message === 'signed out') return;
      // Not enrolled yet: enroll then load.
      try { await api('/api/os2-university', { action: 'enroll' }); DATA = await api('/api/os2-university', { action: 'state' }); }
      catch (e2) { if (host) host.innerHTML = '<section class="sec"><div class="wrap"><div class="empty"><p>Could not load University. Try again in a moment.</p></div></div></section>'; return; }
    }
    if (window.UNI_PAGE === 'floor') renderFloor(window.UNI_FLOOR);
    else renderHub();
  }
  boot();
})();
