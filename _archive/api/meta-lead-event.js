// POST a CRM lead status change to Meta's Conversions API.
// Call this whenever a lead moves to a new stage in the CRM (including the
// initial raw-lead stage). Auth required (Bearer JWT, same as the rest of the CRM API).
//
// Body:
//   event_name   (required)  the stage the lead changed to, e.g. "Lead", "qualified", "won"
//   email | phone | lead_id  (at least one required for matching)
//   first_name, last_name, city, state, zip, country   (optional, improve match quality)
//   fbc, fbp     (optional)  click id / browser id if you have them
//   event_time   (optional)  UNIX seconds; defaults to now
//   event_id     (optional)  dedup id
//   test_event_code (optional) routes to the Test Events tab in Events Manager
//
// Returns Meta's response. No-ops with 503 if META_CAPI_ACCESS_TOKEN is unset.

const { requireAuth, cors } = require('./_auth');
const { sendLeadEvent, webContext } = require('./_meta-capi');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;

  const b = req.body || {};
  if (!b.event_name) {
    return res.status(400).json({ error: 'event_name required (the CRM stage the lead changed to)' });
  }
  if (!b.email && !b.phone && !b.lead_id) {
    return res.status(400).json({ error: 'Provide at least one of: email, phone, lead_id' });
  }

  const ctx = webContext(req);
  const result = await sendLeadEvent({
    eventName: b.event_name,
    eventTime: b.event_time,
    email: b.email,
    phone: b.phone,
    firstName: b.first_name,
    lastName: b.last_name,
    city: b.city,
    state: b.state,
    zip: b.zip,
    country: b.country,
    leadId: b.lead_id,
    eventId: b.event_id,
    testEventCode: b.test_event_code,
    fbc: b.fbc || ctx.fbc,
    fbp: b.fbp || ctx.fbp,
    clientIp: ctx.clientIp,
    userAgent: ctx.userAgent,
  });

  if (result.skipped) return res.status(503).json({ error: result.reason });
  if (!result.ok) return res.status(502).json({ error: 'Meta CAPI error', detail: result.body || result.error });
  return res.status(200).json({ success: true, meta: result.body });
};
