const storage = require('./_storage');
const { requireAuth, cors } = require('./_auth');

// File storage on the Firebase Storage bucket. Admin-only.
//
// POST { action:'upload-url', filename, content_type, folder? }
//   -> { path, upload_url }  (browser then PUTs the file to upload_url with
//      the same Content-Type header)
// GET ?path=<object path>
//   -> { url }  (signed read URL, 60 min — use for playback/download)
// DELETE ?path=<object path>
//   -> { ok: true }

const SAFE = /[^a-zA-Z0-9._-]+/g;

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'POST') {
      const b = req.body || {};
      if (b.action !== 'upload-url') return res.status(400).json({ error: 'action must be upload-url' });
      const contentType = b.content_type || 'application/octet-stream';
      const folder = String(b.folder || 'uploads').replace(SAFE, '-').replace(/^-+|-+$/g, '') || 'uploads';
      const name = String(b.filename || 'file').replace(SAFE, '-').slice(-80);
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`;
      const upload_url = await storage.signedUploadUrl(path, contentType);
      return res.json({ path, upload_url, content_type: contentType });
    }

    if (req.method === 'GET') {
      const { path } = req.query;
      if (!path) return res.status(400).json({ error: 'path required' });
      const url = await storage.signedReadUrl(String(path));
      return res.json({ url });
    }

    if (req.method === 'DELETE') {
      const { path } = req.query;
      if (!path) return res.status(400).json({ error: 'path required' });
      await storage.remove(String(path));
      return res.json({ ok: true });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
