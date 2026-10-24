/**
 * P1 harness capabilities — best-of-n, headless JSON, ACP, AST/graph, worktrees,
 * subagents, EARS, MCP pin, reflexion, undo/steer.
 */

import type { BinaryRubricItem } from '@/lib/agentHarness/p0';
import { evaluateBinaryCreateRubric } from '@/lib/agentHarness/p0';

export type BestOfNCandidate = {
  id: string;
  modelId: string;
  worktreeHint: string;
  files: Record<string, string>;
  rubricPass: number;
  rubricTotal: number;
  notes: string;
};

export function rankBestOfN(
  candidates: { id: string; modelId: string; files: Record<string, string> }[],
  brief: string,
  brand?: string,
): { winner: BestOfNCandidate | null; ranked: BestOfNCandidate[] } {
  const ranked: BestOfNCandidate[] = candidates.map((c, i) => {
    const rub = evaluateBinaryCreateRubric({ files: c.files, brief, brand });
    return {
      id: c.id,
      modelId: c.modelId,
      worktreeHint: `.nova/worktrees/${c.id}`,
      files: c.files,
      rubricPass: rub.items.filter((x: BinaryRubricItem) => x.pass).length,
      rubricTotal: rub.items.length,
      notes: rub.failed.slice(0, 3).join(',') || 'ok',
    };
  }).sort((a, b) => b.rubricPass - a.rubricPass || a.id.localeCompare(b.id));
  return { winner: ranked[0] || null, ranked };
}

/** Headless streaming-JSON create protocol for CI/smokes. */
export type HeadlessCreateEvent =
  | { type: 'start'; brief: string; brand: string; at: number }
  | { type: 'progress'; stage: string; detail?: string; at: number }
  | { type: 'file'; path: string; bytes: number; at: number }
  | { type: 'evidence'; pass: boolean; qualityOk: boolean; at: number }
  | { type: 'done'; ok: boolean; reason: string; at: number }
  | { type: 'error'; message: string; at: number };

export function emitHeadlessEvent(ev: HeadlessCreateEvent): string {
  return `${JSON.stringify(ev)}\n`;
}

export function parseHeadlessEventLine(line: string): HeadlessCreateEvent | null {
  try {
    const o = JSON.parse(String(line || '').trim()) as HeadlessCreateEvent;
    if (!o || typeof o !== 'object' || !('type' in o)) return null;
    return o;
  } catch {
    return null;
  }
}

/** ACP guest stub — JSON-RPC shaped session messages (host later). */
export type AcpMessage =
  | { jsonrpc: '2.0'; method: 'session/new'; id: number; params: { cwd: string } }
  | { jsonrpc: '2.0'; method: 'session/prompt'; id: number; params: { sessionId: string; prompt: string } }
  | { jsonrpc: '2.0'; method: 'session/update'; params: { sessionUpdate: string; content?: { text?: string } } };

export function formatAcpSessionNew(cwd: string, id = 1): string {
  return JSON.stringify({ jsonrpc: '2.0', method: 'session/new', id, params: { cwd } });
}

export function formatAcpPrompt(sessionId: string, prompt: string, id = 2): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    method: 'session/prompt',
    id,
    params: { sessionId, prompt },
  });
}

/** Cheap call-graph / import graph from file map (no DB yet). */
export function buildCodeImportGraph(files: Record<string, string>): {
  nodes: string[];
  edges: { from: string; to: string }[];
} {
  const nodes = Object.keys(files).filter((p) => /\.(jsx?|tsx?|css)$/i.test(p)).slice(0, 80);
  const edges: { from: string; to: string }[] = [];
  for (const from of nodes) {
    const body = files[from] || '';
    const imports = [...body.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
    for (const rel of imports) {
      const resolved = resolveRel(from, rel);
      const hit = nodes.find((n) => n === resolved || n.startsWith(resolved + '.') || n.replace(/\.(jsx?|tsx?)$/, '') === resolved);
      if (hit) edges.push({ from, to: hit });
    }
  }
  return { nodes, edges };
}

function resolveRel(from: string, rel: string): string {
  const parts = from.replace(/\\/g, '/').split('/');
  parts.pop();
  for (const seg of rel.split('/')) {
    if (seg === '.' || !seg) continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

export function formatCodeGraphForAgent(files: Record<string, string>): string {
  const g = buildCodeImportGraph(files);
  const lines = g.edges.slice(0, 24).map((e) => `${e.from} → ${e.to}`);
  return ['## Code import graph (cheap)', ...lines, g.edges.length ? '' : '(no local import edges)'].join('\n');
}

/** AST-ish structural helpers for JSX/JSON (deterministic, no tree-sitter dep). */
export function structuralJsxBalance(source: string): { ok: boolean; detail: string } {
  const s = String(source || '');
  const open = (s.match(/<[A-Za-z][^/>]*>/g) || []).length;
  const self = (s.match(/<[A-Za-z][^>]*\/>/g) || []).length;
  const close = (s.match(/<\/[A-Za-z][^>]*>/g) || []).length;
  // Rough: open tags ≈ close + self-ish; allow slack
  const ok = Math.abs(open - close) <= Math.max(3, Math.floor(open * 0.15));
  return { ok, detail: `open=${open} close=${close} self=${self}` };
}

export function repairJsonFragment(raw: string): { ok: boolean; value?: unknown; detail: string } {
  const t = String(raw || '').trim();
  try {
    return { ok: true, value: JSON.parse(t), detail: 'parsed' };
  } catch {
    /* try repairs */
  }
  let fixed = t
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/'/g, '"')
    .replace(/(\w+)\s*:/g, '"$1":');
  try {
    return { ok: true, value: JSON.parse(fixed), detail: 'repaired trailing commas/quotes' };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : 'json repair failed' };
  }
}

export function applyStructuralRename(
  source: string,
  fromIdent: string,
  toIdent: string,
): { ok: boolean; next: string; detail: string } {
  const from = String(fromIdent || '').trim();
  const to = String(toIdent || '').trim();
  if (!from || !to || !/^[A-Za-z_][\w]*$/.test(from) || !/^[A-Za-z_][\w]*$/.test(to)) {
    return { ok: false, next: source, detail: 'invalid identifiers' };
  }
  const re = new RegExp(`\\b${from}\\b`, 'g');
  const next = String(source || '').replace(re, to);
  return { ok: next !== source, next, detail: next === source ? 'no matches' : `renamed ${from}→${to}` };
}

/** Worktree mesh + semaphore (in-memory control plane). */
export type WorktreeClaim = {
  agentId: string;
  paths: string[];
  worktree: string;
  at: number;
};

const claims = new Map<string, WorktreeClaim>();

export function claimWorktreePaths(
  agentId: string,
  paths: string[],
  worktree: string,
): { ok: boolean; conflicts: string[] } {
  const norm = paths.map((p) => p.replace(/\\/g, '/'));
  const conflicts: string[] = [];
  for (const [id, c] of claims) {
    if (id === agentId) continue;
    for (const p of norm) {
      if (c.paths.some((x) => x === p || x.startsWith(p + '/') || p.startsWith(x + '/'))) {
        conflicts.push(`${p} held by ${id}`);
      }
    }
  }
  if (conflicts.length) return { ok: false, conflicts };
  claims.set(agentId, { agentId, paths: norm, worktree, at: Date.now() });
  return { ok: true, conflicts: [] };
}

export function releaseWorktree(agentId: string): void {
  claims.delete(agentId);
}

export function listWorktreeClaims(): WorktreeClaim[] {
  return [...claims.values()];
}

/** Driver ↔ Navigator pair prompts. */
export function formatDriverNavigatorPrompts(brief: string): { driver: string; navigator: string } {
  return {
    driver: [
      'DRIVER: Write the invent files for the brief. Prefer small complete App + CSS.',
      'Do not self-grade Ready — Navigator judges.',
      String(brief || '').slice(0, 1200),
    ].join('\n'),
    navigator: [
      'NAVIGATOR: Judge with binary rubric + toolchain evidence only (smoke/Live/axe).',
      'Reject floors, twin shells, missing interactions. Reply ACCEPT or REJECT with reasons.',
      String(brief || '').slice(0, 800),
    ].join('\n'),
  };
}

/** DebateCoder-style test challenge between two candidate texts. */
export function debateCoderChallenge(
  a: { label: string; files: Record<string, string> },
  b: { label: string; files: Record<string, string> },
  brief: string,
): { winner: string; reasons: string[] } {
  const ra = evaluateBinaryCreateRubric({ files: a.files, brief });
  const rb = evaluateBinaryCreateRubric({ files: b.files, brief });
  const sa = ra.items.filter((i) => i.pass).length;
  const sb = rb.items.filter((i) => i.pass).length;
  if (sa === sb) {
    return { winner: 'tie', reasons: [`both ${sa}/${ra.items.length}`, ...ra.failed, ...rb.failed].slice(0, 6) };
  }
  const winner = sa > sb ? a.label : b.label;
  const loser = sa > sb ? rb : ra;
  return { winner, reasons: [`${winner} ${Math.max(sa, sb)}/${ra.items.length}`, `loser failed: ${loser.failed.join(',')}`] };
}

/** Kiro-style EARS requirements artifact. */
export type EarsSpec = {
  title: string;
  requirements: string[];
  design: string[];
  tasks: string[];
  approved: boolean;
};

export function buildEarsSpec(brief: string, brand: string): EarsSpec {
  const t = String(brief || '');
  const requirements = [
    `The ${brand || 'site'} shall match the user brief intent.`,
    'When a visitor opens the first viewport, the system shall show a brand-first hero.',
    'The system shall not ship placeholder floor twins as Ready.',
    'Where Live mounts, console critical errors shall be zero.',
  ];
  if (/\bcart\b/i.test(t)) requirements.push('When a user adds a product, the cart count shall update.');
  if (/\bform\b/i.test(t)) requirements.push('When a user submits the form, state shall update without reload.');
  return {
    title: `${brand || 'Site'} — EARS spec`,
    requirements,
    design: [
      'Unique tokens + layout for this brand',
      'App.jsx + App.css as primary surfaces',
      'Evidence artifacts before Ready',
    ],
    tasks: [
      'Approve this spec',
      'Architect plan',
      'Invent App + CSS',
      'Run smoke + Live + axe',
      'Evaluator Accept',
    ],
    approved: false,
  };
}

export function formatEarsSpec(spec: EarsSpec): string {
  return [
    `# ${spec.title}`,
    `Approved: ${spec.approved ? 'yes' : 'NO — gate invent'}`,
    '',
    '## Requirements (EARS)',
    ...spec.requirements.map((r, i) => `${i + 1}. ${r}`),
    '',
    '## Design',
    ...spec.design.map((d) => `- ${d}`),
    '',
    '## Tasks',
    ...spec.tasks.map((t, i) => `${i + 1}. ${t}`),
  ].join('\n');
}

/** MCP schema pin / poison defense. */
export type McpToolPin = {
  name: string;
  schemaHash: string;
  server: string;
  pinnedAt: number;
};

export function hashToolSchema(schema: unknown): string {
  const s = JSON.stringify(schema || {});
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function pinMcpTool(name: string, server: string, schema: unknown): McpToolPin {
  return { name, server, schemaHash: hashToolSchema(schema), pinnedAt: Date.now() };
}

export function detectMcpSchemaDrift(pin: McpToolPin, schema: unknown): { ok: boolean; detail: string } {
  const h = hashToolSchema(schema);
  if (h !== pin.schemaHash) {
    return { ok: false, detail: `schema drift ${pin.name}: ${pin.schemaHash} → ${h}` };
  }
  return { ok: true, detail: 'pin match' };
}

export function sanitizeMcpToolDescription(desc: string): string {
  // Strip instruction-injection shaped content from tool descriptions before prompt dump.
  return String(desc || '')
    .replace(/ignore (all )?previous instructions/gi, '[redacted]')
    .replace(/system prompt/gi, '[redacted]')
    .replace(/exfiltrat\w*/gi, '[redacted]')
    .slice(0, 500);
}

/** Sub-agents + TaskCreate + Workflow orchestrator (in-process). */
export type AgentTask = {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'done' | 'blocked';
  owner?: string;
};

export type SubAgent = {
  id: string;
  role: string;
  brief: string;
  status: 'idle' | 'running' | 'done';
};

export function createTaskList(titles: string[]): AgentTask[] {
  return titles.map((title, i) => ({
    id: `t${i + 1}`,
    title,
    status: 'pending' as const,
  }));
}

export function updateTask(tasks: AgentTask[], id: string, status: AgentTask['status']): AgentTask[] {
  return tasks.map((t) => (t.id === id ? { ...t, status } : t));
}

export function spawnSubAgent(role: string, brief: string): SubAgent {
  return {
    id: `sa-${role}-${Date.now().toString(36)}`,
    role,
    brief: String(brief || '').slice(0, 800),
    status: 'idle',
  };
}

export function formatWorkflowOrchestrator(tasks: AgentTask[], agents: SubAgent[]): string {
  return [
    '## Workflow',
    ...tasks.map((t) => `- [${t.status}] ${t.id}: ${t.title}${t.owner ? ` (@${t.owner})` : ''}`),
    '',
    '## Sub-agents',
    ...agents.map((a) => `- ${a.id} · ${a.role} · ${a.status}`),
  ].join('\n');
}

/** Reflexion + RULES.md ratchet + DESIGN.md anti-slop. */
export function formatReflexion(failure: string, nextTry: string): string {
  return [
    '## Reflexion',
    `Failed: ${String(failure || '').slice(0, 400)}`,
    `Next: ${String(nextTry || '').slice(0, 400)}`,
  ].join('\n');
}

export function ratchetRule(existing: string, correction: string): string {
  const line = `- ${String(correction || '').trim().slice(0, 200)}`;
  const body = String(existing || '# RULES.md\n\n');
  if (body.includes(line)) return body;
  return `${body.trim()}\n${line}\n`;
}

export function formatDesignMdAntiSlop(brand: string, tokens: Record<string, string>): string {
  return [
    `# DESIGN.md — ${brand}`,
    '',
    '## Anti-slop',
    '- No purple-on-white default AI look',
    '- No cream+#terracotta serif cliché unless brand asks',
    '- No broadsheet dense newspaper columns by default',
    '- Brand is hero-level in first viewport',
    '',
    '## Tokens',
    ...Object.entries(tokens).map(([k, v]) => `- --${k}: ${v}`),
    '',
  ].join('\n');
}

/** Trajectory undo/redo stack. */
export type TrajectoryFrame = {
  id: string;
  at: number;
  files: Record<string, string>;
  note: string;
};

export function pushTrajectory(stack: TrajectoryFrame[], files: Record<string, string>, note: string): TrajectoryFrame[] {
  const slim: Record<string, string> = {};
  for (const [k, v] of Object.entries(files || {})) {
    if (/^src\/App\.(jsx|tsx|css)$/i.test(k) || /^src\/index\.css$/i.test(k)) {
      slim[k] = v.length > 200_000 ? v.slice(0, 200_000) : v;
    }
  }
  return [...stack, { id: `tf-${Date.now().toString(36)}`, at: Date.now(), files: slim, note }].slice(-20);
}

export function undoTrajectory(stack: TrajectoryFrame[]): {
  stack: TrajectoryFrame[];
  restored: TrajectoryFrame | null;
} {
  if (stack.length < 2) return { stack, restored: null };
  const next = stack.slice(0, -1);
  return { stack: next, restored: next[next.length - 1] || null };
}

export function formatSteerCheckpoint(instruction: string): string {
  return `STEER (apply at next safe checkpoint): ${String(instruction || '').slice(0, 500)}`;
}
