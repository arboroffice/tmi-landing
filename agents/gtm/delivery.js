// Delivery / Build Agent — TMI's actual product engine.
//
// For each active client in delivery, this drafts the core build deliverables
// that make up the Intelligent Company OS: a set of SOPs for their key
// workflows, an operating-system build plan (phases + systems to configure),
// and a documentation outline. Each artifact is stored as a `deliverables` row
// in draft status, and the client's project is advanced to reflect that the
// deliverables have been drafted.
//
//   import { runDelivery } from './delivery.js';
//   const stats = await runDelivery({ limit: 5 });
//
// CLI:  node agents/gtm/delivery.js [limit]
//
// Guardrails: every path degrades gracefully. Missing ANTHROPIC_API_KEY,
// missing Firebase credentials, or absent data results in a no-op that returns
// a stats object. Nothing here throws.

import { fileURLToPath } from 'url';
import path from 'path';
import * as db from './tools/db.js';
import { sendDigest } from './tools/email.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// Client statuses that mean "we are building their OS right now".
const DELIVERY_STATUSES = ['building', 'client', 'in_delivery'];

// The three artifact types this agent drafts per client.
const DELIVERABLE_TYPES = ['sop', 'build_plan', 'docs'];

function hasFirebase() {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT;
}
function hasAnthropic() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Pull whatever context exists for a client: their project, a blueprint/audit
// row, and any audit stored on the client record itself. Degrades to {} parts.
async function gatherContext(client) {
  const ctx = { client, project: null, blueprint: null, audit: client.audit || null };

  try {
    ctx.project = await db.findOne('projects', 'client_id', client.id);
  } catch { /* no projects collection / no match */ }

  try {
    ctx.blueprint = await db.findOne('blueprints', 'client_id', client.id);
  } catch { /* no blueprints collection */ }

  // A blueprint or audit may also be referenced by id on the client.
  if (!ctx.blueprint && client.blueprint_id) {
    try { ctx.blueprint = await db.getById('blueprints', client.blueprint_id); } catch { /* ignore */ }
  }
  if (!ctx.audit && client.audit_id) {
    try { ctx.audit = await db.getById('audit_briefs', client.audit_id); } catch { /* ignore */ }
  }

  return ctx;
}

function contextSummary({ client, project, blueprint, audit }) {
  const a = audit || {};
  const b = blueprint || {};
  const scoped = b.body || b.summary || a.summary || (project && project.description) || '';
  return `
COMPANY: ${client.company || client.name || 'this client'}
INDUSTRY: ${client.industry || client.niche || 'operations-heavy business'}
CURRENT PROJECT: ${project ? (project.name || 'OS build') + ' (status: ' + (project.status || 'n/a') + ')' : 'none on record'}
PRIMARY BOTTLENECK: ${a.primaryPain || a.summary || (b.primaryPain) || 'manual, disconnected operations'}
KEY WORKFLOWS: ${(a.workflows || b.workflows || ['intake', 'dispatch', 'invoicing']).join(', ')}
DETECTED TOOLS: ${(a.techStack || b.techStack || []).join(', ') || 'unknown'}
WHAT WAS SCOPED: ${scoped ? scoped.slice(0, 1200) : 'not captured; infer from industry and standard field operations'}
`.trim();
}

// Ask Sonnet for one structured artifact. Returns { title, body } or null.
async function generateArtifact(type, ctxText, company) {
  const specs = {
    sop: {
      title: `Standard operating procedures — ${company}`,
      system: `You are TMI's solutions architect writing the standard operating procedures that the client's Intelligent Company OS will enforce. Write SOPs for the key workflows (dispatch, intake, invoicing, and any others relevant to their operation). Each SOP is concrete: the trigger, the steps in order, who owns it, what the system captures, and the handoff. Operator voice. Specific. No hype. No em dashes. No emojis. Return clean markdown.`,
      prompt: `Write the SOP set for this client.\n\n${ctxText}\n\nUse one "## " section per workflow. For each, cover: when it starts, the ordered steps, the owner, what the system records at each step, and how it closes out. Keep it grounded in their real operation.`,
    },
    build_plan: {
      title: `Operating-system build plan — ${company}`,
      system: `You are TMI's solutions architect writing the build plan for the client's Intelligent Company OS. TMI runs a Delete / Connect / Build transformation: cut software they do not use, connect what is left, build the backend the company runs on, with digital employees and a command center they run from their phone. Lay out the phases and the specific systems to configure. Operator voice. Specific to their niche and tools. No hype. No em dashes. No emojis. Return clean markdown.`,
      prompt: `Write the build plan for this client.\n\n${ctxText}\n\nUse these sections:\n## Phase 1 - Delete\n## Phase 2 - Connect\n## Phase 3 - Build\n## Systems to configure\n## Command center\n\nName the real tools, the integrations, the systems for their niche, and the digital employees that replace the manual work.`,
    },
    docs: {
      title: `Documentation outline — ${company}`,
      system: `You are TMI's solutions architect outlining the documentation that ships with the client's Intelligent Company OS so their team can run it without us. Cover operator guides, admin setup, troubleshooting, and onboarding for new hires. Operator voice. Specific. No hype. No em dashes. No emojis. Return clean markdown as a structured outline.`,
      prompt: `Write the documentation outline for this client.\n\n${ctxText}\n\nUse "## " for each document and bullet the sections inside it. Cover operator guides, admin and configuration, troubleshooting, and new-hire onboarding.`,
    },
  };

  const spec = specs[type];
  if (!spec) return null;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      system: spec.system,
      messages: [{ role: 'user', content: spec.prompt }],
    });
    const body = msg && msg.content && msg.content[0] && msg.content[0].text;
    if (!body) return null;
    return { title: spec.title, body: body.trim() };
  } catch (e) {
    console.warn(`delivery: generate ${type} failed:`, e.message);
    return null;
  }
}

// Advance (or create) the client's project to reflect drafted deliverables.
async function advanceProject(client, project, drafted) {
  const milestone = `Deliverables drafted (${drafted.join(', ')})`;
  try {
    if (project) {
      const milestones = Array.isArray(project.milestones) ? project.milestones.slice() : [];
      milestones.push({ name: milestone, at: new Date().toISOString() });
      await db.update('projects', project.id, {
        status: 'in_build',
        milestones,
        updated_at: new Date().toISOString(),
      });
    } else {
      await db.insert('projects', {
        client_id: client.id,
        name: `${client.company || client.name || 'Client'} - Intelligent Company OS`,
        status: 'in_build',
        milestones: [{ name: milestone, at: new Date().toISOString() }],
      });
    }
  } catch (e) {
    console.warn('delivery: advanceProject failed:', e.message);
  }
}

export async function runDelivery({ limit = 5 } = {}) {
  const stats = { clients: 0, deliverables: 0, skipped: 0 };

  if (!hasFirebase()) {
    console.warn('delivery: FIREBASE_SERVICE_ACCOUNT not configured, no-op.');
    return stats;
  }
  if (!hasAnthropic()) {
    console.warn('delivery: ANTHROPIC_API_KEY not configured, no-op.');
    return stats;
  }

  // Pull active clients in delivery. Firestore "in" handles the status set.
  let clients = [];
  try {
    clients = await db.list('clients', {
      where: [['status', 'in', DELIVERY_STATUSES]],
      order: 'created_at',
      ascending: true,
      limit: Math.max(limit * 3, 15),
    });
  } catch (e) {
    console.warn('delivery: clients list failed:', e.message);
    return stats;
  }

  if (!clients.length) {
    console.log('delivery: no active clients in delivery.');
    return stats;
  }

  const drafted = []; // for the digest

  for (const client of clients) {
    if (stats.clients >= limit) break;

    // Skip clients that already have draft deliverables (needs deliverables only).
    let existing = 0;
    try {
      existing = await db.count('deliverables', [['client_id', '==', client.id]]);
    } catch { /* deliverables collection may not exist yet */ }
    if (existing > 0) { stats.skipped++; continue; }

    const ctx = await gatherContext(client);
    const ctxText = contextSummary(ctx);
    const company = client.company || client.name || 'this client';

    const madeThisClient = [];
    for (const type of DELIVERABLE_TYPES) {
      const artifact = await generateArtifact(type, ctxText, company);
      if (!artifact) { stats.skipped++; continue; }
      try {
        await db.insert('deliverables', {
          client_id: client.id,
          type,
          title: artifact.title,
          body: artifact.body,
          status: 'draft',
          created_at: new Date().toISOString(),
        });
        stats.deliverables++;
        madeThisClient.push(type);
      } catch (e) {
        console.warn(`delivery: insert ${type} for ${client.id} failed:`, e.message);
        stats.skipped++;
      }
    }

    if (madeThisClient.length) {
      stats.clients++;
      await advanceProject(client, ctx.project, madeThisClient);
      drafted.push({ company, types: madeThisClient });
    } else {
      stats.skipped++;
    }
  }

  try {
    await db.logRun({ kind: 'delivery', ...stats });
  } catch (e) {
    console.warn('delivery: logRun failed:', e.message);
  }

  // Internal digest of what was drafted.
  if (drafted.length) {
    const lines = drafted.map(d => `${d.company}: ${d.types.join(', ')}`).join('\n');
    const body = [
      `Delivery agent drafted build deliverables for ${stats.clients} client(s).`,
      '',
      lines,
      '',
      `Totals: ${stats.deliverables} deliverables, ${stats.skipped} skipped.`,
      'All artifacts are in draft and ready for review.',
    ].join('\n');
    try {
      await sendDigest({ subject: `Delivery: ${stats.deliverables} build deliverables drafted`, body });
    } catch (e) {
      console.warn('delivery: sendDigest failed:', e.message);
    }
  }

  console.log(`Delivery: ${stats.clients} clients, ${stats.deliverables} deliverables, ${stats.skipped} skipped.`);
  return stats;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const limit = parseInt(process.argv[2] || '5', 10);
  runDelivery({ limit })
    .then(s => { console.log(JSON.stringify(s)); process.exit(0); })
    .catch(e => { console.error('Fatal:', e); process.exit(1); });
}
