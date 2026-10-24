/**
 * Grow nova-deep-rescan.canvas.tsx RAW matrix toward 500+ rows.
 * Inserts before the STRONG section marker; sortedRows() reorders worst→best.
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

// —— Fine-grain coding edit / apply ——
const editCaps = [
  ['Multi-hunk unified diff apply', 'weak', 'Aider DIFF', 'Hunk-based apply', 'Diff display; apply mixed'],
  ['Exact string uniqueness edit fail', 'weak', 'Claude FileEdit', 'Fail if old_string not unique', 'Soft uniqueness'],
  ['Encoding detect UTF-16/BOM on edit', 'worst', 'Claude', 'Detect encoding before write', 'UTF-8 assume'],
  ['Line-ending preserve CRLF/LF', 'weak', 'Claude', 'Preserve endings', 'Node default'],
  ['1 GiB file edit guard', 'weak', 'Claude', 'Hard size limit', 'Soft Acc size'],
  ['Team memory file edit block', 'worst', 'Claude', 'Block secret memory paths', 'dont-touch Acc'],
  ['Patch create+delete+move atomic', 'worst', 'Codex apply_patch', 'One transaction all ops', 'Sequential Acc'],
  ['Undo via git stash refs', 'partial', 'Capstone Checkpoints', 'refs/agent checkpoints', 'createCheckpoint'],
  ['Redo coding turn stack', 'worst', 'OpenCode /redo', 'Redo last undo', 'Missing'],
  ['Three-way merge on conflict', 'worst', 'Agent47', 'Conservative 3-way merge', 'Missing'],
  ['Journal every workspace edit', 'partial', 'Agent47', 'Edit journal', 'Acc snapshots'],
  ['Distrust tool return strings', 'strong', 'Agent47', 'Re-read disk after tool', 'Reads Acc/disk'],
];
for (const [c, g, l, h, n] of editCaps) add(c, 'coding', g, l, h, n);

// —— Orient / search ——
const searchCaps = [
  ['Glob with gitignore respect', 'partial', 'Claude Glob', 'Bounded glob', 'folderCatalog'],
  ['Read PDF/DOCX in coding context', 'worst', 'Context Armor / Claude', 'Scan docs in workspace', 'Code Acc focus'],
  ['OCR image before invent coding', 'worst', 'Context Armor', 'OCR then code', 'image-to-invent notes'],
  ['Dependency graph callers tool', 'worst', 'CKG / Amp', 'Traverse callers/callees', 'repo map lite'],
  ['Dead code invent find', 'worst', 'Amp Oracle', 'Find unused', 'Watch'],
  ['Hotspot complexity map', 'weak', 'Cody', 'Complexity hotspots', 'repo map lite'],
  ['Blame invent explain', 'worst', 'Cody', 'git blame AI', 'Missing'],
  ['Incremental index by mtime/sha', 'weak', 'field indexers', 'Incremental reindex', 'Ad hoc rebuild'],
  ['Raw code stuffing vs summaries', 'partial', 'Cursor', 'Stuff real code chunks', 'Maps + blobs mix'],
  ['1M-token product context path', 'weak', 'Gemini', 'Productized 1M window', 'Model-dependent'],
];
for (const [c, g, l, h, n] of searchCaps) add(c, 'coding', g, l, h, n);

// —— Shell / sandbox ——
const shellCaps = [
  ['Read-only bash without prompt', 'partial', 'Claude Bash', 'Safe cmds free', 'terminal-policy'],
  ['Network egress allowlist coding', 'weak', 'Codex / OWASP', 'Allowlist domains', 'prefs partial'],
  ['OS sandbox workspace-write', 'weak', 'Codex', 'OS-enforced sandbox', 'Desktop soft sandbox'],
  ['Destructive MCP always ask', 'partial', 'Codex', 'destructiveHint honor', 'Partial'],
  ['Package install ask each time', 'partial', 'Capstone', 'npm install ask', 'autoInstall once'],
  ['Background process tool', 'worst', 'MonkeysCode', 'bg process handle', 'Missing'],
  ['Streaming PTY sessions', 'weak', 'MonkeysCode', 'Live PTY', 'Buffered agentRun'],
  ['Environment inspection tool', 'weak', 'field', 'env inspect', 'Partial'],
  ['Port management invent', 'worst', 'Superset', 'Manage ports in hub', 'Missing'],
];
for (const [c, g, l, h, n] of shellCaps) add(c, 'coding', g, l, h, n);

// —— Verify ——
const verifyCaps = [
  ['Fail-to-pass oracle invent', 'partial', 'SWE-bench', 'F2P suite', 'Harness Have'],
  ['Pass-to-pass regression invent', 'weak', 'SWE-bench', 'P2P suite', 'Partial'],
  ['Empty patch must fail', 'strong', 'SWE-Bench Pro', 'Empty fails', 'emptyPatchMustFail'],
  ['Clean container re-grade', 'worst', 'SWE-Bench Pro', 'Regrade clean container', 'Desktop Live'],
  ['Hidden test file reset', 'worst', 'SWE-Bench Pro', 'Reset tests before grade', 'Missing'],
  ['Hard-split stress bench', 'weak', 'SWE-Bench Pro', 'Hard task split', 'Smokes only'],
  ['Reproduction test first', 'weak', 'Oracle-SWE', 'Failing repro before patch', 'Rare'],
  ['Runtime debugger diagnosis', 'weak', 'SWE-Doctor', 'Debugger traces', 'Console partial'],
  ['Differential patch testing', 'worst', 'PatchDiff', 'Alt impl equivalence', 'Missing'],
  ['axe-core a11y in invent loop', 'partial', 'field', 'WCAG critical=0', 'Harness + a11y Acc'],
  ['Multi-viewport screenshot matrix', 'partial', 'field', '375/768/1440', 'Plan Have'],
  ['Phantom CSS class probe', 'partial', 'squint', 'Class without CSS', 'Have harness'],
  ['Contrast keyboard walk', 'weak', 'squint', 'a11y keyboard', 'Partial'],
  ['Signed replayable coding run', 'weak', 'MonkeysCode', 'Signed event logs', 'AgentTrace'],
  ['Content-signed diffs', 'worst', 'MonkeysCode', 'Byte-repro diffs', 'Missing'],
  ['Test-gated apply every write', 'weak', 'MonkeysCode', 'Cannot apply if tests fail', 'Ready gates'],
  ['Detect test command auto', 'partial', 'MonkeysCode', 'Infer test cmd', 'package.json heuristic'],
  ['Targeted package tests only', 'weak', 'monorepo agents', 'Changed packages', 'Full smoke often'],
  ['Parse failures into healer', 'partial', 'field', 'Failure → heal', 'Live/syntax signals'],
  ['User-flow verify login/pay', 'weak', 'Kane CLI', 'Real Chrome flows', 'Live DOM grade'],
];
for (const [c, g, l, h, n] of verifyCaps) add(c, 'coding', g, l, h, n);

// —— Multi-agent / orchestra ——
const orchCaps = [
  ['Subagent context isolation', 'partial', 'Claude AgentTool', 'Clean worker context', 'orbs Acc'],
  ['Spawn depth nested agents', 'worst', 'Hermes / Claude', 'Nested delegation trees', 'Missing'],
  ['Kanban swarm coding board', 'worst', 'Cline / Hermes', 'Kanban of agents', 'Missing UI'],
  ['Shared blackboard SQLite', 'worst', 'Hermes', 'Workers on SQLite board', 'Missing'],
  ['Mailbox typed channels', 'worst', 'Codex', 'Typed Mailbox', 'JSON Acc only'],
  ['File ownership leases', 'weak', 'Orchestrate / git-mesh', 'Path claims', 'HAR claims partial'],
  ['Merge queue after parallel', 'worst', 'git-mesh', 'Rebase merge queue', 'Missing'],
  ['Risk-tier R0–R2 dispatch', 'weak', 'Orchestrate', 'Deterministic risk tiers', 'ModeAcl'],
  ['Independent C3 arbiter', 'weak', 'Orchestrate', 'Separate arbiter route', 'reviewer preferred'],
  ['state.json run machine', 'strong', 'Orchestrate', 'Transition state machine', 'createJobStore'],
  ['Resumable orchestration', 'weak', 'Orchestrate', 'Resume mid-run', 'interrupt weak'],
  ['Bounded redacted output', 'strong', 'Orchestrate', 'Redact secrets in logs', 'obs elision'],
  ['Agent teams named teammates', 'weak', 'Claude', 'Named teammates + SendMessage', 'TeammateBar'],
  ['Workflow script multi-subagent', 'partial', 'Claude workflows', 'JS workflows many agents', 'invent-ready.js'],
  ['/batch coding fanout', 'worst', 'Claude', 'Batch spawn agents', 'Missing'],
  ['Agent view UI', 'worst', 'Claude Desktop', 'Visual agent view', 'Missing'],
  ['Remote Control coding', 'worst', 'Claude / Antigravity', 'Remote control session', 'Missing'],
  ['Cloud sessions coding', 'worst', 'Claude / Codex cloud', 'Cloud session handoff', 'Missing'],
];
for (const [c, g, l, h, n] of orchCaps) add(c, 'coding', g, l, h, n);

// —— Model routing ——
const routeCaps = [
  ['Static role→model map', 'strong', 'Claude subagents', 'model field per agent', 'coding-roles.json'],
  ['Hybrid frontier-plan cheap-do', 'partial', 'OpenAI hybrid', 'Plan strong execute cheap', 'ensemble parked'],
  ['Per-role pinned model ids UI', 'weak', 'Claude', 'User pins opus/haiku', 'brainRoles'],
  ['Force different-family reviewer', 'weak', 'PairCoder', 'Hard family split', 'pickDifferentFamilyReviewer'],
  ['Small model helper hops', 'weak', 'OpenCode small_model', 'Titles/light tasks', 'Same seat often'],
  ['Zero markup BYOK matrix', 'partial', 'Kilo / Amp', 'No markup on API', 'BYOK path'],
  ['500+ provider menu', 'partial', 'Kilo', 'Huge provider list', 'Multi-model Nova'],
  ['Ad-supported free credits', 'worst', 'Amp Free / Freebuff', 'Ad free tier', 'GGUF instead'],
  ['Outcome memory kNN retrieve', 'weak', 'ACRouter', 'Embedding neighbors', 'JSON log lite'],
  ['Complexity classifier latency', 'worst', 'RouteLLM', '50–200ms classify', 'Length heuristic'],
];
for (const [c, g, l, h, n] of routeCaps) add(c, 'coding', g, l, h, n);

// —— Permissions / safety ——
const permCaps = [
  ['Permission mode Manual/default', 'strong', 'Claude', 'Ask before edits', 'default mode'],
  ['acceptEdits invent mode', 'partial', 'Claude', 'Auto file edits', 'permission-modes-extended'],
  ['dontAsk CI mode', 'partial', 'Claude', 'Deny prompts', 'Acc mapped'],
  ['bypassPermissions disable flag', 'strong', 'Claude', 'Org disable bypass', 'disableBypass true'],
  ['Shift+Tab mode cycle UI', 'weak', 'Claude', 'Cycle modes in UI', 'Modes pack'],
  ['AskUserQuestion MCQ tool', 'weak', 'Claude', 'Structured clarify', 'Prose clarify'],
  ['Hook allow/ask/deny', 'strong', 'Claude hooks', 'Deterministic hooks', 'dont-touch + hooks'],
  ['PreToolUse invent hooks', 'strong', 'Claude', 'Before tool', 'logo lock hooks'],
  ['PostToolUse invent hooks', 'partial', 'Claude', 'After tool', 'hooks pack'],
  ['HTTP invent hooks', 'worst', 'Claude', 'HTTP hook endpoints', 'Missing'],
  ['MCP tool poisoning defenses', 'weak', 'OWASP', 'Untrusted tool desc', 'Partial'],
  ['MCP schema pin/hash', 'weak', 'OWASP', 'Pin schemas', 'Missing'],
  ['Approved MCP registry', 'weak', 'enterprise', 'Org allowlist servers', 'User add free'],
  ['Secrets outside model context', 'partial', 'OneCLI / safe-stack', 'Inject creds gateway', 'secret-preflight'],
  ['Setup-phase vs agent secrets', 'worst', 'Codex Cloud', 'Secrets only in setup', 'Missing'],
  ['Poisoned AGENTS.md scan', 'weak', 'OWASP', 'Scan instruction files', 'Partial'],
  ['Hidden Unicode scan', 'worst', 'OWASP', 'Detect invisible chars', 'Missing'],
];
for (const [c, g, l, h, n] of permCaps) add(c, 'coding', g, l, h, n);

// —— Product invent / builders ——
const prodCaps = [
  ['Prerendered HTML invent publish', 'worst', 'Blink', 'Prerender for SEO', 'Vite SPA'],
  ['SSR invent default stack', 'weak', 'Lovable TanStack', 'SSR apps', 'SPA invent'],
  ['Conversion-trained invent layouts', 'strong', 'Blink / Nova', 'Genre conversion layouts', 'genre + salt'],
  ['Social proof invent section', 'partial', 'Blink', 'Proof blocks', 'genre dependent'],
  ['Motion from invent prompt', 'partial', 'Blink', 'Scroll/hover motion', 'motion-brief Acc'],
  ['Lead form → owned DB', 'partial', 'Blink', 'Forms to SQL', 'leads-stub + server db'],
  ['HubSpot/Sheets invent CRM', 'weak', 'Blink / Base44', 'Native CRM sinks', 'stub sinks'],
  ['Cookie consent invent', 'worst', 'builders', 'Consent banner', 'Missing'],
  ['GDPR privacy page invent', 'partial', 'builders', 'Privacy page', 'public/privacy.md'],
  ['Terms invent scaffold', 'partial', 'builders', 'Terms page', 'public/terms.md'],
  ['PWA invent manifest', 'partial', 'Bolt', 'manifest + SW', 'manifest Acc'],
  ['Service worker invent cache', 'weak', 'Bolt', 'Offline cache', 'sw.js stub'],
  ['i18n invent locale packs', 'weak', 'Lovable', 'Multi locale', 'en Acc'],
  ['RTL invent layout', 'worst', 'field', 'RTL support', 'i18n rtlReady flag'],
  ['Blog/MDX invent CMS', 'weak', 'Framer / v0', 'Blog from prompt', 'SPA invent'],
  ['Form → webhook invent', 'weak', 'Lovable', 'Webhook forms', 'UI only'],
  ['Edge function invent deploy', 'worst', 'Bolt / Replit', 'Edge functions', 'Desktop'],
  ['Cron invent scheduled jobs', 'worst', 'Replit', 'Cron jobs', 'automations Acc'],
  ['Preview URL invent share', 'weak', 'Vercel / Bolt', 'Shareable preview', 'local preview'],
  ['Password-protect invent preview', 'worst', 'Vercel', 'Protected preview', 'Missing'],
  ['Comment threads invent preview', 'worst', 'Lovable', 'Preview comments', 'Single user'],
  ['Design tokens invent export', 'strong', 'v0', 'Token export', 'brand-kit + stylelock'],
  ['Storybook invent from Acc', 'worst', 'v0', 'Storybook gen', 'Missing'],
  ['Visual regression invent gate', 'partial', 'Chromatic', 'Visual diff gate', 'Live screenshot'],
  ['E2E Playwright invent pack', 'partial', 'field', 'E2E suite', 'smoke scripts'],
  ['Bundle size invent budget', 'worst', 'Bolt', 'Size budget', 'Missing'],
  ['SBOM invent export', 'worst', 'enterprise', 'SBOM', 'Missing'],
  ['License invent compliance', 'worst', 'GitHub', 'License scan', 'Missing'],
  ['Dependency audit invent', 'worst', 'GitHub', 'vuln scan', 'Missing'],
  ['Changelog invent auto', 'partial', 'field', 'Auto changelog', 'changelog lib'],
  ['Conventional invent commits', 'partial', 'Aider', 'Conventional msgs', 'aider-commit'],
  ['Conflict invent resolve assist', 'worst', 'Cursor', 'Merge conflict AI', 'Missing'],
  ['Extract component invent', 'partial', 'Cursor', 'Extract component', 'NES + edit'],
  ['Rename project-wide invent', 'partial', 'JetBrains / Claude', 'Safe rename', 'edit Acc'],
  ['Generate invent README', 'strong', 'field', 'README gen', 'fresh SPA + AGENTS'],
  ['Dark/light invent theme', 'partial', 'v0', 'Theme toggle', 'genre CSS'],
  ['Responsive invent mobile-first', 'strong', 'Blink', 'Mobile-first', 'quality gates'],
  ['Print stylesheet invent', 'worst', 'marketing', 'Print CSS', 'Missing'],
  ['Offline invent preview', 'partial', 'field', 'Offline local', 'desktop'],
  ['Currency invent localization', 'weak', 'Shopify AI', 'Currency formats', 'plain prices'],
  ['Tax invent checkout', 'worst', 'Shopify', 'Tax rules', 'Out of scope'],
  ['Inventory invent sync', 'worst', 'Shopify', 'Inventory', 'Static catalog'],
  ['Abandoned cart invent emails', 'worst', 'Shopify', 'Cart emails', 'Missing'],
  ['Newsletter invent embed', 'weak', 'Framer', 'Newsletter', 'UI form'],
  ['Chat widget invent embed', 'weak', 'Intercom', 'Chat widget', 'Watch'],
  ['A/B invent experiment flags', 'worst', 'Vercel', 'Experiments', 'Missing'],
  ['Feature flag invent SDK', 'worst', 'LaunchDarkly', 'Flags', 'Missing'],
  ['Error boundary invent Acc', 'partial', 'React field', 'Error boundaries', 'scaffolds'],
  ['Sentry invent one-shot', 'worst', 'Continue', 'Sentry setup', 'Missing'],
  ['Log drain invent', 'worst', 'Replit', 'Log drains', 'Missing'],
  ['Uptime invent monitor', 'worst', 'Blink', 'Uptime', 'Desktop local'],
  ['Status page invent', 'worst', 'marketing', 'Status page', 'Missing'],
  ['Webhook invent receiver', 'worst', 'Replit', 'Inbound webhooks', 'Missing'],
  ['GraphQL invent API', 'weak', 'Bolt', 'GraphQL scaffold', 'REST stub'],
  ['tRPC invent scaffold', 'worst', 'v0', 'tRPC', 'Missing'],
  ['Prisma invent schema', 'weak', 'Bolt', 'Prisma', 'fullstack stub'],
  ['Drizzle invent schema', 'worst', 'Bolt', 'Drizzle', 'Missing'],
  ['Redis invent cache', 'worst', 'Replit', 'Redis', 'Missing'],
  ['Queue invent jobs', 'partial', 'field', 'Job queue', 'workQueue'],
  ['WebSocket invent realtime', 'worst', 'Replit', 'WebSockets', 'Single user'],
  ['WebRTC invent video', 'worst', 'field', 'WebRTC', 'Out of scope'],
  ['Three.js invent genre', 'weak', 'v0', '3D genre', 'game canvas stub'],
  ['Notion invent sync coding', 'partial', 'field', 'Notion integration', 'notion.ts'],
  ['Linear invent ticket link', 'partial', 'field', 'Linear', 'linear.ts'],
  ['Slack invent Ready notify', 'partial', 'Continue', 'Slack notify', 'slack.ts'],
  ['Discord invent Ready notify', 'partial', 'OpenClaw', 'Discord', 'discord.ts'],
  ['Google Drive invent assets', 'partial', 'field', 'GDrive pull', 'gdrive.ts'],
  ['Figma invent token pull', 'partial', 'Figma Make', 'Figma tokens', 'figma.ts'],
  ['GitHub invent Issues board', 'weak', 'Copilot', 'Issues', 'github.ts'],
];
for (const [c, g, l, h, n] of prodCaps) add(c, 'product', g, l, h, n);

// —— Vendor-specific coding ——
const vendorCaps = [
  ['Claude Code Terminal-Bench top score path', 'worst', 'Claude Code', '64.8% Terminal-Bench', 'No TB harness'],
  ['Codex $1.92/task efficiency path', 'worst', 'Codex', 'Cost-efficient cloud tasks', 'Local invent'],
  ['Cursor Composer multi-file', 'partial', 'Cursor', 'Composer agent edits', 'Acc multi-file'],
  ['Cursor cloud agents BG', 'worst', 'Cursor', 'Background cloud agents', 'Missing'],
  ['Cursor Bugbot PR review', 'partial', 'Cursor', 'PR bug review automation', 'bugbot-invent Acc'],
  ['Cursor Automations marketplace', 'worst', 'Cursor', 'Automation templates', 'Missing'],
  ['Cursor Memories across runs', 'partial', 'Cursor', 'MEMORIES.md automation', 'MEMORIES Acc'],
  ['Copilot issue assign → PR', 'worst', 'Copilot', 'Assign issue get PR', 'Missing'],
  ['Copilot Playwright MCP default', 'weak', 'Copilot cloud', 'Playwright on by default', 'smoke scripts'],
  ['Copilot custom agents share', 'weak', 'Copilot', 'Org custom agents', 'skills local'],
  ['Amp orbs cloud machines', 'worst', 'Amp', 'Cloud orb runners', 'orb stub'],
  ['Amp Oracle architecture review', 'partial', 'Amp', 'Oracle subagent', 'oracle Acc'],
  ['Amp Librarian lib research', 'partial', 'Amp', 'Librarian subagent', 'librarian Acc'],
  ['Amp Painter visual', 'partial', 'Amp', 'Painter image gen', 'logo/brand kit'],
  ['Devin browser use coding', 'worst', 'Devin', 'Browser in cloud agent', 'Live CDP partial'],
  ['Devin Knowledge playbooks', 'weak', 'Devin', 'Org knowledge retrieval', 'Partial'],
  ['Devin Local↔Cloud handoff', 'worst', 'Devin', 'Same harness dual', 'Missing'],
  ['Antigravity agent manager UI', 'worst', 'Antigravity', 'Manage parallel agents UI', 'Acc only'],
  ['Antigravity per-project MCP scope', 'partial', 'Antigravity', 'MCP per project', 'mcp.json'],
  ['Antigravity browser agent', 'partial', 'Antigravity', 'Built-in Chrome agent', 'Live grade'],
  ['Antigravity SDK harness', 'worst', 'Antigravity', 'Python SDK agents', 'Missing'],
  ['Kiro EARS artifacts UI', 'weak', 'Kiro', 'EARS requirements UI', 'kiro-spec md'],
  ['Kiro on-save hooks live', 'weak', 'Kiro', 'Hooks on file save', 'kiro-hooks Acc'],
  ['Kiro .kiro steering', 'partial', 'Kiro', 'Steering folder', '.nova/steering'],
  ['Kiro CLI invent parity', 'weak', 'Kiro', 'CLI shares IDE agents', 'Desktop primary'],
  ['Kiro credit invent pricing', 'strong', 'Kiro anti', 'Credits burn', 'GGUF free'],
  ['Qoder RepoWiki living', 'partial', 'Qoder', 'Auto wiki from code', 'repo-wiki.md'],
  ['Qoder Quest Mode', 'partial', 'Qoder', 'Autonomous multi-file', 'quest-mode Acc'],
  ['Trae SOLO builder mode', 'partial', 'Trae', 'Less step review', 'trae-builder + Plan'],
  ['TraeWork general assistant', 'worst', 'Trae', 'Non-coding work agent', 'Coding invent focus'],
  ['Windsurf Cascade flows', 'partial', 'Windsurf', 'Flow-aware agent', 'create pass spine'],
  ['Windsurf Supercomplete', 'partial', 'Windsurf', 'Next-edit predict', 'NES partial'],
  ['Windsurf enterprise self-host', 'partial', 'Windsurf', 'Self-host Cascade', 'air-gap privacy'],
  ['Cline Plan/Act approve', 'strong', 'Cline', 'Plan then Act', 'Plan + inventNeedsPlanApprove'],
  ['Cline Kanban app', 'worst', 'Cline', 'Kanban surface', 'Missing'],
  ['Cline @cline/sdk', 'worst', 'Cline', 'Public agent SDK', 'Internal packs'],
  ['OpenCode 75+ providers', 'partial', 'OpenCode', 'Huge provider matrix', 'BYOK + GGUF'],
  ['OpenCode share links', 'weak', 'OpenCode', 'Share session links', 'Partial'],
  ['OpenCode /btw ephemeral', 'worst', 'OpenCode', 'Side Q without pollute', 'Missing'],
  ['OpenCode /undo /redo', 'weak', 'OpenCode', 'Turn undo/redo', 'rollback partial'],
  ['Aider --architect dual model', 'strong', 'Aider', 'Architect + editor', 'Plan then invent'],
  ['Aider --test-cmd loop', 'partial', 'Aider', 'Auto test iterate', 'postPatchVerify'],
  ['Aider voice-to-code', 'partial', 'Aider', 'Voice edits', 'voiceSession chat'],
  ['Aider auto-commit per edit', 'partial', 'Aider', 'Git commit each change', 'End commit optional'],
  ['Goose 70+ MCP extensions', 'partial', 'Goose', 'MCP proving ground', 'MCP subset'],
  ['Goose AAIF governance', 'partial', 'Goose', 'LF AAIF neutral', 'MCP + AGENTS'],
  ['Pi minimal system prompt', 'weak', 'Pi', 'Minimal harness', 'Rich Nova prompts'],
  ['Hermes self-improving skills', 'weak', 'Hermes', 'Writes own skills', 'Static skills'],
  ['Hermes Docker/SSH/Modal backends', 'worst', 'Hermes', 'Many backends', 'Desktop'],
  ['OpenClaw 29 messaging channels', 'worst', 'OpenClaw', 'Messaging daemon', 'notify libs'],
  ['AdaL worker agents @skills', 'weak', 'AdaL', 'Native @skills workers', 'skills Acc'],
  ['Freebuff no-key free agent', 'weak', 'Freebuff', 'Ad-funded free', 'GGUF free'],
  ['Droid Terminal-Bench leader', 'worst', 'Factory Droid', 'TB leader specialized', 'No TB'],
  ['Droid Computers cloud', 'worst', 'Factory', 'Droid Computers', 'Missing'],
  ['Junie JetBrains native', 'worst', 'Junie', 'JetBrains agentic', 'Electron only'],
  ['Amazon Q AWS infra coding', 'worst', 'Amazon Q', 'AWS-native agent', 'Out of invent'],
  ['Tabby self-host completion', 'partial', 'Tabby', 'Self-host completions', 'local GGUF'],
  ['Cody enterprise code graph', 'worst', 'Cody', 'Multi-repo graph', 'Single project'],
  ['Superset multi-CLI hub', 'partial', 'Superset', 'Any CLI in worktrees', 'worktree + ACP Acc'],
  ['Superset Design Mode browser', 'partial', 'Superset', 'In-app browser design', 'CTS + Live'],
  ['Superset iPhone remote', 'weak', 'Superset', 'Mobile remote invent', 'remote-continue stub'],
  ['Bolt WebContainers zero-install', 'worst', 'Bolt', 'In-browser Node', 'Electron'],
  ['Bolt Cloud invent backend', 'weak', 'Bolt', 'Hosted backend', 'fullstack stub'],
  ['v0 shadcn Design Mode free', 'partial', 'v0', 'Free design edits', 'CTS local'],
  ['v0 security scanning', 'partial', 'v0', 'Security scan invent', 'secret-preflight'],
  ['Lovable TanStack SSR invent', 'weak', 'Lovable', 'SSR default', 'SPA'],
  ['Lovable two-way GitHub sync', 'weak', 'Lovable', 'GitHub sync', 'Local first'],
  ['Lovable credit burn risk', 'strong', 'Lovable anti', 'Credits burn loops', 'GGUF no burn'],
  ['Replit Agent v4 autonomous', 'partial', 'Replit', 'Full app from prompt', 'create spine'],
  ['Replit multiplayer editing', 'worst', 'Replit', 'Realtime collab', 'Single user'],
  ['Replit Auth invent', 'worst', 'Replit', 'Hosted auth', 'scaffold stubs'],
  ['Blink SEO 0–100 live scan', 'worst', 'Blink', 'Live URL scan', 'Acc audit'],
  ['Blink RevenueCat IAP', 'worst', 'Blink', 'Native IAP', 'Web invent'],
  ['Base44 customize template', 'weak', 'Base44', 'Template anchored', 'code Acc ownership'],
  ['Framer AI marketing invent', 'weak', 'Framer', 'Marketing sites', 'Code invent'],
  ['Wix/Durable no-code AI', 'weak', 'Wix / Durable', 'No-code AI sites', 'Code invent'],
  ['Hostinger AI builder', 'worst', 'Hostinger', 'Hosted AI sites', 'Out of scope'],
  ['Squarespace AI lane', 'worst', 'Squarespace', 'Template AI', 'Out of scope'],
  ['Dyad / InBuild invent peer', 'partial', 'Dyad / InBuild', 'Invent peers', 'invent craft pack'],
  ['Stagewise visual edit Strong', 'strong', 'Stagewise', 'Click edit code', 'CTS'],
  ['Figma Make design→code', 'weak', 'Figma Make', 'Design to code', 'image-to-invent'],
  ['Builder.io visual CMS', 'worst', 'Builder.io', 'Visual CMS code', 'Missing'],
];
for (const [c, g, l, h, n] of vendorCaps) add(c, 'coding', g, l, h, n);

// —— Protocols / standards ——
const protoCaps = [
  ['MCP default invent path', 'partial', 'AAIF MCP', 'MCP everywhere', 'MCP subset'],
  ['A2A agent-to-agent', 'weak', 'AAIF A2A', 'Cross-platform delegate', 'stubs'],
  ['AGENTS.md always-on', 'strong', 'AAIF', 'Project instructions', 'AGENTS.md'],
  ['Agent Skills open standard', 'partial', 'agentskills.io', 'Portable SKILL.md', 'novaSkills'],
  ['ACP harness hosting role', 'weak', 'OpenHands', 'Host foreign CLIs', 'guest stub'],
  ['agentgateway policy layer', 'worst', 'AAIF', 'Gateway for models+MCP', 'Direct route'],
  ['Trajectory export standard', 'weak', 'field', 'Portable transcripts', 'AgentTrace'],
  ['Prompt-cache stable prefixes', 'weak', 'DeepSeek / Codewhale', 'Cache-stable prompts', 'Partial'],
  ['Skills lead MCP adoption', 'strong', 'harness study', 'Skills first', 'skills-first pack'],
  ['No LangChain dependency', 'strong', 'harness study', 'Hand-rolled loops', 'novaAgentLoop'],
  ['Deterministic retrieval preference', 'strong', 'harness study', 'rg over vectors', 'grep + map'],
  ['Meta-harness router', 'strong', 'Omnigent-class', 'Route invent/loop/surgical', 'routeMetaHarness'],
  ['Agent-authored skills create', 'worst', 'field', 'Agent writes SKILL.md', 'Static'],
  ['Trust tiers skill/MCP registry', 'worst', 'registries', 'Trust tiers', 'Missing'],
  ['Session importer Claude→Nova', 'weak', 'Codex imports Claude', 'Import sessions', 'thin stub'],
  ['OpenAI-compatible agent endpoint', 'worst', 'field SDKs', 'Agent as model API', 'Missing'],
  ['Harness-as-SDK publish', 'weak', '2026 harnesses', 'Importable SDK', 'Internal packs'],
  ['MDM enterprise pin invent', 'worst', 'Grok / Cursor', 'MDM pins', 'Missing'],
];
for (const [c, g, l, h, n] of protoCaps) add(c, 'protocol', g, l, h, n);

// —— Nova Strong inventory (fine) ——
const novaStrong = [
  ['Invent demo host-side compose', 'Nova', 'Host invent when model stalls', 'composeInventDemoSite'],
  ['Invent brand kit Acc', 'Nova', 'Tokens on disk', 'brand-kit.json'],
  ['Invent invent-spec Acc', 'Nova', 'Spec on disk', 'invent-spec.json'],
  ['Invent steering files', 'Nova', 'product/tech/structure', '.nova/steering'],
  ['Invent layout salt 0–3', 'Nova', 'Unique compositions', 'inventLayoutSalt'],
  ['Invent SKU glyphs 12', 'Nova', 'Per-SKU SVG', 'attachSkuGlyphFiles'],
  ['Invent allowStockPhotos brief', 'Nova', 'Openverse gate', 'inventBriefAllowsStock'],
  ['Invent modes pack', 'Nova', 'Plan/Act modes', 'modeConfigFiles'],
  ['Invent acp registry Acc', 'Nova', 'ACP registry', 'platform pack'],
  ['Invent wave4 brain/skills', 'Nova', 'brain + skills', 'attachWave4PackFiles'],
  ['Invent wave5 permission-mode', 'Nova', 'permission modes', 'attachWave5PackFiles'],
  ['Invent wave5 stylelock', 'Nova', 'stylelock export', 'wave5'],
  ['Invent wave5 path rules', 'Nova', 'path-scoped rules', '.nova/rules'],
  ['Invent field privacy-mode', 'Nova', 'air-gap Acc', 'privacyModeFiles'],
  ['Invent field sandbox profile', 'Nova', 'sandbox Acc', 'inventSandboxProfileFiles'],
  ['Invent field quality gates', 'Nova', 'quality gates Acc', 'inventQualityGatesFiles'],
  ['Invent field nested AGENTS', 'Nova', 'nested agents', 'nestedAgentsFiles'],
  ['Invent field chat-fork', 'Nova', 'fork Acc', 'chatForkFiles'],
  ['Invent SEO llms.txt', 'Nova', 'llms.txt', 'inventSeoGateFiles'],
  ['Invent SEO sitemap/robots', 'Nova', 'sitemap+robots', 'SEO pack'],
  ['Invent FAQ JSON-LD', 'Nova', 'faq-jsonld', 'SEO pack'],
  ['Invent secret SARIF', 'Nova', 'SARIF Acc', 'secretPreflightFiles'],
  ['Invent secret allowlist', 'Nova', 'allowlist Acc', 'secret-allowlist'],
  ['Invent craft modes rush/smart/deep', 'Nova', 'craft-modes', 'inventCraftModesFiles'],
  ['Invent coding roles Acc', 'Nova', 'role roster', 'coding-roles.json'],
  ['Invent coding loop Acc', 'Nova', 'plan→heal loop', 'coding-loop.json'],
  ['Invent coding outcomes Acc', 'Nova', 'outcome memory', 'coding-outcomes'],
  ['Invent coding diagnostics Acc', 'Nova', 'diagnostics lite', 'coding-diagnostics'],
  ['Invent coding audit jsonl', 'Nova', 'append audit', 'appendCodingAuditEvent'],
  ['Invent game canvas scaffold', 'Nova', 'src/game', 'inventGameScaffoldFiles'],
  ['Invent fullstack server stub', 'Nova', 'server/api', 'inventFullstackScaffoldFiles'],
  ['Invent worker DAG Acc', 'Nova', 'path-owned workers', 'runCodingWorkerDag'],
  ['Invent symbols lite Acc', 'Nova', 'outline Acc', 'codingSymbolsLite'],
  ['Invent close-all manifest', 'Nova', 'close-all pack', 'attachCloseAllPackFiles'],
  ['Smoke invent craft pack', 'Nova', 'Strong-bar smoke', 'smoke-invent-craft-pack'],
];
for (const [c, l, h, n] of novaStrong) add(c, 'coding', 'strong', l, h, n);

// more tools into TOOLS array
const moreTools = [
  'Kane CLI', 'Tembo', 'Cosine', 'Manus', 'ForgeCode', 'Letta', 'Deep Agents', 'Augment',
  'Qodo', 'Zencoder', 'CodeGeeX', 'Blackbox', 'Builder.io', 'Anima', 'Locofy', 'Kombai',
  'Stitch', 'Onlook', 'FlutterFlow', 'Draftbit', 'Superblocks', 'Agentforce', 'Tessl',
  'Roomote', 'Ona', 'Pythagora', 'HeyBoss', 'YouWare', 'Miaoda', 'Readdy', 'Floot',
  'Atoms', 'Chef', 'Tempo', 'Rocket', 'Macaly', 'a0.dev', 'CatDoes', 'Vibecode',
  'Anything', 'Emergent', 'Rork', 'Canva Code', 'Google AI Studio', 'CodeBuddy', 'ZCode',
  'Verdent', 'Bito', 'avante.nvim', 'CodeCompanion', 'mini-swe-agent', 'Command Code',
];

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const lines = batch.map(
  ([cap, lane, nova, leader, how, now]) =>
    `  {\n    capability: '${esc(cap)}',\n    lane: '${lane}',\n    nova: '${nova}',\n    leader: '${esc(leader)}',\n    howTheyDoIt: '${esc(how)}',\n    novaNow: '${esc(now)}',\n  },`,
);

const marker = '  // —— STRONG (real Nova wiring) ——';
const idx = t.indexOf(marker);
if (idx < 0) throw new Error('STRONG marker missing');
t = `${t.slice(0, idx)}${lines.join('\n')}\n\n${t.slice(idx)}`;

// expand TOOLS
const toolsMatch = t.match(/const TOOLS = \[([\s\S]*?)\];/);
if (toolsMatch) {
  let toolsBlock = toolsMatch[1];
  for (const tool of moreTools) {
    if (!toolsBlock.includes(`'${tool}'`)) {
      toolsBlock = toolsBlock.replace(/\s*$/, `\n  '${tool}',`);
    }
  }
  t = t.replace(toolsMatch[0], `const TOOLS = [${toolsBlock}\n];`);
}

// bump callout target
t = t.replace(
  /Open = \{open\}\. Retest when open drops/,
  'Target 500+ rows (more better). Open = {open}. Retest when open drops',
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
  tools: ((t.match(/const TOOLS = \[([\s\S]*?)\];/) || [])[1].match(/'/g) || []).length / 2,
});
