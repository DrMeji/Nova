/** Live status line inside the assistant bubble (Thinking → Exploring → …). */

import { memo, useEffect, useRef, useState } from 'react';
import { ChevronDown, Globe } from 'lucide-react';
import {
  formatStepDurationMs,
  normalizeStatusHistory,
  type ChatTurnStatusStep,
} from '@/lib/chatTurnStatusStore';

const NOISE = /thinking \(step|listed project files|^read src\/|verify passed|checking preview ready|preview ready fail|re-editing the ui|model timed out|step time reached|fix: thinking|build: thinking|almost done: finishing|final pass: checking|premium floor: another|keeping prior app/i;

function looksLikeWebSearchStatus(label: string): boolean {
  // Globe only for real web / deep-search work — never for "Reading your message".
  return /\bsearch(?:ing)?\s+(?:the\s+)?web\b|\breading\s+(?:results|layout\s+references|sources?)\b|\blayout\s+references\b|\bfinding\s+relevant\s+sources\b|\bcomparing\s+sources\b|\bverifying\s+candidate\b|\blooking\s+for\s+images\b|\bplanning\s+searches\b|\bweb\s+lookup\b|\bdeep\s+research\b/i.test(
    String(label || ''),
  );
}

/** Show the passes that stuck. Drop noisy thinking/timeout lines — never invent a fake "redo" step. */
function compressStatusSteps(steps: ChatTurnStatusStep[]): ChatTurnStatusStep[] {
  const out: ChatTurnStatusStep[] = [];
  let clinicHeavy = false;
  for (const step of steps) {
    const label = step.label.replace(/\*\*/g, '').trim();
    if (!label || /^done$/i.test(label)) continue;
    if (NOISE.test(label)) continue;
    // Clinic: drop micro inventory/static ticks — keep pass headers, deep file reads, outcomes.
    if (/^Pass 1 · Inventory · (?:listing|starting)/i.test(label)) continue;
    if (/^Pass 1 · note ·/i.test(label)) continue;
    if (/^Static · /i.test(label)) continue;
    if (/^Pass 2 · Assets ·/i.test(label)) continue;
    if (/^Pass 2 · Static scan ·/i.test(label)) continue;
    if (/^Deep review · batch \d+ skipped/i.test(label)) continue;
    if (/^Deep review · (?:asking|reading files)/i.test(label)) continue;
    if (/^(?:Debug clinic|Pass [123]|Deep ·|Deep review|Clinic ready|Verify ·|Triage ·|Plan ·|Agent ·|Multi-agent ·)/i.test(label)) {
      clinicHeavy = true;
    }
    const prev = out[out.length - 1];
    // Coalesce npm progress beats into one live row (clock updates, list stays readable).
    const npmBeat = /^(?:npm (?:downloading|still unpacking)|Installing npm packages|Still installing npm)/i;
    if (prev && npmBeat.test(prev.label) && npmBeat.test(label)) {
      prev.label = label;
      prev.at = step.at;
      continue;
    }
    // Coalesce rapid "Reading path" / Deep · file ticks into the latest while keeping pass headers.
    if (
      prev
      && /^Reading /i.test(prev.label)
      && /^Reading /i.test(label)
    ) {
      prev.label = label;
      prev.at = step.at;
      continue;
    }
    // Clinic deep / model counters: one live row that updates in place (N/M · left · file).
    const deepRead = /^Deep · reading \d+\/\d+/i;
    const deepModel = /^Deep · model(?:\s+\d+\/\d+|\s+·)/i;
    if (prev && deepRead.test(prev.label) && deepRead.test(label)) {
      prev.label = label;
      prev.at = step.at;
      continue;
    }
    if (prev && deepModel.test(prev.label) && deepModel.test(label)) {
      prev.label = label;
      prev.at = step.at;
      continue;
    }
    if (
      prev
      && /^Deep · /i.test(prev.label)
      && /^Deep · /i.test(label)
      && !/finding|clean|skipped|slow|complete|unavailable|wrapped/i.test(label)
      && !deepRead.test(label)
      && !deepModel.test(label)
    ) {
      prev.label = label;
      prev.at = step.at;
      continue;
    }
    if (prev && prev.label === label) {
      prev.at = step.at;
      continue;
    }
    out.push({ label, at: step.at });
  }
  // Debug clinic needs a longer trail so the dropdown shows inventory → static → deep.
  return out.slice(clinicHeavy ? -24 : -8);
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
  const rawLabel = (label?.trim() || 'Working…').replace(/\u2014/g, ':').replace(/\*\*/g, '');
  const finished = /^done$/i.test(rawLabel);
  const steps = compressStatusSteps(normalizeStatusHistory(history, rawLabel)
    .filter((s) => s.label && !/^Thinking…?$/i.test(s.label)));
  const displaySteps = steps.length ? steps : [{ label: rawLabel, at: Date.now() }];
  // Collapsed line always mirrors the latest live step (clinic counters, pass names, verify…).
  const latestStep = displaySteps[displaySteps.length - 1]?.label || rawLabel;
  const shown = finished ? rawLabel : latestStep;
  const webSearch = looksLikeWebSearchStatus(shown);
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

  const canExpand = displaySteps.length > 1
    || /debug clinic|pass [123]|deep review|deep ·|verify ·|static ·|triage|clinic ready|^plan ·|^agent ·|^multi-agent ·|^reading /i.test(shown)
    || displaySteps.some((s) => /debug clinic|pass [123]|deep review|deep ·|verify ·|static ·|triage|^plan ·|^agent ·|^multi-agent ·|^reading /i.test(s.label));

  return (
    <div ref={rootRef} className="relative w-full min-w-0 max-w-full overflow-hidden">
      <button
        type="button"
        className="flex w-full min-w-0 max-w-full items-center gap-2.5 py-0.5 text-left rounded-md hover:bg-white/[0.04] transition-colors disabled:opacity-100"
        aria-live="polite"
        aria-label={shown}
        aria-expanded={open}
        title={canExpand ? 'Show every step Nova worked through' : shown}
        onClick={() => {
          if (!canExpand) return;
          setOpen((v) => !v);
        }}
      >
        {finished ? null : webSearch ? (
          <Globe className="w-3.5 h-3.5 shrink-0 text-content-tertiary" aria-hidden />
        ) : (
          <StatusDots />
        )}
        <span className={`min-w-0 flex-1 text-sm font-medium tracking-wide break-words [overflow-wrap:anywhere] ${finished ? 'text-content-tertiary' : 'text-content-secondary'}`}>
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
          className="mt-1.5 ml-6 w-[calc(100%-1.5rem)] max-w-full space-y-0.5"
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
                className={`grid grid-cols-[0.5rem_minmax(0,1fr)_3.75rem] items-start gap-x-2 text-[12px] leading-snug py-0.5 ${
                  isCurrent
                    ? 'text-white font-medium'
                    : 'text-content-tertiary'
                }`}
              >
                <span className="flex justify-center pt-1" aria-hidden>
                  {isCurrent && !finished ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                  ) : (
                    <span className="w-1 h-1 rounded-full bg-content-tertiary/50 mt-0.5" />
                  )}
                </span>
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                  {step.label.replace(/\*\*/g, '')}
                </span>
                <span
                  className={`text-right tabular-nums text-[10px] whitespace-nowrap ${
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
