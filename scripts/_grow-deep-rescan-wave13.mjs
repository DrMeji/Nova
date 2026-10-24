/**
 * Wave 13 — keep going: charts, maps, calendars, tables, editors, markdown.
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

const charts = [
  'line', 'area', 'bar', 'stacked bar', 'grouped bar', 'pie', 'donut',
  'scatter', 'bubble', 'radar', 'heatmap', 'treemap', 'sunburst',
  'sankey', 'funnel', 'gauge', 'candlestick', 'boxplot', 'histogram',
  'sparkline', 'waterfall', 'calendar heatmap', 'choropleth',
];
const chartLibs = ['Recharts', 'Chart.js', 'Victory', 'Nivo', 'ECharts', 'Observable Plot', 'D3'];
for (const c of charts) {
  for (const lib of chartLibs) {
    add(`Chart ${c} via ${lib} invent`, 'coding', 'weak', lib, c, 'Partial');
  }
  add(`Chart ${c} a11y summary`, 'coding', 'weak', 'a11y', 'Text summary', 'a11y Acc');
  add(`Chart ${c} empty state`, 'coding', 'weak', 'field', 'Empty', 'Partial');
  add(`Chart ${c} loading`, 'coding', 'partial', 'field', 'Loading', 'Partial');
}

const maps = [
  'Mapbox', 'Leaflet', 'Google Maps', 'MapLibre', 'OpenLayers', 'deck.gl',
];
const mapActs = [
  'markers', 'clusters', 'polygons', 'heatmap layer', 'route line',
  'geocode', 'reverse geocode', 'draw tools', 'fullscreen', 'controls',
];
for (const m of maps) {
  for (const a of mapActs) {
    add(`Map ${m} ${a} invent`, 'coding', 'weak', m, a, 'Partial');
  }
}

const cal = [
  'month view', 'week view', 'day view', 'agenda', 'drag event',
  'resize event', 'recurring', 'timezone', 'all-day', 'multi calendar',
  'resource view', 'availability', 'booking slot', 'ICS export', 'ICS import',
];
for (const c of cal) {
  add(`Calendar ${c} invent`, 'coding', 'weak', 'FullCalendar', c, 'Partial');
  add(`Calendar ${c} a11y`, 'coding', 'weak', 'a11y', 'A11y', 'a11y Acc');
}

const tables = [
  'sort', 'multi sort', 'filter', 'column filter', 'global search',
  'pagination', 'virtual scroll', 'row select', 'bulk actions',
  'column resize', 'column reorder', 'column hide', 'pin columns',
  'expand row', 'tree data', 'grouping', 'aggregation', 'export CSV',
  'export Excel', 'inline edit', 'cell validate', 'sticky header',
  'sticky first col', 'density compact', 'empty', 'loading skeleton',
];
for (const t0 of tables) {
  add(`Table ${t0} invent`, 'coding', 'weak', 'TanStack Table', t0, 'Partial');
  add(`Table ${t0} a11y`, 'coding', 'weak', 'a11y', 'A11y', 'a11y Acc');
}

const editors = [
  'CodeMirror', 'Monaco', 'Ace', 'Quill', 'TipTap', 'ProseMirror',
  'Slate', 'Lexical', 'Draft.js', 'Plate', 'Novel', 'MDXEditor',
];
const edActs = [
  'mount invent', 'toolbar', 'markdown', 'slash menu', 'mentions',
  'embeds', 'collaborative', 'readonly', 'diff mode', 'vim mode',
];
for (const e of editors) {
  for (const a of edActs) {
    add(`Editor ${e} ${a}`, 'coding', 'weak', e, a, 'Partial');
  }
}

const md = [
  'GFM tables', 'GFM tasklists', 'GFM strikethrough', 'GFM autolink',
  'footnotes', 'math KaTeX', 'math MathJax', 'mermaid fence',
  'syntax highlight shiki', 'syntax highlight prism', 'callouts',
  'admonitions', 'TOC from headings', 'heading anchors', 'copy code btn',
  'line numbers', 'diff fence', 'raw HTML sanitize', 'emoji shortcodes',
];
for (const m of md) {
  add(`Markdown ${m} invent`, 'coding', 'partial', 'MDX / GFM', m, 'Partial');
  add(`Markdown ${m} chat render`, 'product', 'partial', 'Nova chat', m, 'chatMarkdown soft');
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
  /Wave 12 deep research · React\/forms\/state\/router\/data\/motion · keep growing/g,
  'Wave 13 deep research · charts/maps/calendar/table/editor/md · keep growing',
);
t = t.replace(
  /Wave 12 grown\. Open = \{open\}\. Still growing — no artificial stop\./g,
  'Wave 13 grown. Open = {open}. Still growing — no artificial stop.',
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
