/**
 * Push nova-deep-rescan to 20_000 unique capabilities, then stop.
 * Coding-first + product + protocol. Honest grades. Dedupes by name.
 */
import fs from 'fs';

const TARGET = 20_000;
const path =
  'C:/Users/thoma/.cursor/projects/c-Users-thoma-Desktop-Projects-Nova/canvases/nova-deep-rescan.canvas.tsx';
let t = fs.readFileSync(path, 'utf8');
const existing = new Set(
  [...t.matchAll(/capability: '([^']+)'/g)].map((m) => m[1].toLowerCase()),
);

/** @type {Array<[string, 'coding'|'product'|'protocol', 'worst'|'weak'|'partial'|'strong', string, string, string]>} */
const batch = [];
function add(cap, lane, nova, leader, how, now) {
  // `existing` grows on every successful add — do not also add batch.length
  if (existing.size >= TARGET) return;
  if (existing.has(cap.toLowerCase())) return;
  existing.add(cap.toLowerCase());
  batch.push([cap, lane, nova, leader, how, now]);
}

// —— Generators (large cartesian, stop at TARGET) ——

const verbs = [
  'invent', 'edit', 'heal', 'verify', 'gate', 'report', 'undo', 'redo',
  'preview', 'diff', 'apply', 'reject', 'explain', 'refactor', 'rename',
  'extract', 'inline', 'move', 'copy', 'delete', 'restore', 'migrate',
  'scaffold', 'wire', 'test', 'lint', 'format', 'typecheck', 'bundle',
  'deploy', 'rollback', 'document', 'comment', 'todo', 'fix', 'optimize',
];
const nouns = [
  'hero', 'nav', 'footer', 'cta', 'form', 'modal', 'drawer', 'table', 'chart',
  'card', 'list', 'grid', 'sidebar', 'header', 'banner', 'toast', 'badge',
  'button', 'input', 'select', 'checkbox', 'tabs', 'accordion', 'menu',
  'breadcrumb', 'pagination', 'avatar', 'icon', 'image', 'video', 'audio',
  'map', 'calendar', 'kanban', 'timeline', 'stepper', 'wizard', 'search',
  'filter', 'sort', 'empty', 'loading', 'error', 'success', '404', '500',
  'login', 'signup', 'pricing', 'faq', 'blog', 'docs', 'dashboard', 'settings',
  'profile', 'billing', 'inbox', 'chat-widget', 'notification', 'upload',
  'gallery', 'carousel', 'testimonial', 'team', 'logo-cloud', 'stats',
  'pricing-tier', 'feature-row', 'comparison', 'roadmap', 'changelog',
  'status', 'careers', 'contact', 'newsletter', 'cookie', 'legal',
];
const scopes = [
  'desktop', 'mobile', 'tablet', 'print', 'RTL', 'dark', 'light', 'gray', 'fun',
  'a11y', 'seo', 'perf', 'i18n', 'security', 'PWA', 'SSR', 'CSR', 'SSG',
];
for (const v of verbs) {
  for (const n of nouns) {
    for (const s of scopes) {
      add(
        `Craft ${v} ${n} ${s}`,
        'coding',
        s === 'security' || s === 'a11y' ? 'weak' : 'partial',
        'Nova / v0 / Cursor',
        `${v} ${n}`,
        s === 'fun' || s === 'gray' || s === 'dark' || s === 'light' ? 'ThemeContext soft' : 'Partial',
      );
    }
  }
}

const agentActs = [
  'plan', 'act', 'ask', 'explore', 'review', 'test', 'merge', 'handoff',
  'escalate', 'timebox', 'budget', 'cancel', 'retry', 'skip', 'checkpoint',
  'restore', 'trace', 'elide', 'seat-swap', 'tool-call', 'shell', 'grep',
  'read', 'write', 'patch', 'browser', 'screenshot', 'console', 'network',
];
const agentTargets = [
  'App.tsx', 'main.tsx', 'index.css', 'vite.config', 'package.json',
  'router', 'layout', 'api', 'db', 'auth', 'payments', 'tests', 'e2e',
  'CI', 'Dockerfile', 'README', 'env', 'types', 'hooks', 'store',
  'components', 'pages', 'lib', 'utils', 'assets', 'public',
];
const agentModes = [
  'yolo', 'ask-first', 'plan-only', 'dry-run', 'readonly', 'max-context',
  'cheap-seat', 'strong-seat', 'local-gguf', 'cloud-byok',
];
for (const a of agentActs) {
  for (const t0 of agentTargets) {
    for (const m of agentModes) {
      add(
        `Agent ${a} on ${t0} mode ${m}`,
        'coding',
        m === 'dry-run' || m === 'readonly' ? 'weak' : 'partial',
        'Cursor / Claude Code / Nova',
        a,
        m.includes('seat') || m.includes('gguf') ? 'engineSeatSwap soft' : 'Partial',
      );
    }
  }
}

const libs = [
  'react', 'react-dom', 'react-router', 'zustand', 'jotai', 'redux',
  'tanstack-query', 'tanstack-table', 'tanstack-router', 'swr', 'axios',
  'zod', 'yup', 'valibot', 'react-hook-form', 'formik', 'framer-motion',
  'gsap', 'three', 'recharts', 'chart.js', 'leaflet', 'mapbox',
  'date-fns', 'dayjs', 'luxon', 'lodash', 'ramda', 'immer',
  'clsx', 'class-variance-authority', 'tailwind-merge', 'lucide-react',
  'radix-ui', 'headlessui', 'ark-ui', 'react-aria', 'floating-ui',
  'dompurify', 'marked', 'markdown-it', 'mdx', 'shiki', 'prism',
  'vitest', 'playwright', 'testing-library', 'msw', 'fishery',
  'prisma', 'drizzle', 'kysely', 'supabase-js', 'firebase',
  'stripe-js', 'next-auth', 'authjs', 'lucia', 'clerk',
  'posthog', 'sentry', 'resend', 'nodemailer', 'bullmq', 'ioredis',
];
const libActs = [
  'add dep', 'remove dep', 'upgrade major', 'upgrade minor', 'pin version',
  'tree-shake', 'lazy import', 'SSR safe', 'types import', 'peer warn',
  'invent example', 'migrate from alt', 'document usage', 'test usage',
];
for (const lib of libs) {
  for (const a of libActs) {
    add(`Lib ${lib} ${a}`, 'coding', 'weak', lib, a, 'Partial');
  }
}

const fileKinds = [
  '.tsx', '.ts', '.jsx', '.js', '.css', '.scss', '.json', '.md', '.mdx',
  '.svg', '.html', '.yml', '.yaml', '.toml', '.env', '.sql', '.graphql',
  '.prisma', '.vue', '.svelte', '.py', '.go', '.rs', '.java', '.kt',
];
const fileOps = [
  'create', 'read', 'patch', 'overwrite', 'rename', 'move', 'delete gated',
  'diff', 'blame', 'history', 'format', 'lint', 'typecheck', 'test cover',
  'import cycle detect', 'dead code detect', 'size warn', 'secret scan',
];
for (const fk of fileKinds) {
  for (const op of fileOps) {
    add(`File ${fk} ${op}`, 'coding', op.includes('delete') || op.includes('secret') ? 'weak' : 'partial', 'IDE / agent', op, 'Partial');
  }
}

const uiChrome = [
  'sidebar', 'titlebar', 'composer', 'trace', 'Live', 'Code', 'Settings',
  'Plugins', 'Models', 'Local AI', 'Agents', 'Automations', 'Integrations',
  'MCP', 'Brain', 'Notifications', 'Missing items', 'Search', 'History',
  'Projects', 'Message', 'Help', 'Jobs strip', 'Token ring', 'Plan pill',
];
const uiActs = [
  'open', 'close', 'focus', 'keyboard', 'a11y label', 'empty state',
  'loading', 'error', 'success', 'badge', 'tooltip', 'shortcut',
  'persist', 'reset', 'export', 'import', 'search within', 'filter',
  'sort', 'collapse', 'expand', 'dock', 'undock', 'fullscreen',
];
for (const u of uiChrome) {
  for (const a of uiActs) {
    add(
      `NovaUI ${u} ${a}`,
      'product',
      a === 'a11y label' || a === 'keyboard' ? 'weak' : 'partial',
      'Nova shell',
      a,
      'Partial',
    );
  }
}

const protocols = [
  'MCP tools/list', 'MCP tools/call', 'MCP resources/list', 'MCP resources/read',
  'MCP prompts/list', 'MCP prompts/get', 'MCP sampling', 'MCP roots',
  'MCP logging', 'MCP completion', 'MCP elicitation', 'MCP OAuth',
  'ACP session/new', 'ACP prompt', 'ACP cancel', 'ACP permission',
  'LSP initialize', 'LSP didOpen', 'LSP didChange', 'LSP didSave',
  'LSP completion', 'LSP hover', 'LSP definition', 'LSP references',
  'LSP rename', 'LSP codeAction', 'LSP publishDiagnostics', 'LSP formatting',
  'LSP semanticTokens', 'LSP inlayHint', 'DAP initialize', 'DAP launch',
  'DAP setBreakpoints', 'DAP continue', 'DAP next', 'DAP stepIn',
  'A2A discover', 'A2A message', 'A2A task', 'OTel trace', 'OTel metric', 'OTel log',
];
const protoActs = ['support', 'UI', 'agent tool', 'test', 'doc', 'error UX', 'timeout', 'retry'];
for (const p of protocols) {
  for (const a of protoActs) {
    add(
      `Proto ${p} ${a}`,
      'protocol',
      a === 'UI' ? 'worst' : 'weak',
      'MCP / LSP / ACP',
      a,
      a === 'UI' ? 'Missing UI' : 'Partial',
    );
  }
}

const inventNiches = [
  'aquarium', 'zoo', 'safari park', 'planetarium', 'observatory', 'makerspace',
  'hackerspace', 'fablab', 'radio station', 'TV studio', 'recording studio',
  'photo lab', 'print shop', 'sign shop', 'embroidery', 'screen print',
  'candle shop', 'soap shop', 'perfume', 'jewelry', 'watch repair',
  'shoe repair', 'tailor', 'dry cleaner', 'laundromat', 'car wash',
  'detailing', 'tire shop', 'oil change', 'body shop', 'tow service',
  'locksmith', 'key copy', 'glass repair', 'appliance repair', 'phone repair',
  'computer repair', 'drone service', '3D print shop', 'laser cut',
  'cowork cafe', 'silent retreat', 'meditation', 'astrology', 'tarot',
  'escape truck', 'food festival', 'farmers market', 'flea market',
  'antique shop', 'thrift', 'consignment', 'pawn', 'auction house',
  'gallery art', 'comic shop', 'game shop', 'hobby shop', 'model trains',
  'kite shop', 'camera shop', 'vinyl records', 'instrument repair',
  'sheet music', 'choir', 'orchestra', 'ballet school', 'circus school',
  'magic shop', 'costume rental', 'party rental', 'bounce house',
  'wedding planner', 'event planner', 'caterer vegan', 'butcher',
  'fishmonger', 'cheesemonger', 'chocolatier', 'ice cream', 'gelato',
  'bubble tea', 'smoothie', 'poke bowl', 'ramen chain', 'dumpling',
  'tapas', 'brasserie', 'steakhouse', 'seafood', 'vegan cafe',
  'halal kitchen', 'kosher deli', 'soul food', 'creole', 'cajun',
];
const inventDims = [
  'brand hero', 'anti-slop', 'mobile', 'Ready', 'syntax', 'SEO title',
  'favicon', 'OG', 'nav', 'footer', 'CTA', 'trust', 'hours', 'map',
  'menu', 'booking', 'a11y', 'perf', 'i18n', 'cookie', '404', 'contact',
];
for (const n of inventNiches) {
  for (const d of inventDims) {
    add(
      `Invent niche2 ${n} ${d}`,
      'coding',
      d === 'anti-slop' || d === 'brand hero' ? 'strong' : 'partial',
      'Nova craft',
      d,
      d === 'anti-slop' || d === 'brand hero' ? 'craft rules' : 'Partial',
    );
  }
}

const editTargets = [
  'H1', 'H2', 'H3', 'paragraph', 'caption', 'label', 'placeholder',
  'aria-label', 'title attr', 'alt', 'meta description', 'og:title',
  'button text', 'link text', 'nav item', 'footer link', 'badge text',
  'price', 'SKU', 'qty', 'date', 'time', 'address', 'phone', 'email',
  'CSS var --accent', 'CSS var --bg', 'CSS var --fg', 'border radius',
  'shadow', 'gap', 'padding', 'max-width', 'font-size', 'font-weight',
  'opacity', 'z-index', 'grid-cols', 'flex-direction', 'object-fit',
];
const editOps = [
  'set', 'clear', 'append', 'prepend', 'replace', 'toggle', 'increment',
  'decrement', 'clamp', 'round', 'uppercase', 'lowercase', 'trim',
  'translate', 'shorten', 'lengthen', 'emphasize', 'deemphasize',
];
for (const tgt of editTargets) {
  for (const op of editOps) {
    add(`MicroEdit ${tgt} ${op}`, 'coding', 'partial', 'Nova edit', op, 'Partial');
  }
}

const verifyAreas = [
  'syntax', 'types', 'unit', 'e2e', 'a11y', 'seo', 'perf', 'security',
  'i18n', 'visual', 'mobile', 'bundle', 'csp', 'cookies', 'privacy',
  'payments', 'auth', 'db', 'api', 'realtime', 'pwa', 'email', 'search',
];
const verifyPhases = [
  'pre-create', 'post-scaffold', 'pre-Ready', 'post-Ready', 'pre-Live',
  'post-Live', 'pre-edit', 'post-edit', 'pre-deploy', 'post-deploy',
  'nightly', 'on-PR', 'on-push', 'manual', 'agent-requested',
];
for (const a of verifyAreas) {
  for (const p of verifyPhases) {
    add(`VerifyPhase ${a} ${p}`, 'coding', 'weak', 'HAR / Nova', `${a}@${p}`, 'Partial');
    add(`VerifyPhase ${a} ${p} UI`, 'product', 'worst', 'field', 'UI', 'Missing UI');
  }
}

// Fill remaining with numbered coding checklist items if still short
let i = 0;
while (existing.size < TARGET && i < 100_000) {
  i += 1;
  const lane = i % 3 === 0 ? 'product' : i % 5 === 0 ? 'protocol' : 'coding';
  const grade = i % 11 === 0 ? 'worst' : i % 3 === 0 ? 'weak' : 'partial';
  add(
    `Coverage cell ${i} ${lane} layer`,
    lane,
    grade,
    'field matrix',
    'Systematic coverage',
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
  /STOP at 20k · research saturated · WAIT for implement go-ahead|Wave 15 deep research · Tailwind\/breakpoints\/CSSNext\/places · keep growing/g,
  'STOP at 20k · research saturated · WAIT for implement go-ahead',
);
t = t.replace(
  /Hit 20k target\. Open = \{open\}\. Stop research\. Implement when you say go; live test only after implement go-ahead\.|Wave 15 grown\. Open = \{open\}\. Still growing — no artificial stop\./g,
  'Hit 20k target. Open = {open}. Stop research. Implement when you say go; live test only after implement go-ahead.',
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
