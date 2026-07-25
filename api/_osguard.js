// TMI OS - output guardrails. Before any agent work leaves the building (an
// email or a text to a real person), it passes these checks. This is the
// behavioral half of the guardrail layer: _ospolicy decides IF a worker may act
// (autonomy plus spend limits), _osguard decides whether THIS specific output is
// safe to send. A failing check downgrades an automatic action to needs-approval
// instead of letting a broken or unaddressed message go out, so the worst case
// is a human looks at it, never a customer gets garbage.

// Text that means the model left a blank it never filled, or broke character.
const PLACEHOLDER = /\[(?:name|insert|company|address|date|amount|price|link|x{2,}|todo|placeholder)[^\]]*\]|\{\{[^}]+\}\}|\bTODO\b|\bFIXME\b|\blorem ipsum\b|\bas an ai\b|\bas a language model\b|\bI cannot\b/i;

function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim()); }
function isPhone(s) { const d = String(s || '').replace(/[^\d]/g, ''); return d.length >= 10 && d.length <= 15; }

// Validate a work product and, if present, its proposed delivery action.
// Returns { ok, issues: [human-readable strings] }. Never throws.
// `action` is the normalized action (channel, to, subject) or null for internal
// work. Internal work is checked lightly; only outbound actions are gated hard.
function validateOutput(product, action) {
  const issues = [];
  const body = String((product && product.body) || '');

  if (!body.trim()) issues.push('The output is empty.');
  const ph = body.match(PLACEHOLDER);
  if (ph) issues.push(`The output still contains a placeholder or filler ("${ph[0].slice(0, 40)}").`);

  if (action) {
    if (body.trim().length < 8) issues.push('The message is too short to send.');
    const to = String(action.to || '').trim();
    const channel = String(action.channel || '');
    if (!to) issues.push('This is an outbound action with no recipient.');
    else if (channel === 'email' && !isEmail(to)) issues.push('The email recipient is not a valid address.');
    else if (channel === 'sms' && !isPhone(to)) issues.push('The text recipient is not a valid phone number.');
  }

  return { ok: issues.length === 0, issues };
}

module.exports = { validateOutput, isEmail, isPhone };
