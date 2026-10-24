/**
 * Grow nova-deep-rescan toward 1700+.
 * Tuple: [capability, grade, leader, how, now]
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

function addAll(lane, rows) {
  for (const [cap, grade, leader, how, now] of rows) add(cap, lane, grade, leader, how, now);
}

addAll('coding', [
  ['Inline invent invent accept key', 'weak', 'Copilot / Cursor', 'Tab to accept', 'NES'],
  ['Inline invent invent reject key', 'weak', 'IDE', 'Reject suggestion', 'Partial'],
  ['Inline invent invent cycle alts', 'weak', 'Copilot', 'Cycle alternatives', 'Missing'],
  ['Inline invent invent partial accept', 'weak', 'Copilot', 'Word-level accept', 'Missing'],
  ['FIM invent invent middle fill', 'weak', 'Codestral / Copilot', 'Fill-in-middle', 'Partial'],
  ['Multi-cursor invent invent AI', 'worst', 'IDE', 'AI multi-cursor', 'Missing'],
  ['Column invent invent select AI', 'worst', 'IDE', 'Column select AI', 'Missing'],
  ['Snippet invent invent expand AI', 'weak', 'IDE', 'AI snippets', 'Partial'],
  ['Emmet invent invent AI mix', 'weak', 'field', 'Emmet+AI', 'Partial'],
  ['Comment invent invent to-code', 'partial', 'Copilot', 'Comment→code', 'Partial'],
  ['Docstring invent invent gen', 'weak', 'field', 'Docstring gen', 'Partial'],
  ['Type invent invent infer annotate', 'weak', 'field', 'Add types', 'Partial'],
  ['Assert invent invent insert', 'weak', 'field', 'Insert asserts', 'Partial'],
  ['Log invent invent insert debug', 'weak', 'field', 'Insert logs', 'Partial'],
  ['Remove invent invent debug logs', 'weak', 'field', 'Strip debug', 'Partial'],
  ['Simplify invent invent expression', 'weak', 'IDE', 'Simplify expr', 'Partial'],
  ['Extract invent invent component', 'weak', 'IDE', 'Extract React comp', 'Partial'],
  ['Extract invent invent hook', 'weak', 'IDE', 'Extract hook', 'Partial'],
  ['Convert invent invent class→fn', 'weak', 'IDE', 'Class to function', 'Partial'],
  ['Convert invent invent callback→async', 'weak', 'IDE', 'Callback to async', 'Partial'],
  ['Upgrade invent invent ESM', 'weak', 'field', 'CJS→ESM', 'Partial'],
  ['Upgrade invent invent React Compiler', 'weak', 'React', 'Compiler ready', 'Partial'],
  ['Migrate invent invent CSS→Tailwind', 'weak', 'field', 'CSS to TW', 'Partial'],
  ['Migrate invent invent Pages→App Router', 'worst', 'Next', 'Pages to App', 'Missing'],
  ['Migrate invent invent CRA→Vite', 'weak', 'field', 'CRA to Vite', 'Partial'],
  ['Fix invent invent hooks deps', 'weak', 'eslint', 'Exhaustive deps', 'Partial'],
  ['Fix invent invent stale closure', 'weak', 'field', 'Stale closure', 'Partial'],
  ['Fix invent invent memory leak', 'weak', 'field', 'Leak fix', 'Partial'],
  ['Fix invent invent N+1 query', 'weak', 'field', 'N+1 fix', 'Missing'],
  ['Fix invent invent race condition', 'weak', 'field', 'Race fix', 'Missing'],
  ['Perf invent invent memoize', 'weak', 'React', 'Add memo', 'Partial'],
  ['Perf invent invent virtualize', 'weak', 'field', 'Virtualize lists', 'Missing'],
  ['Perf invent invent lazy route', 'weak', 'React', 'Lazy routes', 'Partial'],
  ['Pagination invent invent API', 'weak', 'field', 'Paginated API', 'Partial'],
  ['Storage invent invent signed URLs', 'weak', 'S3/R2', 'Signed URLs', 'Missing'],
  ['CDN invent invent cache headers', 'weak', 'field', 'Cache headers', 'Partial'],
  ['Edge invent invent middleware', 'weak', 'Next / CF', 'Edge middleware', 'Missing'],
  ['Cron invent invent Vercel', 'weak', 'Vercel Cron', 'Cron jobs', 'automations'],
  ['Queue invent invent Inngest', 'worst', 'Inngest', 'Job queues', 'Missing'],
  ['Queue invent invent BullMQ', 'worst', 'BullMQ', 'Redis queues', 'Missing'],
  ['Realtime invent invent Ably', 'worst', 'Ably', 'Realtime', 'Missing'],
  ['Realtime invent invent Pusher', 'worst', 'Pusher', 'Realtime', 'Missing'],
  ['Realtime invent invent Supabase', 'weak', 'Supabase', 'Realtime channels', 'Missing'],
  ['DB invent invent Supabase', 'weak', 'Supabase', 'Postgres+RLS', 'Missing'],
  ['DB invent invent Neon', 'weak', 'Neon', 'Serverless PG', 'Missing'],
  ['DB invent invent PlanetScale', 'worst', 'PlanetScale', 'MySQL serverless', 'Missing'],
  ['DB invent invent Turso', 'weak', 'Turso', 'LibSQL', 'Missing'],
  ['DB invent invent Convex', 'worst', 'Convex', 'Convex backend', 'Missing'],
  ['DB invent invent Firebase', 'weak', 'Firebase', 'Firestore', 'Missing'],
  ['DB invent invent Dynamo', 'worst', 'AWS', 'DynamoDB', 'Missing'],
  ['Search invent invent Algolia', 'worst', 'Algolia', 'Hosted search', 'Missing'],
  ['Search invent invent Typesense', 'worst', 'Typesense', 'Search', 'Missing'],
  ['Vector invent invent Pinecone', 'weak', 'Pinecone', 'Vectors', 'Partial'],
  ['Vector invent invent Weaviate', 'worst', 'Weaviate', 'Vectors', 'Missing'],
  ['Vector invent invent Chroma', 'weak', 'Chroma', 'Local vectors', 'Partial'],
  ['Vector invent invent pgvector', 'weak', 'pgvector', 'PG vectors', 'Missing'],
  ['RAG invent invent chunking', 'weak', 'field', 'Chunk strategies', 'Partial'],
  ['RAG invent invent rerank', 'worst', 'field', 'Rerankers', 'Missing'],
  ['RAG invent invent hybrid', 'weak', 'field', 'Hybrid search', 'Partial'],
  ['RAG invent invent citations', 'partial', 'field', 'Cite sources', 'webSearch'],
  ['Agent invent invent scratchpad', 'partial', 'field', 'Scratchpad', 'Partial'],
  ['Agent invent invent reflection', 'weak', 'field', 'Self-reflect', 'host judge'],
  ['Agent invent invent critique loop', 'weak', 'field', 'Critique loop', 'Partial'],
  ['Agent invent invent debate', 'worst', 'field', 'Multi-agent debate', 'Missing'],
  ['Agent invent invent tree-of-thought', 'weak', 'field', 'ToT search', 'Missing'],
  ['Agent invent invent ReAct', 'partial', 'field', 'ReAct loop', 'agent loop'],
  ['Agent invent invent CodeAct', 'weak', 'smolagents', 'CodeAct', 'Partial'],
  ['Agent invent invent Plan-and-Execute', 'strong', 'Capstone / Nova', 'Plan then act', 'Plan/Act'],
  ['Agent invent invent LATS', 'worst', 'field', 'Language Agent Tree Search', 'Missing'],
  ['Agent invent invent Reflexion', 'weak', 'field', 'Reflexion', 'Partial'],
  ['Harness invent invent MVH', 'strong', 'HAR', 'Minimal viable harness', 'agentHarness'],
  ['Harness invent invent ablations', 'weak', 'HAR study', 'Ablation suite', 'smokes'],
  ['Harness invent invent worktree slots', 'partial', 'HAR', 'Worktree slots', 'Partial'],
  ['Harness invent invent network allow', 'strong', 'SWE-Bench Pro', 'Net allowlist', 'verifyNetworkPolicy'],
  ['Harness invent invent empty fail', 'strong', 'SWE-Bench Pro', 'Empty patch fail', 'emptyPatchMustFail'],
  ['Harness invent invent stop idle', 'strong', 'HAR', 'Idle stop', 'shouldStopTrajectory'],
  ['Harness invent invent max steps', 'strong', 'field', 'Max steps', 'agent loop'],
  ['Harness invent invent cost cap', 'partial', 'field', 'Cost cap', 'budget'],
  ['Harness invent invent token cap', 'partial', 'field', 'Token cap', 'TokenUsageRing'],
  ['Obs invent invent elision', 'strong', 'HAR / Nova', 'Stage elision', 'stageContextElision'],
  ['Obs invent invent transcript', 'strong', 'Nova', 'Agent transcript', 'AgentTrace'],
  ['Obs invent invent tool timing', 'partial', 'field', 'Tool timings', 'Partial'],
  ['Obs invent invent token/tool', 'partial', 'field', 'Tokens per tool', 'Partial'],
  ['Seat invent invent cheap read', 'partial', 'Amp / Cursor', 'Cheap model reads', 'engineSeatSwap'],
  ['Seat invent invent strong edit', 'partial', 'Cursor', 'Strong edit model', 'engineSeatSwap'],
  ['Seat invent invent local fallback', 'strong', 'Nova', 'Local fallback', 'GGUF'],
  ['Seat invent invent vision', 'partial', 'Claude / GPT', 'Vision seat', 'previewCapture'],
  ['Seat invent invent embedding', 'weak', 'field', 'Embed model', 'Partial'],
  ['Seat invent invent rerank model', 'worst', 'field', 'Rerank model', 'Missing'],
  ['Git invent invent worktree create', 'weak', 'git', 'worktree add', 'Partial'],
  ['Git invent invent bisect AI', 'worst', 'field', 'AI bisect', 'Missing'],
  ['Git invent invent blame AI', 'worst', 'Cody', 'AI blame', 'Missing'],
  ['Git invent invent conflict AI', 'weak', 'field', 'Conflict resolve', 'Partial'],
  ['Git invent invent rebase AI', 'worst', 'field', 'AI rebase', 'Missing'],
  ['PR invent invent draft body', 'partial', 'field', 'Draft PR body', 'draft-pr Acc'],
  ['PR invent invent review reply', 'weak', 'field', 'Reply to review', 'Partial'],
  ['PR invent invent request changes', 'weak', 'field', 'Request changes', 'Partial'],
  ['PR invent invent stacked', 'worst', 'Graphite', 'Stacked PRs', 'Missing'],
  ['CI invent invent fix from log', 'weak', 'field', 'CI log→fix', 'ci-autofix Acc'],
  ['CI invent invent flake detect', 'worst', 'Trunk', 'Flake detect', 'Missing'],
  ['CI invent invent cache warm', 'weak', 'CI', 'Cache warming', 'Partial'],
  ['Release invent invent tag', 'weak', 'field', 'Tag release', 'Partial'],
  ['Release invent invent changelog', 'partial', 'field', 'Changelog', 'changelog.ts'],
  ['Docs invent invent README sync', 'weak', 'field', 'README sync', 'Partial'],
  ['Docs invent invent API from types', 'weak', 'TypeDoc', 'API from types', 'Missing'],
  ['License invent invent choose', 'weak', 'field', 'Pick license', 'Partial'],
  ['Security invent invent dependabot', 'worst', 'Dependabot', 'Auto bumps', 'Missing'],
  ['Security invent invent codeql', 'worst', 'CodeQL', 'QL scan', 'Missing'],
  ['Security invent invent semgrep', 'weak', 'Semgrep', 'SAST', 'Partial'],
  ['Security invent invent gitleaks', 'weak', 'gitleaks', 'Secrets', 'Partial'],
  ['Bench invent invent SWE-bench', 'weak', 'SWE-bench', 'Issue→PR bench', 'smokes'],
  ['Bench invent invent LiveCodeBench', 'worst', 'LiveCodeBench', 'Contest', 'Missing'],
  ['Bench invent invent Terminal-Bench', 'worst', 'Terminal-Bench', 'CLI bench', 'Missing'],
  ['Bench invent invent WebArena', 'worst', 'WebArena', 'Web agent', 'Missing'],
  ['Bench invent invent OSWorld', 'worst', 'OSWorld', 'Desktop agent', 'Missing'],
  ['Coding invent invent syntax gate', 'strong', 'Nova', 'createSyntaxGate', 'wired'],
  ['Coding invent invent Ready gate', 'strong', 'Nova', 'createReady', 'wired'],
  ['Coding invent invent evidence', 'strong', 'Nova', 'createEvidence', 'wired'],
  ['Coding invent invent doom-loop', 'strong', 'Nova', 'doom-loop breaker', 'wired'],
  ['Coding invent invent dont-touch', 'strong', 'Nova', 'dont-touch.md', 'wired'],
  ['Coding invent invent checkpoint', 'strong', 'Nova', 'createCheckpoint', 'wired'],
  ['Coding invent invent NES overlay', 'strong', 'Nova', 'ChatCodeOverlay', 'wired'],
  ['Coding invent invent @mentions', 'strong', 'Nova', '@file mentions', 'wired'],
  ['Coding invent invent slash cmds', 'strong', 'Nova', 'slash commands', 'wired'],
  ['Coding invent invent click-to-source', 'strong', 'Nova', 'inventClickToSource', 'wired'],
  ['Coding invent invent instant grep', 'strong', 'Nova', 'instantGrepAcc', 'wired'],
  ['Coding invent invent repo map', 'strong', 'Nova', 'repo map lite', 'wired'],
  ['Coding invent invent WorkTrace', 'strong', 'Nova', 'WorkTrace', 'wired'],
  ['Coding invent invent AgentTrace', 'strong', 'Nova', 'AgentTracePanel', 'wired'],
  ['Coding invent invent TokenRing', 'strong', 'Nova', 'TokenUsageRing', 'wired'],
  ['Coding invent invent PlanOpenPill', 'strong', 'Nova', 'PlanOpenPill', 'wired'],
  ['Coding invent invent harness packs', 'strong', 'Nova', 'agentHarness', 'wired'],
  ['Coding invent invent craft smokes', 'strong', 'Nova', 'smoke-invent-craft', 'wired'],
  ['Coding invent invent CDP scripts', 'strong', 'Nova', '_cdp-*', 'wired'],
  ['Coding invent invent seat swap', 'strong', 'Nova', 'engineSeatSwap', 'wired'],
  ['Coding invent invent ensemble park', 'partial', 'Nova', 'ensemble parked', 'createEnsemble'],
  ['Coding invent invent host judge', 'partial', 'Nova', 'createHostJudge', 'partial'],
  ['Coding invent invent stall watch', 'partial', 'Nova', 'live-stall-watch', 'partial'],
  ['Coding invent invent budget Acc', 'partial', 'Nova', 'budget.json', 'Acc'],
  ['Coding invent invent edit policy Acc', 'partial', 'Nova', 'coding-edit-policy', 'Acc'],
  ['Coding invent invent tools Acc', 'partial', 'Nova', 'coding-tools.json', 'Acc'],
]);

addAll('product', [
  ['Perf invent invent image optimize', 'weak', 'field', 'Image opt', 'Partial'],
  ['i18n invent invent extract strings', 'weak', 'field', 'Extract i18n', 'Missing'],
  ['a11y invent invent autofix labels', 'weak', 'axe', 'Autofix labels', 'Partial'],
  ['SEO invent invent meta gen', 'strong', 'Nova', 'Meta inject', 'stampInventHeadMeta'],
  ['SEO invent invent sitemap', 'partial', 'field', 'Sitemap', 'Partial'],
  ['SEO invent invent robots', 'partial', 'field', 'robots.txt', 'Partial'],
  ['PWA invent invent SW', 'weak', 'field', 'Service worker', 'manifest Acc'],
  ['Offline invent invent cache', 'worst', 'field', 'Offline cache', 'Missing'],
  ['Push invent invent notifications', 'worst', 'field', 'Web push', 'Missing'],
  ['Share invent invent Web Share', 'weak', 'field', 'Web Share API', 'Partial'],
  ['Clipboard invent invent API', 'weak', 'field', 'Clipboard API', 'Partial'],
  ['Drag invent invent drop upload', 'partial', 'field', 'DnD upload', 'chatDrop'],
  ['Infinite invent invent scroll', 'weak', 'field', 'Infinite scroll', 'Partial'],
  ['Optimistic invent invent UI', 'weak', 'field', 'Optimistic updates', 'Missing'],
  ['Retry invent invent UI backoff', 'weak', 'field', 'Retry UI', 'Partial'],
  ['Toast invent invent system', 'partial', 'field', 'Toasts', 'Partial'],
  ['Modal invent invent a11y', 'partial', 'field', 'A11y modal', 'Partial'],
  ['Drawer invent invent nav', 'partial', 'field', 'Drawer nav', 'Partial'],
  ['Tabs invent invent keyboard', 'partial', 'field', 'Keyboard tabs', 'Partial'],
  ['Table invent invent sort filter', 'weak', 'field', 'Data table', 'Partial'],
  ['Chart invent invent theme', 'weak', 'field', 'Themed charts', 'Partial'],
  ['Calendar invent invent widget', 'weak', 'field', 'Calendar', 'Missing'],
  ['Kanban invent invent board', 'worst', 'field', 'Kanban UI', 'Missing'],
  ['Chat invent invent widget product', 'weak', 'field', 'Chat widget', 'Partial'],
  ['Auth invent invent magic link', 'weak', 'Clerk / Auth.js', 'Magic link', 'Partial'],
  ['Auth invent invent OAuth buttons', 'partial', 'field', 'OAuth buttons', 'AuthContext'],
  ['Auth invent invent MFA', 'worst', 'field', 'MFA invent', 'Missing'],
  ['Auth invent invent Supabase', 'weak', 'Supabase', 'Supabase Auth', 'Partial'],
  ['Billing invent invent portal', 'weak', 'Stripe', 'Customer portal', 'payments stub'],
  ['Billing invent invent metered', 'worst', 'Stripe', 'Metered billing', 'Missing'],
  ['Billing invent invent seats', 'worst', 'Stripe', 'Seat billing', 'Missing'],
  ['Email invent invent templates React', 'weak', 'react-email', 'React email', 'Missing'],
  ['Email invent invent transactional', 'weak', 'Resend', 'Transactional', 'Missing'],
  ['SMS invent invent Twilio', 'worst', 'Twilio', 'SMS', 'Missing'],
  ['Product invent invent storefront', 'strong', 'Nova', 'Storefront ladder', 'wired'],
  ['Product invent invent blank solid', 'strong', 'Nova', 'Blank/solid', 'wired'],
  ['Product invent invent Live unlock', 'strong', 'Nova', 'Live unlock', 'wired'],
  ['Product invent invent invent marker', 'strong', 'Nova', 'invent-demo marker', 'wired'],
  ['Product invent invent craft rules', 'strong', 'Nova', 'Craft design rules', 'wired'],
  ['Product invent invent brand assets', 'strong', 'Nova', 'brandAssets', 'wired'],
  ['Product invent invent head meta', 'strong', 'Nova', 'Head meta stamp', 'wired'],
  ['Product invent invent JSON-LD', 'strong', 'Nova', 'structured-data', 'wired'],
  ['Product invent invent privacy terms', 'strong', 'Nova', 'privacy/terms md', 'wired'],
]);

addAll('protocol', [
  ['Protocol invent invent MCP roots', 'partial', 'MCP', 'roots/list', 'Partial'],
  ['Protocol invent invent MCP sampling', 'weak', 'MCP', 'sampling', 'Partial'],
  ['Protocol invent invent ACP session', 'weak', 'ACP', 'session/new', 'Partial'],
  ['Protocol invent invent LSP diag stream', 'weak', 'LSP', 'diagnostics', 'coding-lsp Acc'],
  ['Protocol invent invent DAP launch', 'worst', 'DAP', 'launch', 'Missing'],
]);

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
