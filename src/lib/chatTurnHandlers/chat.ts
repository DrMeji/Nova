/**
 * Chat turn — Q&A / inspect. Only place besides edit.ts that may call answerStudio.
 */

import { answerStudio } from '@/lib/studioAnswerEngine';
import { chatSuccess, type ChatSuccess } from '@/lib/productContract';

export type ChatTurnHost = {
  content: string;
  files: Record<string, string>;
  projectName?: string;
  mode: 'chat' | 'code';
  allowFileEdits: boolean;
  preferredModelId?: string | null;
  preferredModelName?: string | null;
  preferredSource?: string | null;
  stickyModelId?: string | null;
  stickyModelName?: string | null;
  stickyPinnedSource?: string | null;
  planOnly?: boolean;
  shouldAbort: () => boolean;
  onDelta?: (live: string) => void;
  timeoutMs?: number;
};

export type ChatTurnResult = {
  status: 'handled';
  text: string;
  intent?: unknown;
  findings?: unknown;
  packedTokens?: number;
  contract: ChatSuccess;
};

/** Cap enrich at 120s, micro/chat at 45s. */
export async function runChatTurn(host: ChatTurnHost): Promise<ChatTurnResult> {
  const started = Date.now();
  const cap = host.timeoutMs ?? (host.allowFileEdits ? 120_000 : 45_000);
  const result = await answerStudio(
    {
      userMessage: host.content,
      files: host.files,
      projectName: host.projectName,
      mode: host.mode,
      preferredModelId: host.preferredModelId || undefined,
      preferredModelName: host.preferredModelName || undefined,
      preferredSource: host.preferredSource as 'local' | 'cloud' | 'auto' | undefined,
      stickyModelId: host.stickyModelId || undefined,
      stickyModelName: host.stickyModelName || undefined,
      stickyPinnedSource: host.stickyPinnedSource as 'local' | 'cloud' | undefined,
      planOnly: host.planOnly,
      allowFileEdits: host.allowFileEdits,
      shouldAbort: () => host.shouldAbort() || Date.now() - started > cap,
    },
    host.onDelta,
  );
  const text = String(result.text || '').trim() || 'I could not answer that.';
  return {
    status: 'handled',
    text,
    intent: result.intent,
    findings: result.findings,
    packedTokens: result.packedTokens,
    contract: chatSuccess(text),
  };
}
