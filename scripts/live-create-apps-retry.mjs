/**
 * Apps-only uniqueness retry (TipWise + LeafNote) after tool/app-chrome spine fixes.
 *   $env:NOVA_CDP_PORT='9233'; npx tsx --tsconfig tsconfig.app.json scripts/live-create-apps-retry.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Reuse the main loop by rewriting CASES via env injection file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const loopPath = path.join(__dirname, 'live-create-uniq-loop.mjs');
let src = fs.readFileSync(loopPath, 'utf8');
src = src.replace(
  /const CASES = \[[\s\S]*?\];/,
  `const CASES = [
  {
    id: 'tipwise-app',
    kind: 'application',
    product: 'TipWise',
    ask: [
      'Build a complete tip calculator web app called TipWise.',
      'Utility tool UI — bill amount, tip percent, split people, live totals. Settings tab for dark mode.',
      'Clean professional software look, not a marketing homepage. Skip Plan. Ok start building on disk now.',
    ].join(' '),
  },
  {
    id: 'leafnote-app',
    kind: 'application',
    product: 'LeafNote',
    ask: [
      'Build a complete notes app called LeafNote with sidebar note list, editor, and a Settings panel',
      '(font size + theme). Sign-in screen with email + continue button (local state only, no backend).',
      'Real working tabs/panels. Professional software chrome — not a marketing homepage. Skip Plan. Ok start building on disk now.',
    ].join(' '),
  },
];`,
);
src = src.replace('const MAX_ROUNDS = Number(process.env.NOVA_UNIQ_ROUNDS || 4);', 'const MAX_ROUNDS = 2;');
src = src.replace("_create-uniq-loop-out.txt", "_create-apps-retry-out.txt");
src = src.replace("_create-uniq-loop-results.json", "_create-apps-retry-results.json");
const tmp = path.join(__dirname, '_tmp-apps-retry-run.mjs');
fs.writeFileSync(tmp, src);
await import(`file:///${tmp.replace(/\\\\/g, '/')}`);
void createRequire;
