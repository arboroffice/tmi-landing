// TMI Human Design - the meaning layer. The engine (_oshd) computes the raw
// mechanics. This turns those mechanics into plain, operator-facing language so
// the OS can explain a chart without any AI call: what the type means for how a
// person works, how each authority actually decides, what a profile is built to
// do, and what each center runs (defined) or absorbs (open). Blunt, practical,
// written for owners and managers, not for a spiritual reader.

const HD = require('./_oshd');

// ---- Type: how this person is built to use energy at work -----------------
const TYPE = {
  'Generator': {
    tag: 'The builder',
    work: 'Built to do the work they love and go deep. When the work lights them up, the energy is endless and the quality shows. When it does not, they grind and burn out.',
    give: 'Give them real work to respond to, not a blank page. They find their yes by reacting to something concrete.',
    watch: 'A Generator stuck in work that does not light them up gets frustrated and slow. Frustration is the tell that the work is wrong, not the person.',
  },
  'Manifesting Generator': {
    tag: 'The multi-track builder',
    work: 'Fast, non-linear, runs several things at once and skips steps other people need. Covers ground no one else can when they are on the right work.',
    give: 'Give them multiple things to react to and room to drop what does not click. Do not force one lane.',
    watch: 'Boxed into one slow track, they stall. Let them move fast and circle back, they will still land it.',
  },
  'Manifestor': {
    tag: 'The initiator',
    work: 'Built to start things and set them in motion. They do not need permission and they do not wait well. Point them at a beginning.',
    give: 'Let them run ahead and start, but get them to inform the team before they move so nothing gets blindsided.',
    watch: 'Controlled or kept waiting, a Manifestor gets angry and goes around you. Inform-first is the whole game.',
  },
  'Projector': {
    tag: 'The guide',
    work: 'Built to see the system and guide it, not to grind out volume. Sees people and process better than anyone in the room.',
    give: 'Recognize them and invite them into the big calls. Ask for their read. They run on being seen, not on being told.',
    watch: 'Made to do a Generator\'s workload, a Projector burns out and gets bitter. Their leverage is the guidance, not the hours.',
  },
  'Reflector': {
    tag: 'The mirror',
    work: 'Rare. Samples the health of the whole team and reflects it back. A living read on whether the environment is working.',
    give: 'Put them in the right environment and give them a full lunar cycle before a big decision. Ask them how the team is really doing.',
    watch: 'Rushed or stuck in a bad environment, a Reflector goes flat and disappointed. Protect their space and their timing.',
  },
};

// ---- Strategy: the one operating rule for that type -----------------------
const STRATEGY = {
  'Inform before you act': 'Start what you see, but tell the people it touches before you move. Informing is not asking permission, it is clearing the path.',
  'Wait to respond': 'Let the thing show up and notice your gut reaction before committing. Reacting to what is real beats chasing what you imagined.',
  'Wait to respond, then inform': 'React to what shows up, commit when the gut says yes, then tell the team before you tear off.',
  'Wait for the invitation': 'For the big things, wait to be recognized and invited in. An invited Projector is heard. An uninvited one is resented.',
  'Wait a lunar cycle': 'Sit with a major decision for about a month before committing. The right answer changes as you move through different people and places.',
};

// ---- Authority: how this person should actually make a call ---------------
const AUTHORITY = {
  'Emotional': {
    how: 'Decides over time, not in the moment. There is no truth in the now for them, only a wave. Sleep on anything that matters.',
    rule: 'Never let them commit on the spot. Give them a night, or several. The answer at the bottom of the wave and the top of the wave are both wrong, the truth is the average.',
  },
  'Sacral': {
    how: 'Decides from the gut, in the moment, as a response. A quick uh-huh (yes) or uh-uh (no) is more honest than the reasons that come after.',
    rule: 'Ask them a yes or no question and trust the first sound, not the paragraph they talk themselves into.',
  },
  'Splenic': {
    how: 'Decides in a quiet, one-time flash of knowing, in the moment. Spleen speaks once and softly, it does not repeat itself.',
    rule: 'Trust the first instinct, especially about safety and timing. If they talk themselves out of it, they usually regret it.',
  },
  'Ego': {
    how: 'Decides from the will and the heart: what do I actually want, and will I stand behind it. Their word is the authority.',
    rule: 'Let them commit to what they have the willpower for and drop what they do not. A promise they do not feel will not hold.',
  },
  'Self-Projected': {
    how: 'Decides by talking it out and hearing their own voice. The direction is right when it sounds right coming out of their own mouth.',
    rule: 'Give them a trusted person to talk at, not for advice, just to hear themselves. The answer is in what they say, not what you say back.',
  },
  'Mental (no inner authority)': {
    how: 'No reliable gut. Decides best by talking it through with trusted people over time and feeling which environment the choice belongs in.',
    rule: 'They are a sounding board for the world, not for themselves. Let them process out loud across a few people before they land.',
  },
  'Lunar': {
    how: 'Decides across a full lunar cycle, sampling how the choice feels in different settings and with different people.',
    rule: 'No fast calls, ever. About a month of living with it is the tool, and it is worth the wait.',
  },
};

// ---- Profile: the role a person is built to play --------------------------
const PROFILE = {
  '1/3': 'Investigator / Martyr. Needs a solid foundation of knowing before they act, then learns everything by trial and error. Let them research, then let them fail forward.',
  '1/4': 'Investigator / Opportunist. Builds deep knowledge, then passes it through their network. Their opportunities come through who they know.',
  '2/4': 'Hermit / Opportunist. Naturally gifted but needs alone time to recharge, and gets called out by their network. Protect their solo time.',
  '2/5': 'Hermit / Heretic. A natural talent people keep calling on to fix things. Powerful projections, so they must deliver on what they take on or take the blame.',
  '3/5': 'Martyr / Heretic. Learns fast by trial and error and gets projected onto as the person with the answer. Built to find what works and lead others to it.',
  '3/6': 'Martyr / Role Model. Experiments hard early, then around midlife becomes a role model who leads by example after living it.',
  '4/6': 'Opportunist / Role Model. Relationships and network are everything, and over time they become a trusted role model. Loyalty is the currency.',
  '4/1': 'Opportunist / Investigator (Juxtaposition). A fixed way of being: deep foundational knowledge shared through close relationships. Very stable, hard to move off course.',
  '5/1': 'Heretic / Investigator. The universal fixer people project solutions onto, grounded in real, practical knowledge. Built to deliver practical answers under pressure.',
  '5/2': 'Heretic / Hermit. Called out to lead and solve, but needs to protect alone time or the projections burn them out.',
  '6/2': 'Role Model / Hermit. A three-phase life that becomes a role model, with natural gifts that emerge when left alone. Patience with them pays off.',
  '6/3': 'Role Model / Martyr. Becomes a wise role model through a lot of trial and error and real-life bumps. Their authority is hard-won and trusted.',
};

// ---- Centers: what a center runs when defined, absorbs when open ----------
// Open centers are where a person takes in and amplifies others, and where the
// not-self and the wisdom both live.
const CENTER = {
  Head: {
    role: 'Inspiration and mental pressure.',
    defined: 'Steady source of questions and ideas. Thinks in a fixed way and does not get rattled by other people\'s mental noise.',
    open: 'Takes on everyone else\'s questions and pressure to figure things out. Wise about what is actually worth thinking about once they stop trying to answer every question that lands on them.',
  },
  Ajna: {
    role: 'How the mind processes and holds views.',
    defined: 'Fixed way of thinking and certainty in their concepts. Consistent, but can be locked into how they see things.',
    open: 'Flexible mind, tries on many views, but feels pressure to seem certain. Wise about ideas once they are comfortable saying I am still thinking.',
  },
  Throat: {
    role: 'Communication and action, where things get expressed and done.',
    defined: 'Consistent voice and a reliable way of expressing and doing. Others look here for the word.',
    open: 'Adapts voice to the room and can feel pressure to speak up to get attention. Best when they let the right moment to speak come to them.',
  },
  G: {
    role: 'Identity, direction, and love.',
    defined: 'A fixed sense of self and direction. Knows who they are and where they are going, largely regardless of the room.',
    open: 'Sense of self and direction shifts with environment and company, so the room they are in matters enormously. Wise about people and direction over time.',
  },
  Heart: {
    role: 'Willpower, ego, and proving.',
    defined: 'Reliable willpower and drive to prove and deliver. Can make and keep material promises. A minority have this on.',
    open: 'Should not make willpower bets or feel they must prove their worth. Wise about what is genuinely worth committing to once they stop overpromising.',
  },
  Sacral: {
    role: 'Life-force energy and the capacity to work and build.',
    defined: 'A generator engine. Real, sustainable work capacity when the work is right. This is the difference between a Generator and everyone else.',
    open: 'No sustainable work engine. Should not try to match a Generator\'s hours. Wise about how much energy and work is actually enough, and when to stop.',
  },
  SolarPlexus: {
    role: 'Emotions and the emotional wave.',
    defined: 'Runs on an emotional wave and must decide over time. Their mood moves and their truth is found across it, not in a single moment.',
    open: 'Absorbs and amplifies the room\'s emotions and tends to avoid confrontation to keep the peace. Wise about emotions once they stop treating the room\'s mood as their own.',
  },
  Spleen: {
    role: 'Instinct, health, and survival timing.',
    defined: 'Steady instinct for safety, health, and timing. A quiet, reliable gut about what is okay and what is not.',
    open: 'Can hold onto things and people that are not good for them out of fear of letting go. Wise about health and what to keep once they trust the timing.',
  },
  Root: {
    role: 'Pressure, drive, and stress to get things done.',
    defined: 'A steady handle on pressure and a consistent drive to move. Pressure does not rush them into bad moves.',
    open: 'Feels pressure to hurry up and clear the to-do list, and can rush. Wise about which pressure is real and which to let go once they stop reacting to all of it.',
  },
};

// ---- helpers ---------------------------------------------------------------
const PLANET_LABEL = {
  sun: 'Sun', earth: 'Earth', moon: 'Moon', north_node: 'North Node', south_node: 'South Node',
  mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn',
  uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto',
};

// Every activated gate.line, personality (design-of-birth) and design side.
function activationList(side) {
  if (!side) return [];
  return Object.keys(side).map(k => ({ planet: PLANET_LABEL[k] || k, key: k, gate: side[k].gate, line: side[k].line }));
}
function gatesFromChart(chart) {
  const s = new Set();
  ['personality', 'design'].forEach(side => { const a = chart[side]; if (a) Object.values(a).forEach(x => s.add(x.gate)); });
  return Array.from(s).sort((a, b) => a - b);
}

// Definition = how many separate connected groups of defined centers exist.
// This is a real HD concept: single (all one piece) is self-contained; splits
// need a bridge, which matters a lot for how a person works with others.
const DEFINITION_LABEL = { 0: 'No Definition', 1: 'Single Definition', 2: 'Split Definition', 3: 'Triple Split', 4: 'Quadruple Split' };
const DEFINITION_MEANING = {
  'No Definition': 'Nothing is fixed. This is a Reflector, wide open and sampling everything around them. The environment is everything.',
  'Single Definition': 'All defined centers connect into one piece. Self-contained and consistent, processes internally, does not need anyone to feel whole.',
  'Split Definition': 'Two separate defined areas that a person looks to others to bridge. They are drawn to people who connect the two sides, and they think best around the right people.',
  'Triple Split': 'Three separate defined areas. Takes more people and more environments to feel connected, and they process across a wider circle. Not a flaw, just wiring.',
  'Quadruple Split': 'Four separate defined areas. Very compartmentalized, needs space and a busy enough life to bridge the parts. Consistency comes from routine.',
};
function definitionOf(chart) {
  const defined = new Set(chart.defined_centers || []);
  if (defined.size === 0) return { key: 0, label: 'No Definition', meaning: DEFINITION_MEANING['No Definition'], groups: 0 };
  // Build adjacency from channels (each "a-b" gate pair connects two centers).
  const adj = {}; defined.forEach(c => { adj[c] = new Set(); });
  (chart.channels || []).forEach(str => {
    const [a, b] = String(str).split('-').map(Number);
    const ca = HD.GATE_CENTER[a], cb = HD.GATE_CENTER[b];
    if (ca && cb && ca !== cb) { (adj[ca] = adj[ca] || new Set()).add(cb); (adj[cb] = adj[cb] || new Set()).add(ca); }
  });
  const seen = new Set(); let groups = 0;
  defined.forEach(c => {
    if (seen.has(c)) return;
    groups++; const q = [c]; seen.add(c);
    while (q.length) { const n = q.shift(); (adj[n] || []).forEach(m => { if (!seen.has(m)) { seen.add(m); q.push(m); } }); }
  });
  const label = DEFINITION_LABEL[Math.min(4, groups)] || 'Split Definition';
  return { key: groups, label, meaning: DEFINITION_MEANING[label] || DEFINITION_MEANING['Split Definition'], groups };
}

// Build the full meaning packet for a chart: everything the UI needs to explain
// it, with zero AI. Safe to call on any computed chart.
function enrich(chart) {
  if (!chart || !chart.type) return null;
  const def = definitionOf(chart);
  const centers = (HD.CENTERS || []).map(c => {
    const on = (chart.defined_centers || []).indexOf(c) >= 0;
    const info = CENTER[c] || {};
    return { center: c, defined: on, role: info.role || '', meaning: on ? (info.defined || '') : (info.open || '') };
  });
  return {
    type: TYPE[chart.type] || null,
    strategy: { name: chart.strategy, text: STRATEGY[chart.strategy] || '' },
    authority: Object.assign({ name: chart.authority }, AUTHORITY[chart.authority] || {}),
    profile: { name: chart.profile, text: PROFILE[chart.profile] || '' },
    definition: def,
    centers,
    gates: gatesFromChart(chart),
    personality_activations: activationList(chart.personality),
    design_activations: activationList(chart.design),
  };
}

// ---- Two-person fit (connection) ------------------------------------------
// Put two charts together and read where they click, where they grind, and who
// shapes whom. This is real HD connection theory in plain terms:
//   - click (electromagnetic): each person brings one half of a channel the
//     other is missing, so together it lights up. Natural pull, they complete
//     each other there.
//   - same (companionship): both already have the whole channel. They see it
//     the same way, which is easy but can be an echo chamber.
//   - grind (compromise): one has the whole channel, the other has just one
//     half. The half person gets consistently conditioned by the whole person
//     there, and can feel pushed.
//   - conditioning: one person's DEFINED center meets the other's OPEN center.
//     The defined person steadily shapes the open person in that area.
function gateSet(chart) { return new Set(gatesFromChart(chart)); }
function fullChannelSet(chart) { return new Set((chart.channels || []).map(String)); }

function connection(a, b) {
  const ga = gateSet(a), gb = gateSet(b);
  const fa = fullChannelSet(a), fb = fullChannelSet(b);
  const click = [], same = [], grind = [];
  (HD.CHANNELS || []).forEach(pair => {
    const [g1, g2] = pair;
    const label = g1 + '-' + g2;
    const aFull = fa.has(label), bFull = fb.has(label);
    const aHas1 = ga.has(g1), aHas2 = ga.has(g2), bHas1 = gb.has(g1), bHas2 = gb.has(g2);
    const centers = [HD.GATE_CENTER[g1], HD.GATE_CENTER[g2]];
    const centerName = centers[0] === centers[1] ? centers[0] : centers.join(' to ');
    if (aFull && bFull) { same.push({ channel: label, centers: centerName }); return; }
    // electromagnetic: neither has it whole, but each brings a different half.
    if (!aFull && !bFull && ((aHas1 && bHas2 && !aHas2 && !bHas1) || (aHas2 && bHas1 && !aHas1 && !bHas2))) { click.push({ channel: label, centers: centerName }); return; }
    // compromise: one whole, the other has just one half.
    if (aFull && !bFull && (bHas1 || bHas2)) { grind.push({ channel: label, centers: centerName, dominant: 'a' }); return; }
    if (bFull && !aFull && (aHas1 || aHas2)) { grind.push({ channel: label, centers: centerName, dominant: 'b' }); return; }
  });
  // Conditioning: defined center in one, open in the other.
  const defA = new Set(a.defined_centers || []), defB = new Set(b.defined_centers || []);
  const openA = new Set(a.open_centers || []), openB = new Set(b.open_centers || []);
  const aShapesB = [], bShapesA = [];
  (HD.CENTERS || []).forEach(c => {
    if (defA.has(c) && openB.has(c)) aShapesB.push(c);
    if (defB.has(c) && openA.has(c)) bShapesA.push(c);
  });
  return {
    click, same, grind, a_shapes_b: aShapesB, b_shapes_a: bShapesA,
    counts: { click: click.length, same: same.length, grind: grind.length },
  };
}

// Facts about a pairing, written for a language model to turn into a brief.
function connectionSummary(a, b, nameA, nameB, conn) {
  const c = conn || connection(a, b);
  const chList = arr => arr.length ? arr.map(x => x.channel + ' (' + x.centers + ')').join(', ') : 'none';
  return [
    `${nameA}: ${a.type}, ${a.authority} authority.`,
    `${nameB}: ${b.type}, ${b.authority} authority.`,
    `Where they click (each brings a half, natural pull): ${chList(c.click)}.`,
    `Where they are the same (both already have it): ${chList(c.same)}.`,
    `Where they grind (one has it whole, the other feels pushed there): ${chList(c.grind)}.`,
    `${nameA} steadily shapes ${nameB} in these areas (defined meets open): ${c.a_shapes_b.join(', ') || 'none'}.`,
    `${nameB} steadily shapes ${nameA} in these areas: ${c.b_shapes_a.join(', ') || 'none'}.`,
  ].join('\n');
}

// A compact factual summary of a chart, for feeding a language model.
function summaryLine(chart, name) {
  const def = definitionOf(chart);
  return [
    (name ? name + ': ' : '') + chart.type + ', ' + chart.authority + ' authority, ' + chart.profile + ' profile, ' + def.label + '.',
    'Strategy: ' + chart.strategy + '. Signature: ' + chart.signature + '. Not-self: ' + chart.not_self + '.',
    'Defined centers: ' + ((chart.defined_centers || []).join(', ') || 'none') + '.',
    'Open centers: ' + ((chart.open_centers || []).join(', ') || 'none') + '.',
    'Channels: ' + ((chart.channels || []).join(', ') || 'none') + '.',
  ].join(' ');
}

module.exports = { TYPE, STRATEGY, AUTHORITY, PROFILE, CENTER, enrich, definitionOf, gatesFromChart, activationList, summaryLine, DEFINITION_MEANING, connection, connectionSummary };
