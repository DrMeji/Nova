/**
 * Single write → verify → outcome path for Chat / Workspace / create surgical.
 */
import { applyChatReplyEdits } from '@/lib/chatAgentApply';
import { editMiss, editSuccess, type EditMiss, type EditSuccess } from '@/lib/productContract';
import { verifyAsk } from '@/lib/verifyAsk';
import { verifyMicroAskApplied } from '@/lib/webProjectCanon';

export type ApplyAndVerifyOpts = {
  reply: string;
  projectId: string | null;
  projectName: string;
  files: Record<string, string>;
  userMessage: string;
  diskRoot: string | null;
  /** When true, use verifyAsk; else verifyMicroAskApplied. */
  fullVerify?: boolean;
};

export type ApplyAndVerifyResult =
  | { ok: true; outcome: EditSuccess; files: Record<string, string>; updated: string[] }
  | { ok: false; outcome: EditMiss; files: Record<string, string>; updated: string[] };

export async function applyAndVerify(opts: ApplyAndVerifyOpts): Promise<ApplyAndVerifyResult> {
  const snapshot = { ...opts.files };
  const applied = await applyChatReplyEdits({
    reply: opts.reply,
    projectId: opts.projectId,
    projectName: opts.projectName,
    files: opts.files,
    userMessage: opts.userMessage,
    diskRoot: opts.diskRoot,
  });

  if (!applied.ok || !applied.updated.length) {
    return {
      ok: false,
      outcome: editMiss('write_failed', applied.error || 'Could not write that edit.'),
      files: applied.files || opts.files,
      updated: applied.updated || [],
    };
  }

  const check = opts.fullVerify !== false
    ? verifyAsk(opts.userMessage, applied.files)
    : (() => {
      const m = verifyMicroAskApplied(opts.userMessage, applied.files);
      return { ok: m.ok, missing: m.missing || [] };
    })();

  if (!check.ok) {
    const revertBlocks = applied.updated
      .filter((p) => snapshot[p] != null)
      .map((p) => `@@@FILE ${p}\n${snapshot[p]}`)
      .join('\n');
    if (revertBlocks) {
      await applyChatReplyEdits({
        reply: revertBlocks,
        projectId: opts.projectId,
        projectName: opts.projectName,
        files: snapshot,
        userMessage: opts.userMessage,
        diskRoot: opts.diskRoot,
      });
    }
    return {
      ok: false,
      outcome: editMiss(
        'verify_failed',
        [
          'I didn’t keep that edit — it didn’t match your ask.',
          check.missing?.length ? `Missing: ${check.missing.join(', ')}.` : '',
        ].filter(Boolean).join(' '),
      ),
      files: snapshot,
      updated: [],
    };
  }

  return {
    ok: true,
    outcome: editSuccess(applied.updated, true),
    files: applied.files,
    updated: applied.updated,
  };
}
