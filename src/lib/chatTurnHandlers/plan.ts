/**
 * Plan-only turns — deep Plan card (same path as + → Plan).
 * Never the old “I’ve saved a plan” stub.
 */

import {
  runPlanMode,
  formatPlanReportMessage,
  findLatestPlanReport,
  serializePlanReportForCreate,
  planReportToPlanLog,
} from '@/lib/planReport';

export type PlanTurnHost = {
  userMessage: string;
  name?: string | null;
  summary?: string | null;
  preferredModelId?: string | null;
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
  const prior = findLatestPlanReport(host.messages || []);
  const projectName = String(host.name || prior?.title || 'your idea').trim() || 'your idea';
  const report = await runPlanMode({
    userMessage: ask || `Plan ${projectName}`,
    projectName,
    preferredModelId: host.preferredModelId ?? undefined,
    priorPlan: prior,
    onProgress: host.onProgress,
  });
  host.savePlanBrief?.({
    name: report.title || projectName,
    summary: serializePlanReportForCreate(report),
    planLog: planReportToPlanLog(report),
  });
  await host.finishPlainReply(formatPlanReportMessage(report), 'NOVA · Plan');
}
