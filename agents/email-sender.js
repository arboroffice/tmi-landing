import * as db from './gtm/tools/db.js';
import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Load .env.local for local dev (GitHub Actions uses secrets)
if (!process.env.RESEND_API_KEY) {
  try {
    const envFile = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
    for (const line of envFile.split('\n')) {
      const m = line.match(/^([A-Z_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
      if (m) process.env[m[1]] = m[2];
    }
  } catch {}
}

function buildEmailHtml({ title, deck, category, readTime, articleUrl, photoUrl, unsubscribeUrl }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0a0b14;font-family:system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0b14;">
  <tr><td align="center" style="padding:32px 16px 0;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr><td style="padding:28px 0 20px;text-align:center;">
        <a href="https://tmi-technology.com/news.html" style="text-decoration:none;display:inline-flex;align-items:center;gap:10px;">
          <span style="font-size:20px;font-weight:700;color:#E4FF97;letter-spacing:0.04em;">TMI</span>
          <span style="font-size:10px;letter-spacing:0.24em;text-transform:uppercase;color:rgba(255,255,255,0.35);">Field Notes</span>
        </a>
      </td></tr>

      <!-- Cover photo -->
      <tr><td>
        <a href="${articleUrl}" style="display:block;">
          <img src="${photoUrl}" width="600" alt="" style="width:100%;max-width:600px;display:block;border-radius:8px 8px 0 0;"/>
        </a>
      </td></tr>

      <!-- Article content -->
      <tr><td style="background:#ffffff;padding:40px 48px 48px;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 14px;font-size:10px;letter-spacing:0.24em;text-transform:uppercase;color:#86868b;font-family:system-ui,sans-serif;">${category} &middot; ${readTime} min read</p>
        <h1 style="margin:0 0 18px;font-size:32px;font-weight:400;line-height:1.1;color:#1a1a1a;font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.01em;">${title}</h1>
        <p style="margin:0 0 32px;font-size:18px;line-height:1.65;color:#505060;font-family:Georgia,serif;">${deck}</p>
        <a href="${articleUrl}" style="display:inline-block;background:#E4FF97;color:#0a0b14;padding:14px 28px;border-radius:999px;font-weight:700;font-size:13px;letter-spacing:0.02em;text-decoration:none;font-family:system-ui,sans-serif;">Read the full article &rarr;</a>
      </td></tr>

      <!-- Divider -->
      <tr><td style="padding:0 0 4px;"></td></tr>

      <!-- Footer -->
      <tr><td style="padding:24px 0 40px;text-align:center;">
        <p style="margin:0 0 8px;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.22);font-family:system-ui,sans-serif;">
          TMI Technology &middot; Built for the companies that power the world
        </p>
        <a href="${unsubscribeUrl}" style="font-size:11px;color:rgba(255,255,255,0.3);font-family:system-ui,sans-serif;text-decoration:underline;">Unsubscribe</a>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

async function main() {
  console.log('TMI Email Sender - ' + new Date().toISOString());

  const resendKey = process.env.RESEND_API_KEY;

  if (!process.env.FIREBASE_SERVICE_ACCOUNT || !resendKey) {
    console.error('Missing env vars: FIREBASE_SERVICE_ACCOUNT, RESEND_API_KEY');
    process.exit(1);
  }

  // Read article info written by writer.js
  const titleFile = path.join(ROOT, '.last-title');
  const articleFile = path.join(ROOT, '.last-article');

  if (!fs.existsSync(titleFile) || !fs.existsSync(articleFile)) {
    console.error('Missing .last-title or .last-article — run writer.js first.');
    process.exit(1);
  }

  const title = fs.readFileSync(titleFile, 'utf8').trim();
  const filename = fs.readFileSync(articleFile, 'utf8').trim();
  console.log(`Article: "${title}" (${filename})`);

  // Parse article HTML for deck, category, photo
  const articlePath = path.join(ROOT, filename);
  if (!fs.existsSync(articlePath)) {
    console.error(`Article file not found: ${filename}`);
    process.exit(1);
  }

  const html = fs.readFileSync(articlePath, 'utf8');

  const deckMatch = html.match(/class="article-deck"[^>]*>\s*([^<]+)/);
  const deck = deckMatch ? deckMatch[1].trim() : title;

  const catMatch = html.match(/class="cat"[^>]*>\s*([^<]+)/);
  const category = catMatch ? catMatch[1].trim() : 'Operations';

  const photoMatch = html.match(/class="article-cover"[^>]*style="background-image:url\('([^']+)'\)/);
  const photoUrl = photoMatch
    ? photoMatch[1]
    : 'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=1400&q=80';

  const words = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const readTime = Math.max(4, Math.ceil(words / 200));

  const articleUrl = `https://tmi-technology.com/${filename}`;

  // Fetch subscribers (subscribed contacts with a valid email).
  let subscribers;
  try {
    subscribers = await db.getSubscribedContacts();
  } catch (err) {
    console.error('Failed to fetch contacts:', err.message);
    process.exit(1);
  }

  console.log(`Subscribers: ${subscribers.length}`);

  if (!subscribers.length) {
    console.log('No subscribers to email. Exiting.');
    return;
  }

  // Create campaign record
  const subject = `Field Notes: ${title}`;
  let campaign = null;
  try {
    campaign = await db.insertCampaign({
      subject,
      body: `${deck}\n\nRead the full article: ${articleUrl}`,
      from_name: 'TMI Field Notes',
      from_email: 'fieldnotes@tmi-technology.com',
      audience_type: 'all',
      status: 'sending',
    });
  } catch (err) {
    console.warn('Campaign record failed (continuing):', err.message);
  }

  const campaignId = campaign?.id;
  const resend = new Resend(resendKey);
  let sent = 0;
  let failed = 0;

  // Send in batches of 10 (Resend rate limit safety)
  const BATCH = 10;
  for (let i = 0; i < subscribers.length; i += BATCH) {
    const batch = subscribers.slice(i, i + BATCH);

    await Promise.all(batch.map(async (contact) => {
      const unsubscribeUrl = `https://tmi-technology.com/api/unsubscribe?id=${contact.id || encodeURIComponent(contact.email)}`;
      const emailHtml = buildEmailHtml({ title, deck, category, readTime, articleUrl, photoUrl, unsubscribeUrl });

      try {
        await resend.emails.send({
          from: 'TMI Field Notes <fieldnotes@tmi-technology.com>',
          to: contact.email,
          subject,
          html: emailHtml,
        });

        if (campaignId && contact.id) {
          await db.logEmailSend({
            campaign_id: campaignId,
            contact_id: contact.id,
            email: contact.email,
            status: 'sent',
          }).catch(() => {});
        }

        sent++;
      } catch (err) {
        console.warn(`  Failed → ${contact.email}: ${err.message}`);
        if (campaignId && contact.id) {
          await db.logEmailSend({
            campaign_id: campaignId,
            contact_id: contact.id,
            email: contact.email,
            status: 'failed',
          }).catch(() => {});
        }
        failed++;
      }
    }));

    if (i + BATCH < subscribers.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // Finalize campaign status
  if (campaignId) {
    await db.updateCampaign(campaignId, {
      status: sent === 0 ? 'failed' : 'sent',
      sent_count: sent,
      sent_at: new Date().toISOString(),
    });
  }

  console.log(`Done: ${sent} sent, ${failed} failed`);
}

main().catch(err => {
  console.error('Email sender failed:', err.message);
  process.exit(1);
});
