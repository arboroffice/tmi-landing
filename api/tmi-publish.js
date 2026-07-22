// Admin publish pipeline. Approving a content draft is no longer the end of the
// line: this turns an approved tmi_content item into a live Founders of the Future
// Letters article. Claude expands it into an AEO-optimized piece, the article
// template is assembled around it, a story card is inserted into news.html, and
// both files are committed straight to main, which triggers the live deploy.
// Fulfillment to proof to a published, live story, with no hand-editing. Admin only.
//
// POST { action, content_id }
//   'preview' -> { fields, filename, html }        generate, do not commit (for review)
//   'publish' -> { url, filename, content }         generate and push to the live site

const db = require('./_db');
const { requireAuth, cors } = require('./_auth');
const gh = require('./_ghcommit');
const A = require('./_tmiarticle');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!requireAuth(req, res)) return;

  const b = req.body || {};
  const action = String(b.action || 'publish');

  try {
    const item = await db.getById('tmi_content', String(b.content_id || ''));
    if (!item) return res.status(404).json({ error: 'Content not found' });

    if (item.published_url && action === 'publish') {
      return res.status(200).json({ url: item.published_url, filename: item.published_file || null, content: item, already: true });
    }

    const fields = await A.writeArticle(item);
    fields.photo_id = A.pickPhoto(fields.title);
    const filename = uniqueName(A.slugify(fields.title));
    const now = new Date();
    const html = A.buildArticleHTML(fields, filename, now);

    if (action === 'preview') {
      return res.status(200).json({ fields, filename, html });
    }

    if (action === 'publish') {
      if (!gh.configured()) return res.status(400).json({ error: 'Publishing to the live site needs GITHUB_TOKEN set in the environment.' });

      // Make the filename unique against what is actually in the repo.
      let name = filename, n = 2;
      while (await gh.getFile(name)) { name = filename.replace(/\.html$/, '') + '-' + n + '.html'; n++; if (n > 30) break; }

      const rebuilt = name === filename ? html : A.buildArticleHTML(fields, name, now);
      await gh.putFile(name, rebuilt, `Publish Founders of the Future Letters: ${fields.title}`);

      const news = await gh.getFile('news.html');
      if (!news) throw new Error('news.html not found in the repo');
      const card = A.newsCard(fields, name);
      const updated = A.insertCard(news.content, card);
      await gh.putFile('news.html', updated, `Add story card: ${fields.title}`, news.sha);

      const url = `https://tmi-technology.com/${name}`;
      const content = await db.update('tmi_content', item.id, {
        status: 'published', published_url: url, published_file: name, published_at: now.toISOString(), category: fields.category,
      });
      await db.insert('tmi_build_log', { kind: 'publish', summary: `Published: ${fields.title} (${url}).`, created_at: now.toISOString() }).catch(() => {});
      return res.status(200).json({ url, filename: name, content });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('tmi-publish:', e.message);
    return res.status(500).json({ error: e.message || 'Could not publish' });
  }
};

function uniqueName(slug) { return 'article-' + slug + '.html'; }
