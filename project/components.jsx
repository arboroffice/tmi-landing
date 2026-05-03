// Reusable atomic components for Stratum
const { useState, useEffect, useRef } = React;

// ---- Wordmark ----
function Wordmark({ size = 22 }) {
  return (
    <a href="index.html" className="wordmark" aria-label="Stratum home">
      <span className="wordmark-mark" style={{ width: size, height: size }}>
        <svg viewBox="0 0 22 22" fill="none">
          <rect x="1" y="3" width="20" height="2" fill="currentColor" />
          <rect x="1" y="7.5" width="20" height="2" fill="currentColor" opacity="0.55" />
          <rect x="1" y="12" width="20" height="2" fill="currentColor" opacity="0.3" />
          <rect x="1" y="16.5" width="20" height="2" fill="var(--accent)" />
        </svg>
      </span>
      <span>Stratum</span>
    </a>
  );
}

// ---- Nav ----
function Nav({ active = "home" }) {
  return (
    <nav className="nav">
      <div className="container nav-inner">
        <Wordmark />
        <div className="nav-links">
          <a href="index.html" className={active === "home" ? "active" : ""}>Platform</a>
          <a href="phases.html" className={active === "phases" ? "active" : ""}>Phases</a>
          <a href="industries.html" className={active === "industries" ? "active" : ""}>Industries</a>
          <a href="news.html" className={active === "news" ? "active" : ""}>News</a>
          <a href="company.html" className={active === "company" ? "active" : ""}>Company</a>
        </div>
        <a className="btn btn--ghost" href="#contact">
          Book a call <span className="arrow"></span>
        </a>
      </div>
    </nav>
  );
}

// ---- Footer ----
function Footer() {
  return (
    <footer className="footer">
      <div>© 2026 Stratum Systems</div>
      <div style={{ display: "flex", gap: 24 }}>
        <a href="#">Platform</a>
        <a href="phases.html">Phases</a>
        <a href="industries.html">Industries</a>
        <a href="news.html">News</a>
        <a href="company.html">Company</a>
      </div>
      <div>Houston · Calgary · Aberdeen</div>
    </footer>
  );
}

// ---- Live Ops panel (hero variant 1) ----
function OpsPanel() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1800);
    return () => clearInterval(t);
  }, []);
  // values shift slowly
  const rows = [
    { name: "Pump-A14", val: 62 + ((tick * 3) % 9), unit: "psi", warn: false, label: "Nominal" },
    { name: "Sep-B07", val: 71 + ((tick * 5) % 11), unit: "psi", warn: false, label: "Nominal" },
    { name: "Compressor C2", val: 88 + ((tick * 2) % 7), unit: "%", warn: true, label: "Anomaly · vibration" },
    { name: "Methane LDAR", val: 4 + (tick % 3), unit: "ppm", warn: false, label: "Nominal" },
    { name: "Tank-114 lvl", val: 41 + ((tick * 4) % 13), unit: "%", warn: false, label: "Nominal" },
    { name: "Crew Alpha", val: 6, unit: "hr", warn: false, label: "On-shift" },
  ];
  return (
    <aside className="ops-panel" aria-hidden="true">
      <div className="ops-panel-head">
        <div><span className="dot live"></span>STRATUM · LIVE OPS</div>
        <div>FIELD 0142 · PERMIAN</div>
      </div>
      {rows.map((r, i) => (
        <div key={i} className={`ops-row ${r.warn ? "warn" : ""}`}>
          <div className="name">{r.name}</div>
          <div className="meter"><span style={{ width: Math.min(100, r.val) + "%" }}></span></div>
          <div className="val">{r.val}{r.unit} · {r.label}</div>
        </div>
      ))}
      <div className="ops-foot">
        <div>168 ASSETS · 23 SITES</div>
        <div>UPDATED {tick}s AGO</div>
      </div>
    </aside>
  );
}

// ---- Capability icons (line-art SVGs) ----
function IconRisk() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.25">
      <circle cx="32" cy="32" r="20" />
      <circle cx="32" cy="32" r="13" />
      <circle cx="32" cy="32" r="6" />
      <path d="M32 4v8M32 52v8M4 32h8M52 32h8" />
      <circle cx="32" cy="32" r="2.5" fill="var(--accent)" stroke="none" />
    </svg>
  );
}
function IconPredict() {
  return (
    <svg width="80" height="64" viewBox="0 0 80 64" fill="none" stroke="currentColor" strokeWidth="1.25">
      <path d="M2 50 L18 38 L30 44 L42 24 L58 30 L78 12" />
      <path d="M2 50 L18 38 L30 44 L42 24 L58 30" strokeDasharray="0" />
      <path d="M58 30 L78 12" strokeDasharray="2 3" />
      <circle cx="42" cy="24" r="3" fill="var(--accent)" stroke="none" />
      <line x1="2" y1="62" x2="78" y2="62" />
    </svg>
  );
}
function IconCompliance() {
  return (
    <svg width="56" height="64" viewBox="0 0 56 64" fill="none" stroke="currentColor" strokeWidth="1.25">
      <rect x="6" y="4" width="44" height="56" />
      <line x1="14" y1="18" x2="42" y2="18" />
      <line x1="14" y1="26" x2="42" y2="26" />
      <line x1="14" y1="34" x2="34" y2="34" />
      <line x1="14" y1="42" x2="42" y2="42" />
      <path d="M22 50 L26 54 L36 44" stroke="var(--accent)" strokeWidth="1.5" />
    </svg>
  );
}
function IconConnect() {
  return (
    <svg width="80" height="60" viewBox="0 0 80 60" fill="none" stroke="currentColor" strokeWidth="1.25">
      <circle cx="10" cy="14" r="4" /><circle cx="10" cy="46" r="4" />
      <circle cx="40" cy="30" r="6" />
      <circle cx="70" cy="14" r="4" /><circle cx="70" cy="46" r="4" />
      <line x1="14" y1="14" x2="34" y2="30" />
      <line x1="14" y1="46" x2="34" y2="30" />
      <line x1="46" y1="30" x2="66" y2="14" />
      <line x1="46" y1="30" x2="66" y2="46" />
      <circle cx="40" cy="30" r="2" fill="var(--accent)" stroke="none" />
    </svg>
  );
}
function IconAgents() {
  return (
    <svg width="80" height="60" viewBox="0 0 80 60" fill="none" stroke="currentColor" strokeWidth="1.25">
      <rect x="6" y="14" width="20" height="32" />
      <rect x="30" y="6" width="20" height="48" />
      <rect x="54" y="22" width="20" height="22" />
      <line x1="6" y1="22" x2="26" y2="22" />
      <line x1="30" y1="14" x2="50" y2="14" />
      <line x1="54" y1="30" x2="74" y2="30" />
      <circle cx="40" cy="30" r="2" fill="var(--accent)" stroke="none" />
    </svg>
  );
}
function IconMonitor() {
  return (
    <svg width="80" height="60" viewBox="0 0 80 60" fill="none" stroke="currentColor" strokeWidth="1.25">
      <path d="M2 30 Q12 14 22 30 T42 30 T62 30 T78 30" />
      <line x1="2" y1="50" x2="78" y2="50" />
      <line x1="2" y1="10" x2="78" y2="10" strokeDasharray="2 3" />
      <circle cx="32" cy="30" r="3" fill="var(--accent)" stroke="none" />
    </svg>
  );
}
function IconGrow() {
  return (
    <svg width="76" height="60" viewBox="0 0 76 60" fill="none" stroke="currentColor" strokeWidth="1.25">
      <line x1="4" y1="56" x2="72" y2="56" />
      <rect x="10" y="42" width="10" height="14" />
      <rect x="24" y="32" width="10" height="24" />
      <rect x="38" y="22" width="10" height="34" />
      <rect x="52" y="10" width="10" height="46" fill="var(--accent)" stroke="none" />
    </svg>
  );
}

// ---- Stats animated counter ----
function Stat({ value, suffix = "", label, source }) {
  const [n, setN] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          let start = 0;
          const dur = 1200;
          const t0 = performance.now();
          const step = (t) => {
            const p = Math.min(1, (t - t0) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            setN(Math.round(eased * value));
            if (p < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value]);
  return (
    <div ref={ref}>
      <div className="stat-num">{n}{suffix}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-source">{source}</div>
    </div>
  );
}

Object.assign(window, {
  Wordmark, Nav, Footer, OpsPanel,
  IconRisk, IconPredict, IconCompliance,
  IconConnect, IconAgents, IconMonitor, IconGrow,
  Stat,
});
