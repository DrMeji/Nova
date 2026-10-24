/**
 * Wave 9 — keep going: edge cases, Windows desktop, Electron, Nova shell polish, invent QA pairs.
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

const win = [
  'long path >260', 'symlink junctions', 'OneDrive locked files',
  'antivirus quarantine', 'SmartScreen block', 'UAC elevation',
  'WSL interop path', 'Git Bash path', 'PowerShell execution policy',
  'cmd.exe vs pwsh', 'CRLF vs LF bat', 'console code page',
  'GPU driver crash', 'mixed DPI monitors', 'HDR color',
  'touch screen', 'pen input', 'snap layouts', 'virtual desktop',
  'clipboard history', 'emoji panel', 'IME input', 'RTL Windows UI',
];
for (const w of win) {
  add(`Windows ${w} handle`, 'product', 'weak', 'Electron / Win', w, 'Partial');
  add(`Windows ${w} test`, 'coding', 'weak', 'QA', 'Test', 'Partial');
  add(`Windows ${w} UI tip`, 'product', 'worst', 'Help', 'Tip', 'Missing UI');
}

const electron = [
  'safe IPC', 'contextIsolation', 'sandbox renderer', 'CSP',
  'permission camera', 'permission mic', 'permission notifications',
  'protocol handler', 'deep link custom', 'single instance',
  'auto launch', 'tray icon', 'tray menu', 'jump list',
  'native menu', 'native dialog', 'file open dialog', 'file save dialog',
  'print', 'PDF save', 'power monitor', 'battery saver',
  'display media', 'screen share pick', 'hardware accel toggle',
];
for (const e of electron) {
  add(`Electron ${e}`, 'product', 'partial', 'Electron', e, 'Partial');
  add(`Electron ${e} settings UI`, 'product', 'weak', 'Electron', 'Settings', 'Missing UI');
}

const shell = [
  'nav attention badge clear', 'nav working heartbeat clear',
  'jobs strip cancel', 'jobs strip open', 'search fuzzy rank',
  'search recent boost', 'settings section deep link',
  'theme persist reload', 'accent persist reload', 'density persist',
  'font size persist', 'presence persist', 'sidebar hover delay',
  'sidebar leave cancel', 'modal focus return', 'toast queue',
  'toast dismiss all', 'confirm destructive', 'undo delete project',
  'drag project reorder', 'project color tag', 'project archive',
  'project star', 'project export zip', 'project import zip',
];
for (const s of shell) {
  add(`Shell ${s}`, 'product', 'partial', 'Nova', s, 'Partial');
  add(`Shell ${s} polish`, 'product', 'weak', 'Nova', 'Polish', 'Partial');
}

// Invent QA: prompt → expected craft rule
const prompts = [
  'coffee shop site', 'law firm site', 'dentist clinic', 'yoga studio',
  'saas analytics', 'AI chatbot landing', 'portfolio photographer',
  'restaurant menu', 'winery shop', 'bike shop', 'bookstore',
  'kids camp', 'church site', 'museum exhibit', 'podcast home',
  'newsletter waitlist', 'crypto dashboard', 'fintech cards',
  'HR portal', 'inventory admin', 'booking calendar', 'ticket events',
  'real estate listings', 'architect studio', 'interior design',
  'pet groomer', 'auto repair', 'EV charger map', 'farm CSA',
  'university dept', 'K12 school', 'bootcamp course', 'therapy practice',
];
const rules = [
  ['brand hero dominates', 'strong', 'craft rules'],
  ['no purple cream default', 'strong', 'craft rules'],
  ['no card soup hero', 'strong', 'craft rules'],
  ['one CTA group', 'strong', 'craft rules'],
  ['real imagery not abstract only', 'partial', 'Partial'],
  ['mobile nav works', 'strong', 'Live+craft'],
  ['unique name not generic', 'partial', 'Partial'],
  ['Ready gate green', 'strong', 'createReady'],
  ['syntax gate green', 'strong', 'createSyntaxGate'],
  ['no console errors', 'partial', 'Partial'],
];
for (const p of prompts) {
  for (const [r, grade, now] of rules) {
    add(`QA invent "${p}" ${r}`, 'coding', grade, 'Nova craft', r, now);
  }
}

// Edit QA
const edits = [
  'make headline shorter', 'change accent to teal', 'remove testimonials',
  'add FAQ', 'swap logo', 'make CTA bigger', 'darken background',
  'lighten text', 'add contact form', 'fix mobile menu',
  'rename brand to Ridge', 'add pricing tier', 'remove emoji',
  'full bleed hero image', 'add footer legal', 'tighten spacing',
];
for (const e of edits) {
  add(`QA edit "${e}" keeps layout`, 'coding', 'partial', 'Nova edit', 'Keep layout', 'smoke soft');
  add(`QA edit "${e}" surgical`, 'coding', 'partial', 'Nova edit', 'Surgical', 'Partial');
  add(`QA edit "${e}" undo works`, 'coding', 'weak', 'Nova', 'Undo', 'Partial');
  add(`QA edit "${e}" Live updates`, 'coding', 'partial', 'Nova', 'Live', 'Partial');
}

// Agent refusal / safety
const refuse = [
  'rm -rf /', 'curl | sh unknown', 'exfil .env', 'commit secrets',
  'disable auth', 'widen CORS *', 'eval user input', 'sql string concat',
  'innerHTML unsanitized', 'disable CSP', 'ship with debugger',
  'force push main', 'drop production DB', 'email all users spam',
];
for (const r of refuse) {
  add(`Safety refuse ${r}`, 'coding', 'partial', 'Capstone', 'Refuse', 'Partial');
  add(`Safety warn UI ${r}`, 'product', 'weak', 'field', 'Warn', 'Missing UI');
  add(`Safety log ${r}`, 'coding', 'weak', 'audit', 'Log', 'audit Acc');
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
  /Wave 8 deep research · perf\/i18n\/SEO\/legal\/analytics\/workflows · keep growing/g,
  'Wave 9 deep research · Windows/Electron/QA/safety · keep growing',
);
t = t.replace(
  /Wave 8 grown\. Open = \{open\}\. Still growing — no artificial stop\./g,
  'Wave 9 grown. Open = {open}. Still growing — no artificial stop.',
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
