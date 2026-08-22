import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { AgentTracePayload, AgentTraceStep } from '@/lib/agentTrace';
import { ChatMarkdown } from '@/lib/chatMarkdown';

function stepVerb(kind: AgentTraceStep['kind']): string {
  if (kind === 'read') return 'Read';
  if (kind === 'run') return 'Ran';
  if (kind === 'answer') return 'Answer';
  return '';
}

function ThoughtBlock({
  step,
  startedAt,
  live,
}: {
  step: AgentTraceStep;
  startedAt: number;
  live: boolean;
}) {
  const [open, setOpen] = useState(live);
  const [elapsed, setElapsed] = useState(1);

  useEffect(() => {
    if (!live) {
      setOpen(false);
      return;
    }
    setOpen(true);
    const t0 = startedAt;
    const tick = () => setElapsed(Math.max(1, Math.round((Date.now() - t0) / 1000)));
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [live, startedAt]);

  return (
    <div className="rounded-lg border border-surface-border/60 bg-surface-hover/40 px-2.5 py-2">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 text-left text-[11px] font-medium text-content-secondary"
        onClick={() => setOpen(v => !v)}
      >
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
        <span>{live ? `Thinking… ${elapsed}s` : `Thought for ${elapsed}s`}</span>
      </button>
      {open ? (
        <p className="mt-1.5 pl-5 text-[11px] leading-relaxed text-content-tertiary">{step.label}</p>
      ) : null}
    </div>
  );
}

function ActionLine({ step }: { step: AgentTraceStep }) {
  const verb = stepVerb(step.kind);
  if (!verb) return null;
  return (
    <div className="flex items-start gap-2 pl-1 text-[11px] text-content-tertiary">
      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-content-tertiary/50" aria-hidden />
      <span>
        <span className="text-content-secondary">{verb}</span>
        {' '}
        {step.label}
        {step.detail ? <span className="text-content-tertiary/80">{` · ${step.detail}`}</span> : null}
      </span>
    </div>
  );
}

export function AgentTracePanel({
  payload,
  answer,
  live = false,
}: {
  payload: AgentTracePayload;
  answer?: string;
  live?: boolean;
}) {
  const shownAnswer = (answer || payload.answer || '').trim();
  const actionSteps = useMemo(
    () => payload.steps.filter(s => s.kind !== 'thought'),
    [payload.steps],
  );
  const thought = payload.steps.find(s => s.kind === 'thought');

  return (
    <div className="space-y-2.5">
      {thought ? (
        <ThoughtBlock step={thought} startedAt={payload.startedAt} live={live && !payload.done} />
      ) : null}

      {actionSteps.map(step => {
        if (step.kind === 'plan' || step.kind === 'status') {
          return (
            <p key={step.id} className="text-[12px] font-medium leading-snug text-content-primary">
              {step.label}
            </p>
          );
        }
        if (step.kind === 'run' || step.kind === 'read') {
          return <ActionLine key={step.id} step={step} />;
        }
        return null;
      })}

      {live && !payload.done ? (
        <div className="flex items-center gap-2 pt-0.5 text-[11px] text-content-tertiary">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden />
          <span>Working…</span>
        </div>
      ) : null}

      {shownAnswer ? (
        <div className={`${payload.steps.length ? 'mt-3 border-t border-surface-border/70 pt-3' : ''}`}>
          <ChatMarkdown text={shownAnswer} />
        </div>
      ) : null}
    </div>
  );
}
