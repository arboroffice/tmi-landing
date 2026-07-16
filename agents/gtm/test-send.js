// One-shot tester: runs the agent pipeline for a single test company and sends the
// cold email (with the personalized audit link + embedded card image) to a recipient.
// Defaults to mia@tmitechai.com. Runs research+audit live if keys are present, else
// falls back to sample data so it always produces a deliverable email.
//
//   node agents/gtm/test-send.js [recipient]
//   env: TEST_EMAIL, TEST_COMPANY, TEST_DOMAIN

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
if (!process.env.ANTHROPIC_API_KEY) {
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]+)"?\s*$/);
      if (m) process.env[m[1]] = m[2];
    }
  } catch {}
}

import { researchCompany } from './tools/research.js';
import { buildAuditData } from './audit-build.js';
import { SAMPLE, slugify } from './audit-site.js';
import * as db from './tools/db.js';
import { sendEmail } from './tools/email.js';

export async function runTest({ email, company, domain, industry } = {}) {
  const TARGET = email || process.env.TEST_EMAIL || 'mia@tmitechai.com';
  const COMPANY = company || process.env.TEST_COMPANY || 'Apex Steel Fabrication';
  const DOMAIN = domain || process.env.TEST_DOMAIN || '';
  console.log(`TMI GTM tester → ${TARGET} (company: ${COMPANY}${DOMAIN ? `, ${DOMAIN}` : ''})`);

  const lead = {
    id: 'test',
    company_name: COMPANY,
    website: DOMAIN ? `https://${DOMAIN}` : '',
    industry: industry || process.env.TEST_INDUSTRY || 'Fabrication',
    location: 'Houston, TX',
    owner_name: 'there',
    email: TARGET,
  };

  // Live research + audit if possible; otherwise sample data.
  let research = null;
  let auditData = null;
  try {
    research = await researchCompany({
      name: COMPANY, website: lead.website, industry: lead.industry, location: lead.location,
    });
    auditData = await buildAuditData({ lead, research });
    console.log(`Audit built live (score ${auditData.score}). Bottleneck: ${research?.primaryPain || 'n/a'}`);
  } catch (e) {
    console.warn(`Live research/audit unavailable (${e.message}); using sample data.`);
    auditData = { ...SAMPLE, companyName: COMPANY };
  }

  const slug = slugify(COMPANY);
  const auditUrl = `https://www.tmitechai.com/audit/${slug}`;
  const cardUrl = `https://www.tmitechai.com/api/audit-card?slug=${slug}&company=${encodeURIComponent(COMPANY)}&score=${auditData.score ?? ''}&industry=${encodeURIComponent(lead.industry)}`;

  // Store the audit so /audit/<slug> and the card endpoint resolve.
  try {
    await db.saveAudit(slug, {
      ...auditData, companyName: COMPANY, ownerFirstName: 'there', industry: lead.industry,
    });
    console.log(`Audit stored at ${auditUrl}`);
  } catch (e) {
    console.warn(`Could not store audit (${e.message}); link may 404 until stored.`);
  }

  const subject = `a quick look at ${COMPANY}`;
  const body = [
    `Hi there,`,
    `Spent some time looking at ${COMPANY}.`,
    `Built a quick operational intelligence review and mapped a few places where time and money may be getting lost. You can see it here:`,
    auditUrl,
    `Just thought you'd find it interesting.`,
    `Mia`,
    `TMI Tech AI`,
  ].join('\n');

  const id = await sendEmail({ to: TARGET, toName: 'Mia', subject, body, imageUrl: cardUrl, auditUrl });
  console.log(`✅ Test email sent to ${TARGET} (message id: ${id})`);
  console.log(`   Audit:  ${auditUrl}`);
  console.log(`   Card:   ${cardUrl}`);
  return { email: TARGET, company: COMPANY, auditUrl, cardUrl, messageId: id, score: auditData.score };
}

// CLI: node gtm/test-send.js [recipient]
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runTest({ email: process.argv[2] }).catch(e => { console.error('Tester failed:', e); process.exit(1); });
}
