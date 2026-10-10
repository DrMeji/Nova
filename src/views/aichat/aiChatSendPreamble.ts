/**
 * AIChat send preamble — setup, gates, disk/greenfield before owned dispatch.
 */
// @ts-nocheck — ctx bag mirrors AIChat closures; keep in sync when wiring.
import { useState, useEffect, useRef, useMemo, useLayoutEffect, useCallback, type ClipboardEvent as ReactClipboardEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter, type ChatMode } from '@/context/RouterContext';
import { useRecentProjects } from '@/context/RecentProjectsContext';
import { saveChatMessage } from '@/lib/api';
import { getLocalPrefs, getProviderApiKeys, hasProviderApiKey, setLocalPrefs } from '@/lib/localPrefs';
import { isCloudProviderEnabled } from '@/lib/cloudSources';
import { resolvePreferredCloudProvider, hasAnyCloudChatKey } from '@/lib/cloudChat';
import { honestNoLiveChatReply, probeLiveCapacity, type LiveCapacity } from '@/lib/novaCapacity';
import { tipAt, tipStartIndex } from '@/lib/novaTips';
import {
  BACKUP_DOWNLOAD_EVENT,
} from '@/lib/novaHuntBootstrap';
import {
  chatThreadKey,
  mediaMessageMarkdown,
  extractVisionImages,
  rememberThumb,
  getMemoryThumb,
  resolveCreationDataUrl,
  slimChatContent,
  titleFromPrompt,
  loadRecentProjects,
  loadRecentChats,
} from '@/lib/recentStore';
import { looksLikeCodeAsk, looksLikeCopyPasteCodeAsk, looksLikeImageAsk } from '@/lib/chatIntent';
import {
  formatChatInspectReply,
  formatRepoCatalog,
  handoffPrompt,
  isGithubPullAsk,
  listAccountRepos,
  looksLikeBuildStart,
  pickGithubRepo,
  shouldInspectInChat,
  wantsGithubCatalog,
} from '@/lib/chatStudio';
import {
  type StudioIntent,
} from '@/lib/studioAnswerEngine';
import {
  attachKey,
  encodeChatAttaches,
  parseChatAttach,
  parseChatAttaches,
  type ChatAttachMeta,
} from '@/lib/chatAttach';
import { allowWindowFileDrop, dropHasFiles, imagesFromClipboardData, resolveChatDrop } from '@/lib/chatDrop';
import {
  describeProjectFromFiles,
  isExplainAsk,
  isInspectAsk,
  type InspectFinding,
} from '@/lib/projectInspect';
import { saveProjectThread, persistProjectThreadToDisk } from '@/lib/projectThread';
import { gitClone, githubCloneUrl, parseGithubRepoRef, classifyGitAsk } from '@/lib/novaGitClient';
import { verifyGitHubToken, type GitHubRepo } from '@/lib/github';
import {
  MEDIA_GEN_STAGES,
  rewriteImagePrompt,
  rewriteVideoPrompt,
  runMediaGenStages,
} from '@/lib/mediaPrompt';
import {
  buildImageBriefMessage,
  mergeImageBrief,
  needsImageBrief,
  parseImageRequest,
} from '@/lib/mediaBrief';
import { arkRoute, routerProviderLabel, type ArkRouterResult } from '@/lib/novaRouter';
import {
  executionModeLabel,
  getAgentExecutionMode,
} from '@/lib/agentExecution';
import {
  looksLikeFolderPathAsk,
  parseFolderPathAsk,
  GRANT_OFF_FOLDER_MSG,
  looksLikeInstallDepsAsk,
} from '@/lib/folderPathAsk';
import {
  buildFolderCatalogData,
  encodeCatalogMessage,
  isCatalogMessage,
  looksLikeFolderCatalogAsk,
  looksLikeProjectsInventoryAsk,
  resolveCatalogFolderRef,
  looksLikeStartWorkOnFolderAsk,
  parseWorkOnFolderName,
  shouldFullImportFolderAsk,
} from '@/lib/folderCatalog';
import {
  buildPcExploreData,
  classifyPcExploreMode,
  encodePcExploreMessage,
  isPcExploreMessage,
  looksLikePcExploreAsk,
  pcExploreStatusStages,
} from '@/lib/pcExplore';
import { isTraceMessage, encodeTraceMessage, nextTraceStepId, traceThoughtFromAsk, countLineDiff, wrapReplyWithFileChanges, type AgentFileChange, type AgentTracePayload, type AgentTraceStep } from '@/lib/agentTrace';
import { hasFolderAccessGrant, resolveScopedFolderPath, formatFolderLocatedMessage, syncWorkspaceGrantsFromPrefs, resolveWorkFolderPath } from '@/lib/workspaceGrants';
import { saveChatStudio, loadChatStudio, clearChatStudio, setLastListedFolder, getLastListedFolder, clearLastListedFolder, setLastDiskTarget, getLastDiskTarget, clearLastDiskTarget, setLastPendingAddFile, getLastPendingAddFile, clearLastPendingAddFile, setLastPendingGreenfield, getLastPendingGreenfield, clearLastPendingGreenfield, setChatCodePill, hasChatCodePill, chatHasBuildWorkspace, resolveChatProjectRoot, studioPathBasename } from '@/lib/chatStudioStore';
import { runCodeStudioCommand } from '@/lib/studioCommands';
import { applyChatReplyEdits } from '@/lib/chatAgentApply';
import { runProjectMultiAgent, wantsMultiAgentTurn } from '@/lib/novaMultiAgent';
import {
  formatSkillsForPrompt,
  resolveSkillsForBrief,
  skillNamesLabel,
  type NovaSkillPack,
} from '@/lib/novaSkills';
import { parseAddCommentAsk, applyLineComment, applyVisibleHtmlMarker, wantsVisiblePreviewMarker } from '@/lib/novaQuickEdit';
import { beginChatInflight, endChatInflight, hasChatInflight } from '@/lib/chatInflight';
import { looksLikeNsfwAsk, nsfwBlockedReply } from '@/lib/nsfwGate';
import {
  arkSelfHarmBlockedReply,
  isArkProtectedPathOnDisk,
  looksLikeArkSelfHarmAsk,
} from '@/lib/novaSelfGuard';
import {
  harmfulContentBlockedReply,
  looksLikeHarmfulContentAsk,
} from '@/lib/novaContentSafety';
import { redactArkSelfLeak } from '@/lib/replySanitizer';
import { listenOnce, speakText, stopSpeaking, voiceSupported, scrubVoiceConstraintEcho, speechRecognitionSupported, startLiveDictation, type LiveDictationHandle } from '@/lib/voiceSession';
import { voiceChatRoute } from '@/lib/voiceRoute';
import { syncAutoVoiceDevices } from '@/lib/voiceAudio';
import type { VoiceSessionPhase } from '@/lib/voiceMode';
import {
  looksLikeVoiceBuildOrEditAsk,
  voiceBuildEditRefuseReply,
} from '@/lib/voiceMode';
import {
  formatMcpToolsHelp,
  parseMcpCallIntent,
  resolveMcpToolServer,
  callMcpTool,
  runMcpAutoToolLoop,
  looksLikeArkCapabilityAsk,
  formatArkCapabilitiesHelp,
} from '@/lib/novaMcp';
import { reactUiMicroAskEdits } from '@/lib/webProjectCanon';
import { deleteProjectFolderOnDisk, handleDeleteProjectChatRequest, looksLikeDeleteFolderAsk } from '@/lib/deleteProjectFlow';
import { classifyDiskIntent, shouldRouteDeleteToStickyFile } from '@/lib/chatDiskIntent';
import { deleteFileOnDisk, handleAddFileChatRequest, handleDeleteFileChatRequest, handleReadFileChatRequest, handleRenameFileChatRequest } from '@/lib/chatDiskOps';
import {
  buildRestorePointCommand,
  extractWriteFileContent,
  looksLikeReadFileAsk,
  looksLikeRestorePointAsk,
  parseReadFileTarget,
} from '@/lib/chatPcTasks';
import {
  looksLikeProjectDebugAsk,
  parseProjectDebugTarget,
  folderPathFromDebugTarget,
} from '@/lib/chatProjectDebug';
import { resolveDiskParentPath } from '@/lib/diskPathResolve';
import {
  inferAgentCommand,
  looksLikeRuntimeInstallAsk,
  proposeRuntimeInstall,
  runAgentCommand,
} from '@/lib/chatAgentExec';
import {
  detectProjectKind,
  extractProjectName,
  fallbackCreateProjectName,
  findBestProductBrief,
  parseNewProjectIntent,
  recoverOriginalUserBrief,
  resolveCreateIntentFromThread,
  resolveProjectKindForCreate,
  slugifyProjectName,
  type ProjectKind,
} from '@/lib/createProjectIntent';
import {
  shouldSkipWeakModelCodingHop,
  weakModelMicroEditReply,
  runSurgicalEditTurn,
  isWeakCoderModel,
  FIRST_RUN_KIND_CHIPS,
  runEditTurn,
} from '@/lib/chatTurnHandlers';
import {
  pushApplySnapshot,
  getApplySnapshot,
  clearApplySnapshot,
  snapshotToRevertBlocks,
} from '@/lib/chatApplySnapshotStore';
import { projectUsesNpm, mergeBriefNpmDependencies } from '@/lib/projectScaffolds';
import { looksLikeImplementGo, shouldBlockChatFileWrites, planningConversationHint, keepBuildingConversationHint } from '@/lib/chatPlanMode';
import { looksLikeInPlaceRebuildAsk, looksLikeProductCorrectionAsk, looksLikeProjectBuildAsk } from '@/lib/chatBuildIntent';
import { isProjectCreateBrief } from '@/lib/chatCreateBrief';
import { briefReadDelayMs, detectPlanFocus, extractGreenfieldName, looksLikeConversationalPlanningAsk, looksLikeDirectJudgmentAsk, looksLikeGreenfieldCreateGo, looksLikeGreenfieldHaveFolder, looksLikeGreenfieldIdea, looksLikeGreenfieldKeepPlanning, looksLikeGreenfieldStartWorkGo, parseGreenfieldIdea, buildMissingWorkFolderReply, shouldInjectPlanningConversation, wantsPlanningOnly } from '@/lib/chatIdeaIntent';
import {
  chatTurnAllowsExec,
  chatTurnAllowsFileEdits,
  hasActiveWorkspace,
  isChatPlanTurn,
  looksLikeCodeEditAsk,
  looksLikeKeepBuildingAsk,
  NO_WORKSPACE_MSG,
  normalizeComposerMode,
  stripComposerPrefix,
  workspacePathLabel,
} from '@/lib/chatAgentTurn';
import { isCreateTurn, planningHoldAllowed, type ClassifyTurnResult } from '@/lib/classifyTurn';
import {
  clearChatTurnStatus,
  forgetFinishedChatTurnStatus,
  setChatTurnStatus,
  pushChatTurnStatus,
} from '@/lib/chatTurnStatusStore';
import { consumePendingStudioBind, readPendingStudioBind } from '@/lib/pendingStudioBind';
import { getCreateJobForChat } from '@/lib/createJobStore';
import { useCreateJob } from '@/hooks/useCreateJob';
import {
  buildStudioTraceMessage,
  finalizeCodingChatBubble,
  liveCodingStatusText,
} from '@/lib/chatCodeReply';
import {
  composeVisionToCoderBrief,
  hasVisionCapability,
  looksLikeScreenshotFixAsk,
  messageHasImages,
  multiModelStatusLabel,
  runVisionDescribeHop,
  visionCapabilityGapReply,
} from '@/lib/chatMultiModel';
import { githubToken } from '@/lib/codeGitHubWorkflow';
import {
  cloudKeyNudgeAfterEmptyBuild,
  cloudKeyNudgeReply,
  markCloudKeyNudgeShown,
  shouldOfferCloudKeyNudge,
} from '@/lib/cloudKeyNudge';
import {
  planMultiModelWebsiteTeam,
  formatMultiModelAttribution,
  multiModelStatusLine,
  type MultiModelPartPlan,
  type MultiModelPartResult,
} from '@/lib/chatMultiModelBuild';
import {
  createProgressLabel,
  startProgressHeartbeat,
  type CreateProgressPhase,
} from '@/lib/createProgressCopy';
import {
  formatHybridAttribution,
  normalizeHybridAiMode,
  pickForRole,
  preferCloudForCreate,
} from '@/lib/hybridRoleRouting';
import { smokeCheckPreviewUrl } from '@/lib/previewBrowserSmoke';
import {
  briefLooksLikeMarketingLanding,
  briefRequiresInteractiveApp,
  ensureViteReactProjectFiles,
  isPreviewReady,
  isPlayableGameReady,
  isPlayableArcadeGameReady,
  looksLikeFillerStubAppSource,
  restaurantBriefBuiltAsCoffeeShop,
  stripModelProseFromSource,
  ensureProductBrandInApp,
} from '@/lib/createBuildQuality';
import { pickLocalCoderModel } from '@/lib/enginePick';
import { isChatTurnDead, shouldPaintStudioLive } from '@/lib/chatTurnIsolation';
import { classifyErrorMessage, isLikelyErrorMessage } from '@/lib/errors';
import { isVideoTabEnabled, isImageTabEnabled, isVoiceTabEnabled } from '@/lib/featurePark';
import { notifyChatDone } from '@/lib/activityIndicators';
import { formatReplyElapsed } from '@/lib/speedTest';

import { getTokenUsageRatio, recordTokenUsage, syncTokenUsage, estimateTokens } from '@/lib/tokenUsage';
import { getModelHealthRatio, recordModelTurn } from '@/lib/modelHealth';
import { prepareBrainRotation } from '@/lib/modelRotation';
import {
  buildRouterHistory,
  looksLikePromptEcho,
  looksLikeThreadSummaryAsk,
  threadSummarySystemHint,
  buildThreadSummaryFromMessages,
  sanitizeAssistantReply,
  usableAssistantText,
  isCannedGreetingReply,
  historyWasCompacted,
} from '@/lib/chatHistory';
import {
  looksLikeWebGroundedAsk,
  looksLikeSideQuestAsk,
  looksLikeLyricsAsk,
  looksLikeInventedLyricsDump,
  looksLikeLinkDirectoryReply,
  looksLikeBuildBleedReply,
  looksLikeThinSideQuestReply,
  honestLyricsUnavailableReply,
  sideQuestAnswerHint,
  scrubSideQuestBleed,
  fallbackAnswerFromLookup,
  webSearchForChat,
  formatWebLookupForPrompt,
  webLookupUnavailableNote,
} from '@/lib/webSearch';
import {
  autoEquippedCaption,
  autoPillLabel,
  autoRingDetail,
  brainKindForChatMode,
  clearThreadBrain,
  loadThreadBrain,
  saveAutoThreadBrain,
  type ThreadBrain,
} from '@/lib/threadBrain';
import {
  detectPluginIntent,
  getChatEnabledPlugins,
  getConnectedPlugins,
  getPluginById,
  getPluginRuntime,
  loadPluginState,
  runPluginAction,
  type PluginDef,
} from '@/lib/plugins';
import type { ChatMessage } from '@/types';
import { engineGenerateCancel, getEngineStatus, setEngineModel } from '@/lib/novaEngine';
import { runMediaChatTurn } from '@/lib/chatMediaTurn';
import { ensureViteDevServer, isViteProject, openInAppPreview, ensureInAppPreview, refreshLivePreview, ensureBoundFolderPreview, loadPreviewFilesFromDisk } from '@/lib/projectPreview';
import { cleanProductTitle, looksLikeSpatialApp, looksLikePlayableCanvasGame, looksLikeFpsGame } from '@/lib/freshSpaFromBrief';
import { classifyMobileTarget, isNativeMobileTree } from '@/lib/mobileTarget';
import { classifyNamedDevice, defaultDeviceForTarget } from '@/lib/mobileDevices';
import {
  briefWantsSiteHeroImagery,
  hasCloudImageKey,
  listReadyLocalImageModels,
  repairBrokenSiteImageSrcs,
  siteImageCapabilityGapReply,
  siteImageGuidanceForBrief,
} from '@/lib/siteHeroImages';
import {
  applyAttachedChatImageAsAsset,
  applyAttachedChatImagesAsAssets,
  extractExplicitAssetUrls,
  formatBrandAssetsForPrompt,
  looksLikeAssetLinkAsk,
  looksLikeUseAttachedAsset,
  materializeBrandAssets,
  planBrandAssets,
} from '@/lib/brandAssets';

import {
  COMPOSER_MODE_PREFIX,
  composerModeFromContent,
  previewFromText,
  CHAT_MODELS,
  CLOUD_CHAT_WHEN_KEYED,
  kindForMode,
  defaultModelForKind,
  failoverChipText,
  PLACEHOLDERS,
  GREETINGS,
  resolveStudioFiles,
  persistModeThread,
  deletePrepareErrorReply,
  focusComposerIfSafe,
  type ChatModelOption,
} from '@/views/aichat/aiChatHelpers';



export type AIChatSendCtx = Record<string, any>;

export type AIChatSendPrepResult =
  | { status: 'done' }
  | {
      status: 'owned' | 'media';
      content: string;
      mode: string;
      activeChatId: string;
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
      pushAssistantStatus: (label: string, writingPath?: string | null) => void;
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
      relPathFromDisk?: (filePath: string) => string | null;
    };

export async function prepareAIChatSend(content: string, ctx: AIChatSendCtx): Promise<AIChatSendPrepResult> {
  // Fix common mic mishears before the bubble is stored (Timmy ≠ teammate).
  try {
    const { scrubDictationTranscript } = await import('@/lib/voiceSession');
    content = scrubDictationTranscript(content);
  } catch { /* ignore */ }
  const {
    activeGenChatIdRef,
    activeModelRef,
    addChat,
    addCreation,
    capacity,
    chatPlugins,
    chatRouteSeedRef,
    chatStudioDiskRoot,
    chatStudioDiskRootRef,
    chatStudioFilesRef,
    chatStudioProjectIdRef,
    chatTurnCtlRef,
    chats,
    commitStudioForChat,
    composerMode,
    composerModeFromContent,
    endTurnAndFlush,
    engineInstallingModels,
    failoverChipText,
    flushQueuedSend,
    genSeqRef,
    genSeqByChatRef,
    stopRequestedByChatRef,
    generating,
    generatingRef,
    handleSend,
    imageBriefRef,
    lastFolderLocateNoteRef,
    lastStudioIntentRef,
    messages,
    messagesChatIdRef,
    messagesRef,
    mode,
    navigate,
    openFolderInChat,
    pendingFileDeleteRef,
    pendingFolderClarifyRef,
    pendingProjectDeleteRef,
    persistChatIdRef,
    persistModeThread,
    persistStudioSnapshot,
    persistTimerRef,
    placeholder,
    previewFromText,
    previewUrlRef,
    pushLivePreview,
    renameChat,
    touchRecentProject,
    resolveStudioFiles,
    route,
    routeChatIdRef,
    runEphemeralVoiceTurn,
    setCapacity,
    setChatStudioDiskRoot,
    setChatStudioFiles,
    setChatStudioProjectId,
    setCodePillSticky,
    setDeleteFilePrompt,
    setDeleteFolderClarifyPrompt,
    setDeleteProjectPrompt,
    setFailoverNote,
    setGenerating,
    setIpcFallbackDev,
    setMessages,
    setModelRatio,
    setPreviewUrl,
    setThreadBrain,
    setCreateLiveModelLabel,
    setActiveModel,
    setDropHint,
    setTokenRatio,
    skipChatLoadIdsRef,
    stickToBottomRef,
    stopRequestedRef,
    studioBoundChatIdRef,
    threadBrainRef,
    threadKind,
    user,
    userDetachScrollRef,
    videoDurationSec,
    setComposerMode,
  } = ctx;

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
    const existing = chats.find(c => c.id === activeChatId);
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
  // Bind any pending folder attach to this chat id for follow-ups.
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
    ? livePlugins.map(p => p.id)
    : chatPlugins.map(p => p.id);
  const pluginId = detectPluginIntent(content, enabledIds);
  const pluginState = pluginId ? getPluginRuntime(pluginId, loadPluginState()) : null;
  const pluginMeta = pluginId
    ? (livePlugins.find(p => p.id === pluginId) || chatPlugins.find(p => p.id === pluginId) || getPluginById(pluginId))
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
    ? MEDIA_GEN_STAGES[mode][0].label
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
  const normalized = messagesRef.current.map(m => (
    m.role === 'assistant' && String(m.content || '').startsWith('__generating__:')
      ? { ...m, content: '(no response)' }
      : m
  ));
  const priorForHistory = normalized.filter(m => {
    const c = String(m.content || '');
    if (!c || c.startsWith('__progress__:')) return false;
    if (c === '(no response)') return false;
    return true;
  });
  const previousAssistant = [...priorForHistory].reverse().find(m => m.role === 'assistant')?.content || '';
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

  const histPrefs = getLocalPrefs();
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
    const patch = (list: ChatMessage[]) => list.map(m => (m.id === assistantId ? reply : m));
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
    setTokenRatio(syncTokenUsage(threadChatId, estimateTokens(
      isCatalogMessage(replyText)
        ? 'folder catalog summary'
        : replyText,
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
      if (job && (job.status === 'queued' || job.status === 'writing' || job.status === 'npm' || job.status === 'verifying')) {
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
    let threadMsgs = messagesRef.current.filter(m => m.id !== assistantId);
    if (activeChatId) {
      try {
        const raw = localStorage.getItem(chatThreadKey(activeChatId));
        if (raw) {
          const parsed = JSON.parse(raw) as ChatMessage[];
          if (Array.isArray(parsed) && parsed.length >= threadMsgs.length) {
            threadMsgs = parsed.filter(m => m.id !== assistantId);
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

  // Recover folder files from every source before any model call.
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

  const pushAssistantStatus = (label: string, writingPath?: string | null) => {
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
    });
  };
  // Rolldown drops the IIFE closure on this name — call via ref inside the async turn.
  chatTurnCtlRef.current.pushStatus = pushAssistantStatus;

  const runFolderCatalog = async (opts: {
    targetPath: string;
    displayName: string;
    resolvedFromDesktop: boolean;
  }) => {
    pushAssistantStatus('Thinking…');
    await new Promise<void>(r => { window.setTimeout(r, 120); });
    if (await stopIfSuperseded()) return;

    if (opts.resolvedFromDesktop) {
      pushAssistantStatus('Exploring your Desktop…');
      await new Promise<void>(r => { window.setTimeout(r, 80); });
    } else {
      pushAssistantStatus(`Exploring ${opts.displayName}…`);
    }
    if (await stopIfSuperseded()) return;

    pushAssistantStatus(`Found ${opts.displayName}. ${opts.targetPath}`);
    await new Promise<void>(r => { window.setTimeout(r, 100); });
    if (await stopIfSuperseded()) return;

    pushAssistantStatus('Reading project summaries…');
    const roots = await window.novaDesktop?.browseRoots?.();
    const desktopPath = roots?.roots?.find(r => r.id === 'desktop')?.path || null;
    const built = await buildFolderCatalogData(opts.targetPath, opts.displayName, {
      desktopPath,
      showDesktopSiblings: opts.resolvedFromDesktop,
    });
    if (await stopIfSuperseded()) return;

    pushAssistantStatus('Preparing answer…');
    await new Promise<void>(r => { window.setTimeout(r, 60); });
    setLastListedFolder(activeChatId, {
      path: opts.targetPath,
      name: opts.displayName,
    });
    setLastDiskTarget(activeChatId, {
      path: opts.targetPath,
      name: opts.displayName,
      kind: 'folder',
    });
    if (built.data.projects.length === 1) {
      const only = built.data.projects[0];
      const onlyPath = `${opts.targetPath.replace(/[/\\]+$/, '')}${opts.targetPath.includes('\\') ? '\\' : '/'}${only.name}`;
      setLastListedFolder(activeChatId, {
        path: onlyPath,
        name: only.name,
      });
      setLastDiskTarget(activeChatId, {
        path: onlyPath,
        name: only.name,
        kind: 'folder',
      });
    }
    await finishPlainReply(encodeCatalogMessage(built.data));
  };

  const runPcExplore = async (userMessage: string) => {
    const mode = classifyPcExploreMode(userMessage);
    if (!mode) return;

    const stages = pcExploreStatusStages(mode);
    // One status label only — cycling many labels mid-reply looked like flickering messages.
    pushAssistantStatus(stages[0] || 'Looking around…');
    await new Promise<void>(r => { window.setTimeout(r, 80); });
    if (await stopIfSuperseded()) return;

    if (mode === 'installed_apps' || mode === 'games') {
      await syncWorkspaceGrantsFromPrefs();
    } else {
      await syncWorkspaceGrantsFromPrefs();
    }
    if (await stopIfSuperseded()) return;

    const data = await buildPcExploreData(userMessage, mode);
    if (await stopIfSuperseded()) return;

    pushAssistantStatus(stages[stages.length - 1] || 'Preparing answer…');
    await new Promise<void>(r => { window.setTimeout(r, 50); });
    const listedSection = data.sections.find(s => s.path && s.items.length > 0) || data.sections.find(s => s.path);
    if (listedSection?.path) {
      setLastListedFolder(activeChatId, {
        path: listedSection.path,
        name: listedSection.title || listedSection.path.split(/[/\\]/).pop() || data.headline,
      });
      setLastDiskTarget(activeChatId, {
        path: listedSection.path,
        name: listedSection.title || listedSection.path.split(/[/\\]/).pop() || data.headline,
        kind: 'folder',
      });
    }
    await finishPlainReply(encodePcExploreMessage(data));
  };

  const recentUserLines = messagesRef.current
    .filter(m => m.role === 'user')
    .map(m => String(m.content || ''));
  const stickyDiskTarget = getLastDiskTarget(activeChatId);
  const { normalizeMessyUserAsk } = await import('@/lib/editAskResolve');
  const intentText = normalizeMessyUserAsk(
    stripComposerPrefix(content)
      .replace(/!\[[^\]]*]\(data:image\/[^)]+\)/gi, ' ')
      .replace(/!\[[^\]]*]\(nova-media:[^)]+\)/gi, ' '),
  );
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
      if (await stopIfSuperseded()) return;

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
        setMessages(prev => prev.map(m => (
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
        .find(m => m.role === 'user' && (
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
        .filter(m => m.role === 'user')
        .map(m => String(m.content || '').replace(/<!--[\s\S]*?-->/g, '').trim())
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
        .find(m => m.role === 'user' && parseGreenfieldIdea(String(m.content || '')));
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
