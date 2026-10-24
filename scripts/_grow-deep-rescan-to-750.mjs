/**
 * Grow nova-deep-rescan toward 750+ rows (coding-first living matrix).
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

// —— IDE / editor coding agents ——
const ide = [
  ['JetBrains AI Assistant coding', 'coding', 'weak', 'JetBrains AI', 'Native IDE agent', 'Electron chat'],
  ['JetBrains Junie agent', 'coding', 'worst', 'Junie', 'Autonomous IDE agent', 'Missing'],
  ['Android Studio Gemini coding', 'coding', 'worst', 'Android Studio', 'Mobile IDE agent', 'Missing'],
  ['Xcode Swift Assist', 'coding', 'worst', 'Apple', 'Swift Assist', 'Missing'],
  ['Visual Studio IntelliCode++', 'coding', 'worst', 'VS / GitHub Copilot', 'VS native', 'Missing'],
  ['Neovim Avante agent', 'coding', 'worst', 'Avante.nvim', 'Neovim agent', 'Missing'],
  ['Neovim CodeCompanion', 'coding', 'worst', 'CodeCompanion', 'Neovim chat', 'Missing'],
  ['Emacs gptel coding', 'coding', 'worst', 'gptel', 'Emacs LLM', 'Missing'],
  ['Zed AI agent panel', 'coding', 'weak', 'Zed', 'Native agent panel', 'Missing'],
  ['Zed edit prediction', 'coding', 'weak', 'Zed', 'Inline predict', 'NES partial'],
  ['Helix LSP AI bridge', 'coding', 'worst', 'Helix', 'Editor AI bridge', 'Missing'],
  ['Nova Code editor Acc overlay', 'coding', 'strong', 'Nova', 'ChatCodeOverlay', 'wired'],
  ['Nova PlanOpenPill status', 'coding', 'strong', 'Nova', 'Plan open pill', 'wired'],
  ['Nova WorkTrace timeline', 'coding', 'strong', 'Nova', 'WorkTrace', 'wired'],
  ['Nova AgentTracePanel', 'coding', 'strong', 'Nova', 'AgentTracePanel', 'wired'],
  ['Nova TokenUsageRing', 'coding', 'strong', 'Nova', 'Token ring', 'wired'],
  ['Nova TeammateBar seats', 'coding', 'partial', 'Nova', 'Teammate bar', 'UI seats'],
];
for (const r of ide) add(...r);

// —— Cloud agent platforms ——
const cloud = [
  ['GitHub Copilot Workspace PR', 'coding', 'worst', 'Copilot Workspace', 'Issue→PR cloud', 'Missing'],
  ['GitHub Copilot coding agent', 'coding', 'worst', 'Copilot Agent', 'Async coding agent', 'Missing'],
  ['GitHub Spark app builder', 'coding', 'worst', 'Spark', 'App builder', 'invent SPA'],
  ['Azure DevOps AI PR', 'coding', 'worst', 'Azure DevOps', 'ADO AI reviews', 'Missing'],
  ['AWS CodeWhisperer / Q Dev', 'coding', 'weak', 'Amazon Q', 'AWS IDE agent', 'BYOK possible'],
  ['AWS Transform modernize', 'coding', 'worst', 'AWS Transform', 'Legacy modernize', 'Missing'],
  ['Google Code Assist IDE', 'coding', 'weak', 'Code Assist', 'Gemini in IDE', 'BYOK'],
  ['Google Jules async agent', 'coding', 'worst', 'Jules', 'Async Jules agent', 'Missing'],
  ['Firebase Studio coding', 'coding', 'worst', 'Firebase Studio', 'Full-stack studio', 'Missing'],
  ['Vertex AI Agent Builder', 'coding', 'worst', 'Vertex', 'Agent Builder', 'Missing'],
  ['Oracle Code Assist', 'coding', 'worst', 'Oracle', 'Enterprise assist', 'Missing'],
  ['SAP Joule coding', 'coding', 'worst', 'SAP', 'Joule for builders', 'Missing'],
  ['IBM watsonx Code Assistant', 'coding', 'worst', 'IBM', 'watsonx CA', 'Missing'],
  ['Salesforce Agentforce code', 'coding', 'worst', 'Salesforce', 'Apex agent', 'Missing'],
  ['ServiceNow Now Assist code', 'coding', 'worst', 'ServiceNow', 'Now Assist', 'Missing'],
];
for (const r of cloud) add(...r);

// —— Open-source coding agents ——
const oss = [
  ['Aider architect mode', 'coding', 'partial', 'Aider', 'Architect/editor split', 'Architect hop'],
  ['Aider whole-file edit', 'coding', 'weak', 'Aider', 'Whole-file writes', 'patch prefer'],
  ['Aider repo map tokens', 'coding', 'partial', 'Aider', 'Repo map budget', 'repo map lite'],
  ['Aider lint-on-edit loop', 'coding', 'partial', 'Aider', 'Lint after edit', 'syntax gate'],
  ['Continue.dev autocomplete', 'coding', 'weak', 'Continue', 'Local autocomplete', 'NES'],
  ['Continue.dev custom agents', 'coding', 'weak', 'Continue', 'Agent configs', 'Acc packs'],
  ['Cline VS Code agent', 'coding', 'weak', 'Cline', 'VS Code autonomous', 'Electron agent'],
  ['Roo Code / Roo-Cline fork', 'coding', 'weak', 'Roo', 'Modes + MCP', 'Partial'],
  ['Roo Code Boomerang tasks', 'coding', 'worst', 'Roo', 'Boomerang handoff', 'Missing'],
  ['Roo Code custom modes YAML', 'coding', 'weak', 'Roo', 'Custom modes', 'Acc modes'],
  ['Aider vs Cline vs Roo matrix', 'coding', 'partial', 'field OSS', 'OSS agent compare', 'research rows'],
  ['OpenHands / OpenDevin loop', 'coding', 'weak', 'OpenHands', 'Browser+code agent', 'Missing browser agent'],
  ['SWE-agent ACI interface', 'coding', 'weak', 'SWE-agent', 'Agent-Computer Interface', 'TOOL set'],
  ['SWE-agent history processors', 'coding', 'weak', 'SWE-agent', 'History compress', 'elision'],
  ['Mini-SWE-agent tiny loop', 'coding', 'partial', 'SWE-agent', 'Minimal loop', 'agentHarness'],
  ['Moatless Tools graph', 'coding', 'worst', 'Moatless', 'Code graph tools', 'repo map'],
  ['AutoCodeRover hierarchical', 'coding', 'worst', 'AutoCodeRover', 'Hierarchical search', 'Missing'],
  ['Agentless retrieval fix', 'coding', 'worst', 'Agentless', 'No-agent SWE fix', 'agent loop'],
  ['RepairAgent bug repair', 'coding', 'worst', 'RepairAgent', 'Automated repair', 'Missing'],
  ['ChatDev multi-role sim', 'coding', 'weak', 'ChatDev', 'Roleplay company', 'ensemble parked'],
  ['MetaGPT SOP waterfall', 'coding', 'weak', 'MetaGPT', 'SOP agents', 'create spine'],
  ['GPT Engineer bootstrap', 'coding', 'weak', 'GPT Engineer', 'Clarify→code', 'create brief'],
  ['Smol Developer scaffold', 'coding', 'weak', 'smol-ai', 'Spec→files', 'freshSpa'],
  ['Open Interpreter computer', 'coding', 'worst', 'Open Interpreter', 'Local computer use', 'Missing'],
  ['Hugging Face smolagents', 'coding', 'weak', 'smolagents', 'CodeAct agents', 'Partial'],
  ['LangGraph coding graph', 'coding', 'weak', 'LangGraph', 'Graph state machines', 'createPassSpine'],
  ['CrewAI coding crew', 'coding', 'weak', 'CrewAI', 'Role crews', 'ensemble'],
  ['AutoGen multi-agent chat', 'coding', 'weak', 'AutoGen', 'Multi-agent chat', 'ensemble'],
  ['Semantic Kernel planners', 'coding', 'worst', 'Semantic Kernel', 'SK planners', 'Missing'],
  ['Haystack pipelines code', 'coding', 'worst', 'Haystack', 'RAG pipelines', 'Missing'],
];
for (const r of oss) add(...r);

// —— Terminal / CLI agents ——
const cli = [
  ['Claude Code CLI deep', 'coding', 'partial', 'Claude Code', 'CLI agent deep', 'chat agent'],
  ['Codex CLI apply_patch', 'coding', 'weak', 'Codex CLI', 'apply_patch tool', 'Acc patch'],
  ['Gemini CLI tools', 'coding', 'weak', 'Gemini CLI', 'Google CLI agent', 'Partial'],
  ['Aider CLI headless CI', 'coding', 'weak', 'Aider', 'CI headless', 'smokes'],
  ['Goose CLI Block schedule', 'coding', 'weak', 'Goose', 'Block / recipes', 'automations Acc'],
  ['Crush CLI multi-provider', 'coding', 'weak', 'Crush', 'Multi-provider CLI', 'BYOK'],
  ['Amp CLI / Threads', 'coding', 'weak', 'Amp', 'Threads + Oracle', 'Partial'],
  ['Warp AI agent mode', 'coding', 'worst', 'Warp', 'Terminal AI agent', 'Missing'],
  ['Fig / Amazon Q terminal', 'coding', 'worst', 'Amazon Q', 'Terminal completions', 'Missing'],
  ['Oh My Zsh AI plugins', 'coding', 'worst', 'field', 'Shell AI plugins', 'Missing'],
  ['tmux-aware coding agent', 'coding', 'worst', 'field', 'tmux session agent', 'Missing'],
  ['SSH remote coding agent', 'coding', 'weak', 'Cursor Remote / SSH', 'Remote SSH agent', 'local Desktop'],
  ['Devcontainer coding agent', 'coding', 'weak', 'VS Code Dev Containers', 'Agent in container', 'Desktop host'],
  ['Codespaces coding agent', 'coding', 'worst', 'GitHub Codespaces', 'Cloud workspace agent', 'Missing'],
];
for (const r of cli) add(...r);

// —— Spec / plan / docs-as-code ——
const spec = [
  ['OpenAPI-first invent codegen', 'coding', 'weak', 'Speakeasy / Stainless', 'SDK from OpenAPI', 'API stub'],
  ['AsyncAPI invent', 'coding', 'worst', 'AsyncAPI', 'Event APIs', 'Missing'],
  ['GraphQL schema invent first', 'coding', 'worst', 'field', 'Schema-first GQL', 'Missing'],
  ['Protobuf invent codegen', 'coding', 'worst', 'buf', 'Proto→code', 'Missing'],
  ['Smithy invent models', 'coding', 'worst', 'AWS Smithy', 'Smithy IDL', 'Missing'],
  ['ADR invent Acc', 'coding', 'partial', 'field', 'Architecture Decision Records', 'plan Acc'],
  ['RFC invent workflow', 'coding', 'weak', 'field', 'RFC before code', 'plan mode'],
  ['Design Doc invent gate', 'coding', 'partial', 'Google Eng', 'Design doc gate', 'create brief'],
  ['SpecKit / spec-driven invent', 'coding', 'weak', 'SpecKit', 'Spec→impl', 'kiro-spec Acc'],
  ['Gherkin invent acceptance', 'coding', 'weak', 'Cucumber', 'BDD scenarios', 'smokes'],
  ['Contract tests invent Pact', 'coding', 'worst', 'Pact', 'Consumer contracts', 'Missing'],
  ['Property-based invent tests', 'coding', 'worst', 'Hypothesis / fast-check', 'PBT', 'Missing'],
  ['Mutation testing invent', 'coding', 'worst', 'Stryker / PIT', 'Mutation score', 'Missing'],
  ['Snapshot test invent gate', 'coding', 'weak', 'Jest / Vitest', 'Snapshots', 'Live screenshot'],
  ['Visual regression invent Percy', 'coding', 'worst', 'Percy / Chromatic', 'Visual CI', 'Live only'],
  ['Storybook invent component', 'coding', 'worst', 'Storybook', 'Component workshop', 'Missing'],
  ['Chromatic invent review', 'coding', 'worst', 'Chromatic', 'UI review cloud', 'Missing'],
  ['Ladle invent components', 'coding', 'worst', 'Ladle', 'Vite stories', 'Missing'],
  ['Histoire invent Vue stories', 'coding', 'worst', 'Histoire', 'Vue stories', 'Missing'],
];
for (const r of spec) add(...r);

// —— Security / supply chain coding ——
const sec = [
  ['Semgrep invent scan gate', 'coding', 'weak', 'Semgrep', 'SAST in loop', 'Partial'],
  ['CodeQL invent queries', 'coding', 'worst', 'CodeQL', 'QL queries', 'Missing'],
  ['Snyk invent dependency fix', 'coding', 'worst', 'Snyk', 'Dep vuln fix PRs', 'Missing'],
  ['Dependabot invent auto PRs', 'coding', 'worst', 'Dependabot', 'Auto bump PRs', 'Missing'],
  ['Renovate invent bots', 'coding', 'worst', 'Renovate', 'Multi-ecosystem bumps', 'Missing'],
  ['Trivy invent container scan', 'coding', 'worst', 'Trivy', 'Container CVE', 'Missing'],
  ['Gitleaks invent secret scan', 'coding', 'weak', 'Gitleaks', 'Secret scan', 'dont-touch soft'],
  ['TruffleHog invent secrets', 'coding', 'worst', 'TruffleHog', 'Deep secret hunt', 'Missing'],
  ['SBOM invent CycloneDX', 'coding', 'worst', 'Syft / CycloneDX', 'SBOM emit', 'Missing'],
  ['SLSA invent provenance', 'coding', 'worst', 'SLSA', 'Build provenance', 'Missing'],
  ['Sigstore invent signing', 'coding', 'worst', 'Sigstore', 'Sign artifacts', 'Missing'],
  ['OWASP LLM Top 10 invent', 'coding', 'partial', 'OWASP', 'LLM threat model', 'Partial prefs'],
  ['Prompt injection invent harden', 'coding', 'partial', 'OWASP', 'Injection defenses', 'Partial'],
  ['Tool output sanitization', 'coding', 'partial', 'Agent47', 'Sanitize tool outs', 'Partial'],
  ['Secret redaction in traces', 'coding', 'weak', 'field', 'Redact secrets in logs', 'Partial'],
  ['PII scrub invent chat', 'coding', 'weak', 'field', 'PII scrub', 'privacy settings'],
  ['Model data residency invent', 'coding', 'weak', 'enterprise', 'Region lock models', 'local GGUF'],
  ['Air-gapped invent coding', 'coding', 'partial', 'local-first', 'No network coding', 'local engine'],
];
for (const r of sec) add(...r);

// —— Observability / evals ——
const obs = [
  ['LangSmith invent traces', 'coding', 'worst', 'LangSmith', 'LLM traces', 'AgentTrace'],
  ['Langfuse invent open telemetry', 'coding', 'worst', 'Langfuse', 'Open LLM observability', 'Partial'],
  ['Helicone invent proxy', 'coding', 'worst', 'Helicone', 'LLM proxy metrics', 'Missing'],
  ['Phoenix Arize invent evals', 'coding', 'worst', 'Arize Phoenix', 'Eval UI', 'Missing'],
  ['Braintrust invent experiments', 'coding', 'worst', 'Braintrust', 'Eval experiments', 'smokes'],
  ['Promptfoo invent redteam', 'coding', 'worst', 'Promptfoo', 'Prompt redteam', 'Missing'],
  ['RAGAS invent RAG scores', 'coding', 'worst', 'RAGAS', 'RAG metrics', 'Missing'],
  ['DeepEval invent unit LLM', 'coding', 'worst', 'DeepEval', 'LLM unit tests', 'smokes'],
  ['Giskard invent ML test', 'coding', 'worst', 'Giskard', 'ML testing', 'Missing'],
  ['W&B Weave invent traces', 'coding', 'worst', 'Weights & Biases', 'Weave traces', 'Missing'],
  ['MLflow invent prompt tracking', 'coding', 'worst', 'MLflow', 'Prompt versions', 'Missing'],
  ['OpenTelemetry invent LLM spans', 'coding', 'worst', 'OTel', 'GenAI spans', 'Missing'],
  ['Sentry invent AI monitoring', 'coding', 'worst', 'Sentry', 'AI error monitor', 'Missing'],
  ['Datadog invent LLM Obs', 'coding', 'worst', 'Datadog', 'LLM Observability', 'Missing'],
  ['Nova invent craft smoke pack', 'coding', 'strong', 'Nova', 'smoke-invent-craft-pack', 'wired'],
  ['Nova invent harness p0–p2', 'coding', 'strong', 'Nova', 'agentHarness packs', 'wired'],
  ['Nova invent Live grade path', 'coding', 'strong', 'Nova', 'Live preview grade', 'wired'],
  ['Nova invent Ready gate', 'coding', 'strong', 'Nova', 'createReady', 'wired'],
  ['Nova invent evidence package', 'coding', 'strong', 'Nova', 'createEvidence', 'wired'],
];
for (const r of obs) add(...r);

// —— Collaboration / PR ——
const collab = [
  ['CodeRabbit invent PR review', 'coding', 'worst', 'CodeRabbit', 'AI PR bot', 'pr-review Acc'],
  ['Greptile invent PR review', 'coding', 'worst', 'Greptile', 'Repo-aware PR', 'Missing'],
  ['Graphite invent stacked PRs', 'coding', 'worst', 'Graphite', 'Stacked diffs', 'Missing'],
  ['Aviator invent merge queue', 'coding', 'worst', 'Aviator', 'Merge queue AI', 'Missing'],
  ['Trunk invent merge / flaky', 'coding', 'worst', 'Trunk', 'Merge + flaky', 'Missing'],
  ['Reviewable invent reviews', 'coding', 'worst', 'Reviewable', 'Review UX', 'Missing'],
  ['PullRequest invent AI', 'coding', 'worst', 'PullRequest.com', 'AI reviews', 'Missing'],
  ['Qodo / Codium invent tests', 'coding', 'weak', 'Qodo', 'Test gen + review', 'Partial'],
  ['Mutable.ai invent refactor', 'coding', 'worst', 'Mutable', 'Large refactors', 'Missing'],
  ['Sourcegraph Cody invent', 'coding', 'weak', 'Cody', 'Code intel chat', 'repo map'],
  ['Sourcegraph Amp invent', 'coding', 'weak', 'Amp', 'Agentic coding', 'Partial'],
  ['Tabnine invent enterprise', 'coding', 'weak', 'Tabnine', 'Private models', 'local GGUF'],
  ['Codeium / Windsurf invent', 'coding', 'weak', 'Windsurf', 'Cascade agent', 'Partial'],
  ['Cursor Background Agents', 'coding', 'worst', 'Cursor', 'Cloud background agents', 'Desktop only'],
  ['Cursor Bugbot invent review', 'coding', 'weak', 'Cursor Bugbot', 'PR bug hunt', 'pr-review Acc'],
  ['Cursor Bugbot autofix', 'coding', 'worst', 'Cursor', 'Autofix from review', 'Missing'],
  ['Linear invent agent tickets', 'coding', 'partial', 'Linear', 'Issue→agent', 'linear.ts'],
  ['Notion invent coding docs', 'coding', 'partial', 'Notion', 'Docs sync', 'notion.ts'],
  ['Slack invent coding notify', 'coding', 'partial', 'Slack', 'Build notify', 'slack.ts'],
  ['Discord invent coding bot', 'coding', 'partial', 'Discord', 'Bot hooks', 'discord.ts'],
  ['Figma invent to code deep', 'product', 'partial', 'Figma / Anima', 'Design→code', 'figma.ts'],
  ['GDrive invent asset pull', 'product', 'partial', 'Google Drive', 'Asset import', 'gdrive.ts'],
];
for (const r of collab) add(...r);

// —— Runtime / deploy invent ——
const deploy = [
  ['Vercel invent deploy one-click', 'product', 'weak', 'v0 / Vercel', 'One-click deploy', 'deploy Acc'],
  ['Netlify invent deploy', 'product', 'weak', 'Netlify', 'Drop deploy', 'Missing'],
  ['Cloudflare Pages invent', 'product', 'weak', 'CF Pages', 'Edge deploy', 'Missing'],
  ['Railway invent deploy', 'product', 'weak', 'Railway', 'App deploy', 'Missing'],
  ['Render invent deploy', 'product', 'weak', 'Render', 'Web service', 'Missing'],
  ['Fly.io invent deploy', 'product', 'weak', 'Fly', 'Machines deploy', 'Missing'],
  ['Docker invent packaging', 'coding', 'weak', 'Docker', 'Dockerfile invent', 'Partial'],
  ['Kubernetes invent manifests', 'coding', 'worst', 'field', 'K8s YAML invent', 'Missing'],
  ['Terraform invent IaC', 'coding', 'worst', 'field', 'Tf invent', 'Missing'],
  ['Pulumi invent IaC', 'coding', 'worst', 'Pulumi', 'Pulumi invent', 'Missing'],
  ['CDK invent AWS', 'coding', 'worst', 'AWS CDK', 'CDK invent', 'Missing'],
  ['Serverless invent Framework', 'coding', 'worst', 'Serverless', 'SLS invent', 'Missing'],
  ['Edge functions invent', 'coding', 'weak', 'Vercel / CF', 'Edge fn invent', 'Missing'],
  ['Cron invent jobs Acc', 'coding', 'weak', 'field', 'Cron descriptors', 'automations'],
  ['Queue invent workers', 'coding', 'worst', 'field', 'Worker queues', 'Missing'],
  ['WebSocket invent realtime', 'coding', 'weak', 'field', 'WS invent', 'Partial'],
  ['SSE invent streaming API', 'coding', 'partial', 'field', 'SSE invent', 'chat stream'],
];
for (const r of deploy) add(...r);

// —— Data / backend invent ——
const data = [
  ['Postgres invent schema', 'coding', 'weak', 'Supabase / Neon', 'SQL invent', 'Partial stub'],
  ['SQLite invent local', 'coding', 'partial', 'field', 'Local SQLite', 'Partial'],
  ['Mongo invent schemas', 'coding', 'worst', 'field', 'Mongo invent', 'Missing'],
  ['Redis invent cache layer', 'coding', 'worst', 'field', 'Redis invent', 'Missing'],
  ['Prisma invent ORM', 'coding', 'weak', 'Prisma', 'Prisma schema', 'Missing'],
  ['Drizzle invent ORM', 'coding', 'weak', 'Drizzle', 'Drizzle schema', 'Missing'],
  ['tRPC invent end-to-end', 'coding', 'weak', 'tRPC', 'Type-safe RPC', 'Missing'],
  ['GraphQL invent Yoga/Apollo', 'coding', 'worst', 'field', 'GQL server', 'Missing'],
  ['Auth invent Clerk/Auth.js', 'product', 'weak', 'Clerk / Auth.js', 'Auth scaffolds', 'AuthContext'],
  ['Stripe invent checkout deep', 'product', 'weak', 'Stripe', 'Full checkout', 'payments stub'],
  ['Email invent Resend/Postmark', 'product', 'weak', 'Resend', 'Transactional email', 'Missing'],
  ['Storage invent S3/R2', 'coding', 'weak', 'field', 'Object storage', 'Missing'],
  ['Search invent Meilisearch', 'coding', 'worst', 'Meilisearch', 'Search invent', 'Missing'],
  ['Vector invent embeddings DB', 'coding', 'weak', 'Pinecone / pgvector', 'Vector store', 'Partial'],
  ['Analytics invent PostHog', 'product', 'weak', 'PostHog', 'Product analytics', 'analytics stub'],
  ['Feature flags invent', 'coding', 'weak', 'LaunchDarkly / Flags', 'Flag invent', 'Missing'],
  ['i18n invent locales', 'product', 'weak', 'field', 'i18n scaffolds', 'Partial'],
  ['CMS invent Sanity/Contentful', 'product', 'worst', 'Sanity', 'Headless CMS', 'Missing'],
];
for (const r of data) add(...r);

// —— Model routing / seats ——
const seats = [
  ['Cheap model for grep/read', 'coding', 'partial', 'Cursor / Amp', 'Haiku/flash for tools', 'seat swap'],
  ['Strong model for hard edit', 'coding', 'partial', 'Cursor', 'Sonnet/Opus for hard', 'engineSeatSwap'],
  ['Local fallback on cloud fail', 'coding', 'strong', 'Nova', 'GGUF fallback', 'local engine'],
  ['Multi-model invent vote', 'coding', 'weak', 'createEnsemble', 'Vote/ensemble', 'parked default'],
  ['Model latency SLA invent', 'coding', 'weak', 'field', 'Latency budgets', 'Partial'],
  ['Model cost budget invent', 'coding', 'partial', 'field', '$ budget gates', 'budget.json'],
  ['Per-tool model override', 'coding', 'weak', 'Amp', 'Tool→model map', 'Partial'],
  ['Thinking/reasoning toggle', 'coding', 'partial', 'Claude / o-series', 'Extended thinking', 'Partial'],
  ['Speculative decoding invent', 'coding', 'worst', 'inference eng', 'Spec decode', 'Missing'],
  ['Prefill cache invent reuse', 'coding', 'weak', 'Anthropic / OpenAI', 'Prompt cache', 'Partial'],
  ['Structured output invent JSON', 'coding', 'partial', 'field', 'JSON schema out', 'Partial'],
  ['Tool-use constrained decode', 'coding', 'weak', 'field', 'Grammar/tool constrain', 'Partial'],
  ['Vision invent coding screenshot', 'coding', 'partial', 'Claude / GPT', 'See Live screenshot', 'previewCapture'],
  ['Audio invent coding voice', 'coding', 'partial', 'field', 'Voice coding', 'voiceSession'],
  ['Video invent coding walkthrough', 'coding', 'worst', 'field', 'Video brief', 'Missing'],
];
for (const r of seats) add(...r);

// —— Protocol / ACP / MCP fine ——
const proto = [
  ['MCP resources invent list', 'protocol', 'partial', 'MCP', 'resources/list', 'Partial'],
  ['MCP prompts invent templates', 'protocol', 'partial', 'MCP', 'prompts/get', 'Partial'],
  ['MCP sampling invent host', 'protocol', 'weak', 'MCP', 'sampling/createMessage', 'Partial'],
  ['MCP roots invent workspace', 'protocol', 'partial', 'MCP', 'roots/list', 'workspace root'],
  ['MCP elicitation invent forms', 'protocol', 'worst', 'MCP', 'Elicitation UX', 'Missing'],
  ['MCP OAuth invent clients', 'protocol', 'weak', 'MCP', 'OAuth for servers', 'Partial'],
  ['ACP agent↔client invent', 'protocol', 'weak', 'Zed ACP', 'Agent Client Protocol', 'foreign-cli Acc'],
  ['LSP invent diagnostics stream', 'protocol', 'weak', 'LSP', 'Publish diagnostics', 'coding-lsp Acc'],
  ['DAP invent debug adapter', 'protocol', 'worst', 'DAP', 'Debug Adapter Protocol', 'Missing'],
  ['JSON-RPC invent tool bus', 'protocol', 'partial', 'field', 'JSON-RPC tools', 'Partial'],
  ['A2A invent agent-to-agent', 'protocol', 'worst', 'Google A2A', 'A2A protocol', 'Missing'],
  ['AG-UI invent event stream', 'protocol', 'worst', 'AG-UI', 'Agent UI events', 'Missing'],
  ['OpenResponses invent API', 'protocol', 'weak', 'OpenAI', 'Responses API', 'Partial'],
  ['Anthropic Messages invent API', 'protocol', 'partial', 'Anthropic', 'Messages+tools', 'BYOK'],
  ['OpenAI Chat Completions invent', 'protocol', 'partial', 'OpenAI', 'Chat+tools', 'BYOK'],
];
for (const r of proto) add(...r);

// —— Benchmarks / research papers as capabilities ——
const benches = [
  ['SWE-bench Verified invent track', 'coding', 'weak', 'SWE-bench', 'Verified subset', 'smokes'],
  ['SWE-bench Multimodal invent', 'coding', 'worst', 'SWE-bench', 'Image issues', 'Missing'],
  ['SWE-bench Lite invent', 'coding', 'weak', 'SWE-bench', 'Lite subset', 'smokes'],
  ['SWE-Bench Pro invent hard', 'coding', 'weak', 'SWE-Bench Pro', 'Hard industrial', 'Partial'],
  ['LiveCodeBench invent contest', 'coding', 'worst', 'LiveCodeBench', 'Contest coding', 'Missing'],
  ['BigCodeBench invent tools', 'coding', 'worst', 'BigCodeBench', 'Tool-use coding', 'Missing'],
  ['HumanEval invent function', 'coding', 'weak', 'HumanEval', 'Function synth', 'Partial'],
  ['MBPP invent python', 'coding', 'worst', 'MBPP', 'Python problems', 'Missing'],
  ['DS-1000 invent data science', 'coding', 'worst', 'DS-1000', 'Data science code', 'Missing'],
  ['RepoBench invent retrieval', 'coding', 'weak', 'RepoBench', 'Repo-level retrieve', 'repo map'],
  ['CrossCodeEval invent crossfile', 'coding', 'weak', 'CrossCodeEval', 'Cross-file edit', 'Partial'],
  ['CanItEdit invent instruction', 'coding', 'weak', 'CanItEdit', 'Edit instructions', 'edit path'],
  ['Aider polyglot invent leaderboard', 'coding', 'weak', 'Aider polyglot', 'Multi-lang bench', 'JS focus'],
  ['Terminal-Bench invent CLI', 'coding', 'worst', 'Terminal-Bench', 'CLI task bench', 'Missing'],
  ['WebArena invent web agent', 'coding', 'worst', 'WebArena', 'Web agent bench', 'Missing'],
  ['OSWorld invent desktop agent', 'coding', 'worst', 'OSWorld', 'Desktop agent', 'Missing'],
  ['GAIA invent general assistant', 'coding', 'worst', 'GAIA', 'General AI assist', 'Missing'],
  ['τ-bench invent tool agents', 'coding', 'worst', 'τ-bench', 'Tool-use bench', 'Missing'],
  ['BFCL invent function call', 'coding', 'weak', 'BFCL', 'Function calling', 'tools'],
  ['AgentBench invent multi env', 'coding', 'worst', 'AgentBench', 'Multi-env agents', 'Missing'],
];
for (const r of benches) add(...r);

// —— Nova-strong invent craft micro ——
const novaStrong = [
  ['Invent click-to-source Live', 'coding', 'strong', 'Nova', 'inventClickToSource', 'wired'],
  ['Invent web project canon', 'coding', 'strong', 'Nova', 'webProjectCanon', 'wired'],
  ['Invent brand assets Acc', 'product', 'strong', 'Nova', 'brandAssets', 'wired'],
  ['Invent field pack Acc rows', 'product', 'strong', 'Nova', 'inventFieldPack', 'wired'],
  ['Invent coding pack Acc rows', 'coding', 'strong', 'Nova', 'inventCodingPack', 'wired'],
  ['Invent craft pack Acc rows', 'product', 'strong', 'Nova', 'inventCraftPack', 'wired'],
  ['Invent harness pack Acc', 'coding', 'strong', 'Nova', 'inventHarnessPack', 'wired'],
  ['Invent platform pack Acc', 'product', 'strong', 'Nova', 'inventPlatformPack', 'wired'],
  ['Invent wave4 pack Acc', 'product', 'strong', 'Nova', 'inventWave4Pack', 'wired'],
  ['Invent wave5 pack Acc', 'product', 'strong', 'Nova', 'inventWave5Pack', 'wired'],
  ['Invent close-all pack Acc', 'product', 'strong', 'Nova', 'inventCloseAllPack', 'wired'],
  ['Invent createPassSpine', 'coding', 'strong', 'Nova', 'createPassSpine', 'wired'],
  ['Invent createRuntimeLoop', 'coding', 'strong', 'Nova', 'createRuntimeLoop', 'wired'],
  ['Invent createProjectMap', 'coding', 'strong', 'Nova', 'createProjectMap', 'wired'],
  ['Invent createProjectIntent', 'coding', 'strong', 'Nova', 'createProjectIntent', 'wired'],
  ['Invent chatCreateBrief', 'coding', 'strong', 'Nova', 'chatCreateBrief', 'wired'],
  ['Invent classifyTurn create', 'coding', 'strong', 'Nova', 'classifyTurn', 'wired'],
  ['Invent editAskResolve', 'coding', 'strong', 'Nova', 'editAskResolve', 'wired'],
  ['Invent chatAgentApply', 'coding', 'strong', 'Nova', 'chatAgentApply', 'wired'],
  ['Invent novaAgentPatch', 'coding', 'strong', 'Nova', 'novaAgentPatch', 'wired'],
  ['Invent novaAgentLoop tools', 'coding', 'strong', 'Nova', 'novaAgentLoop', 'wired'],
  ['Invent answerContract', 'coding', 'strong', 'Nova', 'answerContract', 'wired'],
  ['Invent createAskContract', 'coding', 'strong', 'Nova', 'createAskContract', 'wired'],
  ['Invent verifyAsk path', 'coding', 'strong', 'Nova', 'verifyAsk', 'wired'],
  ['Invent plainChatAsk', 'coding', 'strong', 'Nova', 'plainChatAsk', 'wired'],
  ['Invent studioAnswerEngine', 'coding', 'strong', 'Nova', 'studioAnswerEngine', 'wired'],
  ['Invent threadBrain memory', 'coding', 'strong', 'Nova', 'threadBrain', 'wired'],
  ['Invent workQueue jobs', 'coding', 'strong', 'Nova', 'workQueue', 'wired'],
  ['Invent createJobStore', 'coding', 'strong', 'Nova', 'createJobStore', 'wired'],
  ['Invent chatStudioStore', 'coding', 'strong', 'Nova', 'chatStudioStore', 'wired'],
];
for (const r of novaStrong) add(...r);

// —— More product invent verticals ——
const verticals = [
  ['SaaS marketing invent deep', 'product', 'partial', 'v0 / Framer', 'SaaS landing', 'storefront ladder'],
  ['E-commerce invent deep', 'product', 'partial', 'Shopify Hydrogen', 'Shop invent', 'storefront'],
  ['Docs invent Mintlify-like', 'product', 'weak', 'Mintlify', 'Docs site', 'Partial'],
  ['Blog invent content CMS', 'product', 'weak', 'field', 'Blog invent', 'Partial'],
  ['Portfolio invent personal', 'product', 'partial', 'field', 'Portfolio', 'invent demos'],
  ['Dashboard invent admin', 'product', 'weak', 'field', 'Admin dash', 'Partial'],
  ['Internal tool invent Retool', 'product', 'worst', 'Retool / Appsmith', 'Internal tools', 'Missing'],
  ['Form invent Typeform-like', 'product', 'weak', 'Typeform', 'Forms', 'Partial'],
  ['Waitlist invent launch', 'product', 'partial', 'field', 'Waitlist page', 'Partial'],
  ['Changelog invent product', 'product', 'partial', 'field', 'Changelog', 'changelog.ts'],
  ['Status page invent', 'product', 'worst', 'Statuspage', 'Status invent', 'Missing'],
  ['Help center invent', 'product', 'weak', 'Intercom', 'Help center', 'Partial'],
  ['Onboarding invent product', 'product', 'partial', 'field', 'Product onboarding', 'OnboardingScreen'],
  ['Pricing page invent deep', 'product', 'partial', 'field', 'Pricing section', 'storefront'],
  ['Careers invent page', 'product', 'weak', 'field', 'Careers', 'Partial'],
  ['Legal invent generator', 'product', 'partial', 'field', 'Privacy/Terms', 'privacy.md Acc'],
  ['Email template invent', 'product', 'weak', 'field', 'HTML email', 'Missing'],
  ['Newsletter invent landing', 'product', 'weak', 'field', 'Newsletter', 'Partial'],
  ['Community invent forum', 'product', 'worst', 'Discourse', 'Forum invent', 'Missing'],
  ['Marketplace invent two-sided', 'product', 'weak', 'field', 'Marketplace', 'Partial'],
];
for (const r of verticals) add(...r);

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
