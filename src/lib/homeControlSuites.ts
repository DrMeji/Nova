/**
 * Peer / theme suites for Agents · Integrations · Automations.
 * One master switch turns on every underlying helper in that suite.
 */
import type { MissingHome, MissingItem } from '@/lib/missingItemsCatalog';

export type SuiteMeta = {
  id: string;
  label: string;
  hint: string;
  accent: string;
};

/** Preferred column order (unknown peers append after). */
const SUITE_ORDER = [
  'cursor',
  'claude',
  'chatgpt',
  'gemini',
  'amp',
  'qoder',
  'copilot',
  'devin',
  'payments',
  'services',
  'mcp',
  'verify',
  'guests',
  'schedule',
  'index',
  'meta',
  'ai-safety',
  'ai-seats',
  'ai-skills',
  'privacy-net',
  'privacy-mode',
  'projects-rules',
  'projects-env',
  'advanced-ui',
  'chat-modes',
  'chat-side',
  'live-tools',
  'code-tools',
  'workspace-tools',
  'shared',
] as const;

/**
 * Display names are Nova-owned capability labels — not peer product brands.
 * Internal ids stay stable for matching; only labels/hints show in the UI.
 */
const SUITE_META: Record<string, SuiteMeta> = {
  cursor: {
    id: 'cursor',
    label: 'Work desk',
    hint: 'Parallel workers, background jobs, and the Agents window — Nova’s desk for watching invent.',
    accent: 'border-violet-500/35 bg-violet-500/5',
  },
  claude: {
    id: 'claude',
    label: 'Task crew',
    hint: 'Spawn focused tasks, nested seats, and custom agent defs Nova can load.',
    accent: 'border-amber-500/35 bg-amber-500/5',
  },
  chatgpt: {
    id: 'chatgpt',
    label: 'Build pack',
    hint: 'Coding-create helpers Nova filled in from research gaps — invent/build support.',
    accent: 'border-emerald-500/35 bg-emerald-500/5',
  },
  gemini: {
    id: 'gemini',
    label: 'Vision pack',
    hint: 'Vision and multimodal helpers Nova uses when a create needs images or layout reads.',
    accent: 'border-blue-500/35 bg-blue-500/5',
  },
  amp: {
    id: 'amp',
    label: 'Cloud orbs',
    hint: 'Register remote/cloud machine seats for heavier invent work.',
    accent: 'border-cyan-500/35 bg-cyan-500/5',
  },
  qoder: {
    id: 'qoder',
    label: 'Quest board',
    hint: 'Mission-style multi-step invent runs with a visible quest board.',
    accent: 'border-rose-500/35 bg-rose-500/5',
  },
  copilot: {
    id: 'copilot',
    label: 'Assist pack',
    hint: 'Inline assist-style helpers Nova plugs into chat and invent.',
    accent: 'border-indigo-500/35 bg-indigo-500/5',
  },
  devin: {
    id: 'devin',
    label: 'Async jobs',
    hint: 'Long-running desktop or cloud jobs that keep working after you step away.',
    accent: 'border-fuchsia-500/35 bg-fuchsia-500/5',
  },
  payments: {
    id: 'payments',
    label: 'Payments',
    hint: 'Stripe / payments panel and test-mode banner for invent that needs checkout.',
    accent: 'border-violet-400/35 bg-violet-400/5',
  },
  services: {
    id: 'services',
    label: 'Service hub',
    hint: 'GitHub, Figma, and other service links plus provider failover rules.',
    accent: 'border-sky-500/35 bg-sky-500/5',
  },
  mcp: {
    id: 'mcp',
    label: 'MCP tools',
    hint: 'Model Context Protocol scopes, resources/prompts browser, and OAuth connect.',
    accent: 'border-teal-500/35 bg-teal-500/5',
  },
  verify: {
    id: 'verify',
    label: 'Verify',
    hint: 'Smoke, harness, audit log, and supply-chain scans before you call invent Ready.',
    accent: 'border-orange-500/35 bg-orange-500/5',
  },
  guests: {
    id: 'guests',
    label: 'Guest CLIs',
    hint: 'Host outside coding CLIs as guests and inspect ACP sessions.',
    accent: 'border-lime-500/35 bg-lime-500/5',
  },
  schedule: {
    id: 'schedule',
    label: 'Schedules',
    hint: 'Cron / scheduled agent runs Nova can fire on a timer.',
    accent: 'border-purple-500/35 bg-purple-500/5',
  },
  index: {
    id: 'index',
    label: 'Index',
    hint: 'Semantic index status and rebuild for project-aware invent.',
    accent: 'border-blue-400/35 bg-blue-400/5',
  },
  meta: {
    id: 'meta',
    label: 'Nova meta',
    hint: 'What’s new, Missing items staging, and release / semver surfaces.',
    accent: 'border-zinc-500/35 bg-zinc-500/5',
  },
  shared: {
    id: 'shared',
    label: 'Orchestra',
    hint: 'Worker DAG, agent mailbox, and merge arbiter — Nova’s shared multi-agent core.',
    accent: 'border-sky-500/30 bg-sky-500/5',
  },
  // —— Settings thematic suites (Nova labels) ——
  'ai-safety': {
    id: 'ai-safety',
    label: 'Tool safety',
    hint: 'Terminal policy, per-tool allow/deny, dependency install gates, and don’t-touch zones.',
    accent: 'border-surface-border bg-transparent',
  },
  'ai-seats': {
    id: 'ai-seats',
    label: 'Seats & budget',
    hint: 'Seat routing, ensemble votes, token/$ caps, spend history, and model potential meter.',
    accent: 'border-surface-border bg-transparent',
  },
  'ai-skills': {
    id: 'ai-skills',
    label: 'Skills & hooks',
    hint: 'Skills manager, agent hooks, and custom modes that limit which tools invent may use.',
    accent: 'border-surface-border bg-transparent',
  },
  'privacy-net': {
    id: 'privacy-net',
    label: 'Network & sandbox',
    hint: 'Network allowlist, sandbox profile, and secret redaction for safer invent.',
    accent: 'border-surface-border bg-transparent',
  },
  'privacy-mode': {
    id: 'privacy-mode',
    label: 'Local-first modes',
    hint: 'Privacy vs cloud, air-gap, analytics opt-in, and untrusted-file warnings.',
    accent: 'border-surface-border bg-transparent',
  },
  'projects-rules': {
    id: 'projects-rules',
    label: 'Project rules',
    hint: 'AGENTS.md / always / glob rules editor for invent scope on this PC.',
    accent: 'border-surface-border bg-transparent',
  },
  'projects-env': {
    id: 'projects-env',
    label: 'Env & secrets',
    hint: 'Masked .env / .env.example editing so invent never dumps secrets into chat.',
    accent: 'border-surface-border bg-transparent',
  },
  'advanced-ui': {
    id: 'advanced-ui',
    label: 'Advanced shell',
    hint: 'Settings search, deep-rescan status, and other advanced / storage switches.',
    accent: 'border-surface-border bg-transparent',
  },
  'chat-modes': {
    id: 'chat-modes',
    label: 'Chat modes',
    hint: 'Ask / Plan / Act, auto-run tools, and composer helpers while you chat.',
    accent: 'border-surface-border bg-transparent',
  },
  'chat-side': {
    id: 'chat-side',
    label: 'Beside chat',
    hint: 'Side-panel helpers next to the thread (queues, memory, checkpoints).',
    accent: 'border-surface-border bg-transparent',
  },
  'live-tools': {
    id: 'live-tools',
    label: 'Live window',
    hint: 'Live preview chrome — console, grades, a11y/SEO, and related panels.',
    accent: 'border-surface-border bg-transparent',
  },
  'code-tools': {
    id: 'code-tools',
    label: 'Code overlay',
    hint: 'Diff review, git chrome, problems, tests, and refactor tools in Code.',
    accent: 'border-surface-border bg-transparent',
  },
  'workspace-tools': {
    id: 'workspace-tools',
    label: 'Workspace',
    hint: 'Deploy, brand kit, verify gates, auth/DB, and security panels for the project.',
    accent: 'border-surface-border bg-transparent',
  },
};

/** Strip peer prefixes / research suffixes so expanded rows read as Nova helpers. */
export function displayHelperTitle(title: string): string {
  return String(title || '')
    .replace(
      /^(Cursor|Claude Code|Claude|ChatGPT Codex|ChatGPT|Codex|Gemini|Google|Amp|Devin|Qoder|Copilot|Windsurf|Aider)\s*:\s*/i,
      '',
    )
    .replace(/\s*\((?:Nova missing|Nova weaker|peer stronger UX|needs Missing tab)\)\s*$/i, '')
    .trim() || title;
}

/** Static Agents catalog → suite. */
const AGENT_SUITE_BY_ID: Record<string, string> = {
  'agents-window': 'cursor',
  'background-agents-ui': 'cursor',
  'task-subagent-launch': 'claude',
  'nested-agents-ui': 'claude',
  'custom-agent-md-ui': 'claude',
  'orb-registry-ui': 'amp',
  'quest-mode-ui': 'qoder',
  'worker-dag-ui': 'shared',
  'peer-messaging-ui': 'shared',
  'orchestra-merge-arbiter': 'shared',
};

/** Static Integrations (settings-providers) → suite. */
const INTEGRATIONS_SUITE_BY_ID: Record<string, string> = {
  'integrations-hub': 'services',
  'model-latency-sla': 'services',
  'payments-panel': 'payments',
  'stripe-test-mode-banner': 'payments',
};

/** Static Automations (nav-tools) → suite. */
const AUTOMATIONS_SUITE_BY_ID: Record<string, string> = {
  'mcp-invent-scopes': 'mcp',
  'mcp-resources-ui': 'mcp',
  'mcp-oauth-connect': 'mcp',
  'smoke-runner-ui': 'verify',
  'harness-runner-hub': 'verify',
  'supply-chain-scan-ui': 'verify',
  'audit-log-viewer': 'verify',
  'foreign-cli-ui': 'guests',
  'acp-session-ui': 'guests',
  'automations-ui': 'schedule',
  'semantic-index-ui': 'index',
  'whats-new-changelog': 'meta',
  'missing-items-nav': 'meta',
  'release-semver-ui': 'meta',
};

/** Settings → AI */
const SETTINGS_AI_SUITE_BY_ID: Record<string, string> = {
  'dont-touch-editor': 'ai-safety',
  'terminal-policy': 'ai-safety',
  'per-tool-permissions-ui': 'ai-safety',
  'dep-install-approval': 'ai-safety',
  'custom-modes-ui': 'ai-safety',
  'seat-routing-ui': 'ai-seats',
  'ensemble-controls': 'ai-seats',
  'budget-caps': 'ai-seats',
  'spend-dashboard': 'ai-seats',
  'model-potential-meter': 'ai-seats',
  'skills-manager': 'ai-skills',
  'hooks-editor': 'ai-skills',
  'high-contrast-mode': 'advanced-ui',
};

/** Settings → Privacy */
const SETTINGS_PRIVACY_SUITE_BY_ID: Record<string, string> = {
  'network-allowlist': 'privacy-net',
  'network-allowlist-editor': 'privacy-net',
  'sandbox-profile': 'privacy-net',
  'secret-redaction': 'privacy-net',
  'privacy-mode-cloud': 'privacy-mode',
  'airgap-mode': 'privacy-mode',
  'analytics-panel': 'privacy-mode',
  'prompt-injection-warn': 'privacy-mode',
};

/** Settings → Projects */
const SETTINGS_PROJECTS_SUITE_BY_ID: Record<string, string> = {
  'rules-editor': 'projects-rules',
  'env-editor': 'projects-env',
};

/** Settings → Advanced / Storage */
const SETTINGS_ADVANCED_SUITE_BY_ID: Record<string, string> = {
  'settings-search': 'advanced-ui',
  'deep-rescan-loop-status': 'advanced-ui',
};

const PEER_ALIAS: Array<{ re: RegExp; suite: string }> = [
  { re: /\bcursor\b/i, suite: 'cursor' },
  { re: /\bclaude(?:\s+code)?\b/i, suite: 'claude' },
  { re: /\b(?:chatgpt|codex)\b/i, suite: 'chatgpt' },
  { re: /\b(?:gemini|google\s+ai)\b/i, suite: 'gemini' },
  { re: /\bamp\b/i, suite: 'amp' },
  { re: /\bqoder\b/i, suite: 'qoder' },
  { re: /\bcopilot\b/i, suite: 'copilot' },
  { re: /\bdevin\b/i, suite: 'devin' },
  { re: /\baider\b/i, suite: 'guests' },
  { re: /\bwindsurf\b/i, suite: 'cursor' },
];

function peerFromText(blob: string): string | null {
  // Title prefix: "Cursor: …" / "Claude Code: …"
  const prefix = blob.match(
    /^(Cursor|Claude Code|Claude|ChatGPT Codex|ChatGPT|Codex|Gemini|Google|Amp|Devin|Qoder|Copilot|Windsurf|Aider)\s*:/i,
  );
  if (prefix) {
    const raw = prefix[1] || '';
    for (const { re, suite } of PEER_ALIAS) {
      if (re.test(raw)) return suite;
    }
  }
  const peerEq = blob.match(/peer\s*=\s*([A-Za-z0-9 _/-]+)/i);
  if (peerEq) {
    const raw = peerEq[1] || '';
    for (const { re, suite } of PEER_ALIAS) {
      if (re.test(raw)) return suite;
    }
  }
  for (const { re, suite } of PEER_ALIAS) {
    if (re.test(blob)) return suite;
  }
  return null;
}

export function suiteIdForItem(home: MissingHome, item: MissingItem): string {
  if (home === 'agents-window' && AGENT_SUITE_BY_ID[item.id]) {
    return AGENT_SUITE_BY_ID[item.id]!;
  }
  if (home === 'settings-providers' && INTEGRATIONS_SUITE_BY_ID[item.id]) {
    return INTEGRATIONS_SUITE_BY_ID[item.id]!;
  }
  if (home === 'nav-tools' && AUTOMATIONS_SUITE_BY_ID[item.id]) {
    return AUTOMATIONS_SUITE_BY_ID[item.id]!;
  }
  if (home === 'settings-ai' && SETTINGS_AI_SUITE_BY_ID[item.id]) {
    return SETTINGS_AI_SUITE_BY_ID[item.id]!;
  }
  if (home === 'settings-privacy' && SETTINGS_PRIVACY_SUITE_BY_ID[item.id]) {
    return SETTINGS_PRIVACY_SUITE_BY_ID[item.id]!;
  }
  if (home === 'settings-projects' && SETTINGS_PROJECTS_SUITE_BY_ID[item.id]) {
    return SETTINGS_PROJECTS_SUITE_BY_ID[item.id]!;
  }
  if (home === 'settings-advanced' && SETTINGS_ADVANCED_SUITE_BY_ID[item.id]) {
    return SETTINGS_ADVANCED_SUITE_BY_ID[item.id]!;
  }
  if (home === 'chat-composer') return peerFromText(`${item.title}\n${item.why}`) || 'chat-modes';
  if (home === 'chat-side') return peerFromText(`${item.title}\n${item.why}`) || 'chat-side';
  if (home === 'live-chrome') return peerFromText(`${item.title}\n${item.why}`) || 'live-tools';
  if (home === 'code-header') return peerFromText(`${item.title}\n${item.why}`) || 'code-tools';
  if (home === 'workspace') return peerFromText(`${item.title}\n${item.why}`) || 'workspace-tools';

  const fromText = peerFromText(`${item.title}\n${item.why}`);
  if (fromText) return fromText;
  if (home === 'settings-providers') return 'services';
  if (home === 'nav-tools') return 'shared';
  if (home === 'settings-ai') return 'ai-skills';
  if (home === 'settings-privacy') return 'privacy-mode';
  if (home === 'settings-projects') return 'projects-rules';
  if (home === 'settings-advanced') return 'advanced-ui';
  return 'shared';
}

export function suiteMeta(id: string): SuiteMeta {
  return (
    SUITE_META[id] || {
      id,
      label: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      hint: 'Related helpers — one switch turns them all on',
      accent: 'border-surface-border bg-surface-hover/20',
    }
  );
}

export type BuiltSuite = {
  meta: SuiteMeta;
  items: MissingItem[];
};

/** Collapse every catalog row into a few master suites for this home. */
export function buildControlSuites(home: MissingHome, items: MissingItem[]): BuiltSuite[] {
  const buckets = new Map<string, MissingItem[]>();
  for (const item of items) {
    const id = suiteIdForItem(home, item);
    const list = buckets.get(id) || [];
    list.push(item);
    buckets.set(id, list);
  }
  const ordered: BuiltSuite[] = [];
  const seen = new Set<string>();
  for (const id of SUITE_ORDER) {
    const list = buckets.get(id);
    if (!list?.length) continue;
    ordered.push({ meta: suiteMeta(id), items: list });
    seen.add(id);
  }
  for (const [id, list] of buckets) {
    if (seen.has(id) || !list.length) continue;
    ordered.push({ meta: suiteMeta(id), items: list });
  }
  return ordered;
}
