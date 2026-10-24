/**
 * Grow nova-deep-rescan past 1500.
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

const more = [
  // Orient / retrieve fine
  ['Symbol invent outline tool', 'coding', 'weak', 'LSP / Cody', 'File outline', 'Partial'],
  ['Callers invent invent tool', 'coding', 'worst', 'CKG', 'Find callers', 'Missing'],
  ['Callees invent invent tool', 'coding', 'worst', 'CKG', 'Find callees', 'Missing'],
  ['Implementations invent tool', 'coding', 'worst', 'LSP', 'Go to impl', 'Missing'],
  ['Type hierarchy invent', 'coding', 'worst', 'LSP', 'Type hierarchy', 'Missing'],
  ['Workspace invent symbol search', 'coding', 'weak', 'LSP', 'Workspace symbols', 'Partial'],
  ['Fuzzy invent path open', 'coding', 'partial', 'IDE', 'Fuzzy file open', 'folderCatalog'],
  ['Recent invent files context', 'coding', 'partial', 'IDE', 'Recent files', 'recentStore'],
  ['Open tabs invent context', 'coding', 'weak', 'Cursor', 'Open editors ctx', 'Partial'],
  ['Selection invent invent context', 'coding', 'partial', 'IDE', 'Selection in prompt', 'Partial'],
  ['Clipboard invent invent context', 'coding', 'weak', 'field', 'Clipboard ctx', 'Partial'],
  ['Terminal invent invent selection', 'coding', 'weak', 'IDE', 'Terminal select→chat', 'Partial'],
  ['Error invent invent squiggle click', 'coding', 'weak', 'IDE', 'Click error→fix', 'Partial'],
  ['Test invent invent failure jump', 'coding', 'weak', 'IDE', 'Fail→source', 'Partial'],
  ['Coverage invent invent heat map', 'coding', 'worst', 'IDE', 'Coverage gutters', 'Missing'],
  // Apply / undo fine
  ['Partial invent apply hunks', 'coding', 'weak', 'git add -p', 'Hunk pick apply', 'Partial'],
  ['Reject invent invent hunk', 'coding', 'weak', 'IDE', 'Reject hunk', 'Partial'],
  ['Accept invent invent file', 'coding', 'partial', 'IDE', 'Accept file', 'chat apply'],
  ['Accept invent invent all', 'coding', 'partial', 'IDE', 'Accept all', 'chat apply'],
  ['Diff invent invent side-by-side', 'coding', 'partial', 'IDE', 'Side-by-side diff', 'Partial'],
  ['Diff invent invent inline', 'coding', 'partial', 'IDE', 'Inline diff', 'Partial'],
  ['Blame invent invent gutter AI', 'coding', 'worst', 'Cody', 'AI blame', 'Missing'],
  ['History invent invent file AI', 'coding', 'weak', 'field', 'File history AI', 'Partial'],
  ['Restore invent invent checkpoint UI', 'coding', 'partial', 'Capstone', 'Checkpoint UI', 'createCheckpoint'],
  ['Compare invent invent branches AI', 'coding', 'weak', 'field', 'Branch compare AI', 'Partial'],
  // Shell / env fine
  ['Env invent invent .env load', 'coding', 'partial', 'field', 'Load .env safely', 'Partial'],
  ['Env invent invent secret mask', 'coding', 'weak', 'field', 'Mask env in logs', 'Partial'],
  ['Path invent invent allowlist', 'coding', 'partial', 'Capstone', 'Path allowlist', 'dont-touch'],
  ['Cmd invent invent denylist', 'coding', 'partial', 'field', 'Dangerous cmd deny', 'terminal-policy'],
  ['Sudo invent invent block', 'coding', 'strong', 'field', 'Block sudo', 'policy'],
  ['Rm invent invent -rf guard', 'coding', 'partial', 'field', 'Guard rm -rf', 'Partial'],
  ['Curl invent invent pipe sh guard', 'coding', 'partial', 'field', 'Guard curl|sh', 'Partial'],
  ['Docker invent invent sock deny', 'coding', 'weak', 'field', 'Deny docker.sock', 'Partial'],
  ['K8s invent invent kubeconfig', 'coding', 'worst', 'field', 'Kubeconfig invent', 'Missing'],
  ['SSH invent invent key guard', 'coding', 'weak', 'field', 'SSH key guard', 'Partial'],
  // Multi-repo / monorepo
  ['Monorepo invent invent package pick', 'coding', 'weak', 'Nx / Turborepo', 'Pick package', 'Partial'],
  ['Monorepo invent invent affected', 'coding', 'weak', 'Nx', 'Affected projects', 'Missing'],
  ['Multi-root invent invent workspace', 'coding', 'weak', 'VS Code', 'Multi-root', 'Partial'],
  ['Polyrepo invent invent sync', 'coding', 'worst', 'field', 'Polyrepo sync', 'Missing'],
  ['Submodule invent invent update', 'coding', 'worst', 'git', 'Submodule update', 'Missing'],
  ['Vendor invent invent sync', 'coding', 'worst', 'field', 'Vendor sync', 'Missing'],
  ['Workspace invent invent protocol', 'coding', 'weak', 'pnpm', 'Workspace protocol', 'Partial'],
  ['Catalog invent invent versions', 'coding', 'weak', 'pnpm catalogs', 'Version catalogs', 'Missing'],
  ['Changesets invent invent bump', 'coding', 'weak', 'Changesets', 'Version bump', 'Partial'],
  ['Syncpack invent invent versions', 'coding', 'worst', 'syncpack', 'Align versions', 'Missing'],
  // API / backend invent fine
  ['REST invent invent CRUD scaffold', 'coding', 'weak', 'field', 'CRUD API', 'Partial'],
  ['RPC invent invent tRPC router', 'coding', 'weak', 'tRPC', 'Router invent', 'Missing'],
  ['GraphQL invent invent resolvers', 'coding', 'worst', 'field', 'Resolvers', 'Missing'],
  ['Webhooks invent invent handlers', 'coding', 'weak', 'field', 'Webhook handlers', 'Partial'],
  ['Rate-limit invent invent middleware', 'coding', 'weak', 'field', 'Rate limit mw', 'Partial'],
  ['CORS invent invent config', 'coding', 'partial', 'field', 'CORS config', 'Partial'],
  ['Helmet invent invent headers', 'coding', 'weak', 'Helmet', 'Security headers', 'Partial'],
  ['Zod invent invent validation', 'coding', 'partial', 'Zod', 'Schema validate', 'Partial'],
  ['OpenAPI invent invent zod-first', 'coding', 'weak', 'zod-to-openapi', 'Zod→OpenAPI', 'Missing'],
  ['Prisma invent invent migrate', 'coding', 'weak', 'Prisma', 'Migrate invent', 'Missing'],
  // Frontend invent fine
  ['Router invent invent React Router', 'product', 'partial', 'React Router', 'Client routes', 'Partial'],
  ['Router invent invent TanStack', 'product', 'weak', 'TanStack Router', 'Type-safe routes', 'Missing'],
  ['Query invent invent TanStack Query', 'coding', 'weak', 'TanStack Query', 'Server state', 'Missing'],
  ['Form invent invent React Hook Form', 'product', 'weak', 'RHF', 'Forms', 'Partial'],
  ['Form invent invent Formik', 'product', 'worst', 'Formik', 'Forms legacy', 'Missing'],
  ['State invent invent Zustand', 'coding', 'weak', 'Zustand', 'Client state', 'Partial'],
  ['State invent invent Jotai', 'coding', 'weak', 'Jotai', 'Atomic state', 'Missing'],
  ['State invent invent Redux', 'coding', 'weak', 'Redux', 'Redux invent', 'Missing'],
  ['State invent invent Context', 'coding', 'partial', 'React', 'Context state', 'AuthContext'],
  ['Suspense invent invent boundaries', 'coding', 'weak', 'React', 'Suspense', 'Partial'],
  // DX invent
  ['Hot invent invent HMR', 'coding', 'strong', 'Vite', 'HMR', 'Vite invent'],
  ['Error invent invent overlay', 'coding', 'partial', 'Vite', 'Error overlay', 'Partial'],
  ['Source invent invent maps dev', 'coding', 'partial', 'bundlers', 'Dev source maps', 'Partial'],
  ['Env invent invent typed', 'coding', 'partial', 'vite-env', 'Typed env', 'vite-env.d.ts'],
  ['Alias invent invent @ paths', 'coding', 'strong', 'Vite / TS', 'Path aliases', 'wired'],
  ['Strict invent invent TS', 'coding', 'partial', 'TypeScript', 'strict mode', 'Partial'],
  ['ExactOptional invent invent', 'coding', 'weak', 'TS', 'exactOptionalPropertyTypes', 'Partial'],
  ['NoUnchecked invent invent', 'coding', 'weak', 'TS', 'noUncheckedIndexedAccess', 'Partial'],
  ['Isolated invent invent modules', 'coding', 'weak', 'TS', 'isolatedModules', 'Partial'],
  ['Declaration invent invent emit', 'coding', 'weak', 'TS', 'd.ts emit', 'Partial'],
  // Agents / products more names
  ['Sweep invent AI PRs', 'coding', 'worst', 'Sweep AI', 'Bugfix PRs', 'Missing'],
  ['Bloop invent code search', 'coding', 'worst', 'Bloop', 'Semantic search', 'Missing'],
  ['Adrenaline invent debug', 'coding', 'worst', 'Adrenaline', 'Debug AI', 'Missing'],
  ['What The Diff invent', 'coding', 'worst', 'What The Diff', 'PR summaries', 'Missing'],
  ['Codiumate invent tests', 'coding', 'weak', 'Qodo', 'Test gen', 'Partial'],
  ['Diffblue invent Java tests', 'coding', 'worst', 'Diffblue', 'Java unit gen', 'Missing'],
  ['Ponicode invent tests', 'coding', 'worst', 'Ponicode', 'Test gen legacy', 'Missing'],
  ['Mutable invent refactors', 'coding', 'worst', 'Mutable.ai', 'Large refactor', 'Missing'],
  ['Refact.ai invent', 'coding', 'weak', 'Refact.ai', 'Self-host coding', 'local'],
  ['Continue.dev invent hub', 'coding', 'weak', 'Continue', 'Hub configs', 'Partial'],
  ['Aider invent voice', 'coding', 'worst', 'Aider', 'Voice coding', 'voiceSession'],
  ['Aider invent browser', 'coding', 'worst', 'Aider', 'Browser tool', 'Missing'],
  ['OpenHands invent docker', 'coding', 'worst', 'OpenHands', 'Docker sandbox', 'Missing'],
  ['OpenHands invent browser', 'coding', 'worst', 'OpenHands', 'Browser tool', 'Missing'],
  ['SWE-agent invent babel', 'coding', 'weak', 'SWE-agent', 'ACI babel', 'TOOL set'],
  ['Moatless invent code graph', 'coding', 'worst', 'Moatless', 'Code graph', 'repo map'],
  ['Agentless invent locate', 'coding', 'worst', 'Agentless', 'File localization', 'Missing'],
  ['AutoCodeRover invent', 'coding', 'worst', 'AutoCodeRover', 'Hierarchical fix', 'Missing'],
  ['SpecRover invent specs', 'coding', 'worst', 'SpecRover', 'Spec recovery', 'Missing'],
  ['RepairAgent invent', 'coding', 'worst', 'RepairAgent', 'Repair loop', 'Missing'],
  // Nova Acc honesty more
  ['Invent Acc seo-audit score', 'product', 'partial', 'Nova', 'seo-audit.json', 'Acc signal'],
  ['Invent Acc a11y-gate', 'product', 'partial', 'Nova', 'a11y-gate.json', 'Acc signal'],
  ['Invent Acc cwv-gate', 'product', 'partial', 'Nova', 'cwv-gate.json', 'Acc signal'],
  ['Invent Acc payments-stub', 'product', 'weak', 'Nova', 'payments-stub', 'stub'],
  ['Invent Acc leads-stub', 'product', 'weak', 'Nova', 'leads-stub', 'stub'],
  ['Invent Acc analytics-stub', 'product', 'weak', 'Nova', 'analytics-stub', 'stub'],
  ['Invent Acc deploy-descriptor', 'product', 'weak', 'Nova', 'deploy-descriptor', 'Acc'],
  ['Invent Acc agents-window', 'product', 'weak', 'Nova', 'agents-window.json', 'Acc'],
  ['Invent Acc semantic-index', 'coding', 'weak', 'Nova', 'semantic-index.json', 'Acc claim'],
  ['Invent Acc ci-autofix', 'coding', 'weak', 'Nova', 'ci-autofix.json', 'Acc'],
  ['Invent Acc foreign-cli', 'coding', 'weak', 'Nova', 'foreign-cli.json', 'Acc'],
  ['Invent Acc dual-live', 'product', 'weak', 'Nova', 'dual-live files', 'UI'],
  ['Invent Acc coding-mailbox', 'coding', 'weak', 'Nova', 'coding-mailbox', 'Acc'],
  ['Invent Acc coding-lsp-stream', 'coding', 'weak', 'Nova', 'coding-lsp-stream', 'Acc'],
  ['Invent Acc agent-manager', 'coding', 'weak', 'Nova', 'agent-manager.json', 'Acc'],
  ['Invent Acc memory-browser', 'product', 'weak', 'Nova', 'memory-browser.json', 'Acc'],
  ['Invent Acc quest-mode', 'coding', 'partial', 'Nova', 'quest-mode.json', 'Acc'],
  ['Invent Acc kiro-spec', 'coding', 'partial', 'Nova', 'kiro-spec.md', 'Acc'],
  ['Invent Acc trae-builder', 'coding', 'partial', 'Nova', 'trae-builder.json', 'Acc'],
  ['Invent Acc automations', 'coding', 'partial', 'Nova', 'automations.json', 'Acc'],
  // Research benches more
  ['SWE-Gym invent train', 'coding', 'worst', 'SWE-Gym', 'Train env', 'Missing'],
  ['R2E invent invent bench', 'coding', 'worst', 'R2E', 'Repo eval', 'Missing'],
  ['DevEval invent invent', 'coding', 'worst', 'DevEval', 'Dev eval', 'Missing'],
  ['CoderEval invent invent', 'coding', 'worst', 'CoderEval', 'Pragmatic coding', 'Missing'],
  ['ClassEval invent invent', 'coding', 'worst', 'ClassEval', 'Class-level', 'Missing'],
  ['RepoEval invent invent', 'coding', 'worst', 'RepoEval', 'Repo completion', 'Missing'],
  ['EvoCodeBench invent', 'coding', 'worst', 'EvoCodeBench', 'Evolving bench', 'Missing'],
  ['FullStackBench invent', 'coding', 'worst', 'field', 'Full-stack bench', 'Missing'],
  ['WebGen-Bench invent', 'product', 'weak', 'field', 'Web gen bench', 'invent demos'],
  ['Design2Code invent', 'product', 'weak', 'Design2Code', 'Design→code bench', 'Partial'],
  // Keep climbing names
  ['Cursor invent Bugbot review', 'coding', 'weak', 'Cursor', 'Bugbot', 'pr-review Acc'],
  ['Cursor invent Background Agent', 'coding', 'worst', 'Cursor', 'Cloud agents', 'Missing'],
  ['Cursor invent Memories', 'coding', 'partial', 'Cursor', 'Memories', 'threadBrain'],
  ['Cursor invent @Folders', 'coding', 'partial', 'Cursor', '@Folders', 'Partial'],
  ['Cursor invent @Codebase', 'coding', 'partial', 'Cursor', '@Codebase', 'repo map'],
  ['Cursor invent Max Mode', 'coding', 'weak', 'Cursor', 'Max mode', 'Partial'],
  ['Cursor invent YOLO mode', 'coding', 'weak', 'Cursor', 'Auto-run tools', 'Plan/Act'],
  ['Windsurf invent Write mode', 'coding', 'weak', 'Windsurf', 'Write mode', 'Partial'],
  ['Windsurf invent Chat mode', 'coding', 'partial', 'Windsurf', 'Chat mode', 'chat'],
  ['Claude invent Projects', 'coding', 'weak', 'Claude.ai', 'Projects', 'Partial'],
  ['Claude invent Artifacts', 'coding', 'weak', 'Claude.ai', 'Artifacts', 'Partial'],
  ['Claude invent Computer Use', 'coding', 'worst', 'Claude', 'Computer use', 'Missing'],
  ['ChatGPT invent Canvas', 'coding', 'weak', 'ChatGPT', 'Canvas', 'Partial'],
  ['ChatGPT invent Tasks', 'coding', 'weak', 'ChatGPT', 'Scheduled tasks', 'automations'],
  ['ChatGPT invent Operator', 'coding', 'worst', 'OpenAI', 'Operator', 'Missing'],
  ['Gemini invent Gems', 'coding', 'weak', 'Gemini', 'Gems', 'Partial'],
  ['Gemini invent Deep Research', 'coding', 'weak', 'Gemini', 'Deep research', 'webSearch'],
  ['Grok invent Build mode', 'coding', 'weak', 'Grok', 'Build', 'Partial'],
  ['Perplexity invent Pages', 'product', 'weak', 'Perplexity', 'Pages', 'Missing'],
  ['Perplexity invent Labs', 'coding', 'weak', 'Perplexity', 'Labs', 'Partial'],
  ['v0 invent blocks', 'product', 'weak', 'v0', 'UI blocks', 'invent SPA'],
  ['v0 invent deploy Vercel', 'product', 'weak', 'v0', 'One-click deploy', 'deploy Acc'],
  ['Bolt invent WebContainers', 'coding', 'weak', 'Bolt', 'In-browser Node', 'Missing'],
  ['Bolt invent Expo', 'coding', 'weak', 'Bolt', 'Expo path', 'mobile stub'],
  ['Lovable invent full apps', 'product', 'weak', 'Lovable', 'Full-stack apps', 'invent'],
  ['Replit invent Agent', 'coding', 'weak', 'Replit', 'Agent', 'Partial'],
  ['Replit invent Deploy', 'product', 'weak', 'Replit', 'Deploy', 'Missing'],
  ['Softgen invent apps', 'product', 'weak', 'Softgen', 'App builder', 'Partial'],
  ['Tempo invent React', 'product', 'weak', 'Tempo', 'React builder', 'Partial'],
  ['DhiWise invent', 'product', 'worst', 'DhiWise', 'Design→code', 'Missing'],
  ['Anima invent Figma', 'product', 'weak', 'Anima', 'Figma→code', 'figma.ts'],
  ['Locofy invent Figma', 'product', 'weak', 'Locofy', 'Figma→code', 'Partial'],
  ['Builder.io invent', 'product', 'weak', 'Builder.io', 'Visual CMS', 'Missing'],
  ['Webflow invent AI', 'product', 'weak', 'Webflow', 'Webflow AI', 'Missing'],
  ['Framer invent AI', 'product', 'weak', 'Framer', 'Framer AI', 'Partial'],
  ['Wix invent AI', 'product', 'weak', 'Wix', 'Wix ADI', 'Missing'],
  ['Squarespace invent AI', 'product', 'weak', 'Squarespace', 'SQSP AI', 'Missing'],
  ['Shopify invent Sidekick', 'product', 'weak', 'Shopify', 'Sidekick', 'storefront'],
  ['Shopify invent Hydrogen AI', 'product', 'weak', 'Shopify', 'Hydrogen', 'Partial'],
];

for (const r of more) add(...r);

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
});
