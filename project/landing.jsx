// Main landing page sections
const { useEffect: useFx } = React;

function Hero() {
  return (
    <section className="hero" data-screen-label="01 Hero">
      <div className="container">
        <div className="hero-bg-num mono" style={{ position: "absolute", right: "var(--pad)", top: "12px" }}>
          STRATUM v2.0 · CONNECTED · 168 ASSETS · 23 SITES · 4.2M EVENTS/DAY
        </div>
        <div className="hero-grid">
          <div>
            <div className="eyebrow" style={{ marginBottom: 32 }}>AI infrastructure for oil &amp; gas</div>
            <h1 className="h-display">
              The trades deserve <span style={{ color: "var(--accent)", fontStyle: "italic", fontWeight: 400 }}>better</span> than legacy systems.
            </h1>
            <p className="hero-sub">
              Oil and gas runs the world. The people doing that work still manage operations on software that was never built for them — disconnected, manual, one failure away from a serious incident. Stratum is the connective layer underneath.
            </p>
            <div className="hero-actions">
              <a className="btn" href="#problem">See the problem <span className="arrow"></span></a>
              <a className="btn btn--ghost" href="#contact">Talk to us</a>
            </div>
            <div className="hero-meta">
              <div className="mono"></div>
              <div className="mono"></div>
            </div>
          </div>
        </div>

        {/* Editorial strip used only in variant 2 */}
        <div className="editorial-strip">
          <div>
            <div className="mono"></div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 28, marginTop: 6, letterSpacing: "-0.015em" }}>

            </div>
          </div>
          <div>
            <div className="mono"></div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 28, marginTop: 6, letterSpacing: "-0.015em" }}>

            </div>
          </div>
          <div>
            <div className="mono"></div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 28, marginTop: 6, letterSpacing: "-0.015em" }}>

            </div>
          </div>
          <div>
            <div className="mono"></div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 28, marginTop: 6, letterSpacing: "-0.015em" }}>

            </div>
          </div>
        </div>
      </div>
    </section>);

}

function Reality() {
  return (
    <section className="section" id="reality" data-screen-label="02 Reality">
      <div className="container">
        <div className="pull">
          <div className="eyebrow">The reality</div>
          <blockquote>
            Every day, oil and gas operators make critical decisions on data that is hours old, manually entered, and stored in three systems that have never spoken to each other.
          </blockquote>
        </div>
      </div>
    </section>);

}

function Capabilities() {
  return (
    <section className="section" id="safety" data-screen-label="03 Safety">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="eyebrow" style={{ marginBottom: 18 }}>Safety first</div>
            <h2>The most dangerous thing in oil and gas is not knowing what is happening.</h2>
          </div>
          <p>
            Stratum watches what your existing systems can't see together — equipment, environment, and people — and surfaces the signal before it becomes the incident.
          </p>
        </div>
        <div className="cap-grid">
          <div className="cap">
            <div className="cap-num">01 / RISK</div>
            <div className="cap-icon"><IconRisk /></div>
            <h3>Real-time risk monitoring.</h3>
            <p>AI watches equipment, environment, and operations continuously — surfacing risk signals before they become incidents. The system never sleeps. Never misses a reading.</p>
          </div>
          <div className="cap">
            <div className="cap-num">02 / FAILURE</div>
            <div className="cap-icon"><IconPredict /></div>
            <h3>Predictive failure detection.</h3>
            <p>Failures don't happen without warning — they happen when warnings go unseen. Stratum connects sensor data across every asset and flags anomalies the moment they appear.</p>
          </div>
          <div className="cap">
            <div className="cap-num">03 / COMPLIANCE</div>
            <div className="cap-icon"><IconCompliance /></div>
            <h3>Automated compliance &amp; reporting.</h3>
            <p>Inspection records, safety docs, and reports generated automatically — accurate, timestamped, ready the moment a regulator asks. No manual assembly. No gaps.</p>
          </div>
        </div>
      </div>
    </section>);

}

function Stats() {
  return (
    <section className="section" id="evidence" data-screen-label="04 Evidence" style={{ display: "var(--show-stats, block)" }}>
      <div className="container">
        <div className="section-head">
          <div>
            <div className="eyebrow" style={{ marginBottom: 18 }}>The evidence</div>
            <h2>The math on AI in oil and gas is no longer subtle.</h2>
          </div>
          <p>Independent industry research already shows where the gap is opening between connected operations and the ones still running on duct tape.</p>
        </div>
        <div className="stats">
          <Stat value={70} suffix="%" label="Potential profit increase for operators that fully adopt AI over the next five years." source="BCG · AI-First Oil &amp; Gas, 2025" />
          <Stat value={6} suffix="×" label="Cost reduction in harsh-environment operations already achieved with AI today." source="BCG · 2025" />
          <Stat value={75} suffix="%" label="Reduction in workplace incidents achieved by a major petroleum operator within just 16 weeks of deploying an AI safety system." source="PKN Orlen · 2025" />
        </div>
      </div>
    </section>);

}

function Problem() {
  const items = [
  { n: "01", t: "Data scattered across disconnected systems.", b: "SCADA, ERP, field logs, maintenance records — all siloed. Your team spends hours hunting for information that should take seconds. Every delay is a risk." },
  { n: "02", t: "Skilled operators buried in paperwork.", b: "Engineers, operators, field supervisors lose hours a day to manual entry and reporting. That's not what they were hired to do. It's pulling attention from what keeps people safe." },
  { n: "03", t: "Incidents that should never happen.", b: "When warning signals live in disconnected systems, no one sees the full picture. Small anomalies become serious failures. The data was almost always there — just not connected." },
  { n: "04", t: "Legacy software blocking modernization.", b: "Old systems hold your data hostage. Every new tool gets bolted on. The stack gets messier and more fragile every year — and replacing it feels impossible." }];

  return (
    <section className="section" id="problem" data-screen-label="05 Problem">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="eyebrow" style={{ marginBottom: 18 }}>The problem</div>
            <h2>Oil and gas is running on duct tape and hope.</h2>
          </div>
          <p>Four pressures are compounding inside every operator we talk to. None of them are new. All of them are getting worse.</p>
        </div>
        <div className="problems">
          {items.map((it) =>
          <div className="problem" key={it.n}>
              <div className="problem-num">{it.n}</div>
              <h3>{it.t}</h3>
              <p>{it.b}</p>
            </div>
          )}
        </div>
        <div style={{ marginTop: 64, padding: "32px 0", borderTop: "1px solid var(--ink)", display: "grid", gridTemplateColumns: "1fr 2fr", gap: "var(--gap)", alignItems: "start" }}>
          <div className="eyebrow">What changes</div>
          <p style={{ fontFamily: "var(--font-display)", fontSize: "clamp(22px, 2.6vw, 32px)", letterSpacing: "-0.015em", lineHeight: 1.2, margin: 0, textWrap: "balance" }}>
            Stratum doesn't replace your existing systems. It connects them — building an intelligent layer on top so your operation can finally see itself clearly and act on what it knows.
          </p>
        </div>
      </div>
    </section>);

}

function WhatWeDo() {
  return (
    <section className="section" id="platform" data-screen-label="06 Platform">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="eyebrow" style={{ marginBottom: 18 }}>What we do</div>
            <h2>One intelligent layer. Everything connected.</h2>
          </div>
          <p>Stratum sits beneath your existing tools, structures the data they each create, and runs AI agents on top of the result. Your stack stays put. Your operation finally talks to itself.</p>
        </div>
        <div className="do-grid">
          <div className="do-cell">
            <div className="cap-num">01</div>
            <div className="cap-icon"><IconConnect /></div>
            <h3>Connect your systems.</h3>
            <p>Existing tools stay in place. We build the connective layer underneath so your data — field to office — flows to one place for the first time.</p>
          </div>
          <div className="do-cell">
            <div className="cap-num">02</div>
            <div className="cap-icon"><IconAgents /></div>
            <h3>Automate with AI agents.</h3>
            <p>Scheduling, maintenance planning, compliance reporting, dispatch — agents handle the operational work so your people handle the decisions that matter.</p>
          </div>
          <div className="do-cell">
            <div className="cap-num">03</div>
            <div className="cap-icon"><IconMonitor /></div>
            <h3>Monitor in real time.</h3>
            <p>Continuous visibility across every asset, every site, every crew. Anomalies surface instantly. Problems get caught early — not after the fact.</p>
          </div>
          <div className="do-cell">
            <div className="cap-num">04</div>
            <div className="cap-icon"><IconGrow /></div>
            <h3>Grow without limits.</h3>
            <p>A connected operation can take on more work, reduce waste, and unlock revenue streams that fragmented systems simply cannot capture.</p>
          </div>
        </div>
      </div>
    </section>);

}

function Phases() {
  const items = [
  { n: "01", k: "Deploy", b: <>Connect your systems, structure your data, automate the most repetitive tasks your team does today. Your existing software stays put — <strong>no rip and replace</strong>. Real results arrive in weeks, not months.</>, m: "+15%", ml: "Productivity · immediate" },
  { n: "02", k: "Reshape", b: <>AI agents take over scheduling, maintenance planning, safety monitoring, and field coordination. Downtime drops. Incident response improves dramatically. <strong>Days compress into hours.</strong></>, m: "Days → Hours", ml: "Process compression" },
  { n: "03", k: "Invent", b: <>New revenue streams, predictive exploration tools, operational areas running autonomously with human oversight. <strong>This is where the real value is</strong> — and where the gap between you and competitors opens up permanently.</>, m: "30–70%", ml: "Profit uplift · 5 yr" }];

  return (
    <section className="section" id="phases" data-screen-label="07 Phases">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="eyebrow" style={{ marginBottom: 18 }}>How it works</div>
            <h2>Three phases from fragmented to AI-first.</h2>
          </div>
          <p>You don't need a five-year transformation program. You need three steps, in order, that each pay for the next.</p>
        </div>
        {items.map((p) =>
        <div className="phase" key={p.n}>
            <div className="phase-tag">
              <div className="tag">PHASE {p.n}</div>
              <h3><span className="ord">{p.n}</span>{p.k}</h3>
            </div>
            <div className="phase-body">{p.b}</div>
            <div className="phase-metric">
              <div className="num">{p.m}</div>
              <div className="lbl">{p.ml}</div>
            </div>
          </div>
        )}
        <div style={{ marginTop: 32, textAlign: "right" }}>
          <a className="btn btn--ghost" href="phases.html">Read the full phase plan <span className="arrow"></span></a>
        </div>
      </div>
    </section>);

}

function Chain() {
  const items = [
  { tag: "UPSTREAM", t: "Find more, drill smarter, produce longer.", b: "AI cuts geological analysis from months to weeks. Real-time drilling optimization reduces downtime and cost. Methane monitoring tracks and trims your footprint automatically — no manual input." },
  { tag: "MIDSTREAM", t: "Pipeline integrity and smart logistics.", b: "Continuous pipeline monitoring, automated anomaly detection, and AI-optimized routing that reduces loss, improves throughput, and keeps regulators satisfied without the manual overhead." },
  { tag: "REFINING", t: "Autonomous scheduling, zero-surprise maintenance.", b: "AI agents optimize production schedules, manage maintenance autonomously, and run digital inspections — refineries operate harder and longer without unplanned stops eating into margins." },
  { tag: "DOWNSTREAM", t: "Dynamic pricing, smarter inventory, better margins.", b: "Real demand signals driving pricing decisions. Inventory that anticipates instead of reacts. Customer interactions personalized at scale — every site, every day, without adding headcount." }];

  return (
    <section className="section" id="chain" data-screen-label="08 Value chain">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="eyebrow" style={{ marginBottom: 18 }}>Across the value chain</div>
            <h2>Upstream to downstream. Every segment.</h2>
          </div>
          <p>Stratum is one platform with four shapes — each tuned for the operational reality of that segment, all sharing the same data backbone underneath.</p>
        </div>
        <div className="chain">
          {items.map((c) =>
          <div className="chain-cell" key={c.tag}>
              <div className="tag">{c.tag}</div>
              <div>
                <h3>{c.t}</h3>
                <p>{c.b}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>);

}

function Beyond() {
  const inds = ["Construction", "Electrical", "HVAC", "Plumbing", "Manufacturing", "Mining", "Utilities", "Roofing", "Heavy Equipment", "Field Services"];
  return (
    <section className="section" id="industries" data-screen-label="09 Industries">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="eyebrow" style={{ marginBottom: 18 }}>Beyond oil &amp; gas</div>
            <h2>Built for any industry where people work with their hands.</h2>
          </div>
          <p>Stratum is engineered for operations that office software was never designed for — equipment in the field, crews on the ground, reality that doesn't fit a CRM. <strong style={{ color: "var(--ink)", fontWeight: 500 }}>80% of the global workforce is deskless</strong> — but nearly all workplace software was built for people at a desk. Stratum is built for the other 80%.</p>
        </div>
        <div className="ind">
          {inds.map((i) => <div className="ind-chip" key={i}>{i}</div>)}
        </div>
        <div style={{ marginTop: 32 }}>
          <a className="btn btn--ghost" href="industries.html">Explore by industry <span className="arrow"></span></a>
        </div>
      </div>
    </section>);

}

function Steps() {
  const s = [
  "Map your systems and find the gaps.",
  "Build a focused AI agenda.",
  "Connect your data — legacy stays.",
  "Get your team ready for the shift.",
  "Deploy fast, show real wins.",
  "Scale and pull away from the pack."];

  return (
    <section className="section" id="start" data-screen-label="10 Start">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="eyebrow" style={{ marginBottom: 18 }}>How to start</div>
            <h2>A clear path from where you are to AI-first.</h2>
          </div>
          <p>Six concrete steps. The first one takes a single workshop. The last one is permanent.</p>
        </div>
        <div className="steps">
          {s.map((label, i) =>
          <div className="step" key={i}>
              <div className="num">STEP {String(i + 1).padStart(2, "0")}</div>
              <h4>{label}</h4>
            </div>
          )}
        </div>
      </div>
    </section>);

}

function CTA() {
  return (
    <section className="cta" id="contact" data-screen-label="11 CTA">
      <div className="container">
        <div className="eyebrow" style={{ marginBottom: 28, justifyContent: "center", display: "inline-flex" }}>Built for the companies that power the world</div>
        <h2>Tell us what you're running. We'll show you what's possible.</h2>
        <p>Bring us your stack and the bottleneck slowing you down. We'll show you exactly how Stratum connects your operation, protects your people, and sets you up to grow without limits.</p>
        <div className="actions">
          <a className="btn btn--accent" href="#">Book a discovery call <span className="arrow"></span></a>
          <a className="btn btn--ghost" href="#">See the platform</a>
        </div>
      </div>
    </section>);

}

function Landing() {
  // Hide stats band based on tweaks
  useFx(() => {
    const apply = () => {
      const show = document.documentElement.dataset.showStats !== "false";
      const el = document.querySelector("#evidence");
      if (el) el.style.display = show ? "" : "none";
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-show-stats"] });
    return () => mo.disconnect();
  }, []);

  // Hero variant via data attr
  useFx(() => {
    const sync = () => {
      const v = document.documentElement.dataset.heroVariant || "1";
      document.querySelector(".hero")?.setAttribute("data-variant", v);
    };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-hero-variant"] });
    return () => mo.disconnect();
  }, []);

  return (
    <>
      <Nav active="home" />
      <Hero />
      <Reality />
      <Capabilities />
      <Problem />
      <WhatWeDo />
      <Phases />
      <Chain />
      <Beyond />
      <Steps />
      <CTA />
      <Footer />
      <StratumTweaks />
    </>);

}

window.Landing = Landing;