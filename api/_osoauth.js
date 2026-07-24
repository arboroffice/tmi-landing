// TMI OS — generic OAuth 2.0 framework. One spine every provider drops into: a
// registry entry (auth URL, token URL, scopes, which env vars hold the client
// id/secret) is all a new provider needs. Handles the authorize URL, the code
// exchange, and token refresh. Tokens are stored encrypted by the caller
// (os2-oauth), never here.
//
// A provider is "configured" when its client id + secret env vars are set, so
// the UI can show a Connect button only for providers that can actually connect.

const crypto = require('crypto');

const BASE_URL = process.env.OS_BASE_URL || 'https://os.tmitechai.com';

// provider id -> config. Add a provider by adding a row; no other code changes.
const PROVIDERS = {
  // `synced: true` means a real sync module pulls this provider's data into
  // os_metrics (see _ossync). Providers without one connect but pull nothing,
  // so the UI marks them "coming soon" instead of showing a live Connect button.
  quickbooks: {
    name: 'QuickBooks',
    authUrl: 'https://appcenter.intuit.com/connect/oauth2',
    tokenUrl: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    scope: 'com.intuit.quickbooks.accounting',
    idEnv: 'QBO_CLIENT_ID', secretEnv: 'QBO_CLIENT_SECRET',
    pkce: false, returnsRealmId: true, synced: true,
  },
  xero: {
    name: 'Xero',
    authUrl: 'https://login.xero.com/identity/connect/authorize',
    tokenUrl: 'https://identity.xero.com/connect/token',
    scope: 'openid accounting.reports.read accounting.transactions.read offline_access',
    idEnv: 'XERO_CLIENT_ID', secretEnv: 'XERO_CLIENT_SECRET',
    pkce: true, synced: false,
  },
  hubspot: {
    name: 'HubSpot',
    authUrl: 'https://app.hubspot.com/oauth/authorize',
    tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
    scope: 'oauth crm.objects.contacts.read crm.objects.deals.read',
    idEnv: 'HUBSPOT_CLIENT_ID', secretEnv: 'HUBSPOT_CLIENT_SECRET',
    pkce: false, synced: false,
  },
};

function get(providerId) { return PROVIDERS[String(providerId || '')] || null; }
function creds(p) { return { id: process.env[p.idEnv], secret: process.env[p.secretEnv] }; }
function isConfigured(p) { const c = creds(p); return !!(c.id && c.secret); }
function redirectUri(providerId) { return `${BASE_URL}/api/os2-oauth/${providerId}/callback`; }

// List providers with whether each is configured (has env creds).
function listProviders() {
  return Object.keys(PROVIDERS).map((id) => ({ id, name: PROVIDERS[id].name, configured: isConfigured(PROVIDERS[id]), synced: PROVIDERS[id].synced === true }));
}

// PKCE helpers.
function makeVerifier() { return crypto.randomBytes(32).toString('base64url'); }
function challengeFor(verifier) { return crypto.createHash('sha256').update(verifier).digest('base64url'); }

// Build the provider authorize URL for a given state (+ code challenge if PKCE).
function buildAuthUrl(providerId, state, codeChallenge) {
  const p = get(providerId); if (!p) throw new Error('Unknown provider');
  const c = creds(p);
  const q = new URLSearchParams({
    client_id: c.id, response_type: 'code', scope: p.scope,
    redirect_uri: redirectUri(providerId), state,
  });
  if (p.pkce && codeChallenge) { q.set('code_challenge', codeChallenge); q.set('code_challenge_method', 'S256'); }
  return `${p.authUrl}?${q.toString()}`;
}

async function tokenPost(p, form) {
  const c = creds(p);
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' };
  // Most providers accept Basic auth for the client credentials at the token endpoint.
  headers['Authorization'] = 'Basic ' + Buffer.from(`${c.id}:${c.secret}`).toString('base64');
  const r = await fetch(p.tokenUrl, { method: 'POST', headers, body: new URLSearchParams(form).toString() });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) { const msg = (body && (body.error_description || body.error)) || `Token endpoint returned ${r.status}`; throw new Error(String(msg)); }
  return body;
}

// Exchange an authorization code for tokens. Returns a normalized token object.
async function exchangeCode(providerId, code, codeVerifier) {
  const p = get(providerId); if (!p) throw new Error('Unknown provider');
  const form = { grant_type: 'authorization_code', code, redirect_uri: redirectUri(providerId) };
  if (p.pkce && codeVerifier) form.code_verifier = codeVerifier;
  const t = await tokenPost(p, form);
  return normalize(t);
}

// Refresh an access token.
async function refreshToken(providerId, refresh_token) {
  const p = get(providerId); if (!p) throw new Error('Unknown provider');
  const t = await tokenPost(p, { grant_type: 'refresh_token', refresh_token });
  return normalize(t, refresh_token);
}

function normalize(t, prevRefresh) {
  const expiresIn = Number(t.expires_in) || 3600;
  return {
    access_token: t.access_token,
    refresh_token: t.refresh_token || prevRefresh || null,
    expires_at: Date.now() + (expiresIn - 60) * 1000, // refresh a minute early
    scope: t.scope || '',
    token_type: t.token_type || 'bearer',
  };
}

module.exports = {
  PROVIDERS, get, creds, isConfigured, redirectUri, listProviders,
  makeVerifier, challengeFor, buildAuthUrl, exchangeCode, refreshToken, normalize, BASE_URL,
};
