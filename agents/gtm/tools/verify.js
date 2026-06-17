// Email verification before sending — protects sending-domain reputation by
// dropping invalid addresses (bounces destroy deliverability). Uses NeverBounce
// if NEVERBOUNCE_API_KEY is set, otherwise an MX-record + syntax check.

import dns from 'dns';

const ROLE_ACCOUNTS = new Set([
  'info', 'sales', 'support', 'admin', 'contact', 'hello', 'office', 'noreply',
  'no-reply', 'team', 'help', 'billing', 'careers', 'jobs', 'marketing', 'accounts',
]);

export async function verifyEmail(email) {
  const e = String(email || '').toLowerCase().trim();
  const m = e.match(/^([^@\s]+)@([^@\s]+\.[^@\s]+)$/);
  if (!m) return { ok: false, status: 'invalid_syntax', role: false };
  const local = m[1];
  const domain = m[2];
  const role = ROLE_ACCOUNTS.has(local);

  // Provider verification if configured.
  if (process.env.NEVERBOUNCE_API_KEY) {
    try {
      const url = `https://api.neverbounce.com/v4/single/check?key=${process.env.NEVERBOUNCE_API_KEY}&email=${encodeURIComponent(e)}`;
      const r = await (await fetch(url)).json();
      const bad = ['invalid', 'disposable'];
      return { ok: !bad.includes(r.result), status: r.result || 'unknown', role };
    } catch { /* fall through to MX */ }
  }

  // Fallback: domain has mail servers.
  try {
    const mx = await dns.promises.resolveMx(domain);
    const ok = Array.isArray(mx) && mx.length > 0;
    return { ok, status: ok ? 'mx_ok' : 'no_mx', role };
  } catch {
    return { ok: false, status: 'no_mx', role };
  }
}
