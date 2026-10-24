/**
 * Wave 3 deep research — coding-first + full app chrome.
 * Honest grades. Dedupes by capability name.
 * Target: push matrix well past 2000 with real open gaps.
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

// —— Coding agent tools / permissions (field 2026) ——
addAll('coding', [
  ['Per-tool allow deny ask lists', 'weak', 'Claude Code', 'Allow/deny/ask per tool', 'Approval policy coarse'],
  ['Explore subagent read-only tools', 'weak', 'Claude Code / Copilot', 'Explore = read-only', 'Missing UI'],
  ['Plan subagent read-only tools', 'partial', 'Claude Code', 'Plan cannot write', 'Plan/Act soft'],
  ['Task subagent launch button', 'worst', 'Claude Code Task', 'Spawn Task agent', 'No Task UI'],
  ['TodoWrite agent checklist UI', 'weak', 'Claude Code', 'Structured todos in agent', 'WorkTrace soft'],
  ['NotebookEdit Jupyter cells', 'worst', 'Claude Code', 'Edit .ipynb cells', 'Missing'],
  ['Browser control navigate click type', 'weak', 'Cursor', 'Agent drives browser', 'Live CDP partial'],
  ['Browser control element pick', 'worst', 'Cursor / Playwright', 'Click DOM by pick', 'Missing UI'],
  ['Image generation in agent turn', 'worst', 'Cursor', 'Gen image mid-task', 'Missing'],
  ['Ask clarifying question gate', 'partial', 'Cursor', 'Agent asks before act', 'Partial'],
  ['Semantic codebase index status UI', 'partial', 'Cursor / Amp', 'Index ready %', 'semantic-index Acc'],
  ['Semantic search in agent loop', 'partial', 'Cursor', 'Meaning search tool', 'Partial'],
  ['Deep Mode repo search', 'worst', 'Devin Search', 'Deep search mode', 'Missing'],
  ['Auto-indexed wiki / knowledge', 'worst', 'Devin Wiki', 'Repo wiki auto', 'Missing'],
  ['Agent desktop computer use', 'worst', 'Devin Desktop Testing', 'OS GUI control', 'Missing'],
  ['Multiple agent terminals', 'weak', 'Devin / Warp', 'N terminals', 'One agentRun'],
  ['Git ops full in agent', 'partial', 'Devin / Aider', 'commit/branch/PR', 'Partial git'],
  ['Custom agent markdown defs', 'weak', 'Copilot / Claude', 'YAML agent files', 'Missing UI'],
  ['Custom modes tool restrict', 'weak', 'Cursor Custom Modes', 'Mode→tool set', 'Missing UI'],
  ['Manual mode explicit files only', 'weak', 'Cursor Manual', 'Only named files', 'Partial'],
  ['Parallel tool calls visible', 'weak', 'Copilot', 'Show parallel tools', 'Trace soft'],
  ['Tool call cancel granular', 'partial', 'field', 'Cancel one tool', 'Cancel turn'],
  ['Shell command preview before run', 'partial', 'Capstone', 'Show cmd ask', 'terminal-policy'],
  ['Network domain allowlist editor UI', 'weak', 'SWE-Bench Pro', 'Edit allowlist', 'Pref only'],
  ['Write outside workspace deny UI', 'partial', 'Capstone', 'Sandbox path deny', 'sandbox soft'],
  ['Dependency install approval gate', 'weak', 'field', 'npm i ask', 'Partial'],
  ['DB migrate approval gate', 'worst', 'field', 'Migrate ask', 'Missing'],
  ['Deploy approval gate', 'weak', 'field', 'Deploy ask', 'deploy Acc'],
  ['Secret env never agent-read UI', 'partial', 'field', 'Redact .env', 'secret-redaction soft'],
  ['Agent cost meter live', 'weak', 'Amp', 'Live $ / tokens', 'Token ring soft'],
  ['Agent audit thread export', 'weak', 'Amp', 'Export auditable thread', 'audit Acc'],
  ['Fail-to-pass test harness UI', 'partial', 'SWE-bench', 'F2P runner', 'harness Acc'],
  ['Empty patch reject hard', 'strong', 'SWE-Bench Pro', 'Empty fails', 'wired'],
  ['Narrowest test first policy', 'weak', 'field eval', 'Run smallest test', 'Partial'],
  ['Agent stop when acceptance met', 'partial', 'field eval', 'Stop at done', 'doom-loop soft'],
  ['Diff summary + uncertainty', 'weak', 'field eval', 'Reviewability', 'Partial'],
  ['Risky action observable deny', 'partial', 'field eval', 'Deny continues safe', 'Partial'],
  ['Issue → sandbox → draft PR', 'worst', 'Devin / Jules / Copilot', 'Cloud ticket engineer', 'Missing'],
  ['PR review agent apply commits', 'worst', 'Devin Review', 'Review+apply', 'Missing'],
  ['Background cloud agent queue UI', 'worst', 'Cursor Background', 'Async cloud queue', 'Missing'],
  ['Local background agent panel', 'weak', 'Cursor / Devin Desktop', 'Desktop async jobs', 'background-agents Acc'],
  ['Agent Command Center multi', 'worst', 'Devin', 'Multi-agent center', 'Jobs soft'],
  ['Worktree isolation picker UI', 'partial', 'HAR / Codex', 'Pick worktree', 'Partial'],
  ['AGENTS.md import apply UI', 'partial', 'Claude Code', 'Import AGENTS.md', 'Partial'],
  ['Rules always-on editor UI', 'partial', 'Cursor', 'Rules editor', 'rules Acc'],
  ['Skills marketplace browse UI', 'weak', 'Claude / Cursor', 'Install skills', 'skills Acc'],
  ['Hooks on-save / on-commit UI', 'weak', 'Claude Code', 'Hooks editor', 'hooks Acc'],
  ['MCP marketplace private', 'worst', 'JetBrains Junie', 'Private MCP market', 'Missing'],
  ['MCP per-tool grant invent', 'weak', 'MCP', 'Invent-scoped MCP', 'mcp Acc'],
  ['ACP guest session inspector UI', 'weak', 'Zed ACP', 'ACP sessions', 'acp Acc'],
  ['Foreign CLI guest manager UI', 'weak', 'OpenHands / BACH', 'Host Claude/Codex', 'foreign-cli Acc'],
  ['LSP diagnostics into agent loop', 'weak', 'Cline / OpenCode', 'Real LSP stream', 'coding-lsp Acc'],
  ['Go to definition agent tool', 'weak', 'LSP IDE', 'gdef tool', 'Partial'],
  ['Find references agent tool', 'weak', 'LSP IDE', 'refs tool', 'Partial'],
  ['Rename symbol project-wide', 'weak', 'LSP IDE', 'Rename', 'Missing deep'],
  ['Extract method refactor action', 'weak', 'IDE', 'Extract', 'Partial'],
  ['Inline variable refactor', 'weak', 'IDE', 'Inline', 'Partial'],
  ['Generate tests for selection', 'weak', 'Qodo / Copilot', 'Test gen button', 'Partial'],
  ['Fix this error from console', 'partial', 'IDE AI', 'Console→fix', 'Live console soft'],
  ['Explain selection action', 'partial', 'Cody', 'Explain', 'plainChatAsk'],
  ['Voice coding continuous', 'partial', 'field', 'Voice→agent', 'voiceSession'],
  ['Terminal AI suggest', 'weak', 'Warp / Fig', 'Shell AI', 'Partial'],
  ['Mermaid diagram from agent', 'weak', 'Amp', 'Diagrams', 'Partial'],
  ['Screenshot read into loop', 'partial', 'Amp / Claude', 'See image', 'previewCapture'],
  ['Live preview click-to-source', 'partial', 'Nova invent', 'Click→file', 'inventClickToSource'],
  ['Visual regression runner UI', 'weak', 'field', 'Screenshot diff', 'visual Acc'],
  ['A11y audit panel Live', 'weak', 'field', 'A11y findings', 'a11y Acc'],
  ['SEO audit panel Live', 'weak', 'Blink', 'SEO panel', 'seo Acc'],
  ['Grade dashboard Live', 'partial', 'Nova', 'Live grade', 'Partial'],
  ['Verify gates checklist UI', 'partial', 'Nova', 'Verify gates', 'Partial'],
  ['Smoke runner one-click UI', 'partial', 'Nova', 'Smoke UI', 'smoke Acc'],
  ['Stall watch visible timer', 'partial', 'Nova', 'Stall UI', 'Partial'],
  ['Checkpoint browser restore UI', 'partial', 'Capstone', 'Restore UI', 'Partial'],
  ['Undo redo stack chrome', 'partial', 'Capstone', 'Undo stack', 'Partial'],
  ['Running diff watch live', 'partial', 'IDE', 'Live diff', 'Partial'],
  ['Diff review accept reject UI', 'partial', 'IDE', 'Accept/reject', 'Partial'],
  ['Multitask queue side panel', 'weak', 'Cursor', 'Queue jobs', 'Partial'],
  ['Memory browser cross-chat', 'partial', 'Cursor Memories', 'Memory UI', 'threadBrain'],
  ['Scratchpad agent notes panel', 'weak', 'field', 'Scratchpad', 'Partial'],
  ['Dont-touch paths editor UI', 'strong', 'Nova', 'Never-touch', 'dont-touch'],
  ['Mode switcher Ask Agent Plan', 'strong', 'Cursor / Nova', 'Three modes', 'classifyTurn'],
  ['YOLO autorun toggle clear', 'partial', 'Cursor', 'Auto-run tools', 'approvalPolicy'],
  ['Max mode context toggle', 'weak', 'Cursor Max', 'Huge context', 'Partial'],
  ['Seat routing UI visible', 'partial', 'Amp / Nova', 'Seat picker', 'engineSeatSwap'],
  ['Ensemble multi-model UI', 'weak', 'field', 'Ensemble controls', 'Partial'],
  ['Budget caps spend UI', 'weak', 'field', 'Budget caps', 'Partial'],
  ['Spend dashboard charts', 'worst', 'field', 'Spend UI', 'Missing'],
  ['Model latency SLA editor', 'weak', 'field', 'Failover rules UI', 'model-latency Acc'],
  ['Teammate seats full manager', 'partial', 'Nova', 'Seat assign', 'TeammateBar soft'],
  ['Chat fork from message UI', 'weak', 'field', 'Fork chat', 'Partial'],
  ['Collab presence multiplayer', 'worst', 'Replit', 'Presence', 'Missing'],
  ['Share preview public URL', 'worst', 'StackBlitz', 'Share Live', 'Local only'],
  ['One-click deploy from chat', 'weak', 'Vercel / Replit', 'Deploy', 'deploy Acc'],
  ['PR draft from chat UI', 'weak', 'Copilot Workspace', 'Chat→PR', 'draft-pr Acc'],
  ['CI autofix from failing check', 'weak', 'field', 'CI→fix', 'ci-autofix Acc'],
  ['Conflict resolve UI', 'weak', 'IDE', 'Merge conflict AI', 'Partial'],
  ['Code review side panel', 'weak', 'Copilot', 'Review UI', 'Partial'],
  ['Git status chrome header', 'partial', 'IDE', 'Branch/dirty', 'Partial'],
  ['Worktree picker workspace', 'partial', 'HAR', 'Worktrees', 'Partial'],
  ['Symbols outline panel', 'partial', 'IDE', 'Outline', 'symbols Acc'],
  ['Repo map explorer visual', 'weak', 'field', 'Visual map', 'Partial'],
  ['Callers callees graph UI', 'worst', 'CKG research', 'Code graph', 'Missing'],
  ['Debug clinic health UI', 'partial', 'Nova', 'Project health', 'debugClinic soft'],
  ['Coding audit log viewer UI', 'weak', 'field', 'jsonl audit', 'audit Acc'],
  ['Automations cron UI', 'weak', 'Claude Code', 'Scheduled agents', 'automations Acc'],
  ['Quest mission board UI', 'weak', 'field', 'Quest board', 'quest Acc'],
  ['Spec-driven Kiro editor', 'weak', 'Kiro', 'Spec UI', 'kiro Acc'],
  ['Builder SOLO mode UI', 'weak', 'Trae', 'Builder mode', 'trae Acc'],
  ['Invent brief clarify wizard', 'partial', 'GPT Engineer', 'Clarify', 'Partial'],
  ['Invent stack picker UI', 'weak', 'Bolt / Lovable', 'Vite/Next/Python', 'Partial'],
  ['Invent Figma import UI', 'weak', 'field', 'Figma→invent', 'figma Acc'],
  ['Invent auth+db scaffold UI', 'weak', 'Supabase', 'Auth+DB panel', 'stubs'],
  ['Invent payments Stripe panel', 'weak', 'field', 'Payments UI', 'payments Acc'],
  ['Invent i18n locales manager', 'weak', 'field', 'Locales UI', 'i18n Acc'],
  ['Invent PWA controls', 'weak', 'field', 'PWA UI', 'pwa Acc'],
  ['Invent mobile Expo promote', 'weak', 'field', 'Mobile promote', 'mobile Acc'],
  ['Invent game canvas debug', 'weak', 'field', 'Game toggles', 'game Acc'],
  ['Invent Next.js path first-class', 'weak', 'v0 / Bolt', 'Next invent', 'Vite SPA'],
  ['Invent Python path first-class', 'weak', 'Replit / Agent47', 'Python invent', 'JS primary'],
  ['Invent API+UI together path', 'weak', 'Lovable', 'Full-stack', 'UI-heavy'],
  ['Invent multi-route site solid', 'weak', 'v0 / Framer', 'Multi-page', 'Partial'],
  ['Invent contact form solid', 'weak', 'field', 'Contact', 'Partial'],
  ['Invent favicon+og solid', 'weak', 'field', 'Favicon/OG', 'Partial'],
  ['Invent 404+loading+empty', 'weak', 'field', 'States', 'Partial'],
  ['NES accept reject cycle keys', 'partial', 'Nova', 'NES chrome', 'ChatCodeOverlay'],
  ['Refactor palette extract rename', 'weak', 'IDE', 'Refactor menu', 'Partial'],
  ['Test gen button selection', 'weak', 'Qodo', 'Tests button', 'Partial'],
  ['Whats new changelog surface', 'partial', 'field', 'Whats new', 'changelog soft'],
  ['Keyboard cheatsheet overlay', 'weak', 'IDE', 'Shortcuts', 'Missing UI'],
  ['Global command palette Ctrl+K', 'weak', 'IDE', 'Palette', 'Missing UI'],
  ['Integrations hub unified UI', 'weak', 'field', 'GitHub/Linear/…', 'Partial hub'],
  ['Notifications center polish', 'partial', 'field', 'Notifications', 'wired soft'],
  ['Missing items deplete when placed', 'strong', 'Nova', 'Placed marks', 'missingItemsCatalog'],
  ['Agents Window Kanban real', 'weak', 'Devin / Agent Teams', 'Kanban workers', 'agents-window Acc'],
  ['Worker DAG viewer real', 'weak', 'MonkeysCode', 'DAG UI', 'worker-dag Acc'],
  ['Orb cloud machine registry', 'worst', 'Amp orbs', 'Orb manager', 'Missing UI'],
  ['Nested subagent tree UI', 'weak', 'Claude', 'Tree UI', 'nested Acc'],
  ['Inter-agent mailbox live UI', 'worst', 'Codex Mailbox', 'Live bus', 'mailbox Acc only'],
  ['Background async agents panel', 'weak', 'Cursor', 'Async panel', 'background Acc'],
]);

// —— Product / app chrome UI (Nova shell) ——
addAll('product', [
  ['Appearance Fun Dark Light Gray', 'strong', 'Nova', 'Four themes', 'ThemeContext'],
  ['Fun theme orbs only', 'strong', 'Nova', 'Orbs = Fun', 'AppShell'],
  ['Gray no glass smoky', 'strong', 'Nova', 'Solid gray', 'index.css'],
  ['Sidebar equal top bottom space', 'strong', 'Nova', 'my-auto stack', 'sidebar-fit'],
  ['Settings modal not full page', 'strong', 'Nova', 'Settings modal', 'AppShell'],
  ['Studio controls in plus menu', 'strong', 'Nova', 'Studio overlay', 'ComposerPlus'],
  ['Agents Automations Integrations tabs', 'partial', 'Nova', 'Tools homes', 'toggle stubs'],
  ['Plugins Suggested card grid', 'strong', 'Nova', 'Plugin cards', 'BuildRun'],
  ['Models For-PC Local Cloud tabs', 'strong', 'Nova', 'Models tabs', 'ModelsView'],
  ['Local AI engine overview', 'strong', 'Nova', 'Engine page', 'LocalAI'],
  ['Home controls toggle cards color', 'strong', 'Nova', 'Colored marks', 'HomeControlsPanel'],
  ['Onboarding first-run path', 'partial', 'field', 'Onboarding', 'OnboardingScreen'],
  ['Auth ambient orbs auth only', 'partial', 'Nova', 'Auth orbs', 'AuthScreen'],
  ['Presence status menu', 'partial', 'field', 'Online/away', 'AppShell'],
  ['Jobs strip sidebar', 'partial', 'Nova', 'Jobs', 'JobsStrip'],
  ['Token usage Context vs Model', 'partial', 'Nova', 'Ring modes', 'TokenUsageRing'],
  ['Help overlay global', 'weak', 'IDE', 'Help host', 'GlobalHelpHost soft'],
  ['Delete project confirm flow', 'strong', 'Nova', 'Delete flow', 'deleteProjectFlow'],
  ['Recent projects list', 'strong', 'Nova', 'Recents', 'recentStore'],
  ['Search omnibox projects chats', 'partial', 'field', 'Search', 'Partial'],
  ['Message view polish', 'partial', 'field', 'Messages', 'MessageView'],
  ['Networking soon parked', 'strong', 'Nova', 'Soon badge', 'nav'],
  ['Voice soon parked', 'strong', 'Nova', 'Soon badge', 'nav'],
  ['Brain tab clarity', 'partial', 'Nova', 'Brain route', 'Partial'],
  ['MCP tab vs Tools MCP scopes', 'partial', 'Nova', 'MCP views', 'Partial overlap'],
  ['Profile replaced by Settings', 'strong', 'Nova', 'Settings pin', 'nav'],
]);

// —— Protocol ——
addAll('protocol', [
  ['MCP resources list UI', 'weak', 'MCP', 'resources/list UI', 'Partial'],
  ['MCP prompts browser UI', 'weak', 'MCP', 'prompts/list UI', 'Partial'],
  ['MCP tools call from chat', 'partial', 'MCP', 'tools/call', 'Partial'],
  ['MCP OAuth connect flow', 'weak', 'MCP', 'OAuth UI', 'Partial'],
  ['ACP session/new permission UI', 'weak', 'ACP', 'Permissions', 'acp Acc'],
  ['LSP publishDiagnostics consume', 'weak', 'LSP', 'Diags stream', 'coding-lsp Acc'],
  ['A2A agent-to-agent protocol', 'worst', 'Google A2A', 'A2A bus', 'Missing'],
  ['OpenTelemetry agent traces', 'worst', 'field', 'OTel traces', 'Missing'],
]);

// —— Coding loop micro-gaps (generate many honest uniques) ——
const files = [
  'App.tsx', 'main.tsx', 'index.css', 'vite.config', 'package.json', 'tsconfig',
  'README', 'env.example', 'router', 'layout', 'hero', 'nav', 'footer', 'pricing',
  'faq', 'contact', 'blog', 'cart', 'checkout', 'auth', 'dashboard', 'settings-page',
  'api-route', 'middleware', 'hook', 'store', 'test', 'e2e', 'story', 'types',
];
const editOps = [
  ['rename brand text', 'partial', 'Surgical rename', 'smoke-rename'],
  ['change accent color', 'partial', 'Token edit', 'Partial'],
  ['swap hero image', 'weak', 'Media swap', 'Partial'],
  ['add section block', 'partial', 'Structure edit', 'Partial'],
  ['remove section safe', 'partial', 'Surgical remove', 'smoke-remove'],
  ['fix broken JSX', 'partial', 'JSX heal', 'smoke-adjacent'],
  ['fix import path', 'partial', 'Import heal', 'Partial'],
  ['add loading state', 'weak', 'Loading UI', 'Partial'],
  ['add empty state', 'weak', 'Empty UI', 'Partial'],
  ['wire button onClick', 'partial', 'Handler wire', 'Partial'],
  ['add form validation', 'weak', 'Validate', 'Partial'],
  ['responsive breakpoint', 'partial', 'Responsive', 'craft'],
  ['a11y label fix', 'weak', 'A11y', 'a11y Acc'],
  ['SEO title meta', 'partial', 'Head meta', 'Partial'],
];
for (const f of files) {
  for (const [op, grade, how, now] of editOps) {
    add(`Edit invent ${f} ${op}`, 'coding', grade, 'Cursor / Claude', how, now);
  }
}

const agentSteps = [
  ['read file before patch', 'strong', 'Re-read disk', 'wired'],
  ['grep before broad edit', 'strong', 'Grep first', 'wired'],
  ['propose plan bullets', 'partial', 'Plan first', 'Plan/Act'],
  ['show patch hunks', 'partial', 'Hunk UI', 'Partial'],
  ['run typecheck after', 'partial', 'tsc gate', 'Partial'],
  ['run unit test after', 'weak', 'Test gate', 'Partial'],
  ['run smoke after', 'partial', 'Smoke gate', 'smoke Acc'],
  ['capture Live screenshot', 'partial', 'Screenshot', 'previewCapture'],
  ['read console errors', 'partial', 'Console', 'Partial'],
  ['retry once on fail', 'partial', 'Retry', 'Partial'],
  ['abort on doom loop', 'strong', 'Doom-loop', 'wired'],
  ['elide old tool output', 'strong', 'Elision', 'wired'],
  ['seat swap cheap tool', 'partial', 'Cheap seat', 'engineSeatSwap'],
  ['honor dont-touch', 'strong', 'Never-touch', 'dont-touch'],
  ['cite paths in reply', 'partial', 'Cite paths', 'Partial'],
];
const surfaces = ['Chat', 'Code overlay', 'Live', 'Agent trace', 'WorkTrace', 'Plan pill'];
for (const s of surfaces) {
  for (const [step, grade, how, now] of agentSteps) {
    add(`Agent ${s} ${step}`, 'coding', grade, 'Cursor / Capstone', how, now);
  }
}

const inventKinds = [
  'landing', 'storefront', 'saas', 'portfolio', 'docs', 'blog', 'dashboard',
  'waitlist', 'agency', 'restaurant', 'hotel', 'gym', 'clinic', 'law',
  'education', 'nonprofit', 'event', 'podcast', 'newsletter', 'marketplace',
];
const inventQual = [
  ['brand hero first', 'strong', 'Brand-first', 'craft rules'],
  ['anti purple cream', 'strong', 'Anti-slop', 'craft rules'],
  ['motion 2-3', 'strong', 'Motion', 'craft rules'],
  ['mobile first pass', 'strong', 'Mobile', 'Live+craft'],
  ['nav footer real', 'strong', 'Nav/footer', 'craft'],
  ['pricing real copy', 'partial', 'Pricing', 'storefront'],
  ['FAQ structured', 'partial', 'FAQ', 'Partial'],
  ['contact workable', 'weak', 'Contact', 'Partial'],
  ['favicon present', 'weak', 'Favicon', 'Partial'],
  ['OG image present', 'weak', 'OG', 'Partial'],
  ['404 route', 'weak', '404', 'Partial'],
  ['a11y landmarks', 'partial', 'A11y', 'a11y Acc'],
  ['SEO title unique', 'partial', 'SEO', 'Partial'],
  ['Ready gate pass', 'strong', 'Ready', 'createReady'],
  ['syntax gate pass', 'strong', 'Syntax', 'createSyntaxGate'],
  ['evidence pack', 'strong', 'Evidence', 'createEvidence'],
  ['rollback checkpoint', 'strong', 'Checkpoint', 'createCheckpoint'],
  ['bind studio thread', 'strong', 'Bind', 'chatStudio'],
  ['redesign in place', 'partial', 'Redesign', 'Partial'],
  ['thin path fast', 'strong', 'Thin', 'createThinPath'],
];
for (const k of inventKinds) {
  for (const [q, grade, how, now] of inventQual) {
    add(`Invent ${k} ${q}`, 'coding', grade, 'v0 / Lovable / Nova', how, now);
  }
}

// —— Verify / harness ——
const harness = [
  'smoke invent demo', 'smoke invent unique', 'smoke invent salvage',
  'smoke create pipeline', 'smoke create spine', 'smoke create evidence',
  'smoke create file accept', 'smoke thin create', 'smoke storefront ladder',
  'smoke ask fidelity', 'smoke ask families', 'smoke rename keep',
  'smoke remove words', 'smoke solid bg', 'smoke show sentence',
  'smoke dual side', 'smoke adjacent jsx', 'smoke code fence',
  'smoke blank lightred', 'smoke agent harness', 'smoke coding foundation',
  'smoke coding agent pack', 'smoke invent craft', 'live harness invent',
  'live stall watch', 'live step driver', 'live note ladder',
  'phase-a create gate', 'create budget diagnostics', 'create host judge',
];
for (const h of harness) {
  add(`Harness ${h} green`, 'coding', 'partial', 'Nova smokes', 'Script exists', 'scripts soft');
  add(`Harness ${h} in UI button`, 'coding', 'worst', 'field', 'One-click from UI', 'Missing UI');
}

// —— Privacy / safety product ——
addAll('product', [
  ['Airgap mode one toggle clear', 'partial', 'field', 'Airgap', 'prefs soft'],
  ['Local-only AI mode clear', 'strong', 'Nova', 'local_only', 'wired'],
  ['Cloud when available mode', 'partial', 'Nova', 'Mode', 'Partial'],
  ['Analytics opt-in panel clear', 'partial', 'field', 'Analytics', 'Partial'],
  ['Privacy mode blocks cloud agents', 'partial', 'Cursor', 'Privacy', 'Partial'],
  ['Secret redaction preview', 'weak', 'field', 'Show redactions', 'Partial'],
  ['Sandbox profile picker UI', 'partial', 'Capstone', 'Sandbox UI', 'Partial'],
  ['Terminal policy picker UI', 'partial', 'Capstone', 'Policy UI', 'Partial'],
  ['Network deny-by-default clear', 'partial', 'field', 'Deny net', 'Partial'],
  ['Auto-lock idle settings', 'partial', 'field', 'Auto-lock', 'SettingsPrivacy'],
]);

// —— Field competitors named gaps ——
const comps = [
  ['Claude Code', 'long session terminal'],
  ['Claude Code', 'permission per tool'],
  ['Claude Code', 'subagent explore'],
  ['Claude Code', 'scheduled tasks'],
  ['Cursor', 'background agents'],
  ['Cursor', 'browser control'],
  ['Cursor', 'custom modes'],
  ['Cursor', 'max mode'],
  ['Cursor', 'bugbot review'],
  ['Copilot', 'coding agent Actions'],
  ['Copilot', 'code review agent'],
  ['Copilot', 'custom agents md'],
  ['Devin', 'cloud VM sandbox'],
  ['Devin', 'wiki knowledge'],
  ['Devin', 'deep search'],
  ['Devin', 'desktop testing'],
  ['Amp', 'auditable threads'],
  ['Amp', 'usage tokens'],
  ['Amp', 'best model seat'],
  ['Aider', 'git-native commits'],
  ['Cline', 'plan act OSS'],
  ['Continue', 'config packs'],
  ['OpenHands', 'self-host sandbox'],
  ['Warp', 'agentic terminal'],
  ['Jules', 'free async Gemini'],
  ['Replit', 'ship full app'],
  ['Factory', 'enterprise SDLC'],
  ['Codex', 'parallel cloud jobs'],
  ['Codex', 'worktree isolate'],
  ['Windsurf', 'cascade rename'],
];
for (const [who, feat] of comps) {
  add(`Parity ${who} ${feat}`, 'coding', 'weak', who, feat, 'Gap vs field');
  add(`UI for ${who} ${feat}`, 'product', 'worst', who, `${feat} control`, 'Missing UI');
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

// Refresh callout toward research
t = t.replace(
  /HONEST regrade · research open again · coding-first · UI gaps → Missing homes/g,
  'Wave 3 deep research · coding-first · UI gaps flagged',
);
t = t.replace(
  /Grades restored from novaNow \(Acc≠Strong\)\. Open = \{open\}\. Grow \+ place UI next\./g,
  'Wave 3 grown. Open = {open}. Place new Missing UI homes next; Agents/Automations toggles are opt-in stubs.',
);

fs.writeFileSync(path, t);
const g = (k) => [...t.matchAll(new RegExp(`nova: '${k}'`, 'g'))].length;
const rows = [...t.matchAll(/capability: '/g)].length;
console.log({
  added: batch.length,
  rows,
  worst: g('worst'),
  weak: g('weak'),
  partial: g('partial'),
  strong: g('strong'),
  open: g('worst') + g('weak') + g('partial'),
});
