/** Live activity trace embedded in assistant messages (Cursor-style). */

export type AgentTraceStepKind = 'thought' | 'plan' | 'status' | 'run' | 'read' | 'answer' | 'write';

export type AgentTraceStep = {
  id: string;
  kind: AgentTraceStepKind;
  label: string;
  detail?: string;
};

export type AgentFileChange = {
  path: string;
  added: number;
  removed: number;
};

export type AgentTracePayload = {
  startedAt: number;
  done: boolean;
  steps: AgentTraceStep[];
  /** Final answer markdown (also duplicated after the marker for plain renderers). */
  answer: string;
  /** Wall time for this turn (ms), used for Thought for Xs. */
  elapsedMs?: number;
  /** Relative paths changed by the agent loop. */
  changedPaths?: string[];
  /** Per-file +/− line counts for the Files Changed card. */
  fileChanges?: AgentFileChange[];
  /** Whether Continue is available after step-cap. */
  canContinue?: boolean;
};

const TRACE_MARKER_RE = /<!--ark-trace:([\s\S]*?)-->\n?/;

export function isTraceMessage(content: string): boolean {
  return TRACE_MARKER_RE.test(String(content || ''));
}

export function parseTraceMessage(content: string): {
  payload: AgentTracePayload | null;
  answer: string;
} {
  const raw = String(content || '');
  const m = raw.match(TRACE_MARKER_RE);
  if (!m?.[1]) return { payload: null, answer: raw };
  try {
    const payload = JSON.parse(m[1]) as AgentTracePayload;
    const tail = raw.replace(TRACE_MARKER_RE, '').trim();
    return {
      payload,
      answer: tail || payload.answer || '',
    };
  } catch {
    return { payload: null, answer: raw };
  }
}

export function encodeTraceMessage(payload: AgentTracePayload): string {
  const answer = String(payload.answer || '').trim();
  return `<!--ark-trace:${JSON.stringify(payload)}-->${answer ? `\n${answer}` : ''}`;
}

export function stripAgentTrace(content: string): string {
  const { answer } = parseTraceMessage(content);
  return answer.trim();
}

export function nextTraceStepId(steps: AgentTraceStep[]): string {
  return `s-${steps.length + 1}`;
}

/** Rough line-level +/− for a before/after text edit (Cursor-style stats). */
export function countLineDiff(before: string, after: string): { added: number; removed: number } {
  const a = String(before || '').split('\n');
  const b = String(after || '').split('\n');
  if (a.length === 1 && a[0] === '' && b.join('\n') === before) return { added: 0, removed: 0 };
  const aCounts = new Map<string, number>();
  for (const line of a) aCounts.set(line, (aCounts.get(line) || 0) + 1);
  let removed = 0;
  let added = 0;
  const bCounts = new Map<string, number>();
  for (const line of b) bCounts.set(line, (bCounts.get(line) || 0) + 1);
  const keys = new Set([...aCounts.keys(), ...bCounts.keys()]);
  for (const key of keys) {
    const left = aCounts.get(key) || 0;
    const right = bCounts.get(key) || 0;
    if (right > left) added += right - left;
    if (left > right) removed += left - right;
  }
  return { added, removed };
}

export function traceThoughtFromAsk(userMessage: string): string {
  const t = String(userMessage || '').trim();
  if (/\bwhat(?:'s| is)\s+(?:in|inside)\b/i.test(t)) {
    return 'The user wants to know what is inside a folder. list top level and summarize subfolders without importing every file into chat.';
  }
  if (/\b(delete|remove|trash)\b/i.test(t)) {
    return 'The user wants files removed. I need to locate the path, confirm scope, then delete only what they asked for.';
  }
  if (/\b(clone|pull|github|push)\b/i.test(t)) {
    return 'The user wants a Git/GitHub action. locate the repo or remote, run the command, and report the result.';
  }
  if (/\b(install|npm|pip)\b/i.test(t)) {
    return 'The user wants dependencies installed. use the workspace folder, run the install command, and show output.';
  }
  if (/\b(image|picture|photo|draw)\b/i.test(t)) {
    return 'The user wants an image generated. pick a model route and produce real media, not a placeholder.';
  }
  if (/\b(comment|edit|change|fix|update|add)\b/i.test(t)) {
    return 'Locate the target file(s), read only what is needed, apply the edit on disk, then summarize what changed.';
  }
  return 'Understand the request, plan the steps, run only what is needed, then answer directly.';
}

export function summarizeTraceForHistory(payload: AgentTracePayload): string {
  const verbs = payload.steps
    .filter(s => s.kind === 'run' || s.kind === 'read' || s.kind === 'status' || s.kind === 'write')
    .slice(-4)
    .map(s => s.label)
    .join(' → ');
  const ans = String(payload.answer || '').trim();
  if (verbs && ans) return `[${verbs}]\n\n${ans}`;
  return ans || verbs || 'Done.';
}

/** Wrap a short spoken answer with Cursor-style steps + Files Changed card. */
export function wrapReplyWithFileChanges(opts: {
  startedAt: number;
  userMessage: string;
  answer: string;
  changedPaths: string[];
  fileChanges?: AgentFileChange[];
  statusLabels?: string[];
  elapsedMs?: number;
}): string {
  const paths = (opts.changedPaths || []).filter(Boolean);
  const changes = opts.fileChanges?.length
    ? opts.fileChanges
    : paths.map(path => ({ path, added: 1, removed: 0 }));
  const elapsedMs = opts.elapsedMs ?? Math.max(1, Date.now() - opts.startedAt);
  const steps: AgentTraceStep[] = [
    {
      id: nextTraceStepId([]),
      kind: 'thought',
      label: traceThoughtFromAsk(opts.userMessage),
    },
  ];
  for (const label of opts.statusLabels || []) {
    steps.push({ id: nextTraceStepId(steps), kind: 'status', label });
  }
  if (!opts.statusLabels?.length && paths.length) {
    steps.push({
      id: nextTraceStepId(steps),
      kind: 'status',
      label: `Edited ${paths.length} file${paths.length === 1 ? '' : 's'}`,
    });
  }
  for (const path of paths.slice(0, 12)) {
    steps.push({ id: nextTraceStepId(steps), kind: 'write', label: path });
  }
  return encodeTraceMessage({
    startedAt: opts.startedAt,
    done: true,
    steps,
    answer: String(opts.answer || '').trim() || 'Done.',
    elapsedMs,
    changedPaths: paths,
    fileChanges: changes,
  });
}
