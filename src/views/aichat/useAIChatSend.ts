/**
 * AIChat sendMessage — thin owned-turn path.
 * Preamble → hydrateStudio → make* hosts → dispatchOwnedTurn → one runChatTurn / media.
 */
// @ts-nocheck — ctx bag mirrors AIChat closures; keep in sync when wiring.
import { loadRecentChats } from '@/lib/recentStore';
import {
  parseNewProjectIntent,
  extractProjectName,
  slugifyProjectName,
  resolveProjectKindForCreate,
} from '@/lib/createProjectIntent';
import { setLastPendingGreenfield } from '@/lib/chatStudioStore';
import { cleanProductTitle } from '@/lib/freshSpaFromBrief';
import { hasActiveWorkspace } from '@/lib/chatAgentTurn';
import { composerModeFromContent } from '@/views/aichat/aiChatHelpers';
import { hydrateStudio } from '@/lib/chatTurnSession';
import { dispatchOwnedTurn, runChatTurn } from '@/lib/chatTurnHandlers';
import { runMediaChatTurn } from '@/lib/chatMediaTurn';
import { buildRouterHistory } from '@/lib/chatHistory';
import { setLocalPrefs } from '@/lib/localPrefs';
import { notifyChatDone } from '@/lib/activityIndicators';
import {
  makeCreateHost,
  makeDeleteHost,
  makeOpenFolderHost,
  makeRunCmdHost,
  makeEditHost,
  makeChatHost,
  type HostBag,
} from '@/lib/chatTurnHosts';
import {
  prepareAIChatSend,
  type AIChatSendCtx,
} from '@/views/aichat/aiChatSendPreamble';

export type { AIChatSendCtx };

export async function runAIChatSend(content: string, ctx: AIChatSendCtx): Promise<void> {
  const prep = await prepareAIChatSend(content, ctx);
  if (prep.status === 'done') return;

  const {
    mode,
    activeChatId,
    assistantId,
    mySeq,
    finishPlainReply,
    clearGeneratingIfMineEarly,
    pushAssistantStatus,
    resolvedStudio,
    chatStudioFilesRef,
    chatStudioDiskRootRef,
    chatStudioProjectIdRef,
    setChatStudioFiles,
    setChatStudioDiskRoot,
    setChatStudioProjectId,
    pinnedModel,
    composerMode,
    diskIntent,
    genSeqRef,
    stopRequestedRef,
    threadBrainRef,
    messagesRef,
    routeChatIdRef,
    chatRouteSeedRef,
    chatTurnCtlRef,
    flushQueuedSend,
  } = prep;

  if (prep.status === 'owned' && (mode === 'general' || mode === 'code')) {
    const turnCtx = await hydrateStudio({
      chatId: activeChatId,
      chatTitle: loadRecentChats().find((c) => c.id === activeChatId)?.title || null,
      content: prep.content,
      mode,
      fallbackFiles: chatStudioFilesRef.current || resolvedStudio.files,
      fallbackProjectId: chatStudioProjectIdRef.current || resolvedStudio.projectId,
      fallbackDiskRoot: chatStudioDiskRootRef.current || resolvedStudio.diskRoot,
      fallbackName: resolvedStudio.name,
    });
    if (turnCtx.diskRoot) {
      chatStudioDiskRootRef.current = turnCtx.diskRoot;
      setChatStudioDiskRoot(turnCtx.diskRoot);
    }
    if (Object.keys(turnCtx.files || {}).length) {
      chatStudioFilesRef.current = turnCtx.files;
      setChatStudioFiles(turnCtx.files);
      resolvedStudio.files = turnCtx.files;
    }
    if (turnCtx.projectId) {
      chatStudioProjectIdRef.current = turnCtx.projectId;
      setChatStudioProjectId(turnCtx.projectId);
      resolvedStudio.projectId = turnCtx.projectId;
    }

    const earlyIntent = parseNewProjectIntent(prep.content) || null;
    const renameFromAsk = extractProjectName(prep.content);
    const createIntentEarly = earlyIntent && renameFromAsk && !/^(My App|New App|App)$/i.test(renameFromAsk)
      ? { ...earlyIntent, name: renameFromAsk, slug: slugifyProjectName(renameFromAsk), summary: prep.content.length > 40 ? `${prep.content}\n\n${earlyIntent.summary}` : earlyIntent.summary }
      : earlyIntent;
    const workspaceActiveForCreate = hasActiveWorkspace({
      files: resolvedStudio.files,
      projectId: resolvedStudio.projectId || chatStudioProjectIdRef.current,
      diskRoot: resolvedStudio.diskRoot || chatStudioDiskRootRef.current,
    });
    const earlyComposerMode = composerModeFromContent(prep.content) || composerMode;
    const earlyPkg = Object.keys(resolvedStudio.files || {}).some((k) => /(^|\/)package\.json$/i.test(k));
    const earlyAgentCwd = chatStudioDiskRootRef.current
      || prep.chatStudioDiskRoot
      || resolvedStudio.diskRoot
      || null;

    const bag: HostBag = {
      turnCtx,
      content: prep.content,
      mode,
      activeChatId,
      assistantId,
      mySeq,
      replyStartedAt: prep.replyStartedAt,
      pinnedModel,
      composerMode,
      diskIntent,
      diskRoot: prep.diskRoot,
      diskProjectId: prep.diskProjectId,
      diskWorkspaceName: prep.diskWorkspaceName,
      stickyDiskTarget: prep.stickyDiskTarget,
      workspaceActiveForCreate,
      createIntentEarly,
      earlyComposerMode,
      earlyPkg,
      earlyAgentCwd,
      userId: prep.userId,
      workspaceFileCount: Object.keys(resolvedStudio.files || {}).length,
      resolvedStudio,
      messages: messagesRef.current,
      routeChatId: routeChatIdRef.current,
      finishPlainReply,
      pushAssistantStatus,
      stopIfSuperseded: prep.stopIfSuperseded,
      clearGeneratingIfMineEarly,
      commitStudioForChat: prep.commitStudioForChat,
      persistStudioSnapshot: prep.persistStudioSnapshot,
      persistModeThread: prep.persistModeThread,
      renameChat: prep.renameChat,
      addChat: prep.addChat,
      previewFromText: prep.previewFromText,
      setCodePillSticky: prep.setCodePillSticky,
      setDeleteFilePrompt: prep.setDeleteFilePrompt,
      setDeleteProjectPrompt: prep.setDeleteProjectPrompt,
      setDeleteFolderClarifyPrompt: prep.setDeleteFolderClarifyPrompt,
      pendingFileDeleteRef: prep.pendingFileDeleteRef,
      pendingProjectDeleteRef: prep.pendingProjectDeleteRef,
      pendingFolderClarifyRef: prep.pendingFolderClarifyRef,
      openFolderInChat: prep.openFolderInChat,
      lastFolderLocateNoteRef: prep.lastFolderLocateNoteRef,
      chatStudioFilesRef,
      chatStudioDiskRootRef,
      chatStudioProjectIdRef,
      setChatStudioFiles,
      setChatStudioDiskRoot,
      setChatStudioProjectId,
      setMessages: prep.setMessages,
      messagesRef,
      genSeqRef,
      stopRequestedRef,
      threadBrainRef,
      pushLivePreview: prep.pushLivePreview,
      flushQueuedSend,
      relPathFromDisk: prep.relPathFromDisk || (() => null),
    };

    const owned = await dispatchOwnedTurn({
      content: prep.content,
      mode,
      classifyOpts: {
        diskRoot: chatStudioDiskRootRef.current || resolvedStudio.diskRoot,
        files: chatStudioFilesRef.current || resolvedStudio.files,
        projectId: chatStudioProjectIdRef.current || resolvedStudio.projectId,
        chatId: activeChatId,
      },
      skipCreate: diskIntent?.type === 'add_file',
      planName: createIntentEarly?.name || extractProjectName(prep.content) || 'your idea',
      planSummary: createIntentEarly?.summary || prep.content,
      savePlanBrief: ({ name, summary }) => {
        setLastPendingGreenfield(activeChatId, {
          name,
          slug: slugifyProjectName(name),
          kind: resolveProjectKindForCreate(summary, 'vite-react', 'vite-react'),
          summary,
          problemLine: `Build ${name} from your brief.`,
        });
        prep.renameChat(activeChatId, cleanProductTitle(name));
      },
      finishPlainReply,
      createHost: makeCreateHost(bag),
      deleteHost: makeDeleteHost(bag),
      openFolderHost: makeOpenFolderHost(bag),
      runCmdHost: makeRunCmdHost(bag),
      editHost: makeEditHost(bag),
      chatHost: makeChatHost(bag),
    });

    if (owned.status === 'handled') return;
    if (owned.status === 'continue' || owned.status === 'edit') {
      const chatOut = await runChatTurn(makeChatHost(bag));
      await finishPlainReply(chatOut.text, 'NOVA');
      return;
    }
    return;
  }

  if (!prep.isMediaMode) {
    clearGeneratingIfMineEarly();
    return;
  }

  chatRouteSeedRef.current = {
    history: buildRouterHistory(
      messagesRef.current.filter((m) => m.role === 'user' || m.role === 'assistant'),
      prep.content,
      undefined,
      { keepContinuity: true, kind: 'chat' },
    ),
    sticky: pinnedModel.source === 'auto' ? threadBrainRef.current : null,
  };

  const clearGeneratingIfMine = () => {
    clearGeneratingIfMineEarly();
  };

  const finalizeAssistant = (finalText: string, provider: string, libraryId?: string) => {
    if (mySeq !== genSeqRef.current) return;
    if (provider && provider !== 'NOVA · setup needed') {
      setLocalPrefs({ lastAnsweredLabel: provider });
    }
    const threadChatId = activeChatId;
    const viewingThisThread = Boolean(threadChatId && routeChatIdRef.current === threadChatId);
    const cleaned = String(finalText || '').trim() || 'Done.';
    const next = messagesRef.current.map((m) => (
      m.id === assistantId
        ? { ...m, content: cleaned, provider_used: provider || 'NOVA', library_id: libraryId }
        : m
    ));
    messagesRef.current = next;
    prep.persistModeThread(mode, next, { chatId: threadChatId });
    prep.setMessages((prev) => (viewingThisThread ? next : prev));
    notifyChatDone(threadChatId);
    clearGeneratingIfMine();
  };

  chatTurnCtlRef.current = {
    clearGenerating: clearGeneratingIfMine,
    finalizeAssistant,
    pushStatus: pushAssistantStatus,
  };

  void runMediaChatTurn({
    content: prep.content,
    mode,
    composerMode,
    providerLabel: prep.providerLabel,
    mySeq,
    activeChatId,
    genJobId: prep.genJobId,
    previousAssistant: prep.previousAssistant,
    statusLabel: prep.statusLabel,
    isMediaMode: prep.isMediaMode,
    videoDurationSec: prep.videoDurationSec,
    pluginId: prep.pluginId,
    pluginState: prep.pluginState,
    pinnedModel,
    normalized: prep.normalized,
    userMsg: prep.userMsg,
    assistantMsg: prep.assistantMsg,
    assistantId,
    priorForHistory: prep.priorForHistory,
    resolvedStudio,
    turnDiskRoot: prep.turnDiskRoot,
    turnProjectId: prep.turnProjectId,
    turnStudioFiles: prep.turnStudioFiles,
    chatStudioDiskRoot: prep.chatStudioDiskRoot,
    threadKind: prep.threadKind,
    capacity: prep.capacity,
    chats: prep.chats,
    chatRouteSeedRef,
    genSeqRef,
    stopRequestedRef,
    chatTurnCtlRef,
    chatStudioFilesRef,
    chatStudioDiskRootRef,
    chatStudioProjectIdRef,
    imageBriefRef: prep.imageBriefRef,
    routeChatIdRef,
    messagesRef,
    messagesChatIdRef: prep.messagesChatIdRef,
    persistTimerRef: prep.persistTimerRef,
    threadBrainRef,
    previewUrlRef: prep.previewUrlRef,
    setMessages: prep.setMessages,
    persistModeThread: prep.persistModeThread,
    setFailoverNote: prep.setFailoverNote,
    setThreadBrain: prep.setThreadBrain,
    setIpcFallbackDev: prep.setIpcFallbackDev,
    setChatStudioFiles,
    persistStudioSnapshot: prep.persistStudioSnapshot,
    pushLivePreview: prep.pushLivePreview,
    flushQueuedSend,
    addCreation: (c) => prep.addCreation(c as never),
    addChat: (c) => prep.addChat(c as never),
    failoverChipText: prep.failoverChipText,
    previewFromText: prep.previewFromText,
  });
}
