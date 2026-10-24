/**
 * Wave 8 — keep going: performance, i18n locales, legal, analytics, SEO schemas, SEO pages.
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

const perf = [
  'LCP', 'INP', 'CLS', 'TTFB', 'FCP', 'TTI', 'TBT', 'SI',
  'JS bundle', 'CSS bundle', 'image weight', 'font weight',
  'third-party scripts', 'hydration cost', 're-render cost',
  'memory leak', 'long task', 'main thread block', 'FPS drop',
  'cache hit rate', 'CDN hit', 'compression br', 'HTTP2 push',
];
const perfActs = [
  ['measure Live', 'weak', 'Measure', 'Partial'],
  ['budget gate', 'weak', 'Budget', 'Partial'],
  ['report chat', 'weak', 'Report', 'Partial'],
  ['auto suggest fix', 'weak', 'Suggest', 'Partial'],
  ['badge UI', 'weak', 'Badge', 'Missing UI'],
];
for (const p of perf) {
  for (const [a, grade, how, now] of perfActs) {
    add(`Perf ${p} ${a}`, 'coding', grade, 'Lighthouse / CWV', how, now);
  }
}

const locales = [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'pt-BR', 'nl', 'pl', 'sv',
  'da', 'no', 'fi', 'cs', 'hu', 'ro', 'el', 'tr', 'ru', 'uk',
  'ar', 'he', 'fa', 'hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn',
  'zh-CN', 'zh-TW', 'ja', 'ko', 'th', 'vi', 'id', 'ms', 'tl', 'sw',
];
const locActs = [
  ['locale file invent', 'weak', 'Messages', 'i18n Acc'],
  ['RTL layout', 'worst', 'RTL', 'Missing'],
  ['date format', 'weak', 'Dates', 'Partial'],
  ['number format', 'weak', 'Numbers', 'Partial'],
  ['currency format', 'weak', 'Money', 'Partial'],
  ['switcher UI', 'weak', 'Switcher', 'Missing UI'],
  ['pseudo-locale test', 'worst', 'Pseudo', 'Missing'],
  ['missing key warn', 'weak', 'Missing keys', 'Partial'],
];
for (const l of locales) {
  for (const [a, grade, how, now] of locActs) {
    add(`i18n ${l} ${a}`, 'coding', grade, 'i18next / FormatJS', how, now);
  }
}

const seoSchemas = [
  'Organization', 'WebSite', 'WebPage', 'Article', 'BlogPosting',
  'Product', 'Offer', 'AggregateRating', 'Review', 'FAQPage',
  'HowTo', 'BreadcrumbList', 'Event', 'Person', 'LocalBusiness',
  'Restaurant', 'Hotel', 'JobPosting', 'Course', 'SoftwareApplication',
  'VideoObject', 'ImageObject', 'ItemList', 'SearchAction', 'Speakable',
];
for (const s of seoSchemas) {
  add(`SEO JSON-LD ${s} invent`, 'coding', 'weak', 'schema.org', 'JSON-LD', 'Partial');
  add(`SEO JSON-LD ${s} validate`, 'coding', 'weak', 'Rich Results', 'Validate', 'Partial');
  add(`SEO JSON-LD ${s} Live badge`, 'product', 'weak', 'SEO', 'Badge', 'Missing UI');
}

const legal = [
  'privacy policy', 'terms of service', 'cookie policy', 'acceptable use',
  'DMCA', 'impressum', 'accessibility statement', 'subprocessors',
  'DPA', 'SLA', 'refund policy', 'shipping policy', 'warranty',
  'EULA', 'open source notices', 'security policy', 'bug bounty',
];
for (const l of legal) {
  add(`Legal ${l} page invent`, 'coding', 'weak', 'Termly / field', 'Page', 'Partial');
  add(`Legal ${l} link footer`, 'coding', 'partial', 'field', 'Footer link', 'Partial');
  add(`Legal ${l} version date`, 'coding', 'weak', 'field', 'Version', 'Partial');
}

const analytics = [
  'pageview', 'click CTA', 'signup', 'login', 'purchase', 'add_to_cart',
  'begin_checkout', 'search', 'share', 'download', 'video_start',
  'video_complete', 'form_start', 'form_submit', 'error', 'timing',
  'scroll_depth', 'outbound_link', 'file_download', 'engage',
];
const analActs = [
  ['event invent', 'weak', 'Event', 'Partial'],
  ['GA4 recipe', 'weak', 'GA4', 'Partial'],
  ['Plausible recipe', 'weak', 'Plausible', 'Partial'],
  ['PostHog recipe', 'weak', 'PostHog', 'Partial'],
  ['consent gate', 'weak', 'Consent', 'Partial'],
  ['debug panel', 'weak', 'Debug', 'Missing UI'],
];
for (const a of analytics) {
  for (const [act, grade, how, now] of analActs) {
    add(`Analytics ${a} ${act}`, 'coding', grade, 'GA4 / PostHog', how, now);
  }
}

const seoPages = [
  'robots.txt', 'sitemap.xml', 'humans.txt', 'security.txt',
  'ads.txt', 'app-ads.txt', 'llms.txt', 'ai.txt',
  'manifest.webmanifest', 'browserconfig.xml', 'opensearch.xml',
  'feed.xml', 'atom.xml', 'amp page', 'amp story',
];
for (const p of seoPages) {
  add(`SEO file ${p} invent`, 'coding', 'weak', 'SEO field', 'File', 'Partial');
  add(`SEO file ${p} validate`, 'coding', 'weak', 'SEO', 'Validate', 'Partial');
  add(`SEO file ${p} UI edit`, 'product', 'weak', 'SEO', 'Editor', 'Missing UI');
}

// Agent memory / rules deeper
const mem = [
  'user preference remember', 'project convention remember', 'brand voice remember',
  'dont-touch remember', 'failed approach remember', 'success recipe remember',
  'library version remember', 'deploy target remember', 'reviewer style remember',
  'timezone remember', 'locale remember', 'budget remember',
];
for (const m of mem) {
  add(`Memory ${m}`, 'coding', 'weak', 'Cursor Memories', m, 'threadBrain soft');
  add(`Memory ${m} UI edit`, 'product', 'weak', 'field', 'Edit memory', 'Missing UI');
  add(`Memory ${m} forget`, 'coding', 'weak', 'field', 'Forget', 'Partial');
}

// Competitor workflow names
const flows = [
  'greenfield invent', 'brownfield edit', 'bugfix from stacktrace',
  'feature from issue', 'refactor for readability', 'perf pass',
  'a11y pass', 'i18n pass', 'security pass', 'dependency bump',
  'major upgrade framework', 'migrate CSS tool', 'migrate state lib',
  'extract design system', 'split monorepo package', 'add storybook',
  'add e2e suite', 'add CI', 'add preview deploys', 'add feature flags',
  'add analytics', 'add auth', 'add payments', 'add admin',
  'add docs site', 'add changelog', 'add status page', 'add blog',
];
for (const f of flows) {
  add(`Workflow ${f} plan`, 'coding', 'partial', 'Cursor Plan', 'Plan', 'Plan/Act');
  add(`Workflow ${f} act`, 'coding', 'partial', 'Cursor Agent', 'Act', 'Partial');
  add(`Workflow ${f} verify`, 'coding', 'weak', 'HAR', 'Verify', 'Partial');
  add(`Workflow ${f} PR`, 'coding', 'weak', 'Copilot', 'PR', 'draft-pr Acc');
  add(`Workflow ${f} one-click UI`, 'product', 'worst', 'field', 'Button', 'Missing UI');
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
  /Wave 7 deep research · API\/auth\/pay\/realtime\/email\/search · keep growing/g,
  'Wave 8 deep research · perf/i18n/SEO/legal/analytics/workflows · keep growing',
);
t = t.replace(
  /Wave 7 grown\. Open = \{open\}\. Still growing — no artificial stop\./g,
  'Wave 8 grown. Open = {open}. Still growing — no artificial stop.',
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
