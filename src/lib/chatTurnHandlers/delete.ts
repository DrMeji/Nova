/**
 * Delete turn owner — file / folder delete prompts and replies.
 */

import { handleDeleteFileChatRequest } from '@/lib/chatDiskOps';
import {
  handleDeleteProjectChatRequest,
  looksLikeDeleteFolderAsk,
} from '@/lib/deleteProjectFlow';
import {
  shouldRouteDeleteToStickyFile,
  type DiskIntent,
} from '@/lib/chatDiskIntent';
import type { LastListedFolder } from '@/lib/chatStudioStore';

function deletePrepareErrorReply(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err || 'unknown error');
  return `Could not prepare that delete.\n\n${msg}`;
}

export type DeleteTurnHost = {
  content: string;
  chatId: string;
  mode: string;
  assistantId: string;
  mySeq: number;
  replyStartedAt: number;
  diskIntent: DiskIntent;
  diskRoot: string | null;
  diskProjectId: string | null;
  diskWorkspaceName: string | null;
  stickyDiskTarget: { path?: string; name?: string; kind?: string } | null;
  workspaceFiles: Record<string, string>;
  messages: { role: string; content?: string | null }[];
  finishPlainReply: (text: string) => Promise<void>;
  getLastListedFolder: (chatId: string) => LastListedFolder | null;
  setLastDiskTarget: (chatId: string, t: { path: string; name: string; kind: 'folder' }) => void;
  setDeleteFilePrompt: (p: { fileName: string; filePath: string } | null) => void;
  setDeleteProjectPrompt: (p: { projectName: string; folderPath: string } | null) => void;
  setDeleteFolderClarifyPrompt: (p: { folderName: string; folderPath: string } | null) => void;
  pendingFileDeleteRef: { current: unknown };
  pendingProjectDeleteRef: { current: unknown };
  pendingFolderClarifyRef: { current: unknown };
  relPathFromDisk: (filePath: string) => string | null;
};

export type DeleteTurnResult = { status: 'handled' } | { status: 'miss' };

export async function runDeleteTurn(host: DeleteTurnHost): Promise<DeleteTurnResult> {
  const sticky = host.stickyDiskTarget;

  if (host.diskIntent.type === 'delete_file' || shouldRouteDeleteToStickyFile(host.content, sticky as never)) {
    try {
      const deleteFileName = host.diskIntent.type === 'delete_file'
        ? host.diskIntent.name
        : (sticky?.name ?? null);
      const deleteParentHint = host.diskIntent.type === 'delete_file'
        ? host.diskIntent.parentHint
        : undefined;
      const outcome = await handleDeleteFileChatRequest({
        fileName: deleteFileName,
        parentHint: deleteParentHint,
        workspaceDiskRoot: host.diskRoot,
        workspaceProjectId: host.diskProjectId,
        workspaceFiles: host.workspaceFiles,
        stickyTarget: sticky as never,
        lastListedFolder: host.getLastListedFolder(host.chatId),
      });

      if (outcome.kind === 'reply') {
        await host.finishPlainReply(outcome.text);
        return { status: 'handled' };
      }
      if (outcome.kind === 'folder_mismatch') {
        host.pendingFolderClarifyRef.current = {
          assistantId: host.assistantId,
          chatId: host.chatId,
          mode: host.mode,
          replyStartedAt: host.replyStartedAt,
          folderPath: outcome.folderPath,
          folderName: outcome.folderName,
          projectId: outcome.projectId,
          mySeq: host.mySeq,
        };
        host.setDeleteFolderClarifyPrompt({
          folderName: outcome.folderName,
          folderPath: outcome.folderPath,
        });
        await host.finishPlainReply(
          `**${outcome.folderName}** is a folder at \`${outcome.folderPath}\`, not a single file.\n\n`
          + 'Confirm in the dialog if you want to delete the **entire project folder**.',
        );
        return { status: 'handled' };
      }
      if (outcome.kind === 'prompt') {
        const relPath = host.relPathFromDisk(outcome.filePath)
          || Object.keys(host.workspaceFiles).find(k => k.endsWith(outcome.fileName))
          || null;
        host.pendingFileDeleteRef.current = {
          assistantId: host.assistantId,
          chatId: host.chatId,
          mode: host.mode,
          replyStartedAt: host.replyStartedAt,
          filePath: outcome.filePath,
          fileName: outcome.fileName,
          projectId: outcome.projectId,
          relPath,
          mySeq: host.mySeq,
        };
        host.setDeleteFilePrompt({
          fileName: outcome.fileName,
          filePath: outcome.filePath,
        });
        await host.finishPlainReply(
          `Ready to delete **${outcome.fileName}**.\n\nConfirm in the dialog. this removes only that file:\n\`${outcome.filePath}\``,
        );
        return { status: 'handled' };
      }
    } catch (err) {
      await host.finishPlainReply(deletePrepareErrorReply(err));
      return { status: 'handled' };
    }
  }

  if (
    (host.diskIntent.type === 'delete_project' || looksLikeDeleteFolderAsk(host.content))
    && !shouldRouteDeleteToStickyFile(host.content, sticky as never)
  ) {
    try {
      const outcome = await handleDeleteProjectChatRequest({
        content: host.content,
        messages: host.messages,
        workspaceDiskRoot: host.diskRoot,
        workspaceName: host.diskWorkspaceName,
        workspaceProjectId: host.diskProjectId,
        stickyListedFolder: host.getLastListedFolder(host.chatId),
        stickyDiskTarget: sticky as never,
      });

      if (outcome.kind === 'reply') {
        await host.finishPlainReply(outcome.text);
        return { status: 'handled' };
      }
      if (outcome.kind === 'prompt') {
        host.pendingProjectDeleteRef.current = {
          assistantId: host.assistantId,
          chatId: host.chatId,
          mode: host.mode,
          replyStartedAt: host.replyStartedAt,
          folderPath: outcome.folderPath,
          projectId: outcome.projectId,
          projectName: outcome.projectName,
          mySeq: host.mySeq,
        };
        host.setDeleteProjectPrompt({
          projectName: outcome.projectName,
          folderPath: outcome.folderPath,
        });
        host.setLastDiskTarget(host.chatId, {
          path: outcome.folderPath,
          name: outcome.projectName,
          kind: 'folder',
        });
        await host.finishPlainReply(
          `Ready to delete **${outcome.projectName}**.\n\nConfirm in the dialog. this removes the folder from your PC:\n\`${outcome.folderPath}\``,
        );
        return { status: 'handled' };
      }
    } catch (err) {
      await host.finishPlainReply(deletePrepareErrorReply(err));
      return { status: 'handled' };
    }
  }

  return { status: 'miss' };
}
