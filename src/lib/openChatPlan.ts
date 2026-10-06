/** Request the in-chat Plan pill overlay (same map UI as Plan mode). */

import type { PlanReport } from '@/lib/planReport';

export type OpenChatPlanDetail = {
  chatId?: string;
  /** When false, only refresh the stored plan — do not open the overlay. */
  openOverlay?: boolean;
  /** Show live drafting state in the overlay. */
  live?: boolean;
  /** Hydrate / replace the stored plan for this chat (e.g. legacy plan cards). */
  report?: PlanReport;
};

export const OPEN_CHAT_PLAN_EVENT = 'NOVA:open-plan-overlay';
export const CLOSE_CHAT_PLAN_EVENT = 'NOVA:close-plan-overlay';

export function requestOpenChatPlan(detail?: OpenChatPlanDetail): void {
  try {
    window.dispatchEvent(new CustomEvent(OPEN_CHAT_PLAN_EVENT, { detail: detail || {} }));
  } catch { /* ignore */ }
}

export function requestCloseChatPlan(): void {
  try {
    window.dispatchEvent(new CustomEvent(CLOSE_CHAT_PLAN_EVENT));
  } catch { /* ignore */ }
}
