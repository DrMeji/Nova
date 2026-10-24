/**
 * Wave 6 — keep going: design systems, content, ecommerce, a11y, mobile, games, ML.
 */
import fs from 'fs';

const path =
  'C:/Users/thoma/.cursor/projects/c-Users-thoma-Desktop-Projects-Nova/canvases/nova-deep-rescan.canvas.tsx';
let t = fs.readFileSync(path, 'utf8');
const existing = new Set(
  [...t.matchAll(/capability: '([^']+)'/g)].map((m) => m[1].toLowerCase()),
);

/** @type {Array<[string, 'coding'|'product'|'protocol', 'worst'|'weak'|'partial'|'strong', string, string, string]>} */
const batch = [];
function add(cap, lane, nova, leader, how, now) {
  if (existing.has(cap.toLowerCase())) return;
  existing.add(cap.toLowerCase());
  batch.push([cap, lane, nova, leader, how, now]);
}

const ds = [
  'Button', 'Input', 'Select', 'Checkbox', 'Radio', 'Switch', 'Slider',
  'Textarea', 'Label', 'Field', 'Form', 'Dialog', 'Drawer', 'Popover',
  'Tooltip', 'Dropdown', 'Menu', 'Menubar', 'ContextMenu', 'Tabs',
  'Accordion', 'Collapsible', 'Card', 'Badge', 'Avatar', 'Chip',
  'Table', 'DataGrid', 'Pagination', 'Breadcrumb', 'Navbar', 'Sidebar',
  'Footer', 'Hero', 'Banner', 'Toast', 'Alert', 'Progress', 'Spinner',
  'Skeleton', 'EmptyState', 'Stepper', 'Timeline', 'Calendar', 'DatePicker',
  'TimePicker', 'ColorPicker', 'FileUpload', 'Dropzone', 'Carousel',
  'Gallery', 'Lightbox', 'Map', 'Chart', 'Sparkline', 'KPI', 'Stat',
  'CommandPalette', 'Combobox', 'TagInput', 'RichText', 'MarkdownEditor',
  'CodeBlock', 'DiffView', 'TreeView', 'List', 'VirtualList', 'Kanban',
];
const dsActs = [
  ['component invent', 'partial', 'Invent component', 'craft soft'],
  ['variants invent', 'weak', 'Variants', 'Partial'],
  ['a11y roles', 'partial', 'Roles', 'a11y Acc'],
  ['keyboard nav', 'weak', 'Keyboard', 'Partial'],
  ['focus ring', 'partial', 'Focus', 'Partial'],
  ['story invent', 'weak', 'Story', 'Partial'],
  ['props docs', 'weak', 'Props docs', 'Partial'],
  ['theme token bind', 'partial', 'Tokens', 'craft'],
];
for (const c of ds) {
  for (const [a, grade, how, now] of dsActs) {
    add(`DS ${c} ${a}`, 'coding', grade, 'Radix / shadcn / MUI', how, now);
  }
}

const ecom = [
  'product card', 'product detail', 'variant picker', 'size guide',
  'add to cart', 'cart drawer', 'cart page', 'upsell', 'cross-sell',
  'coupon field', 'shipping calculator', 'tax estimate', 'checkout steps',
  'payment form', 'order confirm', 'order history', 'wishlist',
  'recently viewed', 'reviews list', 'review form', 'Q&A',
  'inventory badge', 'low stock warn', 'back in stock', 'subscription SKU',
  'bundle deal', 'gift card', 'store credit', 'returns policy',
  'shipping policy', 'size chart modal', 'zoom gallery', '360 view',
  'AR try-on', 'filter sidebar', 'sort controls', 'search products',
  'collection page', 'mega menu', 'announcement bar', 'promo banner',
];
const ecomActs = [
  ['invent section', 'partial', 'Section', 'storefront'],
  ['wire state', 'weak', 'State', 'Partial'],
  ['empty state', 'weak', 'Empty', 'Partial'],
  ['error state', 'weak', 'Error', 'Partial'],
  ['mobile layout', 'partial', 'Mobile', 'craft'],
  ['a11y pass', 'weak', 'A11y', 'a11y Acc'],
  ['analytics event', 'weak', 'Analytics', 'Partial'],
  ['SEO schema', 'weak', 'JSON-LD', 'Partial'],
];
for (const e of ecom) {
  for (const [a, grade, how, now] of ecomActs) {
    add(`Ecom ${e} ${a}`, 'coding', grade, 'Shopify / Lovable', how, now);
  }
}

const content = [
  'blog index', 'blog post', 'MDX post', 'docs home', 'docs page',
  'API reference', 'changelog', 'roadmap', 'glossary', 'FAQ hub',
  'help center', 'tutorial', 'course lesson', 'podcast show notes',
  'newsletter archive', 'press release', 'case study', 'whitepaper',
  'ebook landing', 'webinar landing', 'event page', 'speaker bio',
  'portfolio project', 'case gallery', 'before after', 'process steps',
];
const contentActs = [
  ['template invent', 'weak', 'Template', 'Partial'],
  ['TOC generate', 'weak', 'TOC', 'Partial'],
  ['reading time', 'weak', 'Read time', 'Partial'],
  ['related posts', 'weak', 'Related', 'Partial'],
  ['share buttons', 'weak', 'Share', 'Partial'],
  ['code highlight', 'partial', 'Highlight', 'Partial'],
  ['embed video', 'weak', 'Video', 'Partial'],
  ['embed tweet', 'worst', 'Tweet', 'Missing'],
  ['RSS feed', 'weak', 'RSS', 'Partial'],
  ['sitemap entry', 'partial', 'Sitemap', 'Partial'],
];
for (const c of content) {
  for (const [a, grade, how, now] of contentActs) {
    add(`Content ${c} ${a}`, 'coding', grade, 'Contentful / Framer', how, now);
  }
}

const a11y = [
  'skip link', 'landmark roles', 'heading order', 'alt text',
  'aria-label buttons', 'aria-live polite', 'aria-live assertive',
  'focus visible', 'focus order', 'roving tabindex', 'escape dismiss',
  'dialog focus trap', 'reduced motion', 'prefers contrast',
  'color not only', 'touch target 44px', 'form error associate',
  'fieldset legend', 'table headers', 'caption', 'lang attribute',
  'dir rtl', 'title unique', 'link purpose', 'no keyboard trap',
  'autoplay media control', 'captions video', 'transcript audio',
  'zoom 200%', 'reflow 320px', 'text spacing', 'hover content dismiss',
  'status messages', 'consistent nav', 'error identification',
  'labels or instructions', 'name role value', 'parsing HTML',
];
for (const a of a11y) {
  add(`A11y ${a} invent check`, 'coding', 'weak', 'WCAG / axe', 'Check', 'a11y Acc');
  add(`A11y ${a} Live badge`, 'product', 'weak', 'axe', 'Live badge', 'Missing UI');
  add(`A11y ${a} auto-fix`, 'coding', 'worst', 'field', 'Auto-fix', 'Missing');
}

const mobile = [
  'safe area insets', 'notch aware', 'home indicator', 'status bar style',
  'splash screen', 'app icon', 'adaptive icon', 'push permissions',
  'deep link', 'universal link', 'share sheet', 'haptics',
  'biometric gate', 'offline queue', 'camera capture', 'photo library',
  'file picker', 'contacts pick', 'location permission', 'background fetch',
  'app store metadata', 'play store metadata', 'OTA update', 'crashlytics',
];
const mobileActs = [
  ['Expo invent', 'weak', 'Expo', 'mobile Acc'],
  ['React Native invent', 'weak', 'RN', 'Partial'],
  ['Capacitor wrap', 'weak', 'Capacitor', 'Partial'],
  ['PWA fallback', 'weak', 'PWA', 'pwa Acc'],
  ['test on device', 'worst', 'Device test', 'Missing'],
  ['screenshot frames', 'weak', 'Frames', 'Partial'],
];
for (const m of mobile) {
  for (const [a, grade, how, now] of mobileActs) {
    add(`Mobile ${m} ${a}`, 'coding', grade, 'Expo / Flutter', how, now);
  }
}

const game = [
  'canvas mount', 'game loop', 'sprite sheet', 'tilemap', 'physics body',
  'collision', 'camera follow', 'parallax', 'particle', 'audio bus',
  'sfx trigger', 'music loop', 'UI HUD', 'pause menu', 'settings menu',
  'save slot', 'high score', 'achievements', 'controller input',
  'touch joystick', 'dialogue box', 'inventory', 'quest log',
  'cutscene', 'shader', 'lighting', 'fog', 'day night',
];
const gameActs = [
  ['invent stub', 'weak', 'Stub', 'game Acc'],
  ['debug overlay', 'weak', 'Debug', 'Partial'],
  ['hot reload', 'weak', 'HMR', 'Partial'],
  ['asset pipeline', 'worst', 'Assets', 'Missing'],
  ['export web', 'weak', 'Web export', 'Partial'],
  ['export desktop', 'worst', 'Desktop', 'Missing'],
];
for (const g of game) {
  for (const [a, grade, how, now] of gameActs) {
    add(`Game ${g} ${a}`, 'coding', grade, 'Phaser / Godot', how, now);
  }
}

const ml = [
  'dataset load', 'train loop', 'eval metrics', 'confusion matrix',
  'feature store', 'embedding index', 'RAG chunk', 'RAG retrieve',
  'prompt template', 'eval harness', 'red team', 'guardrails',
  'model card', 'bias report', 'latency bench', 'cost bench',
  'quantize export', 'ONNX export', 'GGUF export', 'LoRA train',
  'fine-tune UI', 'dataset label', 'active learning', 'human feedback',
];
const mlActs = [
  ['notebook path', 'worst', 'Notebook', 'Missing'],
  ['script path', 'weak', 'Script', 'Partial'],
  ['UI dashboard', 'worst', 'Dashboard', 'Missing UI'],
  ['agent tool', 'weak', 'Tool', 'Partial'],
  ['invent demo', 'weak', 'Demo', 'Partial'],
];
for (const m of ml) {
  for (const [a, grade, how, now] of mlActs) {
    add(`ML ${m} ${a}`, 'coding', grade, 'Colab / HF', how, now);
  }
}

// Observability product
const obs = [
  'error boundary invent', 'error boundary report', 'sourcemap upload',
  'session replay', 'rage click', 'dead click', 'funnel', 'heatmap',
  'uptime check', 'synthetic journey', 'log search', 'trace waterfalls',
  'metric alert', 'on-call page', 'status incident', 'postmortem template',
];
for (const o of obs) {
  add(`Obs ${o} UI`, 'product', 'worst', 'Datadog / Sentry', o, 'Missing UI');
  add(`Obs ${o} invent wiring`, 'coding', 'weak', 'Sentry', o, 'Partial');
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
  /Wave 5 deep research · langs\/frameworks\/devops · keep growing/g,
  'Wave 6 deep research · DS/ecom/a11y/mobile/game/ML · keep growing',
);
t = t.replace(
  /Wave 5 grown\. Open = \{open\}\. Still growing — no artificial stop\./g,
  'Wave 6 grown. Open = {open}. Still growing — no artificial stop.',
);

fs.writeFileSync(path, t);
const g = (k) => [...t.matchAll(new RegExp(`nova: '${k}'`, 'g'))].length;
console.log({
  added: batch.length,
  rows: [...t.matchAll(/capability: '/g)].length,
  worst: g('worst'),
  weak: g('weak'),
  partial: g('partial'),
  strong: g('strong'),
  open: g('worst') + g('weak') + g('partial'),
});
