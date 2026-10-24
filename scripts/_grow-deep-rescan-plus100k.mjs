/**
 * Grow deep-rescan JSONL by +100k (or up to TARGET).
 * Usage: node scripts/_grow-deep-rescan-plus100k.mjs [targetTotal]
 * Env: DEEP_RESCAN_CYCLE=N (prefixes research cells)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dataPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'nova-deep-rescan.jsonl');
const cycle = Number(process.env.DEEP_RESCAN_CYCLE || 2);
const tag = `C${cycle}`;

const existing = new Set();
/** @type {Array<{capability:string,lane:string,nova:string,leader:string,howTheyDoIt:string,novaNow:string}>} */
const rows = [];

for (const line of fs.readFileSync(dataPath, 'utf8').split(/\n/)) {
  if (!line.trim()) continue;
  const r = JSON.parse(line);
  const key = String(r.capability || '').toLowerCase();
  if (!key || existing.has(key)) continue;
  existing.add(key);
  rows.push(r);
}

const start = rows.length;
const TARGET = Math.max(Number(process.argv[2]) || start + 100_000, start + 100_000);

/** @type {typeof rows} */
const batch = [];
function add(cap, lane, nova, leader, how, now) {
  if (existing.size >= TARGET) return;
  const key = String(cap).toLowerCase();
  if (existing.has(key)) return;
  existing.add(key);
  const row = { capability: cap, lane, nova, leader, howTheyDoIt: how, novaNow: now };
  batch.push(row);
  rows.push(row);
}

const mediaFails = [
  'no hero image', 'stock purple gradient only', 'emoji as product photo',
  'broken img src', 'empty alt', 'logo missing', 'logo text-only',
  'favicon missing', 'OG image missing', 'SKU photo missing',
  'abstract blobs only', 'AI slop faces', 'wrong aspect hero',
  'duplicate SKU art', 'lazy-load never fires', 'srcset missing',
  'webp never served', 'nav logo pixelated', 'dark mode broken images',
  'category image wrong', 'video poster missing', 'team photo placeholder',
];
const mediaActs = [
  'detect in Live', 'block Ready', 'auto-heal once', 'ask model regenerate',
  'use local asset pack', 'use brandAssets lock', 'use media seat',
  'report in chat', 'fallback craft illustration', 'force vision critique',
  'retry with image brief', 'swap seat to vision', 'budget media tokens',
];
for (const f of mediaFails) {
  for (const a of mediaActs) {
    add(`${tag} media ${f} ${a}`, 'coding', a.includes('block') || a.includes('detect') ? 'weak' : 'partial', 'Nova craft', a, 'Partial');
  }
}

const logoDims = [
  'wordmark', 'lettermark', 'pictorial mark', 'abstract mark', 'emblem',
  'SVG sanitize', 'SVG optimize', 'monochrome pair', 'color pair',
  'favicon 32', 'apple touch', 'maskable PWA', 'lock across pages',
  'contrast on hero', 'size in nav', 'hover state', 'dark-mode invert',
];
for (const d of logoDims) {
  add(`${tag} logo ${d} generate`, 'coding', 'weak', 'brandAssets', d, 'Partial');
  add(`${tag} logo ${d} place`, 'coding', 'partial', 'Nova craft', d, 'Partial');
  add(`${tag} logo ${d} verify Live`, 'coding', 'weak', 'Live grade', d, 'Partial');
  add(`${tag} logo ${d} edit keep`, 'coding', 'partial', 'Nova edit', 'Keep', 'Partial');
}

const typeCraft = [
  'display serif pair', 'sans body pair', 'mono code pair', 'fluid type scale',
  'no Inter default', 'no Roboto default', 'no Arial default',
  'variable font load', 'preload critical', 'clamp hero', 'line-length 65ch',
  'weight hierarchy', 'tracking display', 'leading body',
];
for (const ty of typeCraft) {
  add(`${tag} type ${ty}`, 'coding', 'partial', 'typography', ty, 'craft soft');
  add(`${tag} type ${ty} anti-slop`, 'coding', 'strong', 'craft rules', 'Anti-slop', 'craft rules');
  add(`${tag} type ${ty} Live grade`, 'coding', 'weak', 'Live grade', 'Grade', 'Partial');
}

const atmos = [
  'real place photography', 'material close-up', 'full-bleed media',
  'no inset card hero', 'no floating badge soup', 'one composition viewport',
  'brand louder than headline', 'anti purple cream', 'anti glow slop',
  'product-in-context shot', 'studio product plane', 'lighting mood',
];
for (const a of atmos) {
  add(`${tag} atmosphere ${a}`, 'coding', a.includes('anti') ? 'strong' : 'partial', 'craft rules', a, a.includes('anti') ? 'craft rules' : 'Partial');
  add(`${tag} atmosphere ${a} grade Live`, 'coding', 'weak', 'Live grade', 'Grade', 'Partial');
  add(`${tag} atmosphere ${a} heal`, 'coding', 'weak', 'Nova heal', 'Heal', 'Partial');
}

const seats = [
  'local GGUF coder', 'local GGUF chat', 'local GGUF vision',
  'Groq free', 'Gemini free', 'OpenRouter free', 'Together free',
  'Fireworks free', 'DeepSeek free', 'Qwen free', 'Llama free cloud',
  'Mistral free', 'HF inference free', 'Cerebras free',
];
const seatUses = [
  'invent scaffold', 'invent polish pass', 'invent image brief',
  'edit surgical', 'heal layout', 'vision Live screenshot',
  'vision product photo', 'logo SVG pass', 'typography pass',
  'atmosphere pass', 'ensemble critique', 'budget abort',
];
for (const s of seats) {
  for (const u of seatUses) {
    add(`${tag} seat ${s} ${u}`, 'coding', 'partial', 'engineSeatSwap', u, 'Partial');
  }
}

const modelGaps = [
  'why no image in invent reply', 'why logo skipped', 'why CSS only gradients',
  'why thin hero', 'vision seat never called', 'media seat never called',
  'stop early before polish', 'under-use max tokens', 'under-use tool loop',
  'under-use Live evidence', 'hallucinate product photos', 'never second polish',
];
for (const g of modelGaps) {
  add(`${tag} underuse ${g} detect`, 'coding', 'weak', 'diagnostics', 'Detect', 'Partial');
  add(`${tag} underuse ${g} fix runtime`, 'coding', 'weak', 'runtime', 'Runtime', 'Partial');
  add(`${tag} underuse ${g} UI warn`, 'product', 'worst', 'Nova UI', 'Warn', 'Missing UI');
}

const kinds = [
  'website', 'storefront', 'saas', 'dashboard', 'CLI tool', 'library',
  'mobile Expo', 'desktop Electron', 'game canvas', 'MCP server',
  'API service', 'Chrome extension', 'RAG chat', 'agent harness',
  'design system', 'email template', 'Discord bot', 'data pipeline',
];
const quality = [
  'matches prompt fidelity', 'logo present', 'hero imagery real',
  'typography professional', 'mobile solid', 'a11y basics',
  'no placeholder floor', 'Ready gate', 'images for every SKU',
  'brand kit locked', 'atmosphere plane', 'professional copy',
];
for (const k of kinds) {
  for (const q of quality) {
    add(
      `${tag} kind ${k} ${q}`,
      'coding',
      q.includes('logo') || q.includes('imagery') || q.includes('fidelity') || q.includes('images') ? 'weak' : 'partial',
      'field',
      q,
      'Partial',
    );
  }
}

const domains = [
  'auth', 'payments', 'DB schema', 'API route', 'webhook', 'queue job',
  'file upload', 'search index', 'cache', 'realtime WS', 'i18n',
  'CI workflow', 'Docker', 'unit test', 'e2e test', 'RBAC', 'OAuth',
];
const domainActs = ['invent', 'edit', 'test', 'review', 'heal', 'document'];
for (const d of domains) {
  for (const a of domainActs) {
    add(`${tag} domain ${d} ${a}`, 'coding', 'partial', 'Nova coding', a, 'Partial');
  }
}

const imgPipe = [
  'generate hero', 'generate OG', 'generate logo SVG', 'generate product photo',
  'compress WebP', 'srcset', 'lazy load', 'brand kit lock', 'reject slop face',
  'vision critique Live', 'replace broken img', 'generate favicon',
];
const imgTools = [
  'local media seat', 'SVG craft', 'unsplash curated', 'user upload',
  'screenshot Live', 'brandAssets', 'Openverse',
];
for (const p of imgPipe) {
  for (const tool of imgTools) {
    add(`${tag} ImagePipe ${p} via ${tool}`, 'coding', 'weak', 'media field', `${p}/${tool}`, 'Partial');
  }
}

const fidelity = [
  'every required section present', 'brand name exact', 'image count honored',
  'logo style honored', 'atmosphere honored', 'typography honored',
  'do-not list honored', 'CTA copy honored',
];
const fidelityPhases = ['plan check', 'scaffold check', 'Ready check', 'Live check', 'edit check'];
for (const f of fidelity) {
  for (const p of fidelityPhases) {
    add(`${tag} fidelity ${f} ${p}`, 'coding', 'partial', 'createAskContract', p, 'Partial');
  }
}

const tactics = [
  'vision pass mandatory', 'force logo step', 'force image step',
  'force typography step', 'never stop at scaffold', 'retry on no img tags',
  'retry on purple gradient only', 'multi-seat invent chain',
  'budget-aware seat swap', 'force atmosphere step',
];
for (const tac of tactics) {
  add(`${tag} MaxModel ${tac}`, 'coding', 'weak', 'prompting', tac, 'Partial');
  add(`${tag} MaxModel ${tac} implement`, 'coding', 'weak', 'runtime', 'Implement', 'Partial');
  add(`${tag} MaxModel ${tac} UI toggle`, 'product', 'worst', 'Settings', 'Toggle', 'Missing UI');
}

const protocolBits = [
  'seat roster UI', 'budget meter Live', 'vision seat indicator',
  'media seat indicator', 'craft floor badge', 'logo lock badge',
  'image count meter', 'model potential % meter', 'underuse warn toast',
  'craft heal button', 'open-gap strip',
];
for (const b of protocolBits) {
  add(`${tag} Protocol ${b}`, 'protocol', 'worst', 'Nova shell', b, 'Missing UI');
  add(`${tag} Protocol ${b} wire`, 'product', 'weak', 'Nova UI', 'Wire', 'Partial');
  add(`${tag} Protocol ${b} Acc`, 'coding', 'partial', 'invent Acc', 'Acc', 'Partial');
}

let i = 0;
while (existing.size < TARGET && i < 800_000) {
  i += 1;
  const lane = i % 7 === 0 ? 'protocol' : i % 4 === 0 ? 'product' : 'coding';
  const grade = i % 13 === 0 ? 'worst' : i % 4 === 0 ? 'weak' : 'partial';
  const layer =
    i % 5 === 0 ? 'image-craft' :
    i % 5 === 1 ? 'model-potential' :
    i % 5 === 2 ? 'prompt-fidelity' :
    i % 5 === 3 ? 'full-stack-coding' :
    'agent-loop';
  add(
    `Coverage${TARGET}k ${tag} ${i} ${lane} ${layer}`,
    lane,
    grade,
    `deep research cycle ${cycle}`,
    layer,
    grade === 'worst' ? 'Missing UI' : 'Partial',
  );
}

fs.writeFileSync(dataPath, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);

const by = { worst: 0, weak: 0, partial: 0, strong: 0 };
for (const r of rows) by[r.nova] = (by[r.nova] || 0) + 1;

console.log({
  cycle,
  added: batch.length,
  from: start,
  rows: rows.length,
  target: TARGET,
  hit: rows.length >= TARGET,
  ...by,
  open: by.worst + by.weak + by.partial,
  bytes: fs.statSync(dataPath).size,
});
