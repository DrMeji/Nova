/**
 * Grow nova-deep-rescan toward 1200+ rows.
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

// —— More coding agents / products ——
const agents = [
  ['Devin Enterprise invent fleet', 'coding', 'worst', 'Devin', 'Fleet of Devins', 'Missing'],
  ['Devin Wiki invent knowledge', 'coding', 'worst', 'Devin', 'Living wiki from repo', 'Missing'],
  ['Devin Ask invent Q&A', 'coding', 'weak', 'Devin', 'Ask over codebase', 'plainChatAsk'],
  ['Factory Droid invent sessions', 'coding', 'worst', 'Factory', 'Droid sessions', 'Missing'],
  ['Factory Droids invent parallel', 'coding', 'worst', 'Factory', 'Parallel droids', 'Missing'],
  ['Cognition SWE invent models', 'coding', 'worst', 'Cognition', 'SWE-tuned models', 'Missing'],
  ['Magic invent enterprise agent', 'coding', 'worst', 'Magic', 'Enterprise coding', 'Missing'],
  ['Poolside invent Malibu', 'coding', 'worst', 'Poolside', 'Malibu model', 'Missing'],
  ['Reflection invent coding', 'coding', 'worst', 'Reflection AI', 'Coding agents', 'Missing'],
  ['Imbue invent agents', 'coding', 'worst', 'Imbue', 'Reasoning agents', 'Missing'],
  ['Adept invent ACT-1 legacy', 'coding', 'worst', 'Adept', 'Computer use legacy', 'Missing'],
  ['MultiOn invent web agent', 'coding', 'worst', 'MultiOn', 'Web agent', 'Missing'],
  ['Adext invent browser', 'coding', 'worst', 'field', 'Browser agents', 'Missing'],
  ['Browserbase invent infra', 'coding', 'worst', 'Browserbase', 'Browser infra', 'Missing'],
  ['Steel invent browsers', 'coding', 'worst', 'Steel', 'Browser sessions', 'Missing'],
  ['Kernel invent computer use', 'coding', 'worst', 'Kernel', 'Computer use API', 'Missing'],
  ['Anthropic computer use API', 'coding', 'worst', 'Anthropic', 'Computer use tool', 'Missing'],
  ['OpenAI Operator invent', 'coding', 'worst', 'OpenAI', 'Operator agent', 'Missing'],
  ['OpenAI deep research invent', 'coding', 'weak', 'OpenAI', 'Deep research', 'webSearch'],
  ['Perplexity invent coding', 'coding', 'weak', 'Perplexity', 'Research+code', 'webSearch'],
  ['Phind invent coding search', 'coding', 'weak', 'Phind', 'Code search AI', 'Partial'],
  ['You.com invent code', 'coding', 'worst', 'You.com', 'Search+code', 'Missing'],
  ['Andisearch invent code', 'coding', 'worst', 'Andi', 'Search agent', 'Missing'],
  ['Exa invent code search API', 'coding', 'weak', 'Exa', 'Neural search API', 'webSearch'],
  ['Tavily invent search API', 'coding', 'weak', 'Tavily', 'Agent search API', 'webSearch'],
  ['Brave invent search API', 'coding', 'weak', 'Brave', 'Search API', 'webSearch'],
  ['SerpAPI invent google', 'coding', 'weak', 'SerpAPI', 'SERP for agents', 'Partial'],
  ['Firecrawl invent scrape', 'coding', 'weak', 'Firecrawl', 'Crawl for agents', 'Partial'],
  ['Jina invent reader', 'coding', 'weak', 'Jina', 'Reader API', 'Partial'],
  ['Browserless invent scrape', 'coding', 'worst', 'Browserless', 'Headless cloud', 'Missing'],
];
for (const r of agents) add(...r);

// —— Patch formats / apply engines ——
const patch = [
  ['Unified diff invent apply v3', 'coding', 'partial', 'Aider / git', 'git apply style', 'Acc patch'],
  ['V4A invent diff format', 'coding', 'worst', 'Codex', 'V4A patches', 'Missing'],
  ['SEARCH/REPLACE invent blocks', 'coding', 'partial', 'Aider', 'Block replace', 'Acc'],
  ['Whole-file invent rewrite', 'coding', 'partial', 'Aider', 'Full file write', 'Acc write'],
  ['UDIFF invent invent format', 'coding', 'weak', 'Aider', 'udiff edits', 'Partial'],
  ['JSON patch invent RFC6902', 'coding', 'worst', 'field', 'JSON Patch ops', 'Missing'],
  ['Operational transform invent', 'coding', 'worst', 'OT', 'OT collab edits', 'Missing'],
  ['CRDT invent collab code', 'coding', 'worst', 'Yjs / Automerge', 'CRDT editors', 'Missing'],
  ['Tree-sitter invent surgical', 'coding', 'weak', 'field', 'AST-aware edits', 'Partial'],
  ['Comby invent structural', 'coding', 'worst', 'Comby', 'Structural search/replace', 'Missing'],
  ['Semgrep invent autofix', 'coding', 'weak', 'Semgrep', 'Autofix rules', 'Partial'],
  ['Coccinelle invent C patches', 'coding', 'worst', 'Coccinelle', 'Semantic patches C', 'Missing'],
  ['Refactoring Miner invent', 'coding', 'worst', 'RefactoringMiner', 'Detect refactors', 'Missing'],
  ['GumTree invent AST diff', 'coding', 'worst', 'GumTree', 'AST differencing', 'Missing'],
  ['Difftastic invent syntax diff', 'coding', 'weak', 'Difftastic', 'Syntax-aware diff UI', 'Partial'],
  ['Delta invent pager diffs', 'coding', 'weak', 'delta', 'Pretty diffs', 'Partial'],
  ['Reviewdog invent annotations', 'coding', 'worst', 'reviewdog', 'PR annotations', 'Missing'],
  ['Danger invent PR bots', 'coding', 'worst', 'Danger', 'PR dangerfile', 'Missing'],
  ['Probots invent GitHub apps', 'coding', 'worst', 'Probot', 'GitHub app bots', 'Missing'],
  ['Octokit invent API invent', 'coding', 'partial', 'Octokit', 'GitHub API', 'github.ts'],
];
for (const r of patch) add(...r);

// —— Language server / intel ——
const lsp = [
  ['TypeScript invent tsserver deep', 'coding', 'partial', 'tsserver', 'Full TS language', 'Partial'],
  ['eslint invent flat config', 'coding', 'strong', 'ESLint', 'eslint.config', 'wired'],
  ['typescript-eslint invent', 'coding', 'partial', 'typescript-eslint', 'TS lint rules', 'Partial'],
  ['Pyright invent Python LSP', 'coding', 'worst', 'Pyright', 'Python types', 'Missing'],
  ['rust-analyzer invent', 'coding', 'worst', 'rust-analyzer', 'Rust LSP', 'Missing'],
  ['gopls invent Go LSP', 'coding', 'worst', 'gopls', 'Go LSP', 'Missing'],
  ['clangd invent C++ LSP', 'coding', 'worst', 'clangd', 'C++ LSP', 'Missing'],
  ['jdtls invent Java LSP', 'coding', 'worst', 'jdtls', 'Java LSP', 'Missing'],
  ['omnisharp invent C# LSP', 'coding', 'worst', 'OmniSharp', 'C# LSP', 'Missing'],
  ['kotlin-language-server invent', 'coding', 'worst', 'Kotlin LS', 'Kotlin LSP', 'Missing'],
  ['sourcekit-lsp invent Swift', 'coding', 'worst', 'SourceKit', 'Swift LSP', 'Missing'],
  ['Dart invent analysis server', 'coding', 'worst', 'Dart', 'Dart analysis', 'Missing'],
  ['Ruby LSP invent', 'coding', 'worst', 'Shopify Ruby LSP', 'Ruby LSP', 'Missing'],
  ['Solargraph invent Ruby', 'coding', 'worst', 'Solargraph', 'Ruby intel', 'Missing'],
  ['Intelephense invent PHP', 'coding', 'worst', 'Intelephense', 'PHP LSP', 'Missing'],
  ['Volar invent Vue LSP', 'coding', 'worst', 'Volar', 'Vue LSP', 'Missing'],
  ['Svelte invent language tools', 'coding', 'worst', 'Svelte', 'Svelte LSP', 'Missing'],
  ['Astro invent language tools', 'coding', 'worst', 'Astro', 'Astro LSP', 'Missing'],
  ['Tailwind invent CSS intellisense', 'coding', 'weak', 'Tailwind CSS LS', 'Class intel', 'Partial'],
  ['Emmet invent expand', 'coding', 'weak', 'Emmet', 'Abbreviation expand', 'Partial'],
];
for (const r of lsp) add(...r);

// —— Debugging invent ——
const debug = [
  ['Breakpoint invent set in agent', 'coding', 'worst', 'IDE debug', 'Agent sets BPs', 'Missing'],
  ['Step-through invent agent', 'coding', 'worst', 'IDE debug', 'Step debug agent', 'Missing'],
  ['Watch invent expressions', 'coding', 'worst', 'IDE', 'Watch vars', 'Missing'],
  ['Core dump invent analyze', 'coding', 'worst', 'field', 'Crash analyze', 'Missing'],
  ['Flamegraph invent profiling', 'coding', 'worst', 'field', 'CPU profiles', 'Missing'],
  ['Heap snapshot invent', 'coding', 'worst', 'Chrome DevTools', 'Memory snapshots', 'Missing'],
  ['Time-travel invent debug', 'coding', 'worst', 'rr / Replay', 'TTD', 'Missing'],
  ['Replay.io invent sessions', 'coding', 'worst', 'Replay', 'Deterministic replay', 'Missing'],
  ['Sentry invent stack fix', 'coding', 'weak', 'Sentry', 'Error→fix agent', 'Missing deep'],
  ['Logpoint invent remote', 'coding', 'worst', 'IDE', 'Logpoints', 'Missing'],
  ['Console invent Live capture', 'coding', 'partial', 'Nova / CDP', 'Console from Live', 'previewCapture'],
  ['Network invent Live HAR', 'coding', 'weak', 'CDP', 'HAR from preview', 'Partial'],
  ['Performance invent Live metrics', 'coding', 'weak', 'CDP', 'Perf metrics', 'cwv Acc'],
  ['Coverage invent agent gate', 'coding', 'worst', 'Istanbul / c8', 'Coverage gates', 'Missing'],
  ['Source map invent resolve', 'coding', 'weak', 'field', 'Map minified stacks', 'Partial'],
];
for (const r of debug) add(...r);

// —— Docs / knowledge invent ——
const docs = [
  ['JSDoc invent generate', 'coding', 'weak', 'field', 'JSDoc from code', 'Partial'],
  ['TSDoc invent generate', 'coding', 'weak', 'field', 'TSDoc', 'Partial'],
  ['OpenAPI invent from code', 'coding', 'weak', 'field', 'Reverse OpenAPI', 'Partial'],
  ['Typedoc invent site', 'coding', 'weak', 'TypeDoc', 'API docs site', 'Missing'],
  ['Docusaurus invent docs', 'product', 'weak', 'Docusaurus', 'Docs framework', 'Partial'],
  ['Nextra invent docs', 'product', 'weak', 'Nextra', 'Next docs', 'Missing'],
  ['VitePress invent docs', 'product', 'weak', 'VitePress', 'Vite docs', 'Partial'],
  ['Starlight invent docs', 'product', 'weak', 'Starlight', 'Astro docs', 'Missing'],
  ['MkDocs invent python docs', 'product', 'worst', 'MkDocs', 'Python docs', 'Missing'],
  ['Sphinx invent docs', 'product', 'worst', 'Sphinx', 'Sphinx docs', 'Missing'],
  ['ReadTheDocs invent host', 'product', 'worst', 'RTD', 'Docs hosting', 'Missing'],
  ['Swagger UI invent', 'product', 'weak', 'Swagger', 'API explorer', 'Partial'],
  ['Redoc invent API docs', 'product', 'worst', 'Redoc', 'API docs', 'Missing'],
  ['Stoplight invent design', 'product', 'worst', 'Stoplight', 'API design', 'Missing'],
  ['Postman invent collections', 'coding', 'weak', 'Postman', 'API collections', 'Missing'],
  ['Insomnia invent collections', 'coding', 'worst', 'Insomnia', 'API client', 'Missing'],
  ['Bruno invent API files', 'coding', 'worst', 'Bruno', 'Git-friendly API', 'Missing'],
  ['HTTPie invent scripts', 'coding', 'weak', 'HTTPie', 'HTTP CLI', 'Partial'],
  ['curl invent recipe Acc', 'coding', 'partial', 'field', 'curl recipes', 'Partial'],
  ['adr-tools invent workflow', 'coding', 'weak', 'adr-tools', 'ADR CLI', 'Partial'],
];
for (const r of docs) add(...r);

// —— Game / creative invent ——
const creative = [
  ['Unity invent C# agent', 'coding', 'worst', 'Unity Muse', 'Unity AI', 'Missing'],
  ['Unreal invent Blueprints AI', 'coding', 'worst', 'Unreal', 'UE AI assist', 'Missing'],
  ['Godot invent GDScript AI', 'coding', 'worst', 'Godot', 'Godot agent', 'Missing'],
  ['Roblox invent Luau AI', 'coding', 'worst', 'Roblox', 'Luau assist', 'Missing'],
  ['Shader invent GLSL/HLSL', 'coding', 'worst', 'field', 'Shader invent', 'Missing'],
  ['Blender invent Python AI', 'coding', 'worst', 'Blender', 'Blender scripts', 'Missing'],
  ['Figma invent Dev Mode deep', 'product', 'partial', 'Figma', 'Dev Mode handoff', 'figma.ts'],
  ['Spline invent 3D web', 'product', 'worst', 'Spline', '3D web invent', 'Missing'],
  ['Rive invent motion graphics', 'product', 'worst', 'Rive', 'Rive invent', 'Missing'],
  ['Lottie invent animations', 'product', 'weak', 'Lottie', 'Lottie invent', 'Partial'],
  ['Canva invent code export', 'product', 'worst', 'Canva', 'Design→code', 'Missing'],
  ['Adobe invent Firefly code', 'product', 'worst', 'Adobe', 'Firefly+code', 'Missing'],
  ['Midjourney invent asset pipe', 'product', 'worst', 'Midjourney', 'Asset pipeline', 'Missing'],
  ['Stable Diffusion invent local', 'product', 'weak', 'SD', 'Local image gen', 'media path'],
  ['ComfyUI invent workflows', 'product', 'worst', 'ComfyUI', 'Node image workflows', 'Missing'],
  ['Runway invent video edit', 'product', 'worst', 'Runway', 'Video AI', 'Missing'],
  ['ElevenLabs invent voice', 'product', 'weak', 'ElevenLabs', 'TTS invent', 'voiceSession'],
  ['Whisper invent STT coding', 'coding', 'partial', 'Whisper', 'Speech→prompt', 'voiceSession'],
];
for (const r of creative) add(...r);

// —— More Nova wiring honesty ——
const nova = [
  ['Invent ggufContext local', 'coding', 'strong', 'Nova', 'ggufContext', 'wired'],
  ['Invent novaGguf electron', 'coding', 'strong', 'Nova', 'novaGguf.cjs', 'wired'],
  ['Invent novaEngine electron', 'coding', 'strong', 'Nova', 'novaEngine', 'wired'],
  ['Invent novaRouter seats', 'coding', 'strong', 'Nova', 'novaRouter', 'wired'],
  ['Invent novaPreview Live', 'coding', 'strong', 'Nova', 'novaPreview', 'wired'],
  ['Invent novaProjects disk', 'coding', 'strong', 'Nova', 'novaProjects', 'wired'],
  ['Invent novaMedia path', 'product', 'strong', 'Nova', 'novaMedia', 'wired'],
  ['Invent novaAgentExec', 'coding', 'strong', 'Nova', 'novaAgentExec', 'wired'],
  ['Invent chatDiskOps', 'coding', 'strong', 'Nova', 'chatDiskOps', 'wired'],
  ['Invent chatDiskIntent', 'coding', 'strong', 'Nova', 'chatDiskIntent', 'wired'],
  ['Invent chatHistory persist', 'coding', 'strong', 'Nova', 'chatHistory', 'wired'],
  ['Invent chatMultiModel', 'coding', 'partial', 'Nova', 'chatMultiModel', 'partial'],
  ['Invent chatMediaTurn', 'product', 'partial', 'Nova', 'chatMediaTurn', 'partial'],
  ['Invent chatDrop files', 'coding', 'strong', 'Nova', 'chatDrop', 'wired'],
  ['Invent chatIdeaIntent', 'coding', 'strong', 'Nova', 'chatIdeaIntent', 'wired'],
  ['Invent chatIntent router', 'coding', 'strong', 'Nova', 'chatIntent', 'wired'],
  ['Invent folderCatalog scan', 'coding', 'strong', 'Nova', 'folderCatalog', 'wired'],
  ['Invent projectKind detect', 'coding', 'strong', 'Nova', 'projectKind', 'wired'],
  ['Invent projectScaffolds', 'coding', 'strong', 'Nova', 'projectScaffolds', 'wired'],
  ['Invent projectCodeEdit', 'coding', 'strong', 'Nova', 'projectCodeEdit', 'wired'],
  ['Invent freshSpaFromBrief', 'coding', 'strong', 'Nova', 'freshSpaFromBrief', 'wired'],
  ['Invent mobileTemplates', 'coding', 'weak', 'Nova', 'mobileTemplates', 'stub'],
  ['Invent debugClinic', 'coding', 'partial', 'Nova', 'debugClinic', 'partial'],
  ['Invent buildDiagnostics', 'coding', 'strong', 'Nova', 'buildDiagnostics', 'wired'],
  ['Invent catalogPlugins', 'coding', 'partial', 'Nova', 'catalogPlugins', 'partial'],
  ['Invent recentStore', 'coding', 'strong', 'Nova', 'recentStore', 'wired'],
  ['Invent deleteProjectFlow', 'product', 'strong', 'Nova', 'deleteProjectFlow', 'wired'],
  ['Invent brandLabel', 'product', 'strong', 'Nova', 'brandLabel', 'wired'],
  ['Invent localPrefs store', 'coding', 'strong', 'Nova', 'localPrefs', 'wired'],
  ['Invent planReport', 'coding', 'strong', 'Nova', 'planReport', 'wired'],
];
for (const r of nova) add(...r);

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
