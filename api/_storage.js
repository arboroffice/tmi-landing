// Firebase Storage helper (Firebase Admin SDK). Server-only.
//
// Uses the same FIREBASE_SERVICE_ACCOUNT credentials as _db.js. The bucket
// defaults to <project_id>.firebasestorage.app; override with
// FIREBASE_STORAGE_BUCKET if needed.
const admin = require('firebase-admin');

let _bucket;
function bucket() {
  if (_bucket) return _bucket;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT not configured');
  const json = raw.trim().charAt(0) === '{' ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const sa = JSON.parse(json);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  const name = process.env.FIREBASE_STORAGE_BUCKET || `${sa.project_id}.firebasestorage.app`;
  _bucket = admin.storage().bucket(name);
  return _bucket;
}

// Browser uploads PUT directly to GCS with a signed URL, which requires CORS
// on the bucket. Set it once per warm instance; repeat calls are harmless.
let _corsDone = false;
async function ensureCors() {
  if (_corsDone) return;
  await bucket().setCorsConfiguration([{
    origin: ['*'],
    method: ['GET', 'PUT', 'HEAD'],
    responseHeader: ['Content-Type'],
    maxAgeSeconds: 3600,
  }]);
  _corsDone = true;
}

// Short-lived URL the browser PUTs the file to. Content-Type must match.
async function signedUploadUrl(path, contentType) {
  await ensureCors();
  const [url] = await bucket().file(path).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  });
  return url;
}

// Short-lived URL for reading a private object (playback, download).
async function signedReadUrl(path, minutes = 60) {
  const [url] = await bucket().file(path).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + minutes * 60 * 1000,
  });
  return url;
}

async function remove(path) {
  await bucket().file(path).delete({ ignoreNotFound: true });
}

module.exports = { bucket, signedUploadUrl, signedReadUrl, remove };
