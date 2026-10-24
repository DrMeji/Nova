/**
 * Build / create diagnostics ring — survives after turn status clears
 * so Copy freeze/build report still has phase + failure detail.
 * Also powers the Code-pill live build timer (total + per-file stall).
 */

export type BuildDiagEvent = {
  at: string;
  kind:
    | 'phase'
    | 'status'
    | 'write'
    | 'gate'
    | 'fail'
    | 'ready'
    | 'warn'
    | 'soft-bind'
    | 'manual'
    | 'file-done';
  detail: string;
  path?: string | null;
  ms?: number;
};

export type BuildFileTiming = {
  path: string;
  /** Wall ms spent while this path was the active follow target. */
  ms: number;
  /** Last time this path became active (ISO). */
  startedAt: string | null;
  done: boolean;
};

export type BuildDiagSnapshot = {
  chatId: string | null;
  productName: string | null;
  diskRoot: string | null;
  projectId: string | null;
  phase: string | null;
  lastStatus: string | null;
  writingPath: string | null;
  ready: boolean | null;
  failReasons: string[];
  ensembleHops: string[];
  appBytes: number | null;
  cssBytes: number | null;
  softBindCount: number;
  startedAt: string | null;
  updatedAt: string | null;
  /** Path → cumulative active time while building. */
  fileTimings: Record<string, BuildFileTiming>;
  /** When the current writingPath became active (ms epoch). */
  currentPathStartedAt: number | null;
  /** Last activity (token growth / status / heartbeat) — stall = idle since this. */
  lastActivityAt: number | null;
  /** Build finished / stopped — timer freezes. */
  endedAt: string | null;
};

const MAX_EVENTS = 120;
/** Idle (no heartbeat / growth) before Code UI shows "stall". Long App writes are OK. */
const STALL_MS = 14_000;
const ring: BuildDiagEvent[] = [];
let snap: BuildDiagSnapshot = emptySnap();
const listeners = new Set<() => void>();

function emptySnap(): BuildDiagSnapshot {
  return {
    chatId: null,
    productName: null,
    diskRoot: null,
    projectId: null,
    phase: null,
    lastStatus: null,
    writingPath: null,
    ready: null,
    failReasons: [],
    ensembleHops: [],
    appBytes: null,
    cssBytes: null,
    softBindCount: 0,
    startedAt: null,
    updatedAt: null,
    fileTimings: {},
    currentPathStartedAt: null,
    lastActivityAt: null,
    endedAt: null,
  };
}

function notify() {
  for (const fn of listeners) {
    try { fn(); } catch { /* ignore */ }
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function flushPersist() {
  persistTimer = null;
  try {
    sessionStorage.setItem(
      'NOVA:last-build-diag',
      JSON.stringify({
        snap,
        events: ring.slice(-MAX_EVENTS),
        savedAt: new Date().toISOString(),
      }),
    );
  } catch { /* quota */ }
  notify();
}

/** Coalesce sessionStorage writes — hot path used to triple-stringify every status tick. */
function persist(opts?: { force?: boolean }) {
  if (opts?.force) {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    flushPersist();
    return;
  }
  notify();
  if (persistTimer) return;
  persistTimer = setTimeout(flushPersist, 1000);
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return formatBuildElapsed(ms);
}

function pushBuildDiagRaw(ev: Omit<BuildDiagEvent, 'at'> & { at?: string }): void {
  const row: BuildDiagEvent = {
    at: ev.at || new Date().toISOString(),
    kind: ev.kind,
    detail: String(ev.detail || '').slice(0, 500),
    path: ev.path ?? null,
    ms: ev.ms,
  };
  ring.push(row);
  while (ring.length > MAX_EVENTS) ring.shift();
  snap.updatedAt = row.at;
}

function closeCurrentPathTiming(now = Date.now()) {
  const path = snap.writingPath;
  const started = snap.currentPathStartedAt;
  if (!path || started == null) return;
  const delta = Math.max(0, now - started);
  const prev = snap.fileTimings[path];
  const total = (prev?.ms || 0) + delta;
  snap.fileTimings = {
    ...snap.fileTimings,
    [path]: {
      path,
      ms: total,
      startedAt: prev?.startedAt || new Date(started).toISOString(),
      done: true,
    },
  };
  pushBuildDiagRaw({
    kind: 'file-done',
    detail: `${path} · ${formatMs(total)}`,
    path,
    ms: total,
  });
  snap.currentPathStartedAt = null;
}

export function formatBuildElapsed(ms: number): string {
  const n = Math.max(0, Math.floor(ms));
  const s = Math.floor(n / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) {
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function resetBuildDiagnostics(opts?: {
  chatId?: string | null;
  productName?: string | null;
}): void {
  ring.length = 0;
  snap = emptySnap();
  snap.chatId = opts?.chatId || null;
  snap.productName = opts?.productName || null;
  snap.startedAt = new Date().toISOString();
  snap.updatedAt = snap.startedAt;
  snap.lastActivityAt = Date.now();
  persist({ force: true });
}

export function tickBuildHeartbeat(detail?: string): void {
  if (snap.endedAt) return;
  const now = Date.now();
  snap.updatedAt = new Date().toISOString();
  snap.lastActivityAt = now;
  if (detail) snap.lastStatus = String(detail).slice(0, 220);
  // Memory + light notify; sessionStorage coalesced.
  persist();
}

export function markBuildDiagnosticsEnded(): void {
  if (snap.endedAt) return;
  closeCurrentPathTiming();
  snap.endedAt = new Date().toISOString();
  persist({ force: true });
}

/** Leave craft file follow when npm/Live starts — stops Code showing App.jsx idle for minutes. */
export function clearBuildWritingPath(detail?: string): void {
  closeCurrentPathTiming();
  snap.writingPath = null;
  snap.currentPathStartedAt = null;
  if (detail) snap.lastStatus = String(detail).slice(0, 220);
  snap.updatedAt = new Date().toISOString();
  snap.lastActivityAt = Date.now();
  persist();
}

export function pushBuildDiag(ev: Omit<BuildDiagEvent, 'at'> & { at?: string }): void {
  const now = Date.now();
  const nextPath = ev.path ? String(ev.path).replace(/\\/g, '/') : null;

  // Track per-file active time when follow path changes.
  if (nextPath && nextPath !== snap.writingPath) {
    closeCurrentPathTiming(now);
    snap.writingPath = nextPath;
    snap.currentPathStartedAt = now;
    const prev = snap.fileTimings[nextPath];
    snap.fileTimings = {
      ...snap.fileTimings,
      [nextPath]: {
        path: nextPath,
        ms: prev?.ms || 0,
        startedAt: new Date(now).toISOString(),
        done: false,
      },
    };
  } else if (ev.path) {
    snap.writingPath = nextPath;
    if (snap.currentPathStartedAt == null) snap.currentPathStartedAt = now;
  }

  pushBuildDiagRaw(ev);
  snap.lastActivityAt = now;
  if (ev.kind === 'phase') {
    snap.phase = String(ev.detail || '').slice(0, 500);
    if (!snap.endedAt) snap.updatedAt = new Date().toISOString();
  }
  if (ev.kind === 'status') snap.lastStatus = String(ev.detail || '').slice(0, 500);
  if (ev.kind === 'soft-bind') {
    snap.softBindCount += 1;
    if (!snap.endedAt) snap.updatedAt = new Date().toISOString();
  }
  if (ev.kind === 'fail') {
    closeCurrentPathTiming(now);
    snap.endedAt = snap.endedAt || new Date().toISOString();
  }
  // 'ready' does not freeze the clock — npm / Live may still run; call markBuildDiagnosticsEnded.
  persist(ev.kind === 'fail' || ev.kind === 'ready' ? { force: true } : undefined);
}

export function noteBuildContext(partial: Partial<BuildDiagSnapshot>): void {
  // Only react to writingPath when a real path is provided — null/omitted must NOT
  // close the active file timer (status heartbeats pass writingPath: null often).
  const rawPath = partial.writingPath;
  if (typeof rawPath === 'string' && rawPath.trim()) {
    const nextPath = rawPath.replace(/\\/g, '/');
    if (nextPath !== snap.writingPath) {
      pushBuildDiag({ kind: 'write', detail: `Follow ${nextPath}`, path: nextPath });
    }
  }
  const { ...rest } = partial;
  snap = {
    ...snap,
    ...rest,
    failReasons: rest.failReasons ?? snap.failReasons,
    ensembleHops: rest.ensembleHops ?? snap.ensembleHops,
    fileTimings: rest.fileTimings ?? snap.fileTimings,
    updatedAt: new Date().toISOString(),
    lastActivityAt: Date.now(),
  };
  persist();
}

export function noteBuildGateResult(ok: boolean, reasons: string[]): void {
  snap.ready = ok;
  snap.failReasons = (reasons || []).map((r) => String(r).slice(0, 240)).slice(0, 16);
  pushBuildDiag({
    kind: ok ? 'ready' : 'gate',
    detail: ok
      ? 'Preview Ready passed'
      : `Preview Ready blocked: ${(reasons[0] || 'unknown').slice(0, 160)}`,
  });
  persist();
}

export function noteBuildFail(reasons: string[]): void {
  snap.ready = false;
  snap.failReasons = (reasons || []).map((r) => String(r).slice(0, 240)).slice(0, 16);
  pushBuildDiag({
    kind: 'fail',
    detail: snap.failReasons[0] || 'Create failed',
  });
  persist();
}

export function getBuildDiagnostics(): {
  snap: BuildDiagSnapshot;
  events: BuildDiagEvent[];
} {
  // Prefer live ring; fall back to last session snapshot if ring empty.
  if (ring.length === 0) {
    try {
      const raw = sessionStorage.getItem('NOVA:last-build-diag');
      if (raw) {
        const parsed = JSON.parse(raw) as { snap?: BuildDiagSnapshot; events?: BuildDiagEvent[] };
        if (parsed?.snap) {
          return {
            snap: {
              ...emptySnap(),
              ...parsed.snap,
              fileTimings: parsed.snap.fileTimings ?? {},
              currentPathStartedAt: parsed.snap.currentPathStartedAt ?? null,
              lastActivityAt: parsed.snap.lastActivityAt ?? null,
              endedAt: parsed.snap.endedAt ?? null,
            },
            events: Array.isArray(parsed.events) ? parsed.events : [],
          };
        }
      }
    } catch { /* ignore */ }
  }
  return { snap: { ...snap, fileTimings: { ...snap.fileTimings } }, events: [...ring] };
}

/** Live clock for Code-pill header — total build + current file + stall flag. */
export function getBuildLiveClock(now = Date.now()): {
  active: boolean;
  totalMs: number;
  totalLabel: string;
  phase: string | null;
  currentPath: string | null;
  currentFileMs: number;
  currentFileLabel: string;
  stalled: boolean;
  fileTimings: BuildFileTiming[];
} {
  const started = snap.startedAt ? Date.parse(snap.startedAt) : NaN;
  const ended = snap.endedAt ? Date.parse(snap.endedAt) : NaN;
  const endMs = Number.isFinite(ended) ? ended : now;
  const totalMs = Number.isFinite(started) ? Math.max(0, endMs - started) : 0;
  const path = snap.writingPath;
  let currentFileMs = 0;
  if (path) {
    const base = snap.fileTimings[path]?.ms || 0;
    const open = snap.currentPathStartedAt;
    currentFileMs = base + (open != null && !snap.endedAt ? Math.max(0, now - open) : 0);
  }
  // Stall = no activity for STALL_MS — NOT "this file has been open a long time".
  // Long App.tsx writes (30–90s) with streaming tokens must not read as stall.
  let lastAct = snap.lastActivityAt;
  if (lastAct == null && snap.updatedAt) {
    const parsed = Date.parse(snap.updatedAt);
    if (Number.isFinite(parsed)) lastAct = parsed;
  }
  if (lastAct == null || !Number.isFinite(lastAct)) {
    lastAct = snap.currentPathStartedAt;
  }
  const idleMs = lastAct != null && Number.isFinite(lastAct)
    ? Math.max(0, now - lastAct)
    : currentFileMs;
  const stalled = Boolean(path && !snap.endedAt && idleMs >= STALL_MS);
  const timings = Object.values(snap.fileTimings)
    .map((t) => {
      if (t.path === path && snap.currentPathStartedAt != null && !snap.endedAt) {
        return { ...t, ms: currentFileMs, done: false };
      }
      return t;
    })
    .sort((a, b) => b.ms - a.ms);
  return {
    active: Boolean(snap.startedAt && !snap.endedAt),
    totalMs,
    totalLabel: formatBuildElapsed(totalMs),
    phase: snap.phase || snap.lastStatus,
    currentPath: path,
    currentFileMs,
    currentFileLabel: formatBuildElapsed(currentFileMs),
    stalled,
    fileTimings: timings,
  };
}

export function subscribeBuildDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Human-readable block for chat paste. */
export function formatBuildReportMarkdown(): string {
  const { snap: s, events } = getBuildDiagnostics();
  const clock = getBuildLiveClock();
  const lines = [
    '## NOVA build report',
    '',
    `- **Captured:** ${new Date().toISOString()}`,
    `- **Product:** ${s.productName || '—'}`,
    `- **Chat:** ${s.chatId || '—'}`,
    `- **Phase:** ${s.phase || '—'}`,
    `- **Elapsed:** ${clock.totalLabel}`,
    `- **Ready:** ${s.ready == null ? '—' : s.ready ? 'yes' : 'no'}`,
    `- **Folder:** ${s.diskRoot || '—'}`,
    `- **App bytes:** ${s.appBytes ?? '—'} · **CSS bytes:** ${s.cssBytes ?? '—'}`,
    `- **Soft-binds (UI thrash):** ${s.softBindCount}`,
    '',
  ];
  if (clock.fileTimings.length) {
    lines.push('**Per-file time (stalls)**');
    for (const f of clock.fileTimings.slice(0, 16)) {
      const name = f.path.split('/').pop() || f.path;
      lines.push(`- \`${name}\` · ${formatMs(f.ms)}${f.ms >= STALL_MS ? ' ⚠ stall' : ''}${f.done ? '' : ' (active)'}`);
    }
    lines.push('');
  }
  if (s.ensembleHops.length) {
    lines.push('**Ensemble hops**', ...s.ensembleHops.map((h) => `- ${h}`), '');
  }
  if (s.failReasons.length) {
    lines.push('**Why Ready failed / blocked**', ...s.failReasons.map((r) => `- ${r}`), '');
  }
  if (s.lastStatus) {
    lines.push(`**Last status:** ${s.lastStatus}`, '');
  }
  const recent = events.slice(-24);
  if (recent.length) {
    lines.push('**Timeline**');
    for (const ev of recent) {
      const t = ev.at.slice(11, 19);
      lines.push(`- \`${t}\` **${ev.kind}** ${ev.detail}${ev.path ? ` · \`${ev.path}\`` : ''}${ev.ms != null ? ` (${ev.ms}ms)` : ''}`);
    }
    lines.push('');
  }
  lines.push('```json', JSON.stringify({ snap: s, events: recent }, null, 2), '```');
  return lines.join('\n');
}
