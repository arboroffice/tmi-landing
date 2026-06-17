// Generate a build proposal from a paid Complete Audit (admin action), store it
// in `proposals`, and email the client a link to the build-proposal page.
// POST { submissionId, notes? }  (auth required)

const { cors, requireAuth } = require('./_auth');
const dbx = require('./_db');

const SITE = 'https://www.tmitechai.com';

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!requireAuth(req, res)) return;

  const { submissionId, notes } = req.body || {};
  if (!submissionId) return res.status(400).json({ error: 'submissionId required' });

  try {
    const sub = await dbx.getById('audit_submissions', submissionId);
    if (!sub) return res.status(404).json({ error: 'audit submission not found' });
    if (!sub.deliverable) return res.status(409).json({ error: 'audit deliverable not ready yet' });

    const company = sub.company || (sub.answers && sub.answers.company) || '';
    const { buildBuildProposal } = await import('../agents/gtm/build-proposal.js');
    const build = await buildBuildProposal({
      company,
      industry: sub.industry,
      auditMd: sub.deliverable,
      score: sub.score,
      notes: notes || '',
    });

    const rec = (build.paths || []).find(p => p.key === build.recommended) || (build.paths || [])[2] || {};

    const proposal = await dbx.insert('proposals', {
      kind: 'build',
      title: `Build proposal — ${company || 'TMI client'}`,
      status: 'sent',
      company: company || null,
      client_email: sub.email || null,
      audit_id: sub.id,
      total: rec.price || null,
      deposit: rec.deposit || null,
      build,
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    const link = `${SITE}/build-proposal?id=${proposal.id}`;

    // Email the client the proposal.
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
<p style="color:rgba(255,255,255,0.66);line-height:1.65;margin:0 0 24px;">Following your Complete Audit, here is exactly what TMI would build for ${company || 'your company'} and the three ways to get there: do it yourself, do it with us, or have us build and install it for you.</p>
<p style="margin:0 0 8px;"><a href="${link}" style="background:#E4FF97;color:#0a0b14;font-weight:700;padding:14px 28px;border-radius:999px;text-decoration:none;display:inline-block;">View your proposal</a></p>
<p style="color:rgba(255,255,255,0.4);font-size:12px;margin:34px 0 0;border-top:1px solid rgba(255,255,255,0.12);padding-top:16px;">TMI Technology</p>
</div></body></html>`,
        });
      }
    } catch (e) { console.error('proposal email:', e.message); }

    return res.json({ ok: true, id: proposal.id, link, build });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
