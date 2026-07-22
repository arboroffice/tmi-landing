// TMI OS - the company brain endpoint. Lets the app search everything the OS
// knows about a business and lets the owner ask their own company a question and
// get an answer grounded only in that company's knowledge, contacts, worker
// outputs, and messages. Scoped to the caller's tenant_id.
//
// POST { action: 'search', query }     -> { results: [{id,kind,title,snippet,score}] }
// POST { action: 'ask',    question }  -> { answer, sources: [{kind,title}] }

const { requireTenant, cors } = require('./_tenant-auth');
const { search, ask } = require('./_osbrain');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;

  const tid = t.tenant_id;
  const b = req.body || {};
  const action = String(b.action || '').trim();

  try {
    if (action === 'search') {
      const query = String(b.query || '').trim().slice(0, 500);
      const results = await search(tid, query);
      return res.status(200).json({ results });
    }

    if (action === 'ask') {
      const question = String(b.question || '').trim().slice(0, 2000);
      if (!question) return res.status(400).json({ error: 'Ask a question' });
      const out = await ask(tid, question);
      return res.status(200).json(out);
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-brain:', e.message);
    return res.status(500).json({ error: 'The brain could not answer right now. Try again in a moment.' });
  }
};

module.exports.config = { maxDuration: 45 };
