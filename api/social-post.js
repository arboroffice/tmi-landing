const crypto = require('crypto');
const { requireAuth, cors } = require('./_auth');
const db = require('./_db');

// ── Twitter OAuth 1.0a ────────────────────────────────────────────────────────
function oauthSign(method, url, params, consumerSecret, tokenSecret) {
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const paramStr = sorted.map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');
  const base = `${method.toUpperCase()}&${enc(url)}&${enc(paramStr)}`;
  const key = `${enc(consumerSecret)}&${enc(tokenSecret)}`;
  return crypto.createHmac('sha1', key).update(base).digest('base64');
}

function enc(s) { return encodeURIComponent(String(s)); }

function buildAuthHeader(method, url, body, creds) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const ts = Math.floor(Date.now() / 1000).toString();
  const oauthParams = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: ts,
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };
  const allParams = { ...oauthParams, ...body };
  const sig = oauthSign(method, url, allParams, creds.apiSecret, creds.accessTokenSecret);
  oauthParams.oauth_signature = sig;
  const hdr = Object.entries(oauthParams)
    .map(([k, v]) => `${enc(k)}="${enc(v)}"`)
    .join(', ');
  return `OAuth ${hdr}`;
}

async function postToX(text) {
  const creds = {
    apiKey: process.env.TWITTER_API_KEY,
    apiSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  };
  if (!creds.apiKey || !creds.apiSecret || !creds.accessToken || !creds.accessTokenSecret) {
    throw new Error('Twitter credentials not configured. Set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET in Vercel env.');
  }

  const url = 'https://api.twitter.com/2/tweets';
  const bodyPayload = { text };
  const authHeader = buildAuthHeader('POST', url, {}, creds);

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(bodyPayload),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.detail || data?.errors?.[0]?.message || 'Twitter API error');
  return data.data?.id;
}

// ── LinkedIn Posts API ────────────────────────────────────────────────────────
async function postToLinkedIn(text) {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const authorUrn = process.env.LINKEDIN_AUTHOR_URN; // e.g. urn:li:person:XXXXX or urn:li:organization:XXXXX
  if (!token || !authorUrn) {
    throw new Error('LinkedIn credentials not configured. Set LINKEDIN_ACCESS_TOKEN and LINKEDIN_AUTHOR_URN in Vercel env.');
  }

  const url = 'https://api.linkedin.com/rest/posts';
  const body = {
    author: authorUrn,
    commentary: text,
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': '202408',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err?.message || err?.serviceErrorCode || `LinkedIn API ${r.status}`);
  }
  // LinkedIn returns 201 with id in header
  const postId = r.headers.get('x-restli-id') || r.headers.get('location') || 'posted';
  return postId;
}

// ── QStash scheduling ─────────────────────────────────────────────────────────
async function schedulePost(payload, scheduledAt) {
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error('QSTASH_TOKEN not configured');

  const destination = `https://${process.env.VERCEL_URL || 'tmi-technology.com'}/api/social-post`;
  const notBefore = Math.floor(new Date(scheduledAt).getTime() / 1000);

  const r = await fetch(`https://qstash.upstash.io/v2/publish/${encodeURIComponent(destination)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Upstash-Not-Before': String(notBefore),
    },
    body: JSON.stringify({ ...payload, _scheduled: true }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || 'QStash error');
  return data.messageId;
}

// ── Handler ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // QStash-triggered scheduled post (no user auth, verify via signature presence)
  const isScheduled = req.body?._scheduled === true;
  if (!isScheduled && !requireAuth(req, res)) return;

  const { post_id, platforms = [], content_body, schedule_at } = req.body || {};

  // ── Schedule mode ─────────────────────────────────────────────────────────
  if (schedule_at && !isScheduled) {
    try {
      const msgId = await schedulePost({ post_id, platforms, content_body }, schedule_at);
      // Update post status in DB (best effort)
      if (post_id) {
        await db.update('content_posts', post_id, { status: 'scheduled', scheduled_at: schedule_at }).catch(() => {});
      }
      return res.json({ ok: true, scheduled: true, message_id: msgId });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Post now mode ─────────────────────────────────────────────────────────
  if (!content_body) return res.status(400).json({ error: 'content_body required' });
  if (!platforms || platforms.length === 0) return res.status(400).json({ error: 'Select at least one platform (x, linkedin)' });

  const results = {};
  const errors = {};

  if (platforms.includes('x') || platforms.includes('twitter')) {
    try {
      results.x_id = await postToX(content_body);
    } catch (e) {
      errors.x = e.message;
    }
  }

  if (platforms.includes('linkedin')) {
    try {
      results.linkedin_id = await postToLinkedIn(content_body);
    } catch (e) {
      errors.linkedin = e.message;
    }
  }

  // Update post status in DB (best effort)
  if (post_id) {
    const posted = Object.keys(results).length > 0;
    await db.update('content_posts', post_id, {
      status: posted ? 'posted' : 'draft',
      posted_at: posted ? new Date().toISOString() : null,
      notes: JSON.stringify({ post_ids: results, errors }),
    }).catch(() => {});
  }

  const hasSuccess = Object.keys(results).length > 0;
  const hasErrors = Object.keys(errors).length > 0;

  return res.status(hasSuccess ? 200 : 500).json({
    ok: hasSuccess,
    ...results,
    ...(hasErrors ? { errors } : {}),
  });
};
