// Minimal GitHub Contents API client, so an admin server function can commit a
// new article and the updated news.html straight to main. A push to main is what
// triggers the live Vercel deploy, so this is the last link in the flywheel:
// fulfillment to proof to a published, live story.
//
// Needs env GITHUB_TOKEN (a token with contents:write on the repo). Repo and
// branch default to this project but can be overridden with GITHUB_REPO /
// GITHUB_BRANCH. If no token is set, every call throws a clear, catchable error.

const API = 'https://api.github.com';

function cfg() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not configured. Add a token with contents:write to publish to the live site.');
  const repo = process.env.GITHUB_REPO || 'arboroffice/tmi-landing';
  const branch = process.env.GITHUB_BRANCH || 'main';
  return { token, repo, branch };
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'tmi-admin-publish',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

// Read a file's current content + sha. Returns null if it does not exist.
async function getFile(path) {
  const { token, repo, branch } = cfg();
  const r = await fetch(`${API}/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`, { headers: headers(token) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub read ${path} failed (${r.status})`);
  const j = await r.json();
  return { sha: j.sha, content: Buffer.from(j.content || '', 'base64').toString('utf8') };
}

// Create or update a file. Pass the existing sha to update; omit to create.
async function putFile(path, content, message, sha) {
  const { token, repo, branch } = cfg();
  const body = { message, content: Buffer.from(content, 'utf8').toString('base64'), branch };
  if (sha) body.sha = sha;
  const r = await fetch(`${API}/repos/${repo}/contents/${encodeURIComponent(path)}`, {
    method: 'PUT', headers: headers(token), body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`GitHub write ${path} failed (${r.status}) ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  return { sha: j.content && j.content.sha, commit: j.commit && j.commit.sha };
}

function configured() {
  return !!(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
}

module.exports = { getFile, putFile, configured };
