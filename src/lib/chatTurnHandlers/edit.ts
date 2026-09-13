/**
 * Edit-path: surgical first; skip weak-brain coding hops; apply as transaction.
 */

import { applyChatReplyEdits } from '@/lib/chatAgentApply';
import { finalizeCodingChatBubble } from '@/lib/chatCodeReply';

export function shouldSkipWeakModelCodingHop(opts: {
  userMessage: string;
  modelId?: string | null;
  modelName?: string | null;
  surgicalMissed: boolean;
}): boolean {
  if (!opts.surgicalMissed) return false;
  const label = `${opts.modelId || ''} ${opts.modelName || ''}`;
  const weak = /1\.5b|0\.5b|0\.6b|tiny|qwen2\.5-1\.5/i.test(label);
  const micro = /\b(?:title|heading|h1|center|footer|color|background|button|text|label|copy)\b/i.test(
    opts.userMessage,
  ) || /\b(?:add|put|place|change|update|make|set)\b/i.test(opts.userMessage);
  return weak && micro;
}

export function isWeakCoderModel(modelId?: string | null, modelName?: string | null): boolean {
  return /1\.5b|0\.5b|0\.6b|tiny|qwen2\.5-1\.5/i.test(`${modelId || ''} ${modelName || ''}`);
}

export function weakModelMicroEditReply(userMessage: string): string {
  return [
    'I couldn’t apply that with a local surgical patch, and the active local model is too small for a reliable code edit.',
    '',
    `Ask: “${String(userMessage || '').trim().slice(0, 160)}”`,
    '',
    'Install a larger coding GGUF in **Models**, or try a clearer one-line ask (e.g. **put the title in the center**).',
  ].join('\n');
}

export type SurgicalEditHost = {
  content: string;
  editUserMessage: string;
  projectId: string | null;
  projectLabel: string;
  diskRoot: string | null;
  files: Record<string, string>;
  replyStartedAt: number;
  visionHopMeta?: string | null;
  pushStatus: (label: string) => void;
  onApplied: (opts: {
    files: Record<string, string>;
    updated: string[];
    reply: string;
    provider: string;
    elapsedMs: number;
  }) => void;
  onFailed: (opts: { reply: string; elapsedMs: number }) => void;
  countLineDiff: (before: string, after: string) => { added: number; removed: number };
  buildStudioTraceMessage: (opts: {
    startedAt: number;
    elapsedMs: number;
    userMessage: string;
    answer: string;
    wrotePaths: string[];
    fileChanges?: { path: string; added: number; removed: number }[];
    projectName: string;
  }) => string;
};

export type SurgicalEditResult =
  | { status: 'applied' }
  | { status: 'miss' }
  | { status: 'failed' };

/**
 * Deterministic UI patch owner. Returns miss when surgical has nothing useful.
 */
export async function runSurgicalEditTurn(host: SurgicalEditHost): Promise<SurgicalEditResult> {
  const { finalizeWebEdits, isStructuralUiPieceAsk, verifyMicroAskApplied } = await import('@/lib/webProjectCanon');
  const structuralPiece = isStructuralUiPieceAsk(host.editUserMessage);
  const micro = finalizeWebEdits(host.files, host.editUserMessage, [], { projectName: host.projectLabel });
  if (
    structuralPiece
    || !(
      micro.length
      || /\b(?:change|rename|set|make|update|add|remove|fix|delete|drop)\b/i.test(host.editUserMessage)
    )
  ) {
    return { status: 'miss' };
  }

  const snapshot = { ...host.files };
  host.pushStatus('Updating project files…');
  const applied = await applyChatReplyEdits({
    reply: '',
    projectId: host.projectId,
    projectName: host.projectLabel,
    files: host.files,
    userMessage: host.editUserMessage,
    diskRoot: host.diskRoot,
  });
  const elapsedMs = Date.now() - host.replyStartedAt;

  if (applied.ok && applied.updated.length) {
    const verified = verifyMicroAskApplied(host.editUserMessage, applied.files);
    if (!verified.ok) {
      const appNow = `${applied.files['src/App.jsx'] || ''}\n${applied.files['src/App.tsx'] || ''}`;
      const softKeep = /center-word/i.test(appNow)
        || verified.missing.every((m) => {
          const core = String(m || '').split(/\s+/).filter((w) => w.length > 2);
          return core.some((w) => new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(appNow));
        });
      if (!softKeep) {
        // Explicit rollback to snapshot
        const revertBlocks = applied.updated
          .filter((p) => snapshot[p] != null)
          .map((p) => `@@@FILE ${p}\n${snapshot[p]}`)
          .join('\n');
        if (revertBlocks) {
          await applyChatReplyEdits({
            reply: revertBlocks,
            projectId: host.projectId,
            projectName: host.projectLabel,
            files: snapshot,
            userMessage: host.editUserMessage,
            diskRoot: host.diskRoot,
          });
        }
        return { status: 'miss' };
      }
    }

    const answer = finalizeCodingChatBubble({
      userMessage: host.content,
      rawReply: '',
      changedPaths: applied.updated,
      applied: true,
    });
    const patchFileChanges = applied.updated.map((path) => {
      const diff = host.countLineDiff(
        String(snapshot[path] || ''),
        String(applied.files?.[path] || ''),
      );
      return { path, added: diff.added, removed: diff.removed };
    });
    const reply = host.buildStudioTraceMessage({
      startedAt: host.replyStartedAt,
      elapsedMs,
      userMessage: host.content,
      answer,
      wrotePaths: applied.updated,
      fileChanges: patchFileChanges,
      projectName: host.projectLabel,
    });
    host.onApplied({
      files: applied.files,
      updated: applied.updated,
      reply,
      provider: host.visionHopMeta ? 'NOVA · vision → patch' : 'NOVA · local patch',
      elapsedMs,
    });
    return { status: 'applied' };
  }

  if (micro.length) {
    const failAnswer = finalizeCodingChatBubble({
      userMessage: host.content,
      rawReply: '',
      applyError: applied.error || 'write_failed',
      editMode: true,
    });
    const failReply = host.buildStudioTraceMessage({
      startedAt: host.replyStartedAt,
      elapsedMs,
      userMessage: host.content,
      answer: failAnswer || applied.reply || 'Could not save that UI change to disk.',
      wrotePaths: [],
      projectName: host.projectLabel,
    });
    host.onFailed({ reply: failReply, elapsedMs });
    return { status: 'failed' };
  }

  return { status: 'miss' };
}
