/**
 * AIChat controller — state, effects, send wiring.
 */
// @ts-nocheck — large closure bag; Frame consumes returned props.
import { useState, useEffect, useRef, useMemo, useLayoutEffect, useCallback, startTransition, type ClipboardEvent as ReactClipboardEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/context/AuthContext';
import { useRouter, type ChatMode } from '@/context/RouterContext';
import { useRecentProjects } from '@/context/RecentProjectsContext';
import { saveChatMessage } from '@/lib/api';
import { getLocalPrefs, getProviderApiKeys, hasProviderApiKey, setLocalPrefs } from '@/lib/localPrefs';
import { isCloudProviderEnabled } from '@/lib/cloudSources';
import { resolvePreferredCloudProvider, hasAnyCloudChatKey } from '@/lib/cloudChat';
import { honestNoLiveChatReply, probeLiveCapacity, type LiveCapacity } from '@/lib/arkCapacity';
import { tipAt, tipStartIndex } from '@/lib/arkTips';
import { RotatingTip } from '@/components/RotatingTip';
import { ParkedNotice } from '@/components/ParkedNotice';
import {
  BACKUP_DOWNLOAD_EVENT,
} from '@/lib/arkHuntBootstrap';
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
import { AttachCard } from '@/components/AttachCard';
import {
  describeProjectFromFiles,
  isExplainAsk,
  isInspectAsk,
  type InspectFinding,
} from '@/lib/projectInspect';
import { saveProjectThread, persistProjectThreadToDisk } from '@/lib/projectThread';
import { GitHubRepoPicker } from '@/components/GitHubRepoPicker';
import { gitClone, githubCloneUrl, parseGithubRepoRef, classifyGitAsk } from '@/lib/arkGitClient';
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
import { arkRoute, routerProviderLabel, type ArkRouterResult } from '@/lib/arkRouter';
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
import { runProjectMultiAgent, wantsMultiAgentTurn } from '@/lib/arkMultiAgent';
import {
  formatSkillsForPrompt,
  resolveSkillsForBrief,
  skillNamesLabel,
  type NovaSkillPack,
} from '@/lib/novaSkills';
import { parseAddCommentAsk, applyLineComment, applyVisibleHtmlMarker, wantsVisiblePreviewMarker } from '@/lib/arkQuickEdit';
import { beginChatInflight, endChatInflight, hasChatInflight } from '@/lib/chatInflight';
import { looksLikeNsfwAsk, nsfwBlockedReply } from '@/lib/nsfwGate';
import {
  arkSelfHarmBlockedReply,
  isArkProtectedPathOnDisk,
  looksLikeArkSelfHarmAsk,
} from '@/lib/arkSelfGuard';
import {
  harmfulContentBlockedReply,
  looksLikeHarmfulContentAsk,
} from '@/lib/arkContentSafety';
import { redactArkSelfLeak } from '@/lib/replySanitizer';
import { listenOnce, speakText, stopSpeaking, voiceSupported, scrubVoiceConstraintEcho, speechRecognitionSupported, startLiveDictation, type LiveDictationHandle } from '@/lib/voiceSession';
import { voiceChatRoute } from '@/lib/voiceRoute';
import { syncAutoVoiceDevices } from '@/lib/voiceAudio';
import type { VoiceSessionPhase } from '@/lib/voiceMode';
import {
  looksLikeVoiceBuildOrEditAsk,
  voiceBuildEditRefuseReply,
} from '@/lib/voiceMode';
import { VoiceModeLayout } from '@/components/VoiceModeLayout';
import {
  formatMcpToolsHelp,
  parseMcpCallIntent,
  resolveMcpToolServer,
  callMcpTool,
  runMcpAutoToolLoop,
  looksLikeArkCapabilityAsk,
  formatArkCapabilitiesHelp,
} from '@/lib/arkMcp';
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
import type { ClassifyTurnResult } from '@/lib/classifyTurn';
import {
  clearChatTurnStatus,
  setChatTurnStatus,
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
import { FreeKeyWizard } from '@/components/FreeKeyWizard';
import { DeleteProjectFolderModal } from '@/components/DeleteProjectFolderModal';
import { DeleteFileModal } from '@/components/DeleteFileModal';
import { DeleteFolderClarifyModal } from '@/components/DeleteFolderClarifyModal';
import { ComposerPlusMenu, type ComposerPlusAction } from '@/components/ComposerPlusMenu';
import { TokenUsageRing } from '@/components/TokenUsageRing';
import { ArkErrorInline } from '@/components/ArkErrorInline';
import { ArkMark } from '@/components/ArkMark';
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
import { shouldPaintStudioLive } from '@/lib/chatTurnIsolation';
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
import { MessageContent, GeneratingPlaceholder } from '@/components/MediaMessage';
import { ChatCodeOverlay } from '@/components/ChatCodeOverlay';
import {
  detectPluginIntent,
  getChatEnabledPlugins,
  getPluginRuntime,
  loadPluginState,
  runPluginAction,
  type PluginDef,
} from '@/lib/plugins';
import type { ChatMessage } from '@/types';
import {
  Loader2, ImageIcon, Video, Code2,
  Upload, Cpu, Cloud, ChevronDown, Check, Blocks, Folder, Square, X, ImagePlus,
  Puzzle, Briefcase, Github, Globe, Copy, Plus, Mic, MicOff,
} from 'lucide-react';
import { engineGenerateCancel, getEngineStatus, setEngineModel } from '@/lib/arkEngine';
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
import { runAIChatSend } from '@/views/aichat/useAIChatSend';

export function useAIChatController() {
  const { user } = useAuth();
  const { route, navigate } = useRouter();
  const { addCreation, addChat, addRecent, touchRecentProject, creations, chats, renameChat } = useRecentProjects();

  // Requirement: each app launch starts on a fresh chat (no resume of last thread).
  // Only strip a chatId that was ALREADY present on first paint. never wipe a chat
  // the user just created in this session (that race left them stuck on New Chat).
  const forceNewChatOnLaunch = useMemo(() => {
    try {
      const key = 'NOVA:session-first-chat-launch';
      const had = sessionStorage.getItem(key);
      if (had) return false;
      sessionStorage.setItem(key, '1');
      return true;
    } catch {
      return true;
    }
  }, []);

  const launchHadChatIdRef = useRef(Boolean(
    route.name === 'chat' && route.chatId && !route.creationId,
  ));
  const didForceNewChatRef = useRef(false);
  const chatRoute = route.name === 'chat' ? route : null;
  const shouldForceNewChat = forceNewChatOnLaunch
    && !didForceNewChatRef.current
    && launchHadChatIdRef.current;

  const effectiveChatId = shouldForceNewChat ? undefined : chatRoute?.chatId;

  const [loading, setLoading] = useState(() => {
    // Sync-load the active Recent thread so clicking Recent doesn't flash blank.
    if (route.name === 'chat' && effectiveChatId) {
      try {
        const raw = localStorage.getItem(chatThreadKey(effectiveChatId));
        if (raw) return false;
      } catch {
        /* ignore */
      }
    }
    return true;
  });
  const [threadSwitching, setThreadSwitching] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (route.name === 'chat' && effectiveChatId) {
      try {
        const raw = localStorage.getItem(chatThreadKey(effectiveChatId));
        if (raw) return JSON.parse(raw) as ChatMessage[];
      } catch {
        /* ignore */
      }
    }
    return [];
  });
  const [input, setInput] = useState('');
  /** Keep composer text per Chat / Image / Video / Voice — never bleed across tabs. */
  const inputRef = useRef('');
  const composerDraftByModeRef = useRef<Partial<Record<ChatMode, string>>>({});
  const composerModeRef = useRef<ChatMode>(
    route.name === 'chat' && route.mode && route.mode !== 'general' ? route.mode : 'general',
  );
  inputRef.current = input;
  const [mode, setMode] = useState<ChatMode>(() =>
    route.name === 'chat' && route.mode && route.mode !== 'general' ? route.mode : 'general',
  );
  const [activeModel, setActiveModel] = useState<ChatModelOption>(() => {
    const kind = kindForMode(
      route.name === 'chat' && route.mode && route.mode !== 'general' ? route.mode : 'general',
    );
    return defaultModelForKind(kind);
  });
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [chatPlugins, setChatPlugins] = useState<PluginDef[]>(() => getChatEnabledPlugins(loadPluginState()));
  const [ollamaModels, setOllamaModels] = useState<ChatModelOption[]>([]);
  const [engineLocalModels, setEngineLocalModels] = useState<ChatModelOption[]>([]);
  const [engineInstallingModels, setEngineInstallingModels] = useState<ChatModelOption[]>([]);
  const [engineReadyIds, setEngineReadyIds] = useState<Set<string>>(() => new Set());
  const [capacity, setCapacity] = useState<LiveCapacity | null>(null);
  const [generating, setGenerating] = useState(false);
  /** Live turn clock (ms) while generating — drives the stacked timer beside the model picker. */
  const [liveTurnMs, setLiveTurnMs] = useState(0);
  const liveTurnStartRef = useRef<number | null>(null);
  const [voicePhase, setVoicePhase] = useState<VoiceSessionPhase>('idle');
  const [dictating, setDictating] = useState(false);
  const [dictationHint, setDictationHint] = useState<string | null>(null);
  const dictationRef = useRef<LiveDictationHandle | null>(null);
  const dictationBaseRef = useRef('');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  useEffect(() => {
    if (!generating) {
      liveTurnStartRef.current = null;
      setLiveTurnMs(0);
      return;
    }
    if (liveTurnStartRef.current == null) {
      liveTurnStartRef.current = Date.now();
    }
    const tick = () => {
      const start = liveTurnStartRef.current;
      if (start == null) return;
      setLiveTurnMs(Date.now() - start);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [generating]);
  const [queueLen, setQueueLen] = useState(0);
  /** Bumps when queue items are edited so the banner re-renders. */
  const [queueTick, setQueueTick] = useState(0);
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const [editingQueueText, setEditingQueueText] = useState('');
  const editingQueueIdRef = useRef<string | null>(null);
  const [pendingImages, setPendingImages] = useState<{ id: string; name: string; dataUrl: string }[]>([]);
  const [chatStudioFiles, setChatStudioFiles] = useState<Record<string, string>>({});
  const [chatStudioProjectId, setChatStudioProjectId] = useState<string | null>(null);
  const [chatStudioDiskRoot, setChatStudioDiskRoot] = useState<string | null>(null);
  /** Folder/file ready to send with the next message (Cursor-style pending chip). */
  const [pendingAttaches, setPendingAttaches] = useState<ChatAttachMeta[]>([]);
  const [dragOverChat, setDragOverChat] = useState(false);
  const [dropHint, setDropHint] = useState<string | null>(null);
  const [pathBindOpen, setPathBindOpen] = useState(false);
  const [pathBindDraft, setPathBindDraft] = useState('');
  const pathBindInputRef = useRef<HTMLInputElement>(null);
  const [attachUploading, setAttachUploading] = useState<string | null>(null);
  const [githubPickerOpen, setGithubPickerOpen] = useState(false);
  const [deleteProjectPrompt, setDeleteProjectPrompt] = useState<{ projectName: string; folderPath: string } | null>(null);
  const [deleteProjectBusy, setDeleteProjectBusy] = useState(false);
  const [deleteFilePrompt, setDeleteFilePrompt] = useState<{ fileName: string; filePath: string } | null>(null);
  const [deleteFolderClarifyPrompt, setDeleteFolderClarifyPrompt] = useState<{ folderName: string; folderPath: string } | null>(null);
  const [deleteFileBusy, setDeleteFileBusy] = useState(false);
  const pendingProjectDeleteRef = useRef<{
    assistantId: string;
    chatId: string;
    mode: ChatMode;
    replyStartedAt: number;
    folderPath: string;
    projectId: string | null;
    projectName: string;
    mySeq: number;
  } | null>(null);
  const pendingFileDeleteRef = useRef<{
    assistantId: string;
    chatId: string;
    mode: ChatMode;
    replyStartedAt: number;
    filePath: string;
    fileName: string;
    projectId: string | null;
    relPath: string | null;
    mySeq: number;
  } | null>(null);
  const pendingFolderClarifyRef = useRef<{
    assistantId: string;
    chatId: string;
    mode: ChatMode;
    replyStartedAt: number;
    folderPath: string;
    folderName: string;
    projectId: string | null;
    mySeq: number;
  } | null>(null);
  const [inspectOfferId, setInspectOfferId] = useState<string | null>(null);
  /** actions = what next; handoff = after inspect */
  const [studioOfferKind, setStudioOfferKind] = useState<'actions' | 'handoff' | null>(null);
  const [githubOfferId, setGithubOfferId] = useState<string | null>(null);
  const [composerMode, setComposerMode] = useState<'plan' | 'ask' | 'agent' | 'debug' | 'multitask' | null>(null);
  const [videoDurationSec, setVideoDurationSec] = useState<10 | 20 | 30>(10);
  const [tokenRatio, setTokenRatio] = useState(0);
  const [modelRatio, setModelRatio] = useState(0);
  const [attachBusy, setAttachBusy] = useState(false);
  const stopRequestedRef = useRef(false);
  const generatingRef = useRef(false);
  /** Seed history/sticky for the send IIFE — must survive Rolldown DCE (outer consts were dropped). */
  const chatRouteSeedRef = useRef<{
    history: { role: 'user' | 'assistant'; content: string }[];
    sticky: ReturnType<typeof loadThreadBrain> | null;
  }>({ history: [], sticky: null });
  /**
   * Turn helpers for the send IIFE. Rolldown was leaving bare `clearGeneratingIfMine` /
   * `finalizeAssistant` identifiers inside the IIFE (unbound → ReferenceError), which left
   * Stop + queue stuck after the reply had already finished streaming.
   */
  const chatTurnCtlRef = useRef<{
    clearGenerating: () => void;
    finalizeAssistant: (finalText: string, provider: string, libraryId?: string) => void;
    pushStatus: (label: string) => void;
  }>({
    clearGenerating: () => {},
    finalizeAssistant: () => {},
    pushStatus: () => {},
  });
  /** Which chat id currently owns the in-flight generation (queue only for that chat). */
  const activeGenChatIdRef = useRef<string | null>(null);
  const pendingQueueRef = useRef<{ id: string; text: string; chatId: string }[]>([]);
  const persistChatIdRef = useRef<string | null>(null);
  /** Which chat owns the in-memory studio refs — never open Localhost from another thread's root. */
  const studioBoundChatIdRef = useRef<string | null>(null);
  /** Always-current route chat id. avoid stale closures when flushing the queue. */
  const routeChatIdRef = useRef<string | undefined>(undefined);
  const ignoreEnterUntilRef = useRef(0);
  /** Blocks double Enter / click from queueing the same prompt on top of itself. */
  const lastSendGuardRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const sendMessageRef = useRef<(content: string) => Promise<void>>(async () => {});
  const tryStartTurn = (text: string) => {
    if (generatingRef.current) return;
    const t = String(text || '').trim();
    if (!t) return;
    void sendMessageRef.current(t);
  };
  /** Bumps on every new send/stop so late chunks from an old turn cannot stick Stop/queue. */
  const genSeqRef = useRef(0);
  const persistTimerRef = useRef<number | undefined>(undefined);
  const activeModelRef = useRef(activeModel);
  const [freeKeyOpen, setFreeKeyOpen] = useState(false);
  const [failoverNote, setFailoverNote] = useState<string | null>(null);
  const [ipcFallbackDev, setIpcFallbackDev] = useState(false);
  /** Auto: equipped brain for this chat thread (sticky until failover). */
  const [threadBrain, setThreadBrain] = useState<ThreadBrain | null>(() => {
    if (route.name === 'chat' && effectiveChatId) {
      const m = route.mode && route.mode !== 'general' ? route.mode : 'general';
      return loadThreadBrain(effectiveChatId, brainKindForChatMode(m));
    }
    return null;
  });
  const threadBrainRef = useRef<ThreadBrain | null>(threadBrain);
  const [setupNote, setSetupNote] = useState<string | null>(() => {
    try {
      return localStorage.getItem('ark:setup-brain-note');
    } catch {
      return null;
    }
  });
  const [menuPos, setMenuPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  /** Once the user scrolls up during a turn, stay detached until they jump/send. */
  const userDetachScrollRef = useRef(false);
  /** Ignore scroll events briefly after chat switch / thread load (layout can falsely detach). */
  const ignoreScrollUntilRef = useRef(0);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const hydratedCreationRef = useRef<string | null>(null);
  /** Skip storage reload after we create a chat so Explore ideas doesn't flash back. */
  const skipChatLoadIdsRef = useRef<Set<string>>(new Set());
  /** Which chatId the in-memory messagesRef currently belongs to (prevents skip-load leaking another thread). */
  const messagesChatIdRef = useRef<string | null>(null);
  const messagesRef = useRef(messages);
  const imageBriefRef = useRef<{ chatId: string; original: string } | null>(null);
  const imageOfferPromptRef = useRef('');
  const [imageOfferId, setImageOfferId] = useState<string | null>(null);
  const [imageSwitchDismissed, setImageSwitchDismissed] = useState(false);
  const [codePillSticky, setCodePillSticky] = useState(false);
  const [codeOverlayOpen, setCodeOverlayOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const activeChatId = route.name === 'chat' ? route.chatId : undefined;
  const createJobLive = useCreateJob(activeChatId);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const chatStudioFilesRef = useRef<Record<string, string>>({});
  const chatStudioProjectIdRef = useRef<string | null>(null);
  const chatStudioDiskRootRef = useRef<string | null>(null);
  const lastInspectReplyRef = useRef('');
  const lastStudioIntentRef = useRef<StudioIntent | null>(null);
  const lastFindingsRef = useRef<InspectFinding[]>([]);
  const lastFolderLocateNoteRef = useRef<string | null>(null);
  chatStudioFilesRef.current = chatStudioFiles;
  chatStudioProjectIdRef.current = chatStudioProjectId;
  chatStudioDiskRootRef.current = chatStudioDiskRoot;
  previewUrlRef.current = previewUrl;

  const persistStudioSnapshot = (
    chatId: string,
    patch?: {
      files?: Record<string, string>;
      projectId?: string | null;
      name?: string;
      diskRoot?: string | null;
      previewUrl?: string | null;
    },
  ) => {
    if (!chatId) return;
    // Refs belong to studioBoundChatIdRef only. If unbound / other chat, never
    // copy that disk root into this thread (that was the Localhost bleed).
    const boundHere = studioBoundChatIdRef.current === chatId;
    const existing = boundHere ? null : loadChatStudio(chatId);
    const files = patch?.files
      ?? (boundHere ? chatStudioFilesRef.current : (existing?.files || {}));
    const diskRoot = patch?.diskRoot !== undefined
      ? patch.diskRoot
      : (boundHere ? chatStudioDiskRootRef.current : (existing?.diskRoot || null));
    if (!Object.keys(files).length && !diskRoot) return;
    saveChatStudio(chatId, {
      files,
      projectId: patch?.projectId !== undefined
        ? patch.projectId
        : (boundHere ? chatStudioProjectIdRef.current : (existing?.projectId || null)),
      name: patch?.name ?? (boundHere ? undefined : existing?.name),
      diskRoot,
      previewUrl: patch?.previewUrl !== undefined
        ? patch.previewUrl
        : (boundHere ? previewUrlRef.current : (existing?.previewUrl || null)),
    });
  };

  const applyStudioBinding = (
    chatId: string,
    snap: {
      files?: Record<string, string>;
      projectId?: string | null;
      name?: string;
      diskRoot?: string | null;
      previewUrl?: string | null;
    } | null,
  ) => {
    studioBoundChatIdRef.current = chatId;
    const files = snap?.files || {};
    setChatStudioFiles(files);
    chatStudioFilesRef.current = files;
    setChatStudioProjectId(snap?.projectId || null);
    chatStudioProjectIdRef.current = snap?.projectId || null;
    setChatStudioDiskRoot(snap?.diskRoot || null);
    chatStudioDiskRootRef.current = snap?.diskRoot || null;
    setPreviewUrl(snap?.previewUrl || null);
    previewUrlRef.current = snap?.previewUrl || null;
  };

  /**
   * #7 — Persist studio to the owning chat always; only paint live UI when that chat is on screen.
   * Prevents mid-build switches from binding the wrong folder / Preview onto another thread.
   */
  const commitStudioForChat = (
    chatId: string,
    snap: {
      files?: Record<string, string>;
      projectId?: string | null;
      name?: string;
      diskRoot?: string | null;
      previewUrl?: string | null;
    },
    opts?: { paintLive?: boolean },
  ) => {
    if (!chatId) return;
    persistStudioSnapshot(chatId, snap);
    const paint = opts?.paintLive ?? shouldPaintStudioLive(routeChatIdRef.current, chatId);
    if (paint) {
      applyStudioBinding(chatId, {
        files: snap.files ?? {},
        projectId: snap.projectId ?? null,
        name: snap.name,
        diskRoot: snap.diskRoot ?? null,
        previewUrl: snap.previewUrl ?? null,
      });
    }
  };

  const rebindStudioForChat = async (chatId: string) => {
    const title = loadRecentChats().find(c => c.id === chatId)?.title || null;
    const resolved = await resolveChatProjectRoot({ chatId, chatTitle: title });
    if (routeChatIdRef.current && routeChatIdRef.current !== chatId) return;
    applyStudioBinding(chatId, {
      files: resolved.files,
      projectId: resolved.projectId,
      name: resolved.name,
      diskRoot: resolved.diskRoot,
      previewUrl: resolved.previewUrl,
    });
  };

  /** Preview window id is always this chat — never another thread's localhost. */
  const previewWindowIdForChat = (chatId?: string | null) => {
    const id = String(chatId || persistChatIdRef.current || '').trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    return id ? `chat-${id}` : 'chat-preview';
  };

  const clearWorkspaceBinding = useCallback((chatId: string) => {
    if (studioBoundChatIdRef.current === chatId) {
      studioBoundChatIdRef.current = null;
    }
    setChatStudioFiles({});
    chatStudioFilesRef.current = {};
    setChatStudioProjectId(null);
    chatStudioProjectIdRef.current = null;
    setChatStudioDiskRoot(null);
    chatStudioDiskRootRef.current = null;
    setPreviewUrl(null);
    setCodePillSticky(false);
    clearChatStudio(chatId);
  }, []);

  const finishPendingDeleteReply = useCallback((
    assistantId: string,
    chatId: string,
    threadMode: ChatMode,
    replyText: string,
    replyStartedAt: number,
  ) => {
    const reply: ChatMessage = {
      id: assistantId,
      user_id: user?.id ?? 'guest',
      project_id: null,
      role: 'assistant',
      content: replyText,
      provider_used: 'NOVA',
      created_at: new Date().toISOString(),
      elapsed_ms: Date.now() - replyStartedAt,
    };
    const patch = (list: ChatMessage[]) => list.map(m => (m.id === assistantId ? reply : m));
    const viewingThis = Boolean(chatId && routeChatIdRef.current === chatId);
    let next = viewingThis
      ? patch(messagesRef.current)
      : (() => {
        try {
          const raw = localStorage.getItem(chatThreadKey(chatId));
          const stored = raw ? JSON.parse(raw) as ChatMessage[] : [];
          if (Array.isArray(stored) && stored.some(m => m.id === assistantId)) return patch(stored);
        } catch { /* ignore */ }
        return patch(messagesRef.current);
      })();
    if (!next.some(m => m.id === assistantId)) {
      try {
        const raw = localStorage.getItem(chatThreadKey(chatId));
        const stored = raw ? JSON.parse(raw) as ChatMessage[] : [];
        if (Array.isArray(stored) && stored.some(m => m.id === assistantId)) next = patch(stored);
      } catch { /* ignore */ }
    }
    if (viewingThis) {
      messagesRef.current = next;
      messagesChatIdRef.current = chatId;
      setMessages(next);
    } else {
      setMessages(prev => prev);
    }
    persistModeThread(threadMode, next, { chatId });
    generatingRef.current = false;
    if (activeGenChatIdRef.current === chatId) {
      activeGenChatIdRef.current = null;
    }
    setGenerating(false);
    notifyChatDone(chatId);
  }, [user?.id]);

  const handleDeleteProjectCancel = useCallback(() => {
    const pending = pendingProjectDeleteRef.current;
    pendingProjectDeleteRef.current = null;
    setDeleteProjectPrompt(null);
    if (!pending) return;
    finishPendingDeleteReply(
      pending.assistantId,
      pending.chatId,
      pending.mode,
      'Delete canceled.',
      pending.replyStartedAt,
    );
  }, [finishPendingDeleteReply]);

  const handleDeleteProjectConfirm = useCallback(async () => {
    const pending = pendingProjectDeleteRef.current;
    if (!pending || deleteProjectBusy) return;
    setDeleteProjectBusy(true);

    const {
      assistantId,
      chatId,
      mode: threadMode,
      folderPath,
      projectId,
      projectName,
      replyStartedAt,
      mySeq,
    } = pending;

    const statusContent = '__generating__:chat:Deleting project folder…';
    setMessages(prev => {
      const next = prev.map(m => (m.id === assistantId ? { ...m, content: statusContent } : m));
      messagesRef.current = next;
      return next;
    });

    try {
      const boundRoot = String(chatStudioDiskRootRef.current || '').replace(/[/\\]+$/, '').toLowerCase();
      const deletedRoot = String(folderPath || '').replace(/[/\\]+$/, '').toLowerCase();
      if (boundRoot && deletedRoot && boundRoot === deletedRoot) {
        clearWorkspaceBinding(chatId);
      }
      clearLastListedFolder(chatId);
      clearLastDiskTarget(chatId);
      const del = await deleteProjectFolderOnDisk({ folderPath, projectId });
      void mySeq;
      const text = del.ok
        ? `Deleted **${projectName}** from your PC.\n\n\`${del.path || folderPath}\``
        : (del.error || `Could not delete **${projectName}**. Close File Explorer if that folder is open, then try again.`);
      // Always finalize origin chat — genSeq bumps (Stop / New Chat) must not leave Deleting…
      finishPendingDeleteReply(assistantId, chatId, threadMode, text, replyStartedAt);
    } catch (err) {
      finishPendingDeleteReply(
        assistantId,
        chatId,
        threadMode,
        err instanceof Error ? err.message : 'Delete failed.',
        replyStartedAt,
      );
    } finally {
      setDeleteProjectBusy(false);
      setDeleteProjectPrompt(null);
      pendingProjectDeleteRef.current = null;
    }
  }, [clearWorkspaceBinding, deleteProjectBusy, finishPendingDeleteReply]);

  const handleDeleteFileCancel = useCallback(() => {
    const pending = pendingFileDeleteRef.current;
    pendingFileDeleteRef.current = null;
    setDeleteFilePrompt(null);
    if (!pending) return;
    finishPendingDeleteReply(
      pending.assistantId,
      pending.chatId,
      pending.mode,
      'Delete canceled.',
      pending.replyStartedAt,
    );
  }, [finishPendingDeleteReply]);

  const handleDeleteFileConfirm = useCallback(async () => {
    const pending = pendingFileDeleteRef.current;
    if (!pending || deleteFileBusy) return;
    setDeleteFileBusy(true);

    const {
      assistantId,
      chatId,
      mode: threadMode,
      filePath,
      fileName,
      projectId,
      relPath,
      replyStartedAt,
      mySeq,
    } = pending;

    const statusContent = '__generating__:chat:Deleting file…';
    setMessages(prev => {
      const next = prev.map(m => (m.id === assistantId ? { ...m, content: statusContent } : m));
      messagesRef.current = next;
      return next;
    });

    try {
      const del = await deleteFileOnDisk({ filePath, projectId, relPath });
      void mySeq;
      if (del.ok && relPath && projectId) {
        const nextFiles = { ...chatStudioFilesRef.current };
        delete nextFiles[relPath];
        setChatStudioFiles(nextFiles);
        chatStudioFilesRef.current = nextFiles;
        persistStudioSnapshot(chatId, {
          files: nextFiles,
          projectId,
          diskRoot: chatStudioDiskRootRef.current,
        });
      }
      if (del.ok) clearLastDiskTarget(chatId);
      const text = del.ok
        ? `Deleted **${fileName}**.\n\n\`${del.path || filePath}\``
        : (del.error || `Could not delete **${fileName}**. Close the app using that file, then try again.`);
      finishPendingDeleteReply(assistantId, chatId, threadMode, text, replyStartedAt);
    } catch (err) {
      finishPendingDeleteReply(
        assistantId,
        chatId,
        threadMode,
        err instanceof Error ? err.message : 'Delete failed.',
        replyStartedAt,
      );
    } finally {
      setDeleteFileBusy(false);
      setDeleteFilePrompt(null);
      pendingFileDeleteRef.current = null;
    }
  }, [deleteFileBusy, finishPendingDeleteReply]);

  const handleFolderClarifyCancel = useCallback(() => {
    const pending = pendingFolderClarifyRef.current;
    pendingFolderClarifyRef.current = null;
    setDeleteFolderClarifyPrompt(null);
    if (!pending) return;
    finishPendingDeleteReply(
      pending.assistantId,
      pending.chatId,
      pending.mode,
      'Delete canceled.',
      pending.replyStartedAt,
    );
  }, [finishPendingDeleteReply]);

  const handleFolderClarifyConfirm = useCallback(async () => {
    const pending = pendingFolderClarifyRef.current;
    if (!pending || deleteFileBusy) return;
    setDeleteFileBusy(true);

    const {
      assistantId,
      chatId,
      mode: threadMode,
      folderPath,
      folderName,
      projectId,
      replyStartedAt,
      mySeq,
    } = pending;

    const statusContent = '__generating__:chat:Deleting project folder…';
    setMessages(prev => {
      const next = prev.map(m => (m.id === assistantId ? { ...m, content: statusContent } : m));
      messagesRef.current = next;
      return next;
    });

    try {
      const boundRoot = String(chatStudioDiskRootRef.current || '').replace(/[/\\]+$/, '').toLowerCase();
      const deletedRoot = String(folderPath || '').replace(/[/\\]+$/, '').toLowerCase();
      if (boundRoot && deletedRoot && boundRoot === deletedRoot) {
        clearWorkspaceBinding(chatId);
      }
      clearLastListedFolder(chatId);
      clearLastDiskTarget(chatId);
      const del = await deleteProjectFolderOnDisk({ folderPath, projectId });
      void mySeq;
      const text = del.ok
        ? `Deleted **${folderName}** from your PC.\n\n\`${del.path || folderPath}\``
        : (del.error || `Could not delete **${folderName}**. Close File Explorer if that folder is open, then try again.`);
      finishPendingDeleteReply(assistantId, chatId, threadMode, text, replyStartedAt);
    } catch (err) {
      finishPendingDeleteReply(
        assistantId,
        chatId,
        threadMode,
        err instanceof Error ? err.message : 'Delete failed.',
        replyStartedAt,
      );
    } finally {
      setDeleteFileBusy(false);
      setDeleteFolderClarifyPrompt(null);
      pendingFolderClarifyRef.current = null;
    }
  }, [clearWorkspaceBinding, deleteFileBusy, finishPendingDeleteReply]);

  useEffect(() => {
    activeModelRef.current = activeModel;
  }, [activeModel]);

  useEffect(() => {
    threadBrainRef.current = threadBrain;
  }, [threadBrain]);

  useEffect(() => {
    const onBackup = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string }>).detail;
      if (detail?.name) setFailoverNote(`Downloading backup · ${detail.name}`);
    };
    window.addEventListener(BACKUP_DOWNLOAD_EVENT, onBackup);
    return () => window.removeEventListener(BACKUP_DOWNLOAD_EVENT, onBackup);
  }, []);

  useEffect(() => {
    if (generatingRef.current && messagesRef.current.length > messages.length) return;
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!shouldForceNewChat) {
      // No launch-time thread to clear. never steal later navigations.
      if (forceNewChatOnLaunch) didForceNewChatRef.current = true;
      return;
    }
    didForceNewChatRef.current = true;
    const nextMode = chatRoute?.mode && chatRoute.mode !== 'general' ? chatRoute.mode : undefined;
    navigate({ name: 'chat', mode: nextMode });
  }, [shouldForceNewChat, forceNewChatOnLaunch, navigate, chatRoute?.mode]);

  useEffect(() => {
    if (route.name !== 'chat') {
      // Keep the active thread id while a gen is in flight (Settings / Local AI hops).
      if (!generatingRef.current) {
        routeChatIdRef.current = undefined;
      }
      return;
    }
    if (effectiveChatId) {
      routeChatIdRef.current = effectiveChatId;
      persistChatIdRef.current = effectiveChatId;
      return;
    }
    // Blank New Chat / Image / Video — always detach the view from the prior thread, even if
    // a background reply is still finishing. Keeping routeChatIdRef mid-gen painted the old
    // story onto the empty starter and left queue/Stop chrome looking "stuck on New Chat".
    routeChatIdRef.current = undefined;
    persistChatIdRef.current = null;
  }, [route, effectiveChatId]);

  const refreshChatPlugins = () => {
    setChatPlugins(getChatEnabledPlugins(loadPluginState()));
  };

  const greeting = useMemo(
    () => GREETINGS[Math.floor(Math.random() * GREETINGS.length)],
    [],
  );

  const placeholder = useMemo(() => {
    const list = PLACEHOLDERS[mode];
    return list[Math.floor(Math.random() * list.length)];
  }, [mode]);

  const workspaceBadgeLabel = useMemo(() => {
    // Bound disk path always wins — never use chat title (that became "Add a one-line…").
    if (chatStudioDiskRoot) {
      return studioPathBasename(chatStudioDiskRoot) || chatStudioDiskRoot;
    }
    if (pendingAttaches[0]?.name) return pendingAttaches[0].name;
    const chatId = route.name === 'chat' ? route.chatId : undefined;
    if (chatId) {
      const snap = loadChatStudio(chatId);
      if (snap?.diskRoot) return studioPathBasename(snap.diskRoot) || snap.diskRoot;
      // No disk bind yet — do not show a fake folder pill from chat title / snap.name.
    }
    if (Object.keys(chatStudioFiles).length) return 'Attached project';
    return null;
  }, [pendingAttaches, chatStudioDiskRoot, chatStudioFiles, route]);

  const showStudioPills = useMemo(() => {
    const chatId = route.name === 'chat' ? route.chatId : undefined;
    if (codePillSticky) return true;
    if (!chatId) return false;
    if (!chatHasBuildWorkspace(chatId)) return false;
    return Boolean(
      chatStudioDiskRoot
      || previewUrl
      || Object.keys(chatStudioFiles).length > 0
      || chatStudioProjectId,
    );
  }, [
    route,
    codePillSticky,
    chatStudioDiskRoot,
    previewUrl,
    chatStudioFiles,
    chatStudioProjectId,
  ]);

  const autoModelLabel = useMemo(() => autoPillLabel(threadBrain), [threadBrain]);
  const threadKind = useMemo(() => brainKindForChatMode(mode), [mode]);

  const unpickAutoSticky = () => {
    const chatId = routeChatIdRef.current ?? persistChatIdRef.current;
    if (chatId) clearThreadBrain(chatId, threadKind);
    setThreadBrain(null);
  };

  useEffect(() => {
    if (route.name !== 'chat') return;
    const next = route.mode && route.mode !== 'general' ? route.mode : 'general';
    const prev = composerModeRef.current;
    if (prev !== next) {
      // Stash outgoing tab text, restore the destination tab's own draft (or empty).
      composerDraftByModeRef.current[prev] = inputRef.current;
      let nextDraft = composerDraftByModeRef.current[next] ?? '';
      if (next === 'image' || next === 'video') {
        try {
          const handoff = localStorage.getItem(`NOVA:chat-draft:${next}`);
          if (handoff != null) {
            nextDraft = handoff;
            localStorage.removeItem(`NOVA:chat-draft:${next}`);
          }
        } catch {
          /* ignore */
        }
      }
      setInput(nextDraft);
      inputRef.current = nextDraft;
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      composerModeRef.current = next;
    }
    setMode(next);
    const kind = kindForMode(next);
    setActiveModel(prevModel => (prevModel.kind === kind ? prevModel : defaultModelForKind(kind)));
  }, [route, navigate]);

  // Image / Video routes are retired — bounce to plain Chat. Voice stays.
  useEffect(() => {
    if (route.name !== 'chat') return;
    if (route.mode !== 'image' && route.mode !== 'video') return;
    navigate({ name: 'chat', chatId: route.chatId, creationId: route.creationId });
  }, [route, navigate]);

  useEffect(() => {
    if (mode !== 'voice') {
      setVoicePhase('idle');
      stopSpeaking();
      return;
    }
    setMessages([]);
    messagesRef.current = [];
    persistChatIdRef.current = null;
    routeChatIdRef.current = undefined;
    activeGenChatIdRef.current = null;
    setGenerating(false);
    generatingRef.current = false;
    const syncTimer = window.setTimeout(() => {
      void syncAutoVoiceDevices();
    }, 0);
    return () => window.clearTimeout(syncTimer);
  }, [mode]);

  // After Chat → Image handoff, auto-send the carried prompt once.
  useEffect(() => {
    if (route.name !== 'chat' || mode !== 'image') return;
    let prompt: string | null = null;
    try {
      if (sessionStorage.getItem('NOVA:image-handoff-send') === '1') {
        prompt = sessionStorage.getItem('NOVA:image-handoff-prompt');
        sessionStorage.removeItem('NOVA:image-handoff-send');
        sessionStorage.removeItem('NOVA:image-handoff-prompt');
      }
    } catch {
      /* ignore */
    }
    if (!prompt || generatingRef.current) return;
    const t = window.setTimeout(() => {
      if (!generatingRef.current && prompt) void sendMessageRef.current(prompt);
    }, 120);
    return () => window.clearTimeout(t);
  }, [mode, route.name]);

  // Open a Recent creation into a continuable Image/Video chat thread.
  useEffect(() => {
    if (route.name !== 'chat' || !route.creationId || route.chatId) {
      if (route.name === 'chat' && !route.creationId) {
        hydratedCreationRef.current = null;
      }
      return;
    }
    const creationId = route.creationId;
    if (hydratedCreationRef.current === creationId) return;
    const creation = creations.find(c => c.id === creationId);
    if (!creation) return;

    hydratedCreationRef.current = creationId;
    const tab = creation.kind === 'video'
      ? (isVideoTabEnabled() ? 'video' : 'general')
      : (isImageTabEnabled() ? 'image' : 'general');
    let cancelled = false;

    void (async () => {
      setLoading(true);
      const dataUrl = await resolveCreationDataUrl(creation);
      if (cancelled) return;
      if (dataUrl) rememberThumb(creation.id, dataUrl);
      const assistantContent = mediaMessageMarkdown(
        creation.title || creation.prompt,
        creation.id,
        dataUrl || undefined,
      );
      const seeded: ChatMessage[] = [
        {
          id: `seed-u-${creation.id}`,
          user_id: user?.id || 'guest',
          project_id: null,
          role: 'user',
          content: creation.prompt || creation.title,
          provider_used: null,
          created_at: creation.createdAt,
        },
        {
          id: `seed-a-${creation.id}`,
          user_id: user?.id || 'guest',
          project_id: null,
          role: 'assistant',
          content: slimChatContent(assistantContent, creation.id),
          provider_used: creation.modelName,
          created_at: creation.createdAt,
        },
      ];
      try {
        const raw = localStorage.getItem(`NOVA:chat-thread:creation:${creationId}`);
        if (raw) {
          const existing = JSON.parse(raw) as ChatMessage[];
          if (Array.isArray(existing) && existing.length > 0) {
            setMessages(existing);
            setMode(tab);
            setActiveModel(defaultModelForKind(
              tab === 'video' ? 'video' : tab === 'image' ? 'image' : 'chat',
            ));
            setLoading(false);
            return;
          }
        }
      } catch {
        /* ignore */
      }
      setMessages(seeded);
      try {
        localStorage.setItem(`NOVA:chat-thread:creation:${creationId}`, JSON.stringify(seeded));
      } catch {
        /* ignore */
      }
      setMode(tab);
      setActiveModel(defaultModelForKind(
        tab === 'video' ? 'video' : tab === 'image' ? 'image' : 'chat',
      ));
      setLoading(false);
      requestAnimationFrame(() => focusComposerIfSafe(textareaRef.current));
    })();

    return () => {
      cancelled = true;
    };
  }, [route, creations, navigate, user?.id]);

  // Load thread: Recent chatId, or empty New Chat / Image / Video starter.
  useEffect(() => {
    if (route.name !== 'chat') return;
    if (route.creationId && !route.chatId) return;

    const kind = brainKindForChatMode(
      route.mode && route.mode !== 'general' ? route.mode : mode,
    );

    if (route.chatId) {
      const inFlight = Boolean(
        generatingRef.current && activeGenChatIdRef.current === route.chatId,
      );
      // Never clobber an in-progress Image/Video (or chat) turn by reloading disk.
      if (inFlight) {
        setLoading(false);
        setGenerating(true);
        return;
      }
      // We just created this chat and already have messages in state. don't wipe them.
      // Only skip when the in-memory thread actually belongs to this chatId — otherwise a
      // Recent switch can keep the previous chat's bubbles and later overwrite storage.
      if (
        skipChatLoadIdsRef.current.has(route.chatId)
        && messagesChatIdRef.current === route.chatId
        && messagesRef.current.length > 0
      ) {
        skipChatLoadIdsRef.current.delete(route.chatId);
        setLoading(false);
        setGenerating(Boolean(generatingRef.current && activeGenChatIdRef.current === route.chatId));
        // Still rebind studio — skipping this left Localhost on the previous chat's app.
        const liveGenSkip = Boolean(
          generatingRef.current && activeGenChatIdRef.current === route.chatId,
        );
        if (!liveGenSkip) {
          const hadPreview = Boolean(previewUrlRef.current);
          const switchChatId = route.chatId;
          void (async () => {
            if (hadPreview) {
              void window.arkDesktop?.previewCloseLive?.().catch(() => undefined);
            }
            await rebindStudioForChat(switchChatId);
            const root = chatStudioDiskRootRef.current;
            if (root && window.arkDesktop?.readTextFile) {
              try {
                const hydrated = await loadPreviewFilesFromDisk(root);
                if (Object.keys(hydrated).length) {
                  const merged = { ...chatStudioFilesRef.current, ...hydrated };
                  setChatStudioFiles(merged);
                  chatStudioFilesRef.current = merged;
                }
              } catch {
                /* ignore */
              }
            }
            // Never auto-open Localhost on Recent switch — user opens Preview when ready.
          })();
        }
        return;
      }
      // Stale skip flag from another view — drop it and load this thread from storage.
      if (skipChatLoadIdsRef.current.has(route.chatId)) {
        skipChatLoadIdsRef.current.delete(route.chatId);
      }

      // Switch loading: clear previous thread immediately so the old chat never paints over this one.
      const switchChatId = route.chatId;
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = undefined;
      }
      // Queue is per-view: never show another chat's backlog here.
      pendingQueueRef.current = pendingQueueRef.current.filter(q => q.chatId === switchChatId);
      setQueueLen(pendingQueueRef.current.length);
      setQueueTick(t => t + 1);
      setEditingQueueId(null);
      setEditingQueueText('');
      const hadPreview = Boolean(previewUrlRef.current);
      let nextMsgs: ChatMessage[] = [];
      try {
        const raw = localStorage.getItem(chatThreadKey(switchChatId));
        const loaded = raw ? JSON.parse(raw) as ChatMessage[] : [];
        nextMsgs = Array.isArray(loaded) ? loaded : [];
      } catch {
        nextMsgs = [];
      }
      messagesRef.current = nextMsgs;
      messagesChatIdRef.current = switchChatId;
      setMessages(nextMsgs);
      setThreadBrain(loadThreadBrain(switchChatId, kind));
      setThreadSwitching(true);
      setLoading(false);
      stickToBottomRef.current = true;
      userDetachScrollRef.current = false;
      setShowJumpToBottom(false);
      ignoreScrollUntilRef.current = Date.now() + 600;
      studioBoundChatIdRef.current = null;
      setChatStudioFiles({});
      chatStudioFilesRef.current = {};
      setChatStudioProjectId(null);
      chatStudioProjectIdRef.current = null;
      setChatStudioDiskRoot(null);
      chatStudioDiskRootRef.current = null;
      setPreviewUrl(null);
      previewUrlRef.current = null;
      setPendingAttaches([]);
      setCodePillSticky(false);
      pinMessagesToBottom('auto');

      void (async () => {
        try {
          if (routeChatIdRef.current && routeChatIdRef.current !== switchChatId) return;
        } catch {
          if (routeChatIdRef.current && routeChatIdRef.current !== switchChatId) return;
        }

        const liveGenHere = Boolean(
          generatingRef.current && activeGenChatIdRef.current === switchChatId,
        );
        if (liveGenHere) {
          // Mid-build return: restore this chat's saved studio — do not steal another thread's live refs.
          try {
            const snap = loadChatStudio(switchChatId);
            if (snap && (Object.keys(snap.files || {}).length || snap.diskRoot)) {
              applyStudioBinding(switchChatId, snap);
            }
          } catch {
            /* ignore */
          }
        } else {
          if (hadPreview) {
            void window.arkDesktop?.previewCloseLive?.().catch(() => undefined);
          }
          await rebindStudioForChat(switchChatId);
          // Warm file binding from disk so Preview/Code are ready — do not open Localhost.
          const root = chatStudioDiskRootRef.current;
          if (root && window.arkDesktop?.readTextFile) {
            try {
              const hydrated = await loadPreviewFilesFromDisk(root);
              if (Object.keys(hydrated).length && (!routeChatIdRef.current || routeChatIdRef.current === switchChatId)) {
                // Prefer fresher in-memory studio edits over thin/stale disk hydrate.
                const merged = { ...hydrated, ...chatStudioFilesRef.current };
                setChatStudioFiles(merged);
                chatStudioFilesRef.current = merged;
                persistStudioSnapshot(switchChatId, {
                  files: merged,
                  projectId: chatStudioProjectIdRef.current,
                  name: studioPathBasename(root) || undefined,
                  diskRoot: root,
                  previewUrl: null,
                });
              }
            } catch {
              /* ignore */
            }
          }
          setPreviewUrl(null);
          previewUrlRef.current = null;
        }
        if (routeChatIdRef.current && routeChatIdRef.current !== switchChatId) return;
        setCodePillSticky(hasChatCodePill(switchChatId));
        // Clear stale generating placeholders from a crashed prior turn.
        try {
          const rawInflight = sessionStorage.getItem('NOVA:inflight-media');
          const inflight = rawInflight
            ? JSON.parse(rawInflight) as { chatId?: string; mode?: string; startedAt?: number }
            : null;
          const stale = Boolean(inflight?.startedAt && Date.now() - inflight.startedAt > 180_000);
          const liveHere = Boolean(
            generatingRef.current && activeGenChatIdRef.current === switchChatId,
          );
          if (!liveHere) {
            const stuckChat = messagesRef.current.some(
              m => m.role === 'assistant' && String(m.content || '').startsWith('__generating__:chat:'),
            );
            if (stuckChat || stale || (inflight?.chatId && inflight.chatId !== switchChatId)) {
              if (stale || (inflight?.chatId && inflight.chatId !== switchChatId)) {
                sessionStorage.removeItem('NOVA:inflight-media');
              }
              setMessages(prev => {
                const next = prev.map(m => (
                  m.role === 'assistant' && String(m.content || '').startsWith('__generating__:')
                    ? { ...m, content: '(interrupted. send again)' }
                    : m
                ));
                messagesRef.current = next;
                persistModeThread(mode, next, { chatId: switchChatId });
                return next;
              });
              generatingRef.current = false;
              setGenerating(false);
            }
          } else if (inflight?.chatId === switchChatId) {
            const last = messagesRef.current[messagesRef.current.length - 1];
            if (last?.role === 'assistant' && String(last.content || '').startsWith('__generating__:')) {
              activeGenChatIdRef.current = switchChatId;
              generatingRef.current = true;
              setGenerating(true);
            }
          }
        } catch {
          /* ignore */
        }
        setGenerating(Boolean(generatingRef.current && activeGenChatIdRef.current === switchChatId));
        setLoading(false);
        setThreadSwitching(false);
        requestAnimationFrame(() => focusComposerIfSafe(textareaRef.current));
      })();
      return;
    }

    // Fresh New Chat / Image / Video — always empty canvas.
    // Never paint the previous recent thread here (that looked like "new chat shows old chat").
    // Background generation for another chatId can keep running via keepChatAlive; this route
    // must still show a blank starter.
    try {
      const raw = sessionStorage.getItem('NOVA:inflight-media');
      const inflight = raw ? JSON.parse(raw) as { chatId?: string; mode?: string } : null;
      if (
        inflight?.chatId
        && inflight.mode
        && (route.mode === inflight.mode || (!route.mode && inflight.mode === 'general'))
      ) {
        // Media mid-flight: jump back to that chat instead of a blank conflicting canvas.
        navigate({
          name: 'chat',
          mode: inflight.mode === 'general' ? undefined : (inflight.mode as 'image' | 'video'),
          chatId: inflight.chatId,
        });
        setLoading(false);
        return;
      }
    } catch {
      /* ignore */
    }
    setMessages([]);
    messagesRef.current = [];
    messagesChatIdRef.current = null;
    setThreadBrain(null);
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = undefined;
    }
    studioBoundChatIdRef.current = null;
    setChatStudioFiles({});
    chatStudioFilesRef.current = {};
    setChatStudioProjectId(null);
    chatStudioProjectIdRef.current = null;
    setChatStudioDiskRoot(null);
    chatStudioDiskRootRef.current = null;
    setPreviewUrl(null);
    previewUrlRef.current = null;
    setPendingAttaches([]);
    setPendingImages([]);
    setCodePillSticky(false);
    lastStudioIntentRef.current = null;
    lastFindingsRef.current = [];
    void window.arkDesktop?.previewCloseLive?.().catch(() => undefined);
    // Drop any pending create brief so a new chat cannot inherit the previous idea.
    try {
      const staleId = persistChatIdRef.current || routeChatIdRef.current;
      if (staleId) clearLastPendingGreenfield(staleId);
    } catch { /* ignore */ }
    persistChatIdRef.current = null;
    // Blank starter must not show another chat's Stop / queue UI.
    // Do NOT bump genSeq or stopRequested — a prior thread may still be finishing in the
    // background and must keep writing to its own chatId (see finalizeAssistant).
    pendingQueueRef.current = [];
    setQueueLen(0);
    setQueueTick(t => t + 1);
    setEditingQueueId(null);
    setEditingQueueText('');
    if (activeGenChatIdRef.current && routeChatIdRef.current
      && activeGenChatIdRef.current === routeChatIdRef.current) {
      // Only clear generating chrome when the abandoned view was that same in-flight chat.
      activeGenChatIdRef.current = null;
      generatingRef.current = false;
      setGenerating(false);
    } else if (!routeChatIdRef.current) {
      // Blank New Chat: hide Stop even if another chat is still answering.
      generatingRef.current = false;
      setGenerating(false);
    }
    setLoading(false);
  }, [route, mode, navigate]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void probeLiveCapacity().then(cap => {
        if (!cancelled) {
          setCapacity(cap);
          // Provider keys are hydrated asynchronously from the desktop vault.
          // Re-resolve the picker after that event so a saved cloud preference
          // does not remain stuck on a blank/invalid model.
          setActiveModel(defaultModelForKind(activeModelRef.current.kind));
        }
      });
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('NOVA:ollama-changed', refresh);
    window.addEventListener('NOVA:provider-keys-changed', refresh);
    window.addEventListener('NOVA:cloud-sources-changed', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('NOVA:ollama-changed', refresh);
      window.removeEventListener('NOVA:provider-keys-changed', refresh);
      window.removeEventListener('NOVA:cloud-sources-changed', refresh);
    };
  }, []);

  useEffect(() => {
    const loadOllama = () => {
      void import('@/lib/ollamaOptional').then(async ({ isOllamaEnabled, probeOllamaOptional }) => {
        if (!isOllamaEnabled()) {
          setOllamaModels([]);
          return;
        }
        const res = await probeOllamaOptional();
        if (!res.online) {
          setOllamaModels([]);
          return;
        }
        setOllamaModels(
          res.models.slice(0, 20).map(m => ({
            id: `ollama:${m.name}`,
            name: m.name,
            source: 'local' as const,
            detail: 'Ollama · optional',
            kind: 'chat' as const,
          })),
        );
      });
    };
    loadOllama();
    window.addEventListener('NOVA:ollama-changed', loadOllama);
    window.addEventListener('focus', loadOllama);
    return () => {
      window.removeEventListener('NOVA:ollama-changed', loadOllama);
      window.removeEventListener('focus', loadOllama);
    };
  }, []);

  useEffect(() => {
    const loadEngine = () => {
      void getEngineStatus()
        .then(status => {
          const ready = status.models
            .filter(m =>
              m.status === 'ready'
              && m.id !== 'NOVA-core'
              && m.id !== 'NOVA-image-core'
              && m.id !== 'NOVA-video-core',
            )
            .map(m => ({
              id: m.id,
              name: m.name,
              source: 'local' as const,
              detail: 'Ready',
              kind: 'chat' as const,
            }));
          const readyIds = new Set(ready.map(m => m.id));
          const installing = status.models
            .filter(m => m.status === 'downloading')
            .map(m => ({
              id: m.id,
              name: m.name,
              source: 'local' as const,
              detail: m.progress != null ? `Installing… ${Math.round(m.progress)}%` : 'Installing…',
              kind: 'chat' as const,
            }));
          setEngineLocalModels(ready);
          setEngineInstallingModels(installing);
          setEngineReadyIds(readyIds);
          // Resolve a saved local preference against the real Engine row.
          // Before status loads it is only a placeholder, which made an
          // installed model look absent from the connected picker.
          setActiveModel(prev => {
            if (prev.kind !== 'chat' || prev.source !== 'local' || prev.id.startsWith('ollama:')) return prev;
            const installed = ready.find(m => m.id === prev.id);
            if (installed) return installed;
            if (!readyIds.has(prev.id)) {
              return CHAT_MODELS.find(m => m.id === 'NOVA-auto' && m.kind === 'chat') || prev;
            }
            return prev;
          });
        })
        .catch(() => {
          setEngineLocalModels([]);
          setEngineInstallingModels([]);
          setEngineReadyIds(new Set());
        });
    };
    loadEngine();
    const t = window.setInterval(loadEngine, 2500);
    window.addEventListener('focus', loadEngine);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('focus', loadEngine);
    };
  }, []);

  useEffect(() => {
    refreshChatPlugins();
    const onFocus = () => refreshChatPlugins();
    const onPlugins = () => refreshChatPlugins();
    window.addEventListener('focus', onFocus);
    window.addEventListener('NOVA:plugins-changed', onPlugins);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('NOVA:plugins-changed', onPlugins);
    };
  }, [route]);

  const pinMessagesToBottom = (behavior: ScrollBehavior = 'auto') => {
    stickToBottomRef.current = true;
    userDetachScrollRef.current = false;
    setShowJumpToBottom(false);
    ignoreScrollUntilRef.current = Date.now() + 400;
    const el = messagesScrollRef.current;
    const run = () => {
      if (el) el.scrollTop = el.scrollHeight;
      else messagesEndRef.current?.scrollIntoView({ behavior });
    };
    run();
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
  };

  useEffect(() => {
    // Only pin to bottom when the user is already near the end. never yank scroll while reading history.
    if (!stickToBottomRef.current || userDetachScrollRef.current) return;
    const el = messagesScrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  const onMessagesScroll = () => {
    const el = messagesScrollRef.current;
    if (!el) return;
    if (Date.now() < ignoreScrollUntilRef.current) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (userDetachScrollRef.current) {
      // Re-attach only when the user clearly returns to the bottom.
      if (distFromBottom < 48) {
        userDetachScrollRef.current = false;
        stickToBottomRef.current = true;
        setShowJumpToBottom(false);
      } else {
        stickToBottomRef.current = false;
        setShowJumpToBottom(true);
      }
      return;
    }
    // Hysteresis: leave stick early when scrolling up; re-stick only when clearly at bottom.
    if (distFromBottom > 100) stickToBottomRef.current = false;
    else if (distFromBottom < 48) stickToBottomRef.current = true;
    setShowJumpToBottom(distFromBottom > 160);
  };

  const onMessagesWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    if (Date.now() < ignoreScrollUntilRef.current) return;
    if (e.deltaY < 0) {
      userDetachScrollRef.current = true;
      stickToBottomRef.current = false;
      setShowJumpToBottom(true);
    }
  };

  const jumpToBottom = () => {
    pinMessagesToBottom('smooth');
  };
  useLayoutEffect(() => {
    if (!modelMenuOpen) {
      setMenuPos(null);
      return;
    }
    const place = () => {
      const btn = modelButtonRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const shell = btn.closest('[data-ark-composer]') as HTMLElement | null;
      const shellRect = shell?.getBoundingClientRect();
      const menuW = 288; // w-72
      const gap = 12;
      // Right edge of menu lines up with the chat box right edge.
      const anchorRight = shellRect?.right ?? r.right;
      const left = Math.min(
        Math.max(12, anchorRight - menuW),
        window.innerWidth - menuW - 12,
      );
      const spaceAbove = (shellRect?.top ?? r.top);
      const spaceBelow = window.innerHeight - (shellRect?.bottom ?? r.bottom);
      const openUp = spaceBelow < 300 && spaceAbove > spaceBelow;
      if (openUp) {
        setMenuPos({
          left,
          bottom: Math.max(12, window.innerHeight - (shellRect?.top ?? r.top) + gap),
          top: undefined,
        });
      } else {
        setMenuPos({
          left,
          top: Math.min(window.innerHeight - 24, (shellRect?.bottom ?? r.bottom) + gap),
          bottom: undefined,
        });
      }
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [modelMenuOpen]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (modelMenuRef.current?.contains(t)) return;
      if (modelButtonRef.current?.contains(t)) return;
      setModelMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [modelMenuOpen]);

  const handleStop = () => {
    genSeqRef.current += 1;
    stopRequestedRef.current = true;
    pendingQueueRef.current = [];
    setQueueLen(0);
    setQueueTick(t => t + 1);
    setEditingQueueId(null);
    setEditingQueueText('');
    void engineGenerateCancel();
    generatingRef.current = false;
    const originGenChatId = activeGenChatIdRef.current;
    activeGenChatIdRef.current = null;
    try {
      sessionStorage.removeItem('NOVA:inflight-media');
    } catch {
      /* ignore */
    }
    // Pair every beginChatInflight — Stop used to leave App thinking Chat was busy forever.
    while (hasChatInflight()) endChatInflight();
    setGenerating(false);
    const stopPatch = (list: ChatMessage[]) => list.map(m => (
      m.role === 'assistant' && String(m.content || '').startsWith('__generating__:')
        ? { ...m, content: '(stopped)' }
        : m
    ));
    setMessages(prev => {
      const next = stopPatch(prev);
      const viewedId = persistChatIdRef.current || routeChatIdRef.current;
      if (viewedId) persistModeThread(mode, next, { chatId: viewedId });
      return next;
    });
    // Also clear Generating on the origin chat if the user Stopped while viewing another thread.
    if (originGenChatId && originGenChatId !== (routeChatIdRef.current || persistChatIdRef.current)) {
      try {
        const raw = localStorage.getItem(chatThreadKey(originGenChatId));
        const stored = raw ? JSON.parse(raw) as ChatMessage[] : [];
        if (Array.isArray(stored) && stored.some(m => String(m.content || '').startsWith('__generating__:'))) {
          persistModeThread(mode, stopPatch(stored), { chatId: originGenChatId });
        }
      } catch {
        /* ignore */
      }
    }
  };

  const flushQueuedSend = () => {
    if (generatingRef.current) return;
    // Hold the queue while the user is editing a queued message.
    if (editingQueueIdRef.current) return;
    const viewingId = route.name === 'chat' ? (route.chatId || persistChatIdRef.current) : null;
    // Drop queued items that belong to another chat (switch leftover).
    if (viewingId) {
      pendingQueueRef.current = pendingQueueRef.current.filter(q => q.chatId === viewingId);
    }
    const next = pendingQueueRef.current.shift();
    setQueueLen(pendingQueueRef.current.length);
    setQueueTick(t => t + 1);
    if (next?.text) {
      void sendMessageRef.current(next.text);
    }
  };

  const endTurnAndFlush = (mySeq: number) => {
    window.setTimeout(() => {
      if (mySeq !== genSeqRef.current) return;
      if (generatingRef.current) return;
      flushQueuedSend();
    }, 0);
  };

  const openImageTab = (_seedPrompt?: string) => {
    // Image mode removed from the product — stay in Chat.
    setImageOfferId(null);
    setImageSwitchDismissed(true);
  };

  const openCodeWorkspace = (_seedPrompt?: string, _seedFiles?: Record<string, string>) => {
    // Code pill overlay is the only code UI — old ProjectWorkspace tab is retired.
    if (_seedFiles && Object.keys(_seedFiles).length) {
      setChatStudioFiles(_seedFiles);
      chatStudioFilesRef.current = _seedFiles;
    }
    setCodeOverlayOpen(true);
    setCodePillSticky(true);
  };

  useEffect(() => {
    const onOpenCode = (ev: Event) => {
      const detail = (ev as CustomEvent<{ projectId?: string; diskPath?: string; name?: string }>).detail || {};
      void (async () => {
        try {
          if (detail.projectId && window.arkDesktop?.projectRead) {
            const read = await window.arkDesktop.projectRead(detail.projectId);
            if (read?.ok && read.files && Object.keys(read.files).length) {
              const files = read.files as Record<string, string>;
              setChatStudioFiles(files);
              chatStudioFilesRef.current = files;
              setChatStudioProjectId(detail.projectId);
              chatStudioProjectIdRef.current = detail.projectId;
              if (read.root) {
                setChatStudioDiskRoot(read.root);
                chatStudioDiskRootRef.current = read.root;
              }
              const chatId = routeChatIdRef.current || persistChatIdRef.current;
              if (chatId) {
                persistStudioSnapshot(chatId, {
                  files,
                  projectId: detail.projectId,
                  name: detail.name || studioPathBasename(read.root || '') || undefined,
                  diskRoot: read.root || null,
                });
                setChatCodePill(chatId, true);
              }
            }
          } else if (detail.diskPath) {
            const files = await loadPreviewFilesFromDisk(detail.diskPath);
            if (Object.keys(files).length) {
              setChatStudioFiles(files);
              chatStudioFilesRef.current = files;
              setChatStudioDiskRoot(detail.diskPath);
              chatStudioDiskRootRef.current = detail.diskPath;
              const chatId = routeChatIdRef.current || persistChatIdRef.current;
              if (chatId) {
                persistStudioSnapshot(chatId, {
                  files,
                  name: detail.name || studioPathBasename(detail.diskPath),
                  diskRoot: detail.diskPath,
                });
                setChatCodePill(chatId, true);
              }
            }
          }
        } catch {
          /* still open overlay with whatever is already bound */
        }
        setCodeOverlayOpen(true);
        setCodePillSticky(true);
      })();
    };
    window.addEventListener('NOVA:open-code-overlay', onOpenCode);
    return () => window.removeEventListener('NOVA:open-code-overlay', onOpenCode);
  }, []);

  // CDP / automation: bind a disk folder to the open chat without opening the code overlay.
  useEffect(() => {
    const onBind = (ev: Event) => {
      const detail = (ev as CustomEvent<{ diskPath?: string; name?: string }>).detail || {};
      const diskPath = String(detail.diskPath || '').trim();
      if (!diskPath) return;
      // Set disk root immediately so the next ask does not hit "No workspace yet"
      // while file hydration is still in flight.
      setChatStudioDiskRoot(diskPath);
      chatStudioDiskRootRef.current = diskPath;
      const chatId = routeChatIdRef.current || persistChatIdRef.current;
      if (chatId) {
        studioBoundChatIdRef.current = chatId;
        persistStudioSnapshot(chatId, {
          files: chatStudioFilesRef.current,
          name: detail.name || studioPathBasename(diskPath),
          diskRoot: diskPath,
        });
        setChatCodePill(chatId, true);
        setCodePillSticky(true);
      } else {
        try {
          sessionStorage.setItem('NOVA:pending-studio-bind', JSON.stringify({
            files: {},
            projectId: null,
            name: detail.name || studioPathBasename(diskPath),
            diskRoot: diskPath,
            previewUrl: null,
          }));
        } catch { /* ignore */ }
      }
      void (async () => {
        try {
          const files = await loadPreviewFilesFromDisk(diskPath);
          if (!Object.keys(files).length) return;
          setChatStudioFiles(files);
          chatStudioFilesRef.current = files;
          const id = routeChatIdRef.current || persistChatIdRef.current;
          if (id) {
            persistStudioSnapshot(id, {
              files,
              name: detail.name || studioPathBasename(diskPath),
              diskRoot: diskPath,
            });
          }
        } catch {
          /* ignore */
        }
      })();
    };
    window.addEventListener('NOVA:bind-studio-disk', onBind);
    return () => window.removeEventListener('NOVA:bind-studio-disk', onBind);
  }, []);

  const openProjectFolder = async () => {
    const root = chatStudioDiskRootRef.current;
    if (!root) {
      setDropHint('No folder path bound on this chat yet. Use + → Open folder.');
      return;
    }
    try {
      const res = await window.arkDesktop?.openPath?.(root);
      if (res === true || (res && typeof res === 'object' && res.ok)) {
        setDropHint(null);
        return;
      }
      const err = res && typeof res === 'object' && 'error' in res ? String(res.error || '') : '';
      setDropHint(err || `Could not open folder:\n${root}`);
    } catch (err) {
      setDropHint(err instanceof Error ? err.message : 'Could not open folder.');
    }
  };

  const openProjectPreview = async (): Promise<string | null> => {
    const chatId = routeChatIdRef.current || persistChatIdRef.current;
    if (!chatId) {
      setDropHint('Open or send a message in this chat first, then try Preview.');
      return null;
    }

    // Trust the in-memory bind for this chat. Only re-resolve when unbound.
    let root = String(
      (studioBoundChatIdRef.current === chatId ? chatStudioDiskRootRef.current : null)
      || loadChatStudio(chatId)?.diskRoot
      || '',
    ).trim() || null;

    if (!root) {
      await rebindStudioForChat(chatId);
      root = chatStudioDiskRootRef.current;
    } else if (studioBoundChatIdRef.current !== chatId) {
      await rebindStudioForChat(chatId);
      root = chatStudioDiskRootRef.current || root;
    }

    // Never let a "heal" replace a good folder with a prompt-title path.
    if (root) {
      chatStudioDiskRootRef.current = root;
      setChatStudioDiskRoot(root);
      studioBoundChatIdRef.current = chatId;
    }

    if (!root) {
      setDropHint('No folder path on this chat. Use + → Bind project…, then Preview.');
      return null;
    }

    // Sprint B: attach to create-job preview when background npm already started the server.
    const createJob = getCreateJobForChat(chatId);
    if (createJob?.previewUrl && (createJob.status === 'ready' || createJob.status === 'npm')) {
      const existing = String(createJob.previewUrl).trim();
      if (existing && !/127\.0\.0\.1:0|localhost:0|:\/\/0(?:\/|$)/.test(existing)) {
        setPreviewUrl(existing);
        try {
          await window.arkDesktop?.previewOpenWindow?.({
            url: existing,
            title: studioPathBasename(root) || createJob.name || 'Preview',
            projectId: previewWindowIdForChat(chatId),
          });
        } catch { /* best-effort */ }
        return existing;
      }
    }

    // Attach-only when main already owns a session for this cwd.
    try {
      const { attachPreviewIfExists, isPlaceholderPreviewUrl } = await import('@/lib/projectPreview');
      const attached = await attachPreviewIfExists({
        cwd: root,
        preferUrl: createJob?.previewUrl,
      });
      if (attached.ok && !isPlaceholderPreviewUrl(attached.url)) {
        setPreviewUrl(attached.url);
        previewUrlRef.current = attached.url;
        try {
          await window.arkDesktop?.previewOpenWindow?.({
            url: attached.url,
            title: studioPathBasename(root) || createJob?.name || 'Preview',
            projectId: previewWindowIdForChat(chatId),
          });
        } catch { /* best-effort */ }
        return attached.url;
      }
    } catch { /* fall through to ensureBoundFolderPreview */ }

    const pid = previewWindowIdForChat(chatId);
    const snap = loadChatStudio(chatId);
    const folderName = studioPathBasename(root) || 'Preview';
    const title = folderName;
    const recentUserBrief = messagesRef.current
      .filter(m => m.role === 'user')
      .slice(-6)
      .map(m => m.content)
      .join('\n');
    const namedDevice = classifyNamedDevice(recentUserBrief);
    const mobileTarget = classifyMobileTarget(recentUserBrief);
    const filesForPreview = snap?.files && Object.keys(snap.files).length
      ? snap.files
      : (studioBoundChatIdRef.current === chatId ? chatStudioFilesRef.current : {});
    // Websites / Vite apps always open as a normal desktop window.
    // Phone chrome is only for native iOS/Android project trees (later on the stretch list).
    const nativeMobile = isNativeMobileTree(filesForPreview);
    const wantsPhoneFrame = nativeMobile && Boolean(
      namedDevice
      || mobileTarget
      || /\b(mobile\s+app|phone\s+app|for\s+(?:ios|android)|iphone|galaxy|pixel)\b/i.test(recentUserBrief),
    );
    const previewDevice = wantsPhoneFrame
      ? (namedDevice || defaultDeviceForTarget(mobileTarget || 'ios'))
      : null;
    const devicePayload = previewDevice
      ? {
        label: previewDevice.label,
        width: previewDevice.width,
        height: previewDevice.height,
        family: previewDevice.family,
      }
      : undefined;

    setDropHint(previewDevice ? `Opening ${previewDevice.label} preview…` : 'Opening preview…');
    try {
      const result = await ensureBoundFolderPreview({
        root,
        projectId: pid,
        title,
        files: snap?.files && Object.keys(snap.files).length
          ? snap.files
          : (studioBoundChatIdRef.current === chatId ? chatStudioFilesRef.current : {}),
        device: devicePayload,
      });
      if (!result.ok) {
        // One more try with a fresh disk hydrate (static/, index.html, run.bat).
        const hydrated = await loadPreviewFilesFromDisk(root);
        if (Object.keys(hydrated).length) {
          const merged = { ...chatStudioFilesRef.current, ...hydrated };
          setChatStudioFiles(merged);
          chatStudioFilesRef.current = merged;
          const retry = await ensureBoundFolderPreview({
            root,
            projectId: pid,
            title,
            files: merged,
            device: devicePayload,
          });
          if (retry.ok) {
            setPreviewUrl(retry.url);
            previewUrlRef.current = retry.url;
            persistStudioSnapshot(chatId, {
              files: hydrated,
              projectId: chatStudioProjectIdRef.current,
              name: folderName,
              diskRoot: root,
              previewUrl: retry.url,
            });
            setDropHint(null);
            return retry.url;
          }
        }
        setDropHint(result.error);
        window.setTimeout(() => {
          setDropHint(prev => (prev === result.error ? null : prev));
        }, 8000);
        return null;
      }
      setPreviewUrl(result.url);
      previewUrlRef.current = result.url;
      persistStudioSnapshot(chatId, {
        files: chatStudioFilesRef.current,
        projectId: chatStudioProjectIdRef.current,
        name: folderName,
        diskRoot: root,
        previewUrl: result.url,
      });
      setDropHint(null);
      return result.url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Preview failed to open.';
      setDropHint(msg);
      window.setTimeout(() => {
        setDropHint(prev => (prev === msg ? null : prev));
      }, 8000);
      return null;
    }
  };

  const pushLivePreview = async (files: Record<string, string>, openIfClosed = false) => {
    const chatId = persistChatIdRef.current;
    const pid = previewWindowIdForChat(chatId);
    const title = workspaceBadgeLabel || 'Preview';
    const url = await refreshLivePreview({
      projectId: pid,
      title,
      files,
      previewUrl,
      openIfClosed,
    });
    if (url) {
      setPreviewUrl(url);
      if (chatId) {
        persistStudioSnapshot(chatId, {
          files,
          projectId: chatStudioProjectIdRef.current,
          diskRoot: chatStudioDiskRootRef.current,
          previewUrl: url,
        });
      }
    }
  };

  const clonePickedRepo = async (repo: GitHubRepo) => {
    setGithubPickerOpen(false);
    setGithubOfferId(null);
    const token = getPluginRuntime('github', loadPluginState()).token?.trim();
    const project = addRecent(repo.name);
    const [owner, name] = repo.full_name.split('/');
    const cloned = await gitClone(project.id, githubCloneUrl(owner, name), token);
    if (!cloned.ok) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        user_id: user?.id ?? 'guest',
        project_id: null,
        role: 'assistant',
        content: cloned.error || `Could not clone ${repo.full_name}.`,
        provider_used: 'GitHub',
        created_at: new Date().toISOString(),
      }]);
      return;
    }
    const read = await window.arkDesktop?.projectRead?.(project.id);
    if (read?.ok && read.files && Object.keys(read.files || {}).length) {
      setChatStudioFiles(read.files as Record<string, string>);
      chatStudioFilesRef.current = read.files as Record<string, string>;
      setChatStudioProjectId(project.id);
      chatStudioProjectIdRef.current = project.id;
      if (read.root) {
        setChatStudioDiskRoot(read.root);
        chatStudioDiskRootRef.current = read.root;
      }
      const chatId = routeChatIdRef.current || persistChatIdRef.current;
      if (chatId) {
        persistStudioSnapshot(chatId, {
          files: read.files as Record<string, string>,
          projectId: project.id,
          name: repo.name,
          diskRoot: read.root || null,
        });
      }
      setPendingAttaches(prev => [
        ...prev.filter(a => a.kind !== 'folder'),
        { kind: 'folder' as const, name: repo.name, count: Object.keys(read.files || {}).length, projectId: project.id, id: project.id },
      ].slice(0, 12));
    }
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      user_id: user?.id ?? 'guest',
      project_id: null,
      role: 'assistant',
      content: `Cloned **${repo.full_name}** into this chat. Ask what it is or say **go implement** to edit.`,
      provider_used: 'GitHub',
      created_at: new Date().toISOString(),
    }]);
  };

  const addPendingImages = async (files: File[]) => {
    const images = files.filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f.name));
    if (!images.length) return;
    const next: { id: string; name: string; dataUrl: string }[] = [];
    for (const f of images.slice(0, 4)) {
      if (f.size > 6_000_000) continue;
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(f);
        });
        if (!dataUrl.startsWith('data:image/')) continue;
        const id = `attach-${crypto.randomUUID().slice(0, 10)}`;
        rememberThumb(id, dataUrl);
        next.push({ id, name: f.name, dataUrl });
      } catch {
        /* skip unreadable */
      }
    }
    if (!next.length) return;
    // Stay pending on the composer until Send (lands in the thread with the message).
    setPendingImages(prev => [...prev, ...next].slice(0, 4));
  };

  const applyDropResult = (result: Awaited<ReturnType<typeof resolveChatDrop>>) => {
    // Only explicit image drops go in the preview strip. never folder contents.
    if (result.images.length && !result.attaches.some(a => a.kind === 'folder')) {
      for (const img of result.images) rememberThumb(img.id, img.dataUrl);
      setPendingImages(prev => {
        const names = new Set(prev.map(p => p.name.toLowerCase()));
        const merged = [...prev];
        for (const img of result.images) {
          if (names.has(img.name.toLowerCase())) continue;
          names.add(img.name.toLowerCase());
          merged.push(img);
        }
        return merged.slice(0, 4);
      });
    }
    const fileCount = Object.keys(result.files).length;
    if (fileCount) {
      setChatStudioFiles(prev => ({ ...prev, ...result.files }));
    }
    if (result.projectId) setChatStudioProjectId(result.projectId);
    const nextAttaches = (result.attaches?.length
      ? result.attaches
      : (result.attach ? [result.attach] : [])
    )
      .filter(a => a.kind !== 'image')
      .map(a => ({
        ...a,
        id: a.id || a.projectId || `att-${crypto.randomUUID().slice(0, 8)}`,
      }));
    if (nextAttaches.length) {
      setPendingAttaches(prev => {
        const seen = new Set(prev.map(attachKey));
        const merged = [...prev];
        for (const a of nextAttaches) {
          const k = attachKey(a);
          if (seen.has(k)) continue;
          seen.add(k);
          merged.push(a);
        }
        return merged.slice(0, 12);
      });
      setDropHint(null);
    } else if (result.images.length && !result.attaches.some(a => a.kind === 'folder')) {
      setDropHint(null);
    } else if (result.note) {
      setDropHint(result.note);
    } else if (!fileCount && !result.images.length) {
      setDropHint('Nothing readable in that drop. try another folder or file.');
    }
    ignoreEnterUntilRef.current = Date.now() + 600;
  };

  const removePendingAttach = (meta: ChatAttachMeta) => {
    setPendingAttaches(prev => prev.filter(a => attachKey(a) !== attachKey(meta)));
    if (meta.kind === 'folder') {
      const prefix = `${meta.name}/`;
      setChatStudioFiles(prev => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (k.startsWith(prefix)) delete next[k];
        }
        return next;
      });
      // Folder X must not leave stray image chips behind.
      setPendingImages([]);
    } else if (meta.kind === 'file' || meta.kind === 'files') {
      setChatStudioFiles(prev => {
        const next = { ...prev };
        if (meta.name && next[meta.name] != null) delete next[meta.name];
        return next;
      });
    }
  };

  const onPickCodeFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setAttachUploading('Reading files…');
    try {
      const result = await resolveChatDrop(list);
      applyDropResult(result);
    } finally {
      setAttachUploading(null);
    }
  };

  const dragActiveRef = useRef(false);
  const setDragActive = (on: boolean) => {
    if (dragActiveRef.current === on) return;
    dragActiveRef.current = on;
    setDragOverChat(on);
  };

  // Capture-phase only. avoid React+window double handlers that flicker the overlay.
  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      allowWindowFileDrop(e);
      // Only show overlay for real file drags — empty types (focus/tooling) used to stick the overlay open.
      if (dropHasFiles(e.dataTransfer)) {
        setDragActive(true);
      }
    };
    const onOver = (e: DragEvent) => {
      allowWindowFileDrop(e);
    };
    const onLeave = (e: DragEvent) => {
      if (e.relatedTarget == null) setDragActive(false);
    };
    const onDrop = (e: DragEvent) => {
      allowWindowFileDrop(e);
      setDragActive(false);
      const list = e.dataTransfer?.files;
      if (!list?.length) return;
      const snapshot = [...list];
      if (mode === 'image') {
        const imagesOnly = snapshot.filter(f =>
          f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f.name),
        );
        if (!imagesOnly.length) {
          setDropHint('Image mode only accepts photos (PNG, JPG, WebP, …).');
          return;
        }
        setAttachUploading('Uploading photos…');
        void (async () => {
          try {
            await addPendingImages(imagesOnly);
            setDropHint(null);
          } finally {
            setAttachUploading(null);
          }
        })();
        return;
      }
      setAttachUploading('Uploading…');
      void (async () => {
        try {
          const result = await resolveChatDrop(snapshot);
          applyDropResult(result);
          requestAnimationFrame(() => focusComposerIfSafe(textareaRef.current));
        } finally {
          setAttachUploading(null);
        }
      })();
    };
    window.addEventListener('dragenter', onEnter, true);
    window.addEventListener('dragover', onOver, true);
    window.addEventListener('dragleave', onLeave, true);
    window.addEventListener('drop', onDrop, true);
    return () => {
      window.removeEventListener('dragenter', onEnter, true);
      window.removeEventListener('dragover', onOver, true);
      window.removeEventListener('dragleave', onLeave, true);
      window.removeEventListener('drop', onDrop, true);
    };
  }, [mode]);

  const openFolderInChat = async (sourceDir?: string, opts?: {
    mode?: 'path' | 'import';
  }): Promise<{
    ok: boolean;
    files?: Record<string, string>;
    projectId?: string;
    name?: string;
    root?: string;
    error?: string;
    catalogOnly?: boolean;
  }> => {
    if (!window.arkDesktop?.projectImportFolder && !window.arkDesktop?.workspaceOpenRoot) {
      attachInputRef.current?.click();
      return { ok: false, error: 'Folder open is only available in the desktop app.' };
    }
    const pid = `proj-${crypto.randomUUID().slice(0, 8)}`;
    const wantImport = opts?.mode === 'import';
    // Prefer path bind: keep context light until Agent/tools need a file.
    const useInPlace = !wantImport && Boolean(window.arkDesktop?.workspaceOpenRoot);
    setAttachUploading(useInPlace ? 'Binding folder path…' : 'Opening folder…');
    setAttachBusy(true);
    setDropHint(null);
    const onProg = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { label?: string; done?: number; total?: number } | undefined;
      if (d?.label) setAttachUploading(d.label);
      else if (d?.total) setAttachUploading(`Reading ${d.done || 0}/${d.total}`);
    };
    window.addEventListener('NOVA:project-import-progress', onProg);
    try {
      const res = useInPlace
        ? await window.arkDesktop?.workspaceOpenRoot?.({
          projectId: pid,
          ...(sourceDir ? { sourceDir } : {}),
          catalogOnly: true,
        })
        : await window.arkDesktop?.projectImportFolder?.({
          projectId: pid,
          ...(sourceDir ? { sourceDir } : {}),
        });
      if (res?.canceled) return { ok: false, error: 'canceled' };
      if (!res?.ok) {
        if ((res as { error?: string })?.error === 'file' && (res as { path?: string })?.path) {
          const filePath = String((res as { path: string }).path);
          const base = (res as { name?: string }).name || filePath.split(/[/\\]/).pop() || 'file';
          if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(base)) {
            const data = await window.arkDesktop.readDataUrl?.(filePath);
            if (data?.ok && data.dataUrl) {
              const id = `attach-${crypto.randomUUID().slice(0, 10)}`;
              rememberThumb(id, data.dataUrl);
              setPendingImages([{ id, name: base, dataUrl: data.dataUrl! }]);
              return { ok: true };
            }
          }
          const read = await window.arkDesktop.readTextFile?.({ path: filePath });
          const text = read?.ok && read.text != null ? read.text : `[Attached file: ${base}]`;
          setChatStudioFiles({ [base]: text });
          chatStudioFilesRef.current = { [base]: text };
          setPendingAttaches([{ kind: 'file' as const, name: base, count: 1, id: `file-${pid}` }]);
          return { ok: true };
        }
        const err = res?.error || 'Could not open that folder.';
        setDropHint(err);
        return { ok: false, error: err };
      }
      const catalogOnly = Boolean((res as { catalogOnly?: boolean }).catalogOnly) || useInPlace;
      const folderName = res.name || 'folder';
      const files: Record<string, string> = {};
      const inPlaceRoot = Boolean(res.root && res.inPlace !== false);
      if (!catalogOnly) {
        const rawFiles = res.files || {};
        for (const [rel, text] of Object.entries(rawFiles)) {
          const pathKey = String(rel).replace(/\\/g, '/').replace(/^\/+/, '');
          if (!pathKey) continue;
          if (inPlaceRoot) {
            const stripped = pathKey.startsWith(`${folderName}/`)
              ? pathKey.slice(folderName.length + 1)
              : pathKey;
            files[stripped || pathKey] = text;
          } else {
            files[pathKey.startsWith(`${folderName}/`) ? pathKey : `${folderName}/${pathKey}`] = text;
          }
        }
      }
      const listed = Number((res as { listed?: number }).listed || 0);
      const count = catalogOnly ? listed : Object.keys(files).length;
      if (!catalogOnly && !count) {
        setDropHint(`Opened “${folderName}” but it looks empty.`);
        return { ok: false, error: 'empty folder' };
      }
      if (catalogOnly && !res.root) {
        setDropHint('Could not bind that folder path.');
        return { ok: false, error: 'no root' };
      }
      setChatStudioFiles(catalogOnly ? {} : files);
      chatStudioFilesRef.current = catalogOnly ? {} : files;
      setChatStudioProjectId(pid);
      chatStudioProjectIdRef.current = pid;
      if (res.root) {
        setChatStudioDiskRoot(res.root);
        chatStudioDiskRootRef.current = res.root;
      }
      // Catalog binds return files:{} — hydrate a real previewable map so Ready/edit see the tree.
      if (catalogOnly && res.root) {
        try {
          const hydrated = await loadPreviewFilesFromDisk(res.root);
          if (Object.keys(hydrated).length) {
            setChatStudioFiles(hydrated);
            chatStudioFilesRef.current = hydrated;
            Object.assign(files, hydrated);
          }
        } catch {
          /* keep empty map; Preview can still use diskRoot */
        }
      }
      // New folder bind must not reuse another chat's localhost URL.
      setPreviewUrl(null);
      previewUrlRef.current = null;
      const scopeChat = routeChatIdRef.current || persistChatIdRef.current;
      if (scopeChat) studioBoundChatIdRef.current = scopeChat;
      // Path binds stay in the composer pill — never as chat attachment cards.
      setPendingAttaches([]);
      setPathBindOpen(false);
      setPathBindDraft('');
      setDropHint(null);
      if (!catalogOnly || Object.keys(chatStudioFilesRef.current).length) {
        try {
          localStorage.setItem(`NOVA:chat-studio-files:${pid}`, JSON.stringify({
            name: folderName,
            files: chatStudioFilesRef.current,
          }));
        } catch { /* ignore */ }
      }
      if (scopeChat) {
        persistStudioSnapshot(scopeChat, {
          files: chatStudioFilesRef.current,
          projectId: pid,
          name: folderName,
          diskRoot: res.root || null,
          previewUrl: null,
        });
        if (res.root) {
          setLastDiskTarget(scopeChat, {
            path: res.root,
            name: folderName,
            kind: 'folder',
          });
        }
      } else {
        // New chat not id'd yet — keep disk root in memory until first send persists it.
        try {
          sessionStorage.setItem('NOVA:pending-studio-bind', JSON.stringify({
            files: chatStudioFilesRef.current,
            projectId: pid,
            name: folderName,
            diskRoot: res.root || null,
            previewUrl: null,
          }));
        } catch { /* ignore */ }
      }
      ignoreEnterUntilRef.current = Date.now() + 600;
      requestAnimationFrame(() => focusComposerIfSafe(textareaRef.current));
      return {
        ok: true,
        files: chatStudioFilesRef.current,
        projectId: pid,
        name: folderName,
        root: res.root,
        catalogOnly,
      };
    } finally {
      window.removeEventListener('NOVA:project-import-progress', onProg);
      setAttachUploading(null);
      setAttachBusy(false);
    }
  };

  const enterPathInChat = async () => {
    setPathBindOpen(true);
    setPathBindDraft(chatStudioDiskRootRef.current || '');
    setDropHint(null);
    requestAnimationFrame(() => pathBindInputRef.current?.focus());
  };

  const bindTypedPath = async () => {
    const typed = pathBindDraft.trim().replace(/^["']|["']$/g, '');
    if (!typed) {
      setDropHint('Paste a folder path, or choose Browse…');
      return;
    }
    const stat = await window.arkDesktop?.workspaceStatPath?.(typed);
    if (!stat?.ok || !stat.path) {
      setDropHint(stat?.error || 'That path was not found.');
      return;
    }
    if (!stat.isDirectory) {
      // Single file: bind its parent folder, keep the file as a light attach.
      const parent = typed.replace(/[/\\][^/\\]+$/, '');
      const parentStat = await window.arkDesktop?.workspaceStatPath?.(parent);
      if (parentStat?.ok && parentStat.isDirectory && parentStat.path) {
        await openFolderInChat(parentStat.path, { mode: 'path' });
        setPathBindOpen(false);
        setPathBindDraft('');
        setDropHint(null);
        return;
      }
      setDropHint('Pick a folder path (or a file inside a project folder).');
      return;
    }
    await openFolderInChat(stat.path, { mode: 'path' });
    setPathBindOpen(false);
    setPathBindDraft('');
    setDropHint(null);
  };

  const browseBindFolder = async () => {
    setPathBindOpen(false);
    await openFolderInChat(undefined, { mode: 'path' });
  };

  useEffect(() => {
    const scope = route.name === 'chat' ? (route.chatId || 'new-chat') : 'new-chat';
    setTokenRatio(getTokenUsageRatio(scope));
    setModelRatio(getModelHealthRatio(scope));
  }, [route]);

  const attachImagesFromPaths = async (paths: string[]) => {
    const next: { id: string; name: string; dataUrl: string }[] = [];
    for (const abs of paths.slice(0, 4)) {
      const data = await window.arkDesktop?.readDataUrl?.(abs);
      if (data?.ok && data.dataUrl?.startsWith('data:image/')) {
        const id = `attach-${crypto.randomUUID().slice(0, 10)}`;
        rememberThumb(id, data.dataUrl);
        next.push({ id, name: data.name || abs.split(/[/\\]/).pop() || 'image', dataUrl: data.dataUrl });
      }
    }
    if (next.length) {
      setPendingImages(prev => [...prev, ...next].slice(0, 4));
      setDropHint(null);
    } else {
      setDropHint('Could not read those images.');
    }
  };

  const attachFilesFromPaths = async (paths: string[]) => {
    const first = paths[0];
    if (!first) return;
    if (paths.length > 1) {
      setDropHint('Only one file can be uploaded into chat. Prefer Open folder (path bind) for projects.');
    }
    const abs = first;
    const base = abs.split(/[/\\]/).pop() || 'file';
    if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(base)) {
      await attachImagesFromPaths([abs]);
      return;
    }
    const read = await window.arkDesktop?.readTextFile?.({ path: abs });
    const text = read?.ok && read.text != null ? read.text : `[Attached file: ${base}]`;
    setChatStudioFiles({ [base]: text });
    chatStudioFilesRef.current = { [base]: text };
    setPendingAttaches([{
      kind: 'file' as const,
      name: base,
      count: 1,
      id: `file-${crypto.randomUUID().slice(0, 8)}`,
    }]);
    setDropHint(null);
    ignoreEnterUntilRef.current = Date.now() + 600;
  };

  const handlePlusAction = (action: ComposerPlusAction) => {
    if (mode === 'image') {
      if (action === 'image' || action === 'file') {
        void pickPhotosIntoChat();
      }
      return;
    }
    if (action === 'image') {
      void pickPhotosIntoChat();
      return;
    }
    if (action === 'file') {
      void pickFilesIntoChat();
      return;
    }
    if (action === 'bind-path' || action === 'folder' || action === 'enter-path') {
      setPathBindOpen(true);
      setPathBindDraft(chatStudioDiskRootRef.current || '');
      setDropHint(null);
      requestAnimationFrame(() => pathBindInputRef.current?.focus());
      return;
    }
    if (action === 'import-folder') {
      void openFolderInChat(undefined, { mode: 'import' });
      return;
    }
    if (action === 'plan' || action === 'ask' || action === 'agent' || action === 'debug' || action === 'multitask') {
      setComposerMode(action);
      requestAnimationFrame(() => focusComposerIfSafe(textareaRef.current));
    }
  };

  /** Native OS photo picker (Windows File Explorer). */
  const pickPhotosIntoChat = async () => {
    if (!window.arkDesktop?.pickFiles) {
      attachInputRef.current?.click();
      return;
    }
    const res = await window.arkDesktop.pickFiles({ imagesOnly: true });
    if (res?.canceled || !res?.ok || !res.paths?.length) return;
    await attachImagesFromPaths(res.paths);
    ignoreEnterUntilRef.current = Date.now() + 600;
  };

  /** Native OS file picker. shows files inside folders. */
  const pickFilesIntoChat = async () => {
    if (!window.arkDesktop?.pickFiles) {
      attachInputRef.current?.click();
      return;
    }
    const res = await window.arkDesktop.pickFiles();
    if (res?.canceled || !res?.ok || !res.paths?.length) return;
    await attachFilesFromPaths(res.paths);
  };

  const runEphemeralVoiceTurn = async (rawContent: string) => {
    const pinnedModel = activeModelRef.current;
    const isTap = !rawContent.trim() || rawContent === '<!--ark-voice-turn-->';
    const typed = isTap ? '' : rawContent.trim();

    const finishVoice = async (phase: VoiceSessionPhase, speak?: string) => {
      if (speak) {
        await speakText(speak.replace(/\*\*/g, '').replace(/[#*`]/g, ''), {
          onPlaybackStart: () => setVoicePhase('speaking'),
        });
      }
      setVoicePhase(phase);
    };

    if (typed && looksLikeHarmfulContentAsk(typed)) {
      await finishVoice('idle', harmfulContentBlockedReply(true));
      return;
    }

    if (typed && looksLikeArkSelfHarmAsk(typed)) {
      await finishVoice('idle', arkSelfHarmBlockedReply());
      return;
    }

    if (typed && looksLikeVoiceBuildOrEditAsk(typed)) {
      // Voice is Chat with a mic — same classify + create/edit path.
      setVoicePhase('idle');
      tryStartTurn(typed);
      return;
    }

    if (!voiceSupported()) {
      await finishVoice('idle', 'Voice needs speech recognition and text-to-speech in this browser.');
      return;
    }

    const liveCap = await probeLiveCapacity();
    if (!liveCap.liveChat) {
      await finishVoice(
        'idle',
        'To use Voice, connect a free API key in Models, or install a local brain in Local AI.',
      );
      return;
    }

    if (generatingRef.current) return;
    generatingRef.current = true;
    beginChatInflight();
    setGenerating(true);
    stopRequestedRef.current = false;

    try {
      let voiceMsg = typed;
      if (!voiceMsg) {
        setVoicePhase('listening');
        const heard = await listenOnce({ timeoutMs: 14_000 });
        if (!heard.ok || !heard.text.trim()) {
          await finishVoice('idle', heard.error
            ? 'I could not hear you. Check your mic in Settings, then try again.'
            : 'I did not catch that. Tap send and speak again.');
          return;
        }
        voiceMsg = heard.text.trim();
      }

      if (looksLikeHarmfulContentAsk(voiceMsg)) {
        await finishVoice('idle', harmfulContentBlockedReply(true));
        return;
      }

      if (looksLikeArkSelfHarmAsk(voiceMsg)) {
        await finishVoice('idle', arkSelfHarmBlockedReply());
        return;
      }

      if (looksLikeVoiceBuildOrEditAsk(voiceMsg)) {
        setVoicePhase('idle');
        await sendMessageRef.current(voiceMsg);
        return;
      }

      setVoicePhase('thinking');
      const routed = await voiceChatRoute(voiceMsg, {
        id: pinnedModel.id,
        name: pinnedModel.name,
        source: pinnedModel.source,
      });
      const spoken = scrubVoiceConstraintEcho(
        redactArkSelfLeak(String(routed.reply || '').trim()),
      ) || 'I did not have a reply for that.';
      await finishVoice('idle', spoken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      await finishVoice('idle', msg);
    } finally {
      generatingRef.current = false;
      setGenerating(false);
      endChatInflight();
    }
  };

  const handleVoiceActivate = useCallback(() => {
    if (!user || mode !== 'voice' || !isVoiceTabEnabled()) return;
    const busy = generating
      || voicePhase === 'listening'
      || voicePhase === 'thinking'
      || voicePhase === 'speaking';
    if (busy) return;
    void sendMessageRef.current('<!--ark-voice-turn-->');
  }, [user, mode, generating, voicePhase]);

  const handleSend = () => {
    if (dictating || dictationRef.current) {
      dictationRef.current?.stop();
      dictationRef.current = null;
      setDictating(false);
    }
    if (mode === 'voice') {
      if (!user) {
        /* guest voice still allowed via hydrate */
      }
      const busy = generating
        || voicePhase === 'listening'
        || voicePhase === 'thinking'
        || voicePhase === 'speaking';
      if (busy) return;
      void sendMessageRef.current(input.trim() || '<!--ark-voice-turn-->');
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }
    let content = input.trim();
    const images = pendingImages;
    const attaches = pendingAttaches;
    const hasStudio = Object.keys(chatStudioFilesRef.current).length > 0
      || Boolean(chatStudioDiskRootRef.current)
      || Boolean(chatStudioProjectIdRef.current);
    if (!content && !images.length && !attaches.length && !hasStudio) return;
    if (composerMode && COMPOSER_MODE_PREFIX[composerMode]) {
      content = `${COMPOSER_MODE_PREFIX[composerMode]}${content}`;
    } else if (
      !composerMode
      && (mode === 'general' || mode === 'code')
      && /\b(debug|find\s+(?:the\s+)?bugs?|fix\s+(?:this|the)\s+(?:bug|error|crash)|why\s+(?:is\s+)?(?:this|it)\s+broken)\b/i.test(content)
    ) {
      setComposerMode('debug');
      content = `${COMPOSER_MODE_PREFIX.debug}${content}`;
    } else if (
      !composerMode
      && (mode === 'general' || mode === 'code')
      && Object.keys(chatStudioFilesRef.current || {}).length > 0
      && /\b(faster|quicker|speed\s+this\s+up|multi[\s-]?agent|parallel\s+agents)\b/i.test(content)
    ) {
      // Soft nudge: equip multi-agent when user asks for speed on a bound project.
      setComposerMode('multitask');
      content = `${COMPOSER_MODE_PREFIX.multitask}${content}`;
    }
    const userTyped = Boolean(content.trim());
    const parts: string[] = [];
    // Folder binds stay as composer pills only — never dump into the chat transcript.
    const chatAttaches = attaches.filter(a => a.kind === 'file' || a.kind === 'image' || a.kind === 'files');
    if (chatAttaches.length) {
      parts.push(encodeChatAttaches(chatAttaches));
    }
    if (userTyped) {
      parts.push(content);
    } else if (chatAttaches.length) {
      parts.push('<!--ark-auto-read-->');
    } else if (hasStudio && !userTyped && !images.length) {
      // Bound path with Enter and no text — nudge them to type an ask.
      setDropHint('Path is bound. Type what you want changed, then press Enter.');
      return;
    } else if (images.length) {
      const hasStudio = Object.keys(chatStudioFilesRef.current).length > 0
        || Boolean(chatStudioDiskRootRef.current);
      content = mode === 'image'
        ? 'Recreate and improve this image'
        : hasStudio
          ? 'I attached a screenshot of the project UI. Look at it carefully and wait for my fix ask. or tell me what stands out.'
          : 'What is in this image?';
      parts.push(content);
    }
    if (images.length) {
      parts.push(...images.map(img => `![${img.name.replace(/[\[\]]/g, '')}](ark-media:${img.id})`));
    }
    content = parts.join('\n\n');
    setPendingImages([]);
    setPendingAttaches([]);
    setComposerMode(null);
    // Queue only when this same thread is already answering. New Chat while another
    // thread is busy still starts a new send once the engine is free (sendMessage gates).
    const viewingChatId = route.name === 'chat' ? route.chatId : undefined;
    const genId = activeGenChatIdRef.current;
    // Blank starters have no route chatId yet — still treat in-flight gen as busy so
    // a double Enter cannot start two creates (or queue the same create on itself).
    const busyOnThisChat = generatingRef.current && (
      !genId
      || !viewingChatId
      || viewingChatId === genId
    );
    const sameAsLast = lastSendGuardRef.current.text === content
      && (Date.now() - lastSendGuardRef.current.at) < 4000;
    if (busyOnThisChat) {
      const qChat = viewingChatId || genId || persistChatIdRef.current || 'pending';
      const dupQueued = pendingQueueRef.current.some(q => q.chatId === qChat && q.text === content);
      // Never re-queue the identical prompt that just started (double Enter / CDP click+Enter).
      if (sameAsLast || dupQueued) {
        setInput('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        return;
      }
      pendingQueueRef.current.push({
        id: `q-${crypto.randomUUID().slice(0, 8)}`,
        text: content,
        chatId: qChat,
      });
      setQueueLen(pendingQueueRef.current.length);
      setQueueTick(t => t + 1);
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }
    if (sameAsLast) {
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }
    lastSendGuardRef.current = { text: content, at: Date.now() };
    // Mark busy before the async send so a second Enter in the same tick queues/dedupes.
    generatingRef.current = true;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    void sendMessageRef.current(content);
  };

  const sendMessage = async (content: string) => runAIChatSend(content, {
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
  });

  sendMessageRef.current = sendMessage;

  useEffect(() => {
    const onContinue = () => {
      setComposerMode('agent');
      const lastUser = [...messagesRef.current].reverse().find((m) => m.role === 'user');
      const text = String(lastUser?.content || '').replace(/<!--[\s\S]*?-->/g, '').trim();
      if (!text || /^continue$/i.test(text)) return;
      setInput(text);
      tryStartTurn(text);
    };
    window.addEventListener('NOVA:agent-continue', onContinue);
    return () => window.removeEventListener('NOVA:agent-continue', onContinue);
  }, []);

  /** Grow textarea without collapsing to auto (that flash draws a seam above the toolbar). */
  const resizeComposer = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const max = Math.round(window.innerHeight * 0.4);
    // Must clear room for line-height + vertical padding (pt-2.5 / pb-1 ≈ 14px).
    const minPx = 44;
    const prevHeight = el.style.height;
    const locked = el.offsetHeight;
    el.style.height = `${minPx}px`;
    const raw = el.scrollHeight;
    const next = Math.max(minPx, Math.min(raw, max));
    if (Math.abs(next - locked) <= 1 && prevHeight) {
      el.style.height = prevHeight;
    } else {
      el.style.height = `${next}px`;
    }
    el.style.overflowY = raw > max ? 'auto' : 'hidden';
  }, []);

  const onComposerPaste = (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const dt = e.clipboardData;
    if (!dt) return;
    // Prefer image paste (Snipping Tool / screenshot). let plain text use default.
    const hasImage = [...(dt.items || [])].some(it => /^image\//i.test(it.type))
      || [...(dt.files || [])].some(f => /^image\//i.test(f.type) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name));
    if (!hasImage) return;
    e.preventDefault();
    void (async () => {
      const imgs = await imagesFromClipboardData(dt);
      if (!imgs.length) {
        setDropHint('Could not read that screenshot from the clipboard. Try + → Image, or drag the file in.');
        return;
      }
      for (const img of imgs) rememberThumb(img.id, img.dataUrl);
      setPendingImages(prev => [...prev, ...imgs].slice(0, 4));
      setDropHint(null);
      ignoreEnterUntilRef.current = Date.now() + 600;
      if (getLocalPrefs().clearClipboardAfterPaste && navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(''); } catch { /* permission */ }
      }
    })();
  };

  const onInput = (value: string) => {
    setInput(value);
    if (dictationHint) setDictationHint(null);
    if (imageSwitchDismissed && !looksLikeImageAsk(value)) setImageSwitchDismissed(false);
  };

  const stopComposerDictation = useCallback(() => {
    dictationRef.current?.stop();
    dictationRef.current = null;
    setDictating(false);
  }, []);

  const toggleComposerDictation = useCallback(() => {
    if (dictating) {
      stopComposerDictation();
      return;
    }
    if (mode === 'voice') {
      setDictationHint('Use the Voice tab to talk. This mic fills the chat box with text.');
      return;
    }
    if (!speechRecognitionSupported()) {
      setDictationHint('Speech-to-text is not available in this build.');
      return;
    }
    if (generating) return;

    dictationBaseRef.current = inputRef.current.trim();
    setDictationHint(null);
    setDictating(true);
    dictationRef.current = startLiveDictation({
      onInterim: (text) => {
        const base = dictationBaseRef.current;
        const next = base ? `${base} ${text}`.trim() : text;
        setInput(next);
        inputRef.current = next;
        requestAnimationFrame(() => resizeComposer());
      },
      onFinal: (text) => {
        const base = dictationBaseRef.current;
        const next = base ? `${base} ${text}`.trim() : text;
        setInput(next);
        inputRef.current = next;
        dictationBaseRef.current = next;
        requestAnimationFrame(() => {
          resizeComposer();
          focusComposerIfSafe(textareaRef.current);
        });
      },
      onError: (error) => {
        setDictationHint(error);
      },
      onEnd: () => {
        dictationRef.current = null;
        setDictating(false);
      },
    });
  }, [dictating, generating, mode, resizeComposer, stopComposerDictation]);

  useEffect(() => () => {
    dictationRef.current?.stop();
    dictationRef.current = null;
  }, []);

  useLayoutEffect(() => {
    resizeComposer();
  }, [input, resizeComposer]);


  return {
    activeModel,
    addPendingImages,
    attachBusy,
    attachInputRef,
    attachUploading,
    autoModelLabel,
    bindTypedPath,
    browseBindFolder,
    capacity,
    chatPlugins,
    chatStudioDiskRoot,
    chatStudioDiskRootRef,
    chatStudioFiles,
    chatStudioFilesRef,
    chatStudioProjectIdRef,
    chats,
    clonePickedRepo,
    codeOverlayOpen,
    codePillSticky,
    composerMode,
    copiedMsgId,
    createJobLive,
    creations,
    deleteFileBusy,
    deleteFilePrompt,
    deleteFolderClarifyPrompt,
    deleteProjectBusy,
    deleteProjectPrompt,
    dictating,
    dictationHint,
    dragOverChat,
    dropHint,
    editingQueueId,
    editingQueueIdRef,
    editingQueueText,
    engineInstallingModels,
    engineLocalModels,
    engineReadyIds,
    failoverNote,
    flushQueuedSend,
    freeKeyOpen,
    generating,
    generatingRef,
    githubOfferId,
    githubPickerOpen,
    greeting,
    handleDeleteFileCancel,
    handleDeleteFileConfirm,
    handleDeleteProjectCancel,
    handleDeleteProjectConfirm,
    handleFolderClarifyCancel,
    handleFolderClarifyConfirm,
    handlePlusAction,
    handleSend,
    handleStop,
    handleVoiceActivate,
    ignoreEnterUntilRef,
    imageInputRef,
    input,
    ipcFallbackDev,
    jumpToBottom,
    liveTurnMs,
    loading,
    menuPos,
    messages,
    messagesEndRef,
    messagesScrollRef,
    mode,
    modelButtonRef,
    modelMenuOpen,
    modelMenuRef,
    modelRatio,
    navigate,
    ollamaModels,
    onComposerPaste,
    onInput,
    onMessagesScroll,
    onMessagesWheel,
    onPickCodeFiles,
    openCodeWorkspace,
    openProjectFolder,
    openProjectPreview,
    pathBindDraft,
    pathBindInputRef,
    pathBindOpen,
    pendingAttaches,
    pendingImages,
    pendingQueueRef,
    persistChatIdRef,
    persistStudioSnapshot,
    pickPhotosIntoChat,
    placeholder,
    previewUrl,
    queueLen,
    queueTick,
    removePendingAttach,
    route,
    routeChatIdRef,
    sendMessage,
    setActiveModel,
    setCapacity,
    setChatStudioFiles,
    setChatStudioProjectId,
    setCodeOverlayOpen,
    setComposerMode,
    setCopiedMsgId,
    setDropHint,
    setEditingQueueId,
    setEditingQueueText,
    setFailoverNote,
    setFreeKeyOpen,
    setGithubPickerOpen,
    setInput,
    setModelMenuOpen,
    setPathBindDraft,
    setPathBindOpen,
    setPendingAttaches,
    setPendingImages,
    setQueueLen,
    setQueueTick,
    setSetupNote,
    setVideoDurationSec,
    setupNote,
    showJumpToBottom,
    showStudioPills,
    textareaRef,
    threadBrain,
    threadKind,
    threadSwitching,
    toggleComposerDictation,
    tokenRatio,
    tryStartTurn,
    unpickAutoSticky,
    user,
    videoDurationSec,
    voicePhase,
    workspaceBadgeLabel,
  };
}
