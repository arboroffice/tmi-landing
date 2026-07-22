// TMI OS — shared metric value handling. Turns an incoming value into a live
// metric update: stamps the time and source and appends a capped history point
// so the command center can show a trend. Used by the ingest endpoint (external
// tools) and the connect endpoint (manual push from the app).

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

function toNum(v) {
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
}

// Does this metric match the reference an external caller used?
// Matches on an explicit stored key, the slug of the label, or the raw label.
function matches(metric, ref) {
  if (ref == null) return false;
  const r = String(ref).toLowerCase();
  return (metric.key && String(metric.key).toLowerCase() === r)
    || slug(metric.label) === slug(ref)
    || String(metric.label || '').toLowerCase() === r;
}

// Persist a new value on a metric, keeping up to 30 history points.
async function applyValue(db, metric, value, source) {
  const now = new Date().toISOString();
  const num = toNum(value);
  const prev = Array.isArray(metric.history) ? metric.history : [];
  const history = (num != null ? prev.concat([{ t: now, v: num }]) : prev).slice(-30);
  await db.update('os_metrics', metric.id, {
    value: String(value).slice(0, 40),
    updated_at: now,
    source: String(source || '').slice(0, 40),
    history,
  });
}

module.exports = { slug, toNum, matches, applyValue };
