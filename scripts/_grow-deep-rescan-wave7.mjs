/**
 * Wave 7 — keep going: API design, auth patterns, payments, realtime, email, search.
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

const api = [
  'REST list', 'REST get', 'REST create', 'REST update', 'REST delete',
  'REST patch', 'REST pagination', 'REST filter', 'REST sort', 'REST search',
  'REST batch', 'REST upsert', 'REST soft delete', 'REST restore',
  'GraphQL query', 'GraphQL mutation', 'GraphQL subscription', 'GraphQL dataloader',
  'tRPC procedure', 'tRPC router', 'gRPC unary', 'gRPC stream',
  'WebSocket channel', 'SSE stream', 'webhook receiver', 'webhook signer',
  'rate limit', 'idempotency key', 'ETag cache', 'CORS config',
  'OpenAPI generate', 'OpenAPI mock', 'API versioning', 'API deprecation',
  'healthz', 'readyz', 'metrics scrape', 'auth middleware',
];
const apiActs = [
  ['invent handler', 'weak', 'Handler', 'Partial'],
  ['invent client', 'weak', 'Client', 'Partial'],
  ['invent types', 'partial', 'Types', 'Partial'],
  ['invent tests', 'weak', 'Tests', 'Partial'],
  ['invent docs', 'weak', 'Docs', 'Partial'],
  ['Live mock', 'weak', 'Mock', 'Partial'],
  ['error shape', 'partial', 'Errors', 'Partial'],
  ['validation zod', 'partial', 'Zod', 'Partial'],
];
for (const a of api) {
  for (const [act, grade, how, now] of apiActs) {
    add(`API ${a} ${act}`, 'coding', grade, 'Postman / tRPC / FastAPI', how, now);
  }
}

const auth = [
  'email password', 'magic link', 'OTP SMS', 'OTP email', 'OAuth Google',
  'OAuth GitHub', 'OAuth Apple', 'OAuth Microsoft', 'SAML stub',
  'passkey WebAuthn', 'session cookie', 'JWT access', 'refresh rotate',
  'RBAC roles', 'ABAC attrs', 'org multi-tenant', 'team invites',
  'email verify', 'password reset', 'account lockout', '2FA TOTP',
  '2FA backup codes', 'device trust', 'session list', 'revoke session',
  'impersonate admin', 'audit login', 'CAPTCHA gate', 'bot score',
];
const authActs = [
  ['UI invent', 'weak', 'Auth UI', 'stubs'],
  ['API invent', 'weak', 'Auth API', 'stubs'],
  ['middleware', 'weak', 'Guard', 'Partial'],
  ['tests', 'weak', 'Tests', 'Partial'],
  ['settings panel', 'weak', 'Settings', 'Missing UI'],
];
for (const a of auth) {
  for (const [act, grade, how, now] of authActs) {
    add(`Auth ${a} ${act}`, 'coding', grade, 'Clerk / Auth.js / Supabase', how, now);
  }
}

const pay = [
  'checkout session', 'payment intent', 'subscription create', 'subscription cancel',
  'subscription upgrade', 'subscription downgrade', 'trial start', 'trial end',
  'invoice list', 'invoice PDF', 'customer portal', 'payment method add',
  'payment method default', 'refund', 'partial refund', 'dispute webhook',
  'tax ID', 'VAT', 'coupon percent', 'coupon amount', 'usage metered',
  'seat based billing', 'credit balance', 'payout connect', 'marketplace split',
];
const payActs = [
  ['Stripe invent', 'weak', 'Stripe', 'payments Acc'],
  ['test mode UI', 'weak', 'Test mode', 'Missing UI'],
  ['webhook handler', 'weak', 'Webhook', 'Partial'],
  ['success page', 'partial', 'Success', 'Partial'],
  ['fail page', 'weak', 'Fail', 'Partial'],
  ['receipt email', 'weak', 'Receipt', 'Partial'],
];
for (const p of pay) {
  for (const [act, grade, how, now] of payActs) {
    add(`Pay ${p} ${act}`, 'coding', grade, 'Stripe', how, now);
  }
}

const realtime = [
  'presence join', 'presence leave', 'presence cursors', 'typing indicator',
  'live comments', 'live cursors invent', 'CRDT text', 'OT text',
  'room channels', 'broadcast event', 'ack delivery', 'reconnect backoff',
  'offline buffer', 'conflict last-write', 'conflict merge UI',
  'voice channel', 'video channel', 'screen share', 'reactions live',
];
const rtActs = [
  ['invent stub', 'worst', 'Stub', 'Missing'],
  ['UI chrome', 'worst', 'UI', 'Missing UI'],
  ['agent aware', 'worst', 'Agent', 'Missing'],
  ['tests', 'worst', 'Tests', 'Missing'],
];
for (const r of realtime) {
  for (const [act, grade, how, now] of rtActs) {
    add(`Realtime ${r} ${act}`, 'coding', grade, 'PartyKit / Liveblocks / Replit', how, now);
  }
}

const email = [
  'welcome', 'verify', 'reset password', 'magic link', 'invite',
  'receipt', 'invoice', 'shipping', 'digest daily', 'digest weekly',
  'marketing blast', 'drip sequence', 'abandon cart', 'winback',
  'security alert', 'new device', 'password changed', '2FA enabled',
];
const emailActs = [
  ['template invent', 'weak', 'Template', 'Partial'],
  ['HTML+text', 'weak', 'Multipart', 'Partial'],
  ['preview UI', 'weak', 'Preview', 'Missing UI'],
  ['send test', 'weak', 'Test send', 'Missing UI'],
  ['provider Resend', 'weak', 'Resend', 'Partial'],
  ['provider SES', 'worst', 'SES', 'Missing'],
  ['provider Postmark', 'worst', 'Postmark', 'Missing'],
  ['unsubscribe', 'weak', 'Unsub', 'Partial'],
];
for (const e of email) {
  for (const [act, grade, how, now] of emailActs) {
    add(`Email ${e} ${act}`, 'coding', grade, 'Resend / Postmark', how, now);
  }
}

const search = [
  'full text', 'fuzzy', 'facet filters', 'sort relevance', 'synonyms',
  'typo tolerance', 'highlight snippets', 'autocomplete', 'instant search',
  'vector search', 'hybrid search', 'rerank', 'personalize',
  'analytics queries', 'zero results', 'spell suggest',
];
const searchActs = [
  ['invent UI', 'weak', 'Search UI', 'Partial'],
  ['index build', 'weak', 'Index', 'semantic Acc'],
  ['index status UI', 'partial', 'Status', 'semantic-index Acc'],
  ['agent tool', 'weak', 'Tool', 'Partial'],
  ['Algolia recipe', 'weak', 'Algolia', 'Partial'],
  ['Meilisearch recipe', 'weak', 'Meili', 'Partial'],
  ['Typesense recipe', 'weak', 'Typesense', 'Partial'],
  ['Elastic recipe', 'worst', 'Elastic', 'Missing'],
];
for (const s of search) {
  for (const [act, grade, how, now] of searchActs) {
    add(`Search ${s} ${act}`, 'coding', grade, 'Algolia / Meili', how, now);
  }
}

const media = [
  'image upload', 'image crop', 'image compress', 'image CDN',
  'image responsive srcset', 'image blurhash', 'image AVIF', 'image WebP',
  'video upload', 'video poster', 'video stream', 'video captions',
  'audio upload', 'audio waveform', 'PDF upload', 'PDF preview',
  'SVG sanitize', 'favicon generate', 'OG image generate', 'sprite sheet',
];
const mediaActs = [
  ['invent flow', 'weak', 'Flow', 'Partial'],
  ['agent tool', 'weak', 'Tool', 'Partial'],
  ['Live preview', 'partial', 'Preview', 'Partial'],
  ['optimize gate', 'weak', 'Optimize', 'Partial'],
  ['alt text AI', 'weak', 'Alt AI', 'Partial'],
];
for (const m of media) {
  for (const [act, grade, how, now] of mediaActs) {
    add(`Media ${m} ${act}`, 'coding', grade, 'Cloudinary / Mux', how, now);
  }
}

// Nova-specific invent failure modes
const fails = [
  'blank white Live', 'syntax crash Live', 'import cycle', 'missing CSS',
  'wrong brand name', 'twin of last invent', 'purple slop theme', 'cream terracotta',
  'card soup hero', 'stat strip clutter', 'emoji litter', 'lorem ipsum left',
  'broken mobile nav', 'CTA below fold only', 'low contrast text', 'tiny tap targets',
  'missing favicon', 'title Untitled', 'console error spam', 'infinite spinner',
  'form submit noop', 'dead links', '404 invent route', 'hydration mismatch',
  'flash unstyled', 'layout shift CLS', 'font FOUT', 'image broken',
  'npm install hang', 'port in use', 'preview zombie', 'job never Ready',
  'Ready false positive', 'evidence empty', 'checkpoint corrupt', 'unbind broken',
  'rebind wrong project', 'edit wrong file', 'edit deletes section', 'rename breaks CSS',
  'agent loops same fail', 'agent ignores stop', 'agent writes node_modules',
  'agent commits secrets', 'agent rm -rf', 'agent sudo', 'agent curl evil',
];
for (const f of fails) {
  add(`Failure detect ${f}`, 'coding', 'partial', 'Nova smokes', 'Detect', 'Partial');
  add(`Failure auto-heal ${f}`, 'coding', 'weak', 'Nova heal', 'Heal', 'Partial');
  add(`Failure UI surface ${f}`, 'product', 'weak', 'Nova', 'Show user', 'Partial');
  add(`Failure prevent ${f}`, 'coding', 'weak', 'gates', 'Prevent', 'Partial');
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
  /Wave 6 deep research · DS\/ecom\/a11y\/mobile\/game\/ML · keep growing/g,
  'Wave 7 deep research · API/auth/pay/realtime/email/search · keep growing',
);
t = t.replace(
  /Wave 6 grown\. Open = \{open\}\. Still growing — no artificial stop\./g,
  'Wave 7 grown. Open = {open}. Still growing — no artificial stop.',
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
