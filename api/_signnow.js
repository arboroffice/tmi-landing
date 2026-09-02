// SignNow REST client (server-only). Used by doc-agent to send prepared,
// Mia-approved documents out for e-signature.
//
// Config (env):
//   SIGNNOW_ACCESS_TOKEN  - OAuth2 bearer token for the SignNow API user
//   SIGNNOW_API_BASE      - optional, defaults to https://api.signnow.com
//
// This module never sends anything on its own. doc-agent only calls it after
// Mia's explicit Approve & Send. If the token is not configured, every call
// throws a clear, non-secret error so the endpoint can report it cleanly.

const API_BASE = process.env.SIGNNOW_API_BASE || 'https://api.signnow.com';

function token() {
  const t = process.env.SIGNNOW_ACCESS_TOKEN;
  if (!t) {
    const e = new Error('SignNow is not connected. Set SIGNNOW_ACCESS_TOKEN, then seed the templates.');
    e.code = 'SIGNNOW_NOT_CONFIGURED';
    throw e;
  }
  return t;
}

function isConfigured() { return !!process.env.SIGNNOW_ACCESS_TOKEN; }

async function call(path, { method = 'GET', body, headers } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    const e = new Error(`SignNow ${method} ${path} failed: ${res.status} ${(json && (json.error || json.errors && JSON.stringify(json.errors))) || text.slice(0, 200)}`);
    e.status = res.status;
    throw e;
  }
  return json;
}

// Make a fresh signable document from a stored template. `prefill` is an array
// of { field_name, prefilled_text } for the template's text fields.
async function createFromTemplate(templateId, { documentName, prefill } = {}) {
  const copy = await call(`/template/${templateId}/copy`, {
    method: 'POST',
    body: { document_name: documentName || 'TMI Document' },
  });
  const documentId = copy.id;
  if (documentId && Array.isArray(prefill) && prefill.length) {
    await call(`/document/${documentId}`, {
      method: 'PUT',
      body: { fields: prefill.map(f => ({ field_name: f.field_name, prefilled_text: String(f.prefilled_text ?? '') })) },
    }).catch(() => { /* prefill is best-effort; signer can still complete */ });
  }
  return { documentId };
}

// Send a signing invite. `signers` is [{ email, role, order }]. `from` is the
// TMI sender email. Reminders are enabled so follow-up nudges are automatic
// once the invite has gone (still only after Mia's Approve & Send).
async function sendInvite(documentId, { signers, from, subject, message, remindAfterDays = 3 } = {}) {
  const to = (signers || []).map((s, i) => ({
    email: s.email,
    role: s.role || 'Signer',
    order: s.order || i + 1,
    reminder: remindAfterDays,
    subject: subject || 'Please sign: TMI document',
    message: message || 'Your document from TMI is ready for signature.',
  }));
  return call(`/document/${documentId}/invite`, {
    method: 'POST',
    body: { to, from, subject: subject || 'Please sign: TMI document', message: message || 'Your document from TMI is ready for signature.' },
  });
}

// Current status of a document (field_invites carry each signer's status).
async function getStatus(documentId) {
  const doc = await call(`/document/${documentId}`);
  const invites = doc.field_invites || [];
  return {
    documentId,
    invites: invites.map(iv => ({ email: iv.email, status: iv.status, updated: iv.updated })),
    signed: invites.length > 0 && invites.every(iv => iv.status === 'fulfilled'),
  };
}

async function remind(documentId, inviteId) {
  return call(`/document/${documentId}/invite/${inviteId}/reminder`, { method: 'POST', body: {} });
}

module.exports = { isConfigured, createFromTemplate, sendInvite, getStatus, remind };
