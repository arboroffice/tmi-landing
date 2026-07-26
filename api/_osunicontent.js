// TMI University - the long-form lesson content. Kept separate from the engine
// (_osuniversity) so the curriculum structure stays lean and the teaching copy
// can be edited on its own. Keyed by lesson id. Each entry has the teach (the
// real content) and one concrete example with numbers. The hook (cold open),
// the step, and the artifact live on the lesson in _osuniversity; this fills in
// the middle so a member can learn and act before a single video is filmed.
// No em dashes anywhere, on brand.

const CONTENT = {
  // ---- ORIENTATION ----
  'O1': {
    teach: 'Every growing company hits the same wall, and it is not a sales wall. The business became too complex to run out of one head. Revenue grew. Infrastructure did not. The owner is holding it together with memory, texts, and two people who cannot quit. That is not a character flaw and it is not laziness. It happened one reasonable decision at a time. Someone bought a scheduling app because the whiteboard stopped working. A year later someone added a CRM because leads were dying in email. A year after that accounting got its own software. Every one of those solved a real problem the day it got added. Nobody was ever put in charge of making the tools talk to each other, because that job does not appear on an org chart and never feels urgent until the day you need an answer that lives across three of them.',
    example: 'A company with four crews, doing seven million a year, could not tell me which of their customers had not been contacted in sixty days. Not because the data was gone. It was in three places, and none of them knew about each other.',
  },
  'O2': {
    teach: 'A sticky note. A group text nobody read past the third reply. A spreadsheet only one person understands, and she is on vacation. None of it looks expensive on its own. Add it up across a year and across every employee and the number gets real. It never shows up as a line item. It just quietly lowers the ceiling on what the company could have made. Most owners blame this on people. Hire better. Push harder. So run the test: take your best employee, the one who never drops a ball, and hand them six disconnected tools with nothing tying them together. Six months. They will drop a ball too. Not because they got worse. Because the setup was never built to be held in one person memory.',
    example: 'A service company doing forty jobs a week loses two leads a month to slow follow up. Average job is eight hundred dollars. That is nineteen thousand two hundred dollars a year, gone, and it appears nowhere in the books.',
  },
  'O3': {
    teach: 'You get six numbers, not one. Memory, Awareness, Action, Learning, Integration, Decision. A company can score a five on memory because every record is easy to pull and a two on awareness because the owner only sees numbers when the bookkeeper finally sends something. The average hides that. The gap does not. That gap tells you exactly where the next ninety days go, before you spend a dollar on anything. These four build on each other and most owners try them backwards. You cannot be aware of something you never remembered. You cannot decide well on something you are not aware of. You cannot act well on a decision you never made. Buying automation before fixing memory gives you a very fast machine acting on very bad information, which is worse than a slow machine acting on nothing.',
    example: 'The most common shape I see is a 3 on memory, a 2 on awareness, a 4 on action. That owner has already bought automation. It is firing on information nobody trusts. That is why the tool feels like it is not working.',
  },

  // ---- FLOOR 1: COMMUNICATION ----
  '1.1': {
    teach: 'Every company already has memory. It is in old invoices, in text threads, in the CRM, in a Slack channel nobody scrolls back through, in a Drive folder nobody has cleaned since 2021, in a stack of paper in a truck glovebox, and in one employee head, the one who remembers which customer wants a call before nine and which supplier is always two days late. The memory exists. It is just scattered. If your own brain worked like that, you would not call yourself forgetful. You would call the system broken. Fixing it does not mean collecting more information. It means connecting what is already sitting there.',
    example: 'One owner listed his places and got to nineteen. Nineteen. He had been telling himself he needed a better CRM.',
  },
  '1.2': {
    teach: 'A lead calls on a busy Tuesday. Someone writes a name on a sticky note, gets pulled onto another call, and never passes it on. The estimate that could have gone out that day goes out a week late. The customer already signed with whoever called back faster. Now notice exactly where the information died. Not at the call. Not at the estimate. It died at the handoff between the receptionist and the salesperson, the one moment nobody owned. Every business has three or four of these. They are almost never on anyone job description, which is why they break, and why nobody gets blamed when they do.',
    example: 'In a med spa it is the handoff between the front desk and the follow up call. In construction it is between the estimator and the crew scheduler. Different uniform, same dead spot.',
  },
  '1.3': {
    teach: 'If work enters your business five different ways, you have five different processes whether you meant to or not, and no way to know how many leads you actually got. One door does two things. It makes every job start the same way, and it makes leads countable for the first time. This does not require software. It requires a decision and the discipline to send everyone through it, including the people who have your cell number.',
    example: 'A contractor moved every inbound to one form. First month, he found out he was getting forty percent more leads than he thought. He had never been losing sales. He had been losing counting.',
  },
  '1.4': {
    teach: 'Texts feel fast, which is why they win, and they are where information goes to disappear. Nothing in a text is searchable by the team, attached to a customer, or visible to anyone who was not on the thread. When a customer is upset, you should not have to scroll a thread from March. Move one thing at a time. Do not announce a company wide software change. Move one crew, or one client, and let it be obviously better before you move the next.',
    example: 'A tree service moved dispatch off texts and into one shared board. The office stopped calling crews to ask where they were. That was six phone calls a day, gone, from one change.',
  },
  '1.5': {
    teach: 'None of this works if your team quietly refuses. Four objections come up almost every time. This is going to replace people. It rarely does, and built right it should not. The point is to take out the fortieth repeat of the same phone call, not the person. Say that plainly before they hear it secondhand and assume the worst. I do not trust it to get things right. That is fair. Do not argue. Start low stakes, let them watch it work for a few weeks, and let trust build through evidence. We tried this before and it did not stick. Usually true, and usually because the tool got bought before the workflow got mapped. Show them this time the process comes first. I am not technical enough. None of this needs code. It needs you to describe a workflow the way you would explain it to a new hire, which every owner can already do.',
    example: 'The owners who skip this lesson are the ones who call me in month three saying the team went back to the old way.',
  },

  // ---- FLOOR 2: DATA AND MEMORY ----
  '2.1': {
    teach: 'This is the fastest way to find out whether your company has memory or whether your people are your memory. Ask it about your top three. Their customer history, their pricing logic, their relationships, the reason they always call that one client on a Monday. If the honest answer is some of it is in their head, memory is the gap to close before anything else on the list. Not because they are going to quit. Because a company where the knowledge lives in people is a company that resets every time someone leaves, and it is worth dramatically less the day a buyer looks under the hood.',
    example: 'An owner ran this on his operations manager of eleven years and could not sleep that night. That is the correct reaction. He had a nine million dollar company with a single point of failure who had a bad back.',
  },
  '2.2': {
    teach: 'Every owner knows they should document their processes. Nobody does it, because writing a manual sounds like a week you do not have. So do not write. Record your screen while you do the task and narrate it like you are training somebody standing behind you. Ten minutes. That recording is your first SOP. It can be cleaned up later, or fed to an AI to turn into written steps, or just watched by the next new hire. The point is that it now exists outside your head, which is a different state than it was in this morning.',
    example: 'One owner recorded eleven of these in a single Saturday. That was his entire documentation problem, solved, in an afternoon he was going to waste anyway.',
  },
  '2.3': {
    teach: 'Pricing logic is the last thing owners hand over and the first thing that makes them a bottleneck. Every quote comes back to them. Every unusual job comes back to them. This is not because the team is not smart. It is because nobody ever wrote down the rules. Write it like a training document, not a price list. What we charge for a standard job. What changes the number up. What changes it down. What we walk away from. What needs an owner call. The moment that document exists, someone else can quote, and you have converted the most valuable thing in your head into a company asset.',
    example: 'The first thing a buyer diligence team asks about is pricing discipline. A company where the owner prices everything by feel gets a lower multiple, every time.',
  },
  '2.4': {
    teach: 'That is the real test for memory, and it is not about having a CRM. Plenty of companies have a CRM and still fail it, because half the history is in email and the other half is in someone phone. Pick one system to be the truth. It does not need to be expensive or new. Then move records into it, starting with your best customers, not all of them. Perfect data migration is a fantasy that kills more projects than bad software does.',
    example: 'Start with the fifty customers who make you the most money. If you never get to the other four hundred, you have still fixed eighty percent of the pain.',
  },
  '2.5': {
    teach: 'You do not need a documentation project. You need one rule. The next time you catch yourself doing the same task for the third time in a month, stop, and write down the steps before you do it a fourth time. That is it. Repeated for a year, that habit converts a business that runs on memory into a business that runs on documents, without anyone ever scheduling a documentation week that always gets cancelled. Teach the rule to the whole team, not just yourself. Every repeatable thing is an algorithm waiting to be written down, and anything written down can eventually be improved or handed off.',
    example: 'Every mistake your company makes twice is a lesson that was never captured the first time. In eighteen months a new hire will make it again and nobody will remember there was ever a lesson.',
  },

  // ---- FLOOR 3: WORKFLOW ----
  '3.1': {
    teach: 'Owners describe their business as complicated. It is not complicated, it is undocumented, and those feel identical from the inside. Any process done more than a few times is a set of steps in an order. Once it is on paper it can be timed, improved, handed off, and eventually automated. Until it is on paper none of those four are possible. Start with the workflow closest to money, because that is where a fix pays for itself fastest and where you will get the belief you need to keep going.',
    example: 'A lead workflow written out on one page usually has between nine and fourteen steps. Owners guess four.',
  },
  '3.2': {
    teach: 'The order matters as much as the work. Thirty days mapping every workflow, including the messy ones nobody wants to talk about. Thirty days connecting the systems that should already be talking and are not. Thirty days automating the repetitive work eating your best people. Do it out of order and you get a fast machine doing the wrong thing. Most failed AI projects in small business are not technology failures. They are order of operations failures.',
    example: 'The company that automated its follow up before mapping its intake ended up sending automated follow ups to people who had already bought. That is worse than no follow up.',
  },
  '3.3': {
    teach: 'Go through your maps and mark every step that only happens if a person remembers. Those steps are not processes. They are hopes. And every one of them is where work quietly falls out of your business on a busy week. The goal is not to remove people. It is to remove the requirement that a person hold something in their memory while the phone is ringing. When a handoff becomes a trigger, the busy week stops being the dangerous week.',
    example: 'The most common hope in any service business: someone will follow up on that quote. Nobody owns it, nothing fires, and the quote just dies quietly at day nine.',
  },
  '3.4': {
    teach: 'Run every tool through one honest checklist before you buy. Does it connect to what you already use. Does it automate work that matters, or just move the same manual work to a new screen. Does it get better over time or stay the same forever. Does it save time, cut mistakes, and improve visibility. Will it still hold up when the company is twice this size. And the one everyone skips in the excitement of a demo: where does customer data actually live, who can see it, and does that match what your industry requires. If most answers are no, skip it, no matter how good the demo felt in the room.',
    example: 'A company ran a shiny new CRM through this and got no, no, and maybe. They skipped it and six months later spent that budget connecting two tools they already owned. Three daily headaches gone for a fraction of the price.',
  },
  '3.5': {
    teach: 'Add up the time a system saves, the mistakes it prevents, and the revenue it captures. Subtract what it costs in labor and fees to run. What is left is the return. No spreadsheet full of formulas required. Do this before you buy anything, and check it again ninety days after, because the second check is the one nobody does and the one that tells you the truth.',
    example: 'A follow up automation costs two hundred a month. It saves five hours a week that used to go into manual reminders, worth about four hundred at loaded pay. It recovers one job a month that would have gone cold, worth eight hundred. That is twelve hundred a month of value against two hundred of cost.',
  },
  '3.6': {
    teach: 'Everything in this school can be done on your own. That is true and I am not going to pretend otherwise. Here is what each path actually costs. Do it yourself, using tools you already pay for plus a low code connector, mostly costs time. A weekend per workflow if somebody on the team likes poking at software. Hire a freelancer or small shop for one or two connected workflows, somewhere between a couple thousand and ten thousand, two to six weeks. Or bring in a team to build the whole operating system, priced more like a strategic hire than a subscription, live in about thirty days, and you own it. All three work. What does not work is hovering between them for eight months, which is what most owners do, and it is the most expensive option of the three because nothing happens while you decide.',
    example: 'Start smaller than feels satisfying. One connected workflow, built well and actually used, beats a six month plan that stalls in month two.',
  },

  // ---- FLOOR 4: AUTOMATION ----
  '4.1': {
    teach: 'Owners stall on automation because they picture the finished version, which looks expensive and complicated, so they never start. Build the ugliest possible version of one thing this week. It does not have to be elegant. It has to exist and run. The confirmation message before an appointment is the easiest win in almost any business, takes under an hour, and cuts no shows immediately. Ugly and running beats beautiful and planned, every time, and the ugly version teaches you what the good version needs.',
    example: 'One owner spent four months choosing a platform. Another built a text confirmation in an afternoon with what he already had. Guess which one had fewer no shows in month two.',
  },
  '4.2': {
    teach: 'If you only build one automation, build whichever one sits closest to the moment a customer money is on the table. Usually that is lead follow up. A lost lead is invisible in a way a lost job is not. A lost job at least shows up somewhere. A lead that never got a call back leaves no trace at all, which is why owners underestimate this number by a lot. Set it to fire on its own schedule, not on someone memory, and set it to keep going past the point a tired person would give up.',
    example: 'Every quote older than seven days with no answer, chased automatically. That is usually the single highest paying hour of work in this entire school.',
  },
  '4.3': {
    teach: 'A digital worker is not magic and it is not a robot. It is a role with a clear input, a clear output, and a specific number of hours it saves each week. A digital receptionist answers after hours so a lead never hits voicemail and vanishes. A digital dispatcher tracks jobs live so nobody guesses which truck is closest. A digital estimator builds a quote in minutes off current pricing instead of a guess. A digital sales assistant follows up with every lead without being reminded. Define it exactly the way you would write a job description, because that is exactly what it is, and because a vague definition is why most of these fail.',
    example: 'What it frees up is your humans for the work a system genuinely cannot do. Reading a room. Building a relationship. Making a judgment call nobody wrote a rule for.',
  },
  '4.4': {
    teach: 'A customer fills out a form. The system qualifies them right away with the same questions a person would ask. A quote gets built on current pricing. An appointment books against real availability. A reminder goes out so nobody no shows. An invoice generates the moment the job wraps. A review request fires at the right moment. The customer lands on the marketing list without anyone remembering to add them. Nothing in that chain needed a person to remember anything. Notice what actually changed structurally: every handoff that used to be a hope became a trigger. Build it one link a week, not all at once.',
    example: 'Run the same idea on hiring, which almost every company still runs on pure memory. Applications sorted the moment they land. Strong candidates hear back within the hour. Interviews booked against real availability. The business that answers first usually wins the best candidates regardless of whose offer is better on paper.',
  },
  '4.5': {
    teach: 'Automation gets quietly resented until people see the number. Count the hours saved this month and show the team, not just the office. Then show what those hours went into instead. This does two things. It converts the holdouts, and it gives you the ROI check ninety days out that almost nobody does. If the number is bad, that is useful too, and it usually means you automated a workflow that was never mapped properly.',
    example: 'Twelve hours a week back across a five person team is a part time hire you did not have to make and did not have to train.',
  },

  // ---- FLOOR 5: DECISION SUPPORT ----
  '5.1': {
    teach: 'Awareness is not about having reports. It is about whether the business knows what is happening right now, not what happened three days ago once somebody got around to writing it up. If the owner has to ask a person for current sales, missed calls, jobs running late, or estimates sitting untouched, the company is not aware. And every question you ask your team most often is a blind spot with a name on it. Those questions are the exact specification for your dashboard. You do not have to guess what to build. Your own mouth has been telling you for years.',
    example: 'The five questions an owner asks most are almost always the five things that should have been on a screen since the day the company hit ten people.',
  },
  '5.2': {
    teach: 'A dashboard is not a software purchase. It is a place where the answers land. A spreadsheet counts on day one and it is better than a beautiful tool nobody updates. Start with your five blind spots and one revenue number. The habit matters more than the tooling, because a dashboard nobody opens is just a nicer version of not knowing. Once the habit is real, the tooling question answers itself and you will know exactly what you need.',
    example: 'Five minutes each morning and the owner already knows which leads came in, which jobs are behind, which invoices need a nudge, and what the next ninety days of cash look like. Same crew size, same revenue as the owner who spends the day chasing answers. The entire difference is the system underneath.',
  },
  '5.3': {
    teach: 'Most recurring internal meetings exist to move information that should have been visible without a meeting. That is expensive. Six people for an hour a week is a lot of payroll spent on a status update. Replace one recurring meeting with a field anyone can look at any time. Keep the meetings that are for decisions and judgment, kill the ones that are for reporting. You will know which is which within two weeks.',
    example: 'One company killed a weekly ninety minute ops meeting and replaced it with a board. They kept a fifteen minute call for the actual decisions. That is six hours a week back across the team, permanently.',
  },
  '5.4': {
    teach: 'An employee who is quietly falling behind usually does not know it, because nobody, including them, has ever seen the number that would say so. The moment that number becomes visible to the person doing the work, behavior usually shifts before a manager says anything. This is much cheaper than management. It is also kinder, because nobody gets ambushed in a review about a pattern they never got to see. A dashboard the whole team can look at changes behavior on its own. The numbers do the job instead of you.',
    example: 'Do not start with a number that shames anyone. Start with one that is genuinely useful to the person doing the work.',
  },
  '5.5': {
    teach: 'Everything comes back to the owner because nobody ever wrote the rules. Not because the team is incapable. Five rules covers most of it in most companies. What we say yes to. What we say no to. What we charge and what changes it. When we refund and when we do not. When to actually call the owner. That last one matters most, because without it people either call about everything or nothing. Rules are not bureaucracy. They are what lets other people decide the way you would, which is the only version of delegation that survives contact with a busy week.',
    example: 'An owner who writes these five rules usually watches his phone volume drop within a month, without a single conversation about boundaries.',
  },

  // ---- FLOOR 6: INTELLIGENCE ----
  '6.1': {
    teach: 'Every customer teaches the business something. Every job teaches it something about timing, pricing, and what tends to go wrong. The cost of not capturing a lesson does not show up right away, which is exactly why it gets skipped. It shows up eighteen months later when a new hire makes the identical mistake a departed employee already learned not to make, and nobody remembers there was ever a lesson. Treat every job, good or bad, as a deposit into the company memory instead of something that ends when the invoice goes out. Then the business gets measurably smarter with each year instead of just older.',
    example: 'One line after each job. What went right. What went wrong. What we change. Thirty days of that is a better operations manual than most companies have ever written.',
  },
  '6.2': {
    teach: 'You should not have to go looking for problems. The system should raise its hand. A job sitting too long. An invoice past thirty days. A crew behind schedule. A part wearing out on a pattern. The difference between finding a problem on day two and day twenty is usually the difference between a phone call and a refund. Start with one alert, not ten, because ten alerts becomes noise and noise gets ignored, which is worse than having none.',
    example: 'Manufacturing lines go down without warning because nobody watched the wear pattern. Watch it on a schedule and the part gets replaced before it fails instead of after.',
  },
  '6.3': {
    teach: 'By the time the renewal passes or the cancellation email lands, you are not saving a relationship. You are trying to win someone back from nothing, which costs many times more and works much less often. The signal was there earlier. Activity dropped. Visits stopped. Orders got smaller. Nobody was watching for it because nobody was assigned to watch for it. Flag the quiet the day it starts and someone can reach out while there is still something to save.',
    example: 'Fitness businesses lose members who simply stopped showing up. Med spas lose patients who needed a six week check in and appear eight months later, if at all. Same pattern, different room.',
  },
  '6.4': {
    teach: 'This is where all the earlier floors pay off, and it is why it sits at Floor 6 instead of Floor 1. An assistant is only as good as what you feed it. Feed it the SOPs from Floor 2, the workflows from Floor 3, and the dashboard from Floor 5, and it can answer real questions about your operation instead of general questions about business. Feed it nothing and it will confidently make things up, which is exactly what happened to every owner who tried this before doing the work underneath.',
    example: 'Two invoices are more than fourteen days overdue, five leads have gone cold since Tuesday, and the Northfield job is a week behind. That is a real answer. It is only possible because six floors of information exist underneath it.',
  },
  '6.5': {
    teach: 'When something is breaking, the reflex is more hands. Sometimes that is right. Usually it means a floor is missing and you are about to pay a salary every year to cover a gap you could have closed once. Before the next hire, ask which floor is empty. Is it that information does not move, or does not land, or that the workflow was never written, or that a hope never became a trigger. Then decide whether you are hiring for judgment and relationships, which is a good reason, or hiring to be a human integration between two tools, which is not.',
    example: 'An intelligent company fixes the broken process before it hires more people to patch over the cracks. That single habit is worth more than most cost cutting exercises.',
  },

  // ---- FLOOR 7: LEADERSHIP AND THE DASHBOARD ----
  '7.1': {
    teach: 'Revenue, cash flow, open jobs, new leads, and every digital worker, live. Not a monthly report. Not a thing someone assembles for you. A view that is true right now and that you did not have to ask anyone for. This is the floor owners imagine when they picture an intelligent company, and it is the last one built, not the first, because a dashboard is only as honest as the six layers feeding it. A beautiful screen sitting on top of scattered information is a lie with good design.',
    example: 'Five minutes each morning. The owner already knows everything worth knowing and has not spoken to a single person yet.',
  },
  '7.2': {
    teach: 'Revenue tells you how big the business is. Owner dependency tells you whether you own a company or a job with employees. Count it honestly for one week. Every decision that needed you. Every approval. Every question only you could answer. Every call that got escalated. Then divide by the total. Most owners who think they have delegated come out somewhere near seventy percent, and seeing that number is usually the most useful five minutes of this entire school.',
    example: 'Down from seventy one percent to thirty eight percent in a quarter is a completely different company and often a completely different valuation.',
  },
  '7.3': {
    teach: 'Managers manage tasks you assign. A second in command owns a result and decides how to get there. The difference is whether things still come back to you. Hand over one whole area, not a list of jobs. Give them the rulebook from Floor 5 so they can decide the way you would. Give them the dashboard so they can see what you see. Then let them make a call you would have made differently and do not take it back, because taking it back once undoes six months of building.',
    example: 'A company cannot grow past the person leading it. If everything routes through you, you are not the leader. You are the ceiling.',
  },
  '7.4': {
    teach: 'This is the only exam that matters and it cannot be faked. Phone off. Two weeks. Not checking in twice a day. The business runs, reports on itself, and flags its own problems, or it does not. Whatever breaks in those two weeks is your actual gap list, and it is more accurate than any assessment because the business tells you the truth when you are not there to prop it up. Schedule it before you feel ready. Nobody feels ready.',
    example: 'Owners who pass this once never go back. Owners who keep postponing it are usually protecting themselves from finding out.',
  },
  '7.5': {
    teach: 'A buyer looking at two service companies with the same numbers will pay very differently once they look underneath. One depends on the owner memory, the owner relationships, and tribal knowledge that walks out the door the day the deal closes. The other runs on systems a new owner can step into on day one, with customer history, pricing logic, and workflows already documented and already working. The second one is not just easier to run. It is dramatically less risky to buy, and buyers pay for removed risk. Expect lean intelligent service businesses to start earning multiples that look more like software than like a local business, because a company systems are worth as much as its revenue. This holds whether you sell in two years or twenty. Every improvement makes the business worth more today.',
    example: 'Same road, different destination. Scale it, franchise it, hand it down, or walk away from it. It is the same build, because it is the same thing buyers, partners, and successors are actually paying for.',
  },
};

function contentFor(lessonId) {
  return CONTENT[lessonId] || null;
}

module.exports = { CONTENT, contentFor };
