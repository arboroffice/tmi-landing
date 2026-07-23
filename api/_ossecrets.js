// TMI OS - per-tenant encrypted credential vault. SERVER-ONLY.
//
// This module stores third-party credentials (provider API keys, tokens, from
// identities) that a tenant connects to their company. Values are encrypted at
// rest with AES-256-GCM and are NEVER returned in plaintext to any client
// response. Only other server modules call getSecret(); endpoints must expose,
// at most, whether a secret exists (hasSecret) and which providers are set
// (listProviders), never the decrypted contents.
//
// Storage: collection os_secrets, one doc per (tenant_id, provider), upserted.
// Fields: { tenant_id, provider, ciphertext, iv, tag, updated_at }.

const crypto = require('crypto');
const db = require('./_db');

// Fixed salt for the JWT_SECRET fallback derivation. Not a secret; it only has
// to be stable so the same JWT_SECRET always yields the same key.
const FALLBACK_SALT = 'tmi-os-secrets-v1';

let _key;

// Derive a 32-byte key. Prefer OS_SECRETS_KEY (accepts hex, base64, or raw),
// falling back to a scrypt derivation from JWT_SECRET with a fixed salt.
function deriveKey() {
  if (_key) return _key;
  const raw = process.env.OS_SECRETS_KEY;
  if (raw && String(raw).trim() !== '') {
    const s = String(raw).trim();
    if (/^[0-9a-fA-F]{64}$/.test(s)) {
      _key = Buffer.from(s, 'hex');
      return _key;
    }
    try {
      const b = Buffer.from(s, 'base64');
      if (b.length === 32) { _key = b; return _key; }
    } catch (_e) { /* fall through */ }
    const rawBuf = Buffer.from(s, 'utf8');
    if (rawBuf.length === 32) { _key = rawBuf; return _key; }
    _key = crypto.scryptSync(s, FALLBACK_SALT, 32);
    return _key;
  }
  const jwt = process.env.JWT_SECRET;
  if (!jwt) throw new Error('OS_SECRETS_KEY or JWT_SECRET not configured');
  _key = crypto.scryptSync(String(jwt), FALLBACK_SALT, 32);
  return _key;
}

function encrypt(obj) {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ct.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function decrypt(doc) {
  const key = deriveKey();
  const iv = Buffer.from(doc.iv, 'base64');
  const tag = Buffer.from(doc.tag, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([
    decipher.update(Buffer.from(doc.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(pt.toString('utf8'));
}

// Store (or replace) a tenant's credential object for a provider.
async function putSecret(tenantId, provider, obj) {
  const tid = String(tenantId);
  const prov = String(provider);
  const enc = encrypt(obj || {});
  const fields = {
    tenant_id: tid,
    provider: prov,
    ciphertext: enc.ciphertext,
    iv: enc.iv,
    tag: enc.tag,
    updated_at: new Date().toISOString(),
  };
  const existing = await findRow(tid, prov);
  if (existing) return db.update('os_secrets', existing.id, fields);
  return db.insert('os_secrets', fields);
}

// Return the decrypted credential object, or null if not set. Server-only.
async function getSecret(tenantId, provider) {
  const row = await findRow(String(tenantId), String(provider));
  if (!row || !row.ciphertext || !row.iv || !row.tag) return null;
  try {
    return decrypt(row);
  } catch (_e) {
    // Never log secret contents; a decrypt failure means the key changed or the
    // record is corrupt. Treat as absent.
    return null;
  }
}

async function hasSecret(tenantId, provider) {
  const row = await findRow(String(tenantId), String(provider));
  return !!(row && row.ciphertext);
}

// Permanently remove a stored credential (e.g. on disconnect). Server-only.
async function delSecret(tenantId, provider) {
  const row = await findRow(String(tenantId), String(provider));
  if (row) await db.remove('os_secrets', row.id).catch(() => {});
  return true;
}

async function listProviders(tenantId) {
  const rows = await db.list('os_secrets', { where: [['tenant_id', '==', String(tenantId)]] });
  return rows.map(r => r.provider).filter(Boolean);
}

// Find the single os_secrets doc for a tenant+provider (one filter to Firestore,
// the rest in JS, per _db conventions).
async function findRow(tid, prov) {
  const rows = await db.list('os_secrets', { where: [['tenant_id', '==', tid], ['provider', '==', prov]] });
  return rows[0] || null;
}

module.exports = { putSecret, getSecret, hasSecret, delSecret, listProviders };
