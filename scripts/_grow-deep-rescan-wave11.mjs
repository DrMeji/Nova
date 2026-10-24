/**
 * Wave 11 — keep going: npm scripts, env vars, config files, monorepo, release.
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

const scripts = [
  'dev', 'build', 'preview', 'start', 'test', 'test:watch', 'test:e2e',
  'lint', 'lint:fix', 'format', 'typecheck', 'check', 'ci',
  'storybook', 'build-storybook', 'analyze', 'size', 'release',
  'db:migrate', 'db:seed', 'db:studio', 'gen', 'clean', 'postinstall',
];
for (const s of scripts) {
  add(`Script npm run ${s} invent`, 'coding', 'partial', 'npm', 'Script', 'Partial');
  add(`Script npm run ${s} from UI`, 'product', 'weak', 'IDE', 'Run UI', 'Missing UI');
  add(`Script npm run ${s} agent`, 'coding', 'partial', 'agent', 'Agent run', 'Partial');
  add(`Script npm run ${s} gate CI`, 'coding', 'weak', 'CI', 'CI gate', 'Partial');
}

const envKeys = [
  'NODE_ENV', 'VITE_API_URL', 'DATABASE_URL', 'DIRECT_URL', 'REDIS_URL',
  'AUTH_SECRET', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL', 'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET',
  'STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET',
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'TOGETHER_API_KEY',
  'SENTRY_DSN', 'POSTHOG_KEY', 'GA_MEASUREMENT_ID', 'RESEND_API_KEY',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'S3_BUCKET',
  'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'PUBLIC_APP_URL', 'PORT',
];
for (const e of envKeys) {
  add(`Env ${e} in .env.example`, 'coding', 'weak', 'field', 'Example', 'Partial');
  add(`Env ${e} never commit`, 'coding', 'partial', 'security', 'Guard', 'Partial');
  add(`Env ${e} settings UI`, 'product', 'weak', 'field', 'UI', 'Missing UI');
  add(`Env ${e} agent redact`, 'coding', 'partial', 'security', 'Redact', 'Partial');
}

const configs = [
  'tsconfig.json', 'jsconfig.json', 'vite.config.ts', 'vite.config.js',
  'next.config.js', 'next.config.mjs', 'nuxt.config.ts', 'astro.config.mjs',
  'svelte.config.js', 'remix.config.js', 'tailwind.config.js', 'tailwind.config.ts',
  'postcss.config.js', 'eslint.config.js', 'eslint.config.mjs', '.eslintrc',
  'prettier.config.js', '.prettierrc', 'vitest.config.ts', 'playwright.config.ts',
  'cypress.config.ts', 'jest.config.js', 'babel.config.js', 'webpack.config.js',
  'rollup.config.js', 'esbuild.config.js', 'turbo.json', 'nx.json', 'pnpm-workspace.yaml',
  'lerna.json', 'docker-compose.yml', 'Dockerfile', '.dockerignore',
  '.gitignore', '.gitattributes', '.editorconfig', '.nvmrc', '.node-version',
  'components.json', 'drizzle.config.ts', 'prisma/schema.prisma',
  'openapi.yaml', 'graphql.schema', 'wrangler.toml', 'vercel.json', 'netlify.toml',
  'fly.toml', 'railway.json', 'render.yaml', 'Procfile', 'app.json',
];
for (const c of configs) {
  add(`Config ${c} invent`, 'coding', 'partial', 'field', 'Invent file', 'Partial');
  add(`Config ${c} validate`, 'coding', 'weak', 'field', 'Validate', 'Partial');
  add(`Config ${c} edit surgical`, 'coding', 'partial', 'agent', 'Edit', 'Partial');
  add(`Config ${c} explain Ask`, 'coding', 'partial', 'Ask', 'Explain', 'plainChatAsk');
}

const mono = [
  'apps/web', 'apps/api', 'apps/docs', 'apps/admin', 'packages/ui',
  'packages/config', 'packages/tsconfig', 'packages/eslint-config',
  'packages/utils', 'packages/db', 'packages/auth', 'packages/api-client',
];
for (const m of mono) {
  add(`Monorepo ${m} invent`, 'coding', 'weak', 'Turborepo / Nx', 'Package', 'Partial');
  add(`Monorepo ${m} depend`, 'coding', 'weak', 'workspace', 'Deps', 'Partial');
  add(`Monorepo ${m} build order`, 'coding', 'weak', 'turbo', 'Pipeline', 'Partial');
  add(`Monorepo ${m} agent scope`, 'coding', 'weak', 'agent', 'Scope edits', 'Partial');
}

const release = [
  'semver bump patch', 'semver bump minor', 'semver bump major',
  'changelog generate', 'tag create', 'GitHub release', 'npm publish gated',
  'version in package.json', 'version in UI', 'migration notes',
  'breaking change callout', 'deprecation warn', 'rollback tag',
];
for (const r of release) {
  add(`Release ${r}`, 'coding', 'weak', 'changesets / semantic-release', r, 'Partial');
  add(`Release ${r} UI`, 'product', 'worst', 'field', 'UI', 'Missing UI');
}

// Browser APIs invent
const webApis = [
  'localStorage', 'sessionStorage', 'IndexedDB', 'Cache Storage',
  'Service Worker', 'Web Worker', 'Shared Worker', 'BroadcastChannel',
  'IntersectionObserver', 'ResizeObserver', 'MutationObserver',
  'Clipboard API', 'File System Access', 'Web Share', 'Web Locks',
  'Notification API', 'Push API', 'Geolocation', 'MediaDevices',
  'WebRTC', 'WebSocket', 'EventSource', 'fetch streaming',
  'AbortController', 'structuredClone', 'crypto.subtle', 'WebGPU',
];
for (const w of webApis) {
  add(`WebAPI ${w} invent use`, 'coding', 'weak', 'MDN', 'Use', 'Partial');
  add(`WebAPI ${w} polyfill note`, 'coding', 'weak', 'field', 'Polyfill', 'Partial');
  add(`WebAPI ${w} permission UI`, 'product', 'weak', 'browser', 'Permission', 'Partial');
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
  /Wave 10 deep research · WCAG\/HTTP\/layout\/type\/color · keep growing/g,
  'Wave 11 deep research · scripts/env/config/monorepo/WebAPI · keep growing',
);
t = t.replace(
  /Wave 10 grown\. Open = \{open\}\. Still growing — no artificial stop\./g,
  'Wave 11 grown. Open = {open}. Still growing — no artificial stop.',
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
