/**
 * P2 harness capabilities — cloud/bg stubs, A2A/ACP gateway, marketplace,
 * memories+decay, scheduled agents, cost×quality bench.
 */

export type AgentMemory = {
  id: string;
  projectKey: string;
  fact: string;
  strength: number; // 0–1; decays
  createdAt: number;
  lastTouchedAt: number;
};

const memories = new Map<string, AgentMemory[]>();

export function rememberFact(projectKey: string, fact: string): AgentMemory {
  const key = String(projectKey || 'default');
  const mem: AgentMemory = {
    id: `m-${Date.now().toString(36)}`,
    projectKey: key,
    fact: String(fact || '').trim().slice(0, 400),
    strength: 1,
    createdAt: Date.now(),
    lastTouchedAt: Date.now(),
  };
  const list = memories.get(key) || [];
  list.push(mem);
  memories.set(key, list.slice(-80));
  return mem;
}

export function touchMemory(projectKey: string, id: string): void {
  const list = memories.get(projectKey) || [];
  const m = list.find((x) => x.id === id);
  if (m) {
    m.lastTouchedAt = Date.now();
    m.strength = Math.min(1, m.strength + 0.15);
  }
}

/** Biological-style decay of unused memories. */
export function decayMemories(projectKey: string, now = Date.now()): AgentMemory[] {
  const list = memories.get(projectKey) || [];
  const next = list
    .map((m) => {
      const days = (now - m.lastTouchedAt) / (86400_000);
      const strength = Math.max(0, m.strength - days * 0.08);
      return { ...m, strength };
    })
    .filter((m) => m.strength > 0.05);
  memories.set(projectKey, next);
  return next;
}

export function formatMemoriesForPrompt(projectKey: string): string {
  const list = decayMemories(projectKey).sort((a, b) => b.strength - a.strength).slice(0, 12);
  if (!list.length) return '';
  return ['## Project memories', ...list.map((m) => `- (${m.strength.toFixed(2)}) ${m.fact}`)].join('\n');
}

export function listMemories(projectKey: string): AgentMemory[] {
  return [...(memories.get(projectKey) || [])];
}

/** Shareable run URL stub (local id → path). */
export function formatShareableRunUrl(runId: string): string {
  return `nova://agent-run/${encodeURIComponent(runId)}`;
}

/** Hook bus — Pre/Post tool lifecycle. */
export type HookEvent =
  | 'preToolUse'
  | 'postToolUse'
  | 'beforeShellExecution'
  | 'afterFileEdit'
  | 'preCompact'
  | 'stop';

export type HookHandler = (payload: Record<string, unknown>) => void | Promise<void>;

const hooks = new Map<HookEvent, HookHandler[]>();

export function registerHook(event: HookEvent, handler: HookHandler): () => void {
  const list = hooks.get(event) || [];
  list.push(handler);
  hooks.set(event, list);
  return () => {
    hooks.set(event, (hooks.get(event) || []).filter((h) => h !== handler));
  };
}

export async function runHooks(event: HookEvent, payload: Record<string, unknown>): Promise<void> {
  for (const h of hooks.get(event) || []) {
    try {
      await h(payload);
    } catch {
      /* never break invent on hook failure */
    }
  }
}

/** Plugin marketplace stub (local registry). */
export type HarnessPlugin = {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
};

const plugins: HarnessPlugin[] = [
  { id: 'vision-loop', name: 'Vision Loop', version: '0.1.0', description: 'Multi-viewport + axe', enabled: true },
  { id: 'binary-rubric', name: 'Binary Rubric', version: '0.1.0', description: 'Yes/no Ready gates', enabled: true },
  { id: 'progress-md', name: 'Progress.md', version: '0.1.0', description: 'Feature checklist memory', enabled: true },
  { id: 'best-of-n', name: 'Best-of-N', version: '0.1.0', description: 'Multi-model invent compare', enabled: true },
  { id: 'acp-guest', name: 'ACP Guest', version: '0.1.0', description: 'Agent Client Protocol stub', enabled: false },
];

export function listPlugins(): HarnessPlugin[] {
  return plugins.map((p) => ({ ...p }));
}

export function setPluginEnabled(id: string, enabled: boolean): boolean {
  const p = plugins.find((x) => x.id === id);
  if (!p) return false;
  p.enabled = enabled;
  return true;
}

/** Custom agent personas. */
export type CustomAgentPersona = {
  id: string;
  name: string;
  system: string;
  tools: string[];
};

export function defaultPersonas(): CustomAgentPersona[] {
  return [
    {
      id: 'invent-craft',
      name: 'Invent Craft',
      system: 'Invent unique websites from briefs. Never ship floor twins.',
      tools: ['write', 'patch', 'ready', 'live'],
    },
    {
      id: 'navigator-judge',
      name: 'Navigator Judge',
      system: 'Binary rubric only. ACCEPT or REJECT with evidence.',
      tools: ['ready', 'live', 'grep', 'read'],
    },
    {
      id: 'a11y-critic',
      name: 'A11y Critic',
      system: 'axe critical must be 0. Flag missing alt/labels.',
      tools: ['read', 'grep'],
    },
  ];
}

/** A2A / agent gateway stub. */
export type A2aPeer = {
  id: string;
  name: string;
  endpoint: string;
  capabilities: string[];
};

const peers: A2aPeer[] = [];

export function registerA2aPeer(peer: A2aPeer): void {
  const i = peers.findIndex((p) => p.id === peer.id);
  if (i >= 0) peers[i] = peer;
  else peers.push(peer);
}

export function listA2aPeers(): A2aPeer[] {
  return [...peers];
}

export function formatA2aDiscover(): string {
  if (!peers.length) return '## A2A peers\n(none registered)';
  return ['## A2A peers', ...peers.map((p) => `- ${p.name} @ ${p.endpoint} [${p.capabilities.join(',')}]`)].join('\n');
}

/** Background / scheduled invent job stubs. */
export type ScheduledAgentJob = {
  id: string;
  cronHint: string;
  brief: string;
  nextAt: number;
  status: 'scheduled' | 'running' | 'done' | 'error';
};

const schedule: ScheduledAgentJob[] = [];

export function scheduleAgentJob(brief: string, cronHint = 'manual', delayMs = 0): ScheduledAgentJob {
  const job: ScheduledAgentJob = {
    id: `sched-${Date.now().toString(36)}`,
    cronHint,
    brief: String(brief || '').slice(0, 1000),
    nextAt: Date.now() + delayMs,
    status: 'scheduled',
  };
  schedule.push(job);
  return job;
}

export function listScheduledJobs(): ScheduledAgentJob[] {
  return [...schedule];
}

/** Cloud/background invent worker stub (local queue). */
export type BgInventJob = {
  id: string;
  brief: string;
  status: 'queued' | 'running' | 'done' | 'error';
  ingress: 'local' | 'slack' | 'github' | 'linear';
  createdAt: number;
};

const bgQueue: BgInventJob[] = [];

export function enqueueBgInvent(
  brief: string,
  ingress: BgInventJob['ingress'] = 'local',
): BgInventJob {
  const job: BgInventJob = {
    id: `bg-${Date.now().toString(36)}`,
    brief: String(brief || '').slice(0, 1200),
    status: 'queued',
    ingress,
    createdAt: Date.now(),
  };
  bgQueue.push(job);
  return job;
}

export function listBgInvent(): BgInventJob[] {
  return [...bgQueue];
}

/** Cost × quality bench row. */
export type CostQualityRow = {
  runId: string;
  modelId: string;
  tokensEst: number;
  latencyMs: number;
  rubricPass: number;
  rubricTotal: number;
  qualityOk: boolean;
};

export function scoreCostQuality(rows: CostQualityRow[]): {
  bestQuality: CostQualityRow | null;
  bestValue: CostQualityRow | null;
  summary: string;
} {
  if (!rows.length) return { bestQuality: null, bestValue: null, summary: 'no runs' };
  const bestQuality = [...rows].sort((a, b) => (b.rubricPass / b.rubricTotal) - (a.rubricPass / a.rubricTotal))[0];
  const bestValue = [...rows].sort((a, b) => {
    const qa = a.rubricPass / Math.max(1, a.rubricTotal);
    const qb = b.rubricPass / Math.max(1, b.rubricTotal);
    const va = qa / Math.max(1, a.tokensEst / 1000);
    const vb = qb / Math.max(1, b.tokensEst / 1000);
    return vb - va;
  })[0];
  return {
    bestQuality,
    bestValue,
    summary: `bestQuality=${bestQuality.modelId} ${bestQuality.rubricPass}/${bestQuality.rubricTotal}; bestValue=${bestValue.modelId}`,
  };
}

/** Slack/GitHub ingress parse stubs. */
export function parseIngressBrief(raw: string): { brief: string; ingress: BgInventJob['ingress'] } {
  const t = String(raw || '').trim();
  if (/^@nova\b/i.test(t) || /\bfrom slack\b/i.test(t)) {
    return { brief: t.replace(/^@nova\s*/i, ''), ingress: 'slack' };
  }
  if (/github\.com\/.+\/issues\//i.test(t) || /^#\d+\b/.test(t)) {
    return { brief: t, ingress: 'github' };
  }
  if (/\blinear\.app\b/i.test(t)) return { brief: t, ingress: 'linear' };
  return { brief: t, ingress: 'local' };
}
