// TMI rep objection + FAQ knowledge. Grounds api/rep-ask.js so the field copilot
// answers with TMI's real lines, not invented ones.
// Source of truth: the live site, tmitechai.com (intelligent-company-audit.html,
// pricing.html, faq.html, llms.txt). Rewritten Oct 2026 to match it:
//   - The rep's goal is the $5,000 Intelligent Company Audit, paid by link (text,
//     email or QR). If the owner is not ready: the free Fit Call with Mia and Tyler,
//     https://www.tmitechai.com/intelligent-company-audit.html#book, or a dated follow-up.
//   - Only published starting prices, framed as floors. No totals, ranges, timelines,
//     discounts, invented numbers or client stories.
// Shape: array of { q, a }. Keep it that way, rep-ask.js reads e.q and e.a.

module.exports = [
 // ---------- Core: what TMI is and what the rep sells ----------
 {
  "q": "What is TMI, in one line?",
  "a": "TMI is a Lafayette, Louisiana firm that installs the operating system of an intelligent company so industrial and family businesses can run, transfer, or sell without living in one person's head. Say it that way, word for word. In public always say TMI Tech AI, not TMI alone."
 },
 {
  "q": "Give me the thirty-second pitch.",
  "a": "TMI helps owners of established companies build a business that runs better without depending on them for everything. We go inside the operation, find where time, knowledge, visibility and opportunity are being lost, then build the systems, tools, brand and growth infrastructure around what already works. It starts with the Intelligent Company Audit. Then stop talking and ask them where everything still comes back to them."
 },
 {
  "q": "What am I actually selling at the door?",
  "a": "The Intelligent Company Audit, $5,000. It is 30 to 45 minutes, in person or by phone, and it looks at how the company sells, operates, communicates, tracks information and makes decisions. They get a Business Intelligence Score out of 100 across ten areas, a five-page report, and the Intelligent Company Roadmap, which they own outright. When they say yes, send the payment link by text or email, or let them scan the QR."
 },
 {
  "q": "What if the owner is interested but not ready to pay today?",
  "a": "Offer the Fit Call with Mia and Tyler. It is free, 20 to 30 minutes, and it decides whether TMI should come inside the company at all. Book it with them at tmitechai.com/intelligent-company-audit.html#book. If they will not book that either, set a dated follow-up. Never leave without a person, an action and a date."
 },
 {
  "q": "What is the one way in? Where do I send people?",
  "a": "One page: tmitechai.com/intelligent-company-audit.html. Ready to buy, send the audit payment link or show the QR. Not ready, book the free Fit Call from the #book section of that page. Everything else on the site, including pricing, hangs off tmitechai.com."
 },
 {
  "q": "What are we not?",
  "a": "TMI is not an AI agency, not an IT company, not a marketing agency and not a consultant. It is a company-building company. AI is one tool, and often not the first thing a company needs."
 },
 {
  "q": "Is TMI an AI company?",
  "a": "No, and do not call it one. TMI works on the company itself: operations, intelligence, brand, attention and growth. AI is one tool inside that, and a lot of companies need their records connected and their knowledge written down long before AI does anything useful for them."
 },
 {
  "q": "What is the method?",
  "a": "Assess, design, build, integrate, evolve. The audit is the assess step. The principle under all of it is preserve what works, modernize what does not. We do not replace your best people, we multiply them."
 },
 {
  "q": "Who is TMI built for? Which industries should I focus on?",
  "a": "Established industrial and family businesses with a real operation: manufacturers, machine shops, oil and gas, construction, logistics and fleet, field service, marine and equipment. Talk to the owner, and to the son or daughter taking it over. Outside industrial is fine when it is a genuine fit, but lead with industrial."
 },
 {
  "q": "How do I qualify a prospect?",
  "a": "An established company with employees, customers and more than one system, where the owner is still the answer to every question. Listen for knowledge living in two or three people's heads, software the team works around, and a handover coming. If someone there can say yes to $5,000, they are a fit for the audit."
 },
 {
  "q": "What openers actually land?",
  "a": "Owners recognise problems, not services. Try: Everything still comes back to you. You bought software and the team works around it. Your best knowledge lives in two or three people, and one of them is talking about retiring. You could not disappear for thirty days without being called. Then let them talk, about seventy of every hundred words should be theirs."
 },
 {
  "q": "What do we look for inside a company?",
  "a": "Where time, knowledge, visibility and opportunity are being lost. Usually that is an owner who is the bottleneck, knowledge in a few heads, software nobody uses the way it was sold, the same information typed twice, and reports nobody trusts. Ask the owner which one they felt this week."
 },
 {
  "q": "How do I get paid?",
  "a": "When the audit link you send is paid, you are credited. Commission is 10% of what the client pays, on the audit and on every upsell on that account after it, including implementation, retainers and add-ons. Your manager sets your targets."
 },
 {
  "q": "Do I need to know the tech to sell this?",
  "a": "No. You need the owner's problem, the audit, the price, and the next step. Mia, Tyler and the build team own the how. Your job is the paid audit, or a booked Fit Call, or a dated follow-up."
 },
 {
  "q": "What if a prospect asks something I don't know?",
  "a": "Say: good question, that is one for Mia and Tyler, and they will answer it straight. Never make something up, especially on price, timelines, compliance or results. Then offer the audit or the Fit Call."
 },

 // ---------- Price ----------
 {
  "q": "\"Why isn't the audit free?\"",
  "a": "Because a free audit is a sales call wearing a costume, and you would see through it. The audit has a price because it is a fixed thing: a score out of 100, a five-page report and a roadmap. The roadmap is yours whether or not you ever hire TMI. If you only want a conversation about fit first, that is the Fit Call, and that part has never cost anything."
 },
 {
  "q": "\"What's the catch?\"",
  "a": "It costs $5,000 and it is worth exactly what it says. You get a score, a report and the Intelligent Company Roadmap, and you own it. The roadmap is written so another firm could carry it out, so you are not locked into us."
 },
 {
  "q": "\"It's too expensive.\"",
  "a": "Fair question to ask. Let me ask you one back: how many hours a week do you spend answering questions only you can answer? What does that hour cost you? The audit is a fixed $5,000 and you keep the roadmap either way. If you want to talk fit before spending anything, I can set you up with the free 20 to 30 minute Fit Call with Mia and Tyler."
 },
 {
  "q": "\"I don't have the budget right now.\"",
  "a": "Understood. When does your budget turn over? Let me put a date on it and come back then. In the meantime the Fit Call with Mia and Tyler costs nothing and tells you whether the audit is even what you need yet."
 },
 {
  "q": "What does a build cost?",
  "a": "Builds start around fifteen thousand. What it actually costs depends on how many departments it touches, how much has to be built versus connected, and how much knowledge has to come out of people's heads. You would get a real number in writing after the audit, not before."
 },
 {
  "q": "What are the published starting prices?",
  "a": "These are floors, not quotes. Audit $5,000. Intelligent Company Builds and Company Operating Systems from $15,000. Business Intelligence and Custom Software from $10,000. Automation from $3,500. Digital Employees, Human Performance and Company Brain from $5,000. Embedded Company Partner from $3,500 a month, six month minimum. Brand and Website from $7,500. Never quote a total or a range for their size. Point them to tmitechai.com/pricing.html."
 },
 {
  "q": "\"So what would the whole thing cost for a company my size?\"",
  "a": "I honestly cannot tell you, and anyone who quotes you at the door is guessing. Builds start around fifteen thousand, and the real number depends on how much it touches and how much has to come out of people's heads. You get that number in writing after the audit, fixed scope, fixed price, before any work starts."
 },
 {
  "q": "\"Can you do a discount or a trial?\"",
  "a": "No. The price is fixed because the audit is a fixed thing, and everyone pays the same. If you want to check fit before paying, the Fit Call with Mia and Tyler is free."
 },
 {
  "q": "\"How long does a build take?\"",
  "a": "That depends on what the audit finds, so I will not promise you a date at the door. Everything after the audit is fixed scope, fixed price, in writing before work begins, and the timeline is set in that document."
 },
 {
  "q": "\"Is there a monthly fee after you build it?\"",
  "a": "That depends on what gets built and what it runs on. Some clients want ongoing support, which is optional, and third-party software costs are separate. You will see all of it in writing before you agree to anything."
 },

 // ---------- Owner and people ----------
 {
  "q": "\"I don't have time for this.\"",
  "a": "That is usually the problem itself. If everything still comes back to you, there is no time left to fix the thing that sends it back to you. The audit is 30 to 45 minutes, by phone if that is easier. When could you give it 45 minutes this week?"
 },
 {
  "q": "\"Everything runs fine, we're doing well.\"",
  "a": "Good, then there is a lot worth protecting. Can I ask, what happens if you are gone for a month? Who answers the questions you answer today? If the answer is nobody, that is what the audit looks at."
 },
 {
  "q": "\"My guys know how everything works.\"",
  "a": "That is the asset and the risk at the same time. If your best knowledge lives in two or three people, what happens when one of them retires or leaves? We get what is in their heads into the company, so it stays when they go, and we do it without changing how good they are at the work."
 },
 {
  "q": "\"Is this going to replace my staff?\"",
  "a": "No. Our line is: do not replace your best people, multiply them. We take the repeat work and the retyping off their plate and put the knowledge they carry into the company, so they spend their day on the work you hired them for."
 },
 {
  "q": "\"My son (or daughter) is taking over soon.\"",
  "a": "Then this is the right time. They inherit a business that works and almost none of the reasons why. The audit and the roadmap get what lives in your head into the company, so they can run it without being the one who broke something that was fine. It is worth having them on the call."
 },
 {
  "q": "\"I'm thinking about selling in a few years.\"",
  "a": "Then the question is whether a buyer sees a company or equipment plus your memory. The audit shows how much of the business runs on you, and the roadmap is a document you can hand to a banker or a buyer. Want to start there?"
 },
 {
  "q": "\"My team won't use it.\"",
  "a": "Most software fails for operations reasons, not because people are unwilling. The team works around it because it was never built around how they actually work. We walk the floor, follow a job from quote to invoice, build with the crew who will use it, and stay until it is in use. Which system does your team work around today?"
 },
 {
  "q": "\"My business is too niche. You don't understand my industry.\"",
  "a": "Fair worry. That is why TMI goes on site, walks the floor and follows a real job from quote to invoice before suggesting anything. And if TMI is wrong for you, Mia and Tyler will tell you on the Fit Call. Want me to set that up?"
 },

 // ---------- Software and systems they already have ----------
 {
  "q": "\"I already have software. We use an ERP / ServiceTitan / QuickBooks / whatever.\"",
  "a": "Good, keep it. We are not here to rip it out. The question is whether it talks to everything else and whether your people actually use it. Is anything typed twice, or kept in a spreadsheet next to it? That gap is what the audit maps."
 },
 {
  "q": "\"We run SAP / Maximo already, we are not tearing out our systems.\"",
  "a": "Do not tear them out. Preserve what works, modernize what does not. The audit looks at how those systems connect to the rest of the operation and where people fill the gaps by hand. Where does information still get re-entered or carried around on paper?"
 },
 {
  "q": "\"We have a preventive maintenance schedule already.\"",
  "a": "Good. How many breakdowns last year were on equipment that was on schedule? And where does the maintenance history live, in the system or in a mechanic's head? Those two answers tell you whether there is something to fix."
 },
 {
  "q": "\"Our fleet tracking already gives me all the reports I need.\"",
  "a": "Then you have the data, which is a good start. Who reads those reports, and what decision changed because of one last month? If the answer is not much, the gap is between the data and the decision, and that is what we look at."
 },
 {
  "q": "\"My project managers already know their numbers.\"",
  "a": "They know them because they carry them in their head. What happens to those numbers when a PM is on vacation or leaves? And when do you find out a job went over, while it is happening or at closeout? The audit looks at exactly that."
 },
 {
  "q": "\"We tried software before and nobody used it.\"",
  "a": "That happens to almost every company we see, and it is usually not the software's fault or the crew's. It was bought before anyone mapped how the work actually moves. The audit does that mapping first, so anything built after it fits the work."
 },
 {
  "q": "\"I tried AI before and it didn't work.\"",
  "a": "I believe you. A lot of companies bought a tool before their records were connected or their knowledge was written down, so there was nothing for it to work with. TMI is not an AI company. We start with the operation, and AI comes in only where it actually fits."
 },
 {
  "q": "\"Is this just a chatbot?\"",
  "a": "No. TMI works on the company itself: how work moves, where knowledge lives, what the owner can see, and how the company shows up to buyers. Sometimes that includes a digital employee or automation, but only where the audit says it fits."
 },
 {
  "q": "\"Do I have to replace everything I'm running?\"",
  "a": "No. Preserve what works, modernize what does not. The audit works out which two or three things matter most, and nothing is built until you have a fixed scope and fixed price in writing."
 },

 // ---------- Trust, timing, decision makers ----------
 {
  "q": "\"How is this different from every other AI or software company?\"",
  "a": "Most of them sell you a tool and leave. TMI goes on site, walks the floor, builds with the crew who will use it and stays until it is in use, with no offshore handoff. And it starts with the audit, so nothing gets sold before anyone understands the operation."
 },
 {
  "q": "\"How do I know it'll actually work for me?\"",
  "a": "You should not take my word for it. That is what the audit is for: a score, a report and a roadmap built from your own operation. And on the Fit Call Mia and Tyler will tell you straight if TMI is wrong for you."
 },
 {
  "q": "\"Do you have case studies or results from other clients?\"",
  "a": "TMI does not publish client results or name clients, and I will not make up a number for you. What I can do is get you your own number. How many quotes went out last month, and how many never got a follow-up?"
 },
 {
  "q": "\"Is my data safe? I'm not comfortable handing over my business info.\"",
  "a": "Good instinct. What you tell TMI stays with TMI and never moves between clients. If you want a mutual NDA before the call, say so and it gets signed first."
 },
 {
  "q": "\"Now's not a good time. Circle back next quarter.\"",
  "a": "That works. What date should I put down? And if it helps, the Fit Call is free and 20 to 30 minutes, so you can find out now whether the audit is even the right next step and plan around it."
 },
 {
  "q": "\"I need to talk to my partner / spouse / the other owner first.\"",
  "a": "Of course. The best way is to have them on the Fit Call with Mia and Tyler, so you both hear it at once. When are you both around? If you would rather decide between you, I will follow up on a date you pick."
 },
 {
  "q": "\"Just send me some info.\"",
  "a": "Happy to. I will text you the audit page so you can see exactly what you get and what it costs. Can I follow up Thursday to see if you want to book it or start with the Fit Call?"
 },
 {
  "q": "\"We are a small shop, this sounds like it's for bigger companies.\"",
  "a": "If you have employees, customers and more than one system, there is something to look at. The audit is built for established operations, and if you are outside that, Mia and Tyler will tell you on the Fit Call rather than after you pay."
 },
 {
  "q": "\"Our website is fine, we get work from word of mouth.\"",
  "a": "Word of mouth is a good sign about the work. The question is what a new customer or a new hire finds when they look you up, and more of them ask an AI assistant first now. Is your company better than your website makes it look?"
 },

 // ---------- Other fits (not the core audience) ----------
 {
  "q": "\"I run a clinic / med spa / office, not an industrial company. Is this for me?\"",
  "a": "Maybe. TMI is built around industrial and family businesses, but it works outside that when the company is a real fit: employees, customers, more than one system, and an owner everything comes back to. The Fit Call with Mia and Tyler is the honest way to find out."
 },
 {
  "q": "\"Our front desk handles the phones fine.\"",
  "a": "Maybe they do. Do you know how many calls go unanswered after five or at lunch? If you do not have that number, that is worth knowing before deciding anything. The audit looks at how work comes in and where it gets dropped."
 },
 {
  "q": "\"Client confidentiality means I cannot hand this to anyone.\"",
  "a": "Understood. What you tell TMI stays with TMI and never moves between clients, and a mutual NDA can be signed before anyone speaks. Your confidential work stays with your people. The audit looks at how the business runs around it."
 },

 // ---------- Rep rules ----------
 {
  "q": "Can I promise results, timelines or savings?",
  "a": "No. Never promise a result, a percentage, a savings number, a start date or a timeline, and never offer a discount or a trial. TMI publishes no case studies or outcome numbers. If you need a number, ask the owner for theirs."
 },
 {
  "q": "Can I quote a price for the build?",
  "a": "Only the published starting prices, as floors. The safe line is: builds start around fifteen thousand, and you would get a real number in writing after the audit, not before. Never give a total, a range, or a guess for their size."
 },
 {
  "q": "Is the Intelligent Company Audit the same as the Intelligent Company Assessment?",
  "a": "No. The audit is the $5,000, 30 to 45 minute entry offer you sell. The Assessment is a different, deeper on-site product that starts at $15,000. Do not mix them up, and only ever call the audit the Intelligent Company Audit."
 },
 {
  "q": "Can I take photos inside their shop?",
  "a": "Not without asking first. Never post about a visit or photograph inside a facility without the owner's permission."
 }
];
