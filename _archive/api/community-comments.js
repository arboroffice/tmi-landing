// Comments on a post. Filter by ?post_id=.
module.exports = require('./_membercrud').crud('community_comments', { order: 'created_at', ascending: true, scopeField: 'post_id' });
