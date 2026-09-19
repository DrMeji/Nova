/**
 * Host bags for dispatchOwnedTurn — built from TurnCtx + AIChat send wiring.
 */
// @ts-nocheck — bag mirrors AIChat closures; keep in sync with useAIChatSend.
import type { TurnCtx } from '@/lib/chatTurnSession';
import type { CreateTurnHost } from '@/lib/chatTurnHandlers/create';
import type { DeleteTurnHost } from '@/lib/chatTurnHandlers/delete';
import type { OpenFolderTurnHost } from '@/lib/chatTurnHandlers/openFolder';
import type { RunCmdTurnHost } from '@/lib/chatTurnHandlers/runCmd';
import type { RunEditTurnHost } from '@/lib/chatTurnHandlers/edit';
import type { ChatTurnHost } from '@/lib/chatTurnHandlers/chat';
import { setChatTurnStatus } from '@/lib/chatTurnStatusStore';
import {
  setChatCodePill,
  setLastDiskTarget,
  clearLastPendingGreenfield,
  getLastPendingGreenfield,
  getLastListedFolder,
} from '@/lib/chatStudioStore';
import { shouldPaintStudioLive } from '@/lib/chatTurnIsolation';
import { resolveScopedFolderPath, formatFolderLocatedMessage, syncWorkspaceGrantsFromPrefs } from '@/lib/workspaceGrants';
import { countLineDiff } from '@/lib/agentTrace';
import { buildStudioTraceMessage } from '@/lib/chatCodeReply';
import { getActiveBrainId, isWeakCoderId } from '@/lib/brainRoles';
import { inferEditTopicFromAsk, rememberLastEditTopic } from '@/lib/editAskResolve';
import { pushApplySnapshot } from '@/lib/chatApplySnapshotStore';

/** Shared wiring from AIChat send — refs, setters, turn locals. */
export type HostBag = {
  turnCtx: TurnCtx;
  content: string;
  /** Expanded surgical ask when shorthand was resolved; falls back to content. */
  editUserMessage?: string;
  mode: string;
  activeChatId: string;
  assistantId: string;
  mySeq: number;
  replyStartedAt: number;
  genSeqRef: { current: number };
  genSeqByChatRef?: { current: Record<string, number> };
  stopRequestedRef: { current: boolean };
  stopRequestedByChatRef?: { current: Record<string, boolean> };
  pinnedModel: { id?: string; name?: string; source?: string };
  composerMode: string | null;
  diskIntent: unknown;
  diskRoot: string | null;
  diskProjectId: string | null;
  diskWorkspaceName: string | null;
  stickyDiskTarget: unknown;
  workspaceActiveForCreate: boolean;
  createIntentEarly: unknown;
  earlyComposerMode: string | null;
  earlyPkg: boolean;
  earlyAgentCwd: string | null;
  userId: string;
  workspaceFileCount: number;
  resolvedStudio: {
    files: Record<string, string>;
    projectId?: string | null;
    name?: string;
    diskRoot?: string | null;
  };
  messages: { role: string; content?: string | null }[];
  routeChatId: string | null;
  finishPlainReply: (text: string, provider?: string) => Promise<void> | void;
  pushAssistantStatus: (label: string, writingPath?: string | null) => void;
  stopIfSuperseded: () => Promise<boolean>;
  clearGeneratingIfMineEarly: () => void;
  commitStudioForChat: (chatId: string, opts: Record<string, unknown>) => void;
  persistStudioSnapshot: (chatId: string, opts: Record<string, unknown>) => void;
  persistModeThread: (mode: string, next: unknown[], opts: { chatId: string }) => void;
  renameChat: (chatId: string, title: string) => void;
  addChat: (chat: Record<string, unknown>) => void;
  touchRecentProject?: (id: string, name?: string, diskPath?: string) => void;
  previewFromText: (text: string) => string | undefined;
  setCodePillSticky: (on: boolean) => void;
  setDeleteFilePrompt: (p: unknown) => void;
  setDeleteProjectPrompt: (p: unknown) => void;
  setDeleteFolderClarifyPrompt: (p: unknown) => void;
  /** Pin a ready coder in the chat UI before create scaffolds. */
  onCoderPinned?: (coder: { id: string; name: string }) => void;
  pendingFileDeleteRef: { current: unknown };
  pendingProjectDeleteRef: { current: unknown };
  pendingFolderClarifyRef: { current: unknown };
  openFolderInChat: (path: string) => Promise<Record<string, unknown>>;
  lastFolderLocateNoteRef: { current: unknown };
  chatStudioFilesRef: { current: Record<string, string> };
  chatStudioDiskRootRef: { current: string | null };
  chatStudioProjectIdRef: { current: string | null };
  setChatStudioFiles: (files: Record<string, string>) => void;
  setChatStudioDiskRoot: (root: string | null) => void;
  setChatStudioProjectId: (id: string | null) => void;
  setMessages: (updater: unknown) => void;
  messagesRef: { current: unknown[] };
  threadBrainRef: { current: { modelId?: string; modelName?: string } | null };
  pushLivePreview: (files: Record<string, string>, force?: boolean) => void;
  flushQueuedSend: () => void;
  relPathFromDisk: (filePath: string) => string | null;
};

function turnStillActive(bag: HostBag): boolean {
  const chatId = bag.activeChatId;
  const liveSeq = bag.genSeqByChatRef?.current?.[chatId] ?? bag.genSeqRef.current;
  const stopped = Boolean(
    bag.stopRequestedByChatRef?.current?.[chatId]
    || bag.stopRequestedRef.current,
  );
  // Global stopRequested only aborts if we lack per-chat map (legacy) —
  // with per-chat map, only that chat's flag counts.
  if (bag.stopRequestedByChatRef?.current) {
    return bag.mySeq === liveSeq && !bag.stopRequestedByChatRef.current[chatId];
  }
  return bag.mySeq === liveSeq && !stopped;
}

export function makeCreateHost(bag: HostBag): CreateTurnHost {
  const { content, mode, activeChatId, createIntentEarly, workspaceActiveForCreate, pinnedModel } = bag;
  const sticky = pinnedModel.source === 'auto' ? bag.threadBrainRef.current : null;
  // Prefer active coder prefs when the menu is on Auto — create polish needs a real GGUF id.
  let preferredId = pinnedModel.id;
  let preferredName = pinnedModel.name;
  if (pinnedModel.id === 'NOVA-auto' || pinnedModel.source === 'auto') {
    const coderPref = getActiveBrainId('coder');
    if (coderPref && coderPref !== 'NOVA-auto' && !isWeakCoderId(coderPref)) {
      preferredId = coderPref;
      preferredName = coderPref;
    }
  }
  return {
    content,
    chatId: activeChatId,
    mode,
    workspaceBound: workspaceActiveForCreate,
    createIntent: createIntentEarly as CreateTurnHost['createIntent'],
    classifiedCreateName: (createIntentEarly as { name?: string } | null)?.name,
    messages: bag.messages,
    routeChatId: bag.routeChatId,
    pushStatus: bag.pushAssistantStatus,
    stopIfSuperseded: bag.stopIfSuperseded,
    shouldAbort: () => !turnStillActive(bag),
    finishPlainReply: bag.finishPlainReply,
    replyStartedAt: bag.replyStartedAt,
    syncGrants: syncWorkspaceGrantsFromPrefs,
    commitStudio: (opts) => { bag.commitStudioForChat(activeChatId, opts); },
    setChatCodePill,
    shouldPaintStudioLive,
    setCodePillSticky: bag.setCodePillSticky,
    renameChat: bag.renameChat,
    addChat: (chat) => bag.addChat(chat as never),
    touchRecentProject: bag.touchRecentProject,
    setLastDiskTarget,
    clearPending: clearLastPendingGreenfield,
    getPending: getLastPendingGreenfield,
    previewFromText: bag.previewFromText,
    modelId: preferredId,
    modelName: preferredName,
    stickyModelId: sticky?.modelId,
    stickyModelName: sticky?.modelName,
    preferredModelId: preferredId,
    preferredModelName: preferredName,
    onCoderPinned: bag.onCoderPinned,
  };
}

export function makeDeleteHost(bag: HostBag): DeleteTurnHost {
  return {
    content: bag.content,
    chatId: bag.activeChatId,
    mode: bag.mode,
    assistantId: bag.assistantId,
    mySeq: bag.mySeq,
    replyStartedAt: bag.replyStartedAt,
    diskIntent: bag.diskIntent as DeleteTurnHost['diskIntent'],
    diskRoot: bag.diskRoot,
    diskProjectId: bag.diskProjectId,
    diskWorkspaceName: bag.diskWorkspaceName,
    stickyDiskTarget: bag.stickyDiskTarget as DeleteTurnHost['stickyDiskTarget'],
    workspaceFiles: bag.resolvedStudio.files,
    messages: bag.messages,
    finishPlainReply: bag.finishPlainReply,
    getLastListedFolder,
    setLastDiskTarget,
    setDeleteFilePrompt: bag.setDeleteFilePrompt,
    setDeleteProjectPrompt: bag.setDeleteProjectPrompt,
    setDeleteFolderClarifyPrompt: bag.setDeleteFolderClarifyPrompt,
    pendingFileDeleteRef: bag.pendingFileDeleteRef,
    pendingProjectDeleteRef: bag.pendingProjectDeleteRef,
    pendingFolderClarifyRef: bag.pendingFolderClarifyRef,
    relPathFromDisk: bag.relPathFromDisk,
  };
}

export function makeOpenFolderHost(bag: HostBag): OpenFolderTurnHost {
  const { activeChatId, resolvedStudio } = bag;
  return {
    content: bag.content,
    chatId: activeChatId,
    mode: bag.mode,
    assistantId: bag.assistantId,
    userId: bag.userId,
    workspaceFileCount: bag.workspaceFileCount,
    finishPlainReply: bag.finishPlainReply,
    syncGrants: syncWorkspaceGrantsFromPrefs,
    resolveScopedFolderPath,
    openFolderInChat: bag.openFolderInChat as OpenFolderTurnHost['openFolderInChat'],
    formatFolderLocatedMessage,
    clearGenerating: bag.clearGeneratingIfMineEarly,
    onOpened: ({ files, projectId, name, root, locateNote }) => {
      resolvedStudio.files = files;
      resolvedStudio.projectId = projectId || resolvedStudio.projectId;
      resolvedStudio.name = name;
      bag.chatStudioFilesRef.current = files;
      bag.setChatStudioFiles(files);
      if (projectId) {
        bag.chatStudioProjectIdRef.current = projectId;
        bag.setChatStudioProjectId(projectId);
      }
      if (root) bag.setChatStudioDiskRoot(root);
      bag.persistStudioSnapshot(activeChatId, {
        files,
        projectId: projectId || null,
        name,
        diskRoot: root || null,
      });
      if (locateNote) bag.lastFolderLocateNoteRef.current = locateNote;
    },
    waitUntilBound: async (root) => {
      for (let i = 0; i < 20; i++) {
        if (bag.chatStudioDiskRootRef.current === root) return true;
        await new Promise((r) => window.setTimeout(r, 25));
      }
      return bag.chatStudioDiskRootRef.current === root;
    },
  };
}

export function makeRunCmdHost(bag: HostBag): RunCmdTurnHost {
  return {
    content: bag.content,
    mode: bag.mode,
    composerMode: bag.earlyComposerMode,
    agentCwd: bag.earlyAgentCwd,
    hasPackageJson: bag.earlyPkg,
    assistantId: bag.assistantId,
    finishAgentReply: (reply: string, provider = 'NOVA · agent') => {
      void bag.finishPlainReply(reply, provider);
    },
    confirm: (message) => window.confirm(message),
    setRunningStatus: (label) => {
      setChatTurnStatus({ chatId: bag.activeChatId, assistantId: bag.assistantId, label, history: [label] });
    },
  };
}

export function makeEditHost(bag: HostBag): RunEditTurnHost {
  const { turnCtx, pinnedModel, activeChatId, assistantId, resolvedStudio } = bag;
  const sticky = pinnedModel.source === 'auto' ? bag.threadBrainRef.current : null;
  const files = Object.keys(turnCtx.files || {}).length
    ? turnCtx.files
    : (bag.chatStudioFilesRef.current || resolvedStudio.files || {});
  return {
    content: bag.content,
    editUserMessage: bag.editUserMessage || bag.content,
    projectId: turnCtx.projectId || resolvedStudio.projectId || bag.chatStudioProjectIdRef.current,
    projectLabel: turnCtx.name || resolvedStudio.name || 'App',
    diskRoot: turnCtx.diskRoot || bag.chatStudioDiskRootRef.current || resolvedStudio.diskRoot || null,
    files,
    replyStartedAt: bag.replyStartedAt,
    modelId: pinnedModel.id,
    modelName: pinnedModel.name,
    stickyModelId: sticky?.modelId,
    stickyModelName: sticky?.modelName,
    preferredModelId: pinnedModel.id,
    preferredModelName: pinnedModel.name,
    pushStatus: bag.pushAssistantStatus,
    countLineDiff,
    buildStudioTraceMessage,
    onApplied: ({ files: nextFiles, updated, reply, provider, elapsedMs }) => {
      const topic = inferEditTopicFromAsk(activeChatId, bag.editUserMessage || bag.content, {
        priorFiles: files,
        nextFiles,
      });
      if (topic) rememberLastEditTopic(topic);
      if (updated?.length) {
        pushApplySnapshot({
          chatId: activeChatId,
          assistantId,
          diskRoot: turnCtx.diskRoot || bag.chatStudioDiskRootRef.current || resolvedStudio.diskRoot || null,
          files,
          updatedPaths: updated,
          at: Date.now(),
        });
      }
      bag.setChatStudioFiles(nextFiles);
      bag.chatStudioFilesRef.current = nextFiles;
      resolvedStudio.files = nextFiles;
      setChatCodePill(activeChatId, true);
      bag.setCodePillSticky(true);
      bag.persistStudioSnapshot(activeChatId, {
        files: nextFiles,
        projectId: turnCtx.projectId || resolvedStudio.projectId,
        name: turnCtx.name || resolvedStudio.name,
        diskRoot: turnCtx.diskRoot || bag.chatStudioDiskRootRef.current,
      });
      void bag.pushLivePreview(nextFiles, false);
      const next = bag.messagesRef.current.map((m: { id?: string }) => (
        m.id === assistantId
          ? { ...m, content: reply, provider_used: provider, elapsed_ms: elapsedMs }
          : m
      ));
      bag.messagesRef.current = next;
      bag.persistModeThread(bag.mode, next, { chatId: activeChatId });
      bag.setMessages(next);
      bag.clearGeneratingIfMineEarly();
      window.setTimeout(() => {
        if (turnStillActive(bag)) bag.flushQueuedSend();
      }, 0);
    },
    onFailed: ({ reply, elapsedMs }) => {
      const failNext = bag.messagesRef.current.map((m: { id?: string }) => (
        m.id === assistantId
          ? { ...m, content: reply, provider_used: 'NOVA · edit', elapsed_ms: elapsedMs }
          : m
      ));
      bag.messagesRef.current = failNext;
      bag.persistModeThread(bag.mode, failNext, { chatId: activeChatId });
      bag.setMessages(failNext);
      bag.clearGeneratingIfMineEarly();
    },
  };
}

export function makeChatHost(bag: HostBag): ChatTurnHost {
  const { turnCtx, pinnedModel, assistantId } = bag;
  const files = Object.keys(turnCtx.files || {}).length
    ? turnCtx.files
    : (bag.chatStudioFilesRef.current || bag.resolvedStudio.files || {});
  const priorHistory = (bag.messages || [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: String(m.content || '').trim(),
    }))
    .filter((m) => {
      if (!m.content || m.content.startsWith('__generating__:')) return false;
      // Drop the current user ask from prior (router appends it).
      if (m.role === 'user' && m.content === String(bag.content || '').trim()) return false;
      return true;
    })
    .slice(-16);
  // Stick to the last *chat* brain only. A coding sticky from a prior build must not
  // reload the coder GGUF for normal conversation (that mid-turn unload/load freezes UI).
  const threadBrain = pinnedModel.source === 'auto' ? bag.threadBrainRef.current : null;
  const stickyIsCoder = /coder|starcoder|codestral|codellama|devstral|deepseek-coder/i.test(
    String(threadBrain?.modelId || threadBrain?.modelName || ''),
  );
  const stickyChat =
    threadBrain
    && threadBrain.kind !== 'coding'
    && !stickyIsCoder
    && threadBrain.pinnedSource
      ? threadBrain
      : null;
  return {
    content: bag.content,
    files,
    projectName: turnCtx.name || bag.resolvedStudio.name || undefined,
    mode: 'chat' as const,
    allowFileEdits: false,
    preferredModelId: pinnedModel.id,
    preferredModelName: pinnedModel.name,
    preferredSource: pinnedModel.source,
    stickyModelId: stickyChat?.modelId || null,
    stickyModelName: stickyChat?.modelName || null,
    stickyPinnedSource: stickyChat?.pinnedSource || null,
    priorHistory,
    shouldAbort: () => !turnStillActive(bag),
    onDelta: (live: string) => {
      if (!turnStillActive(bag)) return;
      let text = String(live || '').trim();
      if (text.length < 2) return;
      // Never paint the canned greeting flash into the bubble.
      if (/Hello!\s*How can I assist you today/i.test(text) && text.length < 120) return;
      text = text.replace(/Hello!\s*How can I assist you today\??\.?/gi, '').trim();
      // Mid-stream system-prompt dumps (often after a model hop) — hide until cleaned.
      if (/You are NOVA,/i.test(text) && /Stay in chat mode/i.test(text)) {
        text = text.replace(
          /You are NOVA,[\s\S]*?(?:Never nest asterisks[^\n]*\.|Never repeat or paraphrase these instructions[^\n]*\.|(?=\n\n(?:To |I |Here|Sure|Let me|For\b|When\b)))/gi,
          '',
        ).trim();
      }
      if (text.length < 2) return;
      bag.setMessages((prev: { id?: string; content?: string }[]) => {
        const cur = prev.find((m) => m.id === assistantId);
        const prevText = String(cur?.content || '');
        // Do not wipe a longer good stream with a short unrelated replacement.
        if (
          prevText.length >= 48
          && !prevText.startsWith('__generating__:')
          && text.length < Math.floor(prevText.length * 0.55)
          && !text.startsWith(prevText.slice(0, Math.min(40, prevText.length)))
        ) {
          return prev;
        }
        const next = prev.map((m) => (m.id === assistantId ? { ...m, content: text } : m));
        bag.messagesRef.current = next;
        return next;
      });
    },
  };
}
