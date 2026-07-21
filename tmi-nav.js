/* TMI nested Industries nav: Industries -> Physical / Online -> all industries.
   Holds the industry data once and enhances the nav on any page that has a
   side-nav drawer (#side-nav), a mobile drawer (#drawer), or a desktop nav
   (.nav-links). Safe no-op if none are present. */
(function(){
  var PHYS=[["medical","Medical"],["health","Health & Wellness"],["hvac","HVAC"],["roofing","Roofing"],["construction","Construction"],["plumbing","Plumbing"],["electrical","Electrical"],["concrete","Concrete"],["painting","Painting"],["pest-control","Pest Control"],["restoration","Restoration"],["home-service","Home Service"],["landscaping","Landscaping"],["irrigation-companies","Irrigation Companies"],["land-clearing","Land Clearing"],["storm-cleanup-contractors","Storm Cleanup"],["freight-brokers","Freight Brokers"],["trucking-companies","Trucking Companies"],["hotshot-trucking","Hotshot Trucking"],["last-mile-delivery","Last-Mile Delivery"],["courier-fleets","Courier Fleets"],["3pl","3PL"],["warehousing","Warehousing"],["container-transport","Container Transport"],["refrigerated-transport","Refrigerated Transport"],["heavy-haul","Heavy Haul"],["equipment-transport","Equipment Transport"],["freight-forwarding","Freight Forwarding"],["dispatch-companies","Dispatch Companies"],["industrial-courier-services","Industrial Courier"],["debris-hauling-companies","Debris Hauling"],["crew-transportation-companies","Crew Transportation"],["personnel-transportation","Personnel Transport"],["sand-hauling","Sand Hauling"],["oil-gas","Oil & Gas"],["wireline","Wireline"],["frac-crews","Frac Crews"],["coiled-tubing","Coiled Tubing"],["flowback","Flowback"],["roustabout-companies","Roustabout Companies"],["vacuum-truck-services","Vacuum Truck Services"],["oilfield-hauling","Oilfield Hauling"],["mud-logging","Mud Logging"],["snubbing-services","Snubbing Services"],["rig-moving","Rig Moving"],["pipe-yards","Pipe Yards"],["pipe-inspection-companies","Pipe Inspection"],["fuel-delivery","Fuel Delivery"],["fuel-lubricant-distributors","Fuel & Lubricant Distributors"],["tank-cleaning","Tank Cleaning"],["water-hauling","Water Hauling"],["water-transfer","Water Transfer"],["safety-compliance-companies","Safety & Compliance"],["safety-training-companies","Safety Training"],["welding-gas-distributors","Welding Gas Distributors"],["welding-supply","Welding Supply"],["manufacturing","Manufacturing"],["mining","Mining"],["heavy-machinery","Heavy Machinery"],["crane-services","Crane Services"],["equipment-rental","Equipment Rental"],["utilities","Utilities"],["heavy-equipment-repair","Heavy Equipment Repair"],["heavy-equipment-yards","Heavy Equipment Yards"],["equipment-dealers","Equipment Dealers"],["equipment-dealerships","Equipment Dealerships"],["forklift-services","Forklift Services"],["diesel-mechanics","Diesel Mechanics"],["diesel-shops","Diesel Shops"],["fleet","Fleet Operations"],["auto-repair","Auto Repair"],["fleet-repair","Fleet Repair"],["mobile-mechanic-fleets","Mobile Mechanic Fleets"],["body-shops","Body Shops"],["tire-shops","Tire Shops"],["rv-repair","RV Repair"],["boat-repair","Boat Repair"],["tugboat-operators","Tugboat Operators"],["barge-companies","Barge Companies"],["offshore-support-vessels","Offshore Support Vessels"],["offshore-crew-logistics","Offshore Crew Logistics"],["offshore-logistics","Offshore Logistics"],["offshore-staffing","Offshore Staffing"],["marine-logistics","Marine Logistics"],["marine-service-yards","Marine Service Yards"],["marine-supply-companies","Marine Supply"],["marine-transportation","Marine Transportation"],["shipyards","Shipyards"],["dock-operations","Dock Operations"],["harbor-services","Harbor Services"],["crane-barges","Crane Barges"],["port-logistics","Port Logistics"],["vessel-maintenance","Vessel Maintenance"],["property-management","Property Management"],["facilities-management","Facilities Management"],["real-estate","Real Estate Teams"],["hoa-management","HOA Management"],["apartment-maintenance","Apartment Maintenance"],["commercial-maintenance","Commercial Maintenance"],["vacation-rentals","Vacation Rentals"],["agriculture","Agriculture"],["farms","Farms"],["ranches","Ranches"],["forestry","Forestry"],["nurseries","Nurseries"],["feed-stores","Feed Stores"],["portable-toilet-companies","Portable Toilet Companies"],["roll-off-dumpster-fleets","Roll-Off Dumpster Fleets"],["environmental-cleanup","Environmental Cleanup"],["industrial-cleaning","Industrial Cleaning"],["industrial-laundry","Industrial Laundry"],["inspection-companies","Inspection Companies"],["industrial-catering","Industrial Catering"],["industrial-supply-distributors","Industrial Supply"],["temporary-fencing","Temporary Fencing"],["industrial-staffing","Industrial Staffing"],["field-labor-coordinators","Field Labor Coordinators"],["crane-dispatch-offices","Crane Dispatch"],["healthcare","Healthcare"],["dental","Dental"],["fitness","Fitness"],["legal","Legal"],["chiropractic-clinics","Chiropractic Clinics"],["physical-therapy","Physical Therapy"],["therapy-practices","Therapy Practices"],["vet-clinics","Vet Clinics"],["vet-supply","Vet Supply"],["home-health-agencies","Home Health Agencies"],["appliance-repair","Appliance Repair"],["pool-service","Pool Service"],["pressure-washing","Pressure Washing"],["moving-companies","Moving Companies"],["towing-companies","Towing Companies"],["glass-repair","Glass & Window Repair"],["locksmith-companies","Locksmith Companies"],["janitorial-services","Janitorial Services"],["garage-door-service","Garage Door Service"],["fence-contractors","Fence Contractors"],["flooring-contractors","Flooring Contractors"],["drywall-contractors","Drywall Contractors"],["solar-installation","Solar Installation"],["security-systems","Security Systems"],["generator-service","Generator Service"],["fire-sprinkler","Fire Sprinkler & Safety"],["elevator-service","Elevator Service"]];
  var ONL=[["health","Health & Wellness"],["medical","Telehealth & Medical"],["ecom","Ecommerce Brands"],["saas","SaaS Companies"],["agencies","Agencies"],["coaches","Coaches"],["courses","Course Sellers"],["creators","Creators"],["newsletters","Newsletters"],["personal-branding","Personal Brands"],["freelancers","Freelancers"],["info","Info Products"]];

  if(document.getElementById('tmi-nav-css')==null){
    var st=document.createElement('style'); st.id='tmi-nav-css';
    st.textContent=
    ".tmi-ind-l1,.tmi-ind-l2{display:flex;align-items:center;justify-content:space-between;width:100%;background:none;border:none;text-align:left;font:inherit;color:inherit;cursor:pointer;padding:0;}"+
    ".tmi-ind-l1{margin:0;}"+
    ".tmi-ind-ct{font-size:1.1em;line-height:1;opacity:.55;font-weight:400;transition:transform .2s;}"+
    ".tmi-ind-l1.open .tmi-ind-ct,.tmi-ind-l2.open .tmi-ind-ct{transform:rotate(45deg);}"+
    ".tmi-ind-box{display:none;}"+
    ".tmi-ind-grp{margin:6px 0;}"+
    ".tmi-ind-l2{font-size:.92em;font-weight:600;opacity:.9;padding:6px 0;}"+
    ".tmi-ind-list{display:none;max-height:42vh;overflow-y:auto;margin:2px 0 8px;padding-left:12px;border-left:1px solid rgba(127,127,127,.25);}"+
    ".tmi-ind-list a{display:block;padding:6px 0;font-size:.86em;opacity:.78;}"+
    ".tmi-ind-list a:hover{opacity:1;}"+
    ".tmi-ind-list a.tmi-all{font-weight:600;opacity:1;}"+
    /* desktop dropdown */
    ".tmi-dd{position:relative;display:inline-block;}"+
    ".tmi-dd-btn{background:none;border:none;font:inherit;color:inherit;cursor:pointer;padding:6px 12px;border-radius:6px;text-transform:uppercase;letter-spacing:.02em;}"+
    ".tmi-dd-btn:hover{background:rgba(0,0,0,.05);}"+
    /* inside the main header the trigger must match .nav-links a exactly */
    ".nav-links .tmi-dd{display:inline-flex;align-items:center;}"+
    ".nav-links .tmi-dd-btn{font-family:var(--sans,inherit);font-size:12.5px;font-weight:600;letter-spacing:0.08em;color:var(--ink-2,#505060);padding:0;border-radius:0;transition:color .15s;}"+
    ".nav-links .tmi-dd-btn:hover{background:none;color:var(--ink,#1a1a1a);}"+
    /* article header: match the injected trigger to .ah-nav a in the top-bar range */
    ".ah-nav .tmi-dd-btn{font-family:var(--sans,inherit);font-size:13px;font-weight:400;letter-spacing:0;text-transform:none;color:var(--ink-2,#505060);padding:6px 12px;border-radius:6px;}"+
    ".ah-nav .tmi-dd-btn:hover{color:var(--ink,#1a1a1a);background:var(--bg-alt,#f5f5f7);}"+
    /* article pages: on desktop the reading top bar becomes the site side rail */
    "@media(min-width:1024px){"+
      "body:has(.article-header){padding-left:248px;}"+
      ".article-header{left:0;top:0;bottom:0;right:auto;width:248px;height:auto;border-bottom:none;border-right:1px solid rgba(0,0,0,0.08);background:#fff;backdrop-filter:none;-webkit-backdrop-filter:none;}"+
      ".article-header-inner{max-width:none;height:100%;flex-direction:column;align-items:stretch;gap:0;padding:26px 16px 22px;}"+
      ".ah-brand{flex:none;padding:0 10px 20px;border-bottom:1px solid rgba(0,0,0,0.08);}"+
      ".ah-nav{flex-direction:column;align-items:stretch;gap:2px;margin-top:14px;flex:1;overflow-y:auto;}"+
      ".ah-nav a{font-size:14px;font-weight:600;letter-spacing:-0.01em;color:var(--ink-2,#505060);padding:10px 12px;border-radius:8px;}"+
      ".ah-nav a:hover{color:var(--ink,#1a1a1a);background:var(--bg-alt,#f5f5f7);}"+
      ".ah-cta{margin-top:16px;text-align:center;}"+
      ".article-header .tmi-dd{display:block;}"+
      ".article-header .tmi-dd-btn{width:100%;display:flex;align-items:center;justify-content:space-between;font-size:14px;font-weight:600;letter-spacing:-0.01em;text-transform:none;padding:10px 12px;border-radius:8px;}"+
      ".article-header .tmi-dd-btn:after{content:'+';font-size:15px;opacity:.5;}"+
      ".article-header .tmi-dd.open .tmi-dd-btn:after{content:'\\2212';}"+
      ".article-header .tmi-dd-panel{position:static;transform:none;width:auto;max-width:none;border:none;box-shadow:none;border-radius:0;padding:2px 0 8px 12px;}"+
    "}"+
    /* collapsible desktop rail: a floating toggle hides/shows the side nav */
    "@media(min-width:1024px){"+
      "#railTgl{position:fixed;top:18px;left:calc(var(--railw,248px) - 52px);z-index:600;width:38px;height:38px;border-radius:9px;background:#fff;border:1px solid rgba(0,0,0,0.12);cursor:pointer;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:4px;box-shadow:0 4px 16px rgba(0,0,0,0.07);transition:left .28s ease;}"+
      "#railTgl span{width:16px;height:2px;background:#0a0b14;border-radius:2px;display:block;}"+
      "#railTgl:hover{border-color:rgba(0,0,0,0.3);}"+
      "html.rail-collapsed #railTgl{left:14px;box-shadow:0 6px 22px rgba(0,0,0,0.14);}"+
      "header.nav,.article-header,aside.rail,.side-nav{transition:transform .28s ease;}"+
      "body{transition:padding-left .28s ease;}"+
      "html.rail-collapsed header.nav,html.rail-collapsed .article-header,html.rail-collapsed aside.rail,html.rail-collapsed .side-nav{transform:translateX(-100%);}"+
      "html.rail-collapsed body{padding-left:0 !important;}"+
    "}"+
    "@media(max-width:1023.98px){#railTgl{display:none;}}"+
    /* in the desktop side rail the dropdown becomes an inline accordion */
    "@media(min-width:1024px){"+
      ".nav .nav-links .tmi-dd{display:block;}"+
      ".nav .nav-links .tmi-dd-btn{width:100%;display:flex;align-items:center;justify-content:space-between;font-size:14px;font-weight:600;letter-spacing:-0.01em;text-transform:none;padding:10px 12px;border-radius:8px;}"+
      ".nav .nav-links .tmi-dd-btn:hover{background:var(--bg-alt,#f5f5f7);color:var(--ink,#1a1a1a);}"+
      ".nav .nav-links .tmi-dd-btn:after{content:'+';font-size:15px;opacity:.5;}"+
      ".nav .nav-links .tmi-dd.open .tmi-dd-btn:after{content:'\\2212';}"+
      ".nav .nav-links .tmi-dd-panel{position:static;transform:none;width:auto;max-width:none;border:none;box-shadow:none;border-radius:0;padding:2px 0 8px 12px;}"+
    "}"+
    ".tmi-dd-panel{position:absolute;top:calc(100% + 10px);left:50%;transform:translateX(-50%);width:300px;max-width:88vw;background:#fff;border:1px solid rgba(0,0,0,.1);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.16);padding:16px 18px;display:none;z-index:200;}"+
    ".tmi-dd.open .tmi-dd-panel{display:block;}"+
    ".tmi-dd-panel .tmi-ind-box{display:block;}"+
    ".tmi-dd-panel .tmi-ind-l2{color:#0a0b14;}"+
    ".tmi-dd-panel .tmi-ind-list a{color:#0a0b14;}"+
    ".side-nav .tmi-ind{margin:0;}"+
    ".side-nav .tmi-ind-l1{padding:10px 12px;font-size:14px;font-weight:600;color:var(--ink,#1a1a1a);border-radius:8px;}"+
    ".side-nav .tmi-ind-l1:hover{background:var(--bg-alt,#f5f5f7);}"+
    ".side-nav .tmi-ind-box{padding:0;}"+
    ".side-nav .tmi-ind-grp{margin:0;}"+
    ".side-nav .tmi-ind-l2{padding:9px 12px 9px 24px;font-size:13.5px;font-weight:600;color:var(--ink-2,#505060);border-radius:8px;}"+
    ".side-nav .tmi-ind-l2:hover{background:var(--bg-alt,#f5f5f7);}"+
    ".side-nav .tmi-ind-list{padding-left:32px;border-left:none;max-height:38vh;}"+
    ".side-nav .tmi-ind-list a{padding:8px 12px;font-size:13px;}"+
    /* mobile drawer: the injected Industries toggle must match the big drawer links */
    ".drawer .tmi-ind-l1{font-family:var(--sans,inherit);font-size:28px;font-weight:700;letter-spacing:-0.02em;color:var(--ink,#0a0b14);padding:14px 0;border-bottom:1px solid var(--line,rgba(0,0,0,0.08));}"+
    ".drawer .tmi-ind-l1 .tmi-ind-ct{font-size:0.7em;}"+
    ".drawer .tmi-ind-box{padding:2px 0 6px;}"+
    ".drawer .tmi-ind-l2{font-size:18px;font-weight:700;color:var(--ink,#0a0b14);padding:10px 0 6px;}"+
    ".drawer .tmi-ind-list{padding-left:14px;border-left:1px solid var(--line,rgba(0,0,0,0.1));max-height:44vh;}"+
    ".drawer .tmi-ind-list a{font-size:15px;font-weight:500;padding:8px 0;border-bottom:none;}";
    document.head.appendChild(st);
  }

  function mk(tag,cls,html){var e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e;}
  function caret(){return '<span class="tmi-ind-ct">+</span>';}

  function buildList(items,base){
    var l=mk('div','tmi-ind-list');
    var all=mk('a','tmi-all','View all '+(base==='physical'?'physical':'online')+' &rarr;'); all.href='/'+base;
    l.appendChild(all);
    items.forEach(function(it){var a=mk('a',null,it[1]);a.href='/'+base+'/'+it[0];l.appendChild(a);});
    return l;
  }
  function buildGroup(label,items,base){
    var g=mk('div','tmi-ind-grp');
    // Header reuses .tmi-ind-l2 styling (a flex row, styled per nav surface): the
    // label is a real link to the business page, and a caret button expands the
    // industry list without navigating away.
    var head=mk('div','tmi-ind-l2');
    var a=mk('a',null,label); a.href='/'+base;
    a.style.cssText='color:inherit;text-decoration:none;flex:1;';
    var b=mk('button',null,caret()); b.type='button';
    b.setAttribute('aria-label','Browse '+label+' industries');
    b.style.cssText='background:none;border:none;color:inherit;font:inherit;cursor:pointer;padding:0 2px;';
    var l=buildList(items,base);
    b.addEventListener('click',function(e){e.stopPropagation();var open=l.style.display==='block';l.style.display=open?'none':'block';head.classList.toggle('open',!open);});
    head.appendChild(a); head.appendChild(b);
    g.appendChild(head); g.appendChild(l); return g;
  }
  function buildBox(){
    var box=mk('div','tmi-ind-box');
    box.appendChild(buildGroup('Physical Business',PHYS,'physical'));
    box.appendChild(buildGroup('Online Business',ONL,'online'));
    return box;
  }

  function enhanceDrawerLike(container){
    if(!container) return;
    var a=container.querySelector('a[href="/physical"],a[href="physical.html"]');
    if(!a) return;
    var l1=mk('button','tmi-ind-l1','Industries'+caret()); l1.type='button';
    // match sibling link styling: copy classes/inline of the anchor onto a wrapper
    var wrap=mk('div','tmi-ind'); 
    var box=buildBox();
    l1.addEventListener('click',function(){var open=box.style.display==='block';box.style.display=open?'none':'block';l1.classList.toggle('open',!open);});
    wrap.appendChild(l1); wrap.appendChild(box);
    a.parentNode.insertBefore(wrap,a); a.remove();
  }

  function enhanceSideNav(){
    var sn=document.getElementById('side-nav'); if(!sn) return;
    var secs=sn.querySelectorAll('.side-nav-section');
    var indSec=null;
    secs.forEach(function(s){ if(/industries/i.test(s.textContent)) indSec=s; });
    if(!indSec){ enhanceDrawerLike(sn); return; }
    // remove the curated industry links following the Industries section label
    var n=indSec.nextSibling, rm=[];
    while(n){ if(n.nodeType===1 && n.classList && n.classList.contains('side-nav-section')) break; rm.push(n); n=n.nextSibling; }
    rm.forEach(function(x){ if(x.parentNode) x.parentNode.removeChild(x); });
    var l1=mk('button','tmi-ind-l1','Industries'+caret()); l1.type='button';
    var box=buildBox();
    l1.addEventListener('click',function(){var open=box.style.display==='block';box.style.display=open?'none':'block';l1.classList.toggle('open',!open);});
    // replace the section label with the toggle, keep accordion after
    indSec.parentNode.insertBefore(l1,indSec.nextSibling);
    l1.parentNode.insertBefore(box,l1.nextSibling);
    indSec.parentNode.removeChild(indSec);
  }

  function makeDropdown(){
    var dd=mk('div','tmi-dd');
    var btn=mk('button','tmi-dd-btn','Industries'); btn.type='button';
    var panel=mk('div','tmi-dd-panel'); panel.appendChild(buildBox());
    dd.appendChild(btn); dd.appendChild(panel);
    btn.addEventListener('click',function(e){e.stopPropagation();dd.classList.toggle('open');});
    panel.addEventListener('click',function(e){e.stopPropagation();});
    document.addEventListener('click',function(){dd.classList.remove('open');});
    return dd;
  }
  function enhanceTopnav(){
    var nr=document.querySelector('.topnav .nav-right'); if(!nr || nr.querySelector('.tmi-dd')) return;
    nr.insertBefore(makeDropdown(), nr.firstChild);
  }
  function enhanceArticleHeader(){
    var nav=document.querySelector('.ah-nav'); if(!nav || nav.querySelector('.tmi-dd')) return;
    nav.appendChild(makeDropdown());
  }

  function enhanceDesktop(){
    var nl=document.querySelector('.nav-links'); if(!nl) return;
    var a=nl.querySelector('a[href="/physical"],a[href="physical.html"]'); if(!a) return;
    var dd=mk('div','tmi-dd');
    var btn=mk('button','tmi-dd-btn','Industries'); btn.type='button';
    var panel=mk('div','tmi-dd-panel'); panel.appendChild(buildBox());
    dd.appendChild(btn); dd.appendChild(panel);
    a.parentNode.insertBefore(dd,a); a.remove();
    btn.addEventListener('click',function(e){e.stopPropagation();dd.classList.toggle('open');});
    panel.addEventListener('click',function(e){e.stopPropagation();});
    document.addEventListener('click',function(){dd.classList.remove('open');});
  }

  // Ensure a link exists in a nav surface, cloning a neutral sibling so it inherits
  // that surface's styling. refSel is a comma list tried in order; where = before|after.
  function ensureLink(c, href, text, refSel, where){
    if(!c) return;
    if(c.querySelector('a[href="'+href+'"]')) return;
    var ref=null, parts=refSel.split(',');
    for(var i=0;i<parts.length && !ref;i++) ref=c.querySelector(parts[i].trim());
    if(!ref) return;
    var a=ref.cloneNode(true);
    a.removeAttribute('style'); a.removeAttribute('onclick');
    a.href=href; a.textContent=text;
    if(/^https?:/.test(href)){ a.target='_blank'; a.rel='noopener'; }
    ref.parentNode.insertBefore(a, where==='before' ? ref : ref.nextSibling);
  }

  // Ensure the external TapMe link sits in the page footer, cloning a neutral
  // footer link so it inherits that footer's styling. Skips if already present.
  function ensureFooterTapMe(){
    var foot=document.querySelector('footer'); if(!foot) return;
    if(foot.querySelector('a[href*="tapme.tmitechai.com"]')) return;
    var ref=null, sels=['a[href="/faq"]','a[href="/contact"]','a[href="/founders-of-the-future"]','a[href="/news"]','a[href="/about"]'];
    for(var i=0;i<sels.length && !ref;i++) ref=foot.querySelector(sels[i]);
    if(!ref) return;
    var a=ref.cloneNode(true);
    a.removeAttribute('style'); a.removeAttribute('onclick');
    a.href='https://tapme.tmitechai.com'; a.textContent='TapMe ↗';
    a.target='_blank'; a.rel='noopener';
    ref.parentNode.insertBefore(a, ref.nextSibling);
  }

  // Ensure the free book link sits in the page footer as a CTA, cloning a neutral
  // footer link so it inherits that footer's styling. Skips if already present.
  function ensureFooterBook(){
    var foot=document.querySelector('footer'); if(!foot) return;
    if(foot.querySelector('a[href="/the-intelligent-company-book"]')) return;
    var ref=null, sels=['a[href="/founders-of-the-future"]','a[href="/about"]','a[href="/faq"]','a[href="/contact"]','a[href="/news"]'];
    for(var i=0;i<sels.length && !ref;i++) ref=foot.querySelector(sels[i]);
    if(!ref) return;
    var a=ref.cloneNode(true);
    a.removeAttribute('onclick');
    a.href='/the-intelligent-company-book'; a.textContent='Free book: The Intelligent Company';
    a.style.color='var(--chart,#E4FF97)'; a.style.fontWeight='600';
    ref.parentNode.insertBefore(a, ref);
  }

  // Inject the offering links (Digital Workforce, The Work) into every nav surface.
  function ensureExtras(){
    var sels=['.nav-links','#drawer','.ah-nav','.topnav .nav-right','#side-nav'];
    sels.forEach(function(sel){
      var c=document.querySelector(sel); if(!c) return;
      ensureLink(c,'/departments','Digital Workforce','a[href="/solutions"],a[href="solutions.html"],a[href="/about"],a[href="about.html"]','after');
      ensureLink(c,'/portfolio','The Work','a[href="/about"],a[href="about.html"],a[href="/news"],a[href="news.html"]','before');
      ensureLink(c,'/startabusiness','Start a Business','a[href="/news"],a[href="news.html"],a[href="/about"],a[href="about.html"]','before');
      ensureLink(c,'/makemoneywithai','Make Money With AI','a[href="/news"],a[href="news.html"],a[href="/about"],a[href="about.html"]','before');
      ensureLink(c,'/distro','Distro','a[href="/news"],a[href="news.html"],a[href="/about"],a[href="about.html"]','before');
      ensureLink(c,'https://tapme.tmitechai.com','TapMe','a[href="/distro"],a[href="/news"],a[href="news.html"],a[href="/about"],a[href="about.html"]','after');
      // Free book CTA: injected into every nav surface, highlighted in chartreuse.
      ensureLink(c,'/the-intelligent-company-book','Free book','a[href="/about"],a[href="about.html"],a[href="/news"],a[href="news.html"]','before');
      var bk=c.querySelector('a[href="/the-intelligent-company-book"]');
      if(bk){ bk.style.color='var(--chart,#E4FF97)'; bk.style.fontWeight='700'; }
    });
  }

  // Collapsible desktop rail: floating toggle hides/shows whichever side-nav
  // surface the page uses; the choice persists across pages via localStorage.
  function railToggle(){
    if(document.getElementById('railTgl')) return;
    var surface=document.querySelector('header.nav, .article-header, aside.rail, .side-nav');
    if(!surface) return;
    var btn=mk('button','', '<span></span><span></span><span></span>');
    btn.id='railTgl'; btn.type='button'; btn.setAttribute('aria-label','Toggle navigation');
    document.body.appendChild(btn);
    function width(){
      try{ var w=surface.getBoundingClientRect().width; if(w>0) document.documentElement.style.setProperty('--railw', Math.round(w)+'px'); }catch(e){}
    }
    width(); window.addEventListener('resize', width);
    var KEY='tmi_rail_hidden';
    function set(c){
      document.documentElement.classList.toggle('rail-collapsed', c);
      btn.title = c ? 'Show menu' : 'Hide menu';
      try{ localStorage.setItem(KEY, c ? '1' : '0'); }catch(e){}
    }
    btn.addEventListener('click', function(){ set(!document.documentElement.classList.contains('rail-collapsed')); });
    try{ if(localStorage.getItem(KEY)==='1') set(true); else set(false); }catch(e){ set(false); }
  }

  // In the side nav and footer, label the journal as "Founders of the Future
  // Letters" with only "Letters" in chartreuse, so it reads as clearly separate
  // from the "Founders of the Future" program link sitting near it.
  function styleFotfLetters(){
    var CH='color:var(--chart,#E4FF97);';
    var sel='.nav-links a[href="/news"], #drawer a[href="/news"], .ah-nav a[href="/news"], #side-nav a[href="/news"], footer a[href="/news"]';
    [].forEach.call(document.querySelectorAll(sel), function(a){
      if(a.querySelector('[data-ltrs]')) return;              // already styled
      var t=(a.textContent||'').trim();
      a.style.color='';                                        // drop any full-chartreuse so only "Letters" pops
      if(/^journal$/i.test(t)){
        a.innerHTML='Founders of the Future <span data-ltrs style="'+CH+'">Letters</span>';
      } else if(a.innerHTML.indexOf('Founders of the Future Letters')>=0){
        var html=a.innerHTML.replace(/\s*\(Journal\)\s*/i,'');   // "(Journal)" is redundant now that Letters is the brand
        a.innerHTML=html.replace('Founders of the Future Letters','Founders of the Future <span data-ltrs style="'+CH+'">Letters</span>');
      }
    });
  }

  function init(){ ensureExtras(); ensureFooterTapMe(); ensureFooterBook(); styleFotfLetters(); enhanceSideNav(); enhanceDrawerLike(document.getElementById('drawer')); enhanceDesktop(); enhanceTopnav(); enhanceArticleHeader(); railToggle(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
