/**
 * Nova-only live invent: travel luggage shop with 12 unique bags.
 * Cursor only drives CDP — Nova creates the project.
 *
 *   npx tsx --tsconfig tsconfig.app.json scripts/live-invent-luggage-once.mjs
 */
import { spawnSync } from 'child_process';

const tag = Date.now().toString(36).slice(-4);
const brand = process.env.NOVA_CREATE_BRAND || `Ridgeline Carry ${tag}`;
const prompt = [
  `Create a new website on disk for **${brand}** — a travel luggage brand for carry-on suitcases, rollers, duffels, and travel bags.`,
  'Show exactly 12 unique bags/suitcases in the lineup (each with its own name, size/type, short blurb, and price) — stacked layers or a list, NOT a three-card twin grid.',
  'Brand-first hero with the brand name large, a short “built to travel” story, the 12-piece lineup, and a working contact form with name/email state.',
  'Look must be unique to luggage — do not reuse textile atelier, café, or portfolio layouts.',
  'Skip Plan. Start building now — invent App + CSS and open Live when ready.',
].join(' ');

console.log('=== NOVA LIVE INVENT · LUGGAGE ===');
console.log('Brand:', brand);
console.log('Watch Nova window — Cursor only submits the prompt via CDP.');
console.log('');

const g = spawnSync(
  'npx',
  ['tsx', '--tsconfig', 'tsconfig.app.json', 'scripts/live-harness-invent-once.mjs'],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: true,
    env: {
      ...process.env,
      NOVA_CREATE_BRAND: brand,
      NOVA_CREATE_PROMPT: prompt,
      NOVA_CREATE_TIMEOUT_MS: String(25 * 60_000),
    },
    stdio: 'inherit',
  },
);
process.exit(g.status ?? 1);
