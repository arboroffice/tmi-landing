// Email enrichment waterfall. Apollo finds most owner emails, but misses 30-50%.
// This chains Apollo -> optional fallback providers -> verification, and returns the
// best deliverable email it can find. Every provider degrades to null when its key
// is absent, so this works with only the keys you have set.
//
//   import { findBestEmail } from './tools/enrich.js';
//   const hit = await findBestEmail({ domain, name, title, apolloId });
//   // -> { email, source, verified } | null

import { findContact, getEmail } from './apollo.js';
import { verifyEmail } from './verify.js';

const clean = (e) => (e && /.+@.+\..+/.test(e)) ? e.toLowerCase().trim() : null;

// ── Provider: Apollo (primary) ─────────────────────────────────────────────
async function fromApollo({ domain, title, apolloId }) {
  try {
    if (apolloId) {
      const e = await getEmail({ apolloId }).catch(() => null);
      if (clean(e)) return clean(e);
    }
    if (domain) {
      const c = await findContact({ domain, targetTitles: title ? [title] : undefined }).catch(() => null);
      if (c?.email && clean(c.email)) return clean(c.email);
      if (c?.apolloId) {
        const e = await getEmail({ apolloId: c.apolloId }).catch(() => null);
        if (clean(e)) return clean(e);
      }
    }
  } catch {}
  return null;
}

// ── Provider: Findymail (fallback, FINDYMAIL_API_KEY) ──────────────────────
async function fromFindymail({ domain, name }) {
  const key = process.env.FINDYMAIL_API_KEY;
  if (!key || !domain || !name) return null;
  try {
    const res = await fetch('https://app.findymail.com/api/search/name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ name, domain }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return clean(data?.contact?.email || data?.email);
  } catch { return null; }
}

// ── Provider: Dropcontact (fallback, DROPCONTACT_API_KEY) ──────────────────
async function fromDropcontact({ domain, name }) {
  const key = process.env.DROPCONTACT_API_KEY;
  if (!key || !domain || !name) return null;
  try {
    const [first, ...rest] = String(name).split(' ');
    const res = await fetch('https://api.dropcontact.com/v1/enrich/all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Access-Token': key },
      body: JSON.stringify({ data: [{ first_name: first, last_name: rest.join(' '), website: domain }] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const email = data?.data?.[0]?.email?.[0]?.email;
    return clean(email);
  } catch { return null; }
}

/**
 * Try each provider in order until one returns an email, then verify it.
 * @returns {Promise<{email:string, source:string, verified:boolean}|null>}
 */
export async function findBestEmail({ domain, name, title, apolloId } = {}) {
  const providers = [
    ['apollo', () => fromApollo({ domain, title, apolloId })],
    ['findymail', () => fromFindymail({ domain, name })],
    ['dropcontact', () => fromDropcontact({ domain, name })],
  ];
  let held = null;
  for (const [source, fn] of providers) {
    const email = await fn().catch(() => null);
    if (!email) continue;
    let verified = true;
    try {
      const v = await verifyEmail(email);
      verified = v?.deliverable !== false && v?.valid !== false && v?.result !== 'undeliverable';
    } catch { /* verifier optional; keep the email */ }
    if (verified) return { email, source, verified: true };
    // hold the first found but unverified email as a last resort
    if (!held) held = { email, source, verified: false };
  }
  return held;
}
