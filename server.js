// TMI app server for Coolify (or any Node host).
// Serves the static site (clean URLs + admin/online/trades subdomain routing) and
// mounts every api/*.js handler at /api/<name>. The handlers are written in the
// Vercel style (module.exports = (req, res) => ...); Express req/res are compatible.
//
// Run: node server.js   (PORT env, default 3000)

const express = require('express');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const API_DIR = path.join(ROOT, 'api');
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ── API: mount api/<name>.js at /api/<name> ─────────────────────────────────
const handlerCache = {};
app.all(/^\/api\/([a-zA-Z0-9_-]+)$/, async (req, res) => {
  const name = req.params[0];
  const file = path.join(API_DIR, `${name}.js`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'not found' });
  try {
    let mod = handlerCache[name];
    if (!mod) { mod = require(file); handlerCache[name] = mod; }
    const fn = typeof mod === 'function' ? mod : (mod.default || mod.handler);
    if (typeof fn !== 'function') return res.status(500).json({ error: 'handler not callable' });
    return await fn(req, res);
  } catch (e) {
    console.error(`api/${name} error:`, e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// ── Dynamic personalized audit microsite: /audit/<slug> ────────────────────
const auditPageHandler = require('./api/audit-page');
app.get('/audit/:slug', (req, res, next) => {
  if (path.extname(req.params.slug)) return next(); // static asset (.png/.html) -> static
  req.query = req.query || {};
  req.query.slug = req.params.slug;
  return auditPageHandler(req, res);
});

// ── Subdomain path rewrites (mirror vercel.json host rewrites) ───────────────
const SUBDOMAIN_PREFIX = {
  'admin.': 'admin',     // admin.tmitechai.com/leads -> admin-leads.html
  'online.': 'online',   // online.tmitechai.com/coaches -> online-coaches.html
  'trades.': 'trades',   // trades.tmitechai.com/lander -> trades-landing.html (best effort)
};
app.use((req, res, next) => {
  const host = (req.hostname || '').toLowerCase();
  if (req.path.startsWith('/api/')) return next();
  for (const [sub, prefix] of Object.entries(SUBDOMAIN_PREFIX)) {
    if (host.startsWith(sub)) {
      if (req.path === '/') { req.url = `/${prefix}.html`; }
      else if (!path.extname(req.path)) {
        const seg = req.path.replace(/^\//, '').replace(/\/$/, '');
        req.url = `/${prefix}-${seg}.html`;
      }
      break;
    }
  }
  next();
});

// ── Static site with clean URLs (/about -> about.html, /audit/x -> audit/x.html)
app.use(express.static(ROOT, {
  extensions: ['html'],
  index: false,
  setHeaders(res, filePath) {
    if (/\.(png|jpe?g|svg|webp|ico|woff2?)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  },
}));

// Apex / www root -> index.html
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));

// 404
app.use((req, res) => {
  const f404 = path.join(ROOT, '404.html');
  if (fs.existsSync(f404)) return res.status(404).sendFile(f404);
  res.status(404).send('Not found');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TMI server listening on :${PORT}`));
