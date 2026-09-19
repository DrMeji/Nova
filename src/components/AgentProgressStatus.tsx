/** Live status line inside the assistant bubble (Thinking → Exploring → …). */

import { memo, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** Dots stay mounted — label updates must not remount them or the ripple resets / syncs. */
const StatusDots = memo(function StatusDots() {
  return (
    <span className="ark-status-dots inline-flex items-center gap-1.5 shrink-0" aria-hidden>
      <span className="ark-status-dot ark-status-dot-1" />
      <span className="ark-status-dot ark-status-dot-2" />
      <span className="ark-status-dot ark-status-dot-3" />
    </span>
  );
});

/**
 * Current work line + optional downward expand of recent steps.
 * No portal, no bordered “card” — just the pill line opening a plain list below.
 */
export function AgentProgressStatus({
  label,
  history = [],
}: {
  label: string;
  /** Recent work lines for the expandable list. */
  history?: string[];
}) {
  const shown = (label?.trim() || 'Working…').replace(/\u2014/g, ':');
  const steps = (history.length ? history : [shown])
    .map((s) => String(s || '').trim().replace(/\u2014/g, ':'))
    .filter(Boolean)
    .filter((s) => !/^Thinking…?$/i.test(s));
  const displaySteps = steps.length ? steps : [shown];
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const currentRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Always land on the step Nova is working on (newest), not the top of the list.
  useEffect(() => {
    if (!open) return;
    const scrollToCurrent = () => {
      const current = currentRef.current;
      const list = listRef.current;
      if (current) {
        current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if (list) {
        list.scrollTop = list.scrollHeight;
      }
    };
    requestAnimationFrame(scrollToCurrent);
  }, [open, displaySteps.length, shown]);

  const canExpand = displaySteps.length > 1;

  return (
    <div ref={rootRef} className="relative min-w-0 max-w-full">
      <button
        type="button"
        className="flex items-center gap-2.5 py-0.5 min-w-0 max-w-full text-left rounded-md hover:bg-white/[0.04] transition-colors"
        aria-live="polite"
        aria-label={shown}
        aria-expanded={open}
        title={canExpand ? 'Show steps Nova is working through' : shown}
        onClick={() => canExpand && setOpen((v) => !v)}
        disabled={!canExpand}
      >
        <StatusDots />
        <span className="min-w-0 flex-1 text-[13px] font-medium text-content-secondary tracking-wide break-words [overflow-wrap:anywhere]">
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
          ref={listRef}
          className="mt-1.5 ml-6 space-y-1 max-h-48 overflow-y-auto scroll-smooth"
          role="list"
        >
          {displaySteps.map((step, i) => {
            const isCurrent = i === displaySteps.length - 1;
            return (
              <li
                key={`${i}-${step.slice(0, 40)}`}
                ref={isCurrent ? currentRef : undefined}
                role="listitem"
                className={`text-[12px] leading-snug rounded-md px-1.5 py-0.5 ${
                  isCurrent
                    ? 'text-content-primary font-medium bg-white/[0.06] ring-1 ring-white/10'
                    : 'text-content-tertiary'
                }`}
              >
                {isCurrent ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse" aria-hidden />
                    {step}
                  </span>
                ) : (
                  step
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
