# TMI App (React)

React SPA migration of the TMI Admin and OS portals. It **reuses the existing
`/api/*` serverless functions unchanged** - this is a frontend migration, not a
backend rewrite. Built with Vite + React + TypeScript.

Status: **foundation only.** The shared layer (auth, typed API client, resilient
recorder hook, layout, sidebar, routing) is in place and the 13 admin workspaces
are wired as routes. Each workspace page is a placeholder to be ported from its
`admin-*.html` counterpart, one focused component at a time.

## Run it
```bash
cd app
npm install
npm run dev      # http://localhost:5173  (/api is proxied to the live backend)
```
By default `/api` proxies to `https://admin.tmitechai.com`. Override:
```bash
VITE_API_TARGET=https://<your-deployment> npm run dev
```

## Structure
- `src/lib/api.ts` - typed client for the existing API (Bearer `tmi_admin_tk`).
- `src/lib/auth.tsx` - AuthProvider + useAuth (login posts to `/api/auth`).
- `src/lib/toast.tsx` - toast context.
- `src/lib/useRecorder.ts` - the resilient Deepgram recorder as a hook.
- `src/admin/workspaces.ts` - the 13 workspaces and their tabs (kept in sync
  with the static site's `admin-shared.js`).
- `src/admin/AdminLayout.tsx` / `Sidebar.tsx` - the app shell.
- `src/admin/WorkspacePage.tsx` - tab bar + placeholder body per workspace.
- `src/styles/admin.css` - copied from the site so ported pages keep identical
  class names and tokens. Single-source it later.

## Porting a page
Replace a workspace tab's placeholder body with a real component that uses
`api.get/post/...` for data. Because the CSS classes match the static pages,
markup can largely be lifted and made declarative.

## Deploy (later, not yet)
This app is intentionally not wired to Vercel yet, so the live static site keeps
working. When enough is ported, point the admin subdomain at the `app/dist`
build (SPA fallback to `index.html`) and retire the matching static pages.
