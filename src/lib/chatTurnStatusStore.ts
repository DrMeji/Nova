/**
 * Live turn status outside the messages array — avoids remounting chat on every status tick.
 */

import type {
  ChatActivityKind,
  ChatActivityRunStatus,
  ChatActivityStep,
} from '@/lib/chatTurnActivity';
import { classifyStatusActivity } from '@/lib/chatTurnActivity';

export type ChatTurnStatusStep = ChatActivityStep;

export type ChatTurnStatus = {
  chatId: string;
  assistantId: string;
  label: string;
  /** Recent status steps for the clickable dropdown (newest last). */
  history: ChatTurnStatusStep[];
  /** File path currently being written (Code overlay follows this while generating). */
  writingPath?: string | null;
};

export type { ChatActivityKind, ChatActivityRunStatus };

let current: ChatTurnStatus | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => {
    try { l(); } catch { /* ignore */ }
  });
}

export function getChatTurnStatus(): ChatTurnStatus | null {
  return current;
}

function historyLabelsEqual(a: ChatTurnStatusStep[], b: ChatTurnStatusStep[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].label !== b[i].label
      || a[i].at !== b[i].at
      || a[i].kind !== b[i].kind
      || a[i].summary !== b[i].summary
      || a[i].runStatus !== b[i].runStatus
    ) {
      return false;
    }
  }
  return true;
}

export function setChatTurnStatus(
  next: (Omit<ChatTurnStatus, 'history'> & {
    history?: Array<string | ChatTurnStatusStep>;
  }) | null,
): void {
  const prev = current;
  const normalized: ChatTurnStatus | null = next
    ? {
        ...next,
        history: normalizeStatusHistory(next.history, next.label),
      }
    : null;
  if (
    prev
    && normalized
    && prev.chatId === normalized.chatId
    && prev.assistantId === normalized.assistantId
    && prev.label === normalized.label
    && (prev.writingPath || null) === (normalized.writingPath || null)
    && historyLabelsEqual(prev.history, normalized.history)
  ) {
    return;
  }
  current = normalized;
  emit();
}

/** Infer Code-pill follow path from a status label when not passed explicitly. */
export function inferWritingPathFromLabel(label: string): string | null {
  const t = String(label || '');
  // Never park live-follow on scaffold noise during polish.
  if (/App\.css|styles?\b.*App\.css|Linking App\.css|Writing src\/App\.css|Coding src\/App\.css/i.test(t)) {
    return 'src/App.css';
  }
  const named = t.match(/\b(src\/App\.(?:jsx|tsx))\b/i);
  if (named?.[1]) return named[1];
  if (/Coding the product|Writing src\/App\.(?:tsx|jsx)|layout, sections/i.test(t)) {
    return null;
  }
  if (/index\.html/i.test(t)) return 'index.html';
  if (/package\.json/i.test(t)) return 'package.json';
  if (/main\.(tsx|jsx)/i.test(t)) return 'src/main.tsx';
  if (/index\.css/i.test(t)) return 'src/index.css';
  if (/vite\.config/i.test(t)) return 'vite.config.ts';
  if (/tsconfig/i.test(t)) return 'tsconfig.json';
  // Ignore .gitignore for follow — scaffold last-write used to stick the Code pill here.
  if (/\.gitignore/i.test(t)) return null;
  const m = t.match(/\b((?:src\/)?[\w./-]+\.(?:tsx?|jsx?|css|html|json))\b/i);
  if (m?.[1] && !/\.gitignore$/i.test(m[1])) return m[1].replace(/\\/g, '/');
  return null;
}

/** Normalize legacy string[] history from older call sites. */
export function normalizeStatusHistory(
  history: Array<string | ChatTurnStatusStep> | undefined,
  fallbackLabel?: string,
): ChatTurnStatusStep[] {
  const now = Date.now();
  if (!history?.length) {
    const label = String(fallbackLabel || '').trim();
    if (!label) return [];
    const classified = classifyStatusActivity(label);
    return [{ label, at: now, ...classified }];
  }
  return history.map((h, i) => {
    if (typeof h === 'string') {
      const label = h.replace(/\u2014/g, ':');
      const classified = classifyStatusActivity(label);
      return {
        label,
        at: now - (history.length - 1 - i) * 1000,
        ...classified,
      };
    }
    const label = String(h.label || '').replace(/\u2014/g, ':');
    const classified = classifyStatusActivity(label, {
      kind: h.kind,
      summary: h.summary,
      detail: h.detail,
      runStatus: h.runStatus,
      paths: h.paths,
    });
    return {
      label,
      at: typeof h.at === 'number' ? h.at : now,
      ...classified,
      detail: h.detail || classified.detail,
      runStatus: h.runStatus ?? classified.runStatus,
      paths: h.paths?.length ? h.paths : classified.paths,
    };
  });
}

/** Strip markdown stars and name each hop in plain language. */
export function plainStatusLabel(label: string): string {
  let t = String(label || '').replace(/\*\*/g, '').replace(/\u2014/g, ':').replace(/\s+/g, ' ').trim();
  t = t.replace(/^Using\s+(.+?)\s+for this build…?$/i, 'Craft · $1');
  t = t.replace(/^(Plan|Style|Verify)\s+hop\s*·\s*/i, '$1 · ');
  t = t.replace(/…+$/g, '');
  return t || 'Thinking…';
}

/** Push a status label, appending to history (dedupe consecutive). */
export function pushChatTurnStatus(opts: {
  chatId: string;
  assistantId: string;
  label: string;
  writingPath?: string | null;
  kind?: ChatActivityKind;
  summary?: string;
  detail?: string;
  runStatus?: ChatActivityRunStatus;
  paths?: string[];
}): void {
  const clean = plainStatusLabel(opts.label);
  const classified = classifyStatusActivity(clean, {
    kind: opts.kind,
    summary: opts.summary,
    detail: opts.detail,
    runStatus: opts.runStatus,
    paths: opts.paths,
  });
  const prev = current;
  const sameTurn = prev
    && prev.chatId === opts.chatId
    && prev.assistantId === opts.assistantId;
  const history = sameTurn ? [...prev.history] : [];
  const last = history[history.length - 1];
  const now = Date.now();
  // Same label OR same kind within 1.2s → update in place (stops dropdown firehose).
  const sameKindRecent = last
    && classified.kind
    && last.kind === classified.kind
    && (now - last.at) < 1200
    && !/^(?:write|read)$/i.test(String(classified.kind));
  if (!last || last.label !== clean) {
    if (sameKindRecent && last) {
      last.label = clean;
      last.at = now <= last.at ? last.at + 1 : now;
      last.summary = classified.summary;
      last.detail = opts.detail || classified.detail || last.detail;
      last.runStatus = opts.runStatus ?? classified.runStatus ?? last.runStatus;
      last.paths = opts.paths?.length ? opts.paths : (classified.paths || last.paths);
    } else {
      const at = last && now <= last.at ? last.at + 1 : now;
      history.push({
        label: clean,
        at,
        kind: classified.kind,
        summary: classified.summary,
        detail: opts.detail || classified.detail,
        runStatus: opts.runStatus ?? classified.runStatus,
        paths: opts.paths?.length ? opts.paths : classified.paths,
      });
    }
  } else if (last) {
    // Same label — refresh runStatus / detail (e.g. Running → Success).
    if (opts.runStatus) last.runStatus = opts.runStatus;
    if (opts.detail) last.detail = opts.detail;
    if (classified.summary) last.summary = classified.summary;
  }
  // Keep the full turn — do not drop early "3m" steps mid-build.
  while (history.length > 240) history.shift();
  const inferred = inferWritingPathFromLabel(clean);
  setChatTurnStatus({
    chatId: opts.chatId,
    assistantId: opts.assistantId,
    label: clean,
    history,
    writingPath: opts.writingPath !== undefined
      ? opts.writingPath
      : (inferred ?? (sameTurn ? prev.writingPath : null)),
  });
}

export function clearChatTurnStatus(assistantId?: string): void {
  if (!current) return;
  if (assistantId && current.assistantId !== assistantId) return;
  // Keep a finished snapshot so the step list + timers remain after the bubble settles.
  // Always end on "Done" — never freeze a mid-flight label like "Final pass…" as the live step.
  if (current.history?.length) {
    const history = [...current.history];
    const last = history[history.length - 1];
    if (!last || !/^done$/i.test(String(last.label || ''))) {
      history.push({ label: 'Done', at: Date.now() });
    }
    finishedByAssistant.set(current.assistantId, {
      ...current,
      label: 'Done',
      history,
      writingPath: null,
    });
  }
  current = null;
  emit();
  // Spine chips belong to the live dropdown — clear so they don't stick under the composer.
  try {
    void import('@/lib/createThinPath').then((m) => {
      try { m.setActiveThinCreateSpineStage(null); } catch { /* ignore */ }
    });
  } catch { /* ignore */ }
}

/** Drop a settled step snapshot (e.g. Try again) so Done does not stick on plain chat. */
export function forgetFinishedChatTurnStatus(assistantId?: string): void {
  if (!assistantId) {
    finishedByAssistant.clear();
  } else {
    finishedByAssistant.delete(assistantId);
  }
  emit();
}

const finishedByAssistant = new Map<string, ChatTurnStatus>();

/** Steps from a completed turn (survives clear so the dropdown history does not vanish). */
export function getFinishedChatTurnStatus(assistantId?: string | null): ChatTurnStatus | null {
  if (!assistantId) return null;
  return finishedByAssistant.get(assistantId) || null;
}

export function subscribeChatTurnStatus(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Format a step duration for the progress dropdown (e.g. &lt;1s, 12s, 1m 05s). */
export function formatStepDurationMs(ms: number): string {
  const safe = Math.max(0, ms);
  if (safe > 0 && safe < 1000) return '<1s';
  const n = Math.floor(safe / 1000);
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
