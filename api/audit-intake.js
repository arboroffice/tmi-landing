// Intelligent Company Audit intake submission. Verifies the Stripe payment, stores the
// answers, generates + emails the detailed audit deliverable, and returns the
// booking link for the 30-minute strategy call.

const { cors } = require('./_auth');
const dbx = require('./_db');

const BOOKING = 'https://www.tmitechai.com/booking';

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { session_id, email, company, industry, answers, name, phone, website, research, diagnosis } = req.body || {};
  if (!answers || typeof answers !== 'object') return res.status(400).json({ error: 'answers required' });

  // The Intelligent Company Audit is free. Capture the email and proceed, no payment gate.
  // (A legacy Stripe session is still honored if one happens to be present.)
  let paidEmail = email;
  try {
    if (process.env.STRIPE_SECRET_KEY && session_id) {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const s = await stripe.checkout.sessions.retrieve(session_id);
      paidEmail = paidEmail || (s.customer_details && s.customer_details.email) || s.customer_email;
    }
  } catch (e) { console.error('intake verify:', e.message); }
  if (!paidEmail) return res.status(400).json({ error: 'email required' });

  // Upsert the lead into `applications` so it (a) lands in the admin pipeline and
  // (b) the booking webhook (booking-confirmed.js) and the follow-up nurture
  // (funnel-nurture.js) can find it — both key off applications, not audit_submissions.
  let appId = null;
  try {
    if (paidEmail) {
      const emailNorm = String(paidEmail).toLowerCase();
      const existing = await dbx.findOne('applications', 'email', emailNorm);
      const fields = {
        name: name || (existing && existing.name) || null,
        phone: phone || answers.phone || (existing && existing.phone) || null,
        company: company || answers.company || (existing && existing.company) || null,
        website: website || answers.website || (existing && existing.website) || null,
        industry: industry || answers.industry || (existing && existing.industry) || null,
        source: (existing && existing.source) || 'intelligent-company-audit',
        intake_at: new Date().toISOString(),
      };
      // Never downgrade someone who already booked the call.
      if (!existing || existing.status !== 'booked') fields.status = 'audit_submitted';
      if (existing) { await dbx.update('applications', existing.id, fields); appId = existing.id; }
      else { const created = await dbx.insert('applications', Object.assign({ email: emailNorm }, fields)); appId = created.id; }
    }
  } catch (e) { console.error('intake upsert application:', e.message); }

  const bookingLink = session_id ? `${BOOKING}?session_id=${encodeURIComponent(session_id)}` : BOOKING;

  try {
    const sub = await dbx.insert('audit_submissions', {
      email: paidEmail || null,
      name: name || null,
      phone: phone || answers.phone || null,
      company: company || answers.company || null,
      industry: industry || answers.industry || null,
      application_id: appId,
      answers,
      research: research || null,
      diagnosis: diagnosis || null,
      paid: true,
      session_id: session_id || null,
      status: 'submitted',
      created_at: new Date().toISOString(),
    });

    // Generate + email the deliverable in the background (it takes ~30-60s).
    (async () => {
      try {
        const { buildCompleteAudit } = await import('../agents/gtm/complete-audit.js');
        const enriched = research
          ? Object.assign({}, answers, {
              _public_research: research.summary || '',
              _detected_tools: (research.techStack || []).join(', '),
              _ops_signals: (research.opsSignals || []).join('; '),
              _role_signals: (research.signals || []).join(', '),
              _reviews: research.maps ? `${research.maps.rating || '?'} stars, ${research.maps.reviewCount || 0} Google reviews${research.maps.category ? ', ' + research.maps.category : ''}` : '',
              _review_themes: Array.isArray(research.reviewThemes) ? research.reviewThemes.join('; ') : '',
              _competitors: Array.isArray(research.competitors) ? research.competitors.map(c => c.name || c).join(', ') : '',
              _competitor_ads: Array.isArray(research.competitorAds) ? research.competitorAds.slice(0, 8).map(a => `${a.page || 'competitor'}: ${(a.text || a.headline || '').slice(0, 140)}`).join(' | ') : '',
              _firmographics: research.firmographics ? `industry=${research.firmographics.industry || '?'}, employees=${research.firmographics.employeeCount || '?'}, revenue=${research.firmographics.revenue || '?'}, founded=${research.firmographics.foundedYear || '?'}` : '',
              _service_area: (research.facts && research.facts.service_area_text) || '',
            })
          : answers;
        // Ground the deliverable in the diagnosis we already showed them.
        if (diagnosis && Array.isArray(diagnosis.issues) && diagnosis.issues.length) {
          enriched._diagnosed_issues = diagnosis.issues.map(it => `${it.title} (${it.lens}, ${it.severity}; cost: ${it.cost}; fix: ${it.fix} via ${it.offering} ${it.path})`).join('\n');
          if (diagnosis.headline) enriched._diagnosis_headline = diagnosis.headline;
        }
        const md = await buildCompleteAudit({
          company: company || answers.company,
          industry: industry || answers.industry,
          answers: enriched,
          research: research || null,
        });
        const { parseAuditMeta } = require('./_audit-report-render');
        const meta = parseAuditMeta(md);
        await dbx.update('audit_submissions', sub.id, {
          deliverable: md, status: 'delivered', delivered_at: new Date().toISOString(),
          score: meta.score, categories: meta.categories || [],
        });
        const reportUrl = `https://www.tmitechai.com/audit-report?id=${sub.id}`;

        // Nudge to book the strategy call if they don't (stops once booked). Two touches.
        try {
          if (process.env.QSTASH_TOKEN && paidEmail) {
            const { Client } = require('@upstash/qstash');
            const qs = new Client({ token: process.env.QSTASH_TOKEN });
            const nurl = `https://www.tmitechai.com/api/funnel-nurture?secret=${process.env.GTM_RUN_SECRET || ''}`;
            const base = { stage: 'delivered_no_booking', email: paidEmail, submissionId: sub.id, session_id: session_id || null };
            await qs.publishJSON({ url: nurl, delay: 86400, body: base });
            await qs.publishJSON({ url: nurl, delay: 259200, body: { ...base, touch: 'second' } });
          }
        } catch (e) { console.error('schedule delivered_no_booking:', e.message); }

        if (process.env.RESEND_API_KEY && paidEmail) {
          const { Resend } = require('resend');
          const cn = company || answers.company || 'your operation';
          await new Resend(process.env.RESEND_API_KEY).emails.send({
            from: 'TMI <support@tmitechai.com>',
            to: paidEmail,
            subject: `Your Intelligent Company Audit — ${company || answers.company || 'TMI'}`,
            html: `<!DOCTYPE html><html><body style="background:#0a0b14;font-family:Arial,sans-serif;color:#fff;margin:0;padding:0;">
<div style="max-width:560px;margin:0 auto;padding:40px 24px;">
<p style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:#E4FF97;margin:0 0 18px;">The Intelligent Company Audit</p>
<h1 style="font-weight:400;font-size:26px;margin:0 0 14px;">Your audit for ${cn} is ready.</h1>
<p style="color:rgba(255,255,255,0.66);line-height:1.65;margin:0 0 8px;">We mapped how your operation runs, where time and money leak, your Intelligence Score${meta.score != null ? ` (<strong style="color:#fff;">${meta.score}/100</strong>)` : ''}, and a 30-day plan to fix it.</p>
<p style="margin:26px 0;"><a href="${reportUrl}" style="background:#E4FF97;color:#0a0b14;font-weight:700;padding:14px 28px;border-radius:999px;text-decoration:none;display:inline-block;">View your audit</a></p>
<p style="color:rgba(255,255,255,0.66);line-height:1.65;margin:0 0 8px;">Next, book your 30-minute strategy call with the founder and a strategist. That is where we walk through this together and pick your path.</p>
<p style="margin:18px 0 0;"><a href="${bookingLink}" style="color:#E4FF97;">Book your strategy call &rarr;</a></p>
<p style="color:rgba(255,255,255,0.4);font-size:12px;margin:34px 0 0;border-top:1px solid rgba(255,255,255,0.12);padding-top:16px;">TMI Technology</p>
</div></body></html>`,
            text: `Your Intelligent Company Audit for ${cn} is ready: ${reportUrl}\n\nBook your 30-minute strategy call: ${bookingLink}\n\n---\n\n${md}`,
          });
        }
        // Notify the team (they prep + run the call).
        if (process.env.RESEND_API_KEY) {
          const { Resend } = require('resend');
          await new Resend(process.env.RESEND_API_KEY).emails.send({
            from: 'TMI <support@tmitechai.com>',
            to: process.env.GTM_DIGEST_EMAIL || 'support@tmitechai.com',
            subject: `New Intelligent Company Audit: ${company || answers.company} (${paidEmail})`,
            text: md,
          });
        }
      } catch (e) { console.error('deliverable gen:', e.message); }
    })();

    return res.json({ ok: true, id: sub.id, booking: bookingLink, report: `/audit-report?id=${sub.id}` });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
