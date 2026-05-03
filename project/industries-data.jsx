// Deep industry data for industries.html
const INDUSTRIES = [
  {
    id: "upstream", name: "Upstream", primary: true,
    headline: "Find more. Drill smarter. Produce longer.",
    lede: "AI cuts geological analysis from months to weeks, optimizes drilling in real time, and trims your methane footprint without touching a clipboard. The asset base you already have starts producing more — and the next one gets developed faster, cheaper, and with a smaller environmental load.",
    narrative: [
      "Upstream operators are sitting on petabytes of seismic, log, and production data that have never lived in the same room. The geology team interprets one slice. The drilling team optimizes another. The production engineers see a third. Stratum unifies all three under one model so the bit, the basin, and the budget point in the same direction.",
      "On the rig, real-time torque, ROP, and pore-pressure signals feed an agent that adjusts parameters before the driller has to. In the office, the same agent updates the well plan, the AFE, and the regulator's report. Methane LDAR runs in the background, continuously, with quantified emissions per source — not a manual sweep every quarter.",
      "Two years in, the asset map looks different. Wells decline more slowly. New developments get to first oil faster. The methane number that used to be a liability is a competitive advantage on the next bid round.",
    ],
    day: {
      label: "A day on a Stratum-instrumented rig",
      steps: [
        { time: "04:12", what: "Vibration anomaly on top-drive caught at signature, not at failure. Agent throttles ROP and notifies tool-pusher." },
        { time: "07:30", what: "Morning report assembles itself. AFE variance, NPT root cause, and methane intensity all timestamped and traceable." },
        { time: "11:55", what: "Pore-pressure model updates from offset-well data. Mud weight recommendation reaches the driller in seconds." },
        { time: "16:40", what: "End-of-day reconciliation closes 38 entries that used to be a 90-minute job for a night-shift engineer." },
      ],
    },
    features: [
      { k: "Geology", t: "Months → weeks", b: "Subsurface interpretation accelerated by models trained on your basin and your wells, not someone else's." },
      { k: "Drilling", t: "Real-time optimization", b: "Live torque, ROP, and pore-pressure adjustments that keep the bit in the right rock and out of the wrong one." },
      { k: "Production", t: "Decline arrested", b: "Choke, ESP, and artificial-lift settings tuned continuously per well — not by quarterly review." },
      { k: "Emissions", t: "Methane LDAR, automatic", b: "Continuous leak detection and quantification — reportable to regulators without a separate workflow." },
    ],
    stats: [
      { num: "−42%", lbl: "Non-productive time on optimized rigs" },
      { num: "3.2×", lbl: "Faster geological reinterpretation cycles" },
      { num: "+8.4%", lbl: "Recoverable reserves on mature assets" },
      { num: "100%", lbl: "Coverage of methane sources, continuously" },
    ],
    stack: ["Petrel · Landmark · Kingdom", "WellView · OpenWells", "OSIsoft PI · Cygnet", "Aveva PRO/II", "FLIR · Bridger · ChampionX OGI"],
  },
  {
    id: "midstream", name: "Midstream", primary: true,
    headline: "Pipeline integrity. Smart logistics.",
    lede: "Continuous monitoring across thousands of kilometers, with anomaly detection that runs faster than the regulator's clock. Custody-transfer accuracy holds. Throughput goes up. The compliance binder writes itself.",
    narrative: [
      "Midstream lives on uptime and integrity. Every kilometer of pipe and every cubic meter of throughput is a regulatory event waiting to happen — and a margin opportunity waiting to be captured. The systems that monitor that pipe today were built one segment at a time, by different vendors, in different decades.",
      "Stratum fuses pressure, flow, acoustic, and inline-inspection data into a single confidence score per segment. Anomalies get ranked by likelihood, consequence, and time-to-action. The control room sees one list, sorted, with the right people already paged.",
      "On the logistics side, batch scheduling, custody transfer, and tariff calculations all run against the same source of truth — so the throughput number, the tax number, and the customer's number agree on the first try.",
    ],
    day: {
      label: "A day on a Stratum-monitored pipeline",
      steps: [
        { time: "02:18", what: "Acoustic signature inconsistent with normal flow. Agent localizes to KP 184.3 ± 40m, dispatches drone, files PHMSA pre-notice." },
        { time: "06:00", what: "Batch hand-off completes with auto-generated custody ticket. No manual reconciliation queue this morning." },
        { time: "13:22", what: "ILI tool data ingested overnight; corrosion model updates, prioritized dig list refreshes for next 90 days." },
        { time: "20:05", what: "End-of-day NEB-equivalent report ready for sign-off — no spreadsheet assembly." },
      ],
    },
    features: [
      { k: "Integrity", t: "Anomaly detection", b: "Pressure, flow, acoustic, and ILI signals fused into a single confidence score per segment." },
      { k: "Routing", t: "AI-optimized scheduling", b: "Throughput improvements that don't trade against custody-transfer accuracy." },
      { k: "Custody", t: "Reconciled in real time", b: "Tickets, tariffs, and tax all agree on the first close — not after a week of accounting back-and-forth." },
      { k: "Compliance", t: "Auto-reportable", b: "PHMSA, NEB, and equivalent documentation generated as the pipeline runs." },
    ],
    stats: [
      { num: "−28%", lbl: "Loss & shrinkage reduction" },
      { num: "12×", lbl: "Faster anomaly-to-acknowledgment" },
      { num: "+6%", lbl: "Effective throughput on existing assets" },
      { num: "0", lbl: "Manual report assembly hours" },
    ],
    stack: ["Aveva Wonderware", "Quorum TIPS · Energy Components", "Synergi Pipeline · ROSEN ILI", "Honeywell Experion", "Atmos · LeakSpy"],
  },
  {
    id: "refining", name: "Refining", primary: true,
    headline: "Autonomous scheduling. Zero-surprise maintenance.",
    lede: "Refineries operate harder and longer when the schedule, the maintenance plan, and the inspection log all live in the same loop. Crude slate, unit availability, and demand signals reconcile hourly — not weekly.",
    narrative: [
      "A modern refinery is the most complex industrial asset on Earth, and the systems running it were stitched together over forty years. APC tunes one tower. The DCS sees another. The CMMS lives in its own world. Crude scheduling sits in a spreadsheet that one person updates by hand on Tuesday afternoons.",
      "Stratum gives the operation one model. Crude slate, unit constraints, demand signals, and maintenance state all feed the same scheduling agent. When the FCC trips, the agent already knows what the rest of the plant should do — and the operators see the recommended response in seconds, not in shift handover.",
      "Maintenance shifts from calendar to condition. Vibration, temperature, and acoustic signatures from your historian flag the bearing two weeks before it would have failed — and the work order, the parts, and the contractor are scheduled into the same window.",
    ],
    day: {
      label: "A day in a Stratum-coordinated refinery",
      steps: [
        { time: "05:45", what: "Crude slate arrives 4 hours late. Agent re-optimizes the day's run, surfaces unit-by-unit margin impact for the planning lead." },
        { time: "10:14", what: "Vibration trend on P-301 crosses signature threshold. Work order, parts, and 4-hour outage scheduled into next planned downtime." },
        { time: "14:00", what: "Inspector tablet captures a thickness reading. CML history, RBI score, and next-due date update before the inspector is back at the truck." },
        { time: "22:30", what: "Day closed: utilization +1.4 pts vs. plan, no manual reconciliation, no end-of-day overtime." },
      ],
    },
    features: [
      { k: "Schedule", t: "Agent-managed", b: "Crude slate, unit availability, and demand signals reconciled hourly — not weekly." },
      { k: "Maintenance", t: "Predict, don't react", b: "Failure-mode signatures from your historian catch the bearing before it catches you." },
      { k: "Inspection", t: "Digital, traceable", b: "Mobile capture replaces clipboard. Every reading carries a timestamp, a person, and a chain of custody." },
      { k: "Energy", t: "Tuned continuously", b: "Steam, fuel-gas, and power balance optimized against marginal cost — not against a setpoint someone wrote in 2014." },
    ],
    stats: [
      { num: "+9%", lbl: "Effective utilization" },
      { num: "−61%", lbl: "Unplanned downtime hours" },
      { num: "−4.2%", lbl: "Energy per barrel processed" },
      { num: "100%", lbl: "Inspection traceability" },
    ],
    stack: ["Honeywell DCS · Yokogawa CENTUM", "Aspen DMC3 · PIMS", "SAP PM · Maximo", "OSIsoft PI", "Meridium · Bentley APM"],
  },
  {
    id: "downstream", name: "Downstream & Retail", primary: true,
    headline: "Dynamic pricing. Smarter inventory. Better margin.",
    lede: "Real demand signals drive pricing. Inventory anticipates instead of reacts. Customer interactions personalize at scale — every site, every day, without adding headcount.",
    narrative: [
      "Downstream margin lives in two places: pricing decisions made hourly, and inventory decisions made at the right moment. Most retail networks are running 2010-era pricing engines, weekly survey data, and tank gauges that call dispatchers at 2am because nobody saw the curve coming.",
      "Stratum re-grounds the operation in real signals. Per-site, per-hour pricing reflects the competitive set as it actually is — not as last week's panel reported it. Inventory drops trigger from forecast, weather, traffic, and tank curve, not from a set point. Loyalty offers match the customer at the pump, not the customer in the segmentation deck.",
      "Across the network, the headcount stays flat. Margin per gallon goes up. The 2am dispatcher call goes away.",
    ],
    day: {
      label: "A day across a Stratum-priced network",
      steps: [
        { time: "06:00", what: "Per-site pricing rolls based on local competitive set, traffic, and inventory position. 1,400 sites, ~38 seconds." },
        { time: "11:42", what: "Tank curve at site 0931 trending steep. Agent moves a drop forward 6 hours, reroutes carrier, no call placed." },
        { time: "15:30", what: "Loyalty offer surfaced for a customer mid-fuel: 6¢/gal off the premium they actually buy. Margin holds; conversion lifts." },
        { time: "23:00", what: "Day closed: +4.1¢/gal margin lift vs. control sites, 0 stockouts, dispatchers home on time." },
      ],
    },
    features: [
      { k: "Pricing", t: "Per-site, per-hour", b: "Margin-aware decisions that reflect the actual competitive set, not yesterday's survey." },
      { k: "Inventory", t: "Anticipatory", b: "Drops triggered by forecast, not by the tank gauge calling at 2am." },
      { k: "CX", t: "Personalized at scale", b: "Loyalty offers that match the customer in front of the pump, not the customer in last quarter's segment." },
      { k: "Forecourt", t: "Anomalies caught", b: "Skim devices, dispenser drift, and shrink patterns flagged automatically across the network." },
    ],
    stats: [
      { num: "+4.1¢", lbl: "Margin per gallon, average lift" },
      { num: "−18%", lbl: "Stockouts" },
      { num: "2.3×", lbl: "Loyalty engagement" },
      { num: "−74%", lbl: "After-hours dispatcher calls" },
    ],
    stack: ["Kalibrate · PriceAdvantage", "Wayne · Gilbarco POS", "FuelQuest · Titan", "Fivetran · Snowflake"],
  },
  {
    id: "construction", name: "Construction", primary: false,
    headline: "Field operations that finally talk to the office.",
    lede: "Crews, equipment, and project plans on the same backbone — so the gap between the trailer and the trench closes. Schedules update when reality does, not when somebody remembers to log it.",
    narrative: [
      "Construction is run on the most fragmented stack in the trades. Project management lives in one tool, time and safety in another, equipment telematics in a third, and the people on site juggle paper between them. The result is a 25–35% productivity gap versus other industries and a safety record nobody is proud of.",
      "Stratum closes the gap by giving the trailer the same picture as the office. Crew dispatch, time, safety attestation, equipment health, and schedule progress flow through one capture surface on every site. The supervisor stops chasing paperwork and starts running the job.",
    ],
    day: { label: "A day on a connected jobsite", steps: [
      { time: "06:30", what: "Crew clocks in via mobile capture. Toolbox talk acknowledged, attestations stored." },
      { time: "10:00", what: "Excavator idle hours flagged; agent reroutes a second crew that needs it nearby." },
      { time: "14:15", what: "Concrete pour delayed by 90 minutes. Schedule re-optimizes. Subs notified before they arrive." },
      { time: "17:00", what: "Daily report writes itself from captured data. Supervisor signs and goes home." },
    ]},
    features: [
      { k: "Crews", t: "Live coordination", b: "Dispatch, time, safety attestation — one capture surface, every site." },
      { k: "Equipment", t: "Utilization & health", b: "Telemetry from every machine surfaces idle hours and failure precursors before they bite." },
      { k: "Schedule", t: "Adaptive plans", b: "Plans that update when reality does, not when somebody remembers to update them." },
      { k: "Safety", t: "Lagging → leading", b: "Near-miss capture and attestation patterns generate leading indicators that actually move outcomes." },
    ],
    stats: [
      { num: "+22%", lbl: "Equipment utilization" },
      { num: "−35%", lbl: "Safety reporting time" },
      { num: "+14%", lbl: "Schedule adherence" },
      { num: "1×", lbl: "Source of truth, not three" },
    ],
    stack: ["Procore · PlanGrid", "ToolWatch · Trackunit", "Sage · Viewpoint", "OpenSpace · DroneDeploy"],
  },
  {
    id: "manufacturing", name: "Manufacturing", primary: false,
    headline: "Plant floor data, finally one shape.",
    lede: "Lines, cells, and ERPs that have never spoken to each other — connected without a forklift upgrade. Real OEE, hourly. Quality drift caught at signal.",
    narrative: [
      "Most plants run on a stack the systems integrator left ten years ago. The MES sees the line. The ERP sees the order. Quality lives in a folder. OEE is reconstructed Monday morning from yesterday's mood. Stratum unifies the layer beneath them so the numbers agree by 9am, not by Wednesday.",
      "Quality drifts get caught when they're still just signal — not when they're scrap. MRO inventory follows the line, not the calendar. The plant manager starts the morning meeting with one report, generated automatically, that everyone trusts.",
    ],
    day: { label: "A shift on an instrumented line", steps: [
      { time: "07:00", what: "OEE board lights up live for the morning standup. No reconstruction, no Excel." },
      { time: "10:48", what: "Cell-3 dimensional drift detected; agent slows feedrate and pings the QE before the next 200 parts go to scrap." },
      { time: "14:00", what: "Predicted bearing failure on Line-B compressor; spare-part already pulled, work scheduled into changeover window." },
      { time: "19:30", what: "Shift handoff brief generates from the data, not from memory." },
    ]},
    features: [
      { k: "OEE", t: "Real OEE, hourly", b: "No more end-of-shift reconstructions. The number is right because the data is connected." },
      { k: "Quality", t: "Drift detection", b: "Out-of-spec trends caught at signal, not at scrap." },
      { k: "MRO", t: "Predictive parts", b: "Spare-parts inventory that follows the lines, not the calendar." },
      { k: "Energy", t: "Per-cell tracked", b: "Energy intensity per part, per cell, per hour — surfaced where decisions are made." },
    ],
    stats: [
      { num: "+11%", lbl: "OEE on instrumented lines" },
      { num: "−47%", lbl: "Scrap from drift events" },
      { num: "2×", lbl: "Forecast accuracy on MRO" },
      { num: "−6.8%", lbl: "Energy per unit produced" },
    ],
    stack: ["Rockwell · Siemens PLC", "SAP · Oracle ERP", "MES (Wonderware · GE Proficy)", "Ignition · OPC-UA"],
  },
  {
    id: "mining", name: "Mining", primary: false,
    headline: "Pit to port, on one backbone.",
    lede: "Fleet, processing, and logistics that finally share a clock. Recovery up. Idle hours down. The next autonomous step is a configuration, not a capital project.",
    narrative: [
      "Mining operations span the most heterogeneous environments in industry — pit, plant, rail, port — each with its own islands of telemetry. Stratum unifies them so dispatch, processing, and logistics can finally trade off against each other instead of against themselves.",
      "Grade control models learn from your ore body, not a textbook. Plant recovery responds to feed in real time. The fleet you have today produces more, and the fleet you replace tomorrow drops onto a foundation that was already autonomous-ready.",
    ],
    day: { label: "A shift across pit and plant", steps: [
      { time: "06:00", what: "Dig plan auto-updates from overnight blast assay. Trucks routed to feed quality the plant is configured for." },
      { time: "11:20", what: "Plant recovery dips 0.4 pts; agent traces to bearing wear in primary mill, schedules service in next planned stop." },
      { time: "16:00", what: "Train slot opens 2 hours early; logistics agent re-sequences port stockpile feed automatically." },
    ]},
    features: [
      { k: "Fleet", t: "Autonomous-ready", b: "Telemetry, dispatch, and condition monitoring on a foundation that scales to driverless when you are." },
      { k: "Processing", t: "Yield optimization", b: "Grade and recovery models that learn from your ore body, not a generic textbook." },
      { k: "Logistics", t: "Pit-to-port", b: "Trains, trucks, and ships scheduled against the same plan, not against each other." },
      { k: "Tailings", t: "Continuously monitored", b: "Pore pressure, deformation, and stability scored every minute, surfaced before they become an event." },
    ],
    stats: [
      { num: "+7%", lbl: "Plant recovery uplift" },
      { num: "−14%", lbl: "Fleet idle hours" },
      { num: "+5.2%", lbl: "Throughput pit-to-port" },
      { num: "1", lbl: "Plan, not five" },
    ],
    stack: ["Modular Mining · Wenco", "Pitram · MineStar", "Citect · Aveva", "Maptek · Vulcan"],
  },
  {
    id: "utilities", name: "Utilities", primary: false,
    headline: "The grid the way your operators wish it ran.",
    lede: "Asset, outage, and demand intelligence — without a multi-year ADMS replacement.",
    narrative: [
      "Utilities are pinned between an aging asset base, climbing demand volatility, and a regulator that wants more data than the legacy ADMS was ever designed to produce. Most operators can't justify a five-year platform replacement to fix that. Stratum doesn't ask them to.",
      "We sit beneath the ADMS, the GIS, and the OMS and connect them. Asset health, outage prediction, and demand forecasting run on top — without ripping anything out. The control room sees a clearer picture today, and the platform replacement, when it comes, is shorter and safer.",
    ],
    day: { label: "A day on a Stratum-augmented grid", steps: [
      { time: "05:30", what: "Storm probability for the day surfaces; staging crews pre-positioned per agent recommendation." },
      { time: "13:14", what: "Feeder-432 anomaly: cable pre-fault signature detected; switching plan ready before the customer hears." },
      { time: "18:00", what: "Demand peak handled with DR signal sent to validated participants; capacity charge avoided." },
    ]},
    features: [
      { k: "Assets", t: "Health-aware", b: "Transformer, breaker, and feeder health continuously scored and prioritized." },
      { k: "Outages", t: "Faster restoration", b: "Crew, customer, and asset signals fused into one situational picture." },
      { k: "Demand", t: "Forecast on your data", b: "Models tuned to your service territory, your weather, your customers." },
      { k: "Vegetation", t: "Risk-scored", b: "Imagery + climate + species data ranks spans by ignition risk, not by trim cycle." },
    ],
    stats: [
      { num: "−24%", lbl: "Average restoration time" },
      { num: "+19%", lbl: "Forecast accuracy" },
      { num: "−31%", lbl: "Vegetation-related ignitions" },
      { num: "0", lbl: "ADMS rip-and-replace" },
    ],
    stack: ["GE ADMS · Schneider EcoStruxure", "Esri GIS · Smallworld", "OSIsoft PI · eDNA", "AMI head-end · Itron · Landis"],
  },
  {
    id: "field", name: "Field Services", primary: false,
    headline: "First-time fix, by default.",
    lede: "Dispatch, parts, and knowledge in the same hand. The truck rolls once.",
    narrative: [
      "Field service is a coordination problem disguised as a technical one. The right tech, with the right parts, with the right knowledge, in the right window — when any one of those is wrong, the truck rolls twice. Stratum lines all four up before dispatch.",
    ],
    day: { label: "A day across a connected fleet", steps: [
      { time: "07:00", what: "Routes published with skill match, parts loaded, customer ETA windows tightened to the half-hour." },
      { time: "10:42", what: "Tech arrives, scans asset, sees the senior tech's last fix surfaced as a relevant precedent." },
      { time: "14:20", what: "Job closes first time; auto-invoice fires before the truck pulls away." },
    ]},
    features: [
      { k: "Dispatch", t: "Skill-aware", b: "The right tech, the right truck, the right window — without a coordinator on the phone." },
      { k: "Parts", t: "On the truck", b: "Predictive parts loadouts that match the route, not the warehouse." },
      { k: "Knowledge", t: "In context", b: "The fix the senior tech figured out last quarter, surfaced when this tech needs it." },
      { k: "Billing", t: "Closed in the cab", b: "Job cost, parts, and labor reconcile on the spot — invoicing before the truck is back in the bay." },
    ],
    stats: [
      { num: "+17%", lbl: "First-time fix rate" },
      { num: "−21%", lbl: "Truck rolls per work order" },
      { num: "3×", lbl: "Knowledge reuse" },
      { num: "−2 d", lbl: "DSO improvement" },
    ],
    stack: ["ServiceMax · Salesforce FSL", "Samsara · Geotab telematics", "NetSuite · QuickBooks"],
  },
  {
    id: "hvac", name: "HVAC, Electrical, Plumbing", primary: false,
    headline: "Trades-grade ops, not office software.",
    lede: "Built for crews on the ground, dispatch in motion, equipment in homes — not for someone behind a desk drawing org charts.",
    narrative: [
      "Trades businesses are running on seven apps that don't talk: dispatch, quoting, parts, payroll, accounting, customer messaging, and a CRM bolted on top. The owner spends Sunday reconciling. The techs spend Friday afternoons on paperwork. Stratum collapses the seven into one connected backbone — without forcing anyone to switch their favorite tool.",
    ],
    day: { label: "A day across a trades operation", steps: [
      { time: "07:30", what: "Day's routes optimized; recurring-service contracts pre-loaded; quote follow-ups queued." },
      { time: "11:12", what: "On-site quote signed; parts pulled from local supply house, ETA tracked, warranty activated." },
      { time: "16:00", what: "Daily numbers close: revenue, payroll, AR, all reconciled before the trucks are home." },
    ]},
    features: [
      { k: "Quote", t: "On site, signed", b: "Instant pricing with the parts and labor your business actually carries." },
      { k: "Service", t: "Recurring, automated", b: "Maintenance contracts that schedule themselves and get out the door early." },
      { k: "Books", t: "Closed nightly", b: "Job cost, payroll, and invoicing reconciled before the truck is back in the bay." },
      { k: "Marketing", t: "Triggered, not blasted", b: "Lifecycle messages tied to the asset and the customer's history — not the calendar." },
    ],
    stats: [
      { num: "+28%", lbl: "Quote-to-close" },
      { num: "−2 hr", lbl: "Saved per tech, per day" },
      { num: "+19%", lbl: "Recurring-revenue capture" },
      { num: "1", lbl: "App, not seven" },
    ],
    stack: ["ServiceTitan · Housecall Pro", "QuickBooks · Gusto", "Twilio · Mailchimp", "Verizon Connect"],
  },
];

window.INDUSTRIES = INDUSTRIES;
