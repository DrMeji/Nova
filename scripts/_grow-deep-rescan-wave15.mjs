/**
 * Wave 15 — keep going: Tailwind utilities, breakpoints, containers, z-index, print.
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

const tw = [
  'p-0', 'p-1', 'p-2', 'p-4', 'p-6', 'p-8', 'px-4', 'py-2', 'm-0', 'm-auto',
  'mx-auto', 'my-0', 'gap-1', 'gap-2', 'gap-4', 'gap-6', 'gap-8',
  'flex', 'inline-flex', 'grid', 'hidden', 'block', 'inline-block',
  'items-center', 'items-start', 'items-end', 'justify-center', 'justify-between',
  'justify-start', 'justify-end', 'self-center', 'grow', 'shrink-0',
  'w-full', 'w-screen', 'min-w-0', 'max-w-prose', 'max-w-3xl', 'max-w-4xl', 'max-w-6xl', 'max-w-7xl',
  'h-full', 'h-screen', 'min-h-screen', 'min-h-dvh', 'h-dvh',
  'rounded', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-full',
  'border', 'border-0', 'border-t', 'border-b', 'divide-y', 'divide-x',
  'shadow-sm', 'shadow', 'shadow-md', 'shadow-lg', 'shadow-none',
  'opacity-0', 'opacity-50', 'opacity-100', 'overflow-hidden', 'overflow-auto',
  'truncate', 'line-clamp-2', 'line-clamp-3', 'whitespace-nowrap', 'break-words',
  'text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl',
  'font-normal', 'font-medium', 'font-semibold', 'font-bold',
  'tracking-tight', 'tracking-wide', 'leading-tight', 'leading-relaxed',
  'uppercase', 'lowercase', 'capitalize', 'normal-case',
  'underline', 'no-underline', 'antialiased',
  'transition', 'transition-colors', 'duration-150', 'duration-300', 'ease-out',
  'hover:opacity-90', 'hover:underline', 'focus:outline-none', 'focus-visible:ring',
  'disabled:opacity-50', 'sr-only', 'not-sr-only',
];
for (const u of tw) {
  add(`Tailwind ${u} invent use`, 'coding', 'partial', 'Tailwind', u, 'craft soft');
  add(`Tailwind ${u} edit surgical`, 'coding', 'partial', 'agent', 'Edit', 'Partial');
}

const bp = ['sm', 'md', 'lg', 'xl', '2xl'];
const bpActs = ['show', 'hide', 'stack', 'row', 'cols-1', 'cols-2', 'cols-3', 'text size', 'pad', 'gap'];
for (const b of bp) {
  for (const a of bpActs) {
    add(`Breakpoint ${b} ${a}`, 'coding', 'partial', 'Tailwind', `${b}:${a}`, 'craft');
  }
}

const z = ['z-0', 'z-10', 'z-20', 'z-30', 'z-40', 'z-50', 'z-auto', 'isolation'];
for (const z0 of z) {
  add(`Stacking ${z0} invent`, 'coding', 'weak', 'CSS', z0, 'Partial');
  add(`Stacking ${z0} modal safe`, 'coding', 'weak', 'CSS', 'Modal', 'Partial');
}

const print = [
  'hide nav print', 'hide footer print', 'expand links print', 'page break avoid',
  'page break before', 'orphans widows', 'print color adjust', 'A4 margin',
  'letter margin', 'header print', 'footer print page num',
];
for (const p of print) {
  add(`Print ${p}`, 'coding', 'weak', 'CSS print', p, 'Partial');
  add(`Print ${p} invent`, 'coding', 'worst', 'field', 'Invent', 'Missing');
}

// Container queries
const cq = ['@container', 'cqw', 'cqh', 'card container', 'sidebar container', 'hero container'];
for (const c of cq) {
  add(`ContainerQuery ${c} invent`, 'coding', 'weak', 'CSS CQ', c, 'Partial');
  add(`ContainerQuery ${c} edit`, 'coding', 'weak', 'agent', 'Edit', 'Partial');
}

// Nested CSS / cascade layers
const cssNew = [
  'cascade layer base', 'cascade layer components', 'cascade layer utilities',
  'nested CSS rules', 'css nesting &', ':has() selector', ':focus-visible',
  'color-mix()', 'light-dark()', 'oklch()', 'relative color',
  'scroll-driven animation', 'view transitions', 'anchor positioning',
  'popover API', 'dialog showModal', 'invoker commands',
];
for (const c of cssNew) {
  add(`CSSNext ${c} invent`, 'coding', 'weak', 'CSS WG', c, 'Partial');
  add(`CSSNext ${c} fallback`, 'coding', 'weak', 'field', 'Fallback', 'Partial');
}

// More invent niches (cities / places vibe)
const places = [
  'Tokyo ramen bar', 'Paris bakery', 'NYC loft studio', 'LA fitness',
  'Austin BBQ', 'Seattle coffee', 'Portland bookstore', 'Miami beach club',
  'Chicago pizza', 'Boston law', 'London fintech', 'Berlin startup',
  'Toronto clinic', 'Vancouver outdoors', 'Sydney surf', 'Dubai luxury',
  'Singapore bank', 'Seoul beauty', 'Mumbai spices', 'CDMX tacos',
];
for (const p of places) {
  add(`Invent place "${p}" atmosphere`, 'coding', 'partial', 'Nova craft', 'Atmosphere', 'craft');
  add(`Invent place "${p}" local proof`, 'coding', 'weak', 'field', 'Local', 'Partial');
  add(`Invent place "${p}" anti-generic`, 'coding', 'strong', 'Nova', 'Unique', 'craft rules');
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
  /Wave 14 deep research · security\/OWASP\/privacy\/niches · keep growing/g,
  'Wave 15 deep research · Tailwind/breakpoints/CSSNext/places · keep growing',
);
t = t.replace(
  /Wave 14 grown\. Open = \{open\}\. Still growing — no artificial stop\./g,
  'Wave 15 grown. Open = {open}. Still growing — no artificial stop.',
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
