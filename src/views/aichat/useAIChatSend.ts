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
import { setLastPendingGreenfield, getLastPendingGreenfield } from '@/lib/chatStudioStore';
import { cleanProductTitle } from '@/lib/freshSpaFromBrief';
import { hasActiveWorkspace } from '@/lib/chatAgentTurn';
import { composerModeFromContent } from '@/views/aichat/aiChatHelpers';
import { hydrateStudio } from '@/lib/chatTurnSession';
import { dispatchOwnedTurn, runChatTurn, runEditTurn } from '@/lib/chatTurnHandlers';
import { runMediaChatTurn } from '@/lib/chatMediaTurn';
import { buildRouterHistory } from '@/lib/chatHistory';
import { setLocalPrefs } from '@/lib/localPrefs';
import { notifyChatDone } from '@/lib/activityIndicators';
import { setActiveBrainId } from '@/lib/brainRoles';
import { setEngineModel } from '@/lib/novaEngine';
import { saveAutoThreadBrain } from '@/lib/threadBrain';
import {
  resolveConversationalEditAsk,
  rememberLastEditTopic,
  inferEditTopicFromAsk,
} from '@/lib/editAskResolve';
import {
  getApplySnapshot,
  clearApplySnapshot,
  snapshotToRevertBlocks,
} from '@/lib/chatApplySnapshotStore';
import { applyChatReplyEdits } from '@/lib/chatAgentApply';
import { buildStudioTraceMessage, finalizeCodingChatBubble } from '@/lib/chatCodeReply';
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
    genSeqByChatRef,
    stopRequestedRef,
    stopRequestedByChatRef,
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

    const workspaceBound = hasActiveWorkspace({
      files: chatStudioFilesRef.current || resolvedStudio.files,
      projectId: chatStudioProjectIdRef.current || resolvedStudio.projectId,
      diskRoot: chatStudioDiskRootRef.current || resolvedStudio.diskRoot,
      chatId: activeChatId,
    });
    const resolvedAsk = resolveConversationalEditAsk({
      message: prep.content,
      chatId: activeChatId,
      messages: messagesRef.current,
      workspaceBound,
      hasApplySnapshot: Boolean(getApplySnapshot(activeChatId)),
    });
    const editContent = resolvedAsk.content;

    if (resolvedAsk.revertSnapshot && workspaceBound) {
      const snap = getApplySnapshot(activeChatId);
      const blocks = snap ? snapshotToRevertBlocks(snap) : '';
      if (snap && blocks) {
        const applied = await applyChatReplyEdits({
          reply: blocks,
          projectId: chatStudioProjectIdRef.current || resolvedStudio.projectId,
          projectName: resolvedStudio.name || 'project',
          files: snap.files,
          userMessage: 'put it back',
          diskRoot: snap.diskRoot,
        });
        if (applied.ok) {
          setChatStudioFiles(applied.files);
          chatStudioFilesRef.current = applied.files;
          prep.persistStudioSnapshot(activeChatId, {
            files: applied.files,
            projectId: chatStudioProjectIdRef.current || resolvedStudio.projectId,
            diskRoot: snap.diskRoot,
          });
          clearApplySnapshot(activeChatId);
          const topic = inferEditTopicFromAsk(activeChatId, 'put it back', {
            priorFiles: snap.files,
            nextFiles: applied.files,
          });
          if (topic) rememberLastEditTopic(topic);
          const answer = finalizeCodingChatBubble({
            userMessage: prep.content,
            rawReply: '',
            changedPaths: applied.updated,
            applied: true,
          }) || 'Put it back — restored the previous version.';
          const reply = buildStudioTraceMessage({
            startedAt: prep.replyStartedAt,
            elapsedMs: Math.max(1, Date.now() - prep.replyStartedAt),
            userMessage: prep.content,
            answer,
            wrotePaths: applied.updated,
            projectName: resolvedStudio.name || 'App',
          });
          await finishPlainReply(reply, 'NOVA · undo');
          return;
        }
      }
    }

    const bag: HostBag = {
      turnCtx,
      content: prep.content,
      editUserMessage: editContent,
      mode,
      activeChatId,
      assistantId,
      mySeq,
      replyStartedAt: prep.replyStartedAt,
      pinnedModel,
      composerMode,
      regenerating: Boolean(prep.regenerating),
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
      touchRecentProject: prep.touchRecentProject,
      previewFromText: prep.previewFromText,
      setCodePillSticky: prep.setCodePillSticky,
      setDeleteFilePrompt: prep.setDeleteFilePrompt,
      setDeleteProjectPrompt: prep.setDeleteProjectPrompt,
      setDeleteFolderClarifyPrompt: prep.setDeleteFolderClarifyPrompt,
      onCoderPinned: (coder) => {
        try {
          setActiveBrainId('coder', coder.id);
          setLocalPrefs({
            activeCoderId: coder.id,
            defaultCodeModelId: coder.id,
          });
          void setEngineModel(coder.id).catch(() => undefined);
          // Keep chat locked on Nova Multimodal — only refresh status / last label.
          try {
            setLocalPrefs({ lastAnsweredLabel: `Local · ${coder.name}` });
          } catch { /* ignore */ }
          // Do not setActiveModel to the coder — that made Multimodal look like it “reverted”.
        } catch { /* ignore */ }
      },
      onCreatePhaseModel: (phase) => {
        try {
          // Status-only: chat selection stays Multimodal; create uses role brains under Auto.
          try {
            setLocalPrefs({ lastAnsweredLabel: `Local · ${phase.name}` });
          } catch { /* ignore */ }
          if (phase.role === 'craft' || phase.role === 'verify') {
            setActiveBrainId('coder', phase.id);
            setLocalPrefs({
              activeCoderId: phase.id,
              defaultCodeModelId: phase.id,
              lastAnsweredLabel: `Local · ${phase.name}`,
            });
            void setEngineModel(phase.id).catch(() => undefined);
          }
        } catch { /* ignore */ }
      },
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
      genSeqByChatRef,
      stopRequestedRef,
      stopRequestedByChatRef,
      threadBrainRef,
      pushLivePreview: prep.pushLivePreview,
      flushQueuedSend,
      relPathFromDisk: prep.relPathFromDisk || (() => null),
    };

    const recentUserLines = messagesRef.current
      .filter((m) => m.role === 'user')
      .map((m) => String(m.content || '').trim())
      .filter(Boolean)
      .slice(-12);

    const owned = await dispatchOwnedTurn({
      // Classify on the original ask — edit shorthand only goes to the edit host.
      content: prep.content,
      mode,
      classifyOpts: {
        diskRoot: chatStudioDiskRootRef.current || resolvedStudio.diskRoot,
        files: chatStudioFilesRef.current || resolvedStudio.files,
        projectId: chatStudioProjectIdRef.current || resolvedStudio.projectId,
        chatId: activeChatId,
        pendingBrief: getLastPendingGreenfield(activeChatId)?.summary || null,
        recentUserLines,
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

    const stickChatBrain = (chatOutcome: {
      modelId?: string;
      modelName?: string;
      attemptedLen?: number;
      source?: string;
      tier?: string;
    } | undefined) => {
      if (!chatOutcome?.modelId || !chatOutcome.source || chatOutcome.source === 'none') return;
      if (pinnedModel.source !== 'auto') return;
      if (/coder|starcoder|codestral|codellama|devstral|deepseek-coder/i.test(chatOutcome.modelId)) return;
      try {
        const nextBrain = saveAutoThreadBrain(
          activeChatId,
          'chat',
          {
            reply: '',
            modelId: chatOutcome.modelId,
            modelName: chatOutcome.modelName || chatOutcome.modelId,
            source: chatOutcome.source as 'ark-gguf',
            tier: (chatOutcome.tier || 'local-free') as 'local-free',
            attempted: Array.from({ length: Math.max(1, chatOutcome.attemptedLen || 1) }, (_, i) =>
              i === 0 ? `NOVA Engine · ${chatOutcome.modelId}` : `hop-${i}`,
            ),
          },
          threadBrainRef.current as never,
          chatOutcome.attemptedLen || 1,
        );
        if (nextBrain) {
          threadBrainRef.current = nextBrain;
          prep.setThreadBrain?.(nextBrain);
        }
      } catch { /* ignore */ }
    };

    if (owned.status === 'handled') {
      stickChatBrain((owned as { chatOutcome?: Parameters<typeof stickChatBrain>[0] }).chatOutcome);
      return;
    }
    if (owned.status === 'edit') {
      await runEditTurn(makeEditHost(bag));
      return;
    }
    if (owned.status === 'continue') {
      const chatOut = await runChatTurn(makeChatHost(bag));
      stickChatBrain(chatOut);
      await finishPlainReply(chatOut.text, chatOut.provider || 'NOVA');
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
    const liveSeq = genSeqByChatRef?.current?.[activeChatId] ?? genSeqRef.current;
    if (mySeq !== liveSeq) return;
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
