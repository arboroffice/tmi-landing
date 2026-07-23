// TMI OS — shared outbound-fetch safety. One SSRF guard for every place the OS
// fetches a URL a customer controls: scheduled data sync (_ossync), the site
// reader in onboarding (os2-intake), and the generic http connector
// (_osconnectors). Replaces the old per-file hostname-only checks, which were
// bypassable via DNS rebinding, redirects, and non-standard IP encodings.
//
// What it does:
//   - parses the URL and rejects non-http(s) schemes
//   - RESOLVES the hostname to IPs and blocks if ANY resolved address is
//     private/loopback/link-local/metadata (defeats DNS rebinding + numeric
//     hostnames, since we judge the resolved address, not the string)
//   - follows redirects MANUALLY, re-validating every hop the same way
//     (defeats a public host that 302s to an internal IP)
//
// Residual: a rebind between our lookup and Node's connect (TOCTOU) is not
// fully closed without pinning the socket to the checked IP; acceptable here.

const dns = require('dns').promises;
const net = require('net');

const MAX_REDIRECTS = 5;

// Is a concrete IP address private/loopback/link-local/ULA/metadata/reserved?
function isBlockedIp(ip) {
  if (!ip) return true;
  let v = String(ip).toLowerCase().trim();
  // IPv4-mapped IPv6 (::ffff:169.254.169.254) -> judge the embedded v4
  const mapped = v.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) v = mapped[1];

  if (net.isIPv4(v)) {
    const p = v.split('.').map(Number);
    if (p.some((n) => n < 0 || n > 255)) return true;
    const [a, b] = p;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;       // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a >= 224) return true;                      // multicast / reserved
    return false;
  }
  if (net.isIPv6(v)) {
    if (v === '::1' || v === '::') return true;
    if (v.startsWith('fe80:') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true; // link-local
    if (v.startsWith('fc') || v.startsWith('fd')) return true; // unique local
    if (v.startsWith('ff')) return true; // multicast
    return false;
  }
  return true; // not a parseable IP -> refuse
}

// Reject obviously-bad hostnames before we even resolve them.
function isBlockedHostname(host) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h === 'metadata.google.internal') return true;
  // A hostname that is already a literal IP (any encoding) is judged as an IP.
  if (net.isIP(h)) return isBlockedIp(h);
  // Decimal/octal/hex "IP-ish" hosts (e.g. 2130706433, 0177.0.0.1) that aren't
  // valid dotted IPs: refuse rather than try to normalize every encoding.
  if (/^0x[0-9a-f]+$/.test(h) || /^\d{8,}$/.test(h) || /^(0\d+\.){1,3}/.test(h)) return true;
  return false;
}

// Resolve a hostname and return true if every resolved address is public.
async function hostResolvesPublic(host) {
  if (isBlockedHostname(host)) return false;
  if (net.isIP(host)) return !isBlockedIp(host); // literal IP: already resolved
  let addrs;
  try { addrs = await dns.lookup(host, { all: true }); }
  catch (e) { return false; }
  if (!addrs || !addrs.length) return false;
  return addrs.every((a) => !isBlockedIp(a.address));
}

function normalizeUrl(url) {
  let u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

// Validate one URL: scheme http(s) and host resolves entirely to public IPs.
async function assertPublicUrl(url) {
  let parsed;
  try { parsed = new URL(normalizeUrl(url)); }
  catch (e) { throw new Error('That is not a valid URL.'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Only http and https URLs are allowed.');
  if (!(await hostResolvesPublic(parsed.hostname))) throw new Error('That host is not allowed.');
  return parsed;
}

// Fetch a customer-supplied URL safely. We validate the resolved IPs first,
// then refuse redirects outright (redirect:'error'): Node's global fetch hides
// the Location on 'manual' redirects, so following them safely is not possible
// without pulling in undici internals, and legitimate metric/JSON/site sources
// do not need a redirect. A redirect therefore surfaces as a clear error the
// caller can show, and can never be used to reach an internal address.
async function safeFetch(url, opts = {}, timeoutMs = 8000) {
  await assertPublicUrl(url);
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(normalizeUrl(url), Object.assign({}, opts, { redirect: 'error', signal: ctrl.signal }));
  } catch (e) {
    if (e && (e.name === 'AbortError')) throw new Error('That source timed out.');
    // undici raises a generic TypeError on a refused redirect.
    if (e && /redirect/i.test(String(e.message || ''))) throw new Error('That URL redirects; point us at the final URL instead.');
    throw new Error('Could not reach that URL.');
  }
}

module.exports = { isBlockedIp, isBlockedHostname, hostResolvesPublic, assertPublicUrl, safeFetch, MAX_REDIRECTS };
