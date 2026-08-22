// Community discussions (members create/edit their own; admin moderates).
module.exports = require('./_membercrud').crud('community_posts', { order: 'created_at' });
