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
      host.onOpened({
        files: opened.files,
        projectId: opened.projectId,
        name,
        root: opened.root || null,
        locateNote,
      });
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
