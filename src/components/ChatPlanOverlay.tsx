/**
 * In-chat Plan overlay — one Plan screen (map lives here; no nested Plan card).
 */

import { useEffect, useState } from 'react';
import { Map, X } from 'lucide-react';
import { PlanReport } from '@/components/PlanReport';
import type { PlanReport as PlanReportData } from '@/lib/planReport';
import { countPlanSteps } from '@/lib/planReport';
import { loadChatPlan, subscribeChatPlan } from '@/lib/chatPlanStore';

export function ChatPlanOverlay({
  open,
  onClose,
  chatId,
  live = false,
  liveLabel,
}: {
  open: boolean;
  onClose: () => void;
  chatId: string | null;
  live?: boolean;
  liveLabel?: string | null;
}) {
  const [report, setReport] = useState<PlanReportData | null>(() => loadChatPlan(chatId));

  // Always listen — open events can fire before the dialog mounts with open=true.
  useEffect(() => {
    const onOpen = (ev: Event) => {
      const detail = (ev as CustomEvent<{ report?: PlanReportData; chatId?: string }>).detail || {};
      if (detail.report?.steps?.length) {
        setReport(detail.report);
        return;
      }
      const id = String(detail.chatId || chatId || '').trim();
      if (id) {
        const loaded = loadChatPlan(id);
        if (loaded?.steps?.length) setReport(loaded);
      }
    };
    window.addEventListener('NOVA:open-plan-overlay', onOpen);
    return () => window.removeEventListener('NOVA:open-plan-overlay', onOpen);
  }, [chatId]);

  useEffect(() => {
    if (!open) return;
    const loaded = loadChatPlan(chatId);
    if (loaded?.steps?.length) setReport(loaded);
    if (!chatId) return;
    return subscribeChatPlan(chatId, () => {
      const next = loadChatPlan(chatId);
      if (next?.steps?.length) setReport(next);
    });
  }, [open, chatId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const stepCount = report ? countPlanSteps(report) : 0;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-stretch justify-center bg-black/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Plan mode"
      onClick={onClose}
    >
      <div
        className="relative m-3 sm:m-6 w-full max-w-5xl max-h-[min(92vh,920px)] flex flex-col rounded-2xl border border-white/[0.1] bg-[#0c0c0e] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2.5 px-4 sm:px-5 py-3 border-b border-white/[0.06] bg-[#101012]/95 shrink-0">
          <span className="inline-flex items-center gap-1.5 shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300 bg-white/[0.08] border border-white/10 rounded-md px-2 py-1">
            <Map className="w-3 h-3 text-content-tertiary" aria-hidden />
            Plan
          </span>
          <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-zinc-100 tracking-tight">
            {report?.title || 'Build plan'}
          </h2>
          {stepCount > 0 ? (
            <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">
              {stepCount} {stepCount === 1 ? 'step' : 'steps'}
            </span>
          ) : null}
          {live ? (
            <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/15 px-2.5 py-1 text-[11px] font-medium text-sky-100">
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inset-0 rounded-full bg-sky-300/50 animate-ping" />
                <span className="relative h-2 w-2 rounded-full bg-sky-300" />
              </span>
              {liveLabel?.trim() || 'Planning live…'}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-content-tertiary hover:text-content-primary hover:bg-white/[0.06] transition-colors"
            aria-label="Close plan"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {report?.steps?.length ? (
            <PlanReport report={report} hideSummary={false} variant="overlay" />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              {live ? (
                <>
                  <span className="relative flex h-3 w-3" aria-hidden>
                    <span className="absolute inset-0 rounded-full bg-sky-300/40 animate-ping" />
                    <span className="relative h-3 w-3 rounded-full bg-sky-300" />
                  </span>
                  <p className="text-[14px] text-zinc-200 font-medium">Drafting your plan map…</p>
                  <p className="text-[12px] text-zinc-500 max-w-sm leading-relaxed">
                    Steps will land here as NOVA shapes the outline. Keep this panel open to watch live.
                  </p>
                </>
              ) : (
                <>
                  <Map className="w-8 h-8 text-zinc-600" aria-hidden />
                  <p className="text-[14px] text-zinc-300">No plan yet for this chat.</p>
                  <p className="text-[12px] text-zinc-500 max-w-sm">
                    Ask NOVA to plan something out, then open this panel anytime from the Plan pill.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
