/**
 * Capture UI freezes / long tasks / renderer errors + last create/build diagnostics
 * so the user can copy a report into chat.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardCopy, Bug } from 'lucide-react';
import { getChatTurnStatus } from '@/lib/chatTurnStatusStore';
import { listInflightChatIds } from '@/lib/chatInflight';
import {
  formatBuildReportMarkdown,
  getBuildDiagnostics,
  pushBuildDiag,
} from '@/lib/buildDiagnostics';
import { getCreateJobForChat } from '@/lib/createJobStore';

type FreezeEvent = {
  at: string;
  kind: 'longtask' | 'error' | 'rejection' | 'manual' | 'heartbeat-stall';
  detail: string;
  ms?: number;
};

const MAX_EVENTS = 40;
const ring: FreezeEvent[] = [];

function pushEvent(ev: FreezeEvent) {
  ring.push(ev);
  while (ring.length > MAX_EVENTS) ring.shift();
}

function snapshotExtras() {
  const status = getChatTurnStatus();
  const inflight = listInflightChatIds();
  const build = getBuildDiagnostics();
  const chatId = status?.chatId || build.snap.chatId || null;
  const job = chatId ? getCreateJobForChat(chatId) : null;
  return {
    route: typeof location !== 'undefined' ? `${location.hash || location.pathname}` : '',
    inflightChatIds: inflight,
    turnLabel: status?.label || build.snap.lastStatus || null,
    turnHistoryLen: status?.history?.length ?? 0,
    turnHistoryTail: (status?.history || []).slice(-12).map((h) => h.label),
    writingPath: status?.writingPath || build.snap.writingPath || null,
    createJob: job
      ? {
          id: job.id,
          name: job.name,
          status: job.status,
          path: job.path,
          error: job.error || null,
          updatedAt: job.updatedAt,
        }
      : null,
    build: build.snap,
    buildEvents: build.events.slice(-40),
    memory: (() => {
      try {
        const p = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
        if (!p) return null;
        return {
          usedMb: Math.round(p.usedJSHeapSize / 1048576),
          limitMb: Math.round(p.jsHeapSizeLimit / 1048576),
        };
      } catch {
        return null;
      }
    })(),
  };
}

/** Start once per app session — safe to call from AppShell mount. */
export function startFreezeDiagnostics() {
  if (typeof window === 'undefined') return () => {};
  const w = window as Window & { __novaFreezeDiag?: boolean };
  if (w.__novaFreezeDiag) return () => {};
  w.__novaFreezeDiag = true;

  const onError = (e: ErrorEvent) => {
    pushEvent({
      at: new Date().toISOString(),
      kind: 'error',
      detail: `${e.message || 'error'} @ ${e.filename || '?'}:${e.lineno || 0}`,
    });
  };
  const onRej = (e: PromiseRejectionEvent) => {
    const reason = e.reason instanceof Error
      ? e.reason.message
      : String(e.reason || 'rejection');
    pushEvent({
      at: new Date().toISOString(),
      kind: 'rejection',
      detail: reason.slice(0, 400),
    });
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRej);

  let obs: PerformanceObserver | null = null;
  try {
    if (typeof PerformanceObserver !== 'undefined') {
      obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const ms = entry.duration;
          if (ms < 120) continue;
          pushEvent({
            at: new Date().toISOString(),
            kind: 'longtask',
            detail: `${entry.name || 'longtask'} blocked the UI`,
            ms: Math.round(ms),
          });
        }
      });
      obs.observe({ type: 'longtask', buffered: true } as PerformanceObserverInit);
    }
  } catch {
    /* longtask not supported */
  }

  // Heartbeat: if the main thread stalls >2.5s between ticks, record it.
  let last = Date.now();
  const beat = window.setInterval(() => {
    const now = Date.now();
    const gap = now - last;
    last = now;
    if (gap > 2500) {
      pushEvent({
        at: new Date().toISOString(),
        kind: 'heartbeat-stall',
        detail: `Main thread gap ${gap}ms (UI likely froze)`,
        ms: gap,
      });
      try {
        pushBuildDiag({
          kind: 'warn',
          detail: `Main thread freeze ${gap}ms during build/UI`,
          ms: gap,
        });
      } catch { /* ignore */ }
    }
  }, 1000);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRej);
    try { obs?.disconnect(); } catch { /* ignore */ }
    window.clearInterval(beat);
    w.__novaFreezeDiag = false;
  };
}

export function buildFreezeReportText(): string {
  pushEvent({
    at: new Date().toISOString(),
    kind: 'manual',
    detail: 'User copied freeze / build report',
  });
  try {
    pushBuildDiag({ kind: 'manual', detail: 'User copied freeze / build report' });
  } catch { /* ignore */ }
  const extras = snapshotExtras();
  const md = formatBuildReportMarkdown();
  const payload = {
    app: 'NOVA',
    capturedAt: new Date().toISOString(),
    ...extras,
    events: [...ring],
  };
  // Markdown first (easy to paste), then raw JSON for tooling.
  return `${md}\n\n---\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`;
}

export function FreezeReportButton({ collapsed }: { collapsed?: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const onCopy = useCallback(async () => {
    const text = buildFreezeReportText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    try {
      await window.novaDesktop?.localReportsAppend?.({
        kind: 'freeze-report',
        text: text.slice(0, 24000),
      });
    } catch {
      /* optional */
    }
    setCopied(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2200);
  }, []);

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      title="Copy freeze + build diagnostics for debugging"
      aria-label="Copy freeze and build report"
      className={`nova-nav-item w-full ${collapsed ? 'nova-nav-item-rail' : ''}`}
    >
      <span className="nova-nav-icon">
        {copied ? <ClipboardCopy className="text-violet-300" /> : <Bug />}
      </span>
      <span className={`flex-1 text-left nova-nav-label ${collapsed ? 'nova-nav-label-hide' : ''}`}>
        {copied ? 'Copied report' : 'Copy freeze / build report'}
      </span>
    </button>
  );
}
