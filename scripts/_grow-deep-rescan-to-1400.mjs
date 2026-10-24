/**
 * Grow nova-deep-rescan toward 1400+.
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

// Fine-grain tool behaviors (coding)
const tools = [
  ['read_file invent line range', 'coding', 'strong', 'Claude / Cursor', 'offset+limit reads', 'wired'],
  ['read_file invent image vision', 'coding', 'partial', 'Claude', 'Read images in tools', 'Partial'],
  ['write_file invent overwrite', 'coding', 'strong', 'field', 'Full write tool', 'Acc write'],
  ['edit_file invent old_new', 'coding', 'partial', 'Claude', 'old_string/new_string', 'Acc patch'],
  ['grep invent multiline', 'coding', 'partial', 'ripgrep', 'Multiline regex', 'Partial'],
  ['grep invent type filter', 'coding', 'partial', 'rg --type', 'Type filters', 'Partial'],
  ['grep invent head_limit', 'coding', 'strong', 'Cursor', 'Cap matches', 'wired'],
  ['glob invent mtime sort', 'coding', 'partial', 'Cursor', 'Sort by mtime', 'Partial'],
  ['shell invent working_directory', 'coding', 'strong', 'field', 'cwd param', 'agentRun'],
  ['shell invent block_until', 'coding', 'partial', 'Cursor', 'Background after N ms', 'Partial'],
  ['shell invent notify pattern', 'coding', 'worst', 'Cursor', 'Output notify regex', 'Missing'],
  ['web_search invent citations', 'coding', 'partial', 'field', 'Cited results', 'webSearch'],
  ['web_fetch invent markdown', 'coding', 'partial', 'field', 'HTML→md fetch', 'Partial'],
  ['todo_write invent merge', 'coding', 'partial', 'Cursor', 'Merge todo state', 'Partial'],
  ['switch_mode invent plan', 'coding', 'strong', 'Cursor / Nova', 'Plan vs Agent', 'Plan/Act'],
  ['generate_image invent tool', 'product', 'partial', 'field', 'Image gen tool', 'media'],
  ['ask_question invent structured', 'coding', 'weak', 'Cursor', 'Structured Qs', 'Partial'],
  ['task invent subagent spawn', 'coding', 'weak', 'Cursor Task', 'Subagent spawn', 'Partial'],
  ['await invent shell poll', 'coding', 'weak', 'Cursor', 'Await shell', 'Partial'],
  ['mcp_auth invent flow', 'protocol', 'weak', 'MCP', 'Auth MCP servers', 'Partial'],
];
for (const r of tools) add(...r);

// Verification philosophy fine
const verify = [
  ['Golden invent master tests', 'coding', 'weak', 'SWE-bench', 'Golden tests', 'smokes'],
  ['Hidden invent test holdout', 'coding', 'worst', 'SWE-Bench Pro', 'Holdout tests', 'Missing'],
  ['Flaky invent quarantine', 'coding', 'weak', 'Trunk', 'Quarantine flakes', 'Missing'],
  ['Retry invent flaky 3x', 'coding', 'weak', 'CI', 'Retry flakes', 'Partial'],
  ['Timeout invent per test', 'coding', 'partial', 'Jest / Vitest', 'Test timeouts', 'Partial'],
  ['Shard invent parallel tests', 'coding', 'worst', 'CI', 'Shard suites', 'Missing'],
  ['Impact invent test select', 'coding', 'worst', 'Launchable', 'Select tests by diff', 'Missing'],
  ['Mutation invent score gate', 'coding', 'worst', 'Stryker', 'Mutation gate', 'Missing'],
  ['Fuzz invent property loop', 'coding', 'worst', 'AFL / libFuzzer', 'Fuzzing', 'Missing'],
  ['Chaos invent fault inject', 'coding', 'worst', 'Chaos Mesh', 'Fault injection', 'Missing'],
  ['Contract invent consumer', 'coding', 'worst', 'Pact', 'Consumer-driven', 'Missing'],
  ['Schema invent drift detect', 'coding', 'weak', 'field', 'Schema drift', 'Partial'],
  ['Migration invent dry-run', 'coding', 'weak', 'field', 'Migration dry-run', 'Missing'],
  ['Seed invent deterministic', 'coding', 'weak', 'field', 'Deterministic seeds', 'Partial'],
  ['Snapshot invent update ask', 'coding', 'weak', 'Jest', 'Ask before update', 'Partial'],
  ['Visual invent pixeldiff', 'coding', 'weak', 'Playwright', 'Pixel compare', 'Live screenshot'],
  ['A11y invent axe gate', 'coding', 'partial', 'axe', 'axe-core gate', 'a11y Acc'],
  ['Lighthouse invent CI score', 'coding', 'weak', 'Lighthouse CI', 'LHCI scores', 'cwv Acc'],
  ['Bundle invent size budget', 'coding', 'weak', 'bundlesize', 'Bundle budgets', 'Partial'],
  ['Typecheck invent invent gate', 'coding', 'strong', 'tsc', 'tsc --noEmit', 'syntax/build gates'],
];
for (const r of verify) add(...r);

// Model / inference ops
const models = [
  ['vLLM invent serving', 'coding', 'worst', 'vLLM', 'OpenAI-compat serve', 'GGUF local'],
  ['llama.cpp invent server', 'coding', 'strong', 'llama.cpp / Nova', 'Local server', 'novaGguf'],
  ['Ollama invent pull models', 'coding', 'weak', 'Ollama', 'ollama pull', 'Partial'],
  ['LM Studio invent desktop', 'coding', 'weak', 'LM Studio', 'Desktop local', 'Nova Desktop'],
  ['Jan invent local AI', 'coding', 'weak', 'Jan', 'Local AI app', 'Nova'],
  ['GPT4All invent local', 'coding', 'weak', 'GPT4All', 'Local chat', 'Partial'],
  ['LocalAI invent gateway', 'coding', 'weak', 'LocalAI', 'Local OpenAI API', 'Partial'],
  ['OpenRouter invent routing', 'coding', 'partial', 'OpenRouter', 'Multi-provider route', 'BYOK'],
  ['Together invent inference', 'coding', 'weak', 'Together', 'Hosted OSS', 'BYOK'],
  ['Fireworks invent inference', 'coding', 'weak', 'Fireworks', 'Fast inference', 'BYOK'],
  ['Groq invent LPU', 'coding', 'weak', 'Groq', 'LPU inference', 'BYOK'],
  ['Cerebras invent wafer', 'coding', 'worst', 'Cerebras', 'Wafer-scale', 'Missing'],
  ['SambaNova invent', 'coding', 'worst', 'SambaNova', 'RDU inference', 'Missing'],
  ['DeepInfra invent', 'coding', 'weak', 'DeepInfra', 'Hosted models', 'BYOK'],
  ['Hugging Face invent TGI', 'coding', 'weak', 'HF TGI', 'Text gen inference', 'Partial'],
  ['Hugging Face invent Inference', 'coding', 'weak', 'HF', 'Inference API', 'BYOK'],
  ['Replicate invent models', 'coding', 'weak', 'Replicate', 'Run models', 'BYOK'],
  ['Modal invent GPU jobs', 'coding', 'worst', 'Modal', 'Serverless GPU', 'Missing'],
  ['RunPod invent pods', 'coding', 'worst', 'RunPod', 'GPU pods', 'Missing'],
  ['Vast.ai invent rent', 'coding', 'worst', 'Vast.ai', 'Rent GPUs', 'Missing'],
];
for (const r of models) add(...r);

// Team / process invent
const process = [
  ['Sprint invent planning AI', 'coding', 'weak', 'Linear / Jira', 'Sprint AI', 'Partial'],
  ['Standup invent summary AI', 'coding', 'weak', 'field', 'Standup digest', 'Partial'],
  ['Retro invent AI facilitator', 'coding', 'worst', 'field', 'Retro AI', 'Missing'],
  ['Incident invent AI runbook', 'coding', 'weak', 'PagerDuty AI', 'Incident AI', 'Missing'],
  ['Oncall invent invent tips', 'coding', 'worst', 'field', 'Oncall assist', 'Missing'],
  ['RFC invent AI review', 'coding', 'weak', 'field', 'RFC review agent', 'plan mode'],
  ['Design invent AI critique', 'product', 'weak', 'field', 'Design critique', 'host judge'],
  ['Copy invent AI polish', 'product', 'partial', 'field', 'Copy polish', 'craft'],
  ['Localization invent AI', 'product', 'weak', 'field', 'i18n AI', 'Partial'],
  ['Legal invent AI review', 'product', 'worst', 'field', 'Legal review', 'Missing'],
  ['Security invent invent threat model', 'coding', 'weak', 'field', 'Threat model AI', 'Partial'],
  ['Architecture invent invent diagram', 'coding', 'weak', 'field', 'Arch diagrams', 'Partial'],
  ['ERD invent invent from schema', 'coding', 'weak', 'field', 'ERD from DB', 'Missing'],
  ['Sequence invent invent UML', 'coding', 'weak', 'field', 'Sequence diagrams', 'Partial'],
  ['C4 invent invent model', 'coding', 'worst', 'field', 'C4 model AI', 'Missing'],
  ['Dependency invent invent graph UI', 'coding', 'weak', 'field', 'Dep graph UI', 'repo map'],
  ['Changelog invent invent from PRs', 'coding', 'partial', 'field', 'PR→changelog', 'changelog.ts'],
  ['Release invent invent notes AI', 'coding', 'weak', 'field', 'Release notes', 'Partial'],
  ['Migrate invent invent codemod', 'coding', 'weak', 'jscodeshift', 'Codemods', 'Partial'],
  ['Upgrade invent invent React 19', 'coding', 'weak', 'field', 'Framework upgrades', 'Partial'],
];
for (const r of process) add(...r);

// Niche coding products
const niche = [
  ['Cursor Canvas invent artifacts', 'coding', 'partial', 'Cursor', 'Canvas artifacts', 'research canvases'],
  ['Cursor Glass invent UI', 'coding', 'worst', 'Cursor', 'Glass UI', 'Missing'],
  ['Zed Edit Prediction invent', 'coding', 'weak', 'Zed', 'Edit prediction', 'NES'],
  ['Zed Agent invent ACP native', 'coding', 'weak', 'Zed', 'ACP native', 'foreign-cli Acc'],
  ['VS Code Copilot Chat invent', 'coding', 'weak', 'VS Code', 'Copilot Chat', 'Partial'],
  ['VS Code Copilot Edits invent', 'coding', 'weak', 'VS Code', 'Copilot Edits', 'Partial'],
  ['VS Code agent mode invent', 'coding', 'weak', 'VS Code', 'Agent mode', 'Partial'],
  ['JetBrains AI Chat invent', 'coding', 'weak', 'JetBrains', 'AI Chat', 'Partial'],
  ['JetBrains AI Edit invent', 'coding', 'weak', 'JetBrains', 'AI Edit', 'Partial'],
  ['Xcode Predictive Code invent', 'coding', 'worst', 'Xcode', 'Predictive code', 'Missing'],
  ['Android Studio Studio Bot invent', 'coding', 'worst', 'Studio Bot', 'Android AI', 'Missing'],
  ['IntelliJ Full Line invent', 'coding', 'worst', 'JetBrains', 'Full Line Code', 'Missing'],
  ['Tabby invent self-host complete', 'coding', 'weak', 'Tabby', 'Self-host complete', 'local'],
  ['FauxPilot invent legacy', 'coding', 'worst', 'FauxPilot', 'Self-host Copilot', 'Missing'],
  ['Starcoder invent models', 'coding', 'weak', 'BigCode', 'StarCoder', 'GGUF possible'],
  ['CodeLlama invent models', 'coding', 'partial', 'Meta', 'CodeLlama', 'GGUF'],
  ['DeepSeek-Coder invent', 'coding', 'partial', 'DeepSeek', 'Coder models', 'BYOK/GGUF'],
  ['Qwen2.5-Coder invent', 'coding', 'strong', 'Qwen / Nova', 'Coder GGUF', 'local'],
  ['Codestral invent fill-in', 'coding', 'weak', 'Mistral', 'FIM coding', 'NES'],
  ['Devstral invent agent model', 'coding', 'weak', 'Mistral', 'Agent coding model', 'BYOK'],
];
for (const r of niche) add(...r);

// Product invent verticals more
const vert = [
  ['Restaurant invent menu site', 'product', 'partial', 'field', 'Menu landing', 'storefront'],
  ['Salon invent booking', 'product', 'weak', 'field', 'Booking invent', 'Partial'],
  ['Gym invent membership', 'product', 'weak', 'field', 'Gym site', 'Partial'],
  ['Real estate invent listings', 'product', 'weak', 'field', 'Listings', 'Partial'],
  ['Agency invent portfolio', 'product', 'partial', 'field', 'Agency site', 'invent'],
  ['SaaS invent waitlist+demo', 'product', 'partial', 'field', 'Waitlist+demo', 'Partial'],
  ['Course invent landing', 'product', 'weak', 'field', 'Course sales', 'Partial'],
  ['Podcast invent show site', 'product', 'weak', 'field', 'Podcast site', 'Partial'],
  ['Event invent ticket page', 'product', 'weak', 'field', 'Event page', 'Partial'],
  ['Nonprofit invent donate', 'product', 'weak', 'field', 'Donate page', 'Partial'],
  ['Church invent parish site', 'product', 'weak', 'field', 'Parish site', 'Partial'],
  ['Clinic invent patient info', 'product', 'weak', 'field', 'Clinic site', 'Partial'],
  ['Law invent firm site', 'product', 'weak', 'field', 'Law firm', 'Partial'],
  ['Accounting invent firm', 'product', 'weak', 'field', 'Accounting', 'Partial'],
  ['Construction invent trade', 'product', 'weak', 'field', 'Trade site', 'Partial'],
  ['Brewery invent taproom', 'product', 'partial', 'Nova demos', 'Brewery invent', 'demos'],
  ['Coffee invent shop', 'product', 'partial', 'Nova demos', 'Coffee invent', 'demos'],
  ['Bottle invent shop', 'product', 'partial', 'Nova demos', 'Bottle shop', 'demos'],
  ['Luggage invent brand', 'product', 'partial', 'Nova demos', 'Luggage', 'demos'],
  ['Speakers invent product', 'product', 'partial', 'Nova demos', 'Speakers', 'demos'],
];
for (const r of vert) add(...r);

// Protocol / standards more
const proto = [
  ['LSP invent codeAction', 'protocol', 'weak', 'LSP', 'Code actions', 'Partial'],
  ['LSP invent rename', 'protocol', 'weak', 'LSP', 'Rename symbol', 'Missing'],
  ['LSP invent hover', 'protocol', 'weak', 'LSP', 'Hover info', 'Partial'],
  ['LSP invent completion', 'protocol', 'partial', 'LSP', 'Completions', 'NES'],
  ['LSP invent definition', 'protocol', 'weak', 'LSP', 'Go to def', 'Partial'],
  ['LSP invent references', 'protocol', 'weak', 'LSP', 'Find refs', 'Partial'],
  ['LSP invent formatting', 'protocol', 'weak', 'LSP', 'Format doc', 'Partial'],
  ['LSP invent semanticTokens', 'protocol', 'worst', 'LSP', 'Semantic highlight', 'Missing'],
  ['LSP invent inlayHint', 'protocol', 'worst', 'LSP', 'Inlay hints', 'Missing'],
  ['DAP invent breakpoints', 'protocol', 'worst', 'DAP', 'Breakpoints', 'Missing'],
  ['DAP invent stackTrace', 'protocol', 'worst', 'DAP', 'Stack traces', 'Missing'],
  ['DAP invent evaluate', 'protocol', 'worst', 'DAP', 'Eval expressions', 'Missing'],
  ['MCP invent tools/list', 'protocol', 'partial', 'MCP', 'List tools', 'Partial'],
  ['MCP invent tools/call', 'protocol', 'partial', 'MCP', 'Call tools', 'Partial'],
  ['MCP invent logging', 'protocol', 'weak', 'MCP', 'Server logs', 'Partial'],
  ['MCP invent progress', 'protocol', 'weak', 'MCP', 'Progress notices', 'Partial'],
  ['ACP invent session/new', 'protocol', 'weak', 'ACP', 'New session', 'Partial'],
  ['ACP invent prompt', 'protocol', 'weak', 'ACP', 'Prompt turn', 'Partial'],
  ['ACP invent permission', 'protocol', 'weak', 'ACP', 'Permission requests', 'Partial'],
  ['A2A invent task lifecycle', 'protocol', 'worst', 'A2A', 'Task states', 'Missing'],
];
for (const r of proto) add(...r);

// Security coding more
const sec = [
  ['SAST invent invent gate CI', 'coding', 'weak', 'Semgrep / CodeQL', 'SAST in CI', 'Partial'],
  ['DAST invent invent scan', 'coding', 'worst', 'OWASP ZAP', 'DAST scans', 'Missing'],
  ['SCA invent invent deps', 'coding', 'weak', 'Snyk / OSV', 'SCA deps', 'Partial'],
  ['IaC invent invent scan', 'coding', 'worst', 'Checkov / tfsec', 'IaC scan', 'Missing'],
  ['Container invent invent scan', 'coding', 'worst', 'Trivy', 'Image scan', 'Missing'],
  ['Secret invent invent precommit', 'coding', 'weak', 'gitleaks', 'Pre-commit secrets', 'Partial'],
  ['Policy invent invent OPA', 'coding', 'worst', 'OPA', 'Policy as code', 'Missing'],
  ['Least-privilege invent tools', 'coding', 'partial', 'Capstone', 'Scoped tool grants', 'Partial'],
  ['Sandbox invent invent FS', 'coding', 'weak', 'Codex', 'FS sandbox', 'Desktop soft'],
  ['Sandbox invent invent net', 'coding', 'weak', 'Codex', 'Net sandbox', 'Partial'],
  ['Prompt invent invent firewall', 'coding', 'weak', 'field', 'Prompt firewall', 'Partial'],
  ['Output invent invent filter', 'coding', 'weak', 'field', 'Output filters', 'Partial'],
  ['Jailbreak invent invent tests', 'coding', 'worst', 'Promptfoo', 'Jailbreak suite', 'Missing'],
  ['Supply-chain invent invent pin', 'coding', 'weak', 'field', 'Pin hashes', 'Partial'],
  ['Provenance invent invent attest', 'coding', 'worst', 'SLSA', 'Attestations', 'Missing'],
  ['SBOM invent invent gate', 'coding', 'worst', 'Syft', 'SBOM required', 'Missing'],
  ['License invent invent scan', 'coding', 'weak', 'fossa / scancode', 'License scan', 'Partial'],
  ['PII invent invent detect', 'coding', 'weak', 'field', 'PII detect', 'Partial'],
  ['Toxicity invent invent filter', 'coding', 'worst', 'field', 'Toxicity filter', 'Missing'],
  ['Abuse invent invent rate limit', 'coding', 'partial', 'field', 'Rate limits', 'Partial'],
];
for (const r of sec) add(...r);

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
