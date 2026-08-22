// Ops Machine — Strategy: advisor / mentor log (most recent first)
module.exports = require('./_oscrud').crud('os_advisor_notes', { order: 'created_at', ascending: false });
