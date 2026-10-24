/**
 * Wave 14 — keep going: security headers, cookies, CSP, CORS, OWASP, supply chain.
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

const headers = [
  'Content-Security-Policy', 'Content-Security-Policy-Report-Only',
  'Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options',
  'Referrer-Policy', 'Permissions-Policy', 'Cross-Origin-Opener-Policy',
  'Cross-Origin-Resource-Policy', 'Cross-Origin-Embedder-Policy',
  'X-XSS-Protection legacy', 'Report-To', 'NEL', 'Clear-Site-Data',
  'Cache-Control', 'Pragma', 'Expires', 'ETag', 'Last-Modified',
  'Access-Control-Allow-Origin', 'Access-Control-Allow-Methods',
  'Access-Control-Allow-Headers', 'Access-Control-Allow-Credentials',
  'Access-Control-Max-Age', 'Vary', 'Set-Cookie Secure', 'Set-Cookie HttpOnly',
  'Set-Cookie SameSite', 'Set-Cookie Priority',
];
for (const h of headers) {
  add(`Header ${h} invent`, 'coding', 'weak', 'OWASP / MDN', h, 'Partial');
  add(`Header ${h} audit`, 'coding', 'weak', 'securityheaders.com', 'Audit', 'Partial');
  add(`Header ${h} UI explain`, 'product', 'weak', 'field', 'Explain', 'Missing UI');
}

const owasp = [
  'A01 Broken Access Control', 'A02 Cryptographic Failures',
  'A03 Injection', 'A04 Insecure Design', 'A05 Security Misconfiguration',
  'A06 Vulnerable Components', 'A07 Auth Failures', 'A08 Software Integrity',
  'A09 Logging Failures', 'A10 SSRF',
];
for (const o of owasp) {
  add(`OWASP ${o} invent check`, 'coding', 'weak', 'OWASP Top 10', 'Check', 'Partial');
  add(`OWASP ${o} agent refuse`, 'coding', 'partial', 'safety', 'Refuse', 'Partial');
  add(`OWASP ${o} report UI`, 'product', 'worst', 'field', 'Report', 'Missing UI');
  add(`OWASP ${o} auto-fix`, 'coding', 'weak', 'field', 'Fix', 'Partial');
}

const cookies = [
  'consent banner', 'necessary only', 'analytics opt-in', 'marketing opt-in',
  'preferences center', 'GPC signal', 'Do Not Track', 'cookie inventory',
  'TTL document', 'third-party block', 'SameSite default',
];
for (const c of cookies) {
  add(`Cookie ${c} invent`, 'coding', 'weak', 'OneTrust / field', c, 'Partial');
  add(`Cookie ${c} UI`, 'product', 'weak', 'field', 'UI', 'Missing UI');
}

const supply = [
  'npm audit CI', 'pnpm audit CI', 'yarn audit CI', 'OSV scan',
  'Snyk scan', 'Dependabot PRs', 'Renovate PRs', 'lockfile committed',
  'package-lock verify', 'provenance attest', 'SLSA level note',
  'pinned digests Docker', 'cosign verify', 'SBOM cyclonedx',
  'license allowlist', 'license denylist', 'typosquat warn',
];
for (const s of supply) {
  add(`Supply ${s}`, 'coding', 'weak', 'OpenSSF', s, 'Partial');
  add(`Supply ${s} UI`, 'product', 'worst', 'field', 'UI', 'Missing UI');
}

const xss = [
  'innerHTML sink', 'dangerouslySetInnerHTML', 'document.write',
  'eval string', 'new Function', 'href javascript:', 'svg onload',
  'markdown raw HTML', 'JSON in script tag', 'template literal HTML',
];
for (const x of xss) {
  add(`XSS detect ${x}`, 'coding', 'partial', 'security', 'Detect', 'Partial');
  add(`XSS block ${x}`, 'coding', 'partial', 'security', 'Block', 'Partial');
  add(`XSS sanitize ${x}`, 'coding', 'weak', 'DOMPurify', 'Sanitize', 'Partial');
}

const sqli = [
  'string concat SQL', 'template SQL', 'ORM raw', 'like wildcard inject',
  'order by inject', 'limit inject', 'identifier inject',
];
for (const s of sqli) {
  add(`SQLi detect ${s}`, 'coding', 'partial', 'security', 'Detect', 'Partial');
  add(`SQLi parameterized ${s}`, 'coding', 'partial', 'security', 'Param', 'Partial');
}

// Privacy regs
const regs = [
  'GDPR access', 'GDPR delete', 'GDPR export', 'GDPR consent',
  'CCPA opt-out', 'CCPA delete', 'LGPD', 'PIPEDA', 'UK GDPR',
  'COPPA age gate', 'HIPAA note', 'PCI note', 'SOX note',
];
for (const r of regs) {
  add(`Privacy ${r} invent`, 'coding', 'weak', 'compliance', r, 'Partial');
  add(`Privacy ${r} settings UI`, 'product', 'weak', 'compliance', 'UI', 'Missing UI');
}

// Nova invent edge prompts (more)
const niches = [
  'tattoo studio', 'barbershop', 'nail salon', 'spa resort', 'ski lodge',
  'surf shop', 'climbing gym', 'martial arts dojo', 'dance studio',
  'music school', 'language school', 'driving school', 'flight school',
  'boat rental', 'RV rental', 'storage units', 'coworking space',
  'makerspace', 'escape room', 'bowling alley', 'arcade', 'cinema',
  'theater troupe', 'comedy club', 'jazz club', 'nightclub',
  'food hall', 'ghost kitchen', 'meal prep', 'juice bar', 'tea house',
  'cigar lounge', 'hookah lounge', 'vape shop', 'dispensary stub',
  'pharmacy local', 'optician', 'hearing clinic', 'chiropractor',
  'physio', 'massage', 'acupuncture', 'midwife', 'doula',
  'funeral home', 'cemetery', 'florist', 'landscaper', 'plumber',
  'electrician', 'HVAC', 'roofer', 'painter', 'cleaner',
  'moving company', 'junk removal', 'pest control', 'security firm',
  'private investigator', 'bail bonds', 'notary', 'accountant',
  'tax prep', 'insurance agency', 'mortgage broker', 'title company',
];
for (const n of niches) {
  add(`Invent niche ${n} brand-first`, 'coding', 'partial', 'Nova craft', 'Brand hero', 'craft');
  add(`Invent niche ${n} anti-slop`, 'coding', 'strong', 'Nova craft', 'Anti-slop', 'craft rules');
  add(`Invent niche ${n} Ready`, 'coding', 'partial', 'Nova', 'Ready', 'createReady soft');
  add(`Invent niche ${n} mobile`, 'coding', 'partial', 'Nova', 'Mobile', 'craft');
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
  /Wave 13 deep research · charts\/maps\/calendar\/table\/editor\/md · keep growing/g,
  'Wave 14 deep research · security/OWASP/privacy/niches · keep growing',
);
t = t.replace(
  /Wave 13 grown\. Open = \{open\}\. Still growing — no artificial stop\./g,
  'Wave 14 grown. Open = {open}. Still growing — no artificial stop.',
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
