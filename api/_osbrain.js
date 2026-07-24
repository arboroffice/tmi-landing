// TMI OS - the company brain. This is the layer that makes everything the OS
// knows about a business searchable and answerable: its saved knowledge (SOPs,
// policies, pricing, notes), its customers and contacts, the messages that have
// come through, and everything its AI workers have produced. It grounds workers
// with the right facts and lets the owner ask their own company anything and get
// an answer built only from what the company actually knows.
//
// No external vector database and no new dependencies: retrieval is lightweight
// token-overlap relevance scoring in plain JS. Collect candidates from a handful
// of collections, tokenize the query and each item, score by shared words with
// the title weighted higher, and return the best matches. For "ask", the top
// matches become a grounded context that Claude answers from and cites.
//
// Collections read (all scoped to one tenant, single-filter queries only, so no
// composite index is ever required):
//   os_knowledge { tenant_id, title, body, kind, created_at }
//   os_contacts  { tenant_id, name, company, notes, created_at }
//   os_outputs   { tenant_id, title, body, created_at }
//   os_messages  { tenant_id, body, created_at }
//   os_records   { tenant_id, type, title, status, amount, customer_name, ... }

const db = require('./_db');
const { isOverdue } = require('./_osrecords');

const CAPS = { knowledge: 300, contacts: 500, outputs: 200, messages: 200, metrics: 200, records: 800 };

// Common words that carry no signal for overlap scoring. Kept small on purpose.
const STOP = new Set([
  'the', 'and', 'for', 'are', 'was', 'were', 'you', 'your', 'our', 'their',
  'with', 'from', 'this', 'that', 'these', 'those', 'have', 'has', 'had',
  'not', 'but', 'all', 'any', 'can', 'will', 'would', 'should', 'could',
  'what', 'when', 'where', 'which', 'who', 'why', 'how', 'get', 'got',
  'about', 'into', 'out', 'over', 'than', 'then', 'them', 'they', 'she',
  'him', 'her', 'his', 'its', 'ours', 'yours', 'been', 'being', 'does',
  'did', 'done', 'each', 'more', 'most', 'some', 'such', 'only', 'own',
  'same', 'other', 'because', 'while', 'here', 'there', 'also', 'just',
  'like', 'much', 'many', 'very', 'per',
]);

function clip(v, max) {
  if (v == null) return '';
  const s = String(v).trim();
  return max ? s.slice(0, max) : s;
}

// Lowercased word tokens, minus stopwords and tokens under 3 chars.
function tokenize(s) {
  if (!s) return [];
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(w => w.length >= 3 && !STOP.has(w));
}

// Gather candidate items from every source the brain knows about. Each source is
// capped and each query pushes a single tenant filter to Firestore.
async function collect(tenantId) {
  const w = [['tenant_id', '==', tenantId]];
  const [knowledge, contacts, outputs, messages, metrics, records] = await Promise.all([
    db.list('os_knowledge', { where: w, limit: CAPS.knowledge }).catch(() => []),
    db.list('os_contacts', { where: w, limit: CAPS.contacts }).catch(() => []),
    db.list('os_outputs', { where: w, order: 'created_at', ascending: false, limit: CAPS.outputs }).catch(() => []),
    db.list('os_messages', { where: w, order: 'created_at', ascending: false, limit: CAPS.messages }).catch(() => []),
    db.list('os_metrics', { where: w, limit: CAPS.metrics }).catch(() => []),
    db.list('os_records', { where: w, limit: CAPS.records }).catch(() => []),
  ]);

  const items = [];

  // Real company records - the customers, invoices, jobs, payments the OS holds.
  // Each becomes a searchable, quotable item so the brain can answer "is Acme
  // paid up" or "which jobs are open" from actual records, not just metrics.
  const now = Date.now();
  for (const r of records) {
    const who = clip(r.customer_name, 160);
    const money = typeof r.amount === 'number' ? `$${r.amount}` : '';
    const st = clip(r.status, 40);
    const title = clip(r.title, 200) || (who ? `${r.type} - ${who}` : String(r.type || 'Record'));
    const bits = [
      `${r.type || 'record'}${who ? ' for ' + who : ''}`,
      money ? `amount ${money}` : '',
      st ? `status ${st}` : '',
      isOverdue(r, now) ? 'OVERDUE' : '',
      r.due_at ? `due ${String(r.due_at).slice(0, 10)}` : '',
    ].filter(Boolean);
    const extra = r.fields && typeof r.fields === 'object'
      ? Object.entries(r.fields).slice(0, 8).map(([k, v]) => `${k}: ${clip(v, 200)}`).join(', ') : '';
    items.push({
      id: r.id,
      kind: 'record',
      title,
      text: `${bits.join(', ')}${extra ? '. ' + extra : ''}`,
      created_at: r.updated_at || r.created_at || null,
    });
  }

  // Live numbers are part of what the company knows, so the brain can answer
  // questions about revenue, cash, AR, etc. from the actual metric values.
  for (const m of metrics) {
    const label = clip(m.label, 160);
    if (!label) continue;
    const val = m.value != null && m.value !== '' ? `${m.value}${m.unit ? ' ' + clip(m.unit, 40) : ''}` : 'not connected yet';
    items.push({
      id: m.id,
      kind: 'metric',
      title: label,
      text: `${label}: ${val}.${m.hint ? ' ' + clip(m.hint, 300) : ''}`,
      created_at: m.updated_at || m.created_at || null,
    });
  }

  for (const k of knowledge) {
    items.push({
      id: k.id,
      kind: 'knowledge',
      title: clip(k.title, 200) || (k.kind ? String(k.kind) : 'Knowledge'),
      text: clip(k.body, 6000),
      created_at: k.created_at || null,
    });
  }

  for (const c of contacts) {
    const title = clip(c.name, 160) || clip(c.company, 160) || 'Contact';
    const parts = [clip(c.name, 160), clip(c.company, 160), clip(c.notes, 4000)].filter(Boolean);
    items.push({
      id: c.id,
      kind: 'contact',
      title,
      text: parts.join(' - '),
      created_at: c.created_at || null,
    });
  }

  for (const o of outputs) {
    items.push({
      id: o.id,
      kind: 'output',
      title: clip(o.title, 200) || clip(o.worker_name, 160) || 'Worker output',
      text: clip(o.body, 6000),
      created_at: o.created_at || null,
    });
  }

  for (const m of messages) {
    const body = clip(m.body, 4000);
    if (!body) continue;
    items.push({
      id: m.id,
      kind: 'message',
      title: clip(m.author, 120) ? `Message from ${clip(m.author, 120)}` : 'Message',
      text: body,
      created_at: m.created_at || null,
    });
  }

  return items;
}

// Relevance of one item to the query tokens by token overlap. Title matches count
// for more than body matches. Normalized by query size so scores are comparable
// across queries and never runs away with a long document.
function score(queryTokens, item) {
  if (!queryTokens || !queryTokens.length) return 0;
  const q = new Set(queryTokens);
  const titleSet = new Set(tokenize(item.title));
  const textSet = new Set(tokenize(item.text));

  let titleHits = 0;
  let textHits = 0;
  for (const t of q) {
    if (titleSet.has(t)) titleHits++;
    else if (textSet.has(t)) textHits++;
  }
  if (!titleHits && !textHits) return 0;

  const raw = titleHits * 3 + textHits;
  const max = q.size * 3; // all query tokens hitting the title
  return raw / max;
}

// A short snippet from the text, centered on the first matching token when there
// is one, otherwise the start of the text.
function snippet(text, queryTokens, len = 200) {
  const s = clip(text);
  if (!s) return '';
  if (s.length <= len) return s;

  let at = -1;
  const lower = s.toLowerCase();
  for (const t of (queryTokens || [])) {
    const i = lower.indexOf(t);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return s.slice(0, len).trim() + '...';

  const start = Math.max(0, at - Math.floor(len / 3));
  let out = s.slice(start, start + len).trim();
  if (start > 0) out = '...' + out;
  if (start + len < s.length) out = out + '...';
  return out;
}

// Search the whole brain and return the top-N matches. An empty query returns the
// most recent items instead of scoring.
async function search(tenantId, query, opts = {}) {
  const limit = Math.max(1, Math.min(25, opts.limit || 8));
  const items = await collect(tenantId);
  const q = clip(query, 500);
  const qTokens = tokenize(q);

  if (!qTokens.length) {
    return items
      .slice()
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      .slice(0, limit)
      .map(it => ({ id: it.id, kind: it.kind, title: it.title, snippet: snippet(it.text, [], 200), score: 0 }));
  }

  return items
    .map(it => ({ it, s: score(qTokens, it) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ it, s }) => ({
      id: it.id,
      kind: it.kind,
      title: it.title,
      snippet: snippet(it.text, qTokens, 200),
      score: Math.round(s * 1000) / 1000,
    }));
}

const ASK_SYSTEM = `You are the company brain inside TMI OS. You answer the owner's question using ONLY the company context provided below, which is drawn from their own saved knowledge, contacts, worker outputs, and messages.

Rules:
- Use only what is in the context. Never invent facts, names, numbers, or history that are not there.
- If the context does not contain the answer, say plainly that the brain does not have that yet and name what to add or connect.
- Answer plainly and directly, the way a sharp operator briefs an owner. No hype, no filler, no emojis, no em dashes.
- Cite which items you used by referring to their titles in a short "Based on:" line at the end when you used the context.`;

// Answer a question grounded strictly in the tenant's own brain. Returns the
// answer plus the sources that fed it.
async function ask(tenantId, question) {
  const q = clip(question, 2000);
  const items = await collect(tenantId);
  const qTokens = tokenize(q);

  // Score by overlap. If nothing overlaps (a near-miss in wording), fall back to
  // the most recent knowledge plus all metrics so the brain grounds on what it
  // holds and can attempt an answer, rather than always denying.
  const scored = items.map(it => ({ it, s: score(qTokens, it) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  let top;
  if (scored.length) {
    top = scored.slice(0, 7).map(x => x.it);
  } else {
    top = items
      .filter(it => it.kind === 'knowledge' || it.kind === 'metric')
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      .slice(0, 7);
  }

  const sources = top.map(it => ({ kind: it.kind, title: it.title }));

  if (!top.length) {
    return {
      answer: 'The brain does not have anything yet. Add some company knowledge, connect your data, or let the workers run so there is something to answer from.',
      sources: [],
    };
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });

  // Feed the FULL body of each top item (not a 200-char snippet), so a real
  // policy, SOP, or pricing sheet is answered from the whole document.
  const context = top.map((it, i) => `[${i + 1}] (${it.kind}) ${it.title}\n${clip(it.text, 1600)}`).join('\n\n');

  const msg = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1500,
    system: ASK_SYSTEM,
    messages: [{
      role: 'user',
      content: `Question: ${q}\n\n--- COMPANY CONTEXT ---\n${context}`,
    }],
  });

  const answer = (msg.content || []).map(b => b.text || '').join('').trim();
  return { answer, sources };
}

module.exports = { collect, tokenize, score, search, ask };
