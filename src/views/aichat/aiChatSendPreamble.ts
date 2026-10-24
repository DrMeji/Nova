/**
 * AIChat send preamble — setup, gates, disk/greenfield before owned dispatch.
 */
import 'react';
import '@/context/AuthContext';
import '@/context/RouterContext';
import '@/context/RecentProjectsContext';
import '@/lib/api';
import { getLocalPrefs } from '@/lib/localPrefs';
import '@/lib/cloudSources';
import '@/lib/cloudChat';
import { honestNoLiveChatReply, probeLiveCapacity } from '@/lib/novaCapacity';
import { tipAt, tipStartIndex } from '@/lib/novaTips';
import '@/lib/novaHuntBootstrap';
import { chatThreadKey, titleFromPrompt } from '@/lib/recentStore';
import '@/lib/chatIntent';
import '@/lib/chatStudio';
import '@/lib/studioAnswerEngine';
import { parseChatAttach, parseChatAttaches } from '@/lib/chatAttach';
import '@/lib/chatDrop';
import '@/lib/projectInspect';
import '@/lib/projectThread';
import '@/lib/novaGitClient';
import '@/lib/github';
import { MEDIA_GEN_STAGES } from '@/lib/mediaPrompt';
import '@/lib/mediaBrief';
import '@/lib/novaRouter';
import '@/lib/agentExecution';
import '@/lib/folderPathAsk';
import { isCatalogMessage, parseWorkOnFolderName } from '@/lib/folderCatalog';
import '@/lib/pcExplore';
import { stripAgentTrace } from '@/lib/agentTrace';
import { hasFolderAccessGrant, syncWorkspaceGrantsFromPrefs } from '@/lib/workspaceGrants';
import { loadChatStudio, setLastListedFolder, getLastListedFolder, setLastDiskTarget, getLastDiskTarget, setLastPendingAddFile, getLastPendingAddFile, clearLastPendingAddFile, setLastPendingGreenfield, getLastPendingGreenfield, studioPathBasename } from '@/lib/chatStudioStore';
import '@/lib/studioCommands';
import '@/lib/chatAgentApply';
import '@/lib/novaMultiAgent';
import '@/lib/novaSkills';
import '@/lib/novaQuickEdit';
import { beginChatInflight, endChatInflight } from '@/lib/chatInflight';
import '@/lib/nsfwGate';
import { arkSelfHarmBlockedReply, looksLikeArkSelfHarmAsk } from '@/lib/novaSelfGuard';
import {
  harmfulContentBlockedReply,
  looksLikeHarmfulContentAsk,
} from '@/lib/novaContentSafety';
import { redactArkSelfLeak } from '@/lib/replySanitizer';
import '@/lib/voiceSession';
import '@/lib/voiceRoute';
import '@/lib/voiceAudio';

import '@/lib/voiceMode';
import '@/lib/novaMcp';
import { isUiShellAsk } from '@/lib/webProjectCanon';
import '@/lib/deleteProjectFlow';
import { classifyDiskIntent } from '@/lib/chatDiskIntent';
import { handleAddFileChatRequest, handleRenameFileChatRequest } from '@/lib/chatDiskOps';
import { buildRestorePointCommand, extractWriteFileContent, looksLikeRestorePointAsk } from '@/lib/chatPcTasks';
import '@/lib/chatProjectDebug';
import '@/lib/diskPathResolve';
import { runAgentCommand } from '@/lib/chatAgentExec';
import { parseNewProjectIntent } from '@/lib/createProjectIntent';
import '@/lib/chatTurnHandlers';
import '@/lib/chatApplySnapshotStore';
import '@/lib/projectScaffolds';
import { looksLikeImplementGo } from '@/lib/chatPlanMode';
import { looksLikeInPlaceRebuildAsk } from '@/lib/chatBuildIntent';
import { isProjectCreateBrief } from '@/lib/chatCreateBrief';
import { detectPlanFocus, extractGreenfieldName, looksLikeGreenfieldCreateGo, looksLikeGreenfieldHaveFolder, looksLikeGreenfieldIdea, looksLikeGreenfieldStartWorkGo, parseGreenfieldIdea, wantsPlanningOnly } from '@/lib/chatIdeaIntent';
import { hasActiveWorkspace, looksLikeCodeEditAsk, stripComposerPrefix } from '@/lib/chatAgentTurn';
import { isCreateTurn, planningHoldAllowed } from '@/lib/classifyTurn';
import {
  clearChatTurnStatus,
  forgetFinishedChatTurnStatus,
  setChatTurnStatus,
  pushChatTurnStatus,
} from '@/lib/chatTurnStatusStore';
import { consumePendingStudioBind } from '@/lib/pendingStudioBind';
import { getCreateJobForChat } from '@/lib/createJobStore';
import '@/hooks/useCreateJob';
import '@/lib/chatCodeReply';
import { messageHasImages } from '@/lib/chatMultiModel';
import '@/lib/codeGitHubWorkflow';
import { cloudKeyNudgeReply, markCloudKeyNudgeShown, shouldOfferCloudKeyNudge } from '@/lib/cloudKeyNudge';
import '@/lib/chatMultiModelBuild';
import '@/lib/createProgressCopy';
import '@/lib/hybridRoleRouting';
import '@/lib/previewBrowserSmoke';
import '@/lib/createBuildQuality';
import '@/lib/enginePick';
import { isChatTurnDead } from '@/lib/chatTurnIsolation';
import '@/lib/errors';
import { isVoiceTabEnabled } from '@/lib/featurePark';
import { notifyChatDone } from '@/lib/activityIndicators';
import '@/lib/speedTest';

import { getTokenUsageRatio, recordTokenUsage, syncTokenUsage, estimateTokens } from '@/lib/tokenUsage';
import { getModelHealthRatio } from '@/lib/modelHealth';
import '@/lib/modelRotation';
import { looksLikeThreadSummaryAsk, buildThreadSummaryFromMessages } from '@/lib/chatHistory';
import '@/lib/webSearch';
import '@/lib/threadBrain';
import { detectPluginIntent, getChatEnabledPlugins, getConnectedPlugins, getPluginById, getPluginRuntime, loadPluginState } from '@/lib/plugins';
import type { ChatMessage } from '@/types';
import { engineGenerateCancel } from '@/lib/novaEngine';
import '@/lib/chatMediaTurn';
import '@/lib/projectPreview';
import { cleanProductTitle } from '@/lib/freshSpaFromBrief';
import '@/lib/mobileTarget';
import '@/lib/mobileDevices';
import '@/lib/siteHeroImages';
import { applyAttachedChatImagesAsAssets, extractExplicitAssetUrls, looksLikeAssetLinkAsk, looksLikeUseAttachedAsset, materializeBrandAssets, planBrandAssets } from '@/lib/brandAssets';

import '@/views/aichat/aiChatHelpers';

export type AIChatSendCtx = Record<string, any>;

export type AIChatSendPrepResult =
  | { status: 'done' }
  | {
      status: 'owned' | 'media';
      content: string;
      mode: string;
      activeChatId: string;
      routeChatIdAtTurnStart?: string | null;
      backgroundAllowed?: boolean;
      regenerating?: boolean;
      assistantId: string;
      mySeq: number;
      replyStartedAt: number;
      pinnedModel: any;
      composerMode: any;
      isMediaMode: boolean;
      diskIntent: any;
      diskRoot: string | null;
      diskProjectId: string | null;
      diskWorkspaceName: string | null;
      stickyDiskTarget: any;
      resolvedStudio: any;
      userId: string;
      finishPlainReply: (text: string, provider?: string) => Promise<void>;
      pushAssistantStatus: (
        label: string,
        writingPath?: string | null,
        activity?: {
          kind?: import('@/lib/chatTurnActivity').ChatActivityKind;
          summary?: string;
          detail?: string;
          runStatus?: import('@/lib/chatTurnActivity').ChatActivityRunStatus;
          paths?: string[];
        },
      ) => void;
      stopIfSuperseded: () => Promise<boolean>;
      clearGeneratingIfMineEarly: () => void;
      commitStudioForChat: (...args: any[]) => void;
      persistStudioSnapshot: (...args: any[]) => void;
      persistModeThread: (...args: any[]) => void;
      renameChat: (...args: any[]) => void;
      addChat: (...args: any[]) => void;
      touchRecentProject?: (...args: any[]) => void;
      previewFromText: (...args: any[]) => any;
      setCodePillSticky: (...args: any[]) => void;
      setDeleteFilePrompt: (...args: any[]) => void;
      setDeleteProjectPrompt: (...args: any[]) => void;
      setDeleteFolderClarifyPrompt: (...args: any[]) => void;
      pendingFileDeleteRef: any;
      pendingProjectDeleteRef: any;
      pendingFolderClarifyRef: any;
      openFolderInChat: (...args: any[]) => any;
      lastFolderLocateNoteRef: any;
      chatStudioFilesRef: any;
      chatStudioDiskRootRef: any;
      chatStudioProjectIdRef: any;
      chatStudioDiskRoot: any;
      setChatStudioFiles: (...args: any[]) => void;
      setChatStudioDiskRoot: (...args: any[]) => void;
      setChatStudioProjectId: (...args: any[]) => void;
      setMessages: (...args: any[]) => void;
      messagesRef: any;
      genSeqRef: any;
      genSeqByChatRef?: any;
      stopRequestedRef: any;
      stopRequestedByChatRef?: any;
      threadBrainRef: any;
      pushLivePreview: (...args: any[]) => void;
      flushQueuedSend: (...args: any[]) => void;
      routeChatIdRef: any;
      user: any;
      providerLabel: any;
      genJobId: any;
      previousAssistant: any;
      statusLabel: any;
      videoDurationSec: any;
      pluginId: any;
      pluginState: any;
      normalized: any;
      userMsg: any;
      assistantMsg: any;
      priorForHistory: any;
      turnDiskRoot: any;
      turnProjectId: any;
      turnStudioFiles: any;
      threadKind: any;
      capacity: any;
      chats: any;
      chatRouteSeedRef: any;
      chatTurnCtlRef: any;
      imageBriefRef: any;
      messagesChatIdRef: any;
      persistTimerRef: any;
      previewUrlRef: any;
      setFailoverNote: (...args: any[]) => void;
      setThreadBrain: (...args: any[]) => void;
      setCreateLiveModelLabel?: (label: string | null) => void;
      setActiveModel?: (...args: any[]) => void;
      setIpcFallbackDev: (...args: any[]) => void;
      addCreation: (...args: any[]) => void;
      failoverChipText: any;
      setDropHint?: (...args: any[]) => void;
      setComposerMode?: (...args: any[]) => void;
      relPathFromDisk?: (filePath: string) => string | null;
    };

export async function prepareAIChatSend(content: string, ctx: AIChatSendCtx): Promise<AIChatSendPrepResult> {
  // Fix common mic mishears before the bubble is stored (Timmy ≠ teammate).
  try {
    const { scrubDictationTranscript } = await import('@/lib/voiceSession');
    content = scrubDictationTranscript(content);
  } catch { /* ignore */ }
  const { activeGenChatIdRef, activeModelRef, addChat, addCreation, capacity, chatPlugins, chatRouteSeedRef, chatStudioDiskRoot, chatStudioDiskRootRef, chatStudioFilesRef, chatStudioProjectIdRef, chatTurnCtlRef, chats, commitStudioForChat, composerMode, endTurnAndFlush, engineInstallingModels, failoverChipText, flushQueuedSend, genSeqRef, genSeqByChatRef, stopRequestedByChatRef, generatingRef, imageBriefRef, lastFolderLocateNoteRef, lastStudioIntentRef, messagesChatIdRef, messagesRef, mode, navigate, openFolderInChat, pendingFileDeleteRef, pendingFolderClarifyRef, pendingProjectDeleteRef, persistChatIdRef, persistModeThread, persistStudioSnapshot, persistTimerRef, previewFromText, previewUrlRef, pushLivePreview, renameChat, touchRecentProject, resolveStudioFiles, route, routeChatIdRef, runEphemeralVoiceTurn, setCapacity, setChatStudioDiskRoot, setChatStudioFiles, setChatStudioProjectId, setCodePillSticky, setDeleteFilePrompt, setDeleteFolderClarifyPrompt, setDeleteProjectPrompt, setFailoverNote, setGenerating, setIpcFallbackDev, setMessages, setModelRatio, setPreviewUrl, setThreadBrain, setCreateLiveModelLabel, setActiveModel, setDropHint, setTokenRatio, skipChatLoadIdsRef, stickToBottomRef, stopRequestedRef, studioBoundChatIdRef, threadBrainRef, threadKind, user, userDetachScrollRef, videoDurationSec, setComposerMode } = ctx;

  // Guest hydrate lag must not silent-drop Enter (Grok audit).
  const userId = user?.id || 'guest-local';
  try {
    setCreateLiveModelLabel?.(null);
  } catch { /* ignore */ }
  if (mode === 'voice') {
    if (!isVoiceTabEnabled()) return { status: 'done' };
    if (!content.trim()) content = '<!--nova-voice-turn-->';
    await runEphemeralVoiceTurn(content);
    return { status: 'done' };
  }
  if (!content.trim()) return { status: 'done' };
  // Wave 4/5 — slash skills, @mentions, session start, path rules, /map, /architect, grep.
  try {
    const studioFiles = chatStudioFilesRef.current || {};
    const {
      parseSlashSkill,
      resolveSlashSkillBody,
      expandAtMentions,
      loadSessionStartContext,
    } = await import('@/lib/inventWave4Pack');
    const w5 = await import('@/lib/inventWave5Pack');
    const slash = parseSlashSkill(content);
    if (slash) {
      if (slash.skill === 'map') {
        content = `${w5.buildRepoMapLite(studioFiles)}\n\n${slash.rest || 'Use this map for the next edit.'}`;
      } else if (slash.skill === 'grep' && slash.rest) {
        content = `${w5.formatInstantGrep(w5.instantGrepAcc(studioFiles, slash.rest))}\n\nQuery: ${slash.rest}`;
      } else if (slash.skill === 'architect') {
        const pair = w5.formatArchitectPair(slash.rest || content, 'project');
        content = `Architect mode.\n\n## Architect\n${pair.architect}\n\n## Editor\n${pair.editor}`;
      } else if (slash.skill === 'advisor') {
        content = w5.formatAdvisorPrompt(slash.rest || content, loadSessionStartContext(studioFiles));
      } else if (slash.skill === 'diff') {
        const key = String(chatStudioDiskRootRef.current || 'default');
        content = `${w5.diffSinceSnapshot(key, studioFiles)}\n\n${slash.rest || ''}`.trim();
      } else if (slash.skill === 'approvals') {
        const key = String(chatStudioDiskRootRef.current || 'default');
        if (/\bapprove\b/i.test(slash.rest || '')) {
          const n = w5.approveAll(key);
          content = `Approved ${n} pending invent/edit steps.`;
        } else {
          const list = w5.listApprovals(key);
          content = list.length
            ? ['Pending approvals:', ...list.map((a) => `- ${a.kind}: ${a.detail}`)].join('\n')
            : 'No pending approvals. Say `/approvals approve` after queuing.';
        }
      } else if (slash.skill === 'share') {
        const turns = (messagesRef.current || []).slice(-12).map((m: { role?: string; content?: string }) => ({
          role: String(m.role || 'user'),
          text: String(m.content || ''),
        }));
        const share = w5.shareConversationStub({ brand: 'project', turns });
        const next = { ...studioFiles, ...share };
        setChatStudioFiles(next);
        chatStudioFilesRef.current = next;
        content = 'Share transcript written to .nova/share-transcript.json (secrets redacted).';
      } else if (slash.skill === 'rewind' || slash.skill === 'undo') {
        content = slash.skill === 'undo'
          ? 'undo last invent git commit / rollback checkpoint'
          : 'rollback to last craft checkpoint';
      } else {
        const body = resolveSlashSkillBody(studioFiles, slash.skill);
        if (body) {
          content = [
            `Skill /${slash.skill} active.`,
            body.slice(0, 2000),
            slash.rest && `User follow-up: ${slash.rest}`,
          ].filter(Boolean).join('\n\n');
        }
      }
    }
    const perm = w5.parsePermissionMode(content);
    if (perm && studioFiles) {
      const next = { ...studioFiles, ...w5.permissionModeFiles(perm) };
      setChatStudioFiles(next);
      chatStudioFilesRef.current = next;
    }
    const style = w5.parseOutputStyle(content);
    if (style) {
      const next = { ...chatStudioFilesRef.current, ...w5.outputStyleFiles(style) };
      setChatStudioFiles(next);
      chatStudioFilesRef.current = next;
    }
    if (/@[\w./"\\-]/.test(content) && Object.keys(studioFiles).length) {
      const expanded = expandAtMentions(content, studioFiles);
      if (expanded.attached.length) {
        content = expanded.text;
      }
    }
    if (
      Object.keys(studioFiles).length
      && /\b(?:create|invent|build|edit|redesign|fix)\b/i.test(content)
      && !/Session start context/i.test(content)
    ) {
      const boot = loadSessionStartContext(studioFiles);
      const rules = w5.loadPathScopedRules(studioFiles, [
        'src/App.jsx',
        'src/App.css',
        'public/logo.svg',
      ]);
      const inject = [boot, rules].filter(Boolean).join('\n\n').slice(0, 3500);
      if (inject) content = `${content}\n\n${inject}`;
    }
  } catch { /* optional */ }
  // New send → follow the reply; history scroll stays free until the user scrolls up again.
  stickToBottomRef.current = true;
  userDetachScrollRef.current = false;
  // Only cancel a prior engine job when THIS chat already has a turn in flight.
  if (generatingRef.current) {
    const cancelChatId = activeGenChatIdRef.current
      || routeChatIdRef.current
      || persistChatIdRef.current
      || undefined;
    const nextChatGuess = (route.name === 'chat' && !route.chatId)
      ? null
      : (routeChatIdRef.current || persistChatIdRef.current || null);
    // Do not cancel another chat's create when the user sends elsewhere.
    if (!cancelChatId || !nextChatGuess || cancelChatId === nextChatGuess) {
      void engineGenerateCancel(cancelChatId ? { chatId: cancelChatId } : undefined);
    }
  }
  // Do NOT clear generatingRef here — handleSend sets it early to block double Enter
  // from starting two creates / queueing the same prompt on itself.
  stopRequestedRef.current = false;
  setFailoverNote(null);
  setIpcFallbackDev(false);
  // Prefer live route id. Blank starters (no chatId) always mint a new id. never reuse persist.
  const blankStarter = route.name === 'chat' && !route.chatId;
  const routeChatIdAtTurnStart = route.name === 'chat' ? (route.chatId || routeChatIdRef.current || null) : null;
  let activeChatId = blankStarter
    ? undefined
    : (routeChatIdRef.current || persistChatIdRef.current || undefined);
  const isNewChat = !activeChatId;
  if (!activeChatId) {
    activeChatId = `chat-${crypto.randomUUID().slice(0, 10)}`;
    skipChatLoadIdsRef.current.add(activeChatId);
    messagesRef.current = [];
    messagesChatIdRef.current = activeChatId;
    // New chat always starts with an empty studio — never copy the previous chat's bind.
    chatStudioFilesRef.current = {};
    setChatStudioFiles({});
    chatStudioDiskRootRef.current = null;
    setChatStudioDiskRoot(null);
    chatStudioProjectIdRef.current = null;
    setChatStudioProjectId(null);
    studioBoundChatIdRef.current = activeChatId;
    lastStudioIntentRef.current = null;
    setPreviewUrl(null);
    // Only consume a pending folder attach when it was staged for a brand-new chat.
    consumePendingStudioBind({
      setDiskRoot: (root) => {
        chatStudioDiskRootRef.current = root;
        setChatStudioDiskRoot(root);
      },
      setFiles: (files) => {
        setChatStudioFiles(files);
        chatStudioFilesRef.current = files;
      },
      setProjectId: (id) => { chatStudioProjectIdRef.current = id; },
    });
    const boundRoot = chatStudioDiskRootRef.current;
    const boundFiles = chatStudioFilesRef.current;
    if (boundRoot || Object.keys(boundFiles).length) {
      persistStudioSnapshot(activeChatId, {
        files: boundFiles,
        projectId: chatStudioProjectIdRef.current,
        name: boundRoot ? studioPathBasename(boundRoot) : undefined,
        diskRoot: boundRoot,
      });
    }
  } else {
    const existing = chats.find((c: any) => c.id === activeChatId);
    addChat({
      id: activeChatId,
      mode,
      title: existing?.title || titleFromPrompt(content),
      updatedAt: new Date().toISOString(),
      creationId: existing?.creationId,
      preview: previewFromText(content),
    });
  }
  // Per-chat generation id — sending in another chat must not abort this create.
  const prevChatSeq = (genSeqByChatRef?.current?.[activeChatId] as number) || 0;
  const mySeq = prevChatSeq + 1;
  if (genSeqByChatRef?.current) genSeqByChatRef.current[activeChatId] = mySeq;
  if (stopRequestedByChatRef?.current) stopRequestedByChatRef.current[activeChatId] = false;
  genSeqRef.current = mySeq;
  persistChatIdRef.current = activeChatId;
  routeChatIdRef.current = activeChatId;
  activeGenChatIdRef.current = activeChatId;
  // Capture workspace binding for THIS turn so New Chat / Recent switch cannot redirect disk apply.
  let turnDiskRoot = chatStudioDiskRootRef.current;
  let turnProjectId = chatStudioProjectIdRef.current;
  let turnStudioFiles = { ...chatStudioFilesRef.current };
  // Bind unknown pending folder attach to this chat id for follow-ups.
  if (chatStudioDiskRootRef.current || Object.keys(chatStudioFilesRef.current).length) {
    const meta = parseChatAttach(content) || parseChatAttaches(content)[0];
    persistStudioSnapshot(activeChatId, {
      name: meta?.name || (chatStudioDiskRootRef.current
        ? studioPathBasename(chatStudioDiskRootRef.current)
        : undefined),
      projectId: chatStudioProjectIdRef.current || meta?.projectId || null,
      diskRoot: chatStudioDiskRootRef.current,
      files: chatStudioFilesRef.current,
    });
    studioBoundChatIdRef.current = activeChatId;
  }
  setTokenRatio(
    Object.keys(chatStudioFilesRef.current).length
      ? getTokenUsageRatio(activeChatId)
      : recordTokenUsage(activeChatId, content),
  );
  setModelRatio(getModelHealthRatio(activeChatId));
  const pinnedModel = activeModelRef.current;

  const userMsg: ChatMessage = {
    id: crypto.randomUUID(),
    user_id: userId,
    project_id: null,
    role: 'user',
    content,
    provider_used: null,
    created_at: new Date().toISOString(),
  };

  const livePlugins = (() => {
    const map = loadPluginState();
    const connected = getConnectedPlugins(map);
    if (connected.length) return connected;
    return getChatEnabledPlugins(map);
  })();
  const enabledIds = livePlugins.length
    ? livePlugins.map((p: any) => p.id)
    : chatPlugins.map((p: any) => p.id);
  const pluginId = detectPluginIntent(content, enabledIds);
  const pluginState = pluginId ? getPluginRuntime(pluginId, loadPluginState()) : null;
  const pluginMeta = pluginId
    ? (livePlugins.find((p: any) => p.id === pluginId) || chatPlugins.find((p: any) => p.id === pluginId) || getPluginById(pluginId))
    : null;
  const providerLabel = pluginId
    ? `${pluginMeta?.name ?? 'Plugin'}${pluginState?.accountLabel ? ` · @${pluginState.accountLabel}` : ' · live'}`
    : pinnedModel.source === 'auto'
      ? 'Nova Auto'
      : `${pinnedModel.source === 'local' ? 'Local' : 'Cloud'} · ${pinnedModel.name}`;

  const assistantId = crypto.randomUUID();
  const isMediaMode = mode === 'image' || mode === 'video';
  // Reading… only when THIS message includes an upload. not leftover studio files.
  const readingAttach = /<!--nova-attach:/.test(content)
    || /<!--nova-auto-read-->/.test(content)
    || /!\[[^\]]*\]\(nova-media:/.test(content)
    || /!\[[^\]]*\]\(data:image\//.test(content);
  const statusLabel = isMediaMode
    ? MEDIA_GEN_STAGES[String() as keyof typeof MEDIA_GEN_STAGES][0].label
    : readingAttach
      ? 'Reading…'
      : 'Thinking…';
  const assistantMsg: ChatMessage = {
    id: assistantId,
    user_id: userId,
    project_id: null,
    role: 'assistant',
    content: isMediaMode
      ? `__generating__:${mode}:${statusLabel}`
      : `__generating__:chat:${statusLabel}`,
    provider_used: providerLabel,
    created_at: new Date().toISOString(),
  };

  // Sync ref immediately so history / queue flushes don't see a stale thread.
  const normalized = messagesRef.current.map((m: any) => (
    m.role === 'assistant' && String(m.content || '').startsWith('__generating__:')
      ? { ...m, content: '(no response)' }
      : m
  ));
  const priorForHistory = normalized.filter((m: any) => {
    const c = String(m.content || '');
    if (!c || c.startsWith('__progress__:')) return false;
    if (c === '(no response)') return false;
    return true;
  });
  const previousAssistant = [...priorForHistory].reverse().find((m: any) => m.role === 'assistant')?.content || '';
  // Try-again: last bubble is already this user prompt — do not append a duplicate.
  const lastMsg = normalized[normalized.length - 1];
  const sameUserOpen =
    lastMsg?.role === 'user'
    && String(lastMsg.content || '').trim() === String(content || '').trim();
  const regenerating = Boolean(ctx.regeneratePendingRef?.current) || sameUserOpen;
  if (ctx.regeneratePendingRef) ctx.regeneratePendingRef.current = false;
  let nextThread: ChatMessage[] = sameUserOpen ? [...normalized] : [...normalized, userMsg];
  // One-reply rule: Try again / regenerate replaces assistants after the last user
  // bubble — never stack a second answer under the same prompt.
  if (regenerating) {
    let lastUserIdx = -1;
    for (let i = nextThread.length - 1; i >= 0; i--) {
      if (nextThread[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx >= 0) {
      for (const m of nextThread.slice(lastUserIdx + 1)) {
        if (m.role === 'assistant') forgetFinishedChatTurnStatus(m.id);
      }
      nextThread = nextThread.filter((m, i) => !(i > lastUserIdx && m.role === 'assistant'));
    }
  }
  if (shouldOfferCloudKeyNudge({
    chatId: activeChatId,
    message: content,
    hasLocalBrain: Boolean(capacity?.localGguf || capacity?.ollama),
  })) {
    markCloudKeyNudgeShown(activeChatId);
    nextThread.push({
      id: crypto.randomUUID(),
      user_id: userId,
      project_id: null,
      role: 'assistant',
      content: cloudKeyNudgeReply(),
      provider_used: 'NOVA',
      created_at: new Date().toISOString(),
    });
  }
  nextThread.push(assistantMsg);
  messagesRef.current = nextThread;
  messagesChatIdRef.current = activeChatId;
  persistModeThread(mode, messagesRef.current, { chatId: activeChatId });
  setMessages(messagesRef.current);
  // One __generating__ seed in messages; live labels go through the status store only.
  setChatTurnStatus({ chatId: activeChatId, assistantId, label: statusLabel, history: [{ label: statusLabel, at: Date.now() }] });
  generatingRef.current = true;
  const genJobId = crypto.randomUUID();
  beginChatInflight(activeChatId, genJobId);
  let inflightEnded = false;
  const endInflightOnce = () => {
    if (inflightEnded) return;
    inflightEnded = true;
    endChatInflight(activeChatId);
  };
  setGenerating(true);
  if (isMediaMode) {
    try {
      sessionStorage.setItem(
        'NOVA:inflight-media',
        JSON.stringify({ chatId: activeChatId, mode, startedAt: Date.now() }),
      );
    } catch {
      /* ignore */
    }
  }

  if (isNewChat) {
    addChat({
      id: activeChatId,
      mode,
      title: titleFromPrompt(content),
      updatedAt: new Date().toISOString(),
      preview: previewFromText(content),
    });
    navigate({
      name: 'chat',
      mode: mode === 'general' ? undefined : mode,
      chatId: activeChatId,
    });
  }

  getLocalPrefs();
  const replyStartedAt = Date.now();

  const clearGeneratingIfMineEarly = () => {
    // Drop Stop first — never paint Done while Stop is still visible.
    endInflightOnce();
    if (mySeq !== genSeqRef.current) {
      clearChatTurnStatus(assistantId);
      return;
    }
    generatingRef.current = false;
    if (activeGenChatIdRef.current === activeChatId) {
      activeGenChatIdRef.current = null;
    }
    setGenerating(false);
    clearChatTurnStatus(assistantId);
  };

  const finishPlainReply = async (replyText: string, providerUsed?: string) => {
    // One-reply rule: never commit a superseded turn's text into a new bubble.
    const liveSeq = (genSeqByChatRef?.current?.[activeChatId] as number) ?? genSeqRef.current;
    const stopped = Boolean(
      stopRequestedByChatRef?.current?.[activeChatId]
      || stopRequestedRef.current,
    );
    const stopNote = /^(?:Stopped\.?|Stopped —)/i.test(String(replyText || '').trim());
    // After Stop: only allow the stop note itself — never swap in a late create/craft reply.
    if (stopped && !stopNote) {
      clearChatTurnStatus(assistantId);
      endInflightOnce();
      return;
    }
    if (mySeq !== liveSeq && !stopNote) {
      clearChatTurnStatus(assistantId);
      endInflightOnce();
      return;
    }
    // Continuity: never replace a solid streamed reply with an unrelated final draft.
    try {
      const cur = (messagesRef.current || []).find((m: { id?: string }) => m.id === assistantId);
      const prevText = String(cur?.content || '').trim();
      const nextText = String(replyText || '').trim();
      if (
        prevText
        && nextText
        && !prevText.startsWith('__generating__:')
        && prevText !== '(stopped)'
        && !/^(?:Stopped\.?|Stopped —)/i.test(prevText)
        && prevText.length >= 24
        && nextText !== prevText
        && !stopNote
      ) {
        const prefixLen = Math.min(40, prevText.length, nextText.length);
        const sameFamily = prefixLen >= 12
          && (nextText.startsWith(prevText.slice(0, prefixLen)) || prevText.startsWith(nextText.slice(0, prefixLen)));
        const intentionalRewrite = /I applied those updates on disk|Updating your project files on disk|I updated the project files|Created |Live /i.test(nextText);
        if (!sameFamily && !intentionalRewrite) {
          replyText = prevText;
        }
      }
    } catch { /* keep replyText */ }
    // Drop Stop immediately — never show Done + Stop together.
    generatingRef.current = false;
    if (activeGenChatIdRef.current === activeChatId) {
      activeGenChatIdRef.current = null;
    }
    setGenerating(false);
    clearChatTurnStatus(assistantId);
    const safeText = redactArkSelfLeak(replyText);
    const reply: ChatMessage = {
      id: assistantId,
      user_id: user?.id ?? 'guest',
      project_id: null,
      role: 'assistant',
      content: safeText,
      provider_used: (providerUsed && providerUsed.trim()) || 'NOVA',
      created_at: new Date().toISOString(),
      elapsed_ms: Date.now() - replyStartedAt,
    };
    const threadChatId = activeChatId;
    const routeChat = routeChatIdRef.current;
    const viewingThisThread = Boolean(routeChat && threadChatId && routeChat === threadChatId);
    const patch = (list: ChatMessage[]) => list.map((m: any) => (m.id === assistantId ? reply : m));
    let next = viewingThisThread
      ? patch(messagesRef.current)
      : (() => {
        try {
          const raw = localStorage.getItem(chatThreadKey(threadChatId));
          const stored = raw ? JSON.parse(raw) as ChatMessage[] : [];
          if (Array.isArray(stored) && stored.some(m => m.id === assistantId)) return patch(stored);
        } catch { /* ignore */ }
        return patch(messagesRef.current);
      })();
    if (!next.some(m => m.id === assistantId)) {
      try {
        const raw = localStorage.getItem(chatThreadKey(threadChatId));
        const stored = raw ? JSON.parse(raw) as ChatMessage[] : [];
        if (Array.isArray(stored) && stored.some(m => m.id === assistantId)) next = patch(stored);
      } catch { /* ignore */ }
    }
    if (viewingThisThread) {
      messagesRef.current = next;
      messagesChatIdRef.current = threadChatId;
      setMessages(next);
    }
    persistModeThread(mode, next, { chatId: threadChatId });
    // Ring tracks spoken reply pressure — not the embedded nova-trace JSON (file lists).
    setTokenRatio(syncTokenUsage(threadChatId, estimateTokens(
      isCatalogMessage(replyText)
        ? 'folder catalog summary'
        : (stripAgentTrace(replyText) || replyText),
    )));
    clearGeneratingIfMineEarly();
    notifyChatDone(threadChatId);
    endTurnAndFlush(mySeq, threadChatId);
  };

  const stopIfSuperseded = async (note?: string) => {
    const liveSeq = (genSeqByChatRef?.current?.[activeChatId] as number) || genSeqRef.current;
    // Stop must stick even after handleStop nulls activeGenChatIdRef — otherwise create
    // keeps healing / Style hopping in the background after the UI shows "(stopped)".
    const stopped = Boolean(
      stopRequestedByChatRef?.current?.[activeChatId]
      || stopRequestedRef.current,
    );
    const turnDead = isChatTurnDead({
      originChatId: activeChatId,
      routeChatId: routeChatIdRef.current,
      routeAtStartChatId: routeChatIdAtTurnStart,
      sequence: mySeq,
      currentSequence: liveSeq,
      stopped,
      keepBackground: true,
    });
    if (!turnDead) return false;
    try {
      const job = getCreateJobForChat(activeChatId);
      if (job && (job.status === 'writing' || job.status === 'npm' || job.status === 'verifying')) {
        const { markCreateJobFailed } = await import('@/lib/createJobStore');
        markCreateJobFailed(job.id, 'Stopped');
      }
    } catch { /* ignore */ }
    await finishPlainReply(
      note
      || (stopped
        ? 'Stopped.'
        : 'Stopped — another message started while this was still running.'),
    );
    return true;
  };

  if (looksLikeHarmfulContentAsk(content)) {
    // Brief pause so the reply reads like a normal answer, not a 1 ms stub.
    await new Promise<void>(r => window.setTimeout(r, 480 + Math.floor(Math.random() * 220)));
    await finishPlainReply(harmfulContentBlockedReply());
    return { status: 'done' };
  }

  if (looksLikeArkSelfHarmAsk(content)) {
    await new Promise<void>(r => window.setTimeout(r, 360 + Math.floor(Math.random() * 180)));
    await finishPlainReply(arkSelfHarmBlockedReply());
    return { status: 'done' };
  }

  // Summarize-this-chat must never fall into folder/debug/create routing.
  if (looksLikeThreadSummaryAsk(content)) {
    let threadMsgs = messagesRef.current.filter((m: any) => m.id !== assistantId);
    if (activeChatId) {
      try {
        const raw = localStorage.getItem(chatThreadKey(activeChatId));
        if (raw) {
          const parsed = JSON.parse(raw) as ChatMessage[];
          if (Array.isArray(parsed) && parsed.length >= threadMsgs.length) {
            threadMsgs = parsed.filter((m: any) => m.id !== assistantId);
          }
        }
      } catch { /* keep threadMsgs */ }
    }
    const localSummary = buildThreadSummaryFromMessages([
      ...threadMsgs,
      { role: 'user', content },
    ]);
    await new Promise<void>(r => window.setTimeout(r, 280 + Math.floor(Math.random() * 180)));
    await finishPlainReply(localSummary);
    return { status: 'done' };
  }

  // #8 — Await live capacity before create/build/router so fresh installs never silent-fail.
  if (!pluginId && (mode === 'general' || mode === 'code')) {
    let liveCap = capacity;
    try {
      liveCap = await probeLiveCapacity();
      setCapacity(liveCap);
    } catch {
      /* keep prior capacity */
    }
    if (liveCap && !liveCap.liveChat) {
      const installing = engineInstallingModels[0];
      const honest = installing
        ? [
          `Your local brain is still downloading${installing.detail ? ` (${installing.detail})` : ''}.`,
          '',
          'Hang tight until it says Ready — then send again. (A free cloud key also works right away.)',
          '',
          tipAt(tipStartIndex()),
        ].join('\n')
        : honestNoLiveChatReply();
      await finishPlainReply(honest, installing ? 'NOVA · installing' : 'NOVA · setup needed');
      return { status: 'done' };
    }
  }

  // Recover folder files from every source before unknown model call.
  let resolvedStudio: Awaited<ReturnType<typeof resolveStudioFiles>>;
  try {
    resolvedStudio = await Promise.race([
      resolveStudioFiles({
        chatId: activeChatId,
        memoryFiles: chatStudioFilesRef.current,
        memoryProjectId: chatStudioProjectIdRef.current,
        memoryDiskRoot: chatStudioDiskRootRef.current,
        messages: messagesRef.current,
      }),
      new Promise<Awaited<ReturnType<typeof resolveStudioFiles>>>((resolve) => {
        window.setTimeout(() => {
          resolve({
            files: chatStudioFilesRef.current,
            projectId: chatStudioProjectIdRef.current,
            diskRoot: chatStudioDiskRootRef.current,
          });
        }, 2_500);
      }),
    ]);
  } catch {
    resolvedStudio = {
      files: chatStudioFilesRef.current,
      projectId: chatStudioProjectIdRef.current,
      diskRoot: chatStudioDiskRootRef.current,
    };
  }

  if (Object.keys(resolvedStudio.files).length || resolvedStudio.diskRoot || resolvedStudio.projectId) {
    if (Object.keys(resolvedStudio.files).length) {
      setChatStudioFiles(resolvedStudio.files);
      chatStudioFilesRef.current = resolvedStudio.files;
      turnStudioFiles = { ...resolvedStudio.files };
    }
    if (resolvedStudio.projectId) {
      setChatStudioProjectId(resolvedStudio.projectId);
      chatStudioProjectIdRef.current = resolvedStudio.projectId;
      turnProjectId = resolvedStudio.projectId;
    }
    if (resolvedStudio.diskRoot) {
      setChatStudioDiskRoot(resolvedStudio.diskRoot);
      chatStudioDiskRootRef.current = resolvedStudio.diskRoot;
      turnDiskRoot = resolvedStudio.diskRoot;
    }
    persistStudioSnapshot(activeChatId, {
      files: Object.keys(resolvedStudio.files).length ? resolvedStudio.files : turnStudioFiles,
      projectId: resolvedStudio.projectId || turnProjectId,
      name: resolvedStudio.name,
      diskRoot: resolvedStudio.diskRoot || turnDiskRoot,
    });
  }

  const pushAssistantStatus = (
    label: string,
    writingPath?: string | null,
    activity?: {
      kind?: import('@/lib/chatTurnActivity').ChatActivityKind;
      summary?: string;
      detail?: string;
      runStatus?: import('@/lib/chatTurnActivity').ChatActivityRunStatus;
      paths?: string[];
    },
  ) => {
    const liveSeq = (genSeqByChatRef?.current?.[activeChatId] as number) ?? genSeqRef.current;
    const stopped = Boolean(
      stopRequestedByChatRef?.current?.[activeChatId]
      || (stopRequestedRef.current && activeGenChatIdRef.current === activeChatId),
    );
    if (mySeq !== liveSeq || stopped) return;
    // Status lives in a store — never remount chat messages every tick (S007).
    pushChatTurnStatus({
      chatId: activeChatId,
      assistantId,
      label: String(label || '').trim() || 'Thinking…',
      writingPath,
      kind: activity?.kind,
      summary: activity?.summary,
      detail: activity?.detail,
      runStatus: activity?.runStatus,
      paths: activity?.paths,
    });
  };
  // Rolldown drops the IIFE closure on this name — call via ref inside the async turn.
  chatTurnCtlRef.current.pushStatus = pushAssistantStatus;

  

  

  const recentUserLines = messagesRef.current
    .filter((m: any) => m.role === 'user')
    .map((m: any) => String(m.content || ''));
  const stickyDiskTarget = getLastDiskTarget(activeChatId);
  const { normalizeMessyUserAsk } = await import('@/lib/editAskResolve');
  const intentText = normalizeMessyUserAsk(
    stripComposerPrefix(content)
      .replace(/!\[[^\]]*]\(data:image\/[^)]+\)/gi, ' ')
      .replace(/!\[[^\]]*]\(nova-media:[^)]+\)/gi, ' '),
  );
  // Step-ladder / New Chat miss: UI edit with no Folder bind → reuse latest create on disk
  // so Code / Live / Folder pills return and the turn actually writes (not teach-mode chat).
  if (!(resolvedStudio.diskRoot || chatStudioDiskRootRef.current) && looksLikeCodeEditAsk(intentText)) {
    try {
      const { getLatestReusableCreateJob } = await import('@/lib/createJobStore');
      // Chat-owned only — never steal another chat's project (App↔VoltCore misbind).
      const job = getLatestReusableCreateJob({ chatId: activeChatId });
      if (job?.path) {
        const files = { ...(job.files || {}) };
        resolvedStudio = {
          files,
          projectId: job.projectId || null,
          diskRoot: job.path,
          name: job.name,
        };
        setChatStudioFiles(files);
        chatStudioFilesRef.current = files;
        turnStudioFiles = { ...files };
        if (job.projectId) {
          setChatStudioProjectId(job.projectId);
          chatStudioProjectIdRef.current = job.projectId;
          turnProjectId = job.projectId;
        }
        setChatStudioDiskRoot(job.path);
        chatStudioDiskRootRef.current = job.path;
        turnDiskRoot = job.path;
        persistStudioSnapshot(activeChatId, {
          files,
          projectId: job.projectId || null,
          name: job.name,
          diskRoot: job.path,
        });
        pushAssistantStatus(`Bound · ${job.name || 'project'} (continuing on disk)…`);
      }
    } catch { /* best-effort */ }
  }
  const diskIntent = classifyDiskIntent(intentText, {
    recentUserMessages: recentUserLines,
    pendingAddFile: getLastPendingAddFile(activeChatId)?.fileName || null,
    stickyDiskTarget,
  });
  const diskRoot = resolvedStudio.diskRoot || chatStudioDiskRootRef.current;
  const diskProjectId = resolvedStudio.projectId || chatStudioProjectIdRef.current || null;
  const diskWorkspaceName = resolvedStudio.name || loadChatStudio(activeChatId)?.name || null;

  // Photo-as-hero/logo must win over "add a file / where should this go?" routing.
  if (
    messageHasImages(content)
    && looksLikeUseAttachedAsset(content)
    && diskRoot
  ) {
    const placed = await applyAttachedChatImagesAsAssets({
      diskRoot,
      files: { ...(resolvedStudio.files || chatStudioFilesRef.current || {}) },
      message: content,
    });
    if (placed.ok) {
      clearLastPendingAddFile(activeChatId);
      setChatStudioFiles({ ...placed.files });
      chatStudioFilesRef.current = { ...placed.files };
      commitStudioForChat(activeChatId, {
        files: placed.files,
        projectId: diskProjectId,
        name: diskWorkspaceName || resolvedStudio.name,
        diskRoot,
      });
      const where = placed.saved.length
        ? placed.saved.map((p) => p.replace(/^public\//, '/')).join(', ')
        : 'public/';
      await finishPlainReply(
        `Saved your photo${placed.saved.length > 1 ? 's' : ''} into **${where}** and wired ${
          placed.saved.length > 1 ? 'them' : 'it'
        } as the **${placed.role || 'hero'}**. Preview should refresh — say if you want a different section.`,
      );
      return { status: 'done' };
    }
  }

  // Pasted icon/image URLs (Iconify, Unsplash, etc.) → download into public/ on the bound project.
  // Full UI rebuild asks ("make it richer", landing/hero/footer) must fall through to edit/create —
  // Unsplash URLs alone must not short-circuit into brand-assets-only.
  const looksLikeFullUiRebuildAsk = /\b(?:richer|premium|landing|rebuild|hero|footer|hours|sections?)\b/i.test(content);
  if (
    diskRoot
    && looksLikeAssetLinkAsk(content)
    && !looksLikeFullUiRebuildAsk
    && (extractExplicitAssetUrls(content).length > 0 || /lucide:|simple-icons:|iconify/i.test(content))
  ) {
    pushAssistantStatus('Importing icons and images from your links…');
    try {
      const plan = planBrandAssets(content, diskWorkspaceName || resolvedStudio.name || 'project');
      const installed = await materializeBrandAssets({
        diskRoot,
        files: { ...(resolvedStudio.files || chatStudioFilesRef.current || {}) },
        plan,
        brief: content,
        projectName: diskWorkspaceName || resolvedStudio.name || 'project',
      });
      if (installed.saved.length) {
        setChatStudioFiles({ ...installed.files });
        chatStudioFilesRef.current = { ...installed.files };
        commitStudioForChat(activeChatId, {
          files: installed.files,
          projectId: diskProjectId,
          name: diskWorkspaceName || resolvedStudio.name,
          diskRoot,
        });
        await finishPlainReply(
          `${installed.note}\n\nWired into the project. Open **Preview** to review — say if you want different icons or another photo.`,
        );
        return { status: 'done' };
      }
    } catch {
      /* fall through to normal edit / chat */
    }
  }

  const relPathFromDisk = (filePath: string): string | null => {
    if (!diskRoot || !filePath) return null;
    const normRoot = diskRoot.replace(/[/\\]+$/, '');
    if (!filePath.startsWith(normRoot)) return null;
    return filePath.slice(normRoot.length).replace(/^[/\\]/, '') || null;
  };

  // Disk intents. delete_file → delete_project → add_file.
  // Create/build briefs and same-chat scrap/rebuild are excluded (see chatDiskIntent).
  const skipDiskForInPlaceRebuild = looksLikeInPlaceRebuildAsk(intentText);
  const skipDiskForCodeEdit = looksLikeCodeEditAsk(intentText)
    && hasActiveWorkspace({
      files: resolvedStudio.files,
      projectId: resolvedStudio.projectId || turnProjectId,
      diskRoot: resolvedStudio.diskRoot || turnDiskRoot,
    })
    && (
      diskIntent.type === 'none'
      || diskIntent.type === 'delete_file'
    );
  if ((mode === 'general' || mode === 'code') && !skipDiskForInPlaceRebuild && !skipDiskForCodeEdit) {
    // delete → early dispatchOwnedTurn (WAVE 1)

    if (diskIntent.type === 'rename_file') {
      pushAssistantStatus('Renaming…');
      const renameOutcome = await handleRenameFileChatRequest({
        fromName: diskIntent.fromName,
        toName: diskIntent.toName,
        parentHint: diskIntent.parentHint,
        workspaceDiskRoot: diskRoot,
        stickyTarget: getLastDiskTarget(activeChatId),
        lastListedFolder: getLastListedFolder(activeChatId),
      });
      if (renameOutcome.kind === 'done') {
        setLastDiskTarget(activeChatId, {
          path: renameOutcome.filePath,
          name: renameOutcome.toName,
          kind: 'file',
        });
        await finishPlainReply(
          `Renamed **${renameOutcome.fromName}** → **${renameOutcome.toName}**.\n\n\`${renameOutcome.filePath}\``,
        );
        return { status: 'done' };
      }
      await finishPlainReply(renameOutcome.text);
      return { status: 'done' };
    }

    if (diskIntent.type === 'add_file' && !isProjectCreateBrief(intentText) && !looksLikeUseAttachedAsset(content)) {
      // UI shells (upload drop zone, etc.) are never loose Desktop file creates.
      if (isUiShellAsk(intentText) || looksLikeCodeEditAsk(intentText) && /\b(?:upload|drop\s+zone)\b/i.test(intentText)) {
        /* fall through to studio / agent apply */
      } else {
      // Pure create-file (esp. .md) must hit disk — don't divert to code-edit when it's clearly a new file.
      const pureCreateFile =
        !looksLikeCodeEditAsk(intentText)
        || /\.(md|txt|json|csv)\b/i.test(diskIntent.name || intentText)
        || /\bmarkdown\b|\breadme\b/i.test(intentText);
      if (!pureCreateFile) {
        /* fall through to studio / agent apply */
      } else {
      pushAssistantStatus('Creating file…');
      const addOutcome = await handleAddFileChatRequest({
        fileName: diskIntent.name,
        parentHint: diskIntent.parentHint,
        content: extractWriteFileContent(content) ?? (
          /\.md$/i.test(diskIntent.name || '')
            ? `# ${String(diskIntent.name || 'notes').replace(/\.md$/i, '')}\n\n`
            : ''
        ),
        workspaceDiskRoot: diskRoot,
        workspaceProjectId: diskProjectId,
        workspaceName: diskWorkspaceName,
        stickyTarget: stickyDiskTarget,
        lastListedFolder: getLastListedFolder(activeChatId),
      });
      if (await stopIfSuperseded()) return { status: 'done' };

      if (addOutcome.kind === 'reply') {
        if (diskIntent.name) {
          setLastPendingAddFile(activeChatId, diskIntent.name);
        }
        await finishPlainReply(addOutcome.text);
        return { status: 'done' };
      }
      if (addOutcome.kind === 'done') {
        clearLastPendingAddFile(activeChatId);
        setLastDiskTarget(activeChatId, {
          path: addOutcome.filePath,
          name: addOutcome.fileName,
          kind: 'file',
        });
        const parentDir = addOutcome.filePath.replace(/[/\\][^/\\]+$/, '');
        if (parentDir) {
          setLastListedFolder(activeChatId, {
            path: parentDir,
            name: parentDir.split(/[/\\]/).pop() || 'folder',
          });
        }
        if (diskProjectId) {
          const nextFiles = {
            ...resolvedStudio.files,
            [addOutcome.fileName]: '',
          };
          resolvedStudio.files = nextFiles;
          setChatStudioFiles(nextFiles);
          chatStudioFilesRef.current = nextFiles;
          persistStudioSnapshot(activeChatId, {
            files: nextFiles,
            projectId: diskProjectId,
            name: diskWorkspaceName || undefined,
            diskRoot: diskRoot || null,
          });
        }
        await finishPlainReply(
          `Created file **${addOutcome.fileName}**.\n\n\`${addOutcome.filePath}\``,
        );
        return { status: 'done' };
      }
      }
      }
    }
  }

  // PC system tasks. restore point, read file (no workspace required; Full PC / Desktop grant).
  if ((mode === 'general' || mode === 'code') && hasFolderAccessGrant()) {
    await syncWorkspaceGrantsFromPrefs();
    const homeCwd = (await window.novaDesktop?.browseRoots?.())?.roots?.find(r => r.id === 'home')?.path
      || chatStudioDiskRootRef.current
      || diskRoot
      || undefined;

    if (looksLikeRestorePointAsk(content) && window.novaDesktop?.agentRun) {
      const cmd = buildRestorePointCommand(`NOVA ${new Date().toLocaleDateString()}`);
      const restoreOutcome = await runAgentCommand({
        command: cmd,
        cwd: homeCwd || 'C:\\Users',
        confirmLabel: `Create a Windows restore point for today?\n\n${cmd}\n\nWindows may ask for administrator permission.`,
      });
      if (restoreOutcome.needsConfirm) {
        const { command, cwd, label } = restoreOutcome.needsConfirm;
        if (!window.confirm(`Run on your PC?\n\n${label}`)) {
          await finishPlainReply('Restore point canceled.');
          return { status: 'done' };
        }
        setMessages((prev: any) => prev.map((m: any) => (
          m.id === assistantId ? { ...m, content: '__generating__:chat:Creating restore point…' } : m
        )));
        const ran = await runAgentCommand({ command, cwd, skipConfirm: true });
        const text = ran.reply?.includes('Access is denied') || ran.reply?.toLowerCase().includes('elevated')
          ? `${ran.reply}\n\nWindows restore points need **Run as administrator**. Approve the UAC prompt if it appears, or run NOVA as admin once.`
          : (ran.reply || 'Restore point finished.');
        await finishPlainReply(text);
        return { status: 'done' };
      }
      if (restoreOutcome.handled && restoreOutcome.reply) {
        await finishPlainReply(restoreOutcome.reply);
        return { status: 'done' };
      }
    }
  }

  // Chip handlers for pending greenfield. MUST run even when message is just "Keep planning"
  // (that phrase alone is not a greenfield idea, so it used to fall through to the local model).
  // SSOT: planningHoldAllowed / isCreateTurn — never hold when classifyTurn says create.
  const createWinsThisTurn = isCreateTurn(intentText);
  const pendingPlanExpand = getLastPendingGreenfield(activeChatId);
  const looksLikePlanFeatureAdd = Boolean(
    pendingPlanExpand
    && !createWinsThisTurn
    && !looksLikeGreenfieldCreateGo(intentText)
    && !looksLikeImplementGo(intentText)
    && !parseWorkOnFolderName(intentText)
    && (
      /\b(?:also|plus)\b/i.test(intentText)
      || /\badd\b[\s\S]{0,80}\b(?:reminder|chart|report|bill|feature|panel|modal|screen|indicator)/i.test(intentText)
      || /\bfold\s+(?:those|these|them|it)\s+into\s+the\s+plan\b/i.test(intentText)
      || /\b(?:want|add)\s+(?:three|3|two|2|more)\s+extras?\b/i.test(intentText)
      || /\bsoft\s+sage\b|\bsave-?a-?bag\b|\bundo\b/i.test(intentText)
    ),
  );
  if ((mode === 'general' || mode === 'code') && !createWinsThisTurn && (
    planningHoldAllowed(intentText)
    || /\badd\s+more\s+features\s+to\s+the\s+plan\b/i.test(intentText)
    || /\bexpand\s+the\s+plan\b/i.test(intentText)
    || /\bfold\s+(?:those|these|them|it)\s+into\s+the\s+plan\b/i.test(intentText)
    || looksLikePlanFeatureAdd
  )) {
    let pending = pendingPlanExpand;
    if (!pending) {
      const prior = [...messagesRef.current]
        .reverse()
        .find((m: any) => m.role === 'user' && (
          parseGreenfieldIdea(String(m.content || ''))
          || parseNewProjectIntent(String(m.content || ''))
        ));
      if (prior) {
        const idea = parseGreenfieldIdea(String(prior.content || ''));
        const created = parseNewProjectIntent(String(prior.content || ''));
        if (idea) {
          pending = { ...idea, at: Date.now() };
          setLastPendingGreenfield(activeChatId, idea);
        } else if (created) {
          const asIdea = {
            name: created.name,
            slug: created.slug,
            kind: created.kind,
            summary: created.summary,
            problemLine: `Build ${created.name} from your brief.`,
          };
          pending = { ...asIdea, at: Date.now() };
          setLastPendingGreenfield(activeChatId, asIdea);
        }
      }
    }
    if (pending) {
      const nextDepth = Math.max(1, (pending.planDepth || 0) + 1);
      const detected = detectPlanFocus(intentText, pending.summary);
      const focus = detected !== 'general' ? detected : (pending.planFocus || 'general');
      setLastPendingGreenfield(activeChatId, {
        name: pending.name,
        slug: pending.slug,
        kind: pending.kind,
        summary: pending.summary,
        problemLine: pending.problemLine,
        planDepth: nextDepth,
        planFocus: focus,
        planLog: pending.planLog,
      });
      renameChat(activeChatId, pending.name);
      // Fall through to the model. unique deepening, not a canned chip plan.
    } else {
      // Never dead-end with “I lost the brief.” Rebuild a sticky idea from this thread and keep talking.
      const recentUsers = [...messagesRef.current]
        .filter((m: any) => m.role === 'user')
        .map((m: any) => String(m.content || '').replace(/<!--[\s\S]*?-->/g, '').trim())
        .filter(Boolean)
        .slice(-8);
      const summary = [...recentUsers, intentText].filter(Boolean).join('\n').slice(0, 1600) || intentText;
      const nameGuess = cleanProductTitle(
        summary.match(/\b(?:called|named)\s+["']?([A-Z][A-Za-z0-9 _-]{1,40})/i)?.[1]
        || summary.match(/\b([A-Z][a-zA-Z0-9]{2,24})\b/)?.[1]
        || 'App idea',
      );
      const slug = nameGuess.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app-idea';
      setLastPendingGreenfield(activeChatId, {
        name: nameGuess,
        slug,
        kind: 'vite-react',
        summary,
        problemLine: 'Continue planning from this conversation.',
        planDepth: 1,
        planFocus: detectPlanFocus(intentText, summary),
      });
      // Fall through to the model — never return a “paste your idea again” dead end.
    }
  }

  // Greenfield / product idea. remember the brief, rename the chat, then talk via the model.
  // Never dump Create/Keep-planning chips or the generic template plan.
  if ((mode === 'general' || mode === 'code') && looksLikeGreenfieldIdea(intentText)) {
    if (looksLikeGreenfieldHaveFolder(intentText)) {
      await finishPlainReply(
        'Got it. you already have a folder.\n\nSay **Let’s work on YourFolderName** or *On my desktop I have a folder called …* and I’ll bind that workspace.',
      );
      return { status: 'done' };
    }

    const idea = parseGreenfieldIdea(intentText);
    if (idea) {
      setLastPendingGreenfield(activeChatId, idea);
      renameChat(activeChatId, idea.name);
    }
    // Fall through to the model for a unique planning conversation.
  }

  if (
    (mode === 'general' || mode === 'code')
    && !createWinsThisTurn
    && planningHoldAllowed(intentText)
    && wantsPlanningOnly(intentText)
    && !looksLikeImplementGo(intentText)
  ) {
    const idea = parseGreenfieldIdea(intentText) || (
      extractGreenfieldName(intentText)
        ? parseGreenfieldIdea(`build an app called ${extractGreenfieldName(intentText)}`)
        : null
    );
    if (idea) {
      setLastPendingGreenfield(activeChatId, idea);
      renameChat(activeChatId, idea.name);
    }
    // Fall through. no instant template starter.
  }

  // Explicit “lets build this” with a pending idea → ensure pending is set for create below.
  if (
    (mode === 'general' || mode === 'code')
    && looksLikeGreenfieldStartWorkGo(intentText)
    && !parseWorkOnFolderName(intentText)
  ) {
    const pending = getLastPendingGreenfield(activeChatId);
    if (!pending) {
      const prior = [...messagesRef.current]
        .reverse()
        .find((m: any) => m.role === 'user' && parseGreenfieldIdea(String(m.content || '')));
      const fromThread = prior ? parseGreenfieldIdea(String(prior.content || '')) : null;
      if (fromThread) setLastPendingGreenfield(activeChatId, fromThread);
    }
  }

  const _sticky = getLastDiskTarget(activeChatId);
  const _diskRoot = chatStudioDiskRootRef.current || resolvedStudio.diskRoot || null;
  const _relPathFromDisk = (filePath: string): string | null => {
    if (!_diskRoot || !filePath) return null;
    const normRoot = _diskRoot.replace(/[/\\]+$/, '');
    if (!filePath.startsWith(normRoot)) return null;
    return filePath.slice(normRoot.length).replace(/^[/\\]+/, '') || null;
  };
  return {
    status: isMediaMode ? 'media' : 'owned',
    content,
    mode,
    activeChatId,
    routeChatIdAtTurnStart,
    backgroundAllowed: Boolean(routeChatIdAtTurnStart && routeChatIdAtTurnStart === activeChatId),
    assistantId,
    mySeq,
    replyStartedAt,
    pinnedModel,
    composerMode,
    isMediaMode,
    regenerating,
    diskIntent,
    diskRoot: _diskRoot,
    diskProjectId: chatStudioProjectIdRef.current || resolvedStudio.projectId || null,
    diskWorkspaceName: resolvedStudio.name || diskWorkspaceName || null,
    stickyDiskTarget: _sticky,
    resolvedStudio,
    userId: user?.id || 'guest-local',
    finishPlainReply,
    pushAssistantStatus,
    setDropHint,
    setComposerMode,
    stopIfSuperseded,
    clearGeneratingIfMineEarly,
    commitStudioForChat,
    persistStudioSnapshot,
    persistModeThread,
    renameChat,
    addChat,
    touchRecentProject,
    previewFromText,
    setCodePillSticky,
    setDeleteFilePrompt,
    setDeleteProjectPrompt,
    setDeleteFolderClarifyPrompt,
    pendingFileDeleteRef,
    pendingProjectDeleteRef,
    pendingFolderClarifyRef,
    openFolderInChat,
    lastFolderLocateNoteRef,
    chatStudioFilesRef,
    chatStudioDiskRootRef,
    chatStudioProjectIdRef,
    chatStudioDiskRoot,
    setChatStudioFiles,
    setChatStudioDiskRoot,
    setChatStudioProjectId,
    setMessages,
    messagesRef,
    genSeqRef,
    stopRequestedRef,
    threadBrainRef,
    pushLivePreview,
    flushQueuedSend,
    routeChatIdRef,
    user,
    providerLabel,
    genJobId,
    previousAssistant,
    statusLabel,
    videoDurationSec,
    pluginId,
    pluginState,
    normalized,
    userMsg,
    assistantMsg,
    priorForHistory,
    turnDiskRoot,
    turnProjectId,
    turnStudioFiles,
    threadKind,
    capacity,
    chats,
    chatRouteSeedRef,
    chatTurnCtlRef,
    imageBriefRef,
    messagesChatIdRef,
    persistTimerRef,
    previewUrlRef,
    setFailoverNote,
    setThreadBrain,
    setCreateLiveModelLabel,
    setActiveModel,
    setIpcFallbackDev,
    addCreation,
    failoverChipText,
    relPathFromDisk: typeof relPathFromDisk === 'function' ? relPathFromDisk : _relPathFromDisk,
  };
}
