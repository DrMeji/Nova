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
  // coding loop micro
  ['Orient phase parallel reads', 'coding', 'partial', 'Capstone', 'Parallel read-only tools', 'Sequential reads often'],
  ['Plan pinned todo evidence', 'coding', 'partial', 'Capstone', 'completeStep needs evidence', 'Ready evidence'],
  ['Act apply_patch only path', 'coding', 'weak', 'Capstone', 'No sed/echo edits', 'Acc+patch preferred'],
  ['Replan after 3 same fails', 'coding', 'strong', 'Capstone', 'Dashed replan arrow', 'doom-loop breaker'],
  ['Scoped grant path prefix', 'coding', 'weak', 'Capstone', 'Edit under src/** grant', 'dont-touch soft'],
  ['Running diff reviewer watch', 'coding', 'weak', 'Capstone', 'Watch running diff', 'chat apply'],
  ['git add free coding', 'coding', 'partial', 'Capstone', 'stage free', 'git ops'],
  ['git stash free coding', 'coding', 'partial', 'Capstone', 'stash free', 'checkpoints'],
  ['git commit ask coding', 'coding', 'partial', 'Capstone', 'commit ask', 'optional invent commit'],
  ['git push always ask', 'coding', 'strong', 'Capstone', 'push ask', 'no auto push'],
  // languages
  ['Python invent coding product', 'coding', 'weak', 'Agent47 / Replit', 'Python scaffolds', 'JS invent primary'],
  ['Rust invent coding product', 'coding', 'worst', 'Agent47', 'Rust extract', 'Missing'],
  ['Go invent coding product', 'coding', 'worst', 'Agent47', 'Go extract', 'Missing'],
  ['Java invent coding product', 'coding', 'worst', 'Agent47', 'Java', 'Missing'],
  ['Kotlin invent coding product', 'coding', 'worst', 'Agent47', 'Kotlin', 'Missing'],
  ['Swift invent coding product', 'coding', 'worst', 'Agent47', 'Swift', 'Missing'],
  ['C# invent coding product', 'coding', 'worst', 'Agent47', 'C#', 'Missing'],
  ['PHP invent coding product', 'coding', 'worst', 'Agent47', 'PHP', 'Missing'],
  ['Ruby invent coding product', 'coding', 'worst', 'Agent47', 'Ruby', 'Missing'],
  ['C/C++ invent coding product', 'coding', 'worst', 'Agent47', 'C++', 'Missing'],
  ['Next.js invent coding stack', 'coding', 'weak', 'v0 / Bolt', 'Next App Router', 'Vite SPA'],
  ['Astro invent coding stack', 'coding', 'worst', 'Bolt', 'Astro scaffolds', 'Missing'],
  ['Svelte invent coding stack', 'coding', 'worst', 'field', 'Svelte', 'Missing'],
  ['Vue invent coding stack', 'coding', 'worst', 'field', 'Vue', 'Missing'],
  ['Flutter invent coding', 'coding', 'worst', 'FlutterFlow', 'Flutter apps', 'Missing'],
  ['React Native invent depth', 'coding', 'weak', 'Bolt Expo', 'RN apps', 'mobile stub'],
  ['Chrome extension invent', 'coding', 'worst', 'field', 'Extension scaffolds', 'Missing'],
  ['VS Code extension invent', 'coding', 'worst', 'field', 'VSX scaffolds', 'Missing'],
  ['CLI tool invent Strong path', 'coding', 'weak', 'field', 'CLI scaffolds', 'product-kinds claim'],
  ['Library package invent', 'coding', 'weak', 'field', 'npm lib scaffold', 'product-kinds claim'],
  ['Microservice invent multi', 'coding', 'worst', 'field', 'Multi-service', 'Missing'],
  ['API-only invent OpenAPI', 'coding', 'weak', 'field', 'OpenAPI first', 'server stub'],
  // models
  ['Claude Opus hard coding seat', 'coding', 'partial', 'Claude', 'Opus for hard tasks', 'BYOK if keyed'],
  ['GPT Codex coding seat', 'coding', 'partial', 'Codex', 'GPT coding models', 'BYOK'],
  ['Gemini coding seat', 'coding', 'partial', 'Gemini CLI', 'Gemini agents', 'BYOK'],
  ['Grok coding seat', 'coding', 'partial', 'Grok Build', 'Grok models', 'BYOK'],
  ['DeepSeek coding seat', 'coding', 'partial', 'field', 'DeepSeek coding', 'BYOK/GGUF'],
  ['Qwen local coding seat', 'coding', 'strong', 'Qwen / Nova', 'Local Qwen GGUF', 'local engine'],
  ['Llama local coding seat', 'coding', 'strong', 'field / Nova', 'Local Llama', 'local engine'],
  ['Devstral coding model', 'coding', 'weak', 'Mistral', 'Devstral coding', 'BYOK possible'],
  ['Codestral completion model', 'coding', 'weak', 'Mistral', 'Codestral', 'NES path'],
  ['Muse Spark reasoning seat', 'coding', 'worst', 'Meta Muse', 'Muse Spark', 'Not wired'],
  ['Muse Glimmer on-device 30B', 'coding', 'weak', 'Meta', 'On-device 30B', 'GGUF local similar'],
  ['SWE-2 Devin model', 'coding', 'worst', 'Devin', 'SWE models', 'Not wired'],
  ['Droid Core open weights', 'coding', 'worst', 'Factory', 'Droid Core tier', 'Not wired'],
  // harness empirics
  ['Rule-based elision before summarize', 'coding', 'strong', 'HAR study', 'Stage elision', 'stageContextElision'],
  ['Planning as cost saver', 'coding', 'strong', 'HAR study', 'Plan shifts cost', 'Architect hop'],
  ['Bash-only vs tools by model', 'coding', 'partial', 'HAR study', 'Strong bash cheaper', 'Fixed TOOL set'],
  ['HAR discover→isolate→verify', 'coding', 'strong', 'os-factory/har', 'Worktree slots', 'discoverHarContract'],
  ['Mission Control multi-run', 'coding', 'weak', 'HAR', 'Multi-repo dashboard', 'Jobs UI'],
  ['Matched harness ablations', 'coding', 'weak', 'HAR study', '176 ablations', 'Smokes per pack'],
  ['Context overflow prevention', 'coding', 'strong', 'HAR study', 'Elision value', 'obs elision'],
  ['Non-recoverable elision default', 'coding', 'strong', 'HAR study', 'No expand-elided', 'Elide closed'],
  ['Network-restricted verify', 'coding', 'strong', 'SWE-Bench Pro', 'Allowlist network', 'verifyNetworkPolicy'],
  ['Trajectory stop policy', 'coding', 'strong', 'HAR', 'idle/verify/max stop', 'shouldStopTrajectory'],
  ['Verifiable proof retained', 'coding', 'strong', 'HAR', 'Evidence packages', 'CreateArtifacts'],
  ['Minimum viable harness', 'coding', 'strong', 'HAR', '90-line MVH', 'agentHarness pack'],
  // more product
  ['Invent invent-demo marker', 'product', 'strong', 'Nova', 'data-nova-invent-demo', 'invent marker'],
  ['Invent Live mount unlock', 'product', 'strong', 'Nova', 'Live preview unlock', 'create Ready/Live'],
  ['Invent blank solid ask path', 'product', 'strong', 'Nova', 'Blank/solid brief', 'blank solid detect'],
  ['Invent storefront ladder', 'product', 'strong', 'Nova', 'Storefront quality ladder', 'createStorefrontLadder'],
  ['Invent thin path craft', 'product', 'strong', 'Nova', 'Thin create path', 'createThinPath'],
  ['Invent syntax gate', 'coding', 'strong', 'Nova', 'Syntax before Ready', 'createSyntaxGate'],
  ['Invent build quality gates', 'coding', 'strong', 'Nova', 'Build quality', 'createBuildQuality'],
  ['Invent host judge', 'coding', 'partial', 'Nova', 'Host-side judge', 'createHostJudge'],
  ['Invent ensemble parked default', 'coding', 'partial', 'Nova', 'Park multi-hop', 'ensembleAutoParked'],
  ['Invent coder gate resolve', 'coding', 'strong', 'Nova', 'Pick craft coder', 'resolveCreateUiPolishCoder'],
  ['Invent budget diagnostics', 'coding', 'partial', 'Nova', 'Budget profile', 'create budgets'],
  ['Invent stall watch', 'coding', 'partial', 'Nova', 'Craft stall watch', 'live-stall-watch'],
  ['Invent checkpoint rollback', 'coding', 'strong', 'Nova', 'Rollback Acc', 'createCheckpoint'],
  ['Invent explore anchors', 'coding', 'strong', 'Nova', 'Explore anchors', 'wave4 explore'],
  ['Invent code-review score', 'coding', 'strong', 'Nova', 'pr-review score', 'invent code-review'],
  ['Invent @mention path', 'coding', 'strong', 'Nova', '@file mentions', 'aiChatSendPreamble'],
  ['Invent slash commands', 'coding', 'strong', 'Nova', '/premium-pass etc', 'slash pack'],
  ['Invent design-system.json', 'product', 'strong', 'Nova', 'design-system Acc', 'wave4'],
  ['Invent NES follow-up patch', 'coding', 'strong', 'Nova', 'NES patch', 'ChatCodeOverlay'],
  ['Invent dual-live Acc files', 'product', 'weak', 'Nova', 'dual-live files', 'UI open'],
  ['Invent repo map lite', 'coding', 'strong', 'Nova', 'repo map', 'wave5'],
  ['Invent instant grep', 'coding', 'strong', 'Nova', 'grep Acc', 'instantGrepAcc'],
  ['Invent head meta stamp', 'product', 'strong', 'Nova', 'canonical+OG inject', 'stampInventHeadMeta'],
  ['Invent SEO audit 0–100 Acc', 'product', 'partial', 'Nova / Blink', 'Acc signal score', 'seo-audit.json'],
  ['Invent payments stub Acc', 'product', 'weak', 'Nova', 'Stripe stub', 'payments-stub'],
  ['Invent leads stub Acc', 'product', 'weak', 'Nova', 'CRM stub', 'leads-stub'],
  ['Invent dont-touch zones', 'coding', 'strong', 'Nova', 'Always/Ask/Never', 'dont-touch.md'],
  ['Invent draft-pr Acc', 'coding', 'partial', 'Nova', 'Draft PR md', 'draft-pr.md'],
  ['Invent image-to-invent Acc', 'product', 'partial', 'Nova', 'Image brief', 'image-to-invent'],
  ['Invent budget.json Acc', 'product', 'partial', 'Nova', 'Budget check-in', 'budget.json'],
  ['Invent worktreeinclude', 'coding', 'partial', 'Nova', 'Copy into worktrees', 'worktreeinclude'],
  ['Invent settings.local', 'coding', 'partial', 'Nova', 'Personal overrides', 'settings.local.json'],
  ['Invent agent-memory dirs', 'coding', 'partial', 'Nova', 'oracle/librarian memory', 'agent-memory/'],
  ['Invent automations Acc', 'coding', 'partial', 'Nova', 'Local automation desc', 'automations.json'],
  ['Invent kiro-spec Acc', 'coding', 'partial', 'Nova', 'Spec md', 'kiro-spec.md'],
  ['Invent quest-mode Acc', 'coding', 'partial', 'Nova', 'Quest json', 'quest-mode.json'],
  ['Invent artifacts Acc', 'coding', 'partial', 'Nova', 'artifacts json', 'artifacts.json'],
  ['Invent agent-manager Acc', 'coding', 'weak', 'Nova', 'manager json', 'agent-manager.json'],
  ['Invent trae-builder Acc', 'coding', 'partial', 'Nova', 'builder json', 'trae-builder.json'],
  ['Invent coding-edit-policy', 'coding', 'partial', 'Nova', 'edit formats Acc', 'coding-edit-policy'],
  ['Invent coding-tools catalog', 'coding', 'partial', 'Nova', 'tool catalog Acc', 'coding-tools.json'],
  ['Invent coding-lsp-stream Acc', 'coding', 'weak', 'Nova', 'LSP analogue Acc', 'coding-lsp-stream'],
  ['Invent coding-mailbox Acc', 'coding', 'weak', 'Nova', 'mailbox json', 'coding-mailbox'],
  ['Invent coding-ensemble-close', 'coding', 'partial', 'Nova', 'ensemble policy Acc', 'coding-ensemble-close'],
  ['Invent a11y-gate Acc', 'product', 'partial', 'Nova', 'a11y Acc', 'a11y-gate.json'],
  ['Invent analytics-stub Acc', 'product', 'weak', 'Nova', 'analytics opt-in', 'analytics-stub'],
  ['Invent deploy-descriptor', 'product', 'weak', 'Nova', 'deploy targets Acc', 'deploy-descriptor'],
  ['Invent agents-window Acc', 'product', 'weak', 'Nova', 'Agents Window Acc', 'agents-window.json'],
  ['Invent semantic-index Acc', 'coding', 'weak', 'Nova', 'grep+symbols claim', 'semantic-index.json'],
  ['Invent memory-browser Acc', 'product', 'weak', 'Nova', 'memory paths Acc', 'memory-browser.json'],
  ['Invent ci-autofix Acc', 'coding', 'weak', 'Nova', 'CI autofix Acc', 'ci-autofix.json'],
  ['Invent foreign-cli Acc', 'coding', 'weak', 'Nova', 'ACP guest claim', 'foreign-cli.json'],
  ['Invent PWA manifest Acc', 'product', 'partial', 'Nova', 'webmanifest', 'manifest.webmanifest'],
  ['Invent mobile README Acc', 'product', 'weak', 'Nova', 'mobile stub', 'mobile/README'],
  ['Invent product-schema JSON-LD', 'product', 'strong', 'Nova', 'product schema', 'product-schema.json'],
  ['Invent structured-data Acc', 'product', 'strong', 'Nova', 'org+faq LD', 'structured-data.json'],
  ['Invent open-graph Acc', 'product', 'strong', 'Nova', 'OG json', 'open-graph.json'],
  ['Invent canonical Acc', 'product', 'strong', 'Nova', 'canonical json', 'canonical.json'],
  ['Invent cwv-gate Acc', 'product', 'partial', 'Nova', 'CWV proxy', 'cwv-gate.json'],
  ['Invent privacy.md Acc', 'product', 'strong', 'Nova', 'privacy page', 'public/privacy.md'],
  ['Invent terms.md Acc', 'product', 'strong', 'Nova', 'terms page', 'public/terms.md'],
  // verification philosophy
  ['Never let generator grade alone', 'coding', 'partial', 'Kane / TestMu', 'Separate verify layer', 'Live+smoke still self-ish'],
  ['Agent Assurance for shipped agents', 'coding', 'worst', 'Rook / TestMu', 'Assure agents you ship', 'Out of scope'],
  ['Real Device Cloud invent verify', 'coding', 'worst', 'TestMu', 'Device cloud', 'Desktop Live'],
  ['SmartUI visual invent testing', 'coding', 'worst', 'TestMu', 'Visual cloud', 'Live screenshot'],
  ['HyperExecute scale verify', 'coding', 'worst', 'TestMu', 'Scale CI verify', 'Missing'],
];

for (const row of more) add(...row);

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
