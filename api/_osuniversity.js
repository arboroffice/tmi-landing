// TMI University - the engine, not a course.
//
// The rule that governs everything here: a lesson is not finished when the video
// ends. It is finished when an artifact exists in the member's business that did
// not exist before. So this module is built around two things, not videos:
//   1. the assessment score (six areas) and its HISTORY, the retention loop, and
//   2. the Binder of artifacts, which gates progression floor by floor.
//
// A floor does not unlock because someone watched the lessons. It unlocks when
// every required artifact for the floor below is VERIFIED in the binder. The
// member's Level (1..5) is read separately from the latest rescore band, so a
// member can never sit at "Level 4 in their head" while their company is a 2.
//
// Pure logic only. No I/O, no time-at-module-load. Endpoints (os2-university)
// own persistence and pass state in.

// ---------------------------------------------------------------------------
// The six areas of company intelligence.
// ---------------------------------------------------------------------------
const AREAS = ['memory', 'awareness', 'action', 'learning', 'integration', 'decision'];
const AREA_LABEL = {
  memory: 'Memory', awareness: 'Awareness', action: 'Action',
  learning: 'Learning', integration: 'Integration', decision: 'Decision',
};

// ---------------------------------------------------------------------------
// Admissions / rescore instrument: 18 questions, 6 areas x 3, each scored 1..5.
// The same instrument runs admissions and every 30-day rescore. The anchors are
// the 1 / 3 / 5 language the owner reads.
// ---------------------------------------------------------------------------
const SCORECARD = [
  { id: 'M1', area: 'memory', q: 'If your best employee quit tomorrow, how much of what they know would still exist?', a: { 1: 'Almost none of it.', 3: 'Some of it is written down, but it takes digging.', 5: 'All of it. Anyone could pick it up.' } },
  { id: 'M2', area: 'memory', q: "How fast can anyone on your team pull up a customer's full history?", a: { 1: 'We would have to call around.', 3: 'A few minutes and a couple of places.', 5: 'Under thirty seconds, one place.' } },
  { id: 'M3', area: 'memory', q: 'Where does your pricing logic live?', a: { 1: 'In my head.', 3: 'Partly written, partly in my head.', 5: 'Fully documented. A new hire could quote.' } },

  { id: 'A1', area: 'awareness', q: 'How do you find out about a problem?', a: { 1: 'From an angry customer.', 3: 'From a weekly report that is already a week old.', 5: 'From the system, the day it happens.' } },
  { id: 'A2', area: 'awareness', q: 'How long to answer: which jobs are running behind right now?', a: { 1: 'I would have to ask three people.', 3: 'One call, about an hour.', 5: 'It is on a screen.' } },
  { id: 'A3', area: 'awareness', q: 'When did you last look at real numbers?', a: { 1: 'When the bookkeeper sends them, about a month late.', 3: 'Weekly.', 5: 'This morning, before coffee.' } },

  { id: 'C1', area: 'action', q: 'What percent of routine work runs by itself?', a: { 1: 'None. Every step needs a person.', 3: 'A few reminders.', 5: 'Most of it.' } },
  { id: 'C2', area: 'action', q: 'Does anything happen when nobody is logged in?', a: { 1: 'No.', 3: 'A couple of automatic emails.', 5: 'Yes, work runs on a Saturday.' } },
  { id: 'C3', area: 'action', q: 'Follow up on a cold lead depends on what?', a: { 1: 'Someone remembering.', 3: 'A note on a list.', 5: 'It fires on its own.' } },

  { id: 'L1', area: 'learning', q: 'When the same mistake happens twice, what changes?', a: { 1: 'Nothing. It happens again in three months.', 3: 'We talk about it.', 5: 'It gets written into the process so it cannot repeat.' } },
  { id: 'L2', area: 'learning', q: 'What happens to what you learn on a job?', a: { 1: 'It is gone when the invoice goes out.', 3: 'Sometimes someone mentions it.', 5: 'It gets logged and it changes the next job.' } },
  { id: 'L3', area: 'learning', q: 'Does a new hire start from zero?', a: { 1: 'Yes, and they make the same mistakes the last one did.', 3: 'We have some training.', 5: 'They inherit everything the company has learned.' } },

  { id: 'I1', area: 'integration', q: 'How many tools do you pay for that do not share information?', a: { 1: 'Five or more.', 3: 'A couple are connected.', 5: 'Everything shares.' } },
  { id: 'I2', area: 'integration', q: 'Does anyone retype the same information into two systems?', a: { 1: 'Every single job.', 3: 'Sometimes.', 5: 'Never.' } },
  { id: 'I3', area: 'integration', q: 'Add a customer in one place. Where does it show up?', a: { 1: 'Only there.', 3: 'One other place, if someone does it.', 5: 'Everywhere it is needed, automatically.' } },

  { id: 'D1', area: 'decision', q: 'How long to answer a real operating question, like which jobs are actually profitable?', a: { 1: 'Days and several phone calls.', 3: 'An hour and one call.', 5: 'Minutes, from a screen.' } },
  { id: 'D2', area: 'decision', q: 'What are big calls based on?', a: { 1: 'Gut.', 3: 'Numbers that are a month old.', 5: 'Numbers that are true today.' } },
  { id: 'D3', area: 'decision', q: 'Can anyone besides you make a pricing or refund call?', a: { 1: 'No. It all comes to me.', 3: 'Sometimes, with a check in.', 5: 'Yes, there are written rules.' } },
];

// ---------------------------------------------------------------------------
// The five levels. Score bands, read from the latest rescore.
// ---------------------------------------------------------------------------
const LEVELS = [
  { level: 1, name: 'Paper', min: 0, max: 30, blurb: 'If the building burned down tonight, so would most of what the company knows.' },
  { level: 2, name: 'Islands', min: 31, max: 50, blurb: 'Good tools, none of them speaking. The most expensive place to sit.' },
  { level: 3, name: 'Connected', min: 51, max: 70, blurb: 'Information entered once shows up elsewhere with no copy and paste.' },
  { level: 4, name: 'Automated', min: 71, max: 85, blurb: 'Work happens on a Saturday when nobody is logged in.' },
  { level: 5, name: 'Intelligent', min: 86, max: 100, blurb: 'The owner turns the phone off for two weeks and the business runs itself.' },
];

// ---------------------------------------------------------------------------
// The curriculum. Orientation plus seven floors. Each lesson carries the hook
// (cold open), the action (step), the binder deposit (artifact), and which of
// the six scores it moves. Long teach/example copy and video_url land at film
// time; the engine and the app only need this scaffold.
//
// Every artifact has a stable key. The `artifacts` array on each floor is the
// list that must be VERIFIED before the next floor unlocks. That list is the
// degree.
// ---------------------------------------------------------------------------
const FLOORS = [
  {
    key: 'orientation', order: 0, title: 'Orientation', subtitle: 'Everyone takes these. No skipping, even for a Level 4.',
    lessons: [
      { id: 'O1', title: 'Your business is working. It is just not coordinated.', cold_open: 'You do not have a lead problem. I know that is not what you want to hear.', step: 'Pick one ordinary question about your business. Time how long it takes to get a real answer, and how many people it took.', artifact: { key: 'scattered_question', label: 'The question, the time, and how many people it took' }, moves: [] },
      { id: 'O2', title: 'What the chaos is actually costing you.', cold_open: 'Nobody has ever written lost to a sticky note on a profit and loss statement.', step: 'Count the leads you lost last month to slow follow up. Multiply by average job value, then by twelve. Keep the number.', artifact: { key: 'the_number', label: 'The cost-of-chaos number' }, moves: [] },
      { id: 'O3', title: 'Read your score honestly.', cold_open: 'Your total score is not the useful part. The gap is.', step: 'Look at your six scores. Circle the lowest. That is your starting floor.', artifact: { key: 'six_scores', label: 'The six scores and the circled lowest' }, moves: [] },
    ],
    artifacts: ['scattered_question', 'the_number', 'six_scores'],
  },
  {
    key: 'floor1', order: 1, title: 'Floor 1: Communication', subtitle: 'How information moves between people. Skip it and every floor above gets fed bad information forever.',
    lessons: [
      { id: '1.1', title: 'Find every place your company lives.', cold_open: "Your company's memory is not missing. It is split into thirty boxes shipped to thirty cities with no map.", step: 'List every single place information about your business lives right now. Do not clean it up.', artifact: { key: 'info_map', label: 'The information map' }, moves: ['memory', 'integration'] },
      { id: '1.2', title: 'The handoff is where the money dies.', cold_open: 'The lead did not die on the phone call. It died in the two seconds between two people.', step: 'Take your highest value job type. Write every moment it passes between people. Circle the unowned handoffs.', artifact: { key: 'handoff_map', label: 'The handoff map with unowned handoffs circled' }, moves: ['memory', 'integration'] },
      { id: '1.3', title: 'One front door.', cold_open: 'Jobs coming in five ways is not five channels. It is five doors with no lock on any of them.', step: 'Build one intake form. Put it everywhere and route everything to it.', artifact: { key: 'intake_form', label: 'The live intake form link' }, moves: ['memory', 'integration', 'awareness'] },
      { id: '1.4', title: 'Kill the group text.', cold_open: 'Your group text is a graveyard. Everything important is buried in there and none of it can be found.', step: 'Move one crew or one client off texts and into one place. Just one.', artifact: { key: 'channel_cleared', label: 'A screenshot of the channel now carrying that traffic' }, moves: ['memory', 'integration'] },
      { id: '1.5', title: 'Bring the team with you.', cold_open: 'People do not resist change. They resist change that gets done to them instead of explained to them.', step: 'Sit the team down. Tell them what is changing and why, before it changes. Handle all four objections out loud.', artifact: { key: 'team_briefing', label: 'Your notes from that talk' }, moves: ['learning'] },
    ],
    artifacts: ['info_map', 'handoff_map', 'intake_form', 'channel_cleared', 'team_briefing'],
  },
  {
    key: 'floor2', order: 2, title: 'Floor 2: Data and Memory', subtitle: 'Where information lands. The floor that saves companies from their own turnover.',
    lessons: [
      { id: '2.1', title: 'The quit test.', cold_open: 'If your best salesperson quit tomorrow, would their pipeline still exist?', step: 'Run the quit test on your top three people. For each, write what walks out the door with them.', artifact: { key: 'quit_test', label: 'The quit test results' }, moves: ['memory'] },
      { id: '2.2', title: 'Write it down once.', cold_open: 'You do not have to write anything. You have to talk.', step: 'Record your screen doing one task, out loud. Ten minutes. Do three by the end of this floor.', artifact: { key: 'sops_three', label: 'Three recorded SOPs' }, moves: ['memory', 'learning'] },
      { id: '2.3', title: 'Get your pricing out of your head.', cold_open: 'The single most valuable thing in your company is how you decide what to charge, and it exists nowhere except behind your eyes.', step: 'Write your quoting rules the way you would train a brand new hire. Nothing skipped.', artifact: { key: 'pricing_logic', label: 'The pricing logic document' }, moves: ['memory', 'decision'] },
      { id: '2.4', title: 'One place customers live.', cold_open: 'Anyone on your team should be able to pull up any customer in under thirty seconds.', step: 'Pick the one system that is the truth. Move fifty customer records into it with full history.', artifact: { key: 'customer_records', label: 'A screenshot of the record system with fifty complete records' }, moves: ['memory', 'integration'] },
      { id: '2.5', title: 'The third time rule.', cold_open: 'The single habit that turns tribal knowledge into a real company over one year.', step: 'Announce the third time rule to the team. Put it somewhere visible.', artifact: { key: 'third_time_rule', label: 'Confirmation the rule is live, plus the first SOP it produced' }, moves: ['memory', 'learning'] },
    ],
    artifacts: ['quit_test', 'sops_three', 'pricing_logic', 'customer_records'],
  },
  {
    key: 'floor3', order: 3, title: 'Floor 3: Workflow', subtitle: 'The hardest floor, the most valuable floor, and where the honest wall lives.',
    lessons: [
      { id: '3.1', title: 'Every workflow is an algorithm.', cold_open: 'Hiring, scheduling, sales, collections. It is the same steps in roughly the same order every time.', step: 'Pick the workflow that touches money most directly. Write every step on one page and time it.', artifact: { key: 'workflow_map_1', label: 'Workflow map one, with a total time' }, moves: ['action', 'learning'] },
      { id: '3.2', title: 'Map before you connect. Connect before you automate.', cold_open: 'Automating before mapping means you just automated your guesswork.', step: 'Map your top three workflows on paper. Nothing digital, nothing purchased.', artifact: { key: 'workflow_maps_three', label: 'Workflow maps two and three, with timings' }, moves: ['action', 'integration'] },
      { id: '3.3', title: 'Turn every hope into a trigger.', cold_open: 'A trigger does not forget, does not get pulled onto another call, and does not wait until Friday.', step: 'On all three maps, mark every memory-dependent step. Rank them by money that runs through them.', artifact: { key: 'trigger_list', label: 'The trigger list, ranked' }, moves: ['action'] },
      { id: '3.4', title: 'Before you buy another piece of software.', cold_open: 'The tool was not wrong. It got installed on a floor that was not built yet.', step: 'Run the checklist on one tool you are considering or already pay for.', artifact: { key: 'software_checklist', label: 'The completed software checklist' }, moves: ['decision', 'integration'] },
      { id: '3.5', title: 'The ROI math on one napkin.', cold_open: 'The math stops being an argument the second somebody writes it down.', step: 'Run the ROI math on your top ranked trigger. Write the number.', artifact: { key: 'roi_calc', label: 'The ROI calculation' }, moves: ['decision'] },
      { id: '3.6', title: 'The honest wall.', cold_open: 'You can map this. Building it is a completely different job. I am going to be straight with you about all three ways forward.', step: 'Decide your path out loud and put a date on it.', artifact: { key: 'path_decision', label: 'The path decision, with a date' }, moves: ['decision'] },
    ],
    artifacts: ['workflow_maps_three', 'trigger_list', 'software_checklist', 'roi_calc', 'path_decision'],
  },
  {
    key: 'floor4', order: 4, title: 'Floor 4: Automation', subtitle: 'Steps start running without anyone clicking. Works only because the three floors under it are solid.',
    lessons: [
      { id: '4.1', title: 'Start ugly.', cold_open: 'Perfect is the reason nothing in your business ever gets built.', step: 'Automate one message: the appointment confirmation.', artifact: { key: 'automation_ugly', label: 'A screenshot of it firing' }, moves: ['action'] },
      { id: '4.2', title: 'Build the one closest to the money.', cold_open: 'A missed lead is the most expensive mistake a business makes.', step: 'Build automatic follow up on cold leads and stale quotes.', artifact: { key: 'automation_money', label: 'The live sequence plus the first recovered job' }, moves: ['action', 'awareness'] },
      { id: '4.3', title: 'Your first digital worker.', cold_open: 'Your next hire is not a person. It is infrastructure.', step: 'Pick one role. Write its input, its output, and the hours per week it saves.', artifact: { key: 'digital_worker_spec', label: 'The digital worker spec' }, moves: ['action', 'integration'] },
      { id: '4.4', title: 'Chain the whole thing.', cold_open: 'Watch what happens when no step in a chain depends on a human memory.', step: 'Build the next link in your chain. One per week. Three live by the end of this floor.', artifact: { key: 'automations_three', label: 'Three live automations' }, moves: ['action', 'integration'] },
      { id: '4.5', title: 'Count what you got back.', cold_open: 'Proof is what makes a skeptical team stop fighting you.', step: 'Add up the hours saved this month. Show the team.', artifact: { key: 'hours_saved', label: 'The hours saved count' }, moves: ['learning', 'decision'] },
    ],
    artifacts: ['automations_three', 'digital_worker_spec', 'hours_saved'],
  },
  {
    key: 'floor5', order: 5, title: 'Floor 5: Decision Support', subtitle: 'The company chooses faster and better on real numbers instead of a hunch.',
    lessons: [
      { id: '5.1', title: 'If you have to ask, you cannot see it.', cold_open: 'Here is the test for whether your company is aware or just guessing. Do you have to ask a person?', step: 'Write the five questions you ask your team most often.', artifact: { key: 'blind_spots_five', label: 'The five blind spots' }, moves: ['awareness'] },
      { id: '5.2', title: 'The five minute dashboard.', cold_open: 'Who owes money. Which jobs are profitable. Which crew is behind. If that takes longer than a cup of coffee, the connections are the problem.', step: 'Build a sheet that answers your five questions plus cash. Update it once.', artifact: { key: 'dashboard', label: 'The live dashboard' }, moves: ['awareness', 'decision'] },
      { id: '5.3', title: 'Status instead of meetings.', cold_open: 'Meetings are what you have when you cannot see.', step: 'Replace one recurring reporting meeting with a status field.', artifact: { key: 'meeting_killed', label: 'The killed meeting, named, and the field that replaced it' }, moves: ['awareness', 'action'] },
      { id: '5.4', title: 'Visibility creates accountability.', cold_open: 'Most underperformance is not defiance. It is invisibility.', step: 'Make one useful number visible to the person doing that work. Say nothing. Watch two weeks.', artifact: { key: 'visible_number', label: 'The visible number and what happened' }, moves: ['awareness', 'learning'] },
      { id: '5.5', title: 'Turn your decisions into rules.', cold_open: 'The company does not need you. It needs your judgment. So write your judgment down.', step: 'Write five decision rules. Give them to the team.', artifact: { key: 'decision_rulebook', label: 'The decision rulebook' }, moves: ['decision'] },
    ],
    artifacts: ['blind_spots_five', 'dashboard', 'meeting_killed', 'visible_number', 'decision_rulebook'],
  },
  {
    key: 'floor6', order: 6, title: 'Floor 6: Intelligence', subtitle: 'The company starts learning. Knowledge compounds instead of resetting every Monday.',
    lessons: [
      { id: '6.1', title: 'Knowledge compounds.', cold_open: 'If nobody writes it down, the company starts from zero every Monday, no matter how many years it has been open.', step: 'Start the job learning log. One line per job. Thirty days.', artifact: { key: 'learning_log_30', label: 'Thirty days of job learning entries' }, moves: ['learning', 'memory'] },
      { id: '6.2', title: 'Catch it while it is still small.', cold_open: 'An intelligent company finds its problems early, while they are still cheap.', step: 'Set one alert on the thing that costs you most when it slips. Then two more.', artifact: { key: 'alerts_three', label: 'Three live alerts' }, moves: ['awareness', 'learning'] },
      { id: '6.3', title: 'The customer who is already leaving.', cold_open: 'Most companies learn a customer was unhappy from the cancellation.', step: 'Flag accounts gone quiet past your normal cycle. Call three this week.', artifact: { key: 'quiet_customer_flag', label: 'The quiet customer flag, plus what came back from the calls' }, moves: ['awareness', 'learning'] },
      { id: '6.4', title: 'Ask your own company a question.', cold_open: 'You should be able to ask your business a question in plain language and get an answer out of your own numbers.', step: 'Feed your SOPs and dashboard into an assistant. Use it a week, log what it got wrong.', artifact: { key: 'assistant_trained', label: 'The assistant, plus the error log' }, moves: ['decision', 'memory'] },
      { id: '6.5', title: 'Fix the process before you hire.', cold_open: 'The most expensive thing you can do is hire a person to patch a hole in a system.', step: 'Take your next planned hire. Name which floor is actually missing. Decide again.', artifact: { key: 'hire_decision', label: 'The hire decision with the reasoning' }, moves: ['decision', 'learning'] },
    ],
    artifacts: ['learning_log_30', 'alerts_three', 'quiet_customer_flag', 'assistant_trained'],
  },
  {
    key: 'floor7', order: 7, title: 'Floor 7: Leadership and the Dashboard', subtitle: 'The top floor. Only as good as the six holding it up.',
    lessons: [
      { id: '7.1', title: 'The whole company on one screen.', cold_open: 'Everything you have built for six floors, in one view.', step: 'Get all six of your key numbers onto one view.', artifact: { key: 'one_screen', label: 'The one screen view' }, moves: ['memory', 'awareness', 'action', 'learning', 'integration', 'decision'] },
      { id: '7.2', title: 'Your owner dependency number.', cold_open: 'The real question is not what you made last year. It is what percent of this company still runs through you.', step: 'Measure owner dependency for one week. Write the percent.', artifact: { key: 'owner_dependency', label: 'The owner dependency reading' }, moves: ['memory', 'awareness', 'action', 'learning', 'integration', 'decision'] },
      { id: '7.3', title: 'Build a second in command.', cold_open: 'Not a manager. A person who owns an outcome.', step: 'Hand one whole area to one person. The outcome, not the tasks.', artifact: { key: 'second_in_command', label: 'The named person and the outcome they own' }, moves: ['decision', 'learning'] },
      { id: '7.4', title: 'The two week test.', cold_open: 'Watch what happens to revenue the week you take a real vacation. If it drops, you are still the system.', step: 'Put two weeks on the calendar. Phone off. Then go.', artifact: { key: 'two_week_test', label: 'The dates, plus the list of what broke' }, moves: ['memory', 'awareness', 'action', 'learning', 'integration', 'decision'] },
      { id: '7.5', title: 'Worth more the day someone shows up.', cold_open: 'Two companies. Identical revenue. Wildly different price.', step: 'Pull out your day one number. Put your current score next to it.', artifact: { key: 'day_one_vs_today', label: 'Day one number versus today' }, moves: ['memory', 'awareness', 'action', 'learning', 'integration', 'decision'] },
    ],
    artifacts: ['one_screen', 'owner_dependency', 'second_in_command', 'two_week_test'],
  },
];

// Certification line (verified against real data, not a questionnaire).
const CERT = {
  min_score: 80,
  min_area: 4,
  max_owner_dependency: 25,
  dimensions: ['Intelligence', 'Systems', 'Knowledge', 'Workforce', 'Leadership', 'Operations', 'Decisions', 'Growth', 'Enterprise value', 'Owner independence'],
};

// ---- derived lookups -------------------------------------------------------
const FLOOR_BY_KEY = {}; FLOORS.forEach(f => { FLOOR_BY_KEY[f.key] = f; });
const ALL_ARTIFACT_KEYS = FLOORS.flatMap(f => f.artifacts);
// The degree is the graded artifact set: every required artifact EXCEPT the
// three reflective orientation ones. This is the "X of N" shown to members and
// the set the certification line requires.
const DEGREE_ARTIFACT_KEYS = FLOORS.filter(f => f.key !== 'orientation').flatMap(f => f.artifacts);
const ARTIFACT_META = {};
FLOORS.forEach(f => f.lessons.forEach(l => { if (l.artifact) ARTIFACT_META[l.artifact.key] = { key: l.artifact.key, label: l.artifact.label, floor: f.key, lesson: l.id }; }));

// ---------------------------------------------------------------------------
// Scoring.
// ---------------------------------------------------------------------------
// answers: { M1: 1..5, ... }. Returns per-area averages (1..5), the total out of
// 100, the level band, and how many of the 18 were answered.
function scoreAssessment(answers) {
  const a = answers || {};
  const areaVals = {};
  const areaCounts = {};
  for (const k of AREAS) { areaVals[k] = 0; areaCounts[k] = 0; }
  let answered = 0;
  for (const item of SCORECARD) {
    const v = Number(a[item.id]);
    if (v >= 1 && v <= 5) { areaVals[item.area] += v; areaCounts[item.area] += 1; answered++; }
  }
  const areas = {};
  let sum = 0, areasWithData = 0;
  for (const k of AREAS) {
    const avg = areaCounts[k] ? areaVals[k] / areaCounts[k] : 0;
    areas[k] = Math.round(avg * 100) / 100;
    if (areaCounts[k]) { sum += avg; areasWithData++; }
  }
  const total = areasWithData ? Math.round((sum / areasWithData) * 20) : 0;
  return { areas, total, level: levelForScore(total).level, answered, complete: answered === SCORECARD.length };
}

function levelForScore(total) {
  const t = Math.max(0, Math.min(100, Number(total) || 0));
  return LEVELS.find(l => t >= l.min && t <= l.max) || LEVELS[0];
}

// ---------------------------------------------------------------------------
// Progression. This is the not-a-course core.
// ---------------------------------------------------------------------------
// A floor is complete when EVERY required artifact for it is verified.
function floorComplete(floorKey, verifiedSet) {
  const f = FLOOR_BY_KEY[floorKey];
  if (!f) return false;
  if (!f.artifacts.length) return true;
  return f.artifacts.every(k => verifiedSet.has(k));
}

// Build the full standing for a member from their latest score and their
// artifacts. `artifacts` is an array of { key, status } (status 'verified'
// counts toward unlocking; 'submitted'/'returned' do not).
function computeStanding(latestScore, artifacts) {
  const verified = new Set((artifacts || []).filter(x => x.status === 'verified').map(x => x.key));
  const byKey = {}; (artifacts || []).forEach(x => { byKey[x.key] = x.status; });

  // Floors unlock in order: a floor is unlocked if it is orientation, or every
  // floor before it is complete. current_floor is the first not-yet-complete
  // unlocked floor.
  let current = FLOORS[0].key;
  let currentFound = false;
  const floors = FLOORS.map((f, i) => {
    const prevComplete = i === 0 ? true : FLOORS.slice(0, i).every(pf => floorComplete(pf.key, verified));
    const complete = floorComplete(f.key, verified);
    const unlocked = prevComplete;
    if (unlocked && !complete && !currentFound) { current = f.key; currentFound = true; }
    return {
      key: f.key, order: f.order, title: f.title, subtitle: f.subtitle,
      unlocked, complete,
      artifacts: f.artifacts.map(k => ({ key: k, label: (ARTIFACT_META[k] || {}).label || k, status: byKey[k] || 'missing' })),
      verified_count: f.artifacts.filter(k => verified.has(k)).length,
      artifact_count: f.artifacts.length,
    };
  });
  if (!currentFound) current = FLOORS[FLOORS.length - 1].key; // everything done

  const score = latestScore || null;
  const lvl = score ? levelForScore(score.total) : LEVELS[0];
  const totalVerified = DEGREE_ARTIFACT_KEYS.filter(k => verified.has(k)).length;

  return {
    level: lvl.level, level_name: lvl.name, level_blurb: lvl.blurb,
    score,
    current_floor: current,
    floors,
    artifacts_verified: totalVerified,
    artifacts_total: DEGREE_ARTIFACT_KEYS.length,
    certification: certificationCheck(score, verified),
  };
}

// The certification line. Verified against the latest rescore, every area, all
// artifacts, owner dependency, and the two-week test. Owner dependency and the
// two-week pass come from their own artifacts, so they are read from the score
// record when present.
function certificationCheck(score, verifiedSet) {
  const areas = (score && score.areas) || {};
  const allAreas = AREAS.every(k => (areas[k] || 0) >= CERT.min_area);
  const od = score && typeof score.owner_dependency === 'number' ? score.owner_dependency : null;
  const checks = {
    score: !!score && score.total >= CERT.min_score,
    every_area: !!score && allAreas,
    all_artifacts: DEGREE_ARTIFACT_KEYS.every(k => verifiedSet.has(k)),
    owner_dependency: od != null && od < CERT.max_owner_dependency,
    two_week_test: verifiedSet.has('two_week_test'),
  };
  checks.eligible = Object.values(checks).every(Boolean);
  return checks;
}

module.exports = {
  AREAS, AREA_LABEL, SCORECARD, LEVELS, FLOORS, CERT,
  FLOOR_BY_KEY, ALL_ARTIFACT_KEYS, DEGREE_ARTIFACT_KEYS, ARTIFACT_META,
  scoreAssessment, levelForScore, floorComplete, computeStanding, certificationCheck,
};
