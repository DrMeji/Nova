/**
 * Compact Plan pill in chat — opens the Plan overlay (same pattern as Code pill).
 */

import { Map } from 'lucide-react';
import { countPlanSteps, type PlanReport } from '@/lib/planReport';
import { requestOpenChatPlan } from '@/lib/openChatPlan';

export function PlanOpenPill({
  title,
  stepCount,
  report,
  chatId,
}: {
  title: string;
  stepCount: number;
  /** When provided, sync into the active plan store before opening. */
  report?: PlanReport | null;
  chatId?: string | null;
}) {
  const open = () => {
    try {
      requestOpenChatPlan({
        chatId: String(chatId || '').trim() || undefined,
        openOverlay: true,
        live: false,
        report: report?.steps?.length ? report : undefined,
      });
    } catch { /* ignore */ }
  };

  const steps = stepCount > 0
    ? stepCount
    : (report ? countPlanSteps(report) : 0);

  return (
    <button
      type="button"
      onClick={open}
      data-nova-plan-pill="1"
      className="group inline-flex items-center gap-2 max-w-full rounded-full border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-left hover:bg-sky-500/25 transition-colors"
      title="Open Plan — full map in a secondary screen"
      aria-label={`Open Plan: ${title}`}
    >
      <Map className="w-3.5 h-3.5 shrink-0 text-sky-300" aria-hidden />
      <span className="inline-flex items-center gap-1.5 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-100/90">
        Plan
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-sky-50">
        {title}
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-sky-200/70">
        {steps} {steps === 1 ? 'step' : 'steps'}
      </span>
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-sky-300/80 group-hover:text-sky-200">
        Open
      </span>
    </button>
  );
}
