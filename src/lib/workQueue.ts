/**
 * Shared work queue for Agent / Multi-agent (and later Debug / Plan).
 * Persist per-chat; handoff chips: Do next · Finish all · Stop here.
 */

import { encodePromptChipsMessage, type PromptChip } from '@/lib/chatPromptChips';
import { parseClinicReportMessage } from '@/lib/debugClinic';
import { parsePlanReport } from '@/lib/planReport';

export type WorkQueueStatus = 'open' | 'doing' | 'done' | 'skipped';

export type WorkQueueItem = {
  id: string;
  title: string;
  detail?: string;
  /** Optional path hint for the builder. */
  path?: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
  status: WorkQueueStatus;
};

export type WorkQueue = {
  chatId: string;
  title: string;
  mode: 'agent' | 'multitask';
  items: WorkQueueItem[];
  updatedAt: number;
  /** True when queue was seeded from a Debug clinic report. */
  fromClinic?: boolean;
};

const QUEUE_KEY = (chatId: string) => `NOVA:work-queue:${chatId}`;
const TTL_MS = 6 * 60 * 60 * 1000;

export const WORK_QUEUE_DO_NEXT = 'do next work item';
export const WORK_QUEUE_FINISH_ALL = 'finish all remaining work items';
export const WORK_QUEUE_STOP = 'stop the work queue';

const WORD_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};

function parseSpokenIndex(raw: string): number | null {
  const t = String(raw || '').trim().toLowerCase();
  if (!t) return null;
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return n >= 1 && n <= 99 ? n : null;
  }
  if (WORD_NUM[t] != null) return WORD_NUM[t];
  return null;
}

/** “fix DBG-002”, “fix number two”, “work on low”, “add a README” — repair, don’t rescan. */
export function looksLikeClinicFixAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/\bfix\s+dbg[- ]?\d+\b/i.test(t)) return true;
  // Multi-id lists: “fix 15, 17, and 18”
  if (extractClinicFixIds(t).length >= 1) return true;
  // Digits: fix number 2 / fix #2 / fix issue 2
  if (/\b(?:fix|repair|resolve|address)\s+(?:issue\s+)?(?:number\s+)?#?\d+\b/i.test(t)) return true;
  // Words: fix number two / fix the second / let's go ahead and fix number two
  if (
    /\b(?:fix|repair|resolve|address)\s+(?:issue\s+)?(?:number\s+|the\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|first|second|third|fourth|fifth)\b/i.test(t)
  ) {
    return true;
  }
  // “go ahead and fix …” with an explicit clinic target nearby.
  // Do NOT treat product copy like “AUREL ONE” / “Meet Aurel One” as DBG-001.
  if (
    /\b(?:go\s+ahead\s+and\s+)?fix\b/i.test(t)
    && (
      /\bdbg[- ]?\d+\b/i.test(t)
      || /\b(?:issue|finding|item|number)\s+(?:#?\d+|one|two|three|four|five|six|seven|eight|nine|ten|second|third)\b/i.test(t)
      || /\bfix\s+(?:issue\s+)?#?\d+\b/i.test(t)
      || /\breadme\b/i.test(t)
      || /\b(?:critical|high|medium|low)\s+(?:ones?|issues?|findings?|items?)\b/i.test(t)
      || /\b(?:work\s+on|fix)\s+(?:the\s+)?(?:critical|high|medium|low)\b/i.test(t)
    )
  ) {
    return true;
  }
  if (/\b(?:work\s+on|fix|do|handle|tackle)\s+(?:the\s+)?(?:all\s+)?(?:critical|high|medium|low)(?:\s+(?:ones?|issues?|findings?|items?))?\b/i.test(t)) {
    return true;
  }
  if (/\b(?:add|create|write|make)\s+(?:a\s+|an\s+|the\s+)?readme(?:\.md)?\b/i.test(t)) return true;
  if (/\bfix\s+(?:the\s+)?(?:missing\s+)?readme\b/i.test(t)) return true;
  if (/\b(?:fix|repair)\s+(?:the\s+)?(?:vite\.svg|favicon|missing\s+asset)\b/i.test(t)) return true;
  // Free-form clinic repairs named by problem type (no DBG id required)
  if (
    /\b(?:fix|repair|harden|patch)\b/i.test(t)
    && /\b(?:eval\s*\/\s*exec|eval\s+and\s+exec|\beval\b|\bexec\b|as\s+any|button missing type|shell\s*\/\s*process|shell:true|child_process|spawn(?:Sync)?|execSync|execFile|readme)\b/i.test(t)
  ) {
    return true;
  }
  // Path + security fix in a fresh chat (“fix … in electron/main.ts”)
  if (
    /\b(?:fix|repair|harden|patch)\b/i.test(t)
    && /\b[\w./\\-]+\.(?:ts|tsx|js|jsx|mjs|cjs)\b/i.test(t)
    && /\b(?:eval|exec|spawn|shell|child_process|untrusted|risk)\b/i.test(t)
  ) {
    return true;
  }
  // “fix 3 things” / “fix next 5” / “do three more issues”
  if (extractBatchCount(t) != null) return true;
  return false;
}

/** e.g. fix dbg-002 / fix number two / fix the second → DBG-002 */
export function extractClinicFixId(text: string): string | null {
  const ids = extractClinicFixIds(text);
  return ids[0] || null;
}

/**
 * “fix 15, 17, and 18, also number one and seven” → [DBG-015, DBG-017, DBG-018, DBG-001, DBG-007]
 * Order preserved as spoken. Empty when the ask is a batch phrase (“fix next 3 low”) not a list of IDs.
 */
export function extractClinicFixIds(text: string): string[] {
  const t = String(text || '').trim();
  if (!t || !/\b(?:fix|repair|resolve|address)\b/i.test(t)) return [];

  // “fix next 3 low issues” / “fix 3 more things” — not DBG-003
  const batchOnly = (
    /\b(?:fix|repair)\s+(?:the\s+)?next\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(t)
    || /\b(?:fix|repair)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:more\s+)?(?:low|high|medium|critical)?\s*(?:items?|issues?|findings?|problems?|things?)\b/i.test(t)
  ) && !/,|\balso\b/i.test(t);
  if (batchOnly) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | number) => {
    const n = typeof raw === 'number' ? raw : parseSpokenIndex(String(raw).replace(/^#/, ''));
    if (n == null || n < 1 || n > 99) return;
    const id = `DBG-${String(n).padStart(3, '0')}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };

  // Clinic IDs are DBG-001…DBG-099 (3-digit pad). Must accept “Fix DBG-009”.
  for (const m of t.matchAll(/\bdbg[- ]?(\d{1,3})\b/gi)) add(Number(m[1]));

  for (const m of t.matchAll(
    /\bnumber\s+(#?\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/gi,
  )) {
    add(m[1]);
  }

  // List-like: commas, “also”, or multiple digits → harvest every 1–3 digit number in order
  const digitHits = [...t.matchAll(/\b(\d{1,3})\b/g)].map((m) => Number(m[1]));
  const listLike = /,|\balso\b/i.test(t)
    || digitHits.length >= 2
    || (/\band\b/i.test(t) && digitHits.length >= 1 && /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,3})\b/i.test(t));

  if (listLike) {
    for (const n of digitHits) add(n);
    for (const m of t.matchAll(
      /\b(?:and|also|,)\s*(?:the\s+)?(?:number\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/gi,
    )) {
      add(m[1]);
    }
  } else {
    const digit = t.match(/\b(?:fix|repair|resolve|address)\s+(?:issue\s+)?(?:number\s+)?#?(\d{1,3})\b/i);
    if (digit?.[1]) add(Number(digit[1]));
    const word = t.match(
      /\b(?:fix|repair|resolve|address)\s+(?:issue\s+)?(?:number\s+|the\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/i,
    );
    if (word?.[1]) add(word[1]);
  }

  return out;
}

/** Free-form problem keywords used to prioritize a clinic queue without a DBG id. */
export function extractClinicProblemHints(text: string): string[] {
  const t = String(text || '').toLowerCase();
  const hints: string[] = [];
  if (/\beval\s*\/\s*exec\b|\beval\s+and\s+exec\b|\beval\b.*\bexec\b|\bexec\b.*\beval\b/.test(t)) {
    hints.push('eval/exec', 'exec(', 'eval(');
  } else if (/\bexec\b/.test(t)) {
    hints.push('eval/exec', 'exec(');
  } else if (/\beval\b/.test(t)) {
    hints.push('eval/exec', 'eval(');
  }
  if (/\bas\s+any\b|:\s*any\b|weakens type/.test(t)) hints.push('as any', 'any');
  if (/button missing type|missing type attribute/.test(t)) hints.push('button missing type');
  if (/shell\s*\/\s*process|shell:true|child_process|spawn(?:sync)?|execsync/.test(t)) {
    hints.push('shell/process', 'shell:true', 'child_process', 'spawn');
  }
  if (/\breadme\b/.test(t)) hints.push('readme');
  if (/vite\.svg|missing\s+asset/.test(t)) hints.push('vite.svg', 'missing asset');
  // Path hint — prefer the named file when present
  const path = t.match(/\b([\w./\\-]+\.(?:ts|tsx|js|jsx|mjs|cjs))\b/);
  if (path?.[1]) hints.push(path[1].replace(/\\/g, '/'));
  return hints;
}

export function extractSeverityFocus(text: string): WorkQueueItem['severity'] | null {
  const t = String(text || '');
  // Allow “fix next 3 low issues” / “work on the remaining high findings”
  if (/\b(?:critical)\s+(?:ones?|issues?|findings?|items?|problems?)?\b/i.test(t)
    && /\b(?:fix|repair|do|handle|tackle|work\s+on|patch)\b/i.test(t)) {
    return 'critical';
  }
  if (/\b(?:high)\s+(?:ones?|issues?|findings?|items?|problems?)?\b/i.test(t)
    && /\b(?:fix|repair|do|handle|tackle|work\s+on|patch)\b/i.test(t)) {
    return 'high';
  }
  if (/\b(?:medium)\s+(?:ones?|issues?|findings?|items?|problems?)?\b/i.test(t)
    && /\b(?:fix|repair|do|handle|tackle|work\s+on|patch)\b/i.test(t)) {
    return 'medium';
  }
  if (/\b(?:low)\s+(?:ones?|issues?|findings?|items?|problems?)?\b/i.test(t)
    && /\b(?:fix|repair|do|handle|tackle|work\s+on|patch)\b/i.test(t)) {
    return 'low';
  }
  if (/\b(?:work\s+on|fix|do|handle|tackle)\s+(?:the\s+)?(?:all\s+)?critical\b/i.test(t)) return 'critical';
  if (/\b(?:work\s+on|fix|do|handle|tackle)\s+(?:the\s+)?(?:all\s+)?high\b/i.test(t)) return 'high';
  if (/\b(?:work\s+on|fix|do|handle|tackle)\s+(?:the\s+)?(?:all\s+)?medium\b/i.test(t)) return 'medium';
  if (/\b(?:work\s+on|fix|do|handle|tackle)\s+(?:the\s+)?(?:all\s+)?low\b/i.test(t)) return 'low';
  return null;
}

export function looksLikeReadmeFixAsk(text: string): boolean {
  return /\b(?:add|create|write|make)\s+(?:a\s+|an\s+|the\s+)?readme(?:\.md)?\b/i.test(String(text || ''))
    || /\bfix\s+(?:the\s+)?(?:missing\s+)?readme\b/i.test(String(text || ''));
}

/**
 * Reorder / filter open items so the user’s ask runs first
 * (DBG id, severity band, or README match).
 */
export function prioritizeQueueForAsk(queue: WorkQueue, ask: string): WorkQueue {
  const ids = extractClinicFixIds(ask);
  const sev = extractSeverityFocus(ask);
  const wantReadme = looksLikeReadmeFixAsk(ask);
  const hints = extractClinicProblemHints(ask);
  const open = queue.items.filter((i) => i.status === 'open' || i.status === 'doing');
  const closed = queue.items.filter((i) => i.status === 'done' || i.status === 'skipped');
  if (!open.length) return queue;

  let ordered = [...open];
  if (ids.length) {
    const want = new Set(ids.map((id) => id.toUpperCase()));
    const hits = ids
      .map((id) => ordered.find((i) => i.id.toUpperCase() === id.toUpperCase()))
      .filter((i): i is WorkQueueItem => Boolean(i));
    const rest = ordered.filter((i) => !want.has(i.id.toUpperCase()));
    if (hits.length) ordered = [...hits, ...rest];
  } else if (sev) {
    const band = ordered.filter((i) => i.severity === sev);
    const rest = ordered.filter((i) => i.severity !== sev);
    if (band.length) ordered = [...band, ...rest];
  } else if (wantReadme) {
    const hit = ordered.find((i) => /readme/i.test(`${i.id} ${i.title} ${i.detail || ''}`));
    if (hit) ordered = [hit, ...ordered.filter((i) => i !== hit)];
  } else if (hints.length) {
    const score = (i: WorkQueueItem) => {
      const blob = `${i.id} ${i.title} ${i.detail || ''} ${i.path || ''}`.toLowerCase();
      return hints.reduce((n, h) => n + (blob.includes(h.toLowerCase()) ? 1 : 0), 0);
    };
    const ranked = [...ordered].sort((a, b) => score(b) - score(a));
    if (score(ranked[0]) > 0) ordered = ranked;
  }

  const next = { ...queue, items: [...closed, ...ordered], updatedAt: Date.now() };
  saveWorkQueue(next);
  return next;
}

/**
 * Keep done/skipped marks when re-seeding from a clinic report so
 * “Fix DBG-009” does not wipe progress back to 1/N.
 */
export function mergeClinicQueueProgress(
  fresh: WorkQueue,
  prior: WorkQueue | null | undefined,
): WorkQueue {
  if (!prior?.items?.length || !fresh.items?.length) return fresh;
  const priorById = new Map(prior.items.map((i) => [i.id.toUpperCase(), i]));
  const items = fresh.items.map((item) => {
    const prev = priorById.get(item.id.toUpperCase());
    if (!prev) return item;
    if (prev.status === 'done' || prev.status === 'skipped') {
      return { ...item, status: prev.status };
    }
    return item;
  });
  return { ...fresh, items, updatedAt: Date.now() };
}

export function looksLikeWorkQueueDoNext(text: string): boolean {
  const t = String(text || '').trim();
  return /^(?:do\s+next(?:\s+work\s+item)?|next\s+item|continue\s+(?:the\s+)?queue)\b/i.test(t)
    || /\bdo\s+next\s*\(?\s*#?\s*(?:WQ-)?\d+/i.test(t);
}

export function looksLikeWorkQueueFinishAll(text: string): boolean {
  return /\b(?:finish\s+all(?:\s+remaining)?(?:\s+work\s+items)?|do\s+all(?:\s+remaining)?|fix\s+(?:them\s+)?all|build\s+them\s+all)\b/i.test(
    String(text || ''),
  );
}

/**
 * “fix 3”, “fix next 5”, “do three more”, “patch 2 low issues” → batch size.
 * Returns null when the ask is not a counted multi-fix.
 * Never confuses “fix 15” / “fix 15, 17, 18” (DBG ids) with “fix 15 items”.
 */
export function extractBatchCount(text: string): number | null {
  const t = String(text || '').trim();
  if (!t) return null;
  // Explicit DBG id list → handled by extractClinicFixIds, not a size batch.
  const ids = extractClinicFixIds(t);
  if (ids.length >= 1 && (/,|\balso\b/i.test(t) || ids.length >= 2)) return null;
  if (ids.length === 1 && !/\b(?:next|more|items?|issues?|findings?|problems?|things?)\b/i.test(t)) {
    return null;
  }

  // Explicit: fix next 3 / fix 3 more / do 5 items / repair three issues
  const m = t.match(
    /\b(?:fix|repair|do|handle|tackle|patch|resolve)\s+(?:the\s+)?(?:next\s+)?(?:#?\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:more\s+)?(?:items?|issues?|findings?|problems?|things?)?\b/i,
  );
  if (!m) return null;
  // Prefer the number token right after the verb phrase
  const numTok = t.match(
    /\b(?:fix|repair|do|handle|tackle|patch|resolve)\s+(?:the\s+)?(?:next\s+)?(#?\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i,
  )?.[1];
  if (!numTok) return null;
  const n = parseSpokenIndex(numTok.replace(/^#/, ''));
  if (n == null || n < 1) return null;
  // Require next/more/items wording — bare “fix 15” is DBG-015, not a batch of 15.
  if (!/\b(?:next|more|items?|issues?|findings?|problems?|things?)\b/i.test(t)) return null;
  return Math.min(12, n);
}

/** “what’s left”, “how many remaining”, “rescan for leftovers” → full clinic list, not a fix. */
export function looksLikeRemainingAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (looksLikeClinicFixAsk(t) && !/\b(?:left|remain(?:ing)?|leftover|still\s+open)\b/i.test(t)) {
    return false;
  }
  return (
    /\b(?:what(?:'s|s|\s+is)?\s+(?:left|remaining)|how\s+many\s+(?:left|remaining)|what\s+remain(?:s|ing)?)\b/i.test(t)
    || /\b(?:remaining|leftover|still\s+open)\s+(?:issues?|problems?|findings?|items?|bugs?)?\b/i.test(t)
    || /\b(?:rescan|re-?scan|scan\s+again|fresh\s+scan|list\s+(?:the\s+)?(?:remaining|leftover))\b/i.test(t)
    || /\b(?:what(?:'s|s)?\s+(?:still\s+)?(?:to\s+)?(?:fix|patch)|show\s+(?:me\s+)?(?:what(?:'s|s)?\s+)?left)\b/i.test(t)
  );
}

export function looksLikeWorkQueueStop(text: string): boolean {
  return /^(?:stop(?:\s+(?:here|the\s+work\s+queue))?|cancel\s+(?:the\s+)?queue|pause\s+(?:the\s+)?queue)\s*[.!]?\s*$/i.test(
    String(text || '').trim(),
  );
}

export function loadWorkQueue(chatId: string): WorkQueue | null {
  const id = String(chatId || '').trim();
  if (!id) return null;
  try {
    const raw = sessionStorage.getItem(QUEUE_KEY(id))
      || localStorage.getItem(QUEUE_KEY(id));
    if (!raw) return null;
    const q = JSON.parse(raw) as WorkQueue;
    if (!q?.items?.length || q.chatId !== id) return null;
    if (Date.now() - (q.updatedAt || 0) > TTL_MS) {
      clearWorkQueue(id);
      return null;
    }
    return q;
  } catch {
    return null;
  }
}

export function saveWorkQueue(queue: WorkQueue): void {
  const id = String(queue.chatId || '').trim();
  if (!id || !queue.items?.length) return;
  const next: WorkQueue = {
    ...queue,
    chatId: id,
    updatedAt: Date.now(),
    items: queue.items.slice(0, 40),
  };
  try {
    const raw = JSON.stringify(next);
    sessionStorage.setItem(QUEUE_KEY(id), raw);
    localStorage.setItem(QUEUE_KEY(id), raw);
  } catch { /* ignore */ }
}

export function clearWorkQueue(chatId: string): void {
  const id = String(chatId || '').trim();
  if (!id) return;
  try {
    sessionStorage.removeItem(QUEUE_KEY(id));
    localStorage.removeItem(QUEUE_KEY(id));
  } catch { /* ignore */ }
}

export function nextOpenItem(queue: WorkQueue | null): WorkQueueItem | null {
  if (!queue?.items?.length) return null;
  return queue.items.find((i) => i.status === 'open' || i.status === 'doing') || null;
}

export function openItems(queue: WorkQueue | null): WorkQueueItem[] {
  return (queue?.items || []).filter((i) => i.status === 'open' || i.status === 'doing');
}

export function markItemStatus(
  queue: WorkQueue,
  itemId: string,
  status: WorkQueueStatus,
): WorkQueue {
  const items = queue.items.map((i) => (
    i.id === itemId ? { ...i, status } : i
  ));
  const next = { ...queue, items, updatedAt: Date.now() };
  saveWorkQueue(next);
  return next;
}

export function countProgress(queue: WorkQueue): { done: number; total: number; open: number } {
  const total = queue.items.length;
  const done = queue.items.filter((i) => i.status === 'done' || i.status === 'skipped').length;
  const open = total - done;
  return { done, total, open };
}

function padId(n: number): string {
  return `WQ-${String(n).padStart(3, '0')}`;
}

/** Build queue from clinic findings / plan steps / numbered ask / free text. */
export function buildWorkQueueFromContext(opts: {
  chatId: string;
  mode: 'agent' | 'multitask';
  userMessage: string;
  messages?: Array<{ role?: string; content?: string } | null | undefined>;
  title?: string;
}): WorkQueue {
  const ask = String(opts.userMessage || '').trim();
  const fromClinic = extractClinicItems(opts.messages || []);
  if (fromClinic.length) {
    return {
      chatId: opts.chatId,
      mode: opts.mode,
      title: opts.title || 'Debug follow-up',
      items: fromClinic,
      fromClinic: true,
      updatedAt: Date.now(),
    };
  }
  const fromPlan = extractPlanItems(opts.messages || []);
  if (fromPlan.length && /\b(?:step|plan|build|implement)\b/i.test(ask)) {
    return {
      chatId: opts.chatId,
      mode: opts.mode,
      title: opts.title || 'Plan build-out',
      items: fromPlan,
      updatedAt: Date.now(),
    };
  }
  const numbered = extractNumberedItems(ask);
  if (numbered.length >= 2) {
    return {
      chatId: opts.chatId,
      mode: opts.mode,
      title: opts.title || 'Task list',
      items: numbered,
      updatedAt: Date.now(),
    };
  }
  // Single-task queue from the ask (may be expanded by LLM decompose later).
  const pathHint = ask.match(/\b([\w./\\-]+\.(?:ts|tsx|js|jsx|mjs|cjs))\b/i)?.[1]
    ?.replace(/\\/g, '/');
  return {
    chatId: opts.chatId,
    mode: opts.mode,
    title: opts.title || 'Agent work',
    items: [{
      id: padId(1),
      title: ask.slice(0, 120) || 'Improve the bound project',
      detail: ask.slice(0, 400),
      path: pathHint,
      status: 'open',
    }],
    updatedAt: Date.now(),
  };
}

function extractClinicItems(
  messages: Array<{ role?: string; content?: string } | null | undefined>,
): WorkQueueItem[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== 'assistant') continue;
    const report = parseClinicReportMessage(String(m.content || ''));
    if (!report?.findings?.length) continue;
    return report.findings.slice(0, 48).map((f, idx) => ({
      id: f.id || padId(idx + 1),
      title: f.problem.slice(0, 140) || f.id,
      // Fix guidance only — keep evidence out of handoff copy.
      detail: String(f.fix || '').trim().slice(0, 400) || undefined,
      path: f.path,
      severity: f.severity,
      status: 'open' as const,
    }));
  }
  return [];
}

function extractPlanItems(
  messages: Array<{ role?: string; content?: string } | null | undefined>,
): WorkQueueItem[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== 'assistant') continue;
    const report = parsePlanReport(String(m.content || ''));
    if (!report?.steps?.length) continue;
    return report.steps.slice(0, 16).map((s, idx) => ({
      id: padId(idx + 1),
      title: s.title.slice(0, 140),
      detail: s.detail?.slice(0, 400),
      status: 'open' as const,
    }));
  }
  return [];
}

function extractNumberedItems(text: string): WorkQueueItem[] {
  const lines = String(text || '').split(/\r?\n/);
  const out: WorkQueueItem[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*(?:\d+[.)]|[-*•])\s+(.+)$/);
    if (!m?.[1]) continue;
    const title = m[1].replace(/\*\*/g, '').trim().slice(0, 140);
    if (title.length < 4) continue;
    out.push({ id: padId(out.length + 1), title, status: 'open' });
    if (out.length >= 16) break;
  }
  return out;
}

/** Merge LLM-decomposed tasks into a queue (replace open list when richer). */
export function replaceOpenItems(queue: WorkQueue, items: Array<Partial<WorkQueueItem>>): WorkQueue {
  const done = queue.items.filter((i) => i.status === 'done' || i.status === 'skipped');
  const fresh: WorkQueueItem[] = [];
  items.forEach((raw, idx) => {
    const title = String(raw.title || '').trim().slice(0, 140);
    if (!title) return;
    fresh.push({
      id: String(raw.id || padId(done.length + fresh.length + 1)).slice(0, 24),
      title,
      detail: String(raw.detail || '').trim().slice(0, 400) || undefined,
      path: String(raw.path || '').trim().slice(0, 160) || undefined,
      severity: raw.severity,
      status: 'open',
    });
  });
  if (!fresh.length) return queue;
  // Avoid id collisions with done items.
  const used = new Set(done.map((d) => d.id));
  const normalized = fresh.map((f, i) => {
    let id = f.id || padId(i + 1);
    if (used.has(id)) id = padId(done.length + i + 1);
    used.add(id);
    return { ...f, id };
  });
  const next = { ...queue, items: [...done, ...normalized], updatedAt: Date.now() };
  saveWorkQueue(next);
  return next;
}

export function formatWorkHandoffReply(opts: {
  modeLabel: string;
  queue: WorkQueue;
  completed: WorkQueueItem;
  summary: string;
  updatedPaths?: string[];
  workerNotes?: string[];
  standingNow?: string;
  /** When true, queue is empty after this item. */
  finishedAll?: boolean;
}): string {
  const { done, total, open } = countProgress(opts.queue);
  const next = nextOpenItem(opts.queue);
  const landed = Boolean(opts.updatedPaths?.length);
  const lines: string[] = [
    landed
      ? `**${opts.modeLabel}** · finished **${opts.completed.id}** (${done}/${total})`
      : `**${opts.modeLabel}** · could not finish **${opts.completed.id}** (${done}/${total})`,
    '',
    opts.summary.trim(),
  ];
  if (opts.updatedPaths?.length) {
    lines.push(
      '',
      '**Files touched**',
      ...opts.updatedPaths.slice(0, 8).map((p) => `- \`${p}\``),
    );
    if (opts.updatedPaths.length > 8) {
      lines.push(`- …+${opts.updatedPaths.length - 8} more`);
    }
  }
  if (opts.workerNotes?.length) {
    lines.push('', '**Team notes**', ...opts.workerNotes.map((n) => `- ${n}`));
  }
  if (opts.standingNow) {
    lines.push('', '**Where the app stands now**', '', opts.standingNow.trim());
  }
  // Keep “What’s next” outside any prior numbered list so markdown can’t glue it onto the last finding.
  lines.push('');
  lines.push('**What’s next**');
  if (opts.finishedAll || !next) {
    if (open <= 0) {
      lines.push('- Queue is clear — nothing left open in this work list.');
      lines.push('- Say what you want next, or run **Debug** for a fresh scan.');
    } else {
      lines.push('- Still-open items remain in the queue.');
      lines.push('- Use **Do next** or **Finish all remaining** when you want to continue.');
    }
  } else {
    const problem = String(next.title || '').replace(/\s+/g, ' ').trim();
    const fix = String(next.detail || '').replace(/\s+/g, ' ').trim();
    lines.push(`- **Next up:** ${next.id}${problem ? ` — ${problem}` : ''}`);
    if (fix && fix.toLowerCase() !== problem.toLowerCase()) {
      lines.push(`- **How to fix:** ${fix.slice(0, 220)}`);
    }
    lines.push('- Ready when you are — continue with the next issue, finish the rest, or pause here.');
  }
  const body = lines.filter((l) => l != null && l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n');
  if (opts.finishedAll || !next) {
    return body;
  }
  const chips: PromptChip[] = [
    // Clinic queues: send the exact DBG id so “Do next (DBG-009)” never silently runs DBG-001.
    {
      label: `Do next (${next.id})`,
      prompt: opts.queue.fromClinic ? `fix ${next.id}` : WORK_QUEUE_DO_NEXT,
    },
    { label: 'Finish all remaining', prompt: WORK_QUEUE_FINISH_ALL },
    { label: 'Stop here', prompt: WORK_QUEUE_STOP },
  ];
  return encodePromptChipsMessage(body, chips);
}

export function formatQueueStoppedReply(queue: WorkQueue): string {
  const { done, total, open } = countProgress(queue);
  return [
    `**Work queue paused** · ${done}/${total} done · ${open} still open.`,
    '',
    ...openItems(queue).slice(0, 8).map((i) => `- **${i.id}** ${i.title}`),
    open > 8 ? `…and ${open - 8} more` : '',
    '',
    'Say **do next work item** or **finish all remaining work items** when you want to continue.',
  ].filter(Boolean).join('\n');
}
