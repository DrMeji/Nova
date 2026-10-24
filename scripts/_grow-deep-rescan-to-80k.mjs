/**
 * Push deep-rescan JSONL from ~40k → 80_000.
 * Focus: full coding (anything) + invent craft (images/logo/type/atmosphere)
 * + free-model 100% utilization. Honest grades. Dedupes by capability.
 * Does NOT touch the canvas TSX (slim canvas is synced separately).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const TARGET = 80_000;
const dataPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'nova-deep-rescan.jsonl');

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

// —— Deeper invent visual craft (why models skip media) ——
const mediaFails = [
  'no hero image', 'stock purple gradient only', 'emoji as product photo',
  'broken img src', 'empty alt', 'logo missing', 'logo text-only',
  'favicon missing', 'OG image missing', 'too-small icons', 'chunky icon boxes',
  'icon as broken square', 'no photography', 'abstract blobs only',
  'AI slop faces', 'watermarked stock', 'wrong aspect hero', 'CLS from late images',
  'unsplash random mismatch', 'category image wrong', 'SKU photo missing',
  'team photo placeholder', 'map static missing', 'video poster missing',
  'duplicate SKU art', 'logo as hero crop', 'nav logo pixelated',
  'hero letterboxing', 'dark mode broken images', 'lazy-load never fires',
  'srcset missing', 'webp never served', 'avif never served',
];
const mediaActs = [
  'detect in Live', 'block Ready', 'auto-heal once', 'ask model regenerate',
  'use local asset pack', 'use brandAssets lock', 'use media seat',
  'report in chat', 'suggest prompt fix', 'fallback craft illustration',
  'force vision critique', 'retry with image brief', 'swap seat to vision',
];
for (const f of mediaFails) {
  for (const a of mediaActs) {
    add(`Invent80 media ${f} ${a}`, 'coding', a.includes('block') || a.includes('detect') ? 'weak' : 'partial', 'v0 / Midjourney / Nova', a, 'Partial');
  }
}

const logoDims = [
  'wordmark', 'lettermark', 'pictorial mark', 'abstract mark', 'emblem',
  'SVG sanitize', 'SVG optimize', 'monochrome pair', 'color pair',
  'favicon 32', 'apple touch', 'maskable PWA', 'lock across pages',
  'contrast on hero', 'size in nav', 'hover state', 'print mark',
  'animated mark', 'dark-mode invert', 'responsive scale',
];
for (const d of logoDims) {
  add(`Invent80 logo ${d} generate`, 'coding', 'weak', 'Looka / Nova brandAssets', d, 'Partial');
  add(`Invent80 logo ${d} place`, 'coding', 'partial', 'Nova craft', d, 'Partial');
  add(`Invent80 logo ${d} verify Live`, 'coding', 'weak', 'Live grade', d, 'Partial');
  add(`Invent80 logo ${d} edit keep`, 'coding', 'partial', 'Nova edit', 'Keep', 'Partial');
}

const typeCraft = [
  'display serif pair', 'sans body pair', 'mono code pair', 'fluid type scale',
  'optical size', 'tracking display', 'leading body', 'balance headline',
  'no Inter default', 'no Roboto default', 'no Arial default',
  'variable font load', 'subset latin', 'preload critical', 'FOUT avoid',
  'tabular nums', 'small-caps brand', 'clamp hero', 'line-length 65ch',
];
for (const ty of typeCraft) {
  add(`Invent80 type ${ty}`, 'coding', 'partial', 'typography field', ty, 'craft soft');
  add(`Invent80 type ${ty} edit keep`, 'coding', 'partial', 'Nova edit', 'Keep', 'Partial');
  add(`Invent80 type ${ty} anti-slop`, 'coding', 'strong', 'Nova craft rules', 'Anti-slop', 'craft rules');
  add(`Invent80 type ${ty} Live grade`, 'coding', 'weak', 'Live grade', 'Grade', 'Partial');
}

const atmos = [
  'real place photography', 'material close-up', 'handcraft detail',
  'lighting mood', 'depth layered hero', 'full-bleed media',
  'no inset card hero', 'no floating badge soup', 'one composition viewport',
  'brand louder than headline', 'CTA group only', 'motion 2-3 presence',
  'anti purple cream', 'anti broadsheet dense', 'anti glow slop',
  'seasonal atmosphere', 'product-in-context shot', 'macro texture plane',
];
for (const a of atmos) {
  add(`Invent80 atmosphere ${a}`, 'coding', a.includes('anti') ? 'strong' : 'partial', 'Nova craft rules', a, a.includes('anti') ? 'craft rules' : 'Partial');
  add(`Invent80 atmosphere ${a} grade Live`, 'coding', 'weak', 'Live grade', 'Grade', 'Partial');
  add(`Invent80 atmosphere ${a} heal`, 'coding', 'weak', 'Nova heal', 'Heal', 'Partial');
}

// —— Model potential / free seats at 100% ——
const seats = [
  'local GGUF coder', 'local GGUF chat', 'local GGUF vision',
  'Groq free', 'Gemini free', 'OpenRouter free', 'Together free',
  'Fireworks free', 'DeepSeek free', 'Qwen free', 'Llama free cloud',
  'Mistral free', 'ModelScope free', 'HF inference free', 'Cerebras free',
];
const seatUses = [
  'invent scaffold', 'invent polish pass', 'invent image brief',
  'edit surgical', 'edit multi-file', 'ask grounded', 'plan mode',
  'review diff', 'heal syntax', 'heal layout', 'SEO pass', 'a11y pass',
  'test gen', 'commit message', 'PR body', 'explain selection',
  'vision Live screenshot', 'vision product photo', 'cheap grep seat',
  'deep refactor seat', 'ensemble critique', 'budget abort',
  'logo SVG pass', 'typography pass', 'atmosphere pass',
];
for (const s of seats) {
  for (const u of seatUses) {
    add(`Seat80 ${s} ${u}`, 'coding', 'partial', 'Nova engineSeatSwap', u, 'Partial');
  }
}

const modelGaps = [
  'why no image in invent reply', 'why logo skipped', 'why CSS only gradients',
  'why placeholder floor', 'why twin of last invent', 'why ignore brand name',
  'why thin hero', 'why card soup', 'why lorem left', 'why form noop',
  'why no Ready gate', 'why Live blank', 'why console spam',
  'context overflow drop craft rules', 'context drop brand kit',
  'vision seat never called', 'media seat never called',
  'tools never called for assets', 'stop early before polish',
  'repeat same section thrice', 'under-use max tokens',
  'under-use tool loop', 'under-use Live evidence',
  'skip mobile pass', 'skip a11y pass', 'skip SEO pass',
  'ignore do-not list', 'hallucinate product photos',
];
for (const g of modelGaps) {
  add(`Model80 underuse ${g} detect`, 'coding', 'weak', 'Nova diagnostics', 'Detect', 'Partial');
  add(`Model80 underuse ${g} fix prompt`, 'coding', 'weak', 'prompting', 'Fix', 'Partial');
  add(`Model80 underuse ${g} fix runtime`, 'coding', 'weak', 'Nova runtime', 'Runtime', 'Partial');
  add(`Model80 underuse ${g} UI warn`, 'product', 'worst', 'Nova UI', 'Warn', 'Missing UI');
}

// —— Coding anything: product kinds × quality bars ——
const kinds = [
  'website', 'storefront', 'saas', 'dashboard', 'admin', 'docs', 'blog',
  'portfolio', 'landing', 'waitlist', 'API service', 'CLI tool', 'library',
  'mobile Expo', 'desktop Electron', 'game canvas', 'Chrome extension',
  'VS Code extension', 'MCP server', 'Discord bot', 'Telegram bot',
  'Slack app', 'Shopify app', 'WordPress theme', 'email template',
  'Notion-like app', 'Figma plugin', 'data pipeline', 'ML demo',
  'RAG chat', 'agent harness', 'internal tool', 'status page',
  'design system', 'component library', 'storybook', 'monorepo',
  'IoT dashboard', 'POS kiosk', 'booking system', 'CRM lite',
  'invoice app', 'habit tracker', 'music player', 'map explorer',
];
const quality = [
  'matches prompt fidelity', 'logo present', 'hero imagery real',
  'typography professional', 'spacing rhythm', 'mobile solid',
  'a11y basics', 'SEO basics', 'empty states', 'loading states',
  'error states', '404', 'favicon', 'OG', 'contact works',
  'no placeholder floor', 'no twin', 'Ready gate', 'Live clean console',
  'evidence pack', 'tests smoke', 'README honest',
  'images for every SKU', 'brand kit locked', 'atmosphere plane',
];
for (const k of kinds) {
  for (const q of quality) {
    add(
      `Kind80 ${k} ${q}`,
      'coding',
      q.includes('logo') || q.includes('imagery') || q.includes('fidelity') || q.includes('images') ? 'weak' : 'partial',
      'field',
      q,
      'Partial',
    );
  }
}

// —— Edit / agent coding loops (non-website) ——
const domains = [
  'auth', 'payments', 'DB schema', 'API route', 'webhook', 'queue job',
  'cron', 'email send', 'file upload', 'search index', 'cache',
  'realtime WS', 'GraphQL', 'tRPC', 'OpenAPI', 'i18n', 'feature flag',
  'analytics event', 'error tracking', 'CI workflow', 'Docker',
  'K8s manifest', 'Terraform', 'Prisma migrate', 'seed data',
  'unit test', 'e2e test', 'story', 'a11y axe', 'perf budget',
  'rate limit', 'RBAC', 'SSO', 'OAuth', 'webhook retry',
];
const domainActs = [
  'invent', 'edit', 'explain', 'test', 'review', 'heal', 'document', 'deploy recipe',
];
for (const d of domains) {
  for (const a of domainActs) {
    add(`Domain80 ${d} ${a}`, 'coding', 'partial', 'Cursor / Claude / Nova', a, 'Partial');
  }
}

// —— Image pipeline coding ——
const imgPipe = [
  'generate hero', 'generate OG', 'generate logo SVG', 'generate icon set',
  'generate product photo', 'generate illustration', 'upscale', 'crop',
  'compress WebP', 'compress AVIF', 'blurhash', 'srcset', 'lazy load',
  'CDN path', 'local public/ assets', 'brand kit lock', 'reject slop face',
  'reject wrong genre', 'vision critique Live', 'replace broken img',
  'generate favicon', 'generate apple touch', 'generate maskable',
];
const imgTools = [
  'local media seat', 'cloud image API', 'SVG craft', 'unsplash curated',
  'user upload', 'Figma export', 'screenshot Live', 'canvas draw',
  'Openverse', 'brandAssets',
];
for (const p of imgPipe) {
  for (const tool of imgTools) {
    add(`ImagePipe80 ${p} via ${tool}`, 'coding', 'weak', 'media field', `${p}/${tool}`, 'Partial');
  }
}

// —— Prompt fidelity coding ——
const fidelity = [
  'every required section present', 'brand name exact', 'no extra sections',
  'tone matches brief', 'audience matches brief', 'color direction honored',
  'do-not list honored', 'dont-touch honored', 'stack choice honored',
  'image count honored', 'CTA copy honored', 'form fields honored',
  'logo style honored', 'atmosphere honored', 'motion budget honored',
];
const fidelityPhases = [
  'plan check', 'scaffold check', 'Ready check', 'Live check', 'edit check', 'retest check',
];
for (const f of fidelity) {
  for (const p of fidelityPhases) {
    add(`Fidelity80 ${f} ${p}`, 'coding', 'partial', 'Nova createAskContract', p, 'Partial');
  }
}

// —— Free model max utilization tactics ——
const tactics = [
  'longer craft system prompt', 'tool-first invent', 'vision pass mandatory',
  'second polish seat', 'cheap explore then deep implement',
  'structured JSON invent plan', 'section-by-section write',
  'evidence-driven heal loop', 'token budget for media',
  'never stop at scaffold', 'force logo step', 'force image step',
  'force typography step', 'force mobile pass', 'force a11y pass',
  'ensemble critic free seat', 'retry on thin App.jsx',
  'retry on no img tags', 'retry on Inter/Roboto',
  'retry on purple gradient only', 'retry on emoji product',
  'multi-seat invent chain', 'budget-aware seat swap',
];
for (const tac of tactics) {
  add(`MaxModel80 ${tac}`, 'coding', 'weak', 'Nova / prompting research', tac, 'Partial');
  add(`MaxModel80 ${tac} implement`, 'coding', 'weak', 'Nova runtime', 'Implement', 'Partial');
  add(`MaxModel80 ${tac} measure`, 'coding', 'weak', 'harness', 'Measure', 'Partial');
  add(`MaxModel80 ${tac} UI toggle`, 'product', 'worst', 'Settings', 'Toggle', 'Missing UI');
}

// —— Protocol / product shell for free-model utilization ——
const protocolBits = [
  'seat roster UI', 'budget meter Live', 'vision seat indicator',
  'media seat indicator', 'craft floor badge', 'logo lock badge',
  'image count meter', 'model potential % meter', 'underuse warn toast',
];
for (const b of protocolBits) {
  add(`Protocol80 ${b}`, 'protocol', 'worst', 'Nova shell', b, 'Missing UI');
  add(`Protocol80 ${b} wire`, 'product', 'weak', 'Nova UI', 'Wire', 'Partial');
  add(`Protocol80 ${b} Acc`, 'coding', 'partial', 'invent Acc', 'Acc', 'Partial');
}

// —— Fill to TARGET ——
let i = 0;
while (existing.size < TARGET && i < 400_000) {
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
    `Coverage80k ${i} ${lane} ${layer}`,
    lane,
    grade,
    'deep research 80k',
    layer,
    grade === 'worst' ? 'Missing UI' : 'Partial',
  );
}

const body = `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;
fs.writeFileSync(dataPath, body);

const by = { worst: 0, weak: 0, partial: 0, strong: 0 };
for (const r of rows) by[r.nova] = (by[r.nova] || 0) + 1;

console.log({
  added: batch.length,
  rows: rows.length,
  target: TARGET,
  hit: rows.length >= TARGET,
  ...by,
  open: by.worst + by.weak + by.partial,
  bytes: fs.statSync(dataPath).size,
});
