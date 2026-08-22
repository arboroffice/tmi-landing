// Ops Machine — scraped social post metrics (Apify -> os_social_posts)
module.exports = require('./_oscrud').crud('os_social_posts', { order: 'captured_at', ascending: false });
