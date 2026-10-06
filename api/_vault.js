// Field-level encryption for contractor tax and bank details (TIN, routing and
// account numbers) and signed paperwork. AES-256-GCM. The key comes from
// VAULT_KEY if set, else is derived from JWT_SECRET; changing either makes
// stored values unreadable, so do not rotate them without re-encrypting.
const crypto = require('crypto');

function key() {
  const base = process.env.VAULT_KEY || process.env.JWT_SECRET;
  if (!base) throw new Error('No vault key configured');
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(base), Buffer.from('tmi-vault'), Buffer.from('rep-onboarding-v1'), 32));
}

function seal(plain) {
  if (plain == null || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}

function open(sealed) {
  if (!sealed) return null;
  const raw = Buffer.from(String(sealed).replace(/^v1:/, ''), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}

module.exports = { seal, open };
