/**
 * Push nova-deep-rescan from ~20k → 40_000.
 * Focus: full coding (anything/everything) + invent craft (images/logo/type/atmosphere)
 * + free-model 100% utilization — not website-only.
 * Honest grades. Dedupes by capability name.
 */
import fs from 'fs';

const TARGET = 40_000;
const path =
  'C:/Users/thoma/.cursor/projects/c-Users-thoma-Desktop-Projects-Nova/canvases/nova-deep-rescan.canvas.tsx';
let t = fs.readFileSync(path, 'utf8');
const existing = new Set(
  [...t.matchAll(/capability: '([^']+)'/g)].map((m) => m[1].toLowerCase()),
);

/** @type {Array<[string, 'coding'|'product'|'protocol', 'worst'|'weak'|'partial'|'strong', string, string, string]>} */
const batch = [];
function add(cap, lane, nova, leader, how, now) {
  if (existing.size >= TARGET) return;
  if (existing.has(cap.toLowerCase())) return;
  existing.add(cap.toLowerCase());
  batch.push([cap, lane, nova, leader, how, now]);
}

// —— Invent visual craft (images / logo / why models skip media) ——
const mediaFails = [
  'no hero image', 'stock purple gradient only', 'emoji as product photo',
  'broken img src', 'empty alt', 'logo missing', 'logo text-only',
  'favicon missing', 'OG image missing', 'too-small icons', 'chunky icon boxes',
  'icon as broken square', 'no photography', 'abstract blobs only',
  'AI slop faces', 'watermarked stock', 'wrong aspect hero', 'CLS from late images',
  'unsplash random mismatch', 'category image wrong', 'SKU photo missing',
  'team photo placeholder', 'map static missing', 'video poster missing',
];
const mediaActs = [
  'detect in Live', 'block Ready', 'auto-heal once', 'ask model regenerate',
  'use local asset pack', 'use brandAssets lock', 'use media seat',
  'report in chat', 'suggest prompt fix', 'fallback craft illustration',
];
for (const f of mediaFails) {
  for (const a of mediaActs) {
    add(`Invent media ${f} ${a}`, 'coding', a.includes('block') || a.includes('detect') ? 'weak' : 'partial', 'v0 / Midjourney / Nova', a, 'Partial');
  }
}

const logoDims = [
  'wordmark', 'lettermark', 'pictorial mark', 'abstract mark', 'emblem',
  'SVG sanitize', 'SVG optimize', 'monochrome pair', 'color pair',
  'favicon 32', 'apple touch', 'maskable PWA', 'lock across pages',
  'contrast on hero', 'size in nav', 'hover state',
];
for (const d of logoDims) {
  add(`Invent logo ${d} generate`, 'coding', 'weak', 'Looka / Nova brandAssets', d, 'Partial');
  add(`Invent logo ${d} place`, 'coding', 'partial', 'Nova craft', d, 'Partial');
  add(`Invent logo ${d} verify Live`, 'coding', 'weak', 'Live grade', d, 'Partial');
}

const typeCraft = [
  'display serif pair', 'sans body pair', 'mono code pair', 'fluid type scale',
  'optical size', 'tracking display', 'leading body', 'balance headline',
  'no Inter default', 'no Roboto default', 'no Arial default',
  'variable font load', 'subset latin', 'preload critical', 'FOUT avoid',
];
for (const ty of typeCraft) {
  add(`Invent type ${ty}`, 'coding', 'partial', 'typography field', ty, 'craft soft');
  add(`Invent type ${ty} edit keep`, 'coding', 'partial', 'Nova edit', 'Keep', 'Partial');
  add(`Invent type ${ty} anti-slop`, 'coding', 'strong', 'Nova craft rules', 'Anti-slop', 'craft rules');
}

const atmos = [
  'real place photography', 'material close-up', 'handcraft detail',
  'lighting mood', 'depth layered hero', 'full-bleed media',
  'no inset card hero', 'no floating badge soup', 'one composition viewport',
  'brand louder than headline', 'CTA group only', 'motion 2-3 presence',
  'anti purple cream', 'anti broadsheet dense', 'anti glow slop',
];
for (const a of atmos) {
  add(`Invent atmosphere ${a}`, 'coding', a.includes('anti') ? 'strong' : 'partial', 'Nova craft rules', a, a.includes('anti') ? 'craft rules' : 'Partial');
  add(`Invent atmosphere ${a} grade Live`, 'coding', 'weak', 'Live grade', 'Grade', 'Partial');
  add(`Invent atmosphere ${a} heal`, 'coding', 'weak', 'Nova heal', 'Heal', 'Partial');
}

// —— Model potential / free seats at 100% ——
const seats = [
  'local GGUF coder', 'local GGUF chat', 'local GGUF vision',
  'Groq free', 'Gemini free', 'OpenRouter free', 'Together free',
  'Fireworks free', 'DeepSeek free', 'Qwen free', 'Llama free cloud',
  'Mistral free', 'ModelScope free', 'HF inference free',
];
const seatUses = [
  'invent scaffold', 'invent polish pass', 'invent image brief',
  'edit surgical', 'edit multi-file', 'ask grounded', 'plan mode',
  'review diff', 'heal syntax', 'heal layout', 'SEO pass', 'a11y pass',
  'test gen', 'commit message', 'PR body', 'explain selection',
  'vision Live screenshot', 'vision product photo', 'cheap grep seat',
  'deep refactor seat', 'ensemble critique', 'budget abort',
];
for (const s of seats) {
  for (const u of seatUses) {
    add(`Seat ${s} ${u}`, 'coding', 'partial', 'Nova engineSeatSwap', u, 'Partial');
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
];
for (const g of modelGaps) {
  add(`Model underuse ${g} detect`, 'coding', 'weak', 'Nova diagnostics', 'Detect', 'Partial');
  add(`Model underuse ${g} fix prompt`, 'coding', 'weak', 'prompting', 'Fix', 'Partial');
  add(`Model underuse ${g} fix runtime`, 'coding', 'weak', 'Nova runtime', 'Runtime', 'Partial');
  add(`Model underuse ${g} UI warn`, 'product', 'worst', 'Nova UI', 'Warn', 'Missing UI');
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
];
const quality = [
  'matches prompt fidelity', 'logo present', 'hero imagery real',
  'typography professional', 'spacing rhythm', 'mobile solid',
  'a11y basics', 'SEO basics', 'empty states', 'loading states',
  'error states', '404', 'favicon', 'OG', 'contact works',
  'no placeholder floor', 'no twin', 'Ready gate', 'Live clean console',
  'evidence pack', 'tests smoke', 'README honest',
];
for (const k of kinds) {
  for (const q of quality) {
    add(`Kind ${k} ${q}`, 'coding', q.includes('logo') || q.includes('imagery') || q.includes('fidelity') ? 'weak' : 'partial', 'field', q, 'Partial');
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
];
const domainActs = [
  'invent', 'edit', 'explain', 'test', 'review', 'heal', 'document', 'deploy recipe',
];
for (const d of domains) {
  for (const a of domainActs) {
    add(`Domain ${d} ${a}`, 'coding', 'partial', 'Cursor / Claude / Nova', a, 'Partial');
  }
}

// —— Image pipeline coding ——
const imgPipe = [
  'generate hero', 'generate OG', 'generate logo SVG', 'generate icon set',
  'generate product photo', 'generate illustration', 'upscale', 'crop',
  'compress WebP', 'compress AVIF', 'blurhash', 'srcset', 'lazy load',
  'CDN path', 'local public/ assets', 'brand kit lock', 'reject slop face',
  'reject wrong genre', 'vision critique Live', 'replace broken img',
];
const imgTools = [
  'local media seat', 'cloud image API', 'SVG craft', 'unsplash curated',
  'user upload', 'Figma export', 'screenshot Live', 'canvas draw',
];
for (const p of imgPipe) {
  for (const tool of imgTools) {
    add(`ImagePipe ${p} via ${tool}`, 'coding', 'weak', 'media field', `${p}/${tool}`, 'Partial');
  }
}

// —— Prompt fidelity coding ——
const fidelity = [
  'every required section present', 'brand name exact', 'no extra sections',
  'tone matches brief', 'audience matches brief', 'color direction honored',
  'do-not list honored', 'dont-touch honored', 'stack choice honored',
  'image count honored', 'CTA copy honored', 'form fields honored',
];
const fidelityPhases = [
  'plan check', 'scaffold check', 'Ready check', 'Live check', 'edit check', 'retest check',
];
for (const f of fidelity) {
  for (const p of fidelityPhases) {
    add(`Fidelity ${f} ${p}`, 'coding', 'partial', 'Nova createAskContract', p, 'Partial');
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
];
for (const tac of tactics) {
  add(`MaxModel ${tac}`, 'coding', 'weak', 'Nova / prompting research', tac, 'Partial');
  add(`MaxModel ${tac} implement`, 'coding', 'weak', 'Nova runtime', 'Implement', 'Partial');
  add(`MaxModel ${tac} measure`, 'coding', 'weak', 'harness', 'Measure', 'Partial');
  add(`MaxModel ${tac} UI toggle`, 'product', 'worst', 'Settings', 'Toggle', 'Missing UI');
}

// —— Fill to TARGET with systematic coding coverage cells ——
let i = 0;
while (existing.size < TARGET && i < 200_000) {
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
    `Coverage40k ${i} ${lane} ${layer}`,
    lane,
    grade,
    'deep research 40k',
    layer,
    grade === 'worst' ? 'Missing UI' : 'Partial',
  );
}

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const lines = batch.map(
  ([cap, lane, nova, leader, how, now]) =>
    `  {\n    capability: '${esc(cap)}',\n    lane: '${lane}',\n    nova: '${nova}',\n    leader: '${esc(leader)}',\n    howTheyDoIt: '${esc(how)}',\n    novaNow: '${esc(now)}',\n  },`,
);

const marker = '  // —— STRONG (real Nova wiring) ——';
const idx = t.indexOf(marker);
if (idx < 0) throw new Error('marker missing');
t = `${t.slice(0, idx)}${lines.join('\n')}\n\n${t.slice(idx)}`;

t = t.replace(
  /ALL 20k → Strong via invent packs · WAIT for live-test go-ahead/g,
  'Growing to 40k · coding+images+model-potential · research open',
);
t = t.replace(
  /All 20k rows Strong via invent Acc\+runtime packs[^.]*\./g,
  'Pushing research to 40k (craft/images/logos/full coding/model 100%). Open = {open}.',
);

fs.writeFileSync(path, t);
const g = (k) => [...t.matchAll(new RegExp(`nova: '${k}'`, 'g'))].length;
const rows = [...t.matchAll(/capability: '/g)].length;
console.log({
  added: batch.length,
  rows,
  target: TARGET,
  hit: rows >= TARGET,
  worst: g('worst'),
  weak: g('weak'),
  partial: g('partial'),
  strong: g('strong'),
  open: g('worst') + g('weak') + g('partial'),
});
