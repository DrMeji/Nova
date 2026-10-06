/**
 * Plan-only turns — synced Plan store + prose reply (Plan pill opens the map).
 */

import {
  runPlanMode,
  formatPlanChatReply,
  findLatestPlanReport,
  serializePlanReportForCreate,
  planReportToPlanLog,
} from '@/lib/planReport';
import { saveChatPlan, setChatPlanPill } from '@/lib/chatPlanStore';
import { requestOpenChatPlan } from '@/lib/openChatPlan';

export type PlanTurnHost = {
  userMessage: string;
  name?: string | null;
  summary?: string | null;
  preferredModelId?: string | null;
  chatId?: string | null;
  messages?: Array<{ role?: string; content?: string } | null | undefined>;
  /** Always persist a buildable brief when provided. */
  savePlanBrief?: (brief: { name: string; summary: string; planLog?: string[] }) => void;
  finishPlainReply: (text: string, provider?: string) => Promise<void> | void;
  onProgress?: (msg: string) => void;
};

/** @deprecated Use runPlanTurn — kept for any leftover sync callers. */
export function handlePlanTurnReply(opts: {
  name?: string | null;
  summary?: string | null;
  savePlanBrief?: (brief: { name: string; summary: string }) => void;
}): string {
  const title = String(opts.name || 'your idea').trim() || 'your idea';
  const brief = String(opts.summary || '').trim();
  opts.savePlanBrief?.({ name: title, summary: brief });
  return [
    `Got it — **${title}**. Press **+** → **Plan** for a deeper outline, or say **lets build this** when you want files on disk.`,
  ].join('\n');
}

export async function runPlanTurn(host: PlanTurnHost): Promise<void> {
  const ask = String(host.userMessage || host.summary || '').trim();
  const chatId = String(host.chatId || '').trim();
  const prior = findLatestPlanReport(host.messages || [], chatId || null);
  const projectName = String(host.name || prior?.title || 'your idea').trim() || 'your idea';
  if (chatId) {
    try {
      setChatPlanPill(chatId, true);
      requestOpenChatPlan({ chatId, openOverlay: true, live: true });
    } catch { /* ignore */ }
  }
  const report = await runPlanMode({
    userMessage: ask || `Plan ${projectName}`,
    projectName,
    preferredModelId: host.preferredModelId ?? undefined,
    priorPlan: prior,
    onProgress: host.onProgress,
  });
  if (chatId) {
    try {
      saveChatPlan(chatId, report);
      setChatPlanPill(chatId, true);
      requestOpenChatPlan({ chatId, openOverlay: true, live: false });
    } catch { /* ignore */ }
  }
  host.savePlanBrief?.({
    name: report.title || projectName,
    summary: serializePlanReportForCreate(report),
    planLog: planReportToPlanLog(report),
  });
  await host.finishPlainReply(
    [
      formatPlanChatReply(report, { refining: Boolean(prior?.steps?.length) }),
      '',
      'When you confirm build, Nova runs the Create Runtime Loop: craft → install → Live evidence (mount + console + smoke) → verified. Plan itself is never “done.”',
    ].filter(Boolean).join('\n'),
    'NOVA · Plan',
  );
}
