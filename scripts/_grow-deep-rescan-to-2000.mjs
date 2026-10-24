/**
 * Final saturation push toward ~2000 for "normal Nova" coverage.
 * Focus: coding loop + full app vs field (not exotic enterprise-only).
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

// —— Normal invent / create path (end-to-end) ——
addAll('coding', [
  ['Create invent brief clarify ask', 'partial', 'GPT Engineer / Nova', 'Clarify before scaffold', 'create brief'],
  ['Create invent name collision avoid', 'partial', 'Nova', 'Unique project names', 'Partial'],
  ['Create invent folder on disk', 'strong', 'Nova', 'Write project root', 'novaProjects'],
  ['Create invent package.json valid', 'strong', 'Nova', 'Valid package.json', 'freshSpa'],
  ['Create invent vite config valid', 'strong', 'Nova', 'vite.config', 'freshSpa'],
  ['Create invent index.html entry', 'strong', 'Nova', 'index.html', 'freshSpa'],
  ['Create invent App.tsx mount', 'strong', 'Nova', 'App mount', 'freshSpa'],
  ['Create invent CSS tokens', 'strong', 'Nova', 'Design tokens CSS', 'craft'],
  ['Create invent npm install auto', 'partial', 'Capstone / Nova', 'autoInstall once', 'autoInstall'],
  ['Create invent preview start', 'strong', 'Nova', 'Live preview', 'novaPreview'],
  ['Create invent Ready before Live', 'strong', 'Nova', 'Ready gate', 'createReady'],
  ['Create invent syntax before Ready', 'strong', 'Nova', 'Syntax gate', 'createSyntaxGate'],
  ['Create invent build quality gate', 'strong', 'Nova', 'Build quality', 'createBuildQuality'],
  ['Create invent evidence artifacts', 'strong', 'Nova', 'Evidence pack', 'createEvidence'],
  ['Create invent rollback checkpoint', 'strong', 'Nova', 'Checkpoint', 'createCheckpoint'],
  ['Create invent stall detect', 'partial', 'Nova', 'Stall watch', 'live-stall-watch'],
  ['Create invent budget abort', 'partial', 'Nova', 'Budget abort', 'budget'],
  ['Create invent doom-loop stop', 'strong', 'Nova', 'Same-fail stop', 'doom-loop'],
  ['Create invent user stop button', 'strong', 'Nova', 'Stop hung job', 'wired'],
  ['Create invent progress UI', 'strong', 'Nova', 'Job progress', 'createJobStore'],
  ['Create invent error surface chat', 'strong', 'Nova', 'Errors in chat', 'wired'],
  ['Create invent success summary', 'strong', 'Nova', 'Done summary', 'wired'],
  ['Create invent open Live panel', 'strong', 'Nova', 'Open preview', 'wired'],
  ['Create invent open Code panel', 'partial', 'Nova', 'Open code', 'check-create-no-auto-open'],
  ['Create invent bind studio thread', 'strong', 'Nova', 'Bind project↔chat', 'chatStudio'],
  ['Create invent unbind studio', 'partial', 'Nova', 'Unbind project', 'Partial'],
  ['Create invent re-run craft pass', 'partial', 'Nova', 'Re-craft', 'Partial'],
  ['Create invent redesign bound', 'partial', 'Nova', 'Redesign in place', 'Partial'],
  ['Create invent thin path fast', 'strong', 'Nova', 'Thin create', 'createThinPath'],
  ['Create invent storefront path', 'strong', 'Nova', 'Storefront ladder', 'wired'],
  ['Create invent blank/solid path', 'strong', 'Nova', 'Blank solid', 'wired'],
  ['Create invent image brief path', 'partial', 'Nova', 'Image→invent', 'image-to-invent'],
  ['Create invent multi-page site', 'weak', 'v0 / Framer', 'Multi-route site', 'Partial'],
  ['Create invent blog section', 'weak', 'field', 'Blog section', 'Partial'],
  ['Create invent pricing section', 'partial', 'field', 'Pricing', 'storefront'],
  ['Create invent FAQ section', 'partial', 'field', 'FAQ', 'structured-data'],
  ['Create invent contact form', 'weak', 'field', 'Contact form', 'Partial'],
  ['Create invent nav+footer', 'strong', 'Nova', 'Nav/footer craft', 'craft'],
  ['Create invent mobile responsive', 'strong', 'Nova', 'Mobile layout', 'Live+craft'],
  ['Create invent brand hero', 'strong', 'Nova', 'Brand-first hero', 'craft rules'],
  ['Create invent anti-slop colors', 'strong', 'Nova', 'Anti purple/cream bias', 'craft rules'],
  ['Create invent motion presence', 'strong', 'Nova', '2–3 motions', 'craft rules'],
  ['Create invent a11y basics', 'partial', 'field', 'Labels/landmarks', 'a11y Acc'],
  ['Create invent SEO basics', 'partial', 'Blink / Nova', 'Title/meta/OG', 'head meta'],
  ['Create invent favicon', 'weak', 'field', 'Favicon', 'Partial'],
  ['Create invent og image', 'weak', 'field', 'OG image', 'open-graph Acc'],
  ['Create invent 404 page', 'weak', 'field', '404 route', 'Partial'],
  ['Create invent loading state', 'weak', 'field', 'Loading UI', 'Partial'],
  ['Create invent empty state', 'weak', 'field', 'Empty states', 'Partial'],
]);

// —— Normal edit / ask / agent path ——
addAll('coding', [
  ['Edit invent natural language', 'strong', 'Nova', 'NL edit request', 'edit path'],
  ['Edit invent scoped file', 'partial', 'Claude', 'Edit one file', 'Partial'],
  ['Edit invent multi-file', 'partial', 'Cursor Composer', 'Multi-file edit', 'agent loop'],
  ['Edit invent show diff before apply', 'partial', 'IDE', 'Diff preview', 'Partial'],
  ['Edit invent accept/reject', 'partial', 'IDE', 'Accept/reject', 'chat apply'],
  ['Edit invent undo turn', 'partial', 'Capstone', 'Undo last turn', 'checkpoint'],
  ['Edit invent keep layout on rename', 'strong', 'Nova', 'Rename keep layout', 'smoke-rename'],
  ['Edit invent remove words surgical', 'strong', 'Nova', 'Surgical remove', 'smoke-remove'],
  ['Edit invent solid bg fullbleed', 'strong', 'Nova', 'Solid bg edit', 'smoke-solid'],
  ['Edit invent show sentence', 'strong', 'Nova', 'Show sentence', 'smoke-show'],
  ['Edit invent dual-side words', 'strong', 'Nova', 'Dual side words', 'smoke-dual'],
  ['Edit invent adjacent jsx heal', 'strong', 'Nova', 'Adjacent JSX heal', 'smoke-adjacent'],
  ['Edit invent code fence promote', 'strong', 'Nova', 'Fence→files', 'smoke-code-fence'],
  ['Ask invent plain chat', 'strong', 'Nova', 'Plain Q&A', 'plainChatAsk'],
  ['Ask invent codebase grounded', 'partial', 'Cody / Cursor', 'Answer from repo', 'repo map'],
  ['Ask invent cite file paths', 'partial', 'field', 'Cite paths', 'Partial'],
  ['Ask invent no invent hijack', 'strong', 'Nova', 'Ask≠create', 'classifyTurn'],
  ['Ask invent fidelity contract', 'strong', 'Nova', 'Ask fidelity', 'smoke-ask'],
  ['Agent invent tool loop', 'strong', 'Nova', 'Tool-using loop', 'novaAgentLoop'],
  ['Agent invent read before write', 'strong', 'Agent47 / Nova', 'Re-read disk', 'wired'],
  ['Agent invent patch prefer', 'partial', 'Codex / Nova', 'Prefer patches', 'novaAgentPatch'],
  ['Agent invent shell gated', 'partial', 'Capstone', 'Shell ask/allow', 'terminal-policy'],
  ['Agent invent max steps', 'strong', 'field', 'Step budget', 'wired'],
  ['Agent invent cancel mid-turn', 'strong', 'Nova', 'Cancel', 'wired'],
  ['Agent invent trace visible', 'strong', 'Nova', 'Trace panel', 'AgentTrace'],
  ['Agent invent work timeline', 'strong', 'Nova', 'WorkTrace', 'wired'],
  ['Agent invent plan mode', 'strong', 'Cursor / Nova', 'Plan before act', 'Plan/Act'],
  ['Agent invent act mode', 'strong', 'Nova', 'Act with tools', 'wired'],
  ['Agent invent human approve edit', 'partial', 'Capstone', 'Ask on edit', 'Partial'],
  ['Agent invent dont-touch honor', 'strong', 'Nova', 'Never-touch paths', 'dont-touch'],
  ['Agent invent @file attach', 'strong', 'Nova', '@mentions', 'wired'],
  ['Agent invent slash command', 'strong', 'Nova', '/commands', 'wired'],
  ['Agent invent NES suggest', 'strong', 'Nova', 'Next-edit suggest', 'ChatCodeOverlay'],
  ['Agent invent Live screenshot see', 'partial', 'Claude vision', 'See preview', 'previewCapture'],
  ['Agent invent console from Live', 'partial', 'CDP', 'Console errors', 'Partial'],
  ['Agent invent verify after edit', 'partial', 'HAR', 'Verify step', 'Live+smokes'],
  ['Agent invent fail-to-pass', 'partial', 'SWE-bench', 'F2P', 'harness'],
  ['Agent invent empty patch fail', 'strong', 'SWE-Bench Pro', 'Empty fails', 'wired'],
  ['Agent invent network allowlist verify', 'strong', 'SWE-Bench Pro', 'Net policy', 'wired'],
  ['Agent invent elide old tool outs', 'strong', 'HAR', 'Elision', 'wired'],
  ['Agent invent seat cheap tools', 'partial', 'Amp', 'Cheap for grep', 'seat swap'],
  ['Agent invent seat strong hard', 'partial', 'Cursor', 'Strong for hard', 'seat swap'],
  ['Agent invent local GGUF fallback', 'strong', 'Nova', 'Local model', 'GGUF'],
  ['Agent invent BYOK cloud', 'strong', 'Nova', 'BYOK keys', 'wired'],
  ['Agent invent model picker UI', 'strong', 'Nova', 'Model seats UI', 'SettingsModels'],
  ['Agent invent token usage ring', 'strong', 'Nova', 'Token ring', 'wired'],
]);

// —— Normal app shell / UX vs others ——
addAll('product', [
  ['App invent onboarding first run', 'strong', 'Nova', 'Onboarding screen', 'OnboardingScreen'],
  ['App invent settings general', 'strong', 'Nova', 'Settings general', 'wired'],
  ['App invent settings models', 'strong', 'Nova', 'Settings models', 'wired'],
  ['App invent settings privacy', 'strong', 'Nova', 'Settings privacy', 'wired'],
  ['App invent settings advanced', 'strong', 'Nova', 'Settings advanced', 'wired'],
  ['App invent local prefs persist', 'strong', 'Nova', 'localPrefs', 'wired'],
  ['App invent auth context', 'partial', 'Nova', 'AuthContext', 'wired soft'],
  ['App invent project list', 'strong', 'Nova', 'Projects', 'wired'],
  ['App invent project open', 'strong', 'Nova', 'Open project', 'wired'],
  ['App invent project delete', 'strong', 'Nova', 'Delete flow', 'deleteProjectFlow'],
  ['App invent recent projects', 'strong', 'Nova', 'Recents', 'recentStore'],
  ['App invent chat threads', 'strong', 'Nova', 'Threads', 'chatHistory'],
  ['App invent chat send', 'strong', 'Nova', 'Send message', 'useAIChatSend'],
  ['App invent chat stop', 'strong', 'Nova', 'Stop generation', 'wired'],
  ['App invent chat markdown', 'strong', 'Nova', 'Markdown render', 'chatMarkdown'],
  ['App invent chat code blocks', 'strong', 'Nova', 'Code in chat', 'wired'],
  ['App invent chat drop files', 'strong', 'Nova', 'Drop files', 'chatDrop'],
  ['App invent chat media turn', 'partial', 'Nova', 'Media in turn', 'chatMediaTurn'],
  ['App invent teammate bar', 'partial', 'Nova', 'Teammate seats', 'TeammateBar'],
  ['App invent code editor', 'strong', 'Nova', 'CodeEditor', 'wired'],
  ['App invent Live preview pane', 'strong', 'Nova', 'Preview pane', 'novaPreview'],
  ['App invent Plan open pill', 'strong', 'Nova', 'PlanOpenPill', 'wired'],
  ['App invent AgentTrace panel', 'strong', 'Nova', 'AgentTracePanel', 'wired'],
  ['App invent WorkTrace', 'strong', 'Nova', 'WorkTrace', 'wired'],
  ['App invent TokenUsageRing', 'strong', 'Nova', 'Token ring', 'wired'],
  ['App invent Discord integrate', 'partial', 'Nova', 'discord.ts', 'partial'],
  ['App invent Slack integrate', 'partial', 'Nova', 'slack.ts', 'partial'],
  ['App invent Linear integrate', 'partial', 'Nova', 'linear.ts', 'partial'],
  ['App invent Notion integrate', 'partial', 'Nova', 'notion.ts', 'partial'],
  ['App invent GitHub integrate', 'partial', 'Nova', 'github.ts', 'partial'],
  ['App invent Figma integrate', 'partial', 'Nova', 'figma.ts', 'partial'],
  ['App invent GDrive integrate', 'partial', 'Nova', 'gdrive.ts', 'partial'],
  ['App invent website marketing', 'partial', 'Nova', 'website HomePage', 'partial'],
  ['App invent Electron desktop', 'strong', 'Nova', 'Electron shell', 'wired'],
  ['App invent preload bridge', 'strong', 'Nova', 'preload.cjs', 'wired'],
  ['App invent LocalAI view', 'strong', 'Nova', 'LocalAI view', 'wired'],
  ['App invent Models view', 'strong', 'Nova', 'ModelsView', 'wired'],
  ['App invent Message view', 'strong', 'Nova', 'MessageView', 'wired'],
  ['App invent Project workspace', 'strong', 'Nova', 'ProjectWorkspace', 'wired'],
  ['App invent AI chat frame', 'strong', 'Nova', 'AIChatFrame', 'wired'],
  ['App invent router context', 'strong', 'Nova', 'RouterContext', 'wired'],
  ['App invent AppShell chrome', 'strong', 'Nova', 'AppShell', 'wired'],
]);

// —— Field products normal features we must know ——
addAll('coding', [
  ['Cursor invent Composer Agent', 'weak', 'Cursor', 'Composer agent', 'agent loop'],
  ['Cursor invent Tab NES', 'weak', 'Cursor', 'Tab complete', 'NES'],
  ['Cursor invent @Codebase', 'partial', 'Cursor', '@Codebase', 'repo map'],
  ['Cursor invent Rules MDC', 'partial', 'Cursor', 'Project rules', 'Partial'],
  ['Cursor invent Plan mode', 'strong', 'Cursor / Nova', 'Plan mode', 'Plan/Act'],
  ['Cursor invent Background Agents', 'worst', 'Cursor', 'Cloud async agents', 'Missing'],
  ['Cursor invent Bugbot', 'weak', 'Cursor', 'PR Bugbot', 'pr-review Acc'],
  ['Claude Code invent CLI agent', 'partial', 'Claude Code', 'CLI deep agent', 'chat agent'],
  ['Claude Code invent CLAUDE.md', 'partial', 'Claude Code', 'Project md', 'Partial'],
  ['Claude Code invent hooks', 'weak', 'Claude Code', 'Hooks', 'Partial'],
  ['Codex invent apply_patch', 'weak', 'Codex', 'apply_patch', 'Acc patch'],
  ['Codex invent sandbox', 'weak', 'Codex', 'OS sandbox', 'Desktop soft'],
  ['Copilot invent Workspace', 'worst', 'Copilot', 'Issue→PR', 'Missing'],
  ['Copilot invent coding agent', 'worst', 'Copilot', 'Async agent', 'Missing'],
  ['Copilot invent Completions', 'partial', 'Copilot', 'Ghost text', 'NES'],
  ['Windsurf invent Cascade', 'weak', 'Windsurf', 'Cascade', 'Partial'],
  ['Windsurf invent Memories', 'weak', 'Windsurf', 'Memories', 'threadBrain'],
  ['Aider invent architect', 'partial', 'Aider', 'Architect mode', 'Architect hop'],
  ['Aider invent repo map', 'partial', 'Aider', 'Repo map', 'repo map lite'],
  ['Aider invent lint loop', 'partial', 'Aider', 'Lint on edit', 'syntax gate'],
  ['Cline invent VS Code agent', 'weak', 'Cline', 'VS Code agent', 'Electron'],
  ['Roo invent custom modes', 'weak', 'Roo', 'Custom modes', 'Acc modes'],
  ['Amp invent Oracle', 'weak', 'Amp', 'Oracle search', 'repo map'],
  ['Amp invent Threads', 'weak', 'Amp', 'Threads', 'Partial'],
  ['Devin invent cloud VM', 'worst', 'Devin', 'Cloud VM agent', 'Missing'],
  ['Devin invent Wiki', 'worst', 'Devin', 'Repo wiki', 'Missing'],
  ['Factory invent Droid', 'worst', 'Factory', 'Droid sessions', 'Missing'],
  ['OpenHands invent sandbox', 'worst', 'OpenHands', 'Docker agent', 'Missing'],
  ['SWE-agent invent ACI', 'weak', 'SWE-agent', 'ACI tools', 'TOOL set'],
  ['v0 invent UI gen', 'weak', 'v0', 'UI generate', 'invent SPA'],
  ['Bolt invent WebContainers', 'weak', 'Bolt', 'In-browser Node', 'Missing'],
  ['Lovable invent full app', 'weak', 'Lovable', 'Full apps', 'invent'],
  ['Replit invent Agent', 'weak', 'Replit', 'Cloud agent', 'Partial'],
  ['Gemini CLI invent tools', 'weak', 'Gemini CLI', 'CLI tools', 'Partial'],
  ['Goose invent recipes', 'weak', 'Goose', 'Recipes', 'automations Acc'],
  ['Zed invent ACP agent', 'weak', 'Zed', 'ACP native', 'foreign-cli Acc'],
  ['Continue invent local agent', 'weak', 'Continue', 'Local configs', 'Partial'],
  ['Tabnine invent private', 'weak', 'Tabnine', 'Private models', 'local GGUF'],
  ['Cody invent code intel', 'weak', 'Cody', 'Code intel chat', 'repo map'],
  ['Amazon Q invent IDE', 'weak', 'Amazon Q', 'IDE agent', 'BYOK'],
  ['JetBrains invent AI Assistant', 'weak', 'JetBrains', 'IDE AI', 'Electron'],
  ['VS Code invent Copilot Edits', 'weak', 'VS Code', 'Copilot Edits', 'Partial'],
  ['Trae invent builder', 'weak', 'Trae', 'Builder', 'trae-builder Acc'],
  ['Kiro invent specs', 'weak', 'Kiro', 'Spec mode', 'kiro-spec Acc'],
  ['Qoder invent quest', 'weak', 'Qoder', 'Quest mode', 'quest-mode Acc'],
  ['Augment invent context', 'weak', 'Augment', 'Huge context', 'Partial'],
  ['Supermaven invent complete', 'weak', 'Supermaven', 'Fast complete', 'NES'],
]);

// —— Verify / quality normal ——
addAll('coding', [
  ['Verify invent Live screenshot', 'strong', 'Nova', 'Capture Live', 'previewCapture'],
  ['Verify invent Live grade', 'strong', 'Nova', 'Live grade path', 'wired'],
  ['Verify invent smoke pack craft', 'strong', 'Nova', 'craft smokes', 'wired'],
  ['Verify invent smoke ask families', 'strong', 'Nova', 'ask smokes', 'wired'],
  ['Verify invent smoke create spine', 'strong', 'Nova', 'create spine smoke', 'wired'],
  ['Verify invent smoke thin path', 'strong', 'Nova', 'thin path smoke', 'wired'],
  ['Verify invent smoke storefront', 'strong', 'Nova', 'storefront smoke', 'wired'],
  ['Verify invent harness p0', 'strong', 'Nova', 'harness p0', 'wired'],
  ['Verify invent harness p1', 'strong', 'Nova', 'harness p1', 'wired'],
  ['Verify invent harness p2', 'strong', 'Nova', 'harness p2', 'wired'],
  ['Verify invent harness r7r10', 'strong', 'Nova', 'harness r7r10', 'wired'],
  ['Verify invent CDP peek scripts', 'strong', 'Nova', '_cdp-peek-*', 'wired'],
  ['Verify invent typecheck gate', 'partial', 'tsc', 'tsc gate', 'Partial'],
  ['Verify invent eslint gate', 'partial', 'ESLint', 'lint gate', 'eslint.config'],
  ['Verify invent unit test gate', 'weak', 'Vitest', 'unit gate', 'smokes'],
  ['Verify invent e2e gate', 'weak', 'Playwright', 'e2e', 'CDP'],
  ['Verify invent a11y gate', 'partial', 'axe', 'a11y', 'a11y Acc'],
  ['Verify invent SEO gate', 'partial', 'field', 'SEO score', 'seo-audit Acc'],
  ['Verify invent CWV gate', 'partial', 'Lighthouse', 'CWV proxy', 'cwv Acc'],
  ['Verify invent visual gate', 'weak', 'Percy', 'Visual CI', 'Live only'],
]);

// —— Gaps that block "normal" coding product ——
addAll('coding', [
  ['Normal invent Python app path', 'weak', 'Replit / Agent47', 'Python invent', 'JS primary'],
  ['Normal invent Next.js app path', 'weak', 'v0 / Bolt', 'Next invent', 'Vite SPA'],
  ['Normal invent API+UI together', 'weak', 'Lovable / Bolt', 'Full-stack invent', 'UI-heavy'],
  ['Normal invent auth+db scaffold', 'weak', 'Supabase starters', 'Auth+DB', 'stubs'],
  ['Normal invent deploy one-click', 'weak', 'Vercel / Replit', 'One-click deploy', 'deploy Acc'],
  ['Normal invent share preview URL', 'worst', 'StackBlitz / Replit', 'Shareable preview', 'Local Live'],
  ['Normal invent collab multiplayer', 'worst', 'Replit / Codespaces', 'Multiplayer edit', 'Missing'],
  ['Normal invent cloud background job', 'worst', 'Cursor / Devin', 'Async cloud agent', 'Desktop only'],
  ['Normal invent PR from chat', 'weak', 'Copilot Workspace', 'Chat→PR', 'draft-pr Acc'],
  ['Normal invent issue to fix', 'weak', 'Devin / Sweep', 'Issue→fix', 'Partial'],
  ['Normal invent test gen on edit', 'weak', 'Qodo / Copilot', 'Tests with edit', 'Partial'],
  ['Normal invent explain this code', 'partial', 'Cody / Copilot', 'Explain selection', 'plainChatAsk'],
  ['Normal invent fix this error', 'partial', 'IDE AI', 'Error→fix', 'Partial'],
  ['Normal invent refactor extract', 'weak', 'IDE', 'Extract refactor', 'Partial'],
  ['Normal invent rename symbol project', 'weak', 'LSP', 'Project rename', 'Missing deep'],
  ['Normal invent find references', 'weak', 'LSP', 'Find refs', 'Partial'],
  ['Normal invent go to definition', 'weak', 'LSP', 'Go to def', 'Partial'],
  ['Normal invent terminal AI', 'weak', 'Warp / Fig', 'Terminal AI', 'agentRun'],
  ['Normal invent voice coding', 'partial', 'field / Nova', 'Voice prompts', 'voiceSession'],
  ['Normal invent rules always apply', 'strong', 'Cursor / Nova', 'Always rules', 'dont-touch/Acc'],
  ['Normal invent memory across chats', 'partial', 'Cursor Memories', 'Cross-thread memory', 'threadBrain'],
  ['Normal invent worktree isolate', 'partial', 'HAR / Capstone', 'Worktree tasks', 'Partial'],
  ['Normal invent checkpoint restore UI', 'partial', 'Capstone', 'Restore UI', 'createCheckpoint'],
  ['Normal invent secrets never commit', 'partial', 'field', 'Secret guard', 'Partial'],
  ['Normal invent .env template', 'weak', 'field', '.env.example', 'Partial'],
  ['Normal invent README on create', 'partial', 'field', 'README invent', 'Partial'],
  ['Normal invent license on create', 'weak', 'field', 'LICENSE', 'Partial'],
  ['Normal invent git init on create', 'partial', 'field', 'git init', 'Partial'],
  ['Normal invent first commit optional', 'partial', 'Capstone', 'Optional commit', 'Partial'],
]);

// —— Protocol normal ——
addAll('protocol', [
  ['Normal invent MCP tools call', 'partial', 'MCP', 'tools/call', 'Partial'],
  ['Normal invent MCP resources', 'partial', 'MCP', 'resources/list', 'Partial'],
  ['Normal invent ACP guest CLI', 'weak', 'Zed ACP', 'Foreign CLI agent', 'foreign-cli Acc'],
  ['Normal invent LSP diagnostics feed', 'weak', 'LSP', 'Diags to agent', 'coding-lsp Acc'],
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
