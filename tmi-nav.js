/* TMI nested Industries nav: Industries -> Physical / Online -> all industries.
   Holds the industry data once and enhances the nav on any page that has a
   side-nav drawer (#side-nav), a mobile drawer (#drawer), or a desktop nav
   (.nav-links). Safe no-op if none are present. */
(function(){
  var PHYS=[["hvac","HVAC"],["roofing","Roofing"],["construction","Construction"],["plumbing","Plumbing"],["electrical","Electrical"],["concrete","Concrete"],["painting","Painting"],["pest-control","Pest Control"],["restoration","Restoration"],["home-service","Home Service"],["landscaping","Landscaping"],["irrigation-companies","Irrigation Companies"],["land-clearing","Land Clearing"],["storm-cleanup-contractors","Storm Cleanup"],["freight-brokers","Freight Brokers"],["trucking-companies","Trucking Companies"],["hotshot-trucking","Hotshot Trucking"],["last-mile-delivery","Last-Mile Delivery"],["courier-fleets","Courier Fleets"],["3pl","3PL"],["warehousing","Warehousing"],["container-transport","Container Transport"],["refrigerated-transport","Refrigerated Transport"],["heavy-haul","Heavy Haul"],["equipment-transport","Equipment Transport"],["freight-forwarding","Freight Forwarding"],["dispatch-companies","Dispatch Companies"],["industrial-courier-services","Industrial Courier"],["debris-hauling-companies","Debris Hauling"],["crew-transportation-companies","Crew Transportation"],["personnel-transportation","Personnel Transport"],["sand-hauling","Sand Hauling"],["oil-gas","Oil & Gas"],["wireline","Wireline"],["frac-crews","Frac Crews"],["coiled-tubing","Coiled Tubing"],["flowback","Flowback"],["roustabout-companies","Roustabout Companies"],["vacuum-truck-services","Vacuum Truck Services"],["oilfield-hauling","Oilfield Hauling"],["mud-logging","Mud Logging"],["snubbing-services","Snubbing Services"],["rig-moving","Rig Moving"],["pipe-yards","Pipe Yards"],["pipe-inspection-companies","Pipe Inspection"],["fuel-delivery","Fuel Delivery"],["fuel-lubricant-distributors","Fuel & Lubricant Distributors"],["tank-cleaning","Tank Cleaning"],["water-hauling","Water Hauling"],["water-transfer","Water Transfer"],["safety-compliance-companies","Safety & Compliance"],["safety-training-companies","Safety Training"],["welding-gas-distributors","Welding Gas Distributors"],["welding-supply","Welding Supply"],["manufacturing","Manufacturing"],["mining","Mining"],["heavy-machinery","Heavy Machinery"],["crane-services","Crane Services"],["equipment-rental","Equipment Rental"],["utilities","Utilities"],["heavy-equipment-repair","Heavy Equipment Repair"],["heavy-equipment-yards","Heavy Equipment Yards"],["equipment-dealers","Equipment Dealers"],["equipment-dealerships","Equipment Dealerships"],["forklift-services","Forklift Services"],["diesel-mechanics","Diesel Mechanics"],["diesel-shops","Diesel Shops"],["fleet","Fleet Operations"],["auto-repair","Auto Repair"],["fleet-repair","Fleet Repair"],["mobile-mechanic-fleets","Mobile Mechanic Fleets"],["body-shops","Body Shops"],["tire-shops","Tire Shops"],["rv-repair","RV Repair"],["boat-repair","Boat Repair"],["tugboat-operators","Tugboat Operators"],["barge-companies","Barge Companies"],["offshore-support-vessels","Offshore Support Vessels"],["offshore-crew-logistics","Offshore Crew Logistics"],["offshore-logistics","Offshore Logistics"],["offshore-staffing","Offshore Staffing"],["marine-logistics","Marine Logistics"],["marine-service-yards","Marine Service Yards"],["marine-supply-companies","Marine Supply"],["marine-transportation","Marine Transportation"],["shipyards","Shipyards"],["dock-operations","Dock Operations"],["harbor-services","Harbor Services"],["crane-barges","Crane Barges"],["port-logistics","Port Logistics"],["vessel-maintenance","Vessel Maintenance"],["property-management","Property Management"],["facilities-management","Facilities Management"],["real-estate","Real Estate Teams"],["hoa-management","HOA Management"],["apartment-maintenance","Apartment Maintenance"],["commercial-maintenance","Commercial Maintenance"],["vacation-rentals","Vacation Rentals"],["agriculture","Agriculture"],["farms","Farms"],["ranches","Ranches"],["forestry","Forestry"],["nurseries","Nurseries"],["feed-stores","Feed Stores"],["portable-toilet-companies","Portable Toilet Companies"],["roll-off-dumpster-fleets","Roll-Off Dumpster Fleets"],["environmental-cleanup","Environmental Cleanup"],["industrial-cleaning","Industrial Cleaning"],["industrial-laundry","Industrial Laundry"],["inspection-companies","Inspection Companies"],["industrial-catering","Industrial Catering"],["industrial-supply-distributors","Industrial Supply"],["temporary-fencing","Temporary Fencing"],["industrial-staffing","Industrial Staffing"],["field-labor-coordinators","Field Labor Coordinators"],["crane-dispatch-offices","Crane Dispatch"],["healthcare","Healthcare"],["dental","Dental"],["fitness","Fitness"],["legal","Legal"],["chiropractic-clinics","Chiropractic Clinics"],["physical-therapy","Physical Therapy"],["therapy-practices","Therapy Practices"],["vet-clinics","Vet Clinics"],["vet-supply","Vet Supply"],["home-health-agencies","Home Health Agencies"],["appliance-repair","Appliance Repair"],["pool-service","Pool Service"],["pressure-washing","Pressure Washing"],["moving-companies","Moving Companies"],["towing-companies","Towing Companies"],["glass-repair","Glass & Window Repair"],["locksmith-companies","Locksmith Companies"],["janitorial-services","Janitorial Services"],["garage-door-service","Garage Door Service"],["fence-contractors","Fence Contractors"],["flooring-contractors","Flooring Contractors"],["drywall-contractors","Drywall Contractors"],["solar-installation","Solar Installation"],["security-systems","Security Systems"],["generator-service","Generator Service"],["fire-sprinkler","Fire Sprinkler & Safety"],["elevator-service","Elevator Service"]];
  var ONL=[["ecom","Ecommerce Brands"],["saas","SaaS Companies"],["agencies","Agencies"],["coaches","Coaches"],["courses","Course Sellers"],["creators","Creators"],["newsletters","Newsletters"],["personal-branding","Personal Brands"],["freelancers","Freelancers"],["info","Info Products"]];

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
    ".side-nav .tmi-ind-list a{padding:8px 12px;font-size:13px;}";
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
    var b=mk('button','tmi-ind-l2',label+caret()); b.type='button';
    var l=buildList(items,base);
    b.addEventListener('click',function(){var open=l.style.display==='block';l.style.display=open?'none':'block';b.classList.toggle('open',!open);});
    g.appendChild(b); g.appendChild(l); return g;
  }
  function buildBox(){
    var box=mk('div','tmi-ind-box');
    box.appendChild(buildGroup('Physical',PHYS,'physical'));
    box.appendChild(buildGroup('Online',ONL,'online'));
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

  function init(){ enhanceSideNav(); enhanceDrawerLike(document.getElementById('drawer')); enhanceDesktop(); enhanceTopnav(); enhanceArticleHeader(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
