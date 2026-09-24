/**
 * Build / create diagnostics ring — survives after turn status clears
 * so Copy freeze/build report still has phase + failure detail.
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
    | 'manual';
  detail: string;
  path?: string | null;
  ms?: number;
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
};

const MAX_EVENTS = 80;
const ring: BuildDiagEvent[] = [];
let snap: BuildDiagSnapshot = emptySnap();

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
  };
}

function persist() {
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
  persist();
}

export function pushBuildDiag(ev: Omit<BuildDiagEvent, 'at'> & { at?: string }): void {
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
  if (ev.kind === 'phase') snap.phase = row.detail;
  if (ev.kind === 'status') snap.lastStatus = row.detail;
  if (ev.path) snap.writingPath = ev.path;
  if (ev.kind === 'soft-bind') snap.softBindCount += 1;
  persist();
}

export function noteBuildContext(partial: Partial<BuildDiagSnapshot>): void {
  snap = {
    ...snap,
    ...partial,
    failReasons: partial.failReasons ?? snap.failReasons,
    ensembleHops: partial.ensembleHops ?? snap.ensembleHops,
    updatedAt: new Date().toISOString(),
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
            snap: parsed.snap,
            events: Array.isArray(parsed.events) ? parsed.events : [],
          };
        }
      }
    } catch { /* ignore */ }
  }
  return { snap: { ...snap }, events: [...ring] };
}

/** Human-readable block for chat paste. */
export function formatBuildReportMarkdown(): string {
  const { snap: s, events } = getBuildDiagnostics();
  const lines = [
    '## NOVA build report',
    '',
    `- **Captured:** ${new Date().toISOString()}`,
    `- **Product:** ${s.productName || '—'}`,
    `- **Chat:** ${s.chatId || '—'}`,
    `- **Phase:** ${s.phase || '—'}`,
    `- **Ready:** ${s.ready == null ? '—' : s.ready ? 'yes' : 'no'}`,
    `- **Folder:** ${s.diskRoot || '—'}`,
    `- **App bytes:** ${s.appBytes ?? '—'} · **CSS bytes:** ${s.cssBytes ?? '—'}`,
    `- **Soft-binds (UI thrash):** ${s.softBindCount}`,
    '',
  ];
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
