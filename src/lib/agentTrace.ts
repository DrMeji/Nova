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
  /** Absolute project folder shown above the file list (create replies). */
  projectPath?: string;
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
    return 'Listing folder contents and summarizing without dumping every file into chat.';
  }
  if (/\b(delete|remove|trash)\b/i.test(t)) {
    return 'Locating the path, confirming scope, then deleting only what was asked.';
  }
  if (/\b(clone|pull|github|push)\b/i.test(t)) {
    return 'Running the Git/GitHub action in the workspace and reporting the result.';
  }
  if (/\b(install|npm|pip)\b/i.test(t)) {
    return 'Installing dependencies in the project folder.';
  }
  if (/\b(?:create|scaffold|new)\b[\s\S]{0,40}\b(?:project|vite|react|app)\b/i.test(t)) {
    return 'Creating the project folder, writing scaffold files, and verifying they exist on disk.';
  }
  if (/\bsticky\b/i.test(t) && /\bnav\b/i.test(t)) {
    return 'Adding a sticky nav to the app files and verifying the labels landed.';
  }
  if (/\b(?:mouse|keyboard)\b/i.test(t) && /\b(?:photo|shot|image)\b/i.test(t)) {
    return 'Adding a real https product photo to the hero and verifying the image URL.';
  }
  if (/\bbrand\b/i.test(t) || (/\bcenter(?:ed)?\b/i.test(t) && /\b(?:white|middle|text)\b/i.test(t))) {
    return 'Updating the centered brand text on disk and verifying it matches the ask.';
  }
  if (/\b(image|picture|photo|draw)\b/i.test(t) && !/\b(?:https|url|src)\b/i.test(t)) {
    return 'Generating an image with a real model route — not a placeholder.';
  }
  if (/\b(?:add|put|place|insert)\b/i.test(t)) {
    return 'Adding the requested UI to the project files, then verifying the change.';
  }
  if (/\b(?:remove|delete|drop)\b/i.test(t)) {
    return 'Removing the requested piece from the project files.';
  }
  if (/\b(comment|edit|change|fix|update)\b/i.test(t)) {
    return 'Editing the target file(s) on disk, then summarizing exactly what changed.';
  }
  return 'Understanding the ask, doing the work on disk when needed, then answering directly.';
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
  projectPath?: string;
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
    projectPath: opts.projectPath || undefined,
  });
}
