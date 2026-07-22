# TMI Site UI Audit and Harmonization Plan

Goal: make the public site look like the landing page, on one consistent design system.

Owner: Mia · Status: Decisions locked · Audit of 287 HTML pages

## Decisions (locked)
- **Canonical font: General Sans.** Note from deeper inspection: both the homepage and `tmi.css` already resolve to General Sans (`--sans`). The Barlow `<link>` on some pages is vestigial and can be removed. So there is no real font split to fix; General Sans is already the site font.
- **Scope: marketing pages only.** Convert the 9 off-brand public pages onto `tmi.css` + the canonical nav/footer. Leave the 22 `tmi.css` pages (already consistent), leave the 185 articles, and leave the admin/OS/city-leads apps.
- **Target system: `tmi.css`** (the shared stylesheet the 22 marketing pages already use), not the homepage's inline copy. The homepage stays as-is; it shares the same tokens and font so it reads consistently.

## Canonical shell (the template every converted page uses)
- Head: standard meta + `<link rel="stylesheet" href="/tmi.css"/>`, page-specific tweaks in a small local `<style>`.
- Header: `<header class="nav"><div class="nav-in">` with `.nav-brand`, `.nav-links`, `.btn nav-cta`, `.nav-burger`, plus the `.drawer` mobile menu (copy verbatim from `about.html`).
- Sections: `<section class="sec">` (or `.sec-tight`, `.hero`, `.dark`) wrapping `.wrap`, using `.eyebrow`, `.h-sec`, `.display`, `.sub`, `.btn btn-lime` / `.btn-ghost`, `.lime`.
- Footer: `<footer class="foot">` with `.foot-grid` (copy verbatim from `about.html`).



---

## 1. The headline finding

There is no single "landing UI" today. The site runs on **five different design systems**, and even the marketing pages are split across three of them. The homepage itself does not match the other marketing pages.

| System | Pages | What it is | Font |
|---|---|---|---|
| **Homepage (inline)** | 1 (`index.html`) | The look you have been polishing. Its CSS is inline, not shared. | General Sans / Inter |
| **`tmi.css` family** | ~22 marketing pages | The shared landing system (about, solutions, method, etc.). Uses `.band` layout like the homepage but a different stylesheet and font. | Barlow |
| **Articles** | 185 (`article-*.html`) | Founders of the Future Letters. A deliberate editorial style. | Barlow |
| **`admin.css`** | 63 (`admin-*.html`) | The internal admin dashboard app. | Neue Haas |
| **Off-brand / old** | 15 | One-off pages on their own old styles. | mixed |

So "a lot of pages on an old UI" is correct, and it is deeper than it looks: the homepage (`index.html`) and the rest of the marketing site (`tmi.css`) are already on **different fonts and different stylesheets**. They share class names (`.band`, `.wrap`) so they look related, but they are not the same.

---

## 2. The off-brand pages (the ones that look clearly old)

These 15 are not on any landing system:

**Public marketing (should match landing):**
- `platform.html` - The Platform
- `news.html` - Founders of the Future Letters index (the articles hub)
- `intelligent-company-audit.html` - The Audit
- `savings-calculator.html` - Ops Savings Calculator
- `webinar.html` - live class signup (links tmi.css but has old markup)
- `ai-for-oil-gas-companies.html` - industry page
- `developers.html` - For Developers
- `frontdesk-demo.html` - FrontDesk product
- `watch.html` - video / replay

**Internal, transactional, or embed views (probably should NOT get the marketing chrome):**
- `invoice-view.html`, `proposal-view.html`, `proposal-sign.html` - client documents
- `prd-view.html`, `sales-playbook.html` - internal docs
- `console.html` - a field-ops console (its own app)

---

## 3. Scope: what "make it match the landing" should and should not include

- **In scope (the real ask):** the public marketing pages. That is the homepage, the ~22 `tmi.css` pages, and the ~9 off-brand public pages above. The end state: all of them on one stylesheet, one font, one nav, one footer.
- **A decision, not automatic:** the **185 article pages**. They are a deliberate editorial style (Founders Letters). Converting all 185 is a large job. Options: leave them, or just align their header and footer to the site so the chrome matches while the reading style stays.
- **Out of scope (recommended):** the **63 admin pages** and the **OS app** and **city-leads app**. These are functional software with their own necessary UI. "Look like the landing page" does not apply to a dashboard. Leave them unless you specifically want an app reskin later.

So the core job is roughly **30 to 35 marketing pages**, not 287.

---

## 4. The root problem to fix first

The reason the site drifted is that there is **no single source of truth**. The homepage hard-codes its own CSS, `tmi.css` is a separate copy with a different font, and old pages each invented their own. Any harmonization that just reskins pages one by one will drift again.

So step one is to **make one canonical stylesheet and one canonical nav/footer**, then point every marketing page at it. After that, "all pages look the same" is guaranteed and stays that way, because they literally share the same CSS.

---

## 5. The plan

### Phase 0 - Establish the canonical system (the foundation)
1. **Pick the canonical font.** The homepage uses General Sans / Inter; the rest use Barlow. Choose one for the whole site. (Recommendation below.)
2. **Promote the homepage's design system into `tmi.css`.** Move the homepage's inline CSS (tokens, `.band`, `.wrap`, `.nav`, `.btn`, `.foot`, components) into `tmi.css` as the single source of truth, on the chosen font. Then make `index.html` link `tmi.css` instead of inlining, so the homepage and the shared system can never drift again.
3. **Lock one nav and one footer.** Save the canonical header and footer markup as a documented snippet so every page uses the exact same top and bottom.

**Done when:** the homepage and the existing `tmi.css` pages are provably identical in chrome and font, from one stylesheet.

### Phase 1 - Convert the off-brand public pages
Reskin the ~9 public off-brand pages (`platform`, `news`, `intelligent-company-audit`, `savings-calculator`, `webinar`, `ai-for-oil-gas-companies`, `developers`, `frontdesk-demo`, `watch`) onto `tmi.css` + the canonical nav/footer. Keep each page's content and copy; only the shell and styling change.

**Done when:** every public page a prospect can reach is on the one system.

### Phase 2 - Unify the existing landing family
Audit the ~22 `tmi.css` pages for local overrides and one-off inline styles, and remove drift so they match the homepage exactly (same spacing, buttons, sections).

### Phase 3 - Decide on articles and leave the apps
- Articles: either leave as the editorial style, or do a light pass to align only their header and footer to the site nav. (Recommend the light pass so the chrome matches; keep the reading layout.)
- Admin, OS, city-leads: leave as their own app UIs.

---

## 6. Recommendations (my calls, for your yes or no)

1. **Font:** standardize on **General Sans** (the homepage font you have been refining) as the site font, and retire the Barlow marketing pages onto it. It reads more modern and it is what your newest, most-polished page already uses. Barlow can stay for the article body if you want the letters to feel editorial.
2. **Source of truth:** move the homepage CSS into `tmi.css` and have every marketing page, including the homepage, link it. One file controls the whole look.
3. **Scope for the first pass:** homepage reconciliation + the 9 off-brand public pages + the 22 tmi.css pages. Leave articles and apps for a later, separate decision.

---

## 7. Effort

- Phase 0: foundation, half a day of careful work, done once.
- Phase 1: ~9 pages, roughly a page each.
- Phase 2: cleanup pass across ~22 pages.
- Phase 3: optional, and the articles pass is scriptable since all 185 share the same template.

The heavy lifting is Phase 0. After that, the rest is fast because everything shares one stylesheet.
