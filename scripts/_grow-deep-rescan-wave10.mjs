/**
 * Wave 10 — keep going: accessibility WCAG criteria, HTTP status invent, CSS layout, SVG/icon.
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

// WCAG 2.2 success criteria (ids) × actions
const wcag = [
  '1.1.1', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.3.1', '1.3.2', '1.3.3', '1.3.4',
  '1.3.5', '1.4.1', '1.4.2', '1.4.3', '1.4.4', '1.4.5', '1.4.10', '1.4.11', '1.4.12', '1.4.13',
  '2.1.1', '2.1.2', '2.1.4', '2.2.1', '2.2.2', '2.3.1', '2.4.1', '2.4.2', '2.4.3', '2.4.4',
  '2.4.5', '2.4.6', '2.4.7', '2.4.11', '2.4.12', '2.4.13', '2.5.1', '2.5.2', '2.5.3', '2.5.4',
  '2.5.7', '2.5.8', '3.1.1', '3.1.2', '3.2.1', '3.2.2', '3.2.3', '3.2.4', '3.2.6', '3.3.1',
  '3.3.2', '3.3.3', '3.3.4', '3.3.7', '3.3.8', '4.1.1', '4.1.2', '4.1.3',
];
for (const w of wcag) {
  add(`WCAG ${w} invent check`, 'coding', 'weak', 'WCAG 2.2', 'Check', 'a11y Acc');
  add(`WCAG ${w} Live fail badge`, 'product', 'weak', 'axe', 'Badge', 'Missing UI');
  add(`WCAG ${w} auto-fix suggest`, 'coding', 'worst', 'field', 'Suggest fix', 'Missing');
  add(`WCAG ${w} block Ready`, 'coding', 'weak', 'gates', 'Gate', 'Partial');
}

const http = [
  200, 201, 204, 301, 302, 304, 307, 308, 400, 401, 403, 404, 405, 409, 410, 415, 422, 429,
  500, 502, 503, 504,
];
for (const code of http) {
  add(`HTTP ${code} invent page/handler`, 'coding', 'weak', 'field', 'Handler', 'Partial');
  add(`HTTP ${code} invent UX copy`, 'coding', 'weak', 'field', 'Copy', 'Partial');
  add(`HTTP ${code} Live simulate`, 'product', 'worst', 'DevTools', 'Simulate', 'Missing UI');
  add(`HTTP ${code} agent explain`, 'coding', 'partial', 'Ask', 'Explain', 'plainChatAsk');
}

const layout = [
  'flex row', 'flex col', 'flex wrap', 'grid 2', 'grid 3', 'grid 4', 'grid auto-fit',
  'absolute center', 'sticky header', 'sticky sidebar', 'fixed CTA', 'full viewport hero',
  'split 50/50', 'split 60/40', 'split 70/30', 'masonry', 'bento', 'magazine',
  'sidebar left', 'sidebar right', 'top nav only', 'bottom nav mobile',
  'holy grail', 'dashboard shell', 'auth split', 'pricing 3-col', 'feature zigzag',
  'logo cloud', 'stats strip', 'testimonial grid', 'footer mega', 'footer minimal',
];
const layoutActs = [
  ['invent', 'partial', 'Layout', 'craft'],
  ['edit keep structure', 'partial', 'Edit', 'Partial'],
  ['mobile collapse', 'partial', 'Mobile', 'craft'],
  ['a11y order', 'weak', 'Order', 'a11y Acc'],
];
for (const l of layout) {
  for (const [a, grade, how, now] of layoutActs) {
    add(`Layout ${l} ${a}`, 'coding', grade, 'Framer / Webflow', how, now);
  }
}

const icons = [
  'Lucide', 'Heroicons', 'Phosphor', 'Tabler', 'Feather', 'Font Awesome',
  'Material Icons', 'Bootstrap Icons', 'Remix Icon', 'Radix Icons',
  'Simple Icons', 'Devicons', 'Flag icons', 'Country flags', 'Emoji as icon',
];
const iconActs = [
  ['pack invent default', 'partial', 'Icons', 'Partial'],
  ['swap icon', 'partial', 'Swap', 'Partial'],
  ['size token', 'weak', 'Size', 'Partial'],
  ['stroke width', 'weak', 'Stroke', 'Partial'],
  ['accessible title', 'weak', 'a11y', 'a11y Acc'],
  ['sprite sheet', 'worst', 'Sprite', 'Missing'],
];
for (const i of icons) {
  for (const [a, grade, how, now] of iconActs) {
    add(`Icon ${i} ${a}`, 'coding', grade, i, how, now);
  }
}

const svg = [
  'logo SVG sanitize', 'logo SVG optimize', 'inline SVG invent', 'SVG sprite',
  'SVG animation SMIL', 'SVG animation CSS', 'SVG accessibility title',
  'SVG currentColor', 'SVG responsive viewBox', 'SVG export from invent',
  'favicon from SVG', 'mask icon', 'OG from SVG raster',
];
for (const s of svg) {
  add(`SVG ${s}`, 'coding', 'weak', 'SVGOMG / field', s, 'Partial');
  add(`SVG ${s} UI`, 'product', 'weak', 'field', 'UI', 'Missing UI');
}

// Typography
const type = [
  'display font', 'body font', 'mono font', 'font fallback stack',
  'fluid type', 'modular scale', 'line-height rhythm', 'letter-spacing display',
  'optical sizing', 'variable font axis', 'font subset', 'font preload',
  'font-display swap', 'hyphenation', 'balance text', 'pretty text wrap',
];
for (const ty of type) {
  add(`Type ${ty} invent`, 'coding', 'partial', 'typography field', ty, 'craft soft');
  add(`Type ${ty} edit`, 'coding', 'partial', 'field', 'Edit', 'Partial');
  add(`Type ${ty} Live preview`, 'product', 'weak', 'field', 'Preview', 'Partial');
}

// Color systems
const color = [
  'OKLCH tokens', 'HSL tokens', 'hex tokens', 'semantic success',
  'semantic danger', 'semantic warn', 'semantic info', 'surface ladder',
  'content ladder', 'border ladder', 'accent ramp', 'neutral ramp',
  'contrast AA', 'contrast AAA', 'dark pair', 'light pair', 'gray pair',
  'fun orb accents', 'brand primary', 'brand secondary', 'brand tertiary',
];
for (const c of color) {
  add(`Color ${c} invent`, 'coding', 'partial', 'design tokens', c, 'craft');
  add(`Color ${c} edit`, 'coding', 'partial', 'field', 'Edit', 'Partial');
  add(`Color ${c} contrast gate`, 'coding', 'weak', 'a11y', 'Gate', 'a11y Acc');
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
  /Wave 9 deep research · Windows\/Electron\/QA\/safety · keep growing/g,
  'Wave 10 deep research · WCAG/HTTP/layout/type/color · keep growing',
);
t = t.replace(
  /Wave 9 grown\. Open = \{open\}\. Still growing — no artificial stop\./g,
  'Wave 10 grown. Open = {open}. Still growing — no artificial stop.',
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
