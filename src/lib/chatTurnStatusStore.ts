/**
 * Live turn status outside the messages array — avoids remounting chat on every status tick.
 */

export type ChatTurnStatus = {
  chatId: string;
  assistantId: string;
  label: string;
  /** Recent status lines for the clickable dropdown (newest last). */
  history: string[];
  /** File path currently being written (Code overlay follows this while generating). */
  writingPath?: string | null;
};

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

export function setChatTurnStatus(next: ChatTurnStatus | null): void {
  const prev = current;
  if (
    prev
    && next
    && prev.chatId === next.chatId
    && prev.assistantId === next.assistantId
    && prev.label === next.label
    && (prev.writingPath || null) === (next.writingPath || null)
    && prev.history.length === next.history.length
  ) {
    return;
  }
  current = next;
  emit();
}

/** Infer Code-pill follow path from a status label when not passed explicitly. */
export function inferWritingPathFromLabel(label: string): string | null {
  const t = String(label || '');
  // Never park live-follow on scaffold noise during polish.
  if (/App\.css|styles?\b.*App\.css|Linking App\.css|Writing src\/App\.css|Coding src\/App\.css/i.test(t)) {
    return 'src/App.css';
  }
  if (/App\.(tsx|jsx)\b|Coding the product|Writing src\/App\.(tsx|jsx)|layout, sections/i.test(t)) {
    return 'src/App.tsx';
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

/** Push a status label, appending to history (dedupe consecutive). */
export function pushChatTurnStatus(opts: {
  chatId: string;
  assistantId: string;
  label: string;
  writingPath?: string | null;
}): void {
  const clean = String(opts.label || '').trim().replace(/\u2014/g, ':') || 'Thinking…';
  const prev = current;
  const sameTurn = prev
    && prev.chatId === opts.chatId
    && prev.assistantId === opts.assistantId;
  const history = sameTurn ? [...prev.history] : [];
  if (!history.length || history[history.length - 1] !== clean) {
    history.push(clean);
  }
  while (history.length > 28) history.shift();
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
  current = null;
  emit();
}

export function subscribeChatTurnStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
