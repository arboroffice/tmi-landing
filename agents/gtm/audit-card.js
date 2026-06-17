// Personalized "executive card" image, rendered as a STATIC PNG in Node.
// Portable: works in any Node runtime (Coolify container, GitHub Actions, Vercel),
// no edge runtime required. The PNG is committed next to the audit microsite and
// served as a plain static file at /audit/<slug>-card.png.
//
// Design is consulting-grade, not AI art. Adjust the markup/colors to match the
// reference image when provided and every prospect card updates automatically.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import satori from 'satori';
import { html } from 'satori-html';
import { Resvg } from '@resvg/resvg-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

const clip = (s, n) => String(s ?? '').slice(0, n);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let _fontCache = null;
async function loadFonts() {
  if (_fontCache) return _fontCache;
  async function gfont(weight) {
    const url = `https://fonts.googleapis.com/css2?family=Barlow:wght@${weight}`;
    const css = await (await fetch(url)).text();
    const m = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/);
    if (!m) throw new Error('Barlow font parse failed');
    return Buffer.from(await (await fetch(m[1])).arrayBuffer());
  }
  const [bold, med] = await Promise.all([gfont(800), gfont(500)]);
  _fontCache = [
    { name: 'Barlow', data: bold, weight: 800, style: 'normal' },
    { name: 'Barlow', data: med, weight: 500, style: 'normal' },
  ];
  return _fontCache;
}

export async function renderCardPng({ companyName, score, industry }) {
  const company = esc(clip(companyName || 'Your Company', 42));
  const sc = esc(clip(score ?? '—', 4));
  const ind = esc(clip(industry || 'Built by TMI', 40));

  const markup = html(`
    <div style="display:flex;flex-direction:column;width:1200px;height:630px;background:#0a0b14;background-image:radial-gradient(900px 500px at 80% -10%, rgba(228,255,151,0.10), transparent);padding:66px;font-family:Barlow;color:#ffffff;justify-content:space-between;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="display:flex;flex-direction:column;">
          <div style="display:flex;font-size:24px;font-weight:800;letter-spacing:2px;">TMI</div>
          <div style="display:flex;font-size:15px;font-weight:500;color:#8a8da0;letter-spacing:3px;margin-top:10px;">OPERATIONAL INTELLIGENCE REVIEW</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;">
          <div style="display:flex;font-size:104px;font-weight:800;color:#E4FF97;line-height:1;">${sc}</div>
          <div style="display:flex;font-size:15px;font-weight:500;color:#8a8da0;letter-spacing:3px;margin-top:6px;">INTELLIGENCE SCORE / 100</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;">
        <div style="display:flex;font-size:68px;font-weight:800;line-height:1.04;">${company}</div>
        <div style="display:flex;font-size:28px;font-weight:500;color:#E4FF97;margin-top:20px;">Current state → Future state</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid rgba(255,255,255,0.12);padding-top:26px;">
        <div style="display:flex;font-size:20px;font-weight:500;color:#8a8da0;">${ind}</div>
        <div style="display:flex;font-size:20px;font-weight:500;color:#8a8da0;">tmitechai.com</div>
      </div>
    </div>
  `);

  const fonts = await loadFonts();
  const svg = await satori(markup, { width: 1200, height: 630, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}

// Writes /audit/<slug>-card.png and returns the public path.
export async function writeCardPng({ slug, companyName, score, industry }) {
  const png = await renderCardPng({ companyName, score, industry });
  const dir = path.join(ROOT, 'audit');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${slug}-card.png`), png);
  return `https://www.tmitechai.com/audit/${slug}-card.png`;
}
