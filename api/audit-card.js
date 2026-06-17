// Personalized "executive card" image for a prospect's Intelligent Company Audit.
// Renders a 1200x630 PNG (works as og:image and as an email visual).
// Usage: /api/audit-card?company=ABC%20Manufacturing&score=47&industry=Manufacturing
//
// Design is intentionally restrained, consulting-grade (not AI art). Swap the
// layout/colors here when the reference image is provided.

import { ImageResponse } from '@vercel/og';
import { html } from 'satori-html';

export const config = { runtime: 'edge' };

// Fetch a Google font as TTF/OTF (satori needs binary font data).
async function gfont(family, weight) {
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}`;
  const css = await (await fetch(url)).text();
  const m = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/);
  if (!m) throw new Error('font parse failed');
  return (await fetch(m[1])).arrayBuffer();
}

const clip = (s, n) => String(s || '').slice(0, n);

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const company = clip(searchParams.get('company') || 'Your Company', 42);
    const score = clip(searchParams.get('score') || '—', 4);
    const industry = clip(searchParams.get('industry') || 'Built by TMI', 40);

    const markup = html(`
      <div style="display:flex;flex-direction:column;width:1200px;height:630px;background:#0a0b14;background-image:radial-gradient(900px 500px at 80% -10%, rgba(228,255,151,0.10), transparent);padding:66px;font-family:Barlow;color:#ffffff;justify-content:space-between;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div style="display:flex;flex-direction:column;">
            <div style="display:flex;font-size:24px;font-weight:800;letter-spacing:2px;">TMI</div>
            <div style="display:flex;font-size:15px;font-weight:500;color:#8a8da0;letter-spacing:3px;margin-top:10px;">OPERATIONAL INTELLIGENCE REVIEW</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;">
            <div style="display:flex;font-size:104px;font-weight:800;color:#E4FF97;line-height:1;">${score}</div>
            <div style="display:flex;font-size:15px;font-weight:500;color:#8a8da0;letter-spacing:3px;margin-top:6px;">INTELLIGENCE SCORE / 100</div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;">
          <div style="display:flex;font-size:68px;font-weight:800;line-height:1.04;">${company}</div>
          <div style="display:flex;font-size:28px;font-weight:500;color:#E4FF97;margin-top:20px;">Current state → Future state</div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid rgba(255,255,255,0.12);padding-top:26px;">
          <div style="display:flex;font-size:20px;font-weight:500;color:#8a8da0;">${industry}</div>
          <div style="display:flex;font-size:20px;font-weight:500;color:#8a8da0;">tmitechai.com</div>
        </div>
      </div>
    `);

    const [bold, med] = await Promise.all([gfont('Barlow', 800), gfont('Barlow', 500)]);
    return new ImageResponse(markup, {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Barlow', data: bold, weight: 800, style: 'normal' },
        { name: 'Barlow', data: med, weight: 500, style: 'normal' },
      ],
      headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' },
    });
  } catch (err) {
    return new Response(`card error: ${err.message}`, { status: 500 });
  }
}
