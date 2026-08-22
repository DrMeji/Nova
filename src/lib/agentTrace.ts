/** Live activity trace embedded in assistant messages (Cursor-style). */

export type AgentTraceStepKind = 'thought' | 'plan' | 'status' | 'run' | 'read' | 'answer';

export type AgentTraceStep = {
  id: string;
  kind: AgentTraceStepKind;
  label: string;
  detail?: string;
};

export type AgentTracePayload = {
  startedAt: number;
  done: boolean;
  steps: AgentTraceStep[];
  /** Final answer markdown (also duplicated after the marker for plain renderers). */
  answer: string;
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

export function traceThoughtFromAsk(userMessage: string): string {
  const t = String(userMessage || '').trim();
  if (/\bwhat(?:'s| is)\s+(?:in|inside)\b/i.test(t)) {
    return 'The user wants to know what is inside a folder — list top level and summarize subfolders without importing every file into chat.';
  }
  if (/\b(delete|remove|trash)\b/i.test(t)) {
    return 'The user wants files removed — I need to locate the path, confirm scope, then delete only what they asked for.';
  }
  if (/\b(clone|pull|github|push)\b/i.test(t)) {
    return 'The user wants a Git/GitHub action — locate the repo or remote, run the command, and report the result.';
  }
  if (/\b(install|npm|pip)\b/i.test(t)) {
    return 'The user wants dependencies installed — use the workspace folder, run the install command, and show output.';
  }
  if (/\b(image|picture|photo|draw)\b/i.test(t)) {
    return 'The user wants an image generated — pick a model route and produce real media, not a placeholder.';
  }
  return 'Understand the request, plan the steps, run only what is needed, then answer directly.';
}

export function summarizeTraceForHistory(payload: AgentTracePayload): string {
  const verbs = payload.steps
    .filter(s => s.kind === 'run' || s.kind === 'read' || s.kind === 'status')
    .slice(-4)
    .map(s => s.label)
    .join(' → ');
  const ans = String(payload.answer || '').trim();
  if (verbs && ans) return `[${verbs}]\n\n${ans}`;
  return ans || verbs || 'Done.';
}
