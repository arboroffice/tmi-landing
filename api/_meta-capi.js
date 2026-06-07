// Meta Conversions API (CRM / Conversion Leads) helper.
// Sends lead status events to the Meta dataset so CRM stage changes appear
// in Events Manager and can optimize ad delivery for quality leads.
// Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
//
// Required env: META_CAPI_ACCESS_TOKEN  (dataset access token from Events Manager)
// Optional env: META_DATASET_ID (default below), META_CAPI_VERSION (default v25.0),
//               META_LEAD_EVENT_SOURCE (your CRM name), META_TEST_EVENT_CODE (testing only)

const crypto = require('crypto');

const GRAPH_VERSION = process.env.META_CAPI_VERSION || 'v25.0';
const DATASET_ID = process.env.META_DATASET_ID || '1020562120324709';
const LEAD_EVENT_SOURCE = process.env.META_LEAD_EVENT_SOURCE || 'TMI CRM';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Normalizers per Meta's matching spec, then SHA-256. Returns undefined when empty.
const NORMALIZE = {
  email:  s => s,
  phone:  s => s.replace(/[^0-9]/g, ''),            // digits incl. country code
  name:   s => s.replace(/[^a-zÀ-ɏ]/g, ''), // letters only
  city:   s => s.replace(/[^a-zÀ-ɏ]/g, ''),
  region: s => s.replace(/[^a-z]/g, ''),            // state -> 2-letter style
  zip:    s => s.replace(/[^a-z0-9]/g, '').slice(0, 5),
  country:s => s.replace(/[^a-z]/g, '').slice(0, 2),
};

function hashField(value, kind) {
  if (value === undefined || value === null) return undefined;
  let s = String(value).trim().toLowerCase();
  const norm = NORMALIZE[kind];
  if (norm) s = norm(s);
  if (!s) return undefined;
  return sha256(s);
}

function parseCookies(cookieHeader = '') {
  const out = {};
  String(cookieHeader).split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

// Pull Meta browser-match context (click id / browser id / ip / ua) from a request.
function webContext(req) {
  const cookies = parseCookies(req.headers && req.headers.cookie ? req.headers.cookie : '');
  const xff = ((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim();
  return {
    fbc: cookies._fbc || undefined,
    fbp: cookies._fbp || undefined,
    clientIp: xff || undefined,
    userAgent: (req.headers && req.headers['user-agent']) || undefined,
  };
}

function buildUserData(info = {}) {
  const ud = {};
  const em = hashField(info.email, 'email');
  const ph = hashField(info.phone, 'phone');
  const fn = hashField(info.firstName, 'name');
  const ln = hashField(info.lastName, 'name');
  const ct = hashField(info.city, 'city');
  const st = hashField(info.state, 'region');
  const zp = hashField(info.zip, 'zip');
  const co = hashField(info.country, 'country');
  if (em) ud.em = [em];
  if (ph) ud.ph = [ph];
  if (fn) ud.fn = [fn];
  if (ln) ud.ln = [ln];
  if (ct) ud.ct = [ct];
  if (st) ud.st = [st];
  if (zp) ud.zp = [zp];
  if (co) ud.country = [co];
  if (info.leadId) ud.lead_id = String(info.leadId); // Meta lead-ad id (NOT hashed)
  if (info.fbc) ud.fbc = info.fbc;                    // click id (NOT hashed)
  if (info.fbp) ud.fbp = info.fbp;                    // browser id (NOT hashed)
  if (info.clientIp) ud.client_ip_address = info.clientIp;
  if (info.userAgent) ud.client_user_agent = info.userAgent;
  return ud;
}

/**
 * Send one CRM lead event to Meta.
 * @param {object} opts
 *   eventName        the CRM stage the lead changed to (e.g. 'Lead', 'qualified')
 *   eventTime        UNIX seconds (defaults to now)
 *   email, phone, firstName, lastName, city, state, zip, country
 *   leadId           Meta lead-ad id (optional, only if the lead came from a Meta Lead Ad)
 *   fbc, fbp         click id / browser id from _fbc / _fbp cookies (highly recommended)
 *   clientIp, userAgent
 *   actionSource     defaults 'system_generated' (CRM). Use 'website' for form submits.
 *   eventSourceUrl   page URL the event happened on (website events)
 *   optOut           boolean; true suppresses this event from ads optimization
 *   leadEventSource  your CRM name (defaults to META_LEAD_EVENT_SOURCE)
 *   eventId          optional dedup id (share with the browser pixel eventID)
 *   testEventCode    optional, routes to Events Manager "Test Events" tab
 * @returns {Promise<{ok?:boolean, skipped?:boolean, status?:number, body?:object, error?:string, reason?:string}>}
 *   Never throws — safe to fire-and-forget.
 */
async function sendLeadEvent(opts = {}) {
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!token) return { skipped: true, reason: 'META_CAPI_ACCESS_TOKEN not set' };

  const actionSource = opts.actionSource || 'system_generated';
  const isCrm = actionSource === 'system_generated';

  const event = {
    event_name: opts.eventName || 'Lead',
    event_time: opts.eventTime || Math.floor(Date.now() / 1000),
    action_source: actionSource,
    user_data: buildUserData(opts),
  };

  // CRM stage events carry crm provenance; website events (e.g. SubmitApplication)
  // do not, so the standard event reads cleanly in Events Manager.
  const customData = Object.assign(
    isCrm ? { event_source: 'crm', lead_event_source: opts.leadEventSource || LEAD_EVENT_SOURCE } : {},
    opts.customData || {}
  );
  if (Object.keys(customData).length) event.custom_data = customData;

  if (opts.eventSourceUrl) event.event_source_url = opts.eventSourceUrl;   // Event Source URL
  if (typeof opts.optOut === 'boolean') event.opt_out = opts.optOut;       // Opt Out
  if (opts.eventId) event.event_id = opts.eventId;                         // Event ID (dedup)

  const body = { data: [event] };
  const testCode = opts.testEventCode || process.env.META_TEST_EVENT_CODE;
  if (testCode) body.test_event_code = testCode;

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${DATASET_ID}/events?access_token=${encodeURIComponent(token)}`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('[meta-capi] error', r.status, JSON.stringify(json));
      return { ok: false, status: r.status, body: json };
    }
    return { ok: true, status: r.status, body: json };
  } catch (e) {
    console.error('[meta-capi] fetch failed', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { sendLeadEvent, buildUserData, webContext, sha256, DATASET_ID, GRAPH_VERSION };
