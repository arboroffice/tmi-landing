// TMI OS - Human Design engine. Pure in-house computation, no third party, so a
// person's birth data never leaves the platform. Given birth date, time, and a
// timezone offset, it computes the chart: the two sides (Personality at birth,
// Design at ~88 degrees of solar arc before birth), maps every body onto the
// 64-gate wheel, then derives defined centers, channels, Type, Authority,
// Profile, Strategy, and the incarnation-cross gates.
//
// Astronomy via `astronomia` (VSOP87, MIT). The deterministic mechanics (the
// wheel, the gate-to-center map, the 36 channels, and the Type/Authority rules)
// are the part most worth testing and are unit-tested. The ephemeris longitudes
// should be spot-checked against a reference chart (bodygraph.com) for two or
// three known births before this is shown to a member; that validation is a
// deliberate gate, not an afterthought.

const A = require('astronomia');
const { julian, planetposition, solar, moonposition, base } = A;
const DEG = 180 / Math.PI;
const norm360 = (d) => ((d % 360) + 360) % 360;

// ---- the gate wheel: 64 gates in zodiac order, Gate 41 begins at 302 deg ----
const WHEEL_START = 302; // 2 deg Aquarius
const GATE_WHEEL = [41, 19, 13, 49, 30, 55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3, 27, 24, 2, 23, 8, 20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56, 31, 33, 7, 4, 29, 59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50, 28, 44, 1, 43, 14, 34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60];
const GATE_DEG = 360 / 64;      // 5.625
const LINE_DEG = GATE_DEG / 6;  // 0.9375

// ---- centers ----
const CENTERS = ['Head', 'Ajna', 'Throat', 'G', 'Heart', 'Sacral', 'SolarPlexus', 'Spleen', 'Root'];
const MOTORS = ['Sacral', 'Heart', 'SolarPlexus', 'Root'];
const GATE_CENTER = {};
[
  ['Head', [64, 61, 63]],
  ['Ajna', [47, 24, 4, 17, 43, 11]],
  ['Throat', [62, 23, 56, 35, 12, 45, 33, 8, 31, 20, 16]],
  ['G', [7, 1, 13, 10, 25, 15, 46, 2]],
  ['Heart', [21, 40, 26, 51]],
  ['Sacral', [34, 5, 14, 29, 59, 9, 3, 42, 27]],
  ['SolarPlexus', [6, 37, 30, 55, 49, 22, 36]],
  ['Spleen', [48, 57, 44, 50, 32, 28, 18]],
  ['Root', [53, 60, 52, 19, 39, 41, 58, 38, 54]],
].forEach(([c, gs]) => gs.forEach(g => { GATE_CENTER[g] = c; }));

// ---- the 36 channels (each a pair of gates joining two centers) ----
const CHANNELS = [
  [1, 8], [2, 14], [3, 60], [4, 63], [5, 15], [6, 59], [7, 31], [9, 52], [10, 20], [10, 34],
  [10, 57], [11, 56], [12, 22], [13, 33], [16, 48], [17, 62], [18, 58], [19, 49], [20, 34], [20, 57],
  [21, 45], [23, 43], [24, 61], [25, 51], [26, 44], [27, 50], [28, 38], [29, 46], [30, 41], [32, 54],
  [34, 57], [35, 36], [37, 40], [39, 55], [42, 53], [47, 64],
];

// ---- planetary VSOP87B data (loaded lazily) ----
const PDATA = { mercury: 'vsop87Bmercury', venus: 'vsop87Bvenus', earth: 'vsop87Bearth', mars: 'vsop87Bmars', jupiter: 'vsop87Bjupiter', saturn: 'vsop87Bsaturn', uranus: 'vsop87Buranus', neptune: 'vsop87Bneptune' };
const _planets = {};
function planet(name) {
  if (!_planets[name]) _planets[name] = new planetposition.Planet(require('astronomia/data/' + PDATA[name]).default);
  return _planets[name];
}
function helioRect(name, jde) {
  const p = planet(name).position(jde);
  const cb = Math.cos(p.lat);
  return { x: p.range * cb * Math.cos(p.lon), y: p.range * cb * Math.sin(p.lon), z: p.range * Math.sin(p.lat) };
}
// Geocentric ecliptic longitude (geometric) of a VSOP87 planet, degrees.
function geoLon(name, jde) {
  const e = helioRect('earth', jde), p = helioRect(name, jde);
  return norm360(Math.atan2(p.y - e.y, p.x - e.x) * DEG);
}
function sunLon(jde) { return norm360(solar.apparentLongitude(base.J2000Century(jde)) * DEG); }
function moonLon(jde) { return norm360(moonposition.position(jde).lon * DEG); }
// Mean lunar ascending node (Meeus), degrees.
function meanNode(jde) {
  const T = (jde - 2451545.0) / 36525;
  return norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + T * T * T / 467441 - T * T * T * T / 60616000);
}
function plutoLon(jde) {
  try {
    const p = A.pluto.heliocentric(jde); // {lon,lat,range} ecliptic radians
    const cb = Math.cos(p.lat);
    const px = p.range * cb * Math.cos(p.lon), py = p.range * cb * Math.sin(p.lon);
    const e = helioRect('earth', jde);
    return norm360(Math.atan2(py - e.y, px - e.x) * DEG);
  } catch (e) { return null; }
}

// The 13 bodies used to activate the chart.
function activations(jde) {
  const sun = sunLon(jde);
  const node = meanNode(jde);
  const out = {
    sun, earth: norm360(sun + 180), moon: moonLon(jde),
    north_node: node, south_node: norm360(node + 180),
    mercury: geoLon('mercury', jde), venus: geoLon('venus', jde), mars: geoLon('mars', jde),
    jupiter: geoLon('jupiter', jde), saturn: geoLon('saturn', jde), uranus: geoLon('uranus', jde), neptune: geoLon('neptune', jde),
  };
  const pl = plutoLon(jde); if (pl != null) out.pluto = pl;
  const acts = {};
  for (const k in out) acts[k] = Object.assign({ lon: out[k] }, gateLine(out[k]));
  return acts;
}

// Longitude (deg) -> { gate, line }.
function gateLine(lon) {
  const pos = norm360(lon - WHEEL_START);
  const idx = Math.floor(pos / GATE_DEG) % 64;
  const line = Math.floor((pos - idx * GATE_DEG) / LINE_DEG) + 1;
  return { gate: GATE_WHEEL[idx], line: Math.min(6, Math.max(1, line)) };
}

// The JD (dynamical) of the Design side: when the Sun was 88 deg of arc earlier.
function designJDE(birthJDE) {
  const target = norm360(sunLon(birthJDE) - 88);
  let lo = birthJDE - 95, hi = birthJDE - 80;
  const diff = (j) => { let d = sunLon(j) - target; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (diff(lo) * diff(mid) <= 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}

// ---- derivation ----
function definedFrom(personality, design) {
  const gates = new Set();
  [personality, design].forEach(side => Object.values(side).forEach(a => gates.add(a.gate)));
  const channels = CHANNELS.filter(([a, b]) => gates.has(a) && gates.has(b));
  const centers = new Set();
  channels.forEach(([a, b]) => { centers.add(GATE_CENTER[a]); centers.add(GATE_CENTER[b]); });
  return { gates, channels, centers };
}

// Is `from` connected to `to` through the graph of defined channels?
function connected(channels, from, to) {
  const adj = {};
  channels.forEach(([a, b]) => {
    const ca = GATE_CENTER[a], cb = GATE_CENTER[b];
    (adj[ca] = adj[ca] || new Set()).add(cb);
    (adj[cb] = adj[cb] || new Set()).add(ca);
  });
  const seen = new Set([from]); const q = [from];
  while (q.length) { const n = q.shift(); if (n === to) return true; (adj[n] || []).forEach(m => { if (!seen.has(m)) { seen.add(m); q.push(m); } }); }
  return false;
}

function deriveType(centers, channels) {
  if (centers.size === 0) return 'Reflector';
  const throatToMotor = centers.has('Throat') && MOTORS.some(m => centers.has(m) && connected(channels, 'Throat', m));
  if (centers.has('Sacral')) return throatToMotor ? 'Manifesting Generator' : 'Generator';
  if (throatToMotor) return 'Manifestor';
  return 'Projector';
}
function deriveAuthority(centers, type) {
  if (centers.has('SolarPlexus')) return 'Emotional';
  if (centers.has('Sacral')) return 'Sacral';
  if (centers.has('Spleen')) return 'Splenic';
  if (centers.has('Heart')) return 'Ego';
  if (centers.has('G')) return 'Self-Projected';
  if (type === 'Reflector') return 'Lunar';
  return 'Mental (no inner authority)';
}
const STRATEGY = { Manifestor: 'Inform before you act', Generator: 'Wait to respond', 'Manifesting Generator': 'Wait to respond, then inform', Projector: 'Wait for the invitation', Reflector: 'Wait a lunar cycle' };
const SIGNATURE = { Manifestor: 'Peace', Generator: 'Satisfaction', 'Manifesting Generator': 'Satisfaction', Projector: 'Success', Reflector: 'Surprise' };
const NOT_SELF = { Manifestor: 'Anger', Generator: 'Frustration', 'Manifesting Generator': 'Frustration', Projector: 'Bitterness', Reflector: 'Disappointment' };

function angle(profile) {
  if (profile === '4/1') return 'Juxtaposition';
  return Number(profile.charAt(0)) <= 3 ? 'Right Angle' : 'Left Angle';
}

// Build the whole chart from a Personality JDE and a Design JDE.
function chartFrom(persJDE, desJDE) {
  const personality = activations(persJDE);
  const design = activations(desJDE);
  const { gates, channels, centers } = definedFrom(personality, design);
  const type = deriveType(centers, channels);
  const profile = personality.sun.line + '/' + design.sun.line;
  const cross = [personality.sun.gate, personality.earth.gate, design.sun.gate, design.earth.gate];
  const openCenters = CENTERS.filter(c => !centers.has(c));
  return {
    type, strategy: STRATEGY[type], authority: deriveAuthority(centers, type),
    profile, angle: angle(profile),
    defined_centers: CENTERS.filter(c => centers.has(c)),
    open_centers: openCenters,
    channels: channels.map(ch => ch.join('-')),
    incarnation_cross: { gates: cross, angle: angle(profile) },
    signature: SIGNATURE[type], not_self: NOT_SELF[type],
    personality, design,
  };
}

// Public: compute from birth fields. birth = { date:'YYYY-MM-DD', time:'HH:MM',
// tz_offset: hours east of UTC (e.g. -5 for US Eastern standard) }.
function computeChart(birth) {
  const [y, m, d] = String(birth.date || '').split('-').map(Number);
  const [hh, mm] = String(birth.time || '00:00').split(':').map(Number);
  if (!y || !m || !d) throw new Error('Invalid birth date');
  const offset = Number(birth.tz_offset) || 0;
  // Local clock time -> UTC decimal hours.
  const utcHours = (hh || 0) + (mm || 0) / 60 - offset;
  // Fold any day rollover into the day fraction; CalendarGregorianToJD handles
  // fractional (and out-of-range) days correctly.
  const dayFrac = d + utcHours / 24;
  const jd = julian.CalendarGregorianToJD(y, m, dayFrac);
  // Convert UT to dynamical time (TT) for the ephemeris.
  let dt = 69; try { dt = A.deltat.deltaT(base.JDEToJulianYear(jd)); } catch (e) { /* ~modern */ }
  const jde = jd + dt / 86400;
  const chart = chartFrom(jde, designJDE(jde));
  chart.birth = { date: birth.date, time: birth.time || null, tz_offset: offset };
  chart.computed_at = new Date().toISOString();
  chart.engine = 'oshd-1';
  return chart;
}

module.exports = {
  computeChart, chartFrom, activations, gateLine, definedFrom, deriveType, deriveAuthority, designJDE,
  GATE_WHEEL, GATE_CENTER, CHANNELS, CENTERS, MOTORS, STRATEGY,
};
