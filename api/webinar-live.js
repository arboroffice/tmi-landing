// Public read of "this week's live stream" for the class room (watch.html).
// The room link emailed to registrants never changes; each week the team sets
// the current YouTube Live (or other) URL in the admin, and this returns it so
// the room shows the right feed without any code change.
//
//   GET -> { live_url, yt_id, session_time, updated_at }

const db = require('./_db');

// Parse a YouTube video id from the common URL shapes (watch, youtu.be, /live/,
// embed, shorts). Returns null when the URL is not an embeddable YouTube link.
function ytId(url) {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/\/(live|embed|shorts)\/([^/?#]+)/);
      if (m) return m[2];
    }
  } catch (_) {}
  return null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let cfg = null;
  try { cfg = await db.findOne('webinar_config', 'key', 'live'); } catch (_) {}
  const live_url = (cfg && cfg.live_url) || '';
  return res.status(200).json({
    live_url,
    yt_id: ytId(live_url),
    session_time: (cfg && cfg.session_time) || '',
    updated_at: (cfg && cfg.updated_at) || '',
  });
};

module.exports.ytId = ytId;
