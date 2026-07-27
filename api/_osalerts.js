// TMI OS - Alerts / Awareness engine. The whole thesis is that you find out the
// day it happens, not from an angry customer a month later. This evaluates the
// owner's alert rules against real numbers (the records graph plus any tracked
// metric) and fires an alert when a line is crossed, into the in-app feed and,
// if the rule asks, email and SMS. Pure-ish: it reads and writes through the
// scoped db handles passed in, no time-at-module-load.

const { toNum, slug } = require('./_osmetric');
const records = require('./_osrecords');

// Built-in signals computed straight from the company graph.
const BUILTINS = [
  { key: 'outstanding', label: 'Money owed to you (AR outstanding)', unit: '$', dir: 'high_bad' },
  { key: 'overdue_invoices', label: 'Overdue invoices', unit: '', dir: 'high_bad' },
  { key: 'open_invoices', label: 'Open invoices', unit: '', dir: 'high_bad' },
];
const BUILTIN_KEYS = new Set(BUILTINS.map(b => b.key));

// Current value for every alertable metric on a tenant: the built-in graph
// signals plus each tracked custom metric (by its key/slug).
async function computeValues(tenantId, metricsRows) {
  const stats = await records.graphStats(tenantId).catch(() => ({ outstanding: 0, overdueInvoices: 0, openInvoices: 0 }));
  const values = {
    outstanding: Number(stats.outstanding || 0),
    overdue_invoices: Number(stats.overdueInvoices || 0),
    open_invoices: Number(stats.openInvoices || 0),
  };
  const catalog = BUILTINS.slice();
  (metricsRows || []).forEach(m => {
    const key = m.key ? String(m.key) : slug(m.label);
    if (!key || BUILTIN_KEYS.has(key)) return;
    const n = toNum(m.value);
    if (n == null) return;
    values[key] = n;
    catalog.push({ key, label: m.label || key, unit: '', dir: 'custom', custom: true });
  });
  return { values, catalog };
}

function tripped(value, op, threshold) {
  const v = Number(value), th = Number(threshold);
  if (!isFinite(v) || !isFinite(th)) return false;
  switch (op) {
    case '>': return v > th;
    case '>=': return v >= th;
    case '<': return v < th;
    case '<=': return v <= th;
    case '==': return v === th;
    default: return false;
  }
}

function opWord(op) {
  return { '>': 'above', '>=': 'at or above', '<': 'below', '<=': 'at or below', '==': 'at' }[op] || op;
}

function fmtVal(v, unit) {
  if (unit === '$') return '$' + Math.round(Number(v)).toLocaleString('en-US');
  return String(Math.round(Number(v) * 100) / 100);
}

// Evaluate all active rules for one tenant. `tdb` is the tenant-scoped handle,
// `db` the raw handle (for cross-tenant os_alerts and delivery lookups).
// Returns the alerts that fired. Delivery (email/SMS) is best-effort.
async function evaluate(tdb, db, tenantId, opts = {}) {
  const cooldownH = opts.cooldownHours != null ? opts.cooldownHours : 12;
  const now = Date.now();
  const [rules, metricsRows] = await Promise.all([
    tdb.list('os_alert_rules', { limit: 200 }),
    tdb.list('os_metrics', { limit: 500 }).catch(() => []),
  ]);
  const active = rules.filter(r => r.active !== false);
  if (!active.length) return [];
  const { values, catalog } = await computeValues(tenantId, metricsRows);
  const catByKey = {}; catalog.forEach(c => { catByKey[c.key] = c; });
  const fired = [];

  for (const r of active) {
    const key = r.metric_key;
    if (!(key in values)) continue;
    const value = values[key];
    if (!tripped(value, r.op, r.threshold)) {
      // Clear the tripped flag so it can fire fresh next time it crosses.
      if (r.tripped) await tdb.update('os_alert_rules', r.id, { tripped: false, last_value: value });
      continue;
    }
    // Respect cooldown, and do not re-fire while still tripped unless forced.
    const last = r.last_fired_at ? Date.parse(r.last_fired_at) : 0;
    const cool = now - last < cooldownH * 3600 * 1000;
    if (r.tripped && cool && !opts.force) { await tdb.update('os_alert_rules', r.id, { last_value: value }); continue; }

    const cat = catByKey[key] || { label: r.metric_label || key, unit: '' };
    const label = r.metric_label || cat.label || key;
    const message = `${label} is ${opWord(r.op)} ${fmtVal(r.threshold, cat.unit)}. It is now ${fmtVal(value, cat.unit)}.`;
    const iso = new Date().toISOString();
    const alert = await tdb.insert('os_alerts', {
      rule_id: r.id, metric_key: key, label, value, threshold: r.threshold, op: r.op,
      message, read: false, created_at: iso,
    });
    await tdb.update('os_alert_rules', r.id, { tripped: true, last_fired_at: iso, last_value: value });
    await db.insert('os_build_log', { tenant_id: tenantId, kind: 'alert', summary: message, created_at: iso }).catch(() => {});
    fired.push({ alert, rule: r, message, channels: r.channels || {} });
  }

  if (fired.length) await deliver(db, tenantId, fired).catch(e => console.error('alert deliver:', e.message));
  return fired.map(f => f.alert);
}

// Best-effort email + SMS for fired alerts that asked for it.
async function deliver(db, tenantId, fired) {
  const wantEmail = fired.filter(f => f.channels && f.channels.email);
  const wantSms = fired.filter(f => f.channels && f.channels.sms);
  if (!wantEmail.length && !wantSms.length) return;
  const tenant = await db.getById('os_tenants', tenantId).catch(() => null);
  const owner = (await db.list('os_users', { where: [['tenant_id', '==', tenantId]] }).catch(() => [])).find(u => (u.role || 'owner') === 'owner');
  const company = (tenant && tenant.name) || 'your company';

  if (wantEmail.length && owner && owner.email && process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      const lines = wantEmail.map(f => `<li style="margin-bottom:8px">${f.message}</li>`).join('');
      await resend.emails.send({
        from: 'TMI OS <support@tmitechai.com>', to: owner.email,
        subject: `Heads up on ${company}: ${wantEmail.length} alert${wantEmail.length > 1 ? 's' : ''}`,
        html: `<div style="font-family:Helvetica,Arial,sans-serif;color:#1a1a1a"><p style="font-size:15px">Something on ${company} crossed a line you set:</p><ul style="font-size:15px;line-height:1.6;padding-left:18px">${lines}</ul><p style="font-size:14px"><a href="https://os.tmitechai.com" style="color:#6f8f2a">Open the OS</a></p></div>`,
      });
    } catch (e) { console.error('alert email:', e.message); }
  }
  if (wantSms.length && process.env.TWILIO_ACCOUNT_SID) {
    const phone = (tenant && tenant.profile && tenant.profile.phone) || (tenant && tenant.channels && tenant.channels.sms);
    if (phone) {
      try {
        const twilio = require('twilio');
        const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await sms.messages.create({ from: '+18557171044', to: phone, body: `TMI OS: ${wantSms.map(f => f.message).join(' ')}`.slice(0, 300) });
      } catch (e) { console.error('alert sms:', e.message); }
    }
  }
}

module.exports = { BUILTINS, computeValues, evaluate, tripped, opWord, fmtVal };
