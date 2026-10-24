/**
 * Wave-2+ deep research: finer peer gaps (plan/debug/build/composer)
 * that wave-1 did not already cover. APPLY=1 appends to catalog.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { appendStems, loadCatalogMap } from './lib/honestCatalog.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'data', 'discover-batch.jsonl');

const peers = [
  'Cursor', 'ChatGPT', 'Claude', 'Claude Code', 'Grok', 'Gemini',
  'GitHub Copilot', 'Devin', 'v0', 'Bolt', 'Windsurf', 'OpenCode',
  'Cline', 'Aider', 'Replit Agent', 'Amazon Q',
];

const dims = [
  // Plan / debug / build depth
  'plan todos checklist before code', 'inline error explain + fix',
  'breakpoint-style debug narrative', 'create progress with cancel',
  'partial apply with reject hunk', 'checkpoint restore after bad edit',
  'bound project never hijacked by web search', 'guest local create without account',
  'Ready means Live actually works', 'heal blank preview automatically',
  'multi-model ensemble with reviewer', 'cheap model for classify expensive for code',
  'skills/rules file respected every turn', 'mcp tool calling from chat',
  'browser CDP inspect Live DOM', 'screenshot to edit request',
  'drag drop file into chat context', 'mention @file in composer',
  'parallel agent workers for big refactors', 'merge conflict resolve assist',
  'commit message from diff', 'PR description from branch',
  'secrets never echoed in chat', 'destructive rm needs confirm',
  'long context project map summary', 'token budget visible during build',
];

const gaps = ['Nova missing', 'Nova weaker', 'peer stronger UX'];
const existing = loadCatalogMap();
const rows = [];
for (const p of peers) {
  for (const d of dims) {
    for (const g of gaps) {
      const stem = `Peer ${p} ${d} (${g})`;
      if (existing.has(stem.toLowerCase())) continue;
      rows.push({ stem, peerNote: p, howTheyDoIt: d, leader: p });
    }
  }
}

// Nova product spine checklist (top→bottom of app).
const spine = [
  'Onboarding first-run clarity', 'Chat composer send reliability',
  'Plan mode exit back to build', 'Create job never silent stall',
  'Edit surgical brand rename', 'Debug Clinic from Live console',
  'Models download + seat swap', 'Local AI GGUF path',
  'Agents home opt-in', 'Missing items catalog honesty',
];
for (const s of spine) {
  for (const bar of ['works end-to-end', 'empty state OK', 'error recoverable', 'peer parity']) {
    rows.push({
      stem: `Spine ${s} ${bar}`,
      peerNote: 'Nova spine',
      howTheyDoIt: bar,
      leader: 'Nova',
    });
  }
}

fs.writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(JSON.stringify({ wrote: rows.length, path: out }, null, 2));
if (process.env.APPLY === '1') {
  console.log(JSON.stringify({ applied: appendStems(rows) }, null, 2));
}
