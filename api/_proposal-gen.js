// Shared build-proposal generation. Used by:
//   - api/audit-proposal.js  (admin clicks Generate -> send: true, emails client)
//   - api/meeting-process.js (PRD generated -> send: false, saves a draft)
//
// Grounds the three priced paths in the paid audit AND the latest PRD from the
// strategy call. Upserts one proposal per audit (audit_id) so re-running updates
// the same doc instead of piling up duplicates.

const dbx = require('./_db');

const SITE = 'https://www.tmitechai.com';

async function latestPrdFor(auditId) {
  try {
    const mtgs = await dbx.list('sales_meetings', { where: [['audit_id', '==', auditId]], order: 'created_at', ascending: false, limit: 5 });
    const withPrd = (mtgs || []).find(m => m.prd);
    return withPrd ? withPrd.prd : null;
  } catch (e) { return null; }
}

async function findProposalFor(auditId) {
  try {
    const rows = await dbx.list('proposals', { where: [['audit_id', '==', auditId]], order: 'created_at', ascending: false, limit: 5 });
    return (rows || [])[0] || null;
  } catch (e) { return null; }
}

// opts: { submissionId, notes?, prd?, send? }
async function generateProposal(opts) {
  const { submissionId, notes = '', send = false } = opts || {};
  const sub = await dbx.getById('audit_submissions', submissionId);
  if (!sub) throw new Error('audit submission not found');
  if (!sub.deliverable) throw new Error('audit deliverable not ready yet');

  const company = sub.company || (sub.answers && sub.answers.company) || '';
  const prd = opts.prd || await latestPrdFor(submissionId);

  const { buildBuildProposal } = await import('../agents/gtm/build-proposal.js');
  const build = await buildBuildProposal({
    company, industry: sub.industry, auditMd: sub.deliverable, score: sub.score, notes, prd,
  });

  const rec = (build.paths || []).find(p => p.key === build.recommended) || (build.paths || [])[2] || {};

  const existing = await findProposalFor(submissionId);
  const fields = {
    kind: 'build',
    title: `Build proposal — ${company || 'TMI client'}`,
    company: company || null,
    client_email: sub.email || null,
    audit_id: sub.id,
    total: rec.price || null,
    deposit: rec.deposit || null,
    build,
    grounded_in_prd: !!prd,
  };

  let proposal;
  if (existing && existing.status !== 'accepted') {
    // Don't downgrade a sent proposal back to draft; only bump to sent on send.
    fields.status = send ? 'sent' : (existing.status || 'draft');
    if (send) fields.sent_at = new Date().toISOString();
    proposal = await dbx.update('proposals', existing.id, fields);
  } else if (!existing) {
    fields.status = send ? 'sent' : 'draft';
    fields.created_at = new Date().toISOString();
    if (send) fields.sent_at = fields.created_at;
    proposal = await dbx.insert('proposals', fields);
  } else {
    // Already accepted - leave it.
    proposal = existing;
  }

  const link = `${SITE}/build-proposal?id=${proposal.id}`;

  if (send && proposal.status === 'sent') {
    try {
      if (process.env.RESEND_API_KEY && sub.email) {
        const { Resend } = require('resend');
        await new Resend(process.env.RESEND_API_KEY).emails.send({
          from: 'TMI <support@tmitechai.com>',
          to: sub.email,
          subject: `Your build proposal — ${company || 'TMI'}`,
          html: `<!DOCTYPE html><html><body style="background:#0a0b14;font-family:Arial,sans-serif;color:#fff;margin:0;">
<div style="max-width:560px;margin:0 auto;padding:40px 24px;">
<p style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:#E4FF97;margin:0 0 16px;">Your build proposal</p>
<h1 style="font-weight:400;font-size:26px;margin:0 0 14px;">Three ways to build it.</h1>
<p style="color:rgba(255,255,255,0.66);line-height:1.65;margin:0 0 24px;">Following your Complete Audit and our call, here is exactly what TMI would build for ${company || 'your company'} and the three ways to get there: do it yourself, do it with us, or have us build and install it for you.</p>
<p style="margin:0 0 8px;"><a href="${link}" style="background:#E4FF97;color:#0a0b14;font-weight:700;padding:14px 28px;border-radius:999px;text-decoration:none;display:inline-block;">View your proposal</a></p>
<p style="color:rgba(255,255,255,0.4);font-size:12px;margin:34px 0 0;border-top:1px solid rgba(255,255,255,0.12);padding-top:16px;">TMI Technology</p>
</div></body></html>`,
        });
      }
    } catch (e) { console.error('proposal email:', e.message); }

    // Nudge if they don't accept (stops once accepted). Two gentle touches.
    try {
      if (process.env.QSTASH_TOKEN) {
        const { Client } = require('@upstash/qstash');
        const qs = new Client({ token: process.env.QSTASH_TOKEN });
        const nurl = `${SITE}/api/funnel-nurture`;
        const base = { stage: 'proposal_no_accept', proposalId: proposal.id };
        await qs.publishJSON({ url: nurl, delay: 172800, body: base });   // +2d
        await qs.publishJSON({ url: nurl, delay: 518400, body: base });   // +6d
      }
    } catch (e) { console.error('schedule proposal_no_accept:', e.message); }
  }

  return { id: proposal.id, link, build, status: proposal.status };
}

module.exports = { generateProposal };
