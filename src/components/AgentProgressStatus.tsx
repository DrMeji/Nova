/** Live status line inside the assistant bubble (Thinking → Exploring → …). */

import { memo, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  formatStepDurationMs,
  normalizeStatusHistory,
  type ChatTurnStatusStep,
} from '@/lib/chatTurnStatusStore';

const NOISE = /thinking \(step|listed project files|^read src\/|verify passed|checking preview ready|preview ready fail|re-editing the ui|model timed out|step time reached|fix: thinking|build: thinking|almost done: finishing|final pass: checking|premium floor: another|keeping prior app/i;

/** Show the passes that stuck. Collapse retries into one line. */
function compressStatusSteps(steps: ChatTurnStatusStep[]): ChatTurnStatusStep[] {
  const out: ChatTurnStatusStep[] = [];
  let sawFail = false;
  for (const step of steps) {
    const label = step.label.replace(/\*\*/g, '').trim();
    if (!label || /^done$/i.test(label)) continue;
    if (NOISE.test(label)) {
      sawFail = true;
      continue;
    }
    if (sawFail) {
      const redo = 'Redoing this pass — the last one failed';
      const prev = out[out.length - 1];
      if (!prev || prev.label !== redo) out.push({ label: redo, at: step.at });
      sawFail = false;
    }
    const prev = out[out.length - 1];
    if (prev && prev.label === label) {
      prev.at = step.at;
      continue;
    }
    out.push({ label, at: step.at });
  }
  if (sawFail) {
    const redo = 'Redoing this pass — the last one failed';
    const prev = out[out.length - 1];
    if (!prev || prev.label !== redo) out.push({ label: redo, at: steps[steps.length - 1]?.at || Date.now() });
  }
  return out.slice(-8);
}

/** Dots stay mounted — label updates must not remount them or the ripple resets / syncs. */
const StatusDots = memo(function StatusDots() {
  return (
    <span className="nova-status-dots inline-flex items-center gap-1.5 shrink-0" aria-hidden>
      <span className="nova-status-dot nova-status-dot-1" />
      <span className="nova-status-dot nova-status-dot-2" />
      <span className="nova-status-dot nova-status-dot-3" />
    </span>
  );
});

/**
 * Current work line + optional expand of every step this turn.
 * No inner scroll — the chat page scrolls. Current row = purple pulse + live duration.
 */
export function AgentProgressStatus({
  label,
  history = [],
}: {
  label: string;
  /** Work lines (strings or {label,at}) for the expandable list. */
  history?: Array<string | ChatTurnStatusStep>;
}) {
  const shown = (label?.trim() || 'Working…').replace(/\u2014/g, ':').replace(/\*\*/g, '');
  const finished = /^done$/i.test(shown);
  const steps = compressStatusSteps(normalizeStatusHistory(history, shown)
    .filter((s) => s.label && !/^Thinking…?$/i.test(s.label)));
  const displaySteps = steps.length ? steps : [{ label: shown, at: Date.now() }];
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Tick whenever the pill is visible so durations stay accurate (even before expand).
  useEffect(() => {
    if (finished) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [displaySteps.length, finished]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // When newly expanded, bring the whole block into the chat scroll — never an inner scroller.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, [open, displaySteps.length]);

  const canExpand = displaySteps.length > 1;

  return (
    <div ref={rootRef} className="relative min-w-0 max-w-full">
      <button
        type="button"
        className="flex items-center gap-2.5 py-0.5 min-w-0 max-w-full text-left rounded-md hover:bg-white/[0.04] transition-colors"
        aria-live="polite"
        aria-label={shown}
        aria-expanded={open}
        title={canExpand ? 'Show every step Nova worked through' : shown}
        onClick={() => canExpand && setOpen((v) => !v)}
        disabled={!canExpand}
      >
        {finished ? null : <StatusDots />}
        <span className={`min-w-0 flex-1 text-[13px] font-medium tracking-wide break-words [overflow-wrap:anywhere] ${finished ? 'text-content-tertiary' : 'text-content-secondary'}`}>
          {shown}
        </span>
        {canExpand ? (
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 text-content-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
          />
        ) : null}
      </button>
      {open && canExpand ? (
        <ul
          className="mt-1.5 ml-6 space-y-0.5"
          role="list"
        >
          {displaySteps.map((step, i) => {
            const isCurrent = i === displaySteps.length - 1;
            const nextAt = isCurrent ? now : (displaySteps[i + 1]?.at ?? now);
            const durMs = Math.max(0, nextAt - step.at);
            const dur = formatStepDurationMs(durMs);
            return (
              <li
                key={`${i}-${step.label.slice(0, 40)}-${step.at}`}
                role="listitem"
                className={`flex items-start gap-2 text-[12px] leading-snug py-0.5 ${
                  isCurrent
                    ? 'text-white font-medium'
                    : 'text-content-tertiary'
                }`}
              >
                <span className="w-2 shrink-0 flex justify-center pt-1" aria-hidden>
                  {isCurrent && !finished ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                  ) : (
                    <span className="w-1 h-1 rounded-full bg-content-tertiary/50 mt-0.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                  {step.label.replace(/\*\*/g, '')}
                </span>
                <span
                  className={`shrink-0 tabular-nums text-[10px] ${
                    isCurrent && !finished ? 'text-violet-300/90' : 'text-content-tertiary/80'
                  }`}
                  title={isCurrent && !finished ? 'Time on this step so far' : 'Time spent on this step'}
                >
                  {dur}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
