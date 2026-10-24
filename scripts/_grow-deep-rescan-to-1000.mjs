/**
 * Grow nova-deep-rescan past 1000 rows.
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

// —— Fine edit / apply / diff ——
const edit = [
  ['Search-replace with occurrence index', 'coding', 'weak', 'Claude', 'Nth occurrence edit', 'Soft unique'],
  ['Multi-file transaction rollback', 'coding', 'partial', 'Codex / Capstone', 'All-or-nothing apply', 'checkpoint'],
  ['Binary file edit refuse', 'coding', 'partial', 'field', 'Refuse binary edits', 'Partial'],
  ['Symlink invent follow policy', 'coding', 'weak', 'field', 'Symlink safety', 'Partial'],
  ['Hardlink invent edit guard', 'coding', 'worst', 'field', 'Hardlink guard', 'Missing'],
  ['Sparse checkout invent edit', 'coding', 'worst', 'git sparse', 'Sparse path edit', 'Missing'],
  ['LFS invent file handle', 'coding', 'worst', 'git LFS', 'LFS aware edits', 'Missing'],
  ['Submodule invent edit policy', 'coding', 'worst', 'git', 'Submodule rules', 'Missing'],
  ['Generated file invent skip', 'coding', 'partial', 'field', 'Skip dist/ generated', 'dont-touch'],
  ['Lockfile invent edit policy', 'coding', 'partial', 'field', 'Ask on lockfile', 'Partial'],
  ['Format-on-write invent', 'coding', 'weak', 'Prettier / Biome', 'Format after edit', 'Partial'],
  ['Organize imports invent', 'coding', 'weak', 'TS / ESLint', 'Auto import organize', 'Partial'],
  ['Rename symbol invent LSP', 'coding', 'weak', 'LSP rename', 'Workspace rename', 'Missing deep'],
  ['Extract function invent refactor', 'coding', 'weak', 'IDE refactor', 'Extract method', 'Partial'],
  ['Inline variable invent refactor', 'coding', 'weak', 'IDE', 'Inline var', 'Partial'],
  ['Move file invent update imports', 'coding', 'weak', 'IDE', 'Move+fix imports', 'Partial'],
  ['Dead import invent remove', 'coding', 'weak', 'ESLint', 'Remove unused imports', 'cleanup scripts'],
  ['Comment-only invent refuse', 'coding', 'partial', 'field', 'No comment-only PRs', 'Partial'],
  ['Whitespace-only invent refuse', 'coding', 'partial', 'field', 'No whitespace noise', 'Partial'],
  ['Copyright header invent preserve', 'coding', 'weak', 'field', 'Preserve headers', 'Partial'],
];
for (const r of edit) add(...r);

// —— Test / CI invent ——
const test = [
  ['Vitest invent unit gate', 'coding', 'partial', 'Vitest', 'Unit in loop', 'smokes'],
  ['Jest invent unit gate', 'coding', 'weak', 'Jest', 'Jest gate', 'Partial'],
  ['Playwright invent e2e invent', 'coding', 'weak', 'Playwright', 'E2E invent', 'CDP smokes'],
  ['Cypress invent e2e', 'coding', 'worst', 'Cypress', 'Cypress e2e', 'Missing'],
  ['Puppeteer invent e2e', 'coding', 'weak', 'Puppeteer', 'Puppeteer', 'CDP scripts'],
  ['Testing Library invent RTL', 'coding', 'weak', 'RTL', 'Component tests', 'Partial'],
  ['MSW invent API mocks', 'coding', 'worst', 'MSW', 'Mock Service Worker', 'Missing'],
  ['Testcontainers invent', 'coding', 'worst', 'Testcontainers', 'Real deps in tests', 'Missing'],
  ['k6 invent load tests', 'coding', 'worst', 'k6', 'Load testing', 'Missing'],
  ['Artillery invent load', 'coding', 'worst', 'Artillery', 'Load scripts', 'Missing'],
  ['GitHub Actions invent workflow', 'coding', 'weak', 'GHA', 'CI workflow invent', 'ci-autofix Acc'],
  ['GitLab CI invent yaml', 'coding', 'worst', 'GitLab', 'GitLab CI', 'Missing'],
  ['CircleCI invent config', 'coding', 'worst', 'CircleCI', 'Circle config', 'Missing'],
  ['Buildkite invent pipelines', 'coding', 'worst', 'Buildkite', 'Pipelines', 'Missing'],
  ['Jenkins invent freestyle', 'coding', 'worst', 'Jenkins', 'Jenkinsfile', 'Missing'],
  ['Nx invent monorepo tasks', 'coding', 'worst', 'Nx', 'Monorepo graph', 'Missing'],
  ['Turborepo invent cache', 'coding', 'weak', 'Turborepo', 'Task cache', 'Partial'],
  ['Bazel invent builds', 'coding', 'worst', 'Bazel', 'Hermetic builds', 'Missing'],
  ['Pants invent builds', 'coding', 'worst', 'Pants', 'Build system', 'Missing'],
  ['Earthly invent CI', 'coding', 'worst', 'Earthly', 'Earthfiles', 'Missing'],
];
for (const r of test) add(...r);

// —— Frontend craft invent ——
const fe = [
  ['Tailwind invent utility craft', 'product', 'strong', 'field / Nova', 'Utility CSS', 'index.css craft'],
  ['CSS Modules invent', 'product', 'weak', 'field', 'CSS modules', 'Partial'],
  ['Styled-components invent', 'product', 'worst', 'field', 'CSS-in-JS', 'Missing'],
  ['Emotion invent styles', 'product', 'worst', 'Emotion', 'Emotion CSS', 'Missing'],
  ['Vanilla Extract invent', 'product', 'worst', 'Vanilla Extract', 'Type-safe CSS', 'Missing'],
  ['Panda CSS invent', 'product', 'worst', 'Panda', 'CSS-in-JS zero-rt', 'Missing'],
  ['Shadcn invent components', 'product', 'weak', 'shadcn/ui', 'Copy components', 'Partial'],
  ['Radix invent primitives', 'product', 'weak', 'Radix', 'A11y primitives', 'Partial'],
  ['Headless UI invent', 'product', 'weak', 'Headless UI', 'Headless comps', 'Partial'],
  ['Ark UI invent', 'product', 'worst', 'Ark', 'Headless', 'Missing'],
  ['React Aria invent', 'product', 'weak', 'Adobe RAC', 'Aria hooks', 'Partial'],
  ['Framer Motion invent', 'product', 'partial', 'Framer Motion', 'Motion craft', 'craft motion'],
  ['GSAP invent motion', 'product', 'worst', 'GSAP', 'Timeline motion', 'Missing'],
  ['Three.js invent 3D', 'product', 'worst', 'Three.js', '3D invent', 'Missing'],
  ['R3F invent React Three', 'product', 'worst', 'R3F', 'R3F invent', 'Missing'],
  ['D3 invent charts', 'product', 'weak', 'D3', 'Custom charts', 'Partial'],
  ['Recharts invent charts', 'product', 'weak', 'Recharts', 'React charts', 'Partial'],
  ['Chart.js invent', 'product', 'weak', 'Chart.js', 'Charts', 'Partial'],
  ['Mapbox invent maps', 'product', 'worst', 'Mapbox', 'Maps invent', 'Missing'],
  ['Leaflet invent maps', 'product', 'worst', 'Leaflet', 'Maps', 'Missing'],
  ['TipTap invent rich text', 'product', 'worst', 'TipTap', 'Editor invent', 'Missing'],
  ['ProseMirror invent editor', 'product', 'worst', 'ProseMirror', 'Editor core', 'Missing'],
  ['CodeMirror invent embed', 'product', 'partial', 'CodeMirror', 'Embed editor', 'CodeEditor'],
  ['Monaco invent embed', 'product', 'partial', 'Monaco', 'VS editor embed', 'Partial'],
  ['Lexical invent editor', 'product', 'worst', 'Lexical', 'Meta editor', 'Missing'],
  ['Plate invent editor', 'product', 'worst', 'Plate', 'Slate kits', 'Missing'],
];
for (const r of fe) add(...r);

// —— Mobile / desktop invent ——
const mobile = [
  ['Expo invent managed', 'coding', 'weak', 'Expo / Bolt', 'Expo apps', 'mobile stub'],
  ['Expo Router invent', 'coding', 'worst', 'Expo Router', 'File routes mobile', 'Missing'],
  ['EAS invent build cloud', 'coding', 'worst', 'EAS', 'Cloud mobile builds', 'Missing'],
  ['Capacitor invent hybrid', 'coding', 'worst', 'Capacitor', 'Hybrid apps', 'Missing'],
  ['Ionic invent hybrid', 'coding', 'worst', 'Ionic', 'Ionic apps', 'Missing'],
  ['Tauri invent desktop', 'coding', 'weak', 'Tauri', 'Rust desktop shell', 'Electron Nova'],
  ['Electron invent app product', 'coding', 'strong', 'Nova / Electron', 'Desktop shell', 'Nova itself'],
  ['Wails invent Go desktop', 'coding', 'worst', 'Wails', 'Go+web desktop', 'Missing'],
  ['Neutralino invent light', 'coding', 'worst', 'Neutralino', 'Light desktop', 'Missing'],
  ['PWA invent offline deep', 'product', 'partial', 'field', 'Service worker PWA', 'manifest Acc'],
  ['TWA invent Android wrap', 'coding', 'worst', 'Bubblewrap', 'Trusted Web Activity', 'Missing'],
  ['WatchOS invent companion', 'coding', 'worst', 'Apple', 'Watch apps', 'Missing'],
  ['Wear OS invent', 'coding', 'worst', 'Google', 'Wear apps', 'Missing'],
  ['tvOS invent apps', 'coding', 'worst', 'Apple', 'TV apps', 'Missing'],
  ['Android TV invent', 'coding', 'worst', 'Google', 'Android TV', 'Missing'],
];
for (const r of mobile) add(...r);

// —— Agent memory / context ——
const mem = [
  ['Long-term project memory invent', 'coding', 'partial', 'Cursor Memories', 'Persistent facts', 'threadBrain'],
  ['Session summary invent compress', 'coding', 'strong', 'field', 'Summarize old turns', 'elision'],
  ['User preference invent memory', 'coding', 'partial', 'field', 'Style prefs', 'localPrefs'],
  ['Team shared invent memory', 'coding', 'weak', 'Claude Team memory', 'Shared memory files', 'agent-memory Acc'],
  ['Episodic invent turn log', 'coding', 'partial', 'field', 'Episode logs', 'AgentTrace'],
  ['Semantic invent memory RAG', 'coding', 'weak', 'field', 'Embed past decisions', 'Partial'],
  ['Memory invent TTL expiry', 'coding', 'weak', 'field', 'Expire stale facts', 'Missing'],
  ['Memory invent conflict resolve', 'coding', 'weak', 'field', 'Contradict facts', 'Missing'],
  ['Memory invent export/import', 'coding', 'weak', 'field', 'Portable memory', 'Partial'],
  ['Memory invent redact secrets', 'coding', 'weak', 'field', 'Never store secrets', 'Partial'],
  ['Rules invent always-apply', 'coding', 'strong', 'Cursor Rules', 'Always rules', 'dont-touch / Acc'],
  ['Rules invent glob-scoped', 'coding', 'partial', 'Cursor Rules', 'Path-scoped rules', 'Partial'],
  ['Rules invent agent-requestable', 'coding', 'weak', 'Cursor', 'On-demand rules', 'Partial'],
  ['AGENTS.md invent convention', 'coding', 'partial', 'field', 'Repo agent guide', 'Partial'],
  ['CLAUDE.md invent convention', 'coding', 'partial', 'Claude Code', 'Claude project md', 'Partial'],
  ['GEMINI.md invent convention', 'coding', 'weak', 'Gemini CLI', 'Gemini project md', 'Partial'],
  ['.cursorrules invent legacy', 'coding', 'partial', 'Cursor', 'Legacy rules file', 'Partial'],
  ['Skills invent SKILL.md pack', 'coding', 'weak', 'Cursor Skills', 'Installable skills', 'Acc packs'],
  ['Hooks invent pre/post agent', 'coding', 'weak', 'Cursor Hooks', 'Lifecycle hooks', 'Partial'],
  ['Automations invent scheduled', 'coding', 'partial', 'Cursor / Nova', 'Scheduled agents', 'automations Acc'],
];
for (const r of mem) add(...r);

// —— Multi-agent orchestra ——
const orch = [
  ['Planner→Coder→Reviewer chain', 'coding', 'partial', 'ChatDev / MetaGPT', 'Role chain', 'ensemble parked'],
  ['Librarian invent research agent', 'coding', 'weak', 'Amp Oracle', 'Read-only research', 'Partial'],
  ['Oracle invent deep search', 'coding', 'weak', 'Amp', 'Deep codebase oracle', 'repo map'],
  ['Scribe invent doc agent', 'coding', 'weak', 'field', 'Docs-only agent', 'Partial'],
  ['Tester invent QA agent', 'coding', 'weak', 'field', 'Test-writing agent', 'smokes'],
  ['Security invent audit agent', 'coding', 'weak', 'field', 'Security pass agent', 'Partial'],
  ['Designer invent UI agent', 'product', 'partial', 'v0 / Nova craft', 'UI polish agent', 'coder gate'],
  ['PM invent requirements agent', 'coding', 'weak', 'MetaGPT', 'Requirements agent', 'create brief'],
  ['Critic invent adversarial review', 'coding', 'weak', 'field', 'Adversarial critic', 'host judge'],
  ['Arbiter invent vote merge', 'coding', 'weak', 'ensemble', 'Merge proposals', 'parked'],
  ['Supervisor invent escalate', 'coding', 'partial', 'field', 'Escalate to human', 'Plan/Act'],
  ['Worker pool invent parallel', 'coding', 'weak', 'HAR / Cursor', 'Parallel workers', 'Partial'],
  ['Worktree invent isolation', 'coding', 'partial', 'HAR / Capstone', 'Per-task worktree', 'Partial'],
  ['Mailbox invent agent messages', 'coding', 'weak', 'field', 'Inter-agent mail', 'coding-mailbox Acc'],
  ['Shared blackboard invent state', 'coding', 'weak', 'field', 'Shared state board', 'Partial'],
  ['Token budget invent per agent', 'coding', 'partial', 'field', 'Per-seat budgets', 'budget'],
  ['Timeout invent per agent', 'coding', 'partial', 'field', 'Seat timeouts', 'stall watch'],
  ['Retry invent with backoff', 'coding', 'partial', 'field', 'Retry policy', 'doom-loop'],
  ['Circuit breaker invent agent', 'coding', 'strong', 'Nova', 'Stop after fails', 'doom-loop breaker'],
  ['Human-in-loop invent gate', 'coding', 'strong', 'Capstone / Nova', 'Ask before act', 'Plan/Act'],
];
for (const r of orch) add(...r);

// —— Product polish invent ——
const polish = [
  ['Hero full-bleed invent rule', 'product', 'strong', 'Nova craft', 'Full-bleed hero', 'craft rules'],
  ['Brand-first invent rule', 'product', 'strong', 'Nova craft', 'Brand hero signal', 'craft rules'],
  ['No-card-hero invent rule', 'product', 'strong', 'Nova craft', 'No cards in hero', 'craft rules'],
  ['Motion invent 2–3 intentional', 'product', 'strong', 'Nova craft', 'Presence motion', 'craft rules'],
  ['Avoid purple-bias invent', 'product', 'strong', 'Nova craft', 'Anti-AI-slop colors', 'craft rules'],
  ['Typography invent expressive', 'product', 'strong', 'Nova craft', 'Non-system fonts', 'craft rules'],
  ['Atmosphere invent gradients', 'product', 'strong', 'Nova craft', 'Non-flat bg', 'craft rules'],
  ['One-composition invent viewport', 'product', 'strong', 'Nova craft', 'Single composition', 'craft rules'],
  ['Mobile invent responsive gate', 'product', 'strong', 'Nova', 'Mobile layout', 'Live+craft'],
  ['Dark mode invent optional', 'product', 'partial', 'field', 'Theme toggle', 'Partial'],
  ['Print invent stylesheet', 'product', 'worst', 'field', 'Print CSS', 'Missing'],
  ['Reduced-motion invent honor', 'product', 'partial', 'a11y', 'prefers-reduced-motion', 'Partial'],
  ['Contrast invent WCAG AA', 'product', 'partial', 'a11y', 'Contrast gate', 'a11y Acc'],
  ['Focus invent visible rings', 'product', 'partial', 'a11y', 'Focus styles', 'Partial'],
  ['Skip-link invent a11y', 'product', 'weak', 'a11y', 'Skip to content', 'Partial'],
  ['Landmark invent roles', 'product', 'partial', 'a11y', 'main/nav/footer', 'Partial'],
  ['Alt-text invent images', 'product', 'partial', 'a11y', 'Meaningful alt', 'Partial'],
  ['Form invent label associate', 'product', 'partial', 'a11y', 'Label/input', 'Partial'],
  ['Error invent live region', 'product', 'weak', 'a11y', 'aria-live errors', 'Partial'],
  ['Keyboard invent full path', 'product', 'partial', 'a11y', 'Keyboard UX', 'Partial'],
];
for (const r of polish) add(...r);

// —— Enterprise / governance ——
const ent = [
  ['SSO invent enterprise auth', 'product', 'worst', 'enterprise', 'SAML/OIDC', 'Missing'],
  ['SCIM invent user provision', 'product', 'worst', 'enterprise', 'SCIM sync', 'Missing'],
  ['Audit log invent coding', 'coding', 'weak', 'enterprise', 'Immutable audit', 'AgentTrace soft'],
  ['RBAC invent project roles', 'product', 'weak', 'enterprise', 'Role permissions', 'Partial'],
  ['Data retention invent policy', 'product', 'weak', 'enterprise', 'Retention windows', 'privacy settings'],
  ['Export invent GDPR pack', 'product', 'weak', 'enterprise', 'Data export', 'Partial'],
  ['Delete invent right-to-erasure', 'product', 'weak', 'enterprise', 'Hard delete', 'deleteProject'],
  ['SOC2 invent controls claim', 'product', 'worst', 'enterprise', 'Compliance pack', 'Missing'],
  ['HIPAA invent coding mode', 'coding', 'worst', 'enterprise', 'HIPAA mode', 'Missing'],
  ['FedRAMP invent path', 'product', 'worst', 'enterprise', 'FedRAMP', 'Missing'],
  ['VPC invent private models', 'coding', 'weak', 'enterprise', 'Private endpoints', 'local GGUF'],
  ['On-prem invent license', 'product', 'partial', 'enterprise', 'On-prem Desktop', 'Desktop app'],
  ['Airgap invent update channel', 'product', 'weak', 'enterprise', 'Offline updates', 'Partial'],
  ['License invent SPDX headers', 'coding', 'weak', 'field', 'License headers', 'Partial'],
  ['CLA invent contributor', 'coding', 'worst', 'field', 'CLA bots', 'Missing'],
  ['CODEOWNERS invent enforce', 'coding', 'weak', 'GitHub', 'CODEOWNERS', 'Partial'],
  ['Branch invent protection', 'coding', 'weak', 'GitHub', 'Protected branches', 'Partial'],
  ['Required invent checks', 'coding', 'weak', 'GitHub', 'Required CI', 'Partial'],
  ['Signed invent commits', 'coding', 'weak', 'git', 'GPG/SSH sign', 'Partial'],
  ['DCO invent signoff', 'coding', 'worst', 'git', 'DCO sign-off', 'Missing'],
];
for (const r of ent) add(...r);

// —— More tools / niches ——
const niche = [
  ['Replit Agent invent cloud IDE', 'coding', 'weak', 'Replit', 'Cloud agent IDE', 'Desktop invent'],
  ['StackBlitz invent WebContainers', 'coding', 'weak', 'StackBlitz', 'In-browser Node', 'Missing'],
  ['CodeSandbox invent AI', 'coding', 'weak', 'CodeSandbox', 'Sandbox AI', 'Missing'],
  ['Glitch invent remix', 'coding', 'worst', 'Glitch', 'Remix apps', 'Missing'],
  ['Val Town invent scripts', 'coding', 'worst', 'Val Town', 'Cloud scripts', 'Missing'],
  ['Deno Deploy invent', 'coding', 'worst', 'Deno', 'Deno deploy', 'Missing'],
  ['Bun invent runtime scaffold', 'coding', 'weak', 'Bun', 'Bun apps', 'npm/vite'],
  ['Node invent version pin', 'coding', 'partial', 'field', '.nvmrc invent', 'Partial'],
  ['pnpm invent workspace', 'coding', 'weak', 'pnpm', 'Workspace invent', 'Partial'],
  ['Yarn invent berry', 'coding', 'weak', 'Yarn', 'Yarn berry', 'Partial'],
  ['npm invent workspaces', 'coding', 'partial', 'npm', 'Workspaces', 'Partial'],
  ['Vite invent invent default', 'coding', 'strong', 'Nova', 'Vite SPA invent', 'freshSpa'],
  ['Webpack invent legacy', 'coding', 'worst', 'Webpack', 'Webpack scaffolds', 'Missing'],
  ['Rspack invent', 'coding', 'worst', 'Rspack', 'Rspack', 'Missing'],
  ['esbuild invent scripts', 'coding', 'weak', 'esbuild', 'Fast bundler', 'Partial'],
  ['Rollup invent lib', 'coding', 'weak', 'Rollup', 'Lib bundler', 'Partial'],
  ['tsup invent package', 'coding', 'weak', 'tsup', 'TS package build', 'Partial'],
  ['unbuild invent package', 'coding', 'worst', 'unbuild', 'Unified build', 'Missing'],
  ['Biome invent lint+format', 'coding', 'weak', 'Biome', 'All-in-one', 'eslint'],
  ['Oxc invent toolchain', 'coding', 'worst', 'Oxc', 'Rust JS toolchain', 'Missing'],
  ['Deno invent lint', 'coding', 'worst', 'Deno', 'Deno lint', 'Missing'],
  ['Rome invent legacy', 'coding', 'worst', 'Rome', 'Legacy Rome', 'Missing'],
  ['dprint invent format', 'coding', 'worst', 'dprint', 'dprint', 'Missing'],
  ['Lefthook invent git hooks', 'coding', 'weak', 'Lefthook', 'Git hooks', 'Partial'],
  ['Husky invent hooks', 'coding', 'weak', 'Husky', 'Husky hooks', 'Partial'],
  ['lint-staged invent', 'coding', 'weak', 'lint-staged', 'Staged lint', 'Partial'],
  ['Commitlint invent', 'coding', 'weak', 'commitlint', 'Conventional commits', 'Partial'],
  ['Changesets invent version', 'coding', 'weak', 'Changesets', 'Version packages', 'Partial'],
  ['Release Please invent', 'coding', 'worst', 'Release Please', 'Auto release', 'Missing'],
  ['semantic-release invent', 'coding', 'worst', 'semantic-release', 'Auto semver', 'Missing'],
  ['Conventional Changelog invent', 'coding', 'weak', 'field', 'Changelog gen', 'changelog.ts'],
];
for (const r of niche) add(...r);

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
fs.writeFileSync(path, t);
const g = (k) => [...t.matchAll(new RegExp(`nova: '${k}'`, 'g'))].length;
console.log({
  added: batch.length,
  rows: [...t.matchAll(/capability: '/g)].length,
  worst: g('worst'),
  weak: g('weak'),
  partial: g('partial'),
  strong: g('strong'),
  tools: new Set([...t.matchAll(/leader: '([^']+)'/g)].map((m) => m[1])).size,
});
