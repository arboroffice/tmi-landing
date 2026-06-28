// Academy lessons. Filter by ?course_id=.
module.exports = require('./_publiccrud').crud('lessons', { order: 'sort', ascending: true, scopeField: 'course_id' });
