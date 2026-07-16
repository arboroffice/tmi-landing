// Returns a downloadable .ics calendar invite for a given session instant
// (or the next Tuesday 3:00 PM CST if none is supplied).
//
// GET /api/webinar-ics?s=<ISO> -> text/calendar

const W = require('./_webinar');

module.exports = async function handler(req, res) {
  const q = (req.query && req.query.s) || '';
  let session = q ? new Date(q) : null;
  if (!session || isNaN(session.getTime())) session = W.nextSession();
  const end = new Date(session.getTime() + W.DURATION_SEC * 1000);

  const uid = `webinar-${W.icsStamp(session)}@tmitechai.com`;
  const joinUrl = `${W.SITE}/watch?s=${encodeURIComponent(session.toISOString())}`;
  const desc = `Join the class: ${joinUrl}\\n\\n40 minutes on the system that removes the owner as the bottleneck.`;

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TMI Technology//Webinar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${W.icsStamp(new Date())}`,
    `DTSTART:${W.icsStamp(session)}`,
    `DTEND:${W.icsStamp(end)}`,
    `SUMMARY:${W.EVENT_NAME}`,
    `DESCRIPTION:${desc}`,
    `URL:${joinUrl}`,
    `LOCATION:${joinUrl}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${W.EVENT_NAME} starts in 1 hour`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="tmi-intelligent-company.ics"');
  return res.status(200).send(ics);
};
