/**
 * Open-folder turn — bind a PC folder into this chat.
 */

import {
  looksLikeFolderPathAsk,
  parseFolderPathAsk,
  GRANT_OFF_FOLDER_MSG,
  type FolderPathRef,
} from '@/lib/folderPathAsk';
import { shouldFullImportFolderAsk } from '@/lib/folderCatalog';
import { hasFolderAccessGrant } from '@/lib/workspaceGrants';

export type OpenFolderTurnHost = {
  content: string;
  chatId: string;
  mode: string;
  assistantId: string;
  userId: string;
  workspaceFileCount: number;
  finishPlainReply: (text: string) => Promise<void>;
  syncGrants: () => Promise<void>;
  resolveScopedFolderPath: (ref: FolderPathRef) => Promise<{
    ok: boolean;
    path?: string;
    matchedName?: string;
    nested?: boolean;
    error?: string;
  }>;
  openFolderInChat: (path: string) => Promise<{
    ok: boolean;
    files?: Record<string, string>;
    projectId?: string | null;
    name?: string;
    root?: string | null;
    error?: string;
  }>;
  onOpened: (opts: {
    files: Record<string, string>;
    projectId?: string | null;
    name: string;
    root?: string | null;
    locateNote?: string | null;
  }) => void;
  /** Optional: poll until chat diskRoot matches opened root. */
  waitUntilBound?: (root: string) => Promise<boolean>;
  formatFolderLocatedMessage?: (
    located: { path?: string; matchedName?: string; nested?: boolean },
    name: string,
  ) => string | null;
  clearGenerating: () => void;
};

export type OpenFolderTurnResult =
  | { status: 'handled' }
  | { status: 'bound'; files: Record<string, string> }
  | { status: 'miss' };

export async function runOpenFolderTurn(host: OpenFolderTurnHost): Promise<OpenFolderTurnResult> {
  if (host.workspaceFileCount > 0) return { status: 'miss' };
  if (!looksLikeFolderPathAsk(host.content) || !shouldFullImportFolderAsk(host.content)) {
    return { status: 'miss' };
  }

  if (!hasFolderAccessGrant()) {
    await host.finishPlainReply(GRANT_OFF_FOLDER_MSG);
    host.clearGenerating();
    return { status: 'handled' };
  }

  const folderRef = parseFolderPathAsk(host.content);
  if (!folderRef) {
    await host.finishPlainReply(
      'Which folder on your Desktop? Say the name. for example: *“What is AutoTrade on my desktop?”* or *“On my desktop I have a folder called my-app.”*',
    );
    host.clearGenerating();
    return { status: 'handled' };
  }

  await host.syncGrants();
  const located = await host.resolveScopedFolderPath(folderRef);
  if (located.ok && located.path) {
    const opened = await host.openFolderInChat(located.path);
    if (opened.ok && opened.files) {
      const name = opened.name || located.matchedName || folderRef.name;
      const locateNote = host.formatFolderLocatedMessage?.(located, folderRef.name) || null;
      const root = opened.root || null;
      host.onOpened({
        files: opened.files,
        projectId: opened.projectId,
        name,
        root,
        locateNote,
      });
      // Wait until diskRoot is set on the host side (bind race defense).
      if (root && host.waitUntilBound) {
        const ok = await host.waitUntilBound(root);
        if (!ok) {
          await host.finishPlainReply(
            'Folder opened but the chat bind did not settle. Try **+ → Open folder** once, then ask again.',
          );
          host.clearGenerating();
          return { status: 'handled' };
        }
      }
      return { status: 'bound', files: opened.files };
    }
    if (opened.error && opened.error !== 'canceled') {
      await host.finishPlainReply(
        opened.error === 'empty folder'
          ? 'That folder opened but looks empty.'
          : (opened.error || 'Could not open that folder.'),
      );
      host.clearGenerating();
      return { status: 'handled' };
    }
  } else if (located.error) {
    await host.finishPlainReply(String(located.error));
    host.clearGenerating();
    return { status: 'handled' };
  }

  return { status: 'miss' };
}
