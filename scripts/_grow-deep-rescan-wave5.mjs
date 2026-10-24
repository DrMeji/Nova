/**
 * Wave 5 — another saturation pass. Coding workflows + languages + frameworks.
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

const langs = [
  'TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java', 'Kotlin',
  'Swift', 'C#', 'C++', 'C', 'Ruby', 'PHP', 'Elixir', 'Haskell', 'Scala',
  'Dart', 'Zig', 'Nim', 'Lua', 'R', 'Julia', 'SQL', 'GraphQL', 'Protobuf',
  'Terraform', 'HCL', 'Bash', 'PowerShell', 'WASM', 'Solidity',
];
const langAspects = [
  ['syntax highlight', 'partial', 'Highlight', 'Partial'],
  ['format on save', 'weak', 'Format', 'Partial'],
  ['lint diagnostics', 'weak', 'Lint', 'Partial'],
  ['typecheck', 'weak', 'Types', 'Partial'],
  ['test runner', 'weak', 'Tests', 'Partial'],
  ['debug adapter', 'worst', 'Debug', 'Missing'],
  ['refactor rename', 'weak', 'Rename', 'Partial'],
  ['package install', 'weak', 'Packages', 'Partial'],
  ['REPL / playground', 'worst', 'REPL', 'Missing'],
  ['doc hover', 'weak', 'Hover docs', 'Partial'],
];
for (const lang of langs) {
  for (const [asp, grade, how, now] of langAspects) {
    add(`Lang ${lang} ${asp}`, 'coding', grade, 'IDE field', how, now);
  }
}

const frameworks = [
  'React', 'Vue', 'Svelte', 'Solid', 'Angular', 'Next.js', 'Nuxt', 'Remix',
  'Astro', 'SvelteKit', 'Qwik', 'HTMX', 'Alpine', 'Ember', 'Preact',
  'React Native', 'Expo', 'Flutter', 'Electron', 'Tauri', 'Capacitor',
  'Express', 'Fastify', 'Hono', 'NestJS', 'Django', 'Flask', 'FastAPI',
  'Rails', 'Laravel', 'Spring', 'ASP.NET', 'Phoenix', 'Actix', 'Axum',
  'Three.js', 'R3F', 'Babylon', 'PixiJS', 'Phaser', 'Godot GDScript',
  'Unity C#', 'Unreal Blueprints', 'TensorFlow', 'PyTorch', 'scikit-learn',
];
const fwAspects = [
  ['scaffold invent', 'weak', 'Scaffold', 'Partial'],
  ['hot reload Live', 'partial', 'HMR', 'novaPreview soft'],
  ['route invent', 'weak', 'Routes', 'Partial'],
  ['state store invent', 'weak', 'State', 'Partial'],
  ['form invent', 'weak', 'Forms', 'Partial'],
  ['auth invent', 'weak', 'Auth', 'stubs'],
  ['data fetch invent', 'weak', 'Fetch', 'Partial'],
  ['SSR/SSG invent', 'weak', 'SSR', 'Vite SPA'],
  ['test harness', 'weak', 'Tests', 'Partial'],
  ['deploy recipe', 'weak', 'Deploy', 'deploy Acc'],
];
for (const fw of frameworks) {
  for (const [asp, grade, how, now] of fwAspects) {
    add(`Framework ${fw} ${asp}`, 'coding', grade, fw, how, now);
  }
}

const pkgManagers = ['npm', 'pnpm', 'yarn', 'bun', 'pip', 'uv', 'poetry', 'cargo', 'go mod', 'maven', 'gradle', 'composer', 'gem', 'nuget'];
const pkgActs = [
  ['install deps', 'partial', 'Install', 'autoInstall soft'],
  ['add package', 'weak', 'Add pkg', 'Partial'],
  ['remove package', 'weak', 'Remove pkg', 'Partial'],
  ['update package', 'weak', 'Update', 'Partial'],
  ['outdated list UI', 'weak', 'Outdated', 'Partial'],
  ['lockfile sync', 'partial', 'Lockfile', 'Partial'],
  ['workspace monorepo', 'weak', 'Workspaces', 'Partial'],
  ['script run UI', 'partial', 'npm scripts', 'Partial'],
];
for (const pm of pkgManagers) {
  for (const [a, grade, how, now] of pkgActs) {
    add(`Pkg ${pm} ${a}`, 'coding', grade, pm, how, now);
  }
}

const db = [
  'Postgres', 'MySQL', 'SQLite', 'MongoDB', 'Redis', 'DynamoDB', 'Firestore',
  'Supabase', 'PlanetScale', 'Neon', 'Turso', 'ClickHouse', 'Elasticsearch',
  'Pinecone', 'Weaviate', 'Chroma', 'Qdrant', 'Neo4j', 'Cassandra',
];
const dbActs = [
  ['schema invent', 'weak', 'Schema', 'Partial'],
  ['migrate up', 'weak', 'Migrate', 'Missing UI'],
  ['migrate down gated', 'worst', 'Migrate down', 'Missing'],
  ['seed data', 'weak', 'Seed', 'Partial'],
  ['query console', 'worst', 'SQL console', 'Missing'],
  ['ERD diagram', 'worst', 'ERD', 'Missing'],
  ['backup export', 'worst', 'Backup', 'Missing'],
  ['row-level security', 'weak', 'RLS', 'Partial'],
];
for (const d of db) {
  for (const [a, grade, how, now] of dbActs) {
    add(`DB ${d} ${a}`, 'coding', grade, d, how, now);
  }
}

const css = [
  'Tailwind', 'CSS Modules', 'styled-components', 'Emotion', 'Vanilla Extract',
  'Sass', 'Less', 'PostCSS', 'UnoCSS', 'Panda CSS', 'Open Props', 'Bootstrap',
  'Bulma', 'Foundation', 'MUI', 'Chakra', 'Mantine', 'Ant Design', 'shadcn',
];
const cssActs = [
  ['token invent', 'partial', 'Tokens', 'craft'],
  ['theme switch', 'weak', 'Theme', 'Partial'],
  ['responsive utilities', 'partial', 'Responsive', 'craft'],
  ['dark variant', 'weak', 'Dark', 'Partial'],
  ['purge unused', 'weak', 'Purge', 'Partial'],
  ['lint classes', 'weak', 'Lint', 'Partial'],
  ['design sync Figma', 'weak', 'Figma sync', 'figma Acc'],
];
for (const c of css) {
  for (const [a, grade, how, now] of cssActs) {
    add(`CSS ${c} ${a}`, 'coding', grade, c, how, now);
  }
}

const testFw = [
  'Vitest', 'Jest', 'Playwright', 'Cypress', 'Testing Library', 'Mocha',
  'AVA', 'Jasmine', 'pytest', 'unittest', 'Go test', 'JUnit', 'XCTest',
  'Detox', 'Appium', 'Storybook test', 'Chromatic', 'Percy', 'Checkly',
];
const testActs = [
  ['run all', 'weak', 'Run all', 'Partial'],
  ['run changed', 'weak', 'Run changed', 'Partial'],
  ['watch mode', 'weak', 'Watch', 'Partial'],
  ['coverage report', 'weak', 'Coverage', 'Partial'],
  ['fail fast', 'weak', 'Fail fast', 'Partial'],
  ['snapshot update gated', 'weak', 'Snapshots', 'Partial'],
  ['flake retry', 'weak', 'Flake retry', 'Partial'],
  ['CI shard', 'worst', 'Shard', 'Missing'],
];
for (const tf of testFw) {
  for (const [a, grade, how, now] of testActs) {
    add(`Test ${tf} ${a}`, 'coding', grade, tf, how, now);
  }
}

const devops = [
  'GitHub Actions', 'GitLab CI', 'CircleCI', 'Buildkite', 'Jenkins',
  'Azure Pipelines', 'Bitbucket Pipelines', 'Drone', 'Woodpecker',
  'Docker Compose', 'Kubernetes', 'Helm', 'Argo CD', 'Flux',
  'Terraform', 'Pulumi', 'Ansible', 'Nomad', 'Packer',
];
const devopsActs = [
  ['pipeline invent', 'weak', 'Pipeline', 'Partial'],
  ['status badge', 'weak', 'Badge', 'Partial'],
  ['fail notify', 'weak', 'Notify', 'Partial'],
  ['autofix from fail', 'weak', 'Autofix', 'ci-autofix Acc'],
  ['secrets inject gated', 'weak', 'Secrets', 'Partial'],
  ['matrix builds', 'worst', 'Matrix', 'Missing'],
  ['cache deps', 'weak', 'Cache', 'Partial'],
  ['artifact upload', 'weak', 'Artifacts', 'Partial'],
];
for (const d of devops) {
  for (const [a, grade, how, now] of devopsActs) {
    add(`DevOps ${d} ${a}`, 'coding', grade, d, how, now);
  }
}

// Chat UX micro
const chatBits = [
  ['message edit resend', 'partial', 'Edit msg', 'Partial'],
  ['message delete', 'partial', 'Delete msg', 'Partial'],
  ['message copy', 'strong', 'Copy', 'wired'],
  ['message quote reply', 'weak', 'Quote', 'Partial'],
  ['message react', 'worst', 'React', 'Missing'],
  ['thread rename', 'partial', 'Rename', 'Partial'],
  ['thread archive', 'weak', 'Archive', 'Partial'],
  ['thread pin', 'weak', 'Pin', 'Partial'],
  ['thread search', 'weak', 'Search threads', 'Partial'],
  ['thread tags', 'worst', 'Tags', 'Missing'],
  ['thread share read-only', 'worst', 'Share', 'Missing'],
  ['composer voice hold', 'partial', 'Voice', 'voiceSession'],
  ['composer attach camera', 'worst', 'Camera', 'Missing'],
  ['composer @file fuzzy', 'strong', 'Mentions', 'wired'],
  ['composer @folder', 'weak', 'Folder mention', 'Partial'],
  ['composer @symbol', 'weak', 'Symbol mention', 'Partial'],
  ['composer /slash fuzzy', 'strong', 'Slash', 'wired'],
  ['composer draft autosave', 'partial', 'Draft', 'Partial'],
  ['composer undo text', 'partial', 'Undo text', 'Partial'],
  ['composer markdown preview', 'weak', 'MD preview', 'Partial'],
  ['composer code block insert', 'partial', 'Code insert', 'Partial'],
  ['composer table insert', 'worst', 'Table', 'Missing'],
  ['composer emoji picker', 'worst', 'Emoji', 'Missing'],
  ['streaming cancel button', 'strong', 'Cancel', 'wired'],
  ['streaming retry button', 'partial', 'Retry', 'Partial'],
  ['streaming token count live', 'partial', 'Tokens live', 'TokenUsageRing'],
];
for (const [cap, grade, how, now] of chatBits) {
  add(`Chat UX ${cap}`, 'product', grade, 'ChatGPT / Cursor', how, now);
}

// Live preview micro
const liveBits = [
  ['device phone frame', 'partial', 'Phone frame', 'Partial'],
  ['device tablet frame', 'weak', 'Tablet', 'Partial'],
  ['device desktop frame', 'partial', 'Desktop', 'Partial'],
  ['rotate landscape', 'weak', 'Rotate', 'Partial'],
  ['network throttle 3G', 'worst', 'Throttle', 'Missing'],
  ['network offline', 'worst', 'Offline', 'Missing'],
  ['console filter errors', 'partial', 'Console filter', 'Partial'],
  ['console clear', 'partial', 'Clear console', 'Partial'],
  ['network panel requests', 'weak', 'Network panel', 'Partial'],
  ['storage localStorage view', 'weak', 'Storage', 'Partial'],
  ['cookies view', 'worst', 'Cookies', 'Missing'],
  ['reload hard', 'partial', 'Hard reload', 'Partial'],
  ['open external browser', 'partial', 'External', 'Partial'],
  ['copy preview URL', 'partial', 'Copy URL', 'Partial'],
  ['QR code preview phone', 'worst', 'QR', 'Missing'],
  ['element inspect highlight', 'weak', 'Inspect', 'Partial'],
  ['element edit text live', 'weak', 'Edit text', 'Partial'],
  ['element edit style live', 'weak', 'Edit style', 'Partial'],
  ['measure spacing overlay', 'worst', 'Measure', 'Missing'],
  ['grid overlay', 'worst', 'Grid', 'Missing'],
  ['ruler overlay', 'worst', 'Ruler', 'Missing'],
  ['color picker from preview', 'weak', 'Eyedropper', 'Partial'],
  ['accessibility tree view', 'worst', 'A11y tree', 'Missing'],
  ['landmark outline', 'weak', 'Landmarks', 'a11y Acc'],
];
for (const [cap, grade, how, now] of liveBits) {
  add(`Live UX ${cap}`, 'product', grade, 'Chrome DevTools / Framer', how, now);
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
  /Wave 4 deep research · keep growing · coding-first/g,
  'Wave 5 deep research · langs/frameworks/devops · keep growing',
);
t = t.replace(
  /Wave 4 grown\. Open = \{open\}\. Keep researching; place UI when you say go\./g,
  'Wave 5 grown. Open = {open}. Still growing — no artificial stop.',
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
