/**
 * Deep research batch: Nova vs premium + OSS AI coding/apps products.
 * Appends unique stems to discover-batch.jsonl (and optionally catalog).
 *
 * Env: APPLY=1 also appends straight into honest catalog.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { appendStems } from './lib/honestCatalog.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'data', 'discover-batch.jsonl');

const peers = [
  // Premium
  'Cursor', 'ChatGPT', 'ChatGPT Codex', 'Claude', 'Claude Code', 'Grok',
  'Gemini', 'Gemini Code Assist', 'GitHub Copilot', 'Copilot Workspace',
  'Devin', 'v0', 'Bolt', 'Lovable', 'Replit Agent', 'Windsurf',
  'OpenAI o-series', 'Anthropic Projects', 'Google AI Studio',
  // OSS / indie
  'Cline', 'Continue', 'Aider', 'OpenCode', 'Open Interpreter',
  'Void', 'Zed AI', 'Cody', 'Tabnine', 'Amazon Q', 'Sourcegraph Amp',
];

const dims = [
  // Conversation / plan / debug
  'chat stays on topic', 'clarify before build', 'plan visibility',
  'debug from error log', 'ask before destructive', 'stop when done',
  'multi-turn memory', 'refuse silent invent pivot',
  // Build / fidelity
  'brief fidelity', 'anti template twin', 'no silent genre swap',
  'simple prompt → correct product', 'Live evidence gate', 'edit keeps intent',
  // Agent / coding
  'multi-file agent loop', 'terminal/tool use', 'repo-wide refactor',
  'test then fix', 'apply patch confidence', 'diff review UX',
  'context from whole project', 'rules/skills follow', 'model seat swap',
  // Craft / product
  'image/craft when asked', 'coding non-website', 'composer UX clarity',
  'settings/homes opt-in', 'voice input quality', 'project binder clarity',
];

const gaps = ['Nova missing', 'Nova weaker', 'Nova partial', 'peer stronger UX'];

const rows = [];
for (const p of peers) {
  for (const d of dims) {
    for (const g of gaps) {
      rows.push({
        stem: `Peer ${p} ${d} (${g})`,
        peerNote: p,
        howTheyDoIt: `${d} — learn from ${p}`,
        leader: p,
      });
    }
  }
}

// Top-of-app product surfaces Nova must match.
const surfaces = [
  'Chat', 'Plan mode', 'Create/build', 'Edit', 'Debug Clinic', 'Live preview',
  'Code overlay', 'Models hub', 'Local AI', 'Agents home', 'Automations home',
  'Integrations home', 'Settings', 'Voice', 'Projects binder',
];
const surfaceBars = [
  'empty state explains next step', 'primary action obvious',
  'error recovery path', 'peer-parity feature checklist',
  'does not hijack unrelated turns',
];
for (const s of surfaces) {
  for (const b of surfaceBars) {
    rows.push({
      stem: `Surface ${s} ${b}`,
      peerNote: 'Nova app surface',
      howTheyDoIt: b,
      leader: 'Nova product',
    });
  }
}

fs.writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(JSON.stringify({ wrote: rows.length, path: out, peers: peers.length, dims: dims.length }, null, 2));

if (process.env.APPLY === '1') {
  const meta = appendStems(rows);
  console.log(JSON.stringify({ applied: meta }, null, 2));
}
