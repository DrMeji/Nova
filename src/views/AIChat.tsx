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
import {
  shouldRunAgentLoop,
} from '@/lib/arkAgentLoop';
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
  handlePlanTurnReply,
  shouldSkipWeakModelCodingHop,
  weakModelMicroEditReply,
  runSurgicalEditTurn,
  isWeakCoderModel,
  FIRST_RUN_KIND_CHIPS,
  runDeleteTurn,
  runOpenFolderTurn,
  runCmdTurn,
  runEditTurn,
  dispatchOwnedTurn,
  runChatTurn,
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
import { classifyTurn } from '@/lib/classifyTurn';
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

/** Stacked live timer: minutes|seconds under 1h, hours|seconds at 1h+. */
function stackedLiveTurnParts(ms: number): { top: string; bottom: string; label: string } {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  if (hours >= 1) {
    const secs = totalSec % 60;
    return {
      top: String(hours),
      bottom: String(secs).padStart(2, '0'),
      label: `${hours}h ${secs}s`,
    };
  }
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return {
    top: String(mins),
    bottom: String(secs).padStart(2, '0'),
    label: mins > 0 ? `${mins}m ${secs}s` : `${secs}s`,
  };
}
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

const COMPOSER_MODE_PREFIX: Record<'plan' | 'ask' | 'agent' | 'debug' | 'multitask', string> = {
  plan: 'Plan this out step by step, then we can build:\n\n',
  ask: '',
  agent: 'Agent mode. edit files and run approved tools in this workspace:\n\n',
  debug: 'Debug this. find the issue and propose a fix:\n\n',
  multitask: '[Multi-agent] ',
};

const COMPOSER_MODE_LABEL: Record<'plan' | 'ask' | 'agent' | 'debug' | 'multitask', string> = {
  plan: 'Plan',
  ask: 'Ask',
  agent: 'Agent',
  debug: 'Debug',
  multitask: 'Multi-agent',
};

const COMPOSER_MODE_PILL: Record<'plan' | 'ask' | 'agent' | 'debug' | 'multitask', string> = {
  plan: 'border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-200',
  ask: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200',
  agent: 'border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-200',
  debug: 'border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-200',
  multitask: 'border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-200',
};

function composerModeFromContent(content: string): 'plan' | 'ask' | 'agent' | 'debug' | 'multitask' | null {
  if (content.startsWith(COMPOSER_MODE_PREFIX.plan)) return 'plan';
  if (content.startsWith(COMPOSER_MODE_PREFIX.agent)) return 'agent';
  if (content.startsWith(COMPOSER_MODE_PREFIX.debug)) return 'debug';
  if (content.startsWith(COMPOSER_MODE_PREFIX.multitask) || /^\[Multi-agent\]/i.test(content.trim())) return 'multitask';
  if (content.startsWith(COMPOSER_MODE_PREFIX.ask)) return 'ask';
  return null;
}

function previewFromText(text: string) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  return t.length > 52 ? `${t.slice(0, 50)}…` : t;
}

function ChatModeTabs() {
  const { route, navigate } = useRouter();
  const current = route.name === 'chat'
    ? (route.mode === 'voice' ? 'voice' : 'general')
    : 'general';
  const go = (next: 'general' | 'voice') => {
    if (next === 'voice' && !isVoiceTabEnabled()) return;
    if (next === 'general') {
      stopSpeaking();
      if (route.name === 'chat' && !route.mode && !route.chatId) return;
      navigate({ name: 'chat' });
      return;
    }
    if (route.name === 'chat' && route.mode === next) return;
    navigate({ name: 'chat', mode: next });
  };
  const tabs: { id: 'general' | 'voice'; label: string }[] = [
    { id: 'general', label: 'Chat' },
    { id: 'voice', label: 'Voice' },
  ];
  return (
    <div className="relative z-30 shrink-0 flex items-center justify-center gap-1 pt-3 pb-1 pointer-events-auto">
      {tabs.map(t => {
        const parked = t.id === 'voice' && !isVoiceTabEnabled();
        const soonTitle = 'Voice · coming soon (conversation only, no PC control or builds)';
        return (
          <button
            key={t.id}
            type="button"
            disabled={parked}
            onClick={() => go(t.id)}
            title={parked ? soonTitle : undefined}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              parked
                ? 'text-content-tertiary/40 cursor-not-allowed opacity-50'
                : current === t.id
                ? 'bg-surface-hover text-content-primary'
                : 'text-content-tertiary hover:text-content-primary'
            }`}
          >
            {t.label}
            {parked ? ' · soon' : ''}
          </button>
        );
      })}
    </div>
  );
}

type ModelSource = 'local' | 'cloud' | 'auto';

type ModelKind = 'chat' | 'image' | 'video';

type ChatModelOption = {
  id: string;
  name: string;
  source: ModelSource;
  detail: string;
  kind: ModelKind;
};

const CHAT_MODELS: ChatModelOption[] = [
  // Chat. only Auto by default; keyed clouds + Ollama added at runtime
  { id: 'NOVA-auto', name: 'Nova Multimodal', source: 'auto', detail: '', kind: 'chat' },
  // Image. paths that generate today
  { id: 'NOVA-auto', name: 'Nova Multimodal', source: 'auto', detail: '', kind: 'image' },
  { id: 'NOVA-image-core', name: 'NOVA Image Core', source: 'local', detail: '', kind: 'image' },
  { id: 'sd15-local', name: 'SD 1.5 Local', source: 'local', detail: '', kind: 'image' },
  { id: 'sdxl-turbo-local', name: 'SDXL Turbo Local', source: 'local', detail: '', kind: 'image' },
  { id: 'flux-schnell-local', name: 'FLUX Schnell Local', source: 'local', detail: '', kind: 'image' },
  { id: 'dall-e-3', name: 'DALL·E 3', source: 'cloud', detail: '', kind: 'image' },
  // Video. NOVA Engine only (Pollinations / HF / motion-still). Not Kling or Sora.
  { id: 'NOVA-auto', name: 'Nova Multimodal', source: 'auto', detail: '', kind: 'video' },
  { id: 'NOVA-video-core', name: 'NOVA Video Core', source: 'local', detail: '', kind: 'video' },
];

/** Cloud chat options. only shown in the picker when that provider key exists. */
const CLOUD_CHAT_WHEN_KEYED: (ChatModelOption & { keyId: string })[] = [
  { id: 'groq-llama', name: 'Llama 3.3 (Groq)', source: 'cloud', detail: '', kind: 'chat', keyId: 'groq' },
  { id: 'gemini-flash', name: 'Gemini 2.0 Flash', source: 'cloud', detail: '', kind: 'chat', keyId: 'google' },
  { id: 'openrouter-free', name: 'OpenRouter Free', source: 'cloud', detail: '', kind: 'chat', keyId: 'openrouter' },
  { id: 'hf-llama', name: 'Llama 3.1 (HF)', source: 'cloud', detail: '', kind: 'chat', keyId: 'huggingface' },
  { id: 'nvidia-llama', name: 'Llama 3.1 (NIM)', source: 'cloud', detail: '', kind: 'chat', keyId: 'nvidia' },
  { id: 'together-llama', name: 'Llama 3.1 (Together)', source: 'cloud', detail: '', kind: 'chat', keyId: 'together' },
  { id: 'fireworks-llama', name: 'Llama 3.1 (Fireworks)', source: 'cloud', detail: '', kind: 'chat', keyId: 'fireworks' },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', source: 'cloud', detail: '', kind: 'chat', keyId: 'deepseek' },
  { id: 'mistral-small', name: 'Mistral Small', source: 'cloud', detail: '', kind: 'chat', keyId: 'mistral' },
  { id: 'cerebras-llama', name: 'Llama 3.1 (Cerebras)', source: 'cloud', detail: '', kind: 'chat', keyId: 'cerebras' },
  { id: 'sambanova-llama', name: 'Llama 3.1 (SambaNova)', source: 'cloud', detail: '', kind: 'chat', keyId: 'sambanova' },
  { id: 'gpt-4o', name: 'GPT-4o', source: 'cloud', detail: '', kind: 'chat', keyId: 'openai' },
  { id: 'claude-sonnet', name: 'Claude Sonnet', source: 'cloud', detail: '', kind: 'chat', keyId: 'anthropic' },
];

function kindForMode(mode: ChatMode): ModelKind {
  if (mode === 'image') return 'image';
  if (mode === 'video') return 'video';
  return 'chat';
}

function defaultModelForKind(kind: ModelKind): ChatModelOption {
  const prefs = getLocalPrefs();
  // Prefer role brain (activeChatId / activeCoderId), then legacy defaults.
  const roleId = kind === 'chat'
    ? (prefs.activeChatId || prefs.lastChatModelId || prefs.defaultModelId)
    : (prefs.activeCoderId || prefs.defaultCodeModelId || prefs.defaultModelId);
  const prefId =
    roleId && roleId !== 'NOVA-auto'
      ? roleId
      : (prefs.defaultModelId && prefs.defaultModelId !== 'NOVA-auto'
        ? prefs.defaultModelId
        : (prefs.lastChatModelId || prefs.defaultModelId));

  if (kind === 'chat' && prefId && prefId !== 'NOVA-auto') {
    const cloud = CLOUD_CHAT_WHEN_KEYED.find(m => m.id === prefId);
    if (cloud && hasProviderApiKey(cloud.keyId) && isCloudProviderEnabled(cloud.keyId)) return cloud;
    const resolved = resolvePreferredCloudProvider(prefId, prefId);
    if (resolved && hasProviderApiKey(resolved.providerId) && isCloudProviderEnabled(resolved.providerId)) {
      return {
        id: prefId,
        name: cloud?.name || prefId,
        source: 'cloud',
        detail: `Cloud · ${resolved.label}`,
        kind: 'chat',
      };
    }
    if (prefId.startsWith('ollama:')) {
      return { id: prefId, name: prefId.replace(/^ollama:/, ''), source: 'local', detail: 'Ollama', kind: 'chat' };
    }
    // Unknown ids that look like cloud (but key missing) must not be labeled local.
    if (resolved) {
      // A provider can be disconnected or its key can be removed between
      // sessions. Do not restore a pinned cloud model that is not usable:
      // it disappears from the picker and leaves Chat showing a dead model.
      return CHAT_MODELS.find(m => m.id === 'NOVA-auto' && m.kind === 'chat') ?? {
        id: prefId,
        name: prefId,
        source: 'cloud',
        detail: `Cloud · ${resolved.label} · add key`,
        kind: 'chat',
      };
    }
    return { id: prefId, name: prefId, source: 'local', detail: 'Local · Settings default', kind: 'chat' };
  }
  if (prefId && prefId !== 'NOVA-auto') {
    const hit = CHAT_MODELS.find(m => m.id === prefId && m.kind === kind);
    if (hit) return hit;
  }
  const auto = CHAT_MODELS.find(m => m.id === 'NOVA-auto' && m.kind === kind);
  if (auto) return auto;
  if (kind === 'chat') {
    return CHAT_MODELS.find(m => m.id === 'NOVA-auto') ?? CHAT_MODELS[0];
  }
  const local = CHAT_MODELS.find(m => m.kind === kind && m.source === 'local');
  return local ?? CHAT_MODELS.find(m => m.kind === kind) ?? CHAT_MODELS[0];
}

/** Show a small chip when Auto hopped or a pinned model was overridden. */
function failoverChipText(routed: ArkRouterResult, pinned: ChatModelOption): string | null {
  const hops = routed.attempted?.length ?? 0;
  const name = (routed.modelName || '').trim();
  if (!name) return null;

  if (hops > 1) {
    return `Local failed → trying ${name}`;
  }

  if (pinned.id === 'NOVA-auto' || pinned.source === 'auto') {
    return null;
  }

  const pinnedName = (pinned.name || '').toLowerCase();
  const pinnedId = (pinned.id || '').toLowerCase();
  const resolved = name.toLowerCase();
  const same =
    resolved.includes(pinnedName)
    || pinnedName.includes(resolved)
    || (pinnedId && resolved.includes(pinnedId.replace(/^(ollama|NOVA)-?/, '')));
  if (!same) return `Switched to ${name}`;
  return null;
}

const PLACEHOLDERS: Record<ChatMode, string[]> = {
  general: [
    'Ask NOVA to build something...',
    'Ask NOVA anything...',
    'Ask a question...',
  ],
  image: [
    'Describe the image. NOVA may ask a quick brief first…',
    'Upload a photo (+) to recreate or improve it…',
    'Describe style, subject, and mood for best accuracy…',
  ],
  video: [
    'Describe the video you want to create...',
    'Ask NOVA to generate a short clip...',
  ],
  voice: [
    'Tap send, then speak. NOVA will listen and reply aloud.',
    'Ask a question or request a short story…',
  ],
  code: [
    'Describe the code you want to write...',
    'Ask NOVA to fix a bug...',
    'Ask NOVA to explain this function...',
  ],
};

const GREETINGS = [
  'What are we doing today?',
  'Welcome back.',
  'Ready when you are.',
  'What would you like to explore?',
];

const IMAGE_IDEAS = [
  { id: 'caricature', label: 'Create a caricature', tone: 'from-amber-900/80 to-stone-900' },
  { id: 'anime', label: 'Anime style', tone: 'from-violet-900/80 to-indigo-950' },
  { id: 'underwater', label: 'Underwater', tone: 'from-cyan-900/70 to-slate-950' },
  { id: 'summer', label: 'Summer list', tone: 'from-orange-800/70 to-yellow-950' },
  { id: 'pins', label: 'Pin collection', tone: 'from-fuchsia-900/70 to-rose-950' },
  { id: 'interior', label: 'Interior design', tone: 'from-stone-700/80 to-neutral-950' },
  { id: '3d', label: '3D avatar', tone: 'from-sky-900/70 to-blue-950' },
  { id: 'icons', label: 'Icon designs', tone: 'from-emerald-900/70 to-teal-950' },
  { id: 'headshot', label: 'Studio headshot', tone: 'from-zinc-700/80 to-zinc-950' },
  { id: 'stickers', label: 'Chibi stickers', tone: 'from-pink-800/70 to-rose-950' },
  { id: 'product', label: 'Product shot', tone: 'from-neutral-800/80 to-stone-950' },
  { id: 'poster', label: 'Movie poster', tone: 'from-red-900/70 to-black' },
  { id: 'logo', label: 'Logo concepts', tone: 'from-lime-900/70 to-emerald-950' },
  { id: 'ui', label: 'App UI mockup', tone: 'from-blue-800/70 to-slate-950' },
  { id: 'food', label: 'Food photography', tone: 'from-orange-900/70 to-amber-950' },
  { id: 'fashion', label: 'Fashion lookbook', tone: 'from-rose-800/70 to-pink-950' },
  { id: 'fantasy', label: 'Fantasy world', tone: 'from-purple-900/70 to-indigo-950' },
  { id: 'pixel', label: 'Pixel art', tone: 'from-green-800/70 to-teal-950' },
  { id: 'watercolor', label: 'Watercolor art', tone: 'from-sky-800/70 to-cyan-950' },
  { id: 'comic', label: 'Comic panel', tone: 'from-yellow-800/70 to-orange-950' },
  { id: 'architecture', label: 'Architecture', tone: 'from-slate-700/80 to-zinc-950' },
  { id: 'mascot', label: 'Brand mascot', tone: 'from-teal-800/70 to-cyan-950' },
  { id: 'thumbnail', label: 'YouTube thumbnail', tone: 'from-red-800/70 to-rose-950' },
  { id: 'wallpaper', label: 'Desktop wallpaper', tone: 'from-indigo-900/70 to-blue-950' },
];

const VIDEO_IDEAS = [
  { id: 'trailer', label: 'Product trailer', tone: 'from-red-900/70 to-neutral-950' },
  { id: 'reel', label: 'Social reel', tone: 'from-fuchsia-900/70 to-purple-950' },
  { id: 'explain', label: 'Explainer clip', tone: 'from-blue-900/70 to-slate-950' },
  { id: 'cinematic', label: 'Cinematic scene', tone: 'from-indigo-900/70 to-black' },
  { id: 'timelapse', label: 'Timelapse style', tone: 'from-orange-900/70 to-stone-950' },
  { id: 'logo', label: 'Logo animation', tone: 'from-teal-900/70 to-emerald-950' },
  { id: 'demo', label: 'App demo', tone: 'from-cyan-900/70 to-sky-950' },
  { id: 'story', label: 'Story beat', tone: 'from-rose-900/70 to-zinc-950' },
  { id: 'ad', label: '15s ad', tone: 'from-amber-900/70 to-yellow-950' },
  { id: 'tutorial', label: 'Quick tutorial', tone: 'from-lime-900/70 to-green-950' },
  { id: 'unbox', label: 'Unboxing vibe', tone: 'from-stone-700/80 to-neutral-950' },
  { id: 'music', label: 'Music visualizer', tone: 'from-violet-900/70 to-fuchsia-950' },
  { id: 'before', label: 'Before & after', tone: 'from-sky-900/70 to-blue-950' },
  { id: 'game', label: 'Game trailer', tone: 'from-emerald-900/70 to-teal-950' },
  { id: 'news', label: 'News bumper', tone: 'from-red-800/70 to-slate-950' },
  { id: 'travel', label: 'Travel montage', tone: 'from-cyan-800/70 to-indigo-950' },
  { id: 'workout', label: 'Fitness clip', tone: 'from-orange-800/70 to-red-950' },
  { id: 'cooking', label: 'Recipe short', tone: 'from-yellow-900/70 to-orange-950' },
  { id: 'tech', label: 'Tech review', tone: 'from-zinc-700/80 to-slate-950' },
  { id: 'loop', label: 'Seamless loop', tone: 'from-pink-900/70 to-rose-950' },
];

const CODE_IDEAS = [
  { id: 'react', label: 'React component', tone: 'from-sky-900/70 to-blue-950' },
  { id: 'api', label: 'REST API', tone: 'from-emerald-900/70 to-teal-950' },
  { id: 'bug', label: 'Fix a bug', tone: 'from-red-900/70 to-rose-950' },
  { id: 'refactor', label: 'Refactor code', tone: 'from-violet-900/70 to-indigo-950' },
  { id: 'test', label: 'Write unit tests', tone: 'from-amber-900/70 to-yellow-950' },
  { id: 'sql', label: 'SQL query', tone: 'from-cyan-900/70 to-slate-950' },
  { id: 'script', label: 'Automation script', tone: 'from-lime-900/70 to-green-950' },
  { id: 'auth', label: 'Auth flow', tone: 'from-orange-900/70 to-stone-950' },
  { id: 'ui', label: 'UI layout', tone: 'from-fuchsia-900/70 to-purple-950' },
  { id: 'regex', label: 'Regex helper', tone: 'from-zinc-700/80 to-neutral-950' },
  { id: 'cli', label: 'CLI tool', tone: 'from-teal-900/70 to-cyan-950' },
  { id: 'algo', label: 'Algorithm', tone: 'from-indigo-900/70 to-blue-950' },
  { id: 'review', label: 'Code review', tone: 'from-rose-900/70 to-pink-950' },
  { id: 'docs', label: 'Add comments', tone: 'from-stone-700/80 to-zinc-950' },
  { id: 'convert', label: 'Convert language', tone: 'from-sky-800/70 to-indigo-950' },
  { id: 'debug', label: 'Debug crash', tone: 'from-red-800/70 to-orange-950' },
];

function isMediaOnlyContent(content: string) {
  if (!content) return false;
  if (content.startsWith('__progress__:')) return true;
  if (content.startsWith('__generating__:')) {
    return !content.startsWith('__generating__:chat:');
  }
  const stripped = content
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/Generated (image|video|fallback|motion|cinematic)[^\n]*/gi, '')
    .trim();
  return !stripped && /!\[[^\]]*\]\([^)]+\)/.test(content);
}

function projectIdFromThread(messages: { content?: string }[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const metas = parseChatAttaches(String(messages[i]?.content || ''));
    for (const m of metas) {
      if (m.projectId) return m.projectId;
    }
  }
  return null;
}

function folderNameFromThread(messages: { content?: string }[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const metas = parseChatAttaches(String(messages[i]?.content || ''));
    for (const m of metas) {
      if (m.name) return m.name;
    }
  }
  return null;
}

async function resolveStudioFiles(opts: {
  chatId: string;
  memoryFiles: Record<string, string>;
  memoryProjectId: string | null;
  memoryDiskRoot?: string | null;
  messages: { content?: string }[];
}): Promise<{ files: Record<string, string>; projectId: string | null; name?: string; diskRoot?: string | null }> {
  const fromChat = loadChatStudio(opts.chatId);
  if (Object.keys(opts.memoryFiles).length) {
    return {
      files: opts.memoryFiles,
      projectId: opts.memoryProjectId || fromChat?.projectId || null,
      name: fromChat?.name || folderNameFromThread(opts.messages) || undefined,
      // Always prefer the persisted root for THIS chat when memory root is empty/stale.
      diskRoot: opts.memoryDiskRoot || fromChat?.diskRoot || null,
    };
  }
  if (fromChat && Object.keys(fromChat.files || {}).length) {
    return {
      files: fromChat.files,
      projectId: fromChat.projectId,
      name: fromChat.name,
      diskRoot: fromChat.diskRoot || opts.memoryDiskRoot || null,
    };
  }

  const pid = opts.memoryProjectId || fromChat?.projectId || projectIdFromThread(opts.messages);
  const diskRoot = opts.memoryDiskRoot || fromChat?.diskRoot || null;

  // Path-bound workspaces: keep an empty map here. Later steps hydrate only
  // the files this turn needs (keeps Turn context low).
  if (diskRoot) {
    return {
      files: {},
      projectId: pid,
      // Folder basename is the source of truth — never let chat titles rewrite it.
      name: studioPathBasename(diskRoot) || fromChat?.name || folderNameFromThread(opts.messages) || undefined,
      diskRoot,
    };
  }

  if (pid) {
    try {
      const raw = localStorage.getItem(`NOVA:chat-studio-files:${pid}`);
      if (raw) {
        const parsed = JSON.parse(raw) as { files?: Record<string, string>; name?: string };
        if (parsed?.files && Object.keys(parsed.files).length) {
          return { files: parsed.files, projectId: pid, name: parsed.name, diskRoot };
        }
      }
    } catch {
      /* ignore */
    }
    if (window.arkDesktop?.projectRead) {
      try {
        const read = await Promise.race([
          window.arkDesktop.projectRead(pid),
          new Promise<null>((resolve) => { window.setTimeout(() => resolve(null), 3_000); }),
        ]);
        if (read?.ok && read.files && Object.keys(read.files || {}).length) {
          return {
            files: read.files as Record<string, string>,
            projectId: pid,
            name: folderNameFromThread(opts.messages) || fromChat?.name || undefined,
            diskRoot: (read as { root?: string }).root || diskRoot,
          };
        }
      } catch {
        /* ignore */
      }
    }
  }
  return {
    files: {},
    projectId: pid,
    name: folderNameFromThread(opts.messages) || fromChat?.name || undefined,
    diskRoot,
  };
}

function persistModeThread(
  mode: ChatMode,
  messages: ChatMessage[],
  opts?: { chatId?: string; creationId?: string; libraryId?: string; assistantId?: string },
) {
  try {
    const slim = messages.map(m => ({
      ...m,
      content:
        opts?.assistantId && m.id === opts.assistantId
          ? slimChatContent(m.content, opts.libraryId)
          : slimChatContent(m.content),
    }));
    if (opts?.chatId) {
      localStorage.setItem(chatThreadKey(opts.chatId), JSON.stringify(slim));
    }
    if (mode !== 'general') {
      localStorage.setItem(`NOVA:chat-thread:${mode}`, JSON.stringify(slim));
    }
    if (opts?.creationId) {
      localStorage.setItem(`NOVA:chat-thread:creation:${opts.creationId}`, JSON.stringify(slim));
    }
  } catch {
    /* ignore */
  }
}

/** Human-friendly delete prepare error (logs raw error to console for devtools). */
function deletePrepareErrorReply(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err || '');
  console.error('[delete] failed:', err);
  if (/before initialization/i.test(msg)) {
    return 'Delete failed due to an internal app bug (module load). Please restart NOVA after update. not a permissions issue.';
  }
  return msg || 'Could not prepare delete. Try again.';
}

/** Don't steal focus from Settings/Search/API fields into the chat composer. */
function focusComposerIfSafe(el: HTMLTextAreaElement | null | undefined) {
  if (!el) return;
  if (el.closest('[aria-hidden="true"], .hidden')) return;
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
  const active = document.activeElement as HTMLElement | null;
  if (active && active !== el && active !== document.body) {
    const tag = active.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable) return;
  }
  el.focus();
}

export function AIChat() {
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
      if (existing) {
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
      await sendMessageRef.current(typed);
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

  const sendMessage = async (content: string) => {
    // Guest hydrate lag must not silent-drop Enter (Grok audit).
    const userId = user?.id || 'guest-local';
    if (mode === 'voice') {
      if (!isVoiceTabEnabled()) return;
      if (!content.trim()) content = '<!--ark-voice-turn-->';
      await runEphemeralVoiceTurn(content);
      return;
    }
    if (!content.trim()) return;
    // New send → follow the reply; history scroll stays free until the user scrolls up again.
    stickToBottomRef.current = true;
    userDetachScrollRef.current = false;
    // Only cancel a prior engine job when this turn will replace it (not every keystroke path).
    if (generatingRef.current) {
      void engineGenerateCancel();
    }
    // Do NOT clear generatingRef here — handleSend sets it early to block double Enter
    // from starting two creates / queueing the same prompt on itself.
    stopRequestedRef.current = false;
    setFailoverNote(null);
    setIpcFallbackDev(false);
    const mySeq = ++genSeqRef.current;

    // Prefer live route id. Blank starters (no chatId) always mint a new id. never reuse persist.
    const blankStarter = route.name === 'chat' && !route.chatId;
    let activeChatId = blankStarter
      ? undefined
      : (routeChatIdRef.current || persistChatIdRef.current || undefined);
    const isNewChat = !activeChatId;
    if (!activeChatId) {
      activeChatId = `chat-${crypto.randomUUID().slice(0, 10)}`;
      skipChatLoadIdsRef.current.add(activeChatId);
      messagesRef.current = [];
      messagesChatIdRef.current = activeChatId;
      const keepFiles = { ...chatStudioFilesRef.current };
      const keepPid = chatStudioProjectIdRef.current;
      let keepRoot = chatStudioDiskRootRef.current;
      if (!keepRoot && !Object.keys(keepFiles).length) {
        const applied = consumePendingStudioBind({
          setDiskRoot: (root) => {
            keepRoot = root;
            chatStudioDiskRootRef.current = root;
            setChatStudioDiskRoot(root);
          },
          setFiles: (files) => {
            Object.assign(keepFiles, files);
            setChatStudioFiles(files);
            chatStudioFilesRef.current = files;
          },
          setProjectId: (id) => { chatStudioProjectIdRef.current = id; },
        });
        if (applied.diskRoot) keepRoot = applied.diskRoot;
      }
      const keepName = keepRoot ? studioPathBasename(keepRoot) : undefined;
      studioBoundChatIdRef.current = activeChatId;
      lastStudioIntentRef.current = null;
      if (keepRoot || Object.keys(keepFiles).length) {
        persistStudioSnapshot(activeChatId, {
          files: keepFiles,
          projectId: keepPid || chatStudioProjectIdRef.current,
          name: keepName,
          diskRoot: keepRoot,
        });
      } else {
        setPreviewUrl(null);
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

    const enabledIds = chatPlugins.map(p => p.id);
    const pluginId = detectPluginIntent(content, enabledIds);
    const pluginState = pluginId ? getPluginRuntime(pluginId, loadPluginState()) : null;
    const providerLabel = pluginId
      ? `${chatPlugins.find(p => p.id === pluginId)?.name ?? 'Plugin'}${pluginState?.accountLabel ? ` · @${pluginState.accountLabel}` : ' · live'}`
      : pinnedModel.source === 'auto'
        ? 'Nova Multimodal'
        : `${pinnedModel.source === 'local' ? 'Local' : 'Cloud'} · ${pinnedModel.name}`;

    const assistantId = crypto.randomUUID();
    const isMediaMode = mode === 'image' || mode === 'video';
    // Reading… only when THIS message includes an upload. not leftover studio files.
    const readingAttach = /<!--ark-attach:/.test(content)
      || /<!--ark-auto-read-->/.test(content)
      || /!\[[^\]]*\]\(ark-media:/.test(content)
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
    const nextThread: ChatMessage[] = [...normalized, userMsg];
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
    generatingRef.current = true;
    beginChatInflight();
    let inflightEnded = false;
    const endInflightOnce = () => {
      if (inflightEnded) return;
      inflightEnded = true;
      endChatInflight();
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
      clearChatTurnStatus(assistantId);
      endInflightOnce();
      if (mySeq !== genSeqRef.current) return;
      generatingRef.current = false;
      if (activeGenChatIdRef.current === activeChatId) {
        activeGenChatIdRef.current = null;
      }
      setGenerating(false);
    };

    const finishPlainReply = async (replyText: string, providerUsed?: string) => {
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
      endTurnAndFlush(mySeq);
    };

    const stopIfSuperseded = async (note?: string) => {
      if (mySeq === genSeqRef.current && !stopRequestedRef.current) return false;
      await finishPlainReply(
        note
        || (stopRequestedRef.current
          ? 'Stopped.'
          : 'Stopped — another message started while this was still running.'),
      );
      return true;
    };

    if (looksLikeHarmfulContentAsk(content)) {
      // Brief pause so the reply reads like a normal answer, not a 1 ms stub.
      await new Promise<void>(r => window.setTimeout(r, 480 + Math.floor(Math.random() * 220)));
      await finishPlainReply(harmfulContentBlockedReply());
      return;
    }

    if (looksLikeArkSelfHarmAsk(content)) {
      await new Promise<void>(r => window.setTimeout(r, 360 + Math.floor(Math.random() * 180)));
      await finishPlainReply(arkSelfHarmBlockedReply());
      return;
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
      return;
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
        return;
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
    try {
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

    const pushAssistantStatus = (label: string) => {
      if (mySeq !== genSeqRef.current || stopRequestedRef.current) return;
      const clean = String(label || '').trim() || 'Thinking…';
      // Status lives in a store — not a full chat remount every tick (C1).
      setChatTurnStatus({ chatId: activeChatId, assistantId, label: clean });
      const viewingThis = Boolean(activeChatId && routeChatIdRef.current === activeChatId);
      if (!viewingThis) {
        try {
          const raw = localStorage.getItem(chatThreadKey(activeChatId));
          const stored = raw ? JSON.parse(raw) as ChatMessage[] : [];
          if (Array.isArray(stored) && stored.some(m => m.id === assistantId)) {
            // Keep a stable placeholder in persisted threads; live label is store-only when viewing.
            const statusContent = `__generating__:chat:${clean}`;
            const next = stored.map(m => (m.id === assistantId ? { ...m, content: statusContent } : m));
            persistModeThread(mode, next, { chatId: activeChatId });
          }
        } catch { /* ignore */ }
        return;
      }
      // Ensure the assistant bubble is a generating placeholder once; label updates via store.
      const now = Date.now();
      const lastAt = (chatTurnCtlRef.current as { statusAt?: number }).statusAt || 0;
      const seeded = (chatTurnCtlRef.current as { statusSeeded?: boolean }).statusSeeded;
      if (!seeded) {
        (chatTurnCtlRef.current as { statusSeeded?: boolean }).statusSeeded = true;
        (chatTurnCtlRef.current as { statusAt?: number }).statusAt = now;
        startTransition(() => {
          setMessages(prev => {
            const next = prev.map(m => (
              m.id === assistantId && !String(m.content || '').startsWith('__generating__:')
                ? { ...m, content: '__generating__:chat:Working…' }
                : m.id === assistantId
                  ? { ...m, content: '__generating__:chat:Working…' }
                  : m
            ));
            messagesRef.current = next;
            return next;
          });
        });
        return;
      }
      // Rarely refresh message content so off-store readers still see something recent.
      if (now - lastAt < 2500) return;
      (chatTurnCtlRef.current as { statusAt?: number }).statusAt = now;
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
      const roots = await window.arkDesktop?.browseRoots?.();
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
    const intentText = stripComposerPrefix(content)
      .replace(/!\[[^\]]*]\(data:image\/[^)]+\)/gi, ' ')
      .replace(/!\[[^\]]*]\(ark-media:[^)]+\)/gi, ' ');
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
        return;
      }
    }

    // Pasted icon/image URLs (Iconify, Unsplash, etc.) → download into public/ on the bound project.
    if (
      diskRoot
      && looksLikeAssetLinkAsk(content)
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
          return;
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
      && diskIntent.type === 'none'
      && hasActiveWorkspace({
        files: resolvedStudio.files,
        projectId: resolvedStudio.projectId || turnProjectId,
        diskRoot: resolvedStudio.diskRoot || turnDiskRoot,
      });
    if ((mode === 'general' || mode === 'code') && !skipDiskForInPlaceRebuild && !skipDiskForCodeEdit) {
      {
        const deleteOutcome = await runDeleteTurn({
          content,
          chatId: activeChatId,
          mode,
          assistantId,
          mySeq,
          replyStartedAt,
          diskIntent,
          diskRoot,
          diskProjectId,
          diskWorkspaceName,
          stickyDiskTarget,
          workspaceFiles: resolvedStudio.files,
          messages: messagesRef.current,
          finishPlainReply,
          getLastListedFolder,
          setLastDiskTarget,
          setDeleteFilePrompt,
          setDeleteProjectPrompt,
          setDeleteFolderClarifyPrompt,
          pendingFileDeleteRef,
          pendingProjectDeleteRef,
          pendingFolderClarifyRef,
          relPathFromDisk,
        });
        if (deleteOutcome.status === 'handled') return;
      }

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
          return;
        }
        await finishPlainReply(renameOutcome.text);
        return;
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
          return;
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
          return;
        }
        }
      }
    }

    // PC system tasks. restore point, read file (no workspace required; Full PC / Desktop grant).
    if ((mode === 'general' || mode === 'code') && hasFolderAccessGrant()) {
      await syncWorkspaceGrantsFromPrefs();
      const homeCwd = (await window.arkDesktop?.browseRoots?.())?.roots?.find(r => r.id === 'home')?.path
        || chatStudioDiskRootRef.current
        || diskRoot
        || undefined;

      if (looksLikeRestorePointAsk(content) && window.arkDesktop?.agentRun) {
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
            return;
          }
          setMessages(prev => prev.map(m => (
            m.id === assistantId ? { ...m, content: '__generating__:chat:Creating restore point…' } : m
          )));
          const ran = await runAgentCommand({ command, cwd, skipConfirm: true });
          const text = ran.reply?.includes('Access is denied') || ran.reply?.toLowerCase().includes('elevated')
            ? `${ran.reply}\n\nWindows restore points need **Run as administrator**. Approve the UAC prompt if it appears, or run NOVA as admin once.`
            : (ran.reply || 'Restore point finished.');
          await finishPlainReply(text);
          return;
        }
        if (restoreOutcome.handled && restoreOutcome.reply) {
          await finishPlainReply(restoreOutcome.reply);
          return;
        }
      }
    }

    // Chip handlers for pending greenfield. MUST run even when message is just "Keep planning"
    // (that phrase alone is not a greenfield idea, so it used to fall through to the local model).
    const pendingPlanExpand = getLastPendingGreenfield(activeChatId);
    const looksLikePlanFeatureAdd = Boolean(
      pendingPlanExpand
      && !looksLikeGreenfieldCreateGo(intentText)
      && !looksLikeImplementGo(intentText)
      && !parseWorkOnFolderName(intentText)
      && (
        /\b(?:also|plus)\b/i.test(intentText)
        || /\badd\b[\s\S]{0,80}\b(?:reminder|chart|report|bill|feature|panel|modal|screen|indicator)/i.test(intentText)
      ),
    );
    if ((mode === 'general' || mode === 'code') && (
      looksLikeGreenfieldKeepPlanning(intentText)
      || /\badd\s+more\s+features\s+to\s+the\s+plan\b/i.test(intentText)
      || /\bexpand\s+the\s+plan\b/i.test(intentText)
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
        return;
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

        // EARLY_OWNED_DISPATCH_V217 — every kind before generate.
    if (mode === 'general' || mode === 'code') {
      const earlyClassified = classifyTurn(content, {
        diskRoot: chatStudioDiskRootRef.current || chatStudioDiskRoot || resolvedStudio.diskRoot,
        files: chatStudioFilesRef.current || resolvedStudio.files,
        projectId: chatStudioProjectIdRef.current || resolvedStudio.projectId,
        chatId: activeChatId,
      });
      // EARLY_OWNED_DISPATCH_V217 — every kind; hosts for delete/open/cmd still move up later.
      {
        const earlyIntent = parseNewProjectIntent(content) || null;
        const renameFromAsk = extractProjectName(content);
        const createIntentEarly = earlyIntent && renameFromAsk && !/^(My App|New App|App)$/i.test(renameFromAsk)
          ? { ...earlyIntent, name: renameFromAsk, slug: slugifyProjectName(renameFromAsk), summary: content.length > 40 ? `${content}\n\n${earlyIntent.summary}` : earlyIntent.summary }
          : earlyIntent;
        const workspaceActiveForCreate = hasActiveWorkspace({
          files: resolvedStudio.files,
          projectId: resolvedStudio.projectId || chatStudioProjectIdRef.current,
          diskRoot: resolvedStudio.diskRoot || chatStudioDiskRootRef.current,
        });
        const owned = await dispatchOwnedTurn({
          content,
          mode,
          classifyOpts: {
            diskRoot: chatStudioDiskRootRef.current || resolvedStudio.diskRoot,
            files: chatStudioFilesRef.current || resolvedStudio.files,
            projectId: chatStudioProjectIdRef.current || resolvedStudio.projectId,
            chatId: activeChatId,
          },
          skipCreate: diskIntent?.type === 'add_file',
          planName: createIntentEarly?.name || earlyClassified.createName || extractProjectName(content) || 'your idea',
          planSummary: createIntentEarly?.summary || content,
          savePlanBrief: ({ name, summary }) => {
            setLastPendingGreenfield(activeChatId, {
              name,
              slug: slugifyProjectName(name),
              kind: resolveProjectKindForCreate(summary, 'vite-react', 'vite-react'),
              summary,
              problemLine: `Build ${name} from your brief.`,
            });
            renameChat(activeChatId, cleanProductTitle(name));
          },
          finishPlainReply,
          createHost: {
            content,
            chatId: activeChatId,
            mode,
            workspaceBound: workspaceActiveForCreate,
            createIntent: createIntentEarly,
            classifiedCreateName: earlyClassified.createName,
            messages: messagesRef.current,
            routeChatId: routeChatIdRef.current,
            pushStatus: pushAssistantStatus,
            stopIfSuperseded,
            finishPlainReply,
            syncGrants: syncWorkspaceGrantsFromPrefs,
            commitStudio: (opts) => { commitStudioForChat(activeChatId, opts); },
            setChatCodePill,
            shouldPaintStudioLive,
            setCodePillSticky,
            renameChat,
            addChat: (chat) => addChat(chat as never),
            setLastDiskTarget,
            clearPending: clearLastPendingGreenfield,
            getPending: getLastPendingGreenfield,
            previewFromText,
          },
        });
        if (owned.status === 'handled') return;
        // edit → fall through to runEditTurn; chat → runChatTurn; other kinds without hosts continue.
      }
    }

// In-place scrap/rebuild of the bound workspace. never catalog Desktop or create sibling folders.
    // Create/plan always win — never let answerStudio run before runCreateTurn.
    const rebuildClassify = (mode === 'general' || mode === 'code') && looksLikeInPlaceRebuildAsk(intentText)
      ? classifyTurn(content, {
        diskRoot: chatStudioDiskRootRef.current || chatStudioDiskRoot,
        files: chatStudioFilesRef.current,
        projectId: chatStudioProjectIdRef.current,
        chatId: activeChatId,
      })
      : null;
    if (
      (mode === 'general' || mode === 'code')
      && looksLikeInPlaceRebuildAsk(intentText)
      && rebuildClassify
      && rebuildClassify.kind !== 'create'
      && rebuildClassify.kind !== 'plan'
    ) {
      let rebuildFiles = resolvedStudio.files;
      let rebuildProjectId = resolvedStudio.projectId || chatStudioProjectIdRef.current;
      let rebuildDiskRoot = resolvedStudio.diskRoot || chatStudioDiskRootRef.current;
      let rebuildName = resolvedStudio.name || loadRecentChats().find(c => c.id === activeChatId)?.title || 'App';

      if (!hasActiveWorkspace({ files: rebuildFiles, projectId: rebuildProjectId, diskRoot: rebuildDiskRoot })) {
        const title = loadRecentChats().find(c => c.id === activeChatId)?.title || rebuildName;
        const healed = await resolveChatProjectRoot({ chatId: activeChatId, chatTitle: title });
        if (healed.diskRoot || Object.keys(healed.files || {}).length) {
          applyStudioBinding(activeChatId, healed);
          rebuildFiles = healed.files || {};
          rebuildProjectId = healed.projectId;
          rebuildDiskRoot = healed.diskRoot;
          rebuildName = healed.name || title || rebuildName;
          resolvedStudio.files = rebuildFiles;
          resolvedStudio.projectId = rebuildProjectId;
          resolvedStudio.diskRoot = rebuildDiskRoot;
          resolvedStudio.name = rebuildName;
        }
        // Last chance: open known fps / project folder under NOVA sandbox by name.
        if (!hasActiveWorkspace({ files: rebuildFiles, projectId: rebuildProjectId, diskRoot: rebuildDiskRoot })) {
          const blob = `${title || ''} ${intentText || ''}`;
          const guess = blob.match(/\b(fps[\s_-]?arena)\b/i)?.[1]
            || (/\bfps\b/i.test(blob) ? 'fps-arena' : '');
          const slug = String(guess || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
          if (slug && window.arkDesktop?.workspaceSandboxRoot) {
            const sand = await window.arkDesktop.workspaceSandboxRoot();
            if (sand?.ok && sand.path) {
              const sep = sand.path.includes('\\') ? '\\' : '/';
              const candidate = `${sand.path.replace(/[/\\]+$/, '')}${sep}${slug}`;
              const opened = await openFolderInChat(candidate, { mode: 'path' });
              if (opened.ok) {
                rebuildFiles = opened.files || chatStudioFilesRef.current || {};
                rebuildProjectId = opened.projectId || chatStudioProjectIdRef.current;
                rebuildDiskRoot = opened.root || chatStudioDiskRootRef.current;
                rebuildName = opened.name || rebuildName;
                resolvedStudio.files = rebuildFiles;
                resolvedStudio.projectId = rebuildProjectId;
                resolvedStudio.diskRoot = rebuildDiskRoot;
                resolvedStudio.name = rebuildName;
              }
            }
          }
        }
      }

      if (!hasActiveWorkspace({
        files: rebuildFiles,
        projectId: rebuildProjectId,
        diskRoot: rebuildDiskRoot,
      })) {
        await finishPlainReply(
          'I need the project folder bound first. Click the project chip under the chat (or **+ → Open folder**), then ask me to scrap and rebuild again.',
        );
        return;
      }

      const { wipeProjectUiFiles, apologyRebuildLead, extractCorrectionProductName } = await import('@/lib/inPlaceRebuild');
      const { looksLikePlayableCanvasGame, looksLikeFpsGame, isBrokenReactAppSource } = await import('@/lib/freshSpaFromBrief');
      const { isPlayableGameReady, isPlayableArcadeGameReady } = await import('@/lib/createBuildQuality');

      const diskRoot = rebuildDiskRoot;
      const projectId = rebuildProjectId;
      const priorName = rebuildName || 'App';
      const productName = cleanProductTitle(extractCorrectionProductName(intentText, priorName));
      const briefForBuild = String(content || intentText || '').trim();
      const kind = resolveProjectKindForCreate(briefForBuild, 'vite-react', 'vite-react');

      pushAssistantStatus(`Scrapping previous UI — rebuilding ${productName}…`);
      let filesNow = wipeProjectUiFiles({
        files: { ...rebuildFiles },
        name: productName,
        summary: briefForBuild,
        kind,
      });

      // Write empty shell first so old marketing/game files cannot linger.
      {
        const shellReply = Object.entries(filesNow)
          .filter(([p]) => /(?:^|\/)(App\.(jsx|tsx|css)|index\.css|main\.(jsx|tsx)|index\.html|styles\.css|app\.js)$/i.test(p.replace(/\\/g, '/')))
          .map(([p, c]) => `@@@FILE ${p}\n${c}`)
          .join('\n');
        if (shellReply && (projectId || diskRoot)) {
          const wiped = await applyChatReplyEdits({
            reply: shellReply,
            projectId,
            projectName: productName,
            files: filesNow,
            userMessage: briefForBuild,
            diskRoot,
          });
          if (wiped.ok) filesNow = wiped.files;
        }
      }

      const gameBrief = looksLikePlayableCanvasGame(briefForBuild, productName)
        || /\bfps[\s_-]?arena\b/i.test(`${productName} ${briefForBuild} ${diskRoot || ''}`);
      const fpsBrief = looksLikeFpsGame(briefForBuild, productName)
        || /\bfps[\s_-]?arena\b/i.test(`${productName} ${briefForBuild} ${diskRoot || ''}`);
      const spatialBrief = looksLikeSpatialApp(briefForBuild, productName);
      filesNow = mergeBriefNpmDependencies({ ...filesNow }, briefForBuild);
      const sticky = pinnedModel.source === 'auto' ? threadBrainRef.current : null;

      // No answerStudio on rebuild path — capable coder or one-line edits only.
      if (isWeakCoderModel(pinnedModel.id, pinnedModel.name)) {
        await finishPlainReply(weakModelMicroEditReply(`Rebuild ${productName}`), 'NOVA · local');
        return;
      }
      await finishPlainReply(
        [
          `To scrap and rebuild **${productName}**, pin a capable coder (7B+ or cloud) in **Models**, then ask again.`,
          '',
          'Or say a one-line change (title / color / footer) and I’ll patch this folder.',
        ].join('\n'),
        'NOVA · rebuild',
      );
      return;
    } else if ((mode === 'general' || mode === 'code') && looksLikeStartWorkOnFolderAsk(intentText)) {
      if (!hasFolderAccessGrant()) {
        await finishPlainReply(GRANT_OFF_FOLDER_MSG);
        return;
      }

      const wantName = parseWorkOnFolderName(intentText);
      if (!wantName) {
        await finishPlainReply(
          'Which project folder? Say for example **“Let’s work on MyApp”** or **“Start working on Lyndsey.”**',
        );
        return;
      }

      await syncWorkspaceGrantsFromPrefs();
      const parentHint = chatStudioDiskRootRef.current;
      const located = await resolveWorkFolderPath(wantName, parentHint);
      if (!located.ok || !located.path) {
        setLastPendingGreenfield(activeChatId, {
          name: wantName,
          slug: wantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'new-project',
          kind: 'vite-react',
          summary: content,
          problemLine: `Open or create **${wantName}**.`,
        });
        await finishPlainReply(buildMissingWorkFolderReply(wantName));
        return;
      }

      const projectName = located.matchedName || wantName;
      renameChat(activeChatId, projectName);
      addChat({
        id: activeChatId,
        mode,
        title: projectName,
        updatedAt: new Date().toISOString(),
        preview: previewFromText(content),
      });

      setPendingAttaches([]);
      const opened = await openFolderInChat(located.path);
      if (!opened.ok || !opened.files) {
        const err = opened.error && opened.error !== 'canceled'
          ? opened.error
          : 'Could not open that project folder.';
        await finishPlainReply(err);
        return;
      }

      setChatStudioFiles(opened.files);
      chatStudioFilesRef.current = opened.files;
      if (opened.projectId) {
        setChatStudioProjectId(opened.projectId);
        chatStudioProjectIdRef.current = opened.projectId;
      }
      if (opened.root) {
        setChatStudioDiskRoot(opened.root);
        chatStudioDiskRootRef.current = opened.root;
      }
      persistStudioSnapshot(activeChatId, {
        files: opened.files,
        projectId: opened.projectId,
        name: projectName,
        diskRoot: opened.root || null,
      });
      resolvedStudio.files = opened.files;
      resolvedStudio.projectId = opened.projectId || resolvedStudio.projectId;
      resolvedStudio.name = projectName;
      resolvedStudio.diskRoot = opened.root || located.path;

      // "Open MyApp and summarize…". bind, then keep going into inspect/edit.
      const wantsFollowUp = isInspectAsk(intentText)
        || isExplainAsk(intentText)
        || /\b(summarize|how it works|flag any|issues you notice|tell me what)\b/i.test(intentText);
      if (wantsFollowUp) {
        // Fall through to studio inspect / agent turn with the bound workspace.
      } else {
        await finishPlainReply(
          `**Moving to ${projectName}**\n\n`
          + `Workspace set to \`${opened.root || located.path}\`.\n\n`
          + 'You can open files, edit code, install deps, or ask me to fix something in this project.',
        );
        return;
      }
    }

    // Projects / folder catalog. ONLY when the user is asking to list folders (never for create/build).
    if (
      (mode === 'general' || mode === 'code')
      && !isProjectCreateBrief(content)
      && !looksLikeConversationalPlanningAsk(content)
      && !wantsPlanningOnly(content)
      && !looksLikeInPlaceRebuildAsk(intentText)
      && !looksLikeProjectDebugAsk(content)
      && (looksLikeFolderCatalogAsk(content) || looksLikeProjectsInventoryAsk(content))
    ) {
      if (!hasFolderAccessGrant()) {
        await finishPlainReply(GRANT_OFF_FOLDER_MSG);
        return;
      }

      await syncWorkspaceGrantsFromPrefs();
      let targetPath: string | null = null;
      let displayName: string | null = null;
      let resolvedFromDesktop = false;

      const folderRef = resolveCatalogFolderRef(content);
      if (folderRef) {
        const located = await resolveScopedFolderPath(folderRef);
        if (located.ok && located.path) {
          targetPath = located.path;
          displayName = located.matchedName || folderRef.name;
          resolvedFromDesktop = true;
          setLastListedFolder(activeChatId, { path: located.path, name: displayName });
        } else if (!looksLikeProjectsInventoryAsk(content)) {
          await finishPlainReply(located.error || 'Could not find that folder.');
          return;
        }
      }

      if (!targetPath && looksLikeProjectsInventoryAsk(content)) {
        const roots = await window.arkDesktop?.browseRoots?.();
        const desktopPath = roots?.roots?.find(r => r.id === 'desktop')?.path || null;
        if (desktopPath) {
          targetPath = desktopPath;
          displayName = 'Desktop';
          resolvedFromDesktop = true;
        }
      }

      if (!targetPath) {
        await finishPlainReply(
          hasFolderAccessGrant()
            ? 'Could not find that folder on your Desktop. Check the name in File Explorer.'
            : GRANT_OFF_FOLDER_MSG,
        );
        return;
      }

      setPendingAttaches([]);

      await runFolderCatalog({
        targetPath,
        displayName: displayName || 'folder',
        resolvedFromDesktop,
      });
      return;
    }

    // PC explore. games, desktop top-level, installed apps (never for create/build apps).
    if (
      (mode === 'general' || mode === 'code')
      && !isProjectCreateBrief(content)
      && !looksLikeConversationalPlanningAsk(content)
      && !wantsPlanningOnly(content)
      && looksLikePcExploreAsk(content)
      && !looksLikeFolderCatalogAsk(content)
      && !looksLikeProjectsInventoryAsk(content)
    ) {
      if (!hasFolderAccessGrant()) {
        await finishPlainReply(GRANT_OFF_FOLDER_MSG);
        return;
      }
      await runPcExplore(content);
      return;
    }

    // New project create. scaffold on disk, bind workspace (BEFORE explore/catalog false positives).
    const workspaceActiveForCreate = hasActiveWorkspace({
      files: resolvedStudio.files,
      projectId: resolvedStudio.projectId || chatStudioProjectIdRef.current,
      diskRoot: resolvedStudio.diskRoot || chatStudioDiskRootRef.current,
    });
    const pendingGreenfieldRaw = getLastPendingGreenfield(activeChatId);
    const pendingGreenfield = pendingGreenfieldRaw
      ? {
          name: pendingGreenfieldRaw.name,
          slug: pendingGreenfieldRaw.slug,
          kind: pendingGreenfieldRaw.kind as ProjectKind,
          summary: pendingGreenfieldRaw.summary,
          problemLine: pendingGreenfieldRaw.problemLine,
        }
      : null;
    const createIntentRaw = resolveCreateIntentFromThread(
      content,
      messagesRef.current.filter(m => m.role === 'user').map(m => String(m.content || '')),
      { workspaceActive: workspaceActiveForCreate, pendingGreenfield },
    ) || (
      looksLikeImplementGo(content)
        ? (() => {
            const userLines = messagesRef.current.filter(m => m.role === 'user').map(m => String(m.content || ''));
            const brief = findBestProductBrief(userLines) || recoverOriginalUserBrief(messagesRef.current);
            if (!brief) return null;
            const idea = parseGreenfieldIdea(brief);
            const named = (
              extractProjectName(content)
              || content.match(/\bcall(?:ed)?\s+it\s+([A-Za-z][A-Za-z0-9_-]{1,40})\b/i)?.[1]
              || content.match(/\bleaning\s+([A-Za-z][A-Za-z0-9_-]{1,40})\s+as\s+the\s+name\b/i)?.[1]
              || extractGreenfieldName(content)
              || idea?.name
              || brief.match(/\bleaning\s+([A-Za-z][A-Za-z0-9_-]{1,40})\s+as\s+the\s+name\b/i)?.[1]
              || brief.match(/\bcall(?:ed)?\s+it\s+([A-Za-z][A-Za-z0-9_-]{1,40})\b/i)?.[1]
              || brief.match(/\b(?:called|named)\s+["']?([A-Z][A-Za-z0-9_-]{1,40})/i)?.[1]
              || brief.match(/\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/)?.[1]
              || 'My App'
            );
            return {
              name: named,
              slug: slugifyProjectName(named),
              kind: resolveProjectKindForCreate(brief, detectProjectKind(brief), detectProjectKind(brief)),
              summary: brief,
              preferPlan: false,
            };
          })()
        : null
    ) || (
      // Last safety net: human “build/create X on disk” must never fall through to chatty planning.
      (/\bon\s+disk\b/i.test(content) && /\b(?:build|create|scaffold)\b/i.test(content))
        ? (() => {
            const userLines = messagesRef.current.filter(m => m.role === 'user').map(m => String(m.content || ''));
            const brief = findBestProductBrief(userLines)
              || recoverOriginalUserBrief(messagesRef.current)
              || pendingGreenfield?.summary
              || content;
            const named = (
              extractProjectName(content)
              || extractGreenfieldName(content)
              || pendingGreenfield?.name
              || extractGreenfieldName(brief)
              || brief.match(/\b(?:called|named)\s+["']?([A-Z][A-Za-z0-9_-]{1,40})/i)?.[1]
              || brief.match(/\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/)?.[1]
              || 'New App'
            );
            if (!named || /^(My App|New App|App)$/i.test(named) && !/\bon\s+disk\b/i.test(content)) return null;
            return {
              name: named,
              slug: slugifyProjectName(named),
              kind: resolveProjectKindForCreate(brief, detectProjectKind(brief), detectProjectKind(brief)),
              summary: brief,
              preferPlan: false,
            };
          })()
        : null
    );
    const renameFromAsk = content.match(/\bcall(?:ed)?\s+it\s+([A-Za-z][A-Za-z0-9_-]{1,40})\b/i)?.[1]
      || content.match(/\bleaning\s+([A-Za-z][A-Za-z0-9_-]{1,40})\s+as\s+the\s+name\b/i)?.[1]
      || extractGreenfieldName(content)
      || messagesRef.current
        .filter(m => m.role === 'user')
        .map(m => extractGreenfieldName(String(m.content || '')))
        .filter(Boolean)
        .slice(-1)[0]
      || null;
    let createIntent = createIntentRaw && renameFromAsk && !/^(My App|New App|App)$/i.test(renameFromAsk)
      ? {
          ...createIntentRaw,
          name: renameFromAsk,
          slug: slugifyProjectName(renameFromAsk),
          // Prefer the go-message text when it carries the product spec (TradeRail tabs, etc.).
          summary: content.length > 40 ? `${content}\n\n${createIntentRaw.summary}` : createIntentRaw.summary,
        }
      : createIntentRaw;
    const classifiedBound = classifyTurn(content, {
      diskRoot: chatStudioDiskRootRef.current || chatStudioDiskRoot,
      files: chatStudioFilesRef.current,
      projectId: chatStudioProjectIdRef.current,
      chatId: activeChatId,
    });
    // Sovereign create/plan: handlers own the bodies (Sprint A).
    if (classifiedBound.kind === 'plan' && (mode === 'general' || mode === 'code')) {
      const pendingPlan = getLastPendingGreenfield(activeChatId);
      const planName = createIntent?.name || pendingPlan?.name || extractProjectName(content) || 'your idea';
      if (createIntent) {
        setLastPendingGreenfield(activeChatId, {
          name: createIntent.name,
          slug: createIntent.slug,
          kind: resolveProjectKindForCreate(createIntent.summary, createIntent.kind, createIntent.kind),
          summary: createIntent.summary,
          problemLine: `Build ${createIntent.name} from your brief.`,
        });
        renameChat(activeChatId, cleanProductTitle(createIntent.name));
      }
      await finishPlainReply(handlePlanTurnReply({
        name: planName,
        summary: createIntent?.summary || pendingPlan?.summary || content,
        savePlanBrief: ({ name, summary }) => {
          setLastPendingGreenfield(activeChatId, {
            name,
            slug: slugifyProjectName(name),
            kind: resolveProjectKindForCreate(summary, 'vite-react', 'vite-react'),
            summary,
            problemLine: `Build ${name} from your brief.`,
          });
          renameChat(activeChatId, cleanProductTitle(name));
        },
      }));
      return;
    }
    // Duplicate create path retired — early dispatchOwnedTurn owns create (v0.1.217).

    // PC read file. AFTER create/greenfield so build briefs never become "open SignalDesk.txt".
    // Use pendingAttaches here — `attaches` only exists in handleSend and threw ReferenceError,
    // which aborted sendMessage after Thinking… and left the reply stuck forever.
    const hasAttachContext = pendingAttaches.length > 0
      || /<!--ark-attach:/.test(content)
      || /<!--ark-auto-read-->/.test(content);
    if (
      (mode === 'general' || mode === 'code')
      && hasFolderAccessGrant()
      && !hasAttachContext
      && looksLikeReadFileAsk(content)
    ) {
      await syncWorkspaceGrantsFromPrefs();
      const parsed = parseReadFileTarget(content);
      const readOutcome = await handleReadFileChatRequest({
        fileName: parsed.fileName,
        parentHint: parsed.parentHint,
        workspaceDiskRoot: diskRoot,
        stickyTarget: stickyDiskTarget,
        lastListedFolder: getLastListedFolder(activeChatId),
      });
      await finishPlainReply(readOutcome.text);
      return;
    }

    // STEP 1: Natural-language folder open (handler).
    if (mode === 'general' || mode === 'code') {
      const openOutcome = await runOpenFolderTurn({
        content,
        chatId: activeChatId,
        mode,
        assistantId,
        userId: user?.id || 'guest-local',
        workspaceFileCount: Object.keys(resolvedStudio.files).length,
        finishPlainReply,
        syncGrants: syncWorkspaceGrantsFromPrefs,
        resolveScopedFolderPath,
        openFolderInChat,
        formatFolderLocatedMessage,
        clearGenerating: clearGeneratingIfMineEarly,
        onOpened: ({ files, projectId, name, root, locateNote }) => {
          resolvedStudio.files = files;
          resolvedStudio.projectId = projectId || resolvedStudio.projectId;
          resolvedStudio.name = name;
          chatStudioFilesRef.current = files;
          setChatStudioFiles(files);
          if (projectId) {
            chatStudioProjectIdRef.current = projectId;
            setChatStudioProjectId(projectId);
          }
          if (root) setChatStudioDiskRoot(root);
          persistStudioSnapshot(activeChatId, {
            files,
            projectId: projectId || null,
            name,
            diskRoot: root || null,
          });
          if (locateNote) lastFolderLocateNoteRef.current = locateNote;
        },
        waitUntilBound: async (root) => {
          for (let i = 0; i < 20; i++) {
            if (chatStudioDiskRootRef.current === root) return true;
            await new Promise((r) => window.setTimeout(r, 25));
          }
          return chatStudioDiskRootRef.current === root;
        },
      });
      if (openOutcome.status === 'handled') return;
    }

    // STEP 1b: Folder by name. default to catalog when we parsed a folder name.
    if (
      (mode === 'general' || mode === 'code')
      && Object.keys(resolvedStudio.files).length === 0
      && parseFolderPathAsk(content)
      && looksLikeFolderPathAsk(content)
      && !shouldFullImportFolderAsk(content)
      && !looksLikePcExploreAsk(content)
      && !looksLikeProjectDebugAsk(content)
    ) {
      if (!hasFolderAccessGrant()) {
        await finishPlainReply(GRANT_OFF_FOLDER_MSG);
        return;
      }

      const folderRef = parseFolderPathAsk(content)!;

      await syncWorkspaceGrantsFromPrefs();
      const located = await resolveScopedFolderPath(folderRef);
      if (!located.ok || !located.path) {
        await finishPlainReply(located.error || 'Could not find that folder.');
        return;
      }

      await runFolderCatalog({
        targetPath: located.path,
        displayName: located.matchedName || folderRef.name,
        resolvedFromDesktop: true,
      });
      return;
    }

    const studioFileKeys = Object.keys(resolvedStudio.files);
    const hasPackageJson = studioFileKeys.some(k => /(^|\/)package\.json$/i.test(k));
    const workspaceProjectId = resolvedStudio.projectId || chatStudioProjectIdRef.current;
    const workspaceLabel = resolvedStudio.name
      || loadRecentProjects().find(p => p.id === workspaceProjectId)?.name
      || loadChatStudio(activeChatId)?.name
      || 'Attached project';
    const workspaceActive = hasActiveWorkspace({
      files: resolvedStudio.files,
      projectId: workspaceProjectId,
      diskRoot: chatStudioDiskRootRef.current
        || chatStudioDiskRoot
        || resolvedStudio.diskRoot
        || loadChatStudio(activeChatId)?.diskRoot
        || readPendingStudioBind()?.diskRoot
        || null,
    });
    // B1: consume pending Open-folder bind before workspace gates fire.
    if (!workspaceActive && readPendingStudioBind()?.diskRoot) {
      const applied = consumePendingStudioBind({
        setDiskRoot: (root) => {
          chatStudioDiskRootRef.current = root;
          setChatStudioDiskRoot(root);
        },
        setFiles: (files) => {
          if (Object.keys(files).length) {
            setChatStudioFiles(files);
            chatStudioFilesRef.current = files;
            resolvedStudio.files = { ...resolvedStudio.files, ...files };
          }
        },
        setProjectId: (id) => { chatStudioProjectIdRef.current = id; },
      });
      if (applied.diskRoot) {
        resolvedStudio.diskRoot = applied.diskRoot;
      }
    }
    const workspaceActiveAfterPending = hasActiveWorkspace({
      files: resolvedStudio.files,
      projectId: workspaceProjectId || chatStudioProjectIdRef.current,
      diskRoot: chatStudioDiskRootRef.current
        || chatStudioDiskRoot
        || resolvedStudio.diskRoot
        || loadChatStudio(activeChatId)?.diskRoot
        || null,
    });
    if (!chatStudioDiskRootRef.current) {
      const recoveredRoot = resolvedStudio.diskRoot || loadChatStudio(activeChatId)?.diskRoot || null;
      if (recoveredRoot) {
        chatStudioDiskRootRef.current = recoveredRoot;
        setChatStudioDiskRoot(recoveredRoot);
        studioBoundChatIdRef.current = activeChatId;
      }
    }
    const turnComposerMode = composerModeFromContent(content) || composerMode;
    const agentCwd = chatStudioDiskRootRef.current
      || chatStudioDiskRoot
      || (workspaceProjectId
        ? await Promise.race([
          window.arkDesktop?.projectPath?.(workspaceProjectId).then(r => r?.root).catch(() => undefined),
          new Promise<undefined>((resolve) => { window.setTimeout(() => resolve(undefined), 2_500); }),
        ])
        : undefined);

    const finishAgentReply = (reply: string, provider = 'NOVA · agent') => {
      const apply = (finalReply: string, finalProvider: string) => {
        const elapsedMs = Date.now() - replyStartedAt;
        const safeText = redactArkSelfLeak(finalReply);
        const next = messagesRef.current.map(m => (
          m.id === assistantId
            ? { ...m, content: safeText, provider_used: finalProvider, elapsed_ms: elapsedMs }
            : m
        ));
        messagesRef.current = next;
        persistModeThread(mode, next, { chatId: activeChatId });
        setMessages(next);
        clearGeneratingIfMineEarly();
        endTurnAndFlush(mySeq);
      };

      if (/ARK_MCP:/i.test(reply)) {
        void runMcpAutoToolLoop(reply).then(loop => {
          apply(loop.text, loop.ran.length ? 'NOVA · mcp' : provider);
        }).catch(() => apply(reply, provider));
        return;
      }

      apply(reply, provider);
    };

    // Open / refresh the in-app Preview window (closable BrowserWindow. not system browser).
    // Never steal a create/build turn — "…and open Preview" must create first, not yellow-bind.
    if (
      (mode === 'general' || mode === 'code')
      && /\b(open|show|launch|start)\b[\s\S]{0,40}\b(preview|localhost|live\s+preview)\b/i.test(content)
      && !/\b(?:create|build|scaffold|make)\b/i.test(content)
      && !createIntent
    ) {
      const url = await openProjectPreview();
      finishAgentReply(
        url
          ? `Opened **Preview** in an NOVA window (\`${url}\`).\n\nIt stays open while you edit. file changes reload the window automatically.`
          : 'Bind a project first (create one or say **Lets work on …**), then open Preview.',
        'NOVA · preview',
      );
      return;
    }

    // Hands-free debug: problem + path → open project on disk, then inspect/fix (no separate "work on" step).
    if (
      (mode === 'general' || mode === 'code')
      && !looksLikeThreadSummaryAsk(content)
      && looksLikeProjectDebugAsk(content)
      && !hasActiveWorkspace({
        files: resolvedStudio.files,
        projectId: resolvedStudio.projectId || chatStudioProjectIdRef.current,
        diskRoot: resolvedStudio.diskRoot || chatStudioDiskRootRef.current,
      })
    ) {
      if (!hasFolderAccessGrant()) {
        await finishPlainReply(GRANT_OFF_FOLDER_MSG);
        return;
      }
      const debugTarget = parseProjectDebugTarget(content);
      if (!debugTarget) {
        await finishPlainReply(
          'Paste the project folder path (for example `C:\\Users\\you\\Desktop\\Projects\\MyApp`) and describe what is broken. I will open it, read the code, and help fix it.',
        );
        return;
      }
      await syncWorkspaceGrantsFromPrefs();
      let openPath: string | null = folderPathFromDebugTarget(debugTarget);
      if (!openPath && debugTarget.kind === 'folder') {
        const located = await resolveScopedFolderPath(debugTarget.folderRef);
        if (located.ok && located.path) openPath = located.path;
      }
      if (!openPath && debugTarget.kind === 'hint') {
        openPath = await resolveDiskParentPath({ parentHint: debugTarget.parentHint });
      }
      if (!openPath) {
        await finishPlainReply(
          'I could not find that folder. Paste the full path like `C:\\Users\\you\\Desktop\\Projects\\MyApp`, or say **Let\'s work on MyApp**.',
        );
        return;
      }
      const pathStat = await window.arkDesktop?.pathStat?.(openPath);
      if (pathStat?.ok && pathStat.isFile) {
        openPath = openPath.replace(/[/\\][^/\\]+$/, '');
      }
      if (await isArkProtectedPathOnDisk(openPath)) {
        await finishPlainReply(arkSelfHarmBlockedReply());
        return;
      }
      setMessages(prev => prev.map(m => (
        m.id === assistantId
          ? { ...m, content: '__generating__:chat:Opening project folder…' }
          : m
      )));
      const opened = await openFolderInChat(openPath);
      if (!opened.ok || !opened.files) {
        const err = opened.error && opened.error !== 'canceled'
          ? opened.error
          : 'Could not open that project folder.';
        await finishPlainReply(err);
        return;
      }
      resolvedStudio.files = opened.files;
      resolvedStudio.projectId = opened.projectId || resolvedStudio.projectId;
      resolvedStudio.name = opened.name || resolvedStudio.name;
      resolvedStudio.diskRoot = opened.root || resolvedStudio.diskRoot;
      setChatStudioFiles(opened.files);
      chatStudioFilesRef.current = opened.files;
      if (opened.projectId) {
        setChatStudioProjectId(opened.projectId);
        chatStudioProjectIdRef.current = opened.projectId;
      }
      if (opened.root) {
        setChatStudioDiskRoot(opened.root);
        chatStudioDiskRootRef.current = opened.root;
      }
      if (opened.name && !chatStudioDiskRootRef.current) renameChat(activeChatId, opened.name);
      // Warm dev server for Vite projects so Preview is one tap away after fixes.
      if (opened.root && isViteProject(opened.files)) {
        void ensureViteDevServer(opened.root).then(async (dev) => {
          if (dev.ok && dev.url) {
            setPreviewUrl(dev.url);
            persistStudioSnapshot(activeChatId, {
              files: opened.files || {},
              projectId: opened.projectId || chatStudioProjectIdRef.current,
              name: opened.name,
              diskRoot: opened.root,
              previewUrl: dev.url,
            });
            // Warm URL only — do not steal the preview window from another chat.
          }
        });
      }
      // Fall through to inspect / code-edit below with files bound.
    }

    // Capability asks ("can you edit files?", "what can you do?") — answer as NOVA, not a
    // generic programming tutorial from the local model.
    if (
      (mode === 'general' || mode === 'code')
      && looksLikeArkCapabilityAsk(content)
      && !looksLikeProjectDebugAsk(content)
      && !parseMcpCallIntent(content)
      && !looksLikeConversationalPlanningAsk(content)
      && !looksLikeGreenfieldIdea(content)
      && !wantsPlanningOnly(content)
    ) {
      finishAgentReply(
        formatArkCapabilitiesHelp({
          question: content,
          hasProject: Boolean(chatStudioProjectIdRef.current || chatStudioDiskRootRef.current),
          hasFolderAccess: true,
        }),
        'NOVA',
      );
      return;
    }

    // MCP inventory (local + registered servers from Settings → MCP).
    // (Handled early after soft greeting — kept here only if earlier path was skipped.)
    if (
      (mode === 'general' || mode === 'code')
      && /\b(mcp|model context protocol)\b/i.test(content)
      && /\b(what|how|list|show|tools|server|connect|setup|explain|register)\b/i.test(content)
      && !parseMcpCallIntent(content)
    ) {
      finishAgentReply(formatMcpToolsHelp(), 'NOVA · mcp');
      return;
    }

    // Explicit MCP tools/call: "run mcp tool read_graph" / "call mcp create_entities {…}"
    if (mode === 'general' || mode === 'code') {
      const mcpCall = parseMcpCallIntent(content);
      if (mcpCall) {
        const server = resolveMcpToolServer(mcpCall.toolName, mcpCall.serverId);
        if (!server) {
          finishAgentReply(
            `No enabled MCP server has tool **${mcpCall.toolName}**.\n\nAdd/enable a server in **Settings → MCP**, press **Test**, then try again.\n\n${formatMcpToolsHelp()}`,
            'NOVA · mcp',
          );
          return;
        }
        setMessages(prev => prev.map(m => (
          m.id === assistantId ? { ...m, content: `__generating__:chat:Calling ${mcpCall.toolName}…` } : m
        )));
        const res = await callMcpTool(server, mcpCall.toolName, mcpCall.args);
        if (res.ok) {
          finishAgentReply(
            `**${mcpCall.toolName}** (${server.name})\n\n\`\`\`\n${res.content || '(empty)'}\n\`\`\``,
            'NOVA · mcp',
          );
        } else {
          finishAgentReply(
            `**${mcpCall.toolName}** failed on **${server.name}**.\n\n${res.error || 'Unknown error'}`,
            'NOVA · mcp',
          );
        }
        return;
      }
    }

    // STEP 7: Clone into Chat workspace (no Code tab)
    if (
      (mode === 'general' || mode === 'code')
      && classifyGitAsk(content) === 'clone'
      && !workspaceActive
    ) {
      const ref = parseGithubRepoRef(content);
      if (!ref) {
        finishAgentReply('Say: **clone owner/repo**. example: *clone vercel/next.js*', 'NOVA');
        return;
      }
      const token = githubToken() || getPluginRuntime('github', loadPluginState()).token?.trim();
      const project = addRecent(ref.repo);
      setMessages(prev => prev.map(m => (
        m.id === assistantId ? { ...m, content: '__generating__:chat:Cloning…' } : m
      )));
      const cloned = await gitClone(project.id, githubCloneUrl(ref.owner, ref.repo), token || undefined);
      if (!cloned.ok) {
        finishAgentReply(cloned.error || 'Clone failed.', 'NOVA · git');
        return;
      }
      const read = await window.arkDesktop?.projectRead?.(project.id);
      if (read?.ok && read.files && Object.keys(read.files || {}).length) {
        resolvedStudio.files = read.files as Record<string, string>;
        resolvedStudio.projectId = project.id;
        resolvedStudio.name = ref.repo;
        setChatStudioFiles(resolvedStudio.files);
        chatStudioFilesRef.current = resolvedStudio.files;
        setChatStudioProjectId(project.id);
        chatStudioProjectIdRef.current = project.id;
        if (read.root) {
          setChatStudioDiskRoot(read.root);
          chatStudioDiskRootRef.current = read.root;
        }
        persistStudioSnapshot(activeChatId, {
          files: resolvedStudio.files,
          projectId: project.id,
          name: ref.repo,
          diskRoot: read.root || null,
        });
      }
      finishAgentReply(
        `Cloned **${ref.owner}/${ref.repo}** into this chat.${read?.root ? `\n\nWorkspace: \`${read.root}\`` : ''}`,
        'NOVA · git',
      );
      return;
    }

    const turnNeedsWorkspace = (
      chatTurnAllowsExec(content, turnComposerMode)
      || chatTurnAllowsFileEdits(content, turnComposerMode)
      || Boolean(classifyGitAsk(content))
    ) && !looksLikeFolderPathAsk(content)
      // Greenfield "lets go and start build" must create. never the open-folder wall.
      && !looksLikeImplementGo(content)
      && !looksLikeBuildStart(content)
      // Casual product brainstorming must stay in chat — never the workspace gate.
      && !looksLikeConversationalPlanningAsk(intentText)
      && !wantsPlanningOnly(intentText)
      && !looksLikeGreenfieldIdea(intentText)
      && !looksLikeGreenfieldKeepPlanning(intentText);

    if (turnNeedsWorkspace && !workspaceActiveAfterPending && (mode === 'general' || mode === 'code')) {
      // Create-shaped asks never hit the workspace wall — they create a folder.
      const classifiedHere = classifiedBound;
      if (classifiedHere.kind === 'create') {
        // Fall through: create Intent path above should have handled; if not, don't wall.
      } else if (classifiedHere.kind === 'edit' || classifiedHere.kind === 'keep_building') {
        await finishPlainReply(
          'No folder is bound yet.\n\nSay **build me a website called …** and I’ll create one, or use **+ → Open folder**.',
        );
        return;
      } else {
        finishAgentReply(NO_WORKSPACE_MSG, 'NOVA');
        return;
      }
    }

    // STEP 8: GitHub / git studio commands from Chat
    if (
      (mode === 'general' || mode === 'code')
      && workspaceProjectId
      && studioFileKeys.length
    ) {
      const studioCmd = await runCodeStudioCommand({
        message: content,
        projectId: workspaceProjectId,
        projectName: workspaceLabel,
        files: resolvedStudio.files,
      });
      if (studioCmd) {
        if (studioCmd.reload && window.arkDesktop?.projectRead) {
          const read = await window.arkDesktop.projectRead(workspaceProjectId);
          if (read?.ok && read.files && Object.keys(read.files || {}).length) {
            resolvedStudio.files = read.files as Record<string, string>;
            setChatStudioFiles(resolvedStudio.files);
            chatStudioFilesRef.current = resolvedStudio.files;
            if (read.root) {
              setChatStudioDiskRoot(read.root);
              chatStudioDiskRootRef.current = read.root;
            }
            persistStudioSnapshot(activeChatId, {
              files: resolvedStudio.files,
              projectId: workspaceProjectId,
              name: workspaceLabel,
              diskRoot: read.root || chatStudioDiskRootRef.current,
            });
          }
        }
        finishAgentReply(studioCmd.reply, 'NOVA · git');
        return;
      }
    }

    // STEP 4–5: Agent commands (handler).
    {
      const cmdOutcome = await runCmdTurn({
        content,
        mode,
        composerMode: turnComposerMode,
        agentCwd,
        hasPackageJson,
        assistantId,
        finishAgentReply,
        confirm: (message) => window.confirm(message),
        setRunningStatus: (label) => {
          setMessages(prev => prev.map(m => (
            m.id === assistantId
              ? { ...m, content: `__generating__:chat:${label}` }
              : m
          )));
        },
      });
      if (cmdOutcome.status === 'handled') return;
    }

    const stickyFiles = resolvedStudio.files;
    let stickyCount = Object.keys(stickyFiles).length;
    let diskBound = Boolean(chatStudioDiskRootRef.current || resolvedStudio.projectId || chatStudioProjectIdRef.current);
    let wantsCodeEdit = chatTurnAllowsFileEdits(content, turnComposerMode);
    if (!wantsCodeEdit && diskBound && looksLikeCodeEditAsk(content)) {
      wantsCodeEdit = true;
    }
    if (!wantsCodeEdit && diskBound && looksLikeProductCorrectionAsk(content)) {
      wantsCodeEdit = true;
    }
    if (!wantsCodeEdit && diskBound && parseAddCommentAsk(content)) {
      wantsCodeEdit = true;
    }
    // Hero / title / button micro-edits on a bound project always write disk.
    if (
      !wantsCodeEdit
      && diskBound
      && /\b(?:change|update|set|rename|edit|make)\b[\s\S]{0,100}\b(?:hero|headline|heading|title|h1|button|text|label|copy|wording)\b/i.test(content)
    ) {
      wantsCodeEdit = true;
    }
    // "Center words that say …" on a bound brown/blank screen — always write disk.
    if (
      !wantsCodeEdit
      && diskBound
      && (
        /\b(?:center|centred|middle)\b[\s\S]{0,48}\b(?:words?|text|phrase|wording)\b/i.test(content)
        || (/\b(?:words?|wording|phrase)\b/i.test(content) && /\b(?:says?|reading)\b/i.test(content))
      )
    ) {
      wantsCodeEdit = true;
    }
    // Bound folder + explicit apply/polish asks must always write disk (never chat-only).
    if (
      !wantsCodeEdit
      && diskBound
      && (
        /\bapply\b[\s\S]{0,80}\bon\s+disk\b/i.test(content)
        || /\b(?:edits?|changes?)\s+on\s+disk\b/i.test(content)
        || /\b(?:unread|badge|syncing|connect\s+bank|folder\s+groups?|find\s+in\s+note|tags?\s+chips?|feel\s+finished)\b/i.test(content)
      )
    ) {
      wantsCodeEdit = true;
    }

    // Heal disk binding before the studio gate — Recent reopen often shows pills with empty refs.
    if (
      wantsCodeEdit
      && !chatStudioDiskRootRef.current
      && activeChatId
    ) {
      try {
        const chatTitle = (
          chats.find(c => c.id === activeChatId)?.title
          || resolvedStudio.name
          || ''
        ).trim();
        const healed = await resolveChatProjectRoot({ chatId: activeChatId, chatTitle });
        if (healed.diskRoot) {
          setChatStudioDiskRoot(healed.diskRoot);
          chatStudioDiskRootRef.current = healed.diskRoot;
          resolvedStudio.diskRoot = healed.diskRoot;
          if (healed.name) resolvedStudio.name = healed.name;
          if (healed.projectId) {
            resolvedStudio.projectId = healed.projectId;
            setChatStudioProjectId(healed.projectId);
            chatStudioProjectIdRef.current = healed.projectId;
          }
          if (Object.keys(healed.files || {}).length) {
            Object.assign(stickyFiles, healed.files);
            stickyCount = Object.keys(stickyFiles).length;
            setChatStudioFiles({ ...stickyFiles });
            chatStudioFilesRef.current = { ...stickyFiles };
            resolvedStudio.files = stickyFiles;
          }
          diskBound = true;
          persistStudioSnapshot(activeChatId, {
            files: stickyFiles,
            projectId: healed.projectId || resolvedStudio.projectId,
            name: healed.name || chatTitle || undefined,
            diskRoot: healed.diskRoot,
          });
        }
      } catch {
        /* keep going */
      }
    }

    // Reload files from disk/project if sticky is empty but a workspace is bound.
    // Path-bound folders start empty on purpose — hydrate only what this turn needs.
    if (stickyCount === 0 && diskBound && (wantsCodeEdit || turnComposerMode === 'agent' || turnComposerMode === 'debug'
      || shouldRunAgentLoop({ composerMode: turnComposerMode, hasWorkspace: true, message: content }))) {
      const diskRoot = chatStudioDiskRootRef.current;
      if (diskRoot && window.arkDesktop?.readTextFile) {
        const rels = [
          'src/App.jsx', 'src/App.tsx', 'src/App.css', 'src/index.css',
          'index.html', 'static/index.html', 'public/index.html',
          'css/styles.css', 'js/app.js', 'package.json',
          'app/main.py', 'main.py', 'README.md',
        ];
        const mentioned = String(content || '')
          .match(/\b(?:[\w.-]+\/)+[\w.-]+\.[a-z0-9]{1,8}\b/gi) || [];
        for (const m of mentioned) {
          const norm = m.replace(/\\/g, '/');
          if (!rels.includes(norm)) rels.push(norm);
        }
        const sep = diskRoot.includes('\\') ? '\\' : '/';
        const loaded: Record<string, string> = {};
        for (const rel of rels) {
          try {
            const abs = `${diskRoot.replace(/[/\\]+$/, '')}${sep}${rel.replace(/\//g, sep)}`;
            const read = await window.arkDesktop.readTextFile({ path: abs });
            if (read?.ok && typeof read.text === 'string') loaded[rel] = read.text;
          } catch {
            /* ignore missing */
          }
        }
        if (Object.keys(loaded).length) {
          Object.assign(stickyFiles, loaded);
          stickyCount = Object.keys(stickyFiles).length;
          setChatStudioFiles({ ...stickyFiles });
          chatStudioFilesRef.current = { ...stickyFiles };
          resolvedStudio.files = stickyFiles;
        }
      }
      // Full projectRead only when light hydrate found nothing (avoid dumping 28+ files into context).
      if (stickyCount === 0) {
        const pid = resolvedStudio.projectId || chatStudioProjectIdRef.current;
        if (pid && window.arkDesktop?.projectRead) {
          try {
            const read = await window.arkDesktop.projectRead(pid);
            if (read?.ok && read.files && Object.keys(read.files).length) {
              Object.assign(stickyFiles, read.files as Record<string, string>);
              stickyCount = Object.keys(stickyFiles).length;
              setChatStudioFiles({ ...stickyFiles });
              chatStudioFilesRef.current = { ...stickyFiles };
              resolvedStudio.files = stickyFiles;
            }
          } catch {
            /* ignore */
          }
        }
      }
    }

    const visionReady = await hasVisionCapability();

    if (
      messageHasImages(content)
      && looksLikeUseAttachedAsset(content)
      && (chatStudioDiskRootRef.current || resolvedStudio.diskRoot)
    ) {
      const diskRoot = chatStudioDiskRootRef.current || resolvedStudio.diskRoot || '';
      const placed = await applyAttachedChatImagesAsAssets({
        diskRoot,
        files: stickyFiles,
        message: content,
      });
      if (placed.ok) {
        setChatStudioFiles({ ...placed.files });
        chatStudioFilesRef.current = { ...placed.files };
        commitStudioForChat(activeChatId, {
          files: placed.files,
          projectId: resolvedStudio.projectId || chatStudioProjectIdRef.current,
          name: resolvedStudio.name,
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
        return;
      }
    }

    // Link-only asset asks on a bound project (Iconify / Unsplash / “professional icons”).
    if (
      (chatStudioDiskRootRef.current || resolvedStudio.diskRoot)
      && looksLikeAssetLinkAsk(content)
      && !messageHasImages(content)
    ) {
      const diskRoot = chatStudioDiskRootRef.current || resolvedStudio.diskRoot || '';
      pushAssistantStatus('Importing icons and images…');
      try {
        const plan = planBrandAssets(
          content,
          resolvedStudio.name || 'project',
        );
        const installed = await materializeBrandAssets({
          diskRoot,
          files: stickyFiles,
          plan,
          brief: content,
          projectName: resolvedStudio.name || 'project',
        });
        if (installed.saved.length) {
          setChatStudioFiles({ ...installed.files });
          chatStudioFilesRef.current = { ...installed.files };
          commitStudioForChat(activeChatId, {
            files: installed.files,
            projectId: resolvedStudio.projectId || chatStudioProjectIdRef.current,
            name: resolvedStudio.name,
            diskRoot,
          });
          await finishPlainReply(
            `${installed.note}\n\nOpen **Preview** to review. Paste more links or say which icons to swap.`,
          );
          return;
        }
      } catch {
        /* fall through */
      }
    }

    // Multi-model: image attached but nothing can see pixels → clear CTA.
    if (messageHasImages(content) && !visionReady) {
      const gap = visionCapabilityGapReply({
        localOnly: getLocalPrefs().aiMode === 'local_only',
      });
      await finishPlainReply(gap);
      return;
    }

    // Vision → coder hop when a screenshot + fix ask hits a bound project.
    let editUserMessage = content;
    let visionHopMeta: string | undefined;
    if (
      messageHasImages(content)
      && visionReady
      && (wantsCodeEdit || looksLikeScreenshotFixAsk(content))
      && (stickyCount > 0 || diskBound)
    ) {
      setMessages(prev => prev.map(m => (
        m.id === assistantId
          ? { ...m, content: `__generating__:chat:${multiModelStatusLabel('vision')}` }
          : m
      )));
      const visionHistory = buildRouterHistory([], content, extractVisionImages(content));
      const hop = await runVisionDescribeHop({
        userMessage: content,
        history: visionHistory,
      });
      if (await stopIfSuperseded()) return;
      if (hop.ok && hop.notes) {
        editUserMessage = composeVisionToCoderBrief(hop.notes, content);
        visionHopMeta = hop.providerLabel;
        setMessages(prev => prev.map(m => (
          m.id === assistantId
            ? {
              ...m,
              content: `__generating__:chat:${formatHybridAttribution([
                { role: 'vision', name: hop.providerLabel || 'Vision' },
                { role: 'code', name: 'Coder' },
              ])}`,
            }
            : m
        )));
      }
    }

    if (
      (mode === 'general' || mode === 'code')
      && (stickyCount > 0 || diskBound)
      && (
        wantsCodeEdit
        || shouldRunAgentLoop({
          composerMode: turnComposerMode,
          hasWorkspace: diskBound || stickyCount > 0,
          message: content,
        })
        || shouldInspectInChat(content, stickyCount > 0 || diskBound, content.startsWith(COMPOSER_MODE_PREFIX.debug))
      )
    ) {
      setMessages(prev => prev.map(m => (
        m.id === assistantId
          ? { ...m, content: `__generating__:chat:${wantsCodeEdit ? (visionHopMeta ? multiModelStatusLabel('coder') : 'Updating project files…') : `Reading ${stickyCount || 'project'} file${stickyCount === 1 ? '' : 's'}…`}` }
          : m
      )));
      await new Promise<void>(r => { window.setTimeout(r, 40); });
      if (await stopIfSuperseded()) return;

      const projectLabel = studioPathBasename(chatStudioDiskRootRef.current || '')
        || resolvedStudio.name
        || loadRecentProjects().find(p => p.id === resolvedStudio.projectId)?.name
        || 'Project';
      const sticky = pinnedModel.source === 'auto' ? threadBrainRef.current : null;

      const planTurn = isChatPlanTurn(content) && !looksLikeImplementGo(content);
      const allowEdits = wantsCodeEdit;

      // Heal missing diskRoot from this chat's title (Recent reopen often has pills but empty refs).
      if (allowEdits && !chatStudioDiskRootRef.current && activeChatId) {
        try {
          const chatTitle = (
            chats.find(c => c.id === activeChatId)?.title
            || projectLabel
            || ''
          ).trim();
          const healed = await resolveChatProjectRoot({ chatId: activeChatId, chatTitle });
          if (healed.diskRoot) {
            setChatStudioDiskRoot(healed.diskRoot);
            chatStudioDiskRootRef.current = healed.diskRoot;
            resolvedStudio.diskRoot = healed.diskRoot;
            if (healed.name) resolvedStudio.name = healed.name;
            if (Object.keys(healed.files || {}).length) {
              Object.assign(stickyFiles, healed.files);
              stickyCount = Object.keys(stickyFiles).length;
              setChatStudioFiles({ ...stickyFiles });
              chatStudioFilesRef.current = { ...stickyFiles };
              resolvedStudio.files = stickyFiles;
            }
            persistStudioSnapshot(activeChatId, {
              files: stickyFiles,
              projectId: workspaceProjectId || healed.projectId,
              name: healed.name || projectLabel,
              diskRoot: healed.diskRoot,
            });
          }
        } catch {
          /* keep going */
        }
      }

      // Deterministic comment edits with Cursor-style live progress (no full-repo pack).
      if (allowEdits && (workspaceProjectId || chatStudioDiskRootRef.current)) {
        const quick = parseAddCommentAsk(editUserMessage);
        if (quick && chatStudioDiskRootRef.current && window.arkDesktop?.readTextFile && window.arkDesktop?.workspaceWriteFile) {
          const root = chatStudioDiskRootRef.current;
          const sep = root.includes('\\') ? '\\' : '/';
          const absOf = (rel: string) => `${root.replace(/[/\\]+$/, '')}${sep}${rel.replace(/\//g, sep)}`;
          const startedAt = replyStartedAt;
          const steps: AgentTraceStep[] = [{
            id: nextTraceStepId([]),
            kind: 'thought',
            label: traceThoughtFromAsk(editUserMessage),
          }];
          const pushTrace = (patch: Partial<AgentTracePayload>) => {
            const payload: AgentTracePayload = {
              startedAt,
              done: Boolean(patch.done),
              steps: patch.steps || steps,
              answer: patch.answer || '',
              changedPaths: patch.changedPaths,
              fileChanges: patch.fileChanges,
              canContinue: patch.canContinue,
            };
            const encoded = encodeTraceMessage(payload);
            setMessages(prev => prev.map(m => (m.id === assistantId ? { ...m, content: encoded } : m)));
          };
          const wait = (ms: number) => new Promise<void>(r => window.setTimeout(r, ms));

          try {
            // Let the Thought line tick for a beat before file work (Cursor-style pacing).
            pushTrace({ steps: [...steps] });
            await wait(1600);
            steps.push({ id: nextTraceStepId(steps), kind: 'status', label: 'Reading the bound project…' });
            pushTrace({ steps: [...steps] });
            await wait(500);

            const targets: string[] = [quick.path];
            const wantUi = wantsVisiblePreviewMarker(editUserMessage)
              || /\btell me which file\b/i.test(editUserMessage);
            if (wantUi && !/^static\/index\.html$/i.test(quick.path)) {
              const uiProbe = await window.arkDesktop.readTextFile({ path: absOf('static/index.html') });
              if (uiProbe?.ok && typeof uiProbe.text === 'string') targets.push('static/index.html');
            }

            const fileChanges: AgentFileChange[] = [];
            const wrotePaths: string[] = [];
            const nextFiles = { ...stickyFiles };

            for (const rel of targets) {
              steps.push({ id: nextTraceStepId(steps), kind: 'read', label: rel });
              pushTrace({ steps: [...steps] });
              await wait(350);

              const read = await window.arkDesktop.readTextFile({ path: absOf(rel) });
              if (!read?.ok || typeof read.text !== 'string') {
                if (rel === quick.path) {
                  finishAgentReply(`Could not read **${rel}**.`, 'NOVA · edit');
                  return;
                }
                continue;
              }

              const before = read.text;
              const after = rel === quick.path
                ? applyLineComment(before, quick.comment, rel)
                : applyVisibleHtmlMarker(before, quick.comment);

              if (after === before) {
                steps.push({
                  id: nextTraceStepId(steps),
                  kind: 'status',
                  label: `${rel} already has that marker`,
                });
                pushTrace({ steps: [...steps] });
                continue;
              }

              steps.push({ id: nextTraceStepId(steps), kind: 'write', label: rel });
              pushTrace({ steps: [...steps] });
              await wait(400);

              const written = await window.arkDesktop.workspaceWriteFile({
                targetPath: absOf(rel),
                content: after,
              });
              if (!written?.ok) {
                finishAgentReply(
                  `Could not write **${rel}**: ${written?.error || 'write failed'}.`,
                  'NOVA · edit',
                );
                return;
              }

              const diff = countLineDiff(before, after);
              fileChanges.push({ path: rel, added: diff.added, removed: diff.removed });
              wrotePaths.push(rel);
              nextFiles[rel] = after;
            }

            if (!wrotePaths.length) {
              const payload: AgentTracePayload = {
                startedAt,
                done: true,
                steps: [
                  ...steps,
                  { id: nextTraceStepId(steps), kind: 'status', label: 'No file changes needed' },
                ],
                answer: `**${quick.path}** already has that comment.`,
                changedPaths: [],
                fileChanges: [],
              };
              setTokenRatio(syncTokenUsage(activeChatId, estimateTokens(editUserMessage) + 40));
              finishAgentReply(encodeTraceMessage(payload), 'NOVA · edit');
              return;
            }

            setChatStudioFiles(nextFiles);
            chatStudioFilesRef.current = nextFiles;
            resolvedStudio.files = nextFiles;
            setChatCodePill(activeChatId, true);
            setCodePillSticky(true);
            persistStudioSnapshot(activeChatId, {
              files: nextFiles,
              projectId: workspaceProjectId,
              name: projectLabel,
              diskRoot: root,
            });
            if (wrotePaths.includes('static/index.html')) {
              void pushLivePreview(nextFiles, false);
            }

            const addSum = fileChanges.reduce((n, f) => n + f.added, 0);
            const delSum = fileChanges.reduce((n, f) => n + f.removed, 0);
            const elapsedMs = Date.now() - startedAt;
            steps.push({
              id: nextTraceStepId(steps),
              kind: 'status',
              label: `Edited ${wrotePaths.length} file${wrotePaths.length === 1 ? '' : 's'} · +${addSum} −${delSum}`,
            });
            steps.push({
              id: nextTraceStepId(steps),
              kind: 'status',
              label: `Worked for ${Math.max(1, Math.round(elapsedMs / 1000))}s`,
            });
            const uiTouched = wrotePaths.includes('static/index.html');
            const answer = uiTouched
              ? `I added \`${quick.comment}\` in **${quick.path}** and surfaced the same marker on the dashboard so **Localhost / Preview** shows it.`
              : `I added \`${quick.comment}\` at the top of **${quick.path}**. Open **Code** to inspect the source — Localhost shows the running UI, not Python comments.`;

            const payload: AgentTracePayload = {
              startedAt,
              done: true,
              steps: [...steps],
              answer,
              changedPaths: wrotePaths,
              fileChanges,
            };
            setTokenRatio(syncTokenUsage(activeChatId, estimateTokens(editUserMessage) + 80 + addSum * 4));
            await wait(250);
            finishAgentReply(encodeTraceMessage(payload), 'NOVA · edit');
            return;
          } catch (err) {
            finishAgentReply(
              `Could not edit **${quick.path}**: ${err instanceof Error ? err.message : 'read/write failed'}.`,
              'NOVA · edit',
            );
            return;
          }
        }
      }

      // Fast path: deterministic UI patches. run BEFORE agent loop so title/button asks apply on disk.
      // diskRoot alone is enough — projectId may be missing after Recent reopen.
      if (allowEdits && (workspaceProjectId || chatStudioDiskRootRef.current || stickyCount > 0)) {
        if (!chatStudioDiskRootRef.current && activeChatId) {
          try {
            const chatTitle = (
              chats.find(c => c.id === activeChatId)?.title
              || projectLabel
              || ''
            ).trim();
            const healed = await resolveChatProjectRoot({ chatId: activeChatId, chatTitle });
            if (healed.diskRoot) {
              setChatStudioDiskRoot(healed.diskRoot);
              chatStudioDiskRootRef.current = healed.diskRoot;
            }
          } catch {
            /* ignore */
          }
        }
        if (chatStudioDiskRootRef.current && window.arkDesktop?.readTextFile) {
          const diskRoot = chatStudioDiskRootRef.current;
          try {
            const loaded = await loadPreviewFilesFromDisk(diskRoot);
            if (Object.keys(loaded).length) {
              Object.assign(stickyFiles, loaded);
              stickyCount = Object.keys(stickyFiles).length;
              setChatStudioFiles({ ...stickyFiles });
              chatStudioFilesRef.current = { ...stickyFiles };
              resolvedStudio.files = stickyFiles;
            }
          } catch {
            const rels = [
              'src/App.jsx', 'src/App.tsx', 'src/App.css', 'src/index.css',
              'index.html', 'css/styles.css', 'js/app.js', 'package.json',
            ];
            const sep = diskRoot.includes('\\') ? '\\' : '/';
            const loaded: Record<string, string> = {};
            for (const rel of rels) {
              try {
                const abs = `${diskRoot.replace(/[/\\]+$/, '')}${sep}${rel.replace(/\//g, sep)}`;
                const read = await window.arkDesktop.readTextFile({ path: abs });
                if (read?.ok && typeof read.text === 'string') loaded[rel] = read.text;
              } catch { /* missing */ }
            }
            if (Object.keys(loaded).length) {
              Object.assign(stickyFiles, loaded);
              stickyCount = Object.keys(stickyFiles).length;
              setChatStudioFiles({ ...stickyFiles });
              chatStudioFilesRef.current = { ...stickyFiles };
              resolvedStudio.files = stickyFiles;
            }
          }
        }
        const surgical = await runEditTurn({
          content,
          editUserMessage,
          projectId: workspaceProjectId,
          projectLabel,
          diskRoot: chatStudioDiskRootRef.current,
          files: stickyFiles,
          replyStartedAt,
          visionHopMeta,
          modelId: pinnedModel.id,
          modelName: pinnedModel.name,
          pushStatus: pushAssistantStatus,
          countLineDiff,
          buildStudioTraceMessage,
onApplied: ({ files, updated, reply, provider, elapsedMs }) => {
            pushApplySnapshot({
              chatId: activeChatId,
              assistantId,
              diskRoot: chatStudioDiskRootRef.current,
              files: { ...stickyFiles },
              updatedPaths: updated || [],
              at: Date.now(),
            });
            setChatStudioFiles(files);
            chatStudioFilesRef.current = files;
            resolvedStudio.files = files;
            Object.keys(stickyFiles).forEach((k) => { delete stickyFiles[k]; });
            Object.assign(stickyFiles, files);
            stickyCount = Object.keys(files).length;
            setChatCodePill(activeChatId, true);
            setCodePillSticky(true);
            persistStudioSnapshot(activeChatId, {
              files,
              projectId: workspaceProjectId,
              name: projectLabel,
              diskRoot: chatStudioDiskRootRef.current,
            });
            void pushLivePreview(files, false);
            const next = messagesRef.current.map(m => (
              m.id === assistantId
                ? { ...m, content: reply, provider_used: provider, elapsed_ms: elapsedMs }
                : m
            ));
            messagesRef.current = next;
            persistModeThread(mode, next, { chatId: activeChatId });
            setMessages(next);
            clearGeneratingIfMineEarly();
            lastInspectReplyRef.current = reply;
            window.setTimeout(() => {
              if (mySeq === genSeqRef.current) flushQueuedSend();
            }, 0);
          },
          onFailed: ({ reply, elapsedMs }) => {
            const failNext = messagesRef.current.map(m => (
              m.id === assistantId
                ? { ...m, content: reply, provider_used: 'NOVA · local patch', elapsed_ms: elapsedMs }
                : m
            ));
            messagesRef.current = failNext;
            persistModeThread(mode, failNext, { chatId: activeChatId });
            setMessages(failNext);
            clearGeneratingIfMineEarly();
          },
        });
        // Edit owner finished — do not fall through to a second long answerStudio.
        if (surgical.status !== 'miss') return;
        await finishPlainReply(
          'Could not apply that edit with a reliable patch. Try a clearer one-line ask, or pin a larger coder in Models.',
          'NOVA · edit',
        );
        return;
      }

      // Multi-agent: Design → Code → Verify (+ → Multi-agent, or explicit ask).
      if (
        allowEdits
        && (workspaceProjectId || chatStudioDiskRootRef.current)
        && wantsMultiAgentTurn(content, turnComposerMode === 'multitask')
        && stickyCount > 0
        && (await (async () => {
          const { getBrainProfile, assertMultiModelAllowed } = await import('@/lib/brainProfile');
          const { getLocalPrefs } = await import('@/lib/localPrefs');
          if (!getLocalPrefs().multiModelCreate && turnComposerMode !== 'multitask') return false;
          return assertMultiModelAllowed(await getBrainProfile()).ok;
        })())
      ) {
        setChatTurnStatus({
          chatId: activeChatId,
          assistantId,
          label: 'Multi-agent: Design → Code → Verify…',
        });
        const multi = await runProjectMultiAgent({
          brief: editUserMessage,
          files: stickyFiles,
          projectId: workspaceProjectId || resolvedStudio.projectId || activeChatId || 'chat-project',
          projectName: projectLabel,
          diskRoot: chatStudioDiskRootRef.current,
        });
        if (multi.ok || multi.updated.length) {
          setChatStudioFiles(multi.files);
          chatStudioFilesRef.current = multi.files;
          resolvedStudio.files = multi.files;
          setChatCodePill(activeChatId, true);
          setCodePillSticky(true);
          persistStudioSnapshot(activeChatId, {
            files: multi.files,
            projectId: workspaceProjectId,
            name: projectLabel,
          });
          void pushLivePreview(multi.files, false);
          finishAgentReply(
            visionHopMeta ? `${multi.reply}\n\n_Vision hop: ${visionHopMeta}_` : multi.reply,
            visionHopMeta ? 'NOVA · vision → multi-agent' : 'NOVA · multi-agent',
          );
          return;
        }
        // If multi-agent produced nothing useful, fall through to normal edit path.
      }

      // Level-B agent tool loop removed from AIChat (v0.1.217).
      // Capable coder hops go through runEditTurn + BrainProfile gates only.
      // Fast path: deterministic UI patches. surgical tweaks + layout rebuilds.
      if (allowEdits && (workspaceProjectId || chatStudioDiskRootRef.current)) {
        const { finalizeWebEdits } = await import('@/lib/webProjectCanon');
        const micro = finalizeWebEdits(stickyFiles, editUserMessage, [], { projectName: projectLabel });
        if (micro.length) {
          setMessages(prev => prev.map(m => (
            m.id === assistantId
              ? { ...m, content: '__generating__:chat:Updating project files…' }
              : m
          )));
          const applied = await applyChatReplyEdits({
            reply: '',
            projectId: workspaceProjectId,
            projectName: projectLabel,
            files: stickyFiles,
            userMessage: editUserMessage,
            diskRoot: chatStudioDiskRootRef.current,
          });
          const elapsedMs = Date.now() - replyStartedAt;
          if (applied.ok) {
            setChatStudioFiles(applied.files);
            chatStudioFilesRef.current = applied.files;
            resolvedStudio.files = applied.files;
            setChatCodePill(activeChatId, true);
            setCodePillSticky(true);
            persistStudioSnapshot(activeChatId, {
              files: applied.files,
              projectId: workspaceProjectId,
              name: projectLabel,
            });
            void pushLivePreview(applied.files, false);
            const answer = finalizeCodingChatBubble({
              userMessage: content,
              rawReply: '',
              changedPaths: applied.updated,
              applied: true,
            });
            const patchFileChanges = applied.updated.map((path) => {
              const diff = countLineDiff(
                String(stickyFiles?.[path] || ''),
                String(applied.files?.[path] || ''),
              );
              return { path, added: diff.added, removed: diff.removed };
            });
            const reply = buildStudioTraceMessage({
              startedAt: replyStartedAt,
              elapsedMs,
              userMessage: content,
              answer,
              wrotePaths: applied.updated,
              fileChanges: patchFileChanges,
              projectName: projectLabel,
            });
            const next = messagesRef.current.map(m => (
              m.id === assistantId
                ? {
                  ...m,
                  content: reply,
                  provider_used: visionHopMeta ? `NOVA · vision → patch` : 'NOVA · local patch',
                  elapsed_ms: elapsedMs,
                }
                : m
            ));
            messagesRef.current = next;
            persistModeThread(mode, next, { chatId: activeChatId });
            setMessages(next);
            clearGeneratingIfMineEarly();
            lastInspectReplyRef.current = reply;
            window.setTimeout(() => {
              if (mySeq === genSeqRef.current) flushQueuedSend();
            }, 0);
            return;
          }
        }
      }

      let studioUserMessage = editUserMessage;
      if (
        allowEdits
        && shouldSkipWeakModelCodingHop({
          userMessage: editUserMessage,
          modelId: pinnedModel.id,
          modelName: pinnedModel.name,
          surgicalMissed: true,
        })
      ) {
        await finishPlainReply(weakModelMicroEditReply(editUserMessage), 'NOVA · local');
        return;
      }
      if (allowEdits && !/##\s*NOVA skills/i.test(editUserMessage)) {
        try {
          const editSkills = await resolveSkillsForBrief(editUserMessage, detectProjectKind(editUserMessage), {
            isEdit: true,
            forCreateBuild: false,
            hasReferenceImage: messageHasImages(content) || /unsplash|https?:\/\/\S+\.(?:png|jpe?g|webp)|ark-media:/i.test(editUserMessage),
            diskRoot: chatStudioDiskRootRef.current || null,
          });
          const editBlock = formatSkillsForPrompt(editSkills);
          if (editBlock) {
            studioUserMessage = `${editUserMessage}\n\n${editBlock}`;
            setMessages(prev => prev.map(m => (
              m.id === assistantId
                ? { ...m, content: `__generating__:chat:Equipped: ${skillNamesLabel(editSkills)}` }
                : m
            )));
          }
        } catch {
          /* skills are best-effort on edit */
        }
      }

      const editHbStop = allowEdits
        ? startProgressHeartbeat((label) => {
          if (mySeq !== genSeqRef.current || stopRequestedRef.current) return;
          pushAssistantStatus(label);
        }, 'edit', 4000)
        : () => {};
      // answerStudio only via runChatTurn / edit.ts.
      if (allowEdits) {
        await finishPlainReply(
          'Could not apply that edit. Try a clearer one-line ask, or pin a larger coder in Models.',
          'NOVA · edit',
        );
        return;
      }
      let result: { text: string; intent?: unknown; findings?: unknown[]; packedTokens?: number };
      try {
        const chatOut = await runChatTurn({
          content: studioUserMessage,
          files: stickyFiles,
          projectName: projectLabel,
          mode: 'chat',
          allowFileEdits: false,
          preferredModelId: pinnedModel.id,
          preferredModelName: pinnedModel.name,
          preferredSource: pinnedModel.source,
          stickyModelId: sticky?.modelId,
          stickyModelName: sticky?.modelName,
          stickyPinnedSource: sticky?.pinnedSource,
          planOnly: planTurn,
          shouldAbort: () => mySeq !== genSeqRef.current || stopRequestedRef.current,
          onDelta: (live) => {
            if (mySeq !== genSeqRef.current || stopRequestedRef.current) return;
            const text = String(live || '').trim();
            if (text.length < 2) return;
            setMessages(prev => {
              const next = prev.map(m => (m.id === assistantId ? { ...m, content: text } : m));
              messagesRef.current = next;
              return next;
            });
          },
        });
        result = { text: chatOut.text, intent: chatOut.intent as never, findings: chatOut.findings as never, packedTokens: chatOut.packedTokens };
      } finally {
        editHbStop();
      }

      if (await stopIfSuperseded()) return;

      lastStudioIntentRef.current = (result.intent as StudioIntent | null) || null;
      if (result.findings?.length) lastFindingsRef.current = result.findings as InspectFinding[];
      if (result.packedTokens != null) {
        setTokenRatio(syncTokenUsage(activeChatId, result.packedTokens));
      }

      const locateNote = lastFolderLocateNoteRef.current;
      lastFolderLocateNoteRef.current = null;
      let changedPaths: string[] = [];
      let appliedOk = false;
      let applyError: string | undefined;

      if (
        (workspaceProjectId || chatStudioDiskRootRef.current)
        && allowEdits
        && !looksLikePromptEcho(result.text)
      ) {
        const applied = await applyChatReplyEdits({
          reply: result.text,
          projectId: workspaceProjectId,
          projectName: projectLabel,
          files: stickyFiles,
          userMessage: editUserMessage,
          diskRoot: chatStudioDiskRootRef.current,
        });
        if (applied.ok) {
          appliedOk = true;
          changedPaths = applied.updated;
          setChatStudioFiles(applied.files);
          chatStudioFilesRef.current = applied.files;
          resolvedStudio.files = applied.files;
          setChatCodePill(activeChatId, true);
          setCodePillSticky(true);
          persistStudioSnapshot(activeChatId, {
            files: applied.files,
            projectId: workspaceProjectId,
            name: projectLabel,
          });
          void pushLivePreview(applied.files, false);
        } else {
          applyError = applied.error || 'write_failed';
        }
      } else if (allowEdits && !workspaceProjectId && !chatStudioDiskRootRef.current) {
        applyError = 'no_project';
      }

      const bubble = finalizeCodingChatBubble({
        userMessage: content,
        rawReply: result.text,
        changedPaths,
        applied: appliedOk,
        applyError: appliedOk ? undefined : (applyError || (allowEdits ? 'no_edits' : undefined)),
        editMode: allowEdits,
      });
      const plainReply = locateNote ? `${locateNote}\n\n${bubble}` : bubble;
      const elapsedMs = Date.now() - replyStartedAt;
      const reply = allowEdits
        ? buildStudioTraceMessage({
          startedAt: replyStartedAt,
          elapsedMs,
          userMessage: content,
          answer: plainReply,
          readPaths: Object.keys(stickyFiles).slice(0, 10),
          wrotePaths: changedPaths,
          projectName: projectLabel,
        })
        : plainReply;

      const next = messagesRef.current.map(m => (
        m.id === assistantId
          ? {
            ...m,
            content: reply,
            provider_used: visionHopMeta
              ? `${visionHopMeta} → coder`
              : 'NOVA · chat',
            elapsed_ms: elapsedMs,
          }
          : m
      ));
      messagesRef.current = next;
      persistModeThread(mode, next, { chatId: activeChatId });
      setMessages(next);
      if (!allowEdits) {
        setInspectOfferId(null);
        setStudioOfferKind(null);
      }
      clearGeneratingIfMineEarly();
      lastInspectReplyRef.current = reply;
      window.setTimeout(() => {
        if (mySeq === genSeqRef.current) flushQueuedSend();
      }, 0);
      return;
    }

    const earlyHasStudio = stickyCount > 0
      || Object.keys(chatStudioFilesRef.current).length > 0
      || content.includes('<!--ark-attach:')
      || content.includes('<!--ark-auto-read-->');
    const willInspect = shouldInspectInChat(
      content,
      earlyHasStudio,
      content.startsWith(COMPOSER_MODE_PREFIX.debug),
    );
    const keepContinuity = mode === 'code'
      || Boolean(threadBrainRef.current?.pendingModelId || threadBrainRef.current?.freshBudget)
      || (
        histPrefs.rememberContext
        // Long threads stay continuous even if the setting was turned off mid-chat.
        && !looksLikeSideQuestAsk(content)
      )
      || (
        priorForHistory.length >= 4
        && !looksLikeSideQuestAsk(content)
      );
    // Inspect follow-ups must not pack the prior huge dump into GGUF (that hung Thinking…).
    const seedHistory = willInspect
      ? buildRouterHistory([], content)
      : histPrefs.rememberContext
        ? buildRouterHistory(priorForHistory, content, undefined, {
          keepContinuity,
          kind: mode === 'code' ? 'coding' : 'chat',
        })
        : buildRouterHistory([], content);
    const rotation = await Promise.race([
      prepareBrainRotation({
        scopeId: activeChatId,
        kind: brainKindForChatMode(mode),
        history: seedHistory,
        currentModelId: threadBrainRef.current?.modelId || pinnedModel.id,
        brain: pinnedModel.source === 'auto' ? threadBrainRef.current : null,
      }),
      new Promise<Awaited<ReturnType<typeof prepareBrainRotation>>>((resolve) => {
        window.setTimeout(() => {
          resolve({
            history: seedHistory,
            brain: pinnedModel.source === 'auto' ? threadBrainRef.current : null,
            swapped: false,
            pressure: 0,
            threshold: 0.7,
          });
        }, 5_000);
      }),
    ]);
    if (rotation.brain) {
      threadBrainRef.current = rotation.brain;
      setThreadBrain(rotation.brain);
    }
    setTokenRatio(rotation.pressure);
    if (rotation.swapped) setModelRatio(0);
    else setModelRatio(getModelHealthRatio(activeChatId));
    if (rotation.swapped) {
      setFailoverNote('Brain refreshed for this chat — history kept; model memory reset.');
    } else if (historyWasCompacted(seedHistory, rotation.history)) {
      setFailoverNote('Context compacted for speed — full chat history stays; the model uses a shorter memory.');
    }
    // Store on a ref so the async IIFE can read it — Rolldown DCE was dropping outer consts
    // and leaving unbound names in the IIFE invocation (chat stuck on Thinking forever).
    chatRouteSeedRef.current = {
      history: willInspect
        ? seedHistory
        : rotation.swapped && histPrefs.rememberContext
          ? buildRouterHistory(priorForHistory, content, undefined, {
            keepContinuity: true,
            kind: mode === 'code' ? 'coding' : 'chat',
          })
          : rotation.history,
      sticky: pinnedModel.source === 'auto' ? rotation.brain : null,
    };

    const clearGeneratingIfMine = () => {
      endInflightOnce();
      if (mySeq !== genSeqRef.current) return;
      generatingRef.current = false;
      if (activeGenChatIdRef.current === activeChatId) {
        activeGenChatIdRef.current = null;
      }
      try {
        const raw = sessionStorage.getItem('NOVA:inflight-media');
        const inflight = raw ? JSON.parse(raw) as { chatId?: string } : null;
        if (!inflight?.chatId || inflight.chatId === activeChatId) {
          sessionStorage.removeItem('NOVA:inflight-media');
        }
      } catch {
        sessionStorage.removeItem('NOVA:inflight-media');
      }
      setGenerating(false);
    };

    const finalizeAssistant = (finalText: string, provider: string, libraryId?: string) => {
      // Persist to THIS turn's chat even if the user opened New Chat (genSeq bump / UI clear).
      // Only skip when a newer send replaced this turn on the SAME chat.
      const supersededHere = mySeq !== genSeqRef.current
        && activeGenChatIdRef.current === activeChatId;
      if (supersededHere) return;
      if (provider && provider !== 'NOVA · setup needed') {
        setLocalPrefs({ lastAnsweredLabel: provider });
      }
      // Always the chat that started this turn — never the viewed Recent
      // (persistChatIdRef tracks the open thread and would poison another chat).
      const threadChatId = activeChatId;
      const routeChat = routeChatIdRef.current;
      const elapsedMs = Date.now() - replyStartedAt;
      if (threadChatId) {
        // Media replies embed huge base64 data URLs. don't count those as "tokens"
        // or two image gens will slam Model freshness to ~50%.
        const isMediaReply = /data:image\/|data:video\/|!\[[^\]]*\]\(data:/i.test(finalText || '')
          || mode === 'image'
          || mode === 'video';
        const tokenEstimate = isMediaReply
          ? Math.min(2_400, Math.ceil(String(finalText || '').replace(/!\[[^\]]*\]\(data:[^)]+\)/g, '').length / 4) + 800)
          : Math.ceil((finalText?.length || 0) / 4);
        // Cap activeMs wear for media so a slow free-host wait doesn't look like "brain worn out".
        const wearMs = isMediaReply ? Math.min(elapsedMs, 45_000) : elapsedMs;
        setModelRatio(recordModelTurn(threadChatId, {
          tokens: tokenEstimate,
          activeMs: wearMs,
        }));
      }
      const patchThread = (list: ChatMessage[]) => list.map(m => (
        m.id === assistantId
          ? { ...m, content: finalText, provider_used: provider, elapsed_ms: elapsedMs }
          : m
      ));

      // Prefer this turn's messages; if the view already switched, patch storage for THIS chat only.
      let next = patchThread(
        (routeChat === threadChatId ? messagesRef.current : null)
          || (() => {
            try {
              const raw = localStorage.getItem(chatThreadKey(threadChatId));
              const stored = raw ? JSON.parse(raw) as ChatMessage[] : [];
              if (Array.isArray(stored) && stored.some(m => m.id === assistantId)) return stored;
            } catch {
              /* ignore */
            }
            return null;
          })()
          || messagesRef.current,
      );
      if (!next.some(m => m.id === assistantId)) {
        try {
          const raw = localStorage.getItem(chatThreadKey(threadChatId));
          const stored = raw ? JSON.parse(raw) as ChatMessage[] : [];
          if (Array.isArray(stored) && stored.some(m => m.id === assistantId)) {
            next = patchThread(stored);
          }
        } catch {
          /* ignore */
        }
      }
      if (!next.some(m => m.id === assistantId)) {
        next = [...normalized, userMsg, { ...assistantMsg, content: finalText, provider_used: provider, elapsed_ms: elapsedMs }];
      }
      // Only mutate the live canvas when the user is still viewing THIS thread.
      // Blank New Chat clears routeChatIdRef — never paint the finished recent story there.
      const viewingThisThread = Boolean(routeChat && threadChatId && routeChat === threadChatId);
      if (viewingThisThread) {
        messagesRef.current = next;
        messagesChatIdRef.current = threadChatId;
      }

      const activeCreationId = route.name === 'chat' ? route.creationId : undefined;
      persistModeThread(mode, next, {
        chatId: threadChatId,
        creationId: activeCreationId || libraryId,
        libraryId,
        assistantId,
      });

      // Safe if unmounted. React ignores; persistence above already landed.
      setMessages(prev => (viewingThisThread ? next : prev));

      notifyChatDone(threadChatId);
    };

    chatTurnCtlRef.current = {
      clearGenerating: clearGeneratingIfMine,
      finalizeAssistant,
      pushStatus: pushAssistantStatus,
    };

    // First-run guarantee: no live chat path → wait if installing, else honest CTA (no fake NOVA Core answer).
    // engineGenerate IPC exists on desktop even when no GGUF is installed — do not treat IPC as capacity.
    if (
      !pluginId
      && (mode === 'general' || mode === 'code')
      && capacity
      && !capacity.liveChat
    ) {
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
      finalizeAssistant(honest, installing ? 'NOVA · installing' : 'NOVA · setup needed');
      clearGeneratingIfMine();
      window.setTimeout(() => {
        if (mySeq === genSeqRef.current) flushQueuedSend();
      }, 0);
      return;
    }

    } catch (fatal) {
      try {
        await finishPlainReply(
          `Something broke while preparing that reply.\n\n${fatal instanceof Error ? fatal.message : String(fatal)}`,
        );
      } catch {
        clearGeneratingIfMineEarly();
      }
      return;
    }

    void (async () => {
      const routeHistory = chatRouteSeedRef.current.history;
      const stickyBrain = chatRouteSeedRef.current.sticky;
      let response = 'NOVA Router could not complete this request.';
      let usedPlugin = false;
      let skipReplySanitize = false;
      let lastLibraryId: string | undefined;
      let resolvedProvider = providerLabel;
      let streamedPartial = '';
      let lastGoodLive = '';
      let abandoned = false;
      let idleTimer: number | undefined;
      let sideQuestLookup: { text: string; sources: { title: string; url: string }[]; ok: boolean } | null = null;
      let earlyResolve: ((value: { reply: string }) => void) | null = null;
      const earlyDone = new Promise<{ reply: string }>((resolve) => {
        earlyResolve = resolve;
      });

      const armStreamIdleFinish = () => {
        if (idleTimer) window.clearTimeout(idleTimer);
        const draftNow = String(streamedPartial || '').trim();
        // Do NOT cut local models off after a short sentence — rushed finishes looked "done"
        // in a few seconds with thin answers. Prefer waiting; 1+ minute thinks are OK.
        const substantial = draftNow.length >= 1400;
        const solidEnd = /[.!?…]["')\]]*\s*$/.test(draftNow);
        // Longer idle = more think time. Sub-minute answers were often incomplete.
        const idleMs = substantial && solidEnd
          ? 18_000
          : draftNow.length >= 400
            ? 35_000
            : 55_000;
        idleTimer = window.setTimeout(() => {
          if (mySeq !== genSeqRef.current || abandoned || stopRequestedRef.current) return;
          const cleaned = usableAssistantText(streamedPartial, content, previousAssistant);
          const draft = (cleaned || streamedPartial).trim();
          if (draft.length < 8) return;
          // Too thin still: keep waiting for more tokens instead of cancelling the engine.
          if (draft.length < 500 && !/^(hi|hello|hey|thanks|thank you)\b/i.test(draft)) {
            idleTimer = window.setTimeout(() => {
              if (mySeq !== genSeqRef.current || abandoned || stopRequestedRef.current) return;
              abandoned = true;
              void engineGenerateCancel();
              chatTurnCtlRef.current.clearGenerating();
              earlyResolve?.({ reply: usableAssistantText(streamedPartial, content, previousAssistant) || draft });
            }, 40_000);
            return;
          }
          // Echo-only garbage: fail closed. Long streamed answers always settle.
          if (looksLikePromptEcho(draft) && draft.length < 200) {
            abandoned = true;
            void engineGenerateCancel();
            chatTurnCtlRef.current.clearGenerating();
            earlyResolve?.({
              reply: 'Model echoed its system prompt. Try switching models and send again.',
            });
            return;
          }
          if (looksLikePromptEcho(draft) && draft.length < 400) {
            // Keep waiting for a better chunk once; do not soft-lock Stop.
            idleTimer = window.setTimeout(() => {
              if (mySeq !== genSeqRef.current || abandoned || stopRequestedRef.current) return;
              abandoned = true;
              void engineGenerateCancel();
              chatTurnCtlRef.current.clearGenerating();
              const again = usableAssistantText(streamedPartial, content, previousAssistant);
              earlyResolve?.({
                reply: (again || streamedPartial).trim()
                  || 'Model echoed its system prompt. Try switching models and send again.',
              });
            }, 8_000);
            return;
          }
          const incomplete = /[:;,—–-]\s*$/.test(draft)
            || /\n\s*(?:\d+\.|[-*])\s+[^\n]{0,80}:\s*$/.test(draft)
            || /\b(and|or|the|to|of|for|with|a|an)\s*$/i.test(draft);
          // Incomplete drafts: wait longer before releasing Stop.
          if (incomplete && draft.length < 900) {
            idleTimer = window.setTimeout(() => {
              if (mySeq !== genSeqRef.current || abandoned || stopRequestedRef.current) return;
              abandoned = true;
              void engineGenerateCancel();
              chatTurnCtlRef.current.clearGenerating();
              earlyResolve?.({ reply: cleaned || draft });
            }, 12_000);
            return;
          }
          abandoned = true;
          void engineGenerateCancel();
          chatTurnCtlRef.current.clearGenerating();
          earlyResolve?.({ reply: cleaned || draft });
        }, idleMs);
      };

      try {
      // Prefer sticky map from resolveStudioFiles. never trust an empty ref after attach.
      const studioFiles = Object.keys(resolvedStudio.files).length
        ? resolvedStudio.files
        : chatStudioFilesRef.current;
      const hasStudioFiles = Object.keys(studioFiles).length > 0;
      if (hasStudioFiles) {
        chatStudioFilesRef.current = studioFiles;
      }

      // Bound micro UI edits before inspect/planning — never “still planning” after create.
      if (
        !usedPlugin
        && (mode === 'general' || mode === 'code')
        && looksLikeCodeEditAsk(content)
        && (turnDiskRoot || hasStudioFiles || turnProjectId)
      ) {
        try {
          const { applyChatReplyEdits } = await import('@/lib/chatAgentApply');
          const { finalizeWebEdits } = await import('@/lib/webProjectCanon');
          if (!turnDiskRoot && activeChatId) {
            const title = chats.find(c => c.id === activeChatId)?.title || null;
            const healed = await resolveChatProjectRoot({ chatId: activeChatId, chatTitle: title });
            if (healed.diskRoot) {
              turnDiskRoot = healed.diskRoot;
              setChatStudioDiskRoot(healed.diskRoot);
              chatStudioDiskRootRef.current = healed.diskRoot;
              if (Object.keys(healed.files || {}).length) {
                turnStudioFiles = { ...healed.files };
                setChatStudioFiles(healed.files);
                chatStudioFilesRef.current = healed.files;
              }
            }
          }
          let filesForPatch = { ...turnStudioFiles };
          const root = turnDiskRoot;
          if (root) {
            const hydrated = await loadPreviewFilesFromDisk(root);
            if (Object.keys(hydrated).length) {
              filesForPatch = { ...hydrated, ...filesForPatch };
            }
          }
          // Empty-reply micro path only when finalizeWebEdits already has concrete edits.
          const micro = finalizeWebEdits(filesForPatch, content, [], {
            projectName: studioPathBasename(root || '') || undefined,
          });
          if (!micro.length) {
            /* wait for model / later path */
          } else {
            const applied = await applyChatReplyEdits({
              reply: '',
              projectId: turnProjectId,
              projectName: studioPathBasename(root || '') || undefined,
              files: filesForPatch,
              userMessage: content,
              diskRoot: root,
            });
            if (applied.ok && applied.updated.length) {
              turnStudioFiles = applied.files;
              const stillSame = (!routeChatIdRef.current || routeChatIdRef.current === activeChatId)
                && String(chatStudioDiskRootRef.current || '') === String(root || '');
              if (stillSame) {
                setChatStudioFiles(applied.files);
                chatStudioFilesRef.current = applied.files;
                void pushLivePreview(applied.files, false);
              }
              setChatCodePill(activeChatId, true);
              setCodePillSticky(true);
              persistStudioSnapshot(activeChatId, {
                files: applied.files,
                projectId: turnProjectId,
                name: studioPathBasename(root || '') || undefined,
                diskRoot: root,
                previewUrl: stillSame ? previewUrlRef.current : null,
              });
              response = finalizeCodingChatBubble({
                userMessage: content,
                rawReply: '',
                changedPaths: applied.updated,
                applied: true,
                editMode: true,
              });
              usedPlugin = true;
            }
          }
        } catch {
          /* fall through */
        }
      }

      if ((mode === 'general' || mode === 'code') && isGithubPullAsk(content)) {
        const runtime = getPluginRuntime('github', loadPluginState());
        const token = runtime.token?.trim();
        if (!token) {
          response = 'Connect GitHub in Plugins, then ask about your repos again.';
          usedPlugin = true;
        } else {
          try {
            const [user, repos] = await Promise.all([
              verifyGitHubToken(token),
              listAccountRepos(token),
            ]);
            const named = parseGithubRepoRef(content);
            const picked = pickGithubRepo(repos, content)
              || (/\b(latest|recent|last|empty|blank|new|fresh)\b/i.test(content) ? pickGithubRepo(repos, `${content} latest`) : null)
              || (named ? { full_name: `${named.owner}/${named.repo}`, name: named.repo, html_url: `https://github.com/${named.owner}/${named.repo}`, private: false, id: 0, description: null, updated_at: '', language: null } : null);

            if (wantsGithubCatalog(content) && !picked) {
              response = formatRepoCatalog(repos, user.login);
              usedPlugin = true;
              setGithubOfferId(assistantId);
            } else if (!picked) {
              response = formatRepoCatalog(repos, user.login);
              usedPlugin = true;
              setGithubOfferId(assistantId);
            } else {
              const [owner, repo] = picked.full_name.split('/');
              const project = addRecent(picked.name || repo);
              const cloned = await gitClone(project.id, githubCloneUrl(owner, repo), token);
              if (!cloned.ok) {
                response = cloned.error || `Could not clone ${picked.full_name}.`;
                usedPlugin = true;
              } else {
                const leftover = content
                  .replace(/open (my )?(latest |empty |new )?(github )?repo(sitory)?( in code)?/ig, '')
                  .replace(/pull in|clone|bring in|work on/ig, '')
                  .replace(picked.full_name, '')
                  .replace(`${owner}/${repo}`, '')
                  .trim();
                const seed = leftover
                  || ((picked.size ?? 1) === 0
                    ? 'This GitHub repo is empty. Start with a blank page, then add what I describe.'
                    : `Continue in ${picked.full_name}. Inspect the files, then add, remove, or upgrade as I ask.`);
                try {
                  localStorage.setItem(`NOVA:project-draft:${project.id}`, seed);
                } catch { /* ignore */ }
                response = [
                  `Pulled **${picked.full_name}** into this chat.`,
                  cloned.branch ? `Branch: ${cloned.branch}` : '',
                  (picked.size ?? 1) === 0
                    ? 'It looks empty. say what to add and I will start building.'
                    : 'Click **Code** under the chat box to browse files. Keep chatting to add, remove, upgrade, or fix.',
                ].filter(Boolean).join('\n');
                usedPlugin = true;
                window.setTimeout(() => {
                  navigate({ name: 'chat' });
                  void (async () => {
                    const read = await window.arkDesktop?.projectRead?.(project.id);
                    if (read?.ok && read.files) {
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
                          name: picked.name || repo,
                          diskRoot: read.root || null,
                        });
                        setChatCodePill(chatId, true);
                      }
                    }
                    setCodeOverlayOpen(true);
                    setCodePillSticky(true);
                  })();
                }, 120);
              }
            }
          } catch (err) {
            response = err instanceof Error ? err.message : 'GitHub could not list your repos.';
            usedPlugin = true;
          }
        }
      }

      if (!usedPlugin && (mode === 'general' || mode === 'code') && shouldInspectInChat(content, hasStudioFiles, content.startsWith(COMPOSER_MODE_PREFIX.debug))) {
        // Planning follow-ups (“more details”) must stay in normal chat. never the empty-attach wall.
        const pendingPlan = getLastPendingGreenfield(activeChatId);
        const isBoundUiEdit = looksLikeCodeEditAsk(content)
          && Boolean(chatStudioDiskRootRef.current || Object.keys(chatStudioFilesRef.current).length > 0 || hasStudioFiles);
        const planningFollowUp = !isBoundUiEdit && Boolean(
          looksLikeConversationalPlanningAsk(content)
          || wantsPlanningOnly(content)
          || (pendingPlan && !looksLikeImplementGo(content) && !content.includes('<!--ark-attach:')),
        );
        const editOnBoundPath = Boolean(
          (chatStudioDiskRootRef.current || Object.keys(chatStudioFilesRef.current).length > 0 || hasStudioFiles)
          && chatTurnAllowsFileEdits(content, composerModeFromContent(content) || composerMode),
        );
        // Bound UI edits: patch on disk first — never dump “edit App.jsx manually” from the model.
        if (editOnBoundPath && looksLikeCodeEditAsk(content)) {
          try {
            const { finalizeWebEdits, isStructuralUiPieceAsk } = await import('@/lib/webProjectCanon');
            const { applyChatReplyEdits } = await import('@/lib/chatAgentApply');
            // Heal missing diskRoot from this chat before writing.
            if (!turnDiskRoot && activeChatId) {
              const title = chats.find(c => c.id === activeChatId)?.title || null;
              const healed = await resolveChatProjectRoot({ chatId: activeChatId, chatTitle: title });
              if (healed.diskRoot) {
                turnDiskRoot = healed.diskRoot;
                setChatStudioDiskRoot(healed.diskRoot);
                chatStudioDiskRootRef.current = healed.diskRoot;
                if (Object.keys(healed.files || {}).length) {
                  turnStudioFiles = { ...healed.files };
                  setChatStudioFiles(healed.files);
                  chatStudioFilesRef.current = healed.files;
                }
              }
            }
            let filesForPatch = { ...turnStudioFiles };
            const root = turnDiskRoot;
            if (root) {
              const hydrated = await loadPreviewFilesFromDisk(root);
              if (Object.keys(hydrated).length) {
                filesForPatch = { ...hydrated, ...filesForPatch };
              }
            }
            const structuralPiece = isStructuralUiPieceAsk(content);
            const micro = finalizeWebEdits(filesForPatch, content, [], {
              projectName: studioPathBasename(root || '') || undefined,
            });
            if (
              !structuralPiece
              && (
                micro.length
                || /\b(?:change|rename|set|make|update|add|remove|fix|delete|drop)\b/i.test(content)
              )
            ) {
              const applied = await applyChatReplyEdits({
                reply: '',
                projectId: turnProjectId,
                projectName: studioPathBasename(root || '') || undefined,
                files: filesForPatch,
                userMessage: content,
                diskRoot: root,
              });
              if (applied.ok && applied.updated.length) {
                turnStudioFiles = applied.files;
                const stillSame = (!routeChatIdRef.current || routeChatIdRef.current === activeChatId)
                  && String(chatStudioDiskRootRef.current || '') === String(root || '');
                if (stillSame) {
                  setChatStudioFiles(applied.files);
                  chatStudioFilesRef.current = applied.files;
                  void pushLivePreview(applied.files, false);
                }
                setChatCodePill(activeChatId, true);
                setCodePillSticky(true);
                persistStudioSnapshot(activeChatId, {
                  files: applied.files,
                  projectId: turnProjectId,
                  name: studioPathBasename(root || '') || undefined,
                  diskRoot: root,
                  previewUrl: stillSame ? previewUrlRef.current : null,
                });
                response = finalizeCodingChatBubble({
                  userMessage: content,
                  rawReply: '',
                  changedPaths: applied.updated,
                  applied: true,
                  editMode: true,
                });
                usedPlugin = true;
              }
            }
          } catch {
            /* fall through */
          }
        }
        if (usedPlugin) {
          /* already patched */
        } else if (editOnBoundPath) {
          // fall through to model chat only if agent loop did not already reply
        } else if (planningFollowUp && !content.includes('<!--ark-attach:') && !content.includes('<!--ark-auto-read-->')) {
          // fall through to model chat below
        } else {
        skipReplySanitize = true;
        try {
          const attachMeta = parseChatAttach(content) || parseChatAttaches(content)[0];
          let filesForInspect = studioFiles;
          if (Object.keys(filesForInspect).length === 0) {
            const pid = attachMeta?.projectId || chatStudioProjectIdRef.current;
            // Prefer light on-demand reads from the bound path — never dump the whole tree into context.
            const diskRoot = chatStudioDiskRootRef.current;
            if (diskRoot && window.arkDesktop?.readTextFile) {
              const rels = ['package.json', 'README.md', 'app/main.py', 'src/App.tsx', 'src/App.jsx', 'index.html'];
              const mentioned = String(content || '').match(/\b(?:[\w.-]+\/)+[\w.-]+\.[a-z0-9]{1,8}\b/gi) || [];
              for (const m of mentioned) {
                const norm = m.replace(/\\/g, '/');
                if (!rels.includes(norm)) rels.push(norm);
              }
              const sep = diskRoot.includes('\\') ? '\\' : '/';
              const loaded: Record<string, string> = {};
              for (const rel of rels.slice(0, 8)) {
                try {
                  const abs = `${diskRoot.replace(/[/\\]+$/, '')}${sep}${rel.replace(/\//g, sep)}`;
                  const read = await window.arkDesktop.readTextFile({ path: abs });
                  if (read?.ok && typeof read.text === 'string') loaded[rel] = read.text;
                } catch { /* missing */ }
              }
              if (Object.keys(loaded).length) filesForInspect = loaded;
            }
            if (Object.keys(filesForInspect).length === 0 && pid && window.arkDesktop?.projectRead) {
              try {
                const read = await Promise.race([
                  window.arkDesktop.projectRead(pid),
                  new Promise<null>((resolve) => { window.setTimeout(() => resolve(null), 4_000); }),
                ]);
                if (read?.ok && read.files && Object.keys(read.files || {}).length) {
                  filesForInspect = read.files as Record<string, string>;
                  setChatStudioFiles(filesForInspect);
                  chatStudioFilesRef.current = filesForInspect;
                  if (!chatStudioProjectIdRef.current) setChatStudioProjectId(pid);
                }
              } catch {
                /* ignore */
              }
            }
            if (Object.keys(filesForInspect).length === 0 && pid) {
              try {
                const raw = localStorage.getItem(`NOVA:chat-studio-files:${pid}`);
                if (raw) {
                  const parsed = JSON.parse(raw) as { files?: Record<string, string> };
                  if (parsed?.files && Object.keys(parsed.files).length) {
                    filesForInspect = parsed.files;
                    setChatStudioFiles(filesForInspect);
                    chatStudioFilesRef.current = filesForInspect;
                  }
                }
              } catch {
                /* ignore */
              }
            }
          }
          const projectLabel = attachMeta?.name
            || loadRecentProjects().find(p => p.id === chatStudioProjectIdRef.current)?.name
            || loadChatStudio(activeChatId)?.name
            || 'Attached project';
          const fileCount = Object.keys(filesForInspect).length;
          if (!fileCount) {
            // No real files. do not wall the user; continue as normal chat.
            skipReplySanitize = false;
          } else {
            persistStudioSnapshot(activeChatId, {
              files: filesForInspect,
              projectId: chatStudioProjectIdRef.current,
              name: projectLabel,
            });
            const userAsk = content
              .replace(/<!--ark-attach:[\s\S]*?-->/g, '')
              .replace(/<!--ark-auto-read-->/g, '')
              .trim()
              || `Tell me what **${projectLabel}** is about.`;
            const isFreshAttach = content.includes('<!--ark-attach:') || content.includes('<!--ark-auto-read-->');
            const sticky = stickyBrain;
            const inspectAsk = isFreshAttach && !userAsk ? `What is ${projectLabel} about?` : (userAsk || content);
            const planTurn = isChatPlanTurn(content) && !looksLikeImplementGo(content);
            const allowEdits = chatTurnAllowsFileEdits(content, composerModeFromContent(content) || composerMode);
            if (
              allowEdits
              && shouldSkipWeakModelCodingHop({
                userMessage: inspectAsk,
                modelId: pinnedModel.id,
                modelName: pinnedModel.name,
                surgicalMissed: true,
              })
            ) {
              response = weakModelMicroEditReply(inspectAsk);
              usedPlugin = true;
            } else {
            const engineResult = await (async () => {
              const chatOut = await runChatTurn({
                content: inspectAsk || content,
                files: filesForInspect,
                projectName: projectLabel,
                mode: allowEdits ? 'code' : 'chat',
                allowFileEdits: Boolean(allowEdits),
                preferredModelId: pinnedModel.id,
                preferredModelName: pinnedModel.name,
                preferredSource: pinnedModel.source,
                shouldAbort: () => mySeq !== genSeqRef.current || stopRequestedRef.current,
                timeoutMs: 45_000,
              });
              return { text: chatOut.text, intent: chatOut.intent, findings: chatOut.findings, packedTokens: chatOut.packedTokens };
            })();
            lastStudioIntentRef.current = (engineResult.intent as StudioIntent | null) || null;
            if (Array.isArray(engineResult.findings) && engineResult.findings.length) {
              lastFindingsRef.current = engineResult.findings as InspectFinding[];
            }
            if (engineResult.packedTokens != null) {
              setTokenRatio(syncTokenUsage(activeChatId, engineResult.packedTokens));
            }
            let changedPaths: string[] = [];
            let appliedOk = false;
            let applyError: string | undefined;
            const inspectProjectId = turnProjectId || attachMeta?.projectId || null;
            if (
              (inspectProjectId || turnDiskRoot)
              && allowEdits
              && !looksLikePromptEcho(engineResult.text)
            ) {
              const applied = await applyChatReplyEdits({
                reply: engineResult.text,
                projectId: inspectProjectId,
                projectName: projectLabel,
                files: filesForInspect,
                userMessage: content,
                diskRoot: turnDiskRoot,
              });
              if (applied.ok) {
                appliedOk = true;
                changedPaths = applied.updated;
                turnStudioFiles = applied.files;
                const stillSame = (!routeChatIdRef.current || routeChatIdRef.current === activeChatId)
                  && String(chatStudioDiskRootRef.current || '') === String(turnDiskRoot || '');
                if (stillSame) {
                  setChatStudioFiles(applied.files);
                  chatStudioFilesRef.current = applied.files;
                  void pushLivePreview(applied.files, false);
                }
                setChatCodePill(activeChatId, true);
                setCodePillSticky(true);
                persistStudioSnapshot(activeChatId, {
                  files: applied.files,
                  projectId: inspectProjectId,
                  name: projectLabel,
                  diskRoot: turnDiskRoot,
                });
              } else {
                applyError = applied.error || 'write_failed';
              }
            } else if (allowEdits && !inspectProjectId && !turnDiskRoot) {
              applyError = 'no_project';
            }
            const bubble = finalizeCodingChatBubble({
              userMessage: content,
              rawReply: engineResult.text,
              changedPaths,
              applied: appliedOk,
              applyError: appliedOk ? undefined : (applyError || (allowEdits ? 'no_edits' : undefined)),
              editMode: allowEdits,
            });
            const elapsedMs = Date.now() - replyStartedAt;
            response = allowEdits
              ? buildStudioTraceMessage({
                startedAt: replyStartedAt,
                elapsedMs,
                userMessage: content,
                answer: bubble,
                readPaths: Object.keys(filesForInspect).slice(0, 10),
                wrotePaths: changedPaths,
                projectName: projectLabel,
              })
              : bubble;
            lastInspectReplyRef.current = response;
            resolvedProvider = `${providerLabel} · files`;
            usedPlugin = true;
            if (!allowEdits) {
              setInspectOfferId(null);
              setStudioOfferKind(null);
            }
            } // end else (capable model inspect)
          }
        } catch (err) {
          const studio = chatStudioFilesRef.current;
          const label = parseChatAttach(content)?.name || 'folder';
          response = Object.keys(studio).length
            ? formatChatInspectReply(
              describeProjectFromFiles(studio, label),
              [],
              Object.keys(studio),
              'explain',
            )
            : (err instanceof Error ? err.message : 'Could not read that folder. Try attaching it again.');
          usedPlugin = true;
        }
        } // end non-planning inspect
      }

      if (!usedPlugin && pluginId) {
        const pluginReply = await runPluginAction(
          pluginId,
          content,
          pluginState?.token,
          pluginState?.permissions,
        );
        if (pluginReply) {
          response = pluginReply;
          usedPlugin = true;
        }
      } else if (
        !usedPlugin
        && (
          mode === 'image'
          || (
            (mode === 'general' || mode === 'code')
            && !hasStudioFiles
            && composerMode !== 'ask'
            && looksLikeImageAsk(content)
          )
        )
      ) {
        try {
          const setAssistantContent = (text: string) => {
            if (abandoned || stopRequestedRef.current || mySeq !== genSeqRef.current) return;
            const threadChatId = activeChatId;
            const patch = (list: ChatMessage[]) =>
              list.map(m => (m.id === assistantId ? { ...m, content: text } : m));
            const viewing = Boolean(routeChatIdRef.current && routeChatIdRef.current === threadChatId);
            if (viewing) {
              setMessages(prev => {
                const next = patch(prev.some(m => m.id === assistantId) ? prev : messagesRef.current);
                messagesRef.current = next;
                persistModeThread(mode, next, { chatId: threadChatId });
                return next;
              });
              return;
            }
            try {
              const raw = localStorage.getItem(chatThreadKey(threadChatId));
              const stored = raw ? JSON.parse(raw) as ChatMessage[] : [];
              const base = Array.isArray(stored) && stored.some(m => m.id === assistantId)
                ? stored
                : [...normalized, userMsg, { ...assistantMsg, content: text }];
              persistModeThread(mode, patch(base), { chatId: threadChatId });
            } catch {
              /* ignore */
            }
          };

          const { text: imageText, referenceId } = parseImageRequest(content);
          const referenceDataUrl = referenceId ? getMemoryThumb(referenceId) : undefined;
          let promptForGen = imageText || content;
          // Strip accidental empty-state chip text glued onto the prompt.
          promptForGen = promptForGen
            .replace(/^(Studio headshot|Create a caricature|Anime style|Underwater)\s*/i, '')
            .replace(/^(Studio headshot|Create a caricature|Anime style|Underwater)/i, '')
            .trim() || promptForGen;

          if (!getLocalPrefs().allowNsfw && looksLikeNsfwAsk(promptForGen)) {
            response = nsfwBlockedReply();
            setAssistantContent(response);
            usedPlugin = true;
          } else {
            const mergedFromBrief = Boolean(imageBriefRef.current?.chatId === activeChatId);
            if (mergedFromBrief) {
              promptForGen = mergeImageBrief(imageBriefRef.current!.original, imageText);
              imageBriefRef.current = null;
            }
            if (
              !mergedFromBrief
              && !referenceDataUrl
              && needsImageBrief(promptForGen)
            ) {
              imageBriefRef.current = { chatId: activeChatId!, original: promptForGen };
              response = buildImageBriefMessage(promptForGen);
              setAssistantContent(response);
              usedPlugin = true;
            } else if (!usedPlugin) {
          const imagePinned: ChatModelOption = mode === 'image'
            ? pinnedModel
            : {
              id: 'NOVA-image-core',
              name: 'NOVA Image Core',
              source: 'local',
              detail: '',
              kind: 'image',
            };
          const rewritten = rewriteImagePrompt(promptForGen);
          const sticky = mode === 'image' ? stickyBrain : undefined;
          let routed: Awaited<ReturnType<typeof arkRoute>> | undefined;
          await runMediaGenStages('image', label => {
            setAssistantContent(`__generating__:image:${label}`);
          }, async () => {
            // Free hosts (Flux + Horde cascade) often need 2–3 minutes; keep UI timeout above media budget.
            const IMAGE_TIMEOUT_MS = 210_000;
            routed = await Promise.race([
              arkRoute({
                message: rewritten,
                kind: 'image',
                preferredModelId: imagePinned.id,
                preferredModelName: imagePinned.name,
                preferredSource: imagePinned.source,
                stickyModelId: sticky?.modelId,
                stickyModelName: sticky?.modelName,
                stickyPinnedSource: sticky?.pinnedSource,
                referenceImageDataUrl: referenceDataUrl,
              }),
              new Promise<never>((_, reject) => {
                window.setTimeout(() => reject(new Error('Image timed out. Try again or pick another model.')), IMAGE_TIMEOUT_MS);
              }),
            ]);
          });

          if (!routed) {
            response = 'Image generation failed. Try again in a moment.';
            usedPlugin = true;
          } else {
            resolvedProvider = routerProviderLabel(routed, 'NOVA Image Core');
            const hopNote = failoverChipText(routed, imagePinned);
            if (hopNote) setFailoverNote(hopNote);
            if (mode === 'image' && pinnedModel.source === 'auto' && routed.source !== 'none') {
              const nextBrain = saveAutoThreadBrain(
                activeChatId,
                'image',
                routed,
                threadBrainRef.current,
                routed.attempted?.length ?? 0,
              );
              if (nextBrain) setThreadBrain(nextBrain);
            }
            const libraryId = routed.media?.libraryId || `local-${Date.now()}`;
            lastLibraryId = libraryId;
            const dataUrl = routed.media?.dataUrl;
            const isSvg = Boolean(dataUrl?.startsWith('data:image/svg'));
            const isReal = Boolean(routed.media?.real) && Boolean(dataUrl) && !isSvg;

            if (isReal && dataUrl) {
              rememberThumb(libraryId, dataUrl);
              addCreation({
                id: libraryId,
                kind: 'image',
                title: content.slice(0, 80),
                prompt: content,
                modelName: routed.modelName || imagePinned.name,
                dataUrl,
                createdAt: new Date().toISOString(),
                real: true,
                source: routed.source,
                chatId: activeChatId!,
              });
              response = mediaMessageMarkdown(content, libraryId, dataUrl, {
                real: true,
                kind: 'image',
                source: routed.source,
              });
              addChat({
                id: activeChatId!,
                mode: mode === 'image' ? 'image' : mode,
                title: titleFromPrompt(content),
                updatedAt: new Date().toISOString(),
                creationId: libraryId,
                preview: previewFromText(content),
              });
            } else {
              const failText = String(routed.reply || '').replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim();
              response = failText || [
                'Couldn\'t generate image. try again.',
                '',
                'Try again in a minute, or connect a Hugging Face / OpenAI key in Models → Cloud.',
              ].join('\n');
            }
            usedPlugin = true;
          }
            }
          }
        } catch (err) {
          void engineGenerateCancel();
          response = classifyErrorMessage(err instanceof Error ? err.message : 'Image generation failed').message;
          usedPlugin = true;
        }
      } else if (!usedPlugin && mode === 'video') {
        if (!isVideoTabEnabled()) {
          response = 'Video generation is coming soon. Use **Chat** for now.';
          usedPlugin = true;
        } else {
        try {
          const setAssistantContent = (text: string) => {
            if (abandoned || stopRequestedRef.current || mySeq !== genSeqRef.current) return;
            const threadChatId = activeChatId;
            const patch = (list: ChatMessage[]) =>
              list.map(m => (m.id === assistantId ? { ...m, content: text } : m));
            const viewing = Boolean(routeChatIdRef.current && routeChatIdRef.current === threadChatId);
            if (viewing) {
              setMessages(prev => {
                const next = patch(prev.some(m => m.id === assistantId) ? prev : messagesRef.current);
                messagesRef.current = next;
                persistModeThread(mode, next, { chatId: threadChatId });
                return next;
              });
              return;
            }
            try {
              const raw = localStorage.getItem(chatThreadKey(threadChatId));
              const stored = raw ? JSON.parse(raw) as ChatMessage[] : [];
              const base = Array.isArray(stored) && stored.some(m => m.id === assistantId)
                ? stored
                : [...normalized, userMsg, { ...assistantMsg, content: text }];
              persistModeThread(mode, patch(base), { chatId: threadChatId });
            } catch {
              /* ignore */
            }
          };

          const rewritten = rewriteVideoPrompt(content);
          const sticky = stickyBrain;
          let routed: Awaited<ReturnType<typeof arkRoute>> | undefined;
          await runMediaGenStages('video', label => {
            setAssistantContent(`__generating__:video:${label}`);
          }, async () => {
            const VIDEO_TIMEOUT_MS = 150_000;
            routed = await Promise.race([
              arkRoute({
                message: rewritten,
                kind: 'video',
                preferredModelId: pinnedModel.id,
                preferredModelName: pinnedModel.name,
                preferredSource: pinnedModel.source,
                stickyModelId: sticky?.modelId,
                stickyModelName: sticky?.modelName,
                stickyPinnedSource: sticky?.pinnedSource,
                mediaDurationSec: videoDurationSec,
              }),
              new Promise<never>((_, reject) => {
                window.setTimeout(() => reject(new Error('Video timed out. Try again or pick another model.')), VIDEO_TIMEOUT_MS);
              }),
            ]);
          });

          if (!routed) {
            response = 'Video generation failed. Try again in a moment.';
            usedPlugin = true;
          } else {
            resolvedProvider = routerProviderLabel(routed, providerLabel);
            const hopNote = failoverChipText(routed, pinnedModel);
            if (hopNote) setFailoverNote(hopNote);
            if (pinnedModel.source === 'auto' && routed.source !== 'none') {
              const nextBrain = saveAutoThreadBrain(
                activeChatId,
                'video',
                routed,
                threadBrainRef.current,
                routed.attempted?.length ?? 0,
              );
              if (nextBrain) setThreadBrain(nextBrain);
            }
            const libraryId = routed.media?.libraryId || `local-${Date.now()}`;
            lastLibraryId = libraryId;
            const dataUrl = routed.media?.dataUrl;
            const isSvg = Boolean(
              dataUrl?.startsWith('data:image/svg')
              || dataUrl?.includes('image/svg'),
            );
            const isMp4 = Boolean(dataUrl?.startsWith('data:video/'));
            const isMotionStill = (routed.source || '').includes('motion-still');

            if (dataUrl && isMp4 && !isSvg) {
              const isReal = Boolean(routed.media?.real) && isMp4 && !isMotionStill;
              rememberThumb(libraryId, dataUrl);
              addCreation({
                id: libraryId,
                kind: 'video',
                title: content.slice(0, 80),
                prompt: content,
                modelName: routed.modelName || pinnedModel.name,
                dataUrl,
                createdAt: new Date().toISOString(),
                real: isReal,
                source: routed.source,
                chatId: activeChatId!,
              });
              if (routed.reply && (routed.reply.includes('![') || isMotionStill || !isReal)) {
                response = routed.reply.includes('![')
                  ? routed.reply
                  : `${routed.reply}\n\n${mediaMessageMarkdown(content, libraryId, dataUrl, {
                      real: isReal,
                      kind: 'video',
                      source: routed.source,
                    })}`;
              } else {
                response = mediaMessageMarkdown(content, libraryId, dataUrl, {
                  real: isReal,
                  kind: 'video',
                  source: routed.source,
                });
              }
              addChat({
                id: activeChatId!,
                mode,
                title: titleFromPrompt(content),
                updatedAt: new Date().toISOString(),
                creationId: libraryId,
                preview: previewFromText(content),
              });
            } else {
              const failText = String(routed.reply || '').replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim();
              response = failText || [
                'Couldn\'t generate video. try again.',
                '',
                'Free video hosts did not return a playable MP4.',
              ].join('\n');
            }
            usedPlugin = true;
          }
        } catch (err) {
          void engineGenerateCancel();
          response = classifyErrorMessage(err instanceof Error ? err.message : 'Video generation failed').message;
          usedPlugin = true;
        }
        }
      } else if (!usedPlugin) {
        try {
          const prefs = getLocalPrefs();
          const vision = extractVisionImages(content);
          const pendingIdea = getLastPendingGreenfield(activeChatId);
          const sideQuest = looksLikeSideQuestAsk(content);
          const planningTalk = !sideQuest && shouldInjectPlanningConversation(content, {
            pendingIdea: Boolean(pendingIdea),
            diskRoot: chatStudioDiskRootRef.current || chatStudioDiskRoot || null,
          });
          const keepBuildingTalk = !sideQuest && looksLikeKeepBuildingAsk(content)
            && !hasActiveWorkspace({
              files: chatStudioFilesRef.current,
              projectId: chatStudioProjectIdRef.current,
              diskRoot: chatStudioDiskRootRef.current,
            });
          let routeMessage = content;
          const historyKeep = !sideQuest;
          let history = prefs.rememberContext
            ? (routeHistory.length && historyKeep
              ? routeHistory
              : buildRouterHistory(priorForHistory, content, vision, {
                keepContinuity: historyKeep,
                kind: 'chat',
              }))
            : buildRouterHistory([], content, vision);
          // Side quests must not reuse a packed build history that still contains the marketplace brief.
          if (sideQuest) {
            history = buildRouterHistory(priorForHistory, content, vision, {
              keepContinuity: false,
              kind: 'chat',
            });
          }
          if (sideQuest) {
            chatTurnCtlRef.current.pushStatus(looksLikeLyricsAsk(content) ? 'Checking lyrics…' : 'Looking that up…');
            // Copyrighted lyrics: never let the local model invent a full paste.
            if (looksLikeLyricsAsk(content)) {
              response = honestLyricsUnavailableReply(content);
              usedPlugin = true;
            } else {
              history = [
                { role: 'user' as const, content: sideQuestAnswerHint(content) },
                {
                  role: 'assistant' as const,
                  content: 'Understood. I will answer only this question, refuse to invent live facts, and not continue any prior build/product advice.',
                },
                ...history,
              ];
            }
          }
          if (!usedPlugin) {
          if (planningTalk || keepBuildingTalk) {
            // Single status only — no multi-second delay that thrash-replaces the bubble before tokens arrive.
            chatTurnCtlRef.current.pushStatus('Thinking…');
            const hint = keepBuildingTalk
              ? keepBuildingConversationHint(pendingIdea?.summary || chats.find(c => c.id === activeChatId)?.title || undefined)
              : planningConversationHint(pendingIdea?.summary || undefined);
            history = [
              { role: 'user' as const, content: hint },
              { role: 'assistant' as const, content: keepBuildingTalk
                ? 'Understood. I will recommend concrete next polish steps and ask what they want next — no full rebuild, no file dumps.'
                : 'Understood. I will stay on their topic, give a thorough answer, and not invent a random product.' },
              ...history,
            ];
            routeMessage = content;
          }
          let preferPerplexityForTurn = false;
          if (looksLikeWebGroundedAsk(content) && !looksLikeLyricsAsk(content)) {
            chatTurnCtlRef.current.pushStatus('Looking that up…');
            try {
              const hit = await webSearchForChat(content);
              if (mySeq !== genSeqRef.current || stopRequestedRef.current) return;
              const keys = getProviderApiKeys();
              preferPerplexityForTurn = Boolean(keys.perplexity) && isCloudProviderEnabled('perplexity');
              sideQuestLookup = {
                ok: Boolean(hit.ok),
                text: String(hit.text || ''),
                sources: Array.isArray(hit.sources) ? hit.sources : [],
              };
              const note = hit.ok ? formatWebLookupForPrompt(hit) : '';
              if (note) {
                history = [
                  ...history,
                  {
                    role: 'user' as const,
                    content: `${note}\n\nUser question (answer this now, facts first): ${String(content || '').trim()}`,
                  },
                ];
              } else {
                history = [
                  ...history,
                  { role: 'user' as const, content: webLookupUnavailableNote() },
                  {
                    role: 'assistant' as const,
                    content: preferPerplexityForTurn
                      ? 'Understood — built-in lookup was empty; I will answer with a live search model when available and clearly say when facts are uncertain — never a link directory.'
                      : 'Understood — I will tell the user I lack live web results for this question and recommend Models → Cloud (Perplexity) or Exa, instead of inventing current events or listing random websites.',
                  },
                ];
              }
            } catch {
              /* offline / blocked — answer from local knowledge */
            }
          }
          if (looksLikeDirectJudgmentAsk(content)) {
            history = [
              {
                role: 'user' as const,
                content:
                  'Answer the latest user message directly. If they asked how fast AND whether it is worth building, cover both: (1) a realistic timeline to a usable beta, (2) a clear yes/no-with-reasons on worth. Do not greet. Do not dump a fresh multi-week plan template.',
              },
              {
                role: 'assistant' as const,
                content: 'Understood. I will answer the timeline and the worth-it judgment first, briefly.',
              },
              ...history,
            ];
          }
          if (looksLikeThreadSummaryAsk(content)) {
            history = [
              { role: 'user' as const, content: threadSummarySystemHint() },
              {
                role: 'assistant' as const,
                content: 'Understood. I will summarize only this chat thread from the prior turns.',
              },
              ...history,
            ];
          }
          const sticky = stickyBrain;
          const pinnedIsCoder = /coder|starcoder/i.test(`${pinnedModel.id || ''} ${pinnedModel.name || ''}`);
          const judgmentAsk = looksLikeDirectJudgmentAsk(content);
          const summaryAsk = looksLikeThreadSummaryAsk(content);
          const useChatBrain = (planningTalk || judgmentAsk || summaryAsk) && (pinnedIsCoder || /1\.5b|1.5B|0\.5b/i.test(`${pinnedModel.id || ''} ${pinnedModel.name || ''}`));
          const timeoutMs = 250_000;
          const firstTokenMs = planningTalk ? 55_000 : 35_000;
          let sawToken = false;
          const routePromise = arkRoute({
            message: routeMessage,
            kind: 'chat',
            preferredModelId: preferPerplexityForTurn
              ? 'perplexity'
              : (useChatBrain ? undefined : pinnedModel.id),
            preferredModelName: preferPerplexityForTurn
              ? 'Perplexity Sonar'
              : (useChatBrain ? undefined : pinnedModel.name),
            preferredSource: preferPerplexityForTurn
              ? 'cloud'
              : (useChatBrain ? undefined : pinnedModel.source),
            stickyModelId: useChatBrain ? undefined : sticky?.modelId,
            stickyModelName: useChatBrain ? undefined : sticky?.modelName,
            stickyPinnedSource: useChatBrain ? undefined : sticky?.pinnedSource,
            history,
            onAttemptReset: () => {
              // Reset stream buffers for the next attempt, but keep the last good
              // visible reply so deepen/retry does not wipe the bubble (flicker).
              streamedPartial = '';
              sawToken = Boolean(lastGoodLive);
              if (idleTimer) window.clearTimeout(idleTimer);
              if (!lastGoodLive) {
                setMessages(prev => {
                  if (routeChatIdRef.current !== activeChatId) return prev;
                  const next = prev.map(m => (
                    m.id === assistantId
                      ? { ...m, content: `__generating__:chat:${statusLabel}` }
                      : m
                  ));
                  messagesRef.current = next;
                  return next;
                });
              }
            },
            onChunk: prefs.streamResponses
              ? (piece) => {
              if (abandoned || stopRequestedRef.current || mySeq !== genSeqRef.current) return;
              if (!piece) return;
              streamedPartial += piece;
              const usable = usableAssistantText(streamedPartial, content, previousAssistant);
              const rawTrim = streamedPartial.trim();
              // Never fall back to a canned greeting flash on a non-greeting ask.
              const live = usable
                || (
                  rawTrim
                  && !isCannedGreetingReply(rawTrim, content)
                  && !looksLikePromptEcho(rawTrim)
                    ? rawTrim
                    : ''
                );
              const liveClean = live && !looksLikePromptEcho(live) ? live : '';
              if (liveClean) {
                // Keep the first solid streamed answer stable across failover hops.
                // Only grow lastGoodLive when the new text continues the same reply.
                if (!lastGoodLive) {
                  lastGoodLive = liveClean;
                } else if (liveClean.startsWith(lastGoodLive.slice(0, Math.min(40, lastGoodLive.length)))) {
                  lastGoodLive = liveClean;
                }
                sawToken = true;
              }
              // Fast-fail when the model is only re-emitting the system prompt.
              if (
                !liveClean
                && !lastGoodLive
                && looksLikePromptEcho(streamedPartial)
                && streamedPartial.trim().length > 140
                && !abandoned
              ) {
                abandoned = true;
                void engineGenerateCancel();
                chatTurnCtlRef.current.clearGenerating();
                earlyResolve?.({
                  reply: 'Model echoed its system prompt. Try switching models and send again.',
                });
                return;
              }
              const display = lastGoodLive || liveClean || `__generating__:chat:${statusLabel}`;
              setMessages(prev => {
                // Don't stream another thread onto a blank New Chat / different recent.
                if (routeChatIdRef.current !== activeChatId) {
                  if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
                  persistTimerRef.current = window.setTimeout(() => {
                    const liveMsg = {
                      ...assistantMsg,
                      content: display,
                    };
                    persistModeThread(mode, [...normalized, userMsg, liveMsg], {
                      chatId: activeChatId,
                    });
                  }, 220);
                  return prev;
                }
                const next = prev.map(m => {
                  if (m.id !== assistantId) return m;
                  // Never flip back to a status label once real answer text has landed (stops flicker).
                  return { ...m, content: display };
                });
                messagesRef.current = next;
                messagesChatIdRef.current = activeChatId;
                if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
                const snapshot = next;
                const persistTo = activeChatId;
                persistTimerRef.current = window.setTimeout(() => {
                  persistModeThread(mode, snapshot, {
                    chatId: persistTo,
                  });
                }, 220);
                return next;
              });
              armStreamIdleFinish();
            }
              : undefined,
          });
          const races: Promise<{ reply: string; full: Awaited<typeof routePromise> | null }>[] = [
            routePromise.then(r => ({ reply: r.reply, full: r as Awaited<typeof routePromise> })),
            earlyDone.then(r => ({ reply: r.reply, full: null })),
            new Promise((_, reject) => {
              window.setTimeout(() => reject(new Error('Response timed out. Try again or pick another model.')), timeoutMs);
            }),
          ];
          if (prefs.streamResponses) {
            races.push(new Promise((_, reject) => {
              window.setTimeout(() => {
                if (mySeq !== genSeqRef.current) {
                  reject(new Error('superseded'));
                  return;
                }
                if (abandoned || stopRequestedRef.current) {
                  reject(new Error('Generation stopped'));
                  return;
                }
                if (!sawToken) {
                  if (streamedPartial.trim() && looksLikePromptEcho(streamedPartial)) {
                    reject(new Error('Model echoed its system prompt. Try again or pick another model.'));
                  } else {
                    reject(new Error('No response yet. Try again or pick another model.'));
                  }
                }
              }, firstTokenMs);
            }));
          }
          const routed = await Promise.race(races);
          if (idleTimer) window.clearTimeout(idleTimer);
          // Release Stop as soon as we have a usable reply. don't wait on trailing work.
          chatTurnCtlRef.current.clearGenerating();
          const rawReply = stopRequestedRef.current && streamedPartial
            ? streamedPartial
            : routed.reply;
          const routedClean = usableAssistantText(rawReply, content, previousAssistant);
          const streamClean = usableAssistantText(streamedPartial, content, previousAssistant);
          // Prefer the longest usable draft so silent retries cannot retract a solid outline.
          const candidates = [routedClean, streamClean, lastGoodLive, String(rawReply || '').trim(), streamedPartial.trim()]
            .map(s => String(s || '').trim())
            .filter(s => s && !looksLikePromptEcho(s));
          candidates.sort((a, b) => b.length - a.length);
          response = candidates[0] || '';
          const candidate = String(rawReply || streamedPartial || lastGoodLive || '').trim();
          if (!response && candidate && !looksLikePromptEcho(candidate)) {
            response = candidate;
          }
          // Continuity: if the user already read a solid streamed reply, don't swap it for an
          // unrelated failover/sanitize draft (that is the hello→wipe→different-hello flicker).
          {
            const live = String(lastGoodLive || '').trim();
            const final = String(response || '').trim();
            if (live.length >= 24 && final && final !== live && !looksLikePromptEcho(live)) {
              const prefixLen = Math.min(48, live.length, final.length);
              const sameFamily = prefixLen >= 12
                && (final.startsWith(live.slice(0, prefixLen)) || live.startsWith(final.slice(0, prefixLen)));
              if (!sameFamily) {
                response = live;
              }
            }
          }
          if (looksLikeThreadSummaryAsk(content)) {
            // Prefer persisted thread for THIS chat — messagesRef can lag right after a Recent switch.
            let threadMsgs = messagesRef.current.filter(m => m.id !== assistantId);
            if (activeChatId) {
              try {
                const raw = localStorage.getItem(chatThreadKey(activeChatId));
                if (raw) {
                  const parsed = JSON.parse(raw);
                  const list = Array.isArray(parsed) ? parsed : [];
                  if (list.length >= threadMsgs.length) {
                    threadMsgs = list.filter((m: ChatMessage) => m.id !== assistantId);
                  }
                }
              } catch { /* keep threadMsgs */ }
            }
            let localSummary = buildThreadSummaryFromMessages([
              ...threadMsgs,
              { role: 'user', content },
            ]);
            // If the in-memory thread is empty after a Recent switch, rebuild from persisted mode thread.
            if (/still short/i.test(localSummary) && activeChatId) {
              try {
                const raw = localStorage.getItem(chatThreadKey(activeChatId));
                if (raw) {
                  const parsed = JSON.parse(raw);
                  const list = Array.isArray(parsed) ? parsed : (parsed?.messages || []);
                  if (Array.isArray(list) && list.length) {
                    localSummary = buildThreadSummaryFromMessages([
                      ...list.filter((m: ChatMessage) => m.id !== assistantId),
                      { role: 'user', content },
                    ]);
                  }
                }
              } catch { /* keep localSummary */ }
            }
            const userBits = [
              ...threadMsgs.filter(m => m.role === 'user').map(m => String(m.content || '')),
            ]
              .map(t => t.replace(/<!--[\s\S]*?-->/g, '').trim())
              .filter(Boolean)
              .slice(-8);
            const mentionsThread = userBits.some((u) => {
              const tokens = u.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4).slice(0, 10);
              return tokens.some((w) => response.toLowerCase().includes(w));
            });
            const thin = !response.trim()
              || response.trim().length < 48
              || looksLikePromptEcho(response)
              || /Would you like more information on any of these steps/i.test(response);
            if (thin || !mentionsThread) {
              response = localSummary;
            }
          }
          if (
            looksLikeCopyPasteCodeAsk(content)
            && mode !== 'image'
            && mode !== 'video'
            && (!response.trim() || (!/```[\s\S]+```/.test(response) && response.length < 100))
          ) {
            response = 'No copy-pasteable code yet. Try a stronger model in **Models** or **Local AI**, then ask again.';
          }
          if (routed.full) {
            resolvedProvider = routerProviderLabel(routed.full, providerLabel);
            const hopNote = failoverChipText(routed.full, pinnedModel);
            if (hopNote) setFailoverNote(hopNote);
            if (routed.full.ipcFallback) setIpcFallbackDev(true);
            if (pinnedModel.source === 'auto' && routed.full.source !== 'none') {
              const saveKind =
                mode === 'code' || looksLikeCodeAsk(content) ? 'coding' : threadKind;
              const nextBrain = saveAutoThreadBrain(
                activeChatId,
                saveKind,
                routed.full,
                threadBrainRef.current,
                routed.full.attempted?.length ?? 0,
              );
              if (nextBrain) setThreadBrain(nextBrain);
            }
            if (pinnedModel.source === 'local' && pinnedModel.id !== 'NOVA-auto') {
              setLocalPrefs({ lastChatModelId: pinnedModel.id });
            }
          }
          usedPlugin = true;
          }
        } catch (err) {
          if (idleTimer) window.clearTimeout(idleTimer);
          abandoned = true;
          void engineGenerateCancel();
          chatTurnCtlRef.current.clearGenerating();
          const timedOut = err instanceof Error && /timed out/i.test(err.message);
          const rawErr = stopRequestedRef.current && streamedPartial
            ? usableAssistantText(streamedPartial, content, previousAssistant) || ''
            : streamedPartial.trim().length > 8
              ? usableAssistantText(streamedPartial, content, previousAssistant)
                || (looksLikePromptEcho(streamedPartial) ? '' : '')
              : (timedOut
                ? 'Response timed out. Try again or pick another model.'
                : (err instanceof Error ? err.message : 'NOVA Router failed'));
          response = classifyErrorMessage(rawErr || (timedOut
            ? 'Response timed out. Try again or pick another model.'
            : 'Stopped.')).message;
          usedPlugin = true;
        }
      }
      } finally {
        if (idleTimer) window.clearTimeout(idleTimer);
        chatTurnCtlRef.current.clearGenerating();
      }

      // Prefer applying UI/build patches from the RAW reply even if a newer send bumped genSeq
      // (New Chat) — otherwise Preview stays stale while the bubble says done.
      // Always apply to THIS turn's captured folder — never live refs after a chat switch.
      const rawReplyForDiskEarly = String(response || '');
      const diskBoundEarly = Boolean(turnDiskRoot || turnProjectId);
      const keepBuildingDiskEarly = looksLikeKeepBuildingAsk(content) && diskBoundEarly;
      const isUiEditAskEarly = looksLikeCodeEditAsk(content)
        || looksLikeImplementGo(content)
        || looksLikeGreenfieldStartWorkGo(content)
        || keepBuildingDiskEarly;
      const wantsDiskPatchEarly = isUiEditAskEarly || keepBuildingDiskEarly;
      if (
        wantsDiskPatchEarly
        && diskBoundEarly
        && !isMediaMode
        && !pluginId
        && rawReplyForDiskEarly.trim().length > 8
      ) {
        try {
          const { applyChatReplyEdits } = await import('@/lib/chatAgentApply');
          let filesForPatch = { ...turnStudioFiles };
          const root = turnDiskRoot;
          if (root) {
            const hydrated = await loadPreviewFilesFromDisk(root);
            if (Object.keys(hydrated).length) {
              filesForPatch = { ...hydrated, ...filesForPatch };
            }
          }
          const applied = await applyChatReplyEdits({
            reply: rawReplyForDiskEarly,
            projectId: turnProjectId,
            projectName: studioPathBasename(root || '') || undefined,
            files: filesForPatch,
            userMessage: content,
            diskRoot: root,
          });
          if (applied.ok && applied.updated.length) {
            // Only mutate live studio if still bound to this turn's chat/folder.
            const stillSameRoot = String(chatStudioDiskRootRef.current || '') === String(root || '')
              && (!routeChatIdRef.current || routeChatIdRef.current === activeChatId);
            if (stillSameRoot) {
              setChatStudioFiles(applied.files);
              chatStudioFilesRef.current = applied.files;
            }
            if (activeChatId) {
              setChatCodePill(activeChatId, true);
              persistStudioSnapshot(activeChatId, {
                files: applied.files,
                projectId: turnProjectId,
                name: studioPathBasename(root || '') || undefined,
                diskRoot: root,
                previewUrl: stillSameRoot ? previewUrlRef.current : null,
              });
            }
            if (stillSameRoot) void pushLivePreview(applied.files, false);
            response = finalizeCodingChatBubble({
              userMessage: content,
              rawReply: rawReplyForDiskEarly,
              changedPaths: applied.updated,
              applied: true,
              editMode: true,
            });
          } else if (applied.error && applied.error !== 'no_edits') {
            response = [
              String(response || '').trim(),
              '',
              `Could not apply file changes: ${applied.error || applied.reply || 'write failed'}.`,
            ].filter(Boolean).join('\n').trim();
          }
        } catch {
          /* fall through */
        }
      }

      // Newer send/New Chat bumped genSeq — still commit this turn into the origin chat.
      if (mySeq !== genSeqRef.current) {
        const orphan = String(response || '').trim()
          || (stopRequestedRef.current ? '(stopped)' : '');
        if (orphan) {
          chatTurnCtlRef.current.finalizeAssistant(orphan, resolvedProvider, lastLibraryId);
        }
        return;
      }

      if (!isMediaMode && !pluginId && !skipReplySanitize) {
        // Disk apply already attempted above; sanitize for the bubble only.
        const cleaned = usableAssistantText(response, content, previousAssistant);
        const candidate = String(cleaned || response || '').trim();
        response = looksLikePromptEcho(candidate) ? '' : (cleaned || candidate);
        const diskBoundNow = Boolean(chatStudioDiskRootRef.current || chatStudioProjectIdRef.current);
        const pendingIdeaNow = getLastPendingGreenfield(activeChatId);
        const keepBuildingDisk = looksLikeKeepBuildingAsk(content) && diskBoundNow;
        const isUiEditAsk = looksLikeCodeEditAsk(content)
          || looksLikeImplementGo(content)
          || looksLikeGreenfieldStartWorkGo(content)
          || keepBuildingDisk;
        const planningTurn = !isUiEditAsk && !looksLikeSideQuestAsk(content) && (
          shouldInjectPlanningConversation(content, {
            pendingIdea: Boolean(pendingIdeaNow),
            diskRoot: chatStudioDiskRootRef.current || null,
          }) || wantsPlanningOnly(content) || looksLikeConversationalPlanningAsk(content)
        );
        const wantsDiskPatch = isUiEditAsk || keepBuildingDisk;
        const looksLikeDump = /@@@FILE|<!DOCTYPE\b|<html[\s>]|```|export\s+default\s+function|className=|^\s*return\s*\(/im.test(response)
          || ((response.match(/[{};]/g) || []).length >= 10)
          || /\bstruct\s+ContentView\b|\bimport\s+SwiftUI\b/i.test(response);
        const mostlyPlanOutline = response.length > 200
          && ((response.match(/^\s*(?:\d+\.|[-*•])/gm) || []).length >= 2)
          && !/@@@FILE|export\s+default\s+function|className=/i.test(response);
        if (looksLikeDump && !looksLikeCopyPasteCodeAsk(content) && !mostlyPlanOutline) {
          response = finalizeCodingChatBubble({
            userMessage: content,
            rawReply: response,
            // Build/edit: keep work-oriented copy. Planning: prose only.
            editMode: Boolean(isUiEditAsk || (!planningTurn && (diskBoundNow || looksLikeCodeAsk(content) || wantsDiskPatch))),
          });
        }
        if (planningTurn) {
          const { scrubPlanningReply } = await import('@/lib/chatPlanMode');
          response = scrubPlanningReply(response);
        }
        if (looksLikeSideQuestAsk(content)) {
          response = scrubSideQuestBleed(response, content);
          if (looksLikeLyricsAsk(content) && looksLikeInventedLyricsDump(response)) {
            response = honestLyricsUnavailableReply(content);
          } else if (
            looksLikeThinSideQuestReply(response, content)
            || !String(response || '').trim()
          ) {
            response = fallbackAnswerFromLookup(content, sideQuestLookup || { text: '', sources: [], ok: false });
          }
        }
      }
      if (
        !String(response || '').trim()
        && looksLikeDirectJudgmentAsk(content)
      ) {
        // #8 — Never invent MVP advice when there is no live model.
        let liveCap = capacity;
        try {
          liveCap = await probeLiveCapacity();
        } catch { /* keep */ }
        if (liveCap && !liveCap.liveChat) {
          response = honestNoLiveChatReply();
        } else {
        const mapsAsk = /\b(?:google\s*maps|maps?\s+app|map\s+app|navigation\s+app)\b/i.test(content);
        response = mapsAsk
          ? [
            '**How fast:** for a focused MVP (core map view + a couple of layers), a usable beta is often about **3–8 weeks** of steady work — longer if you need heavy offline data, turn-by-turn, or polished mobile releases.',
            '',
            '**Worth building?** **Yes as a personal / niche project** if you care about the craft or a specific use case Google Maps does not cover. As a broad public “Google Maps competitor,” it is harder — the market already has strong apps, so you need a clear niche (private property maps, specialty layers, offline-first, etc.) and real testers.',
            '',
            'Want to lock the niche and a one-month beta scope next?',
          ].join('\n')
          : [
            '**How fast:** a focused MVP is often a few steady weeks; polish and edge cases take longer.',
            '',
            '**Worth building?** Yes if you have a clear niche and real users in mind — not if you are only chasing a crowded generic market.',
            '',
            'Want to lock scope for a one-month beta next?',
          ].join('\n');
        }
      }
      if (stopRequestedRef.current && !response.trim()) {
        response = '(stopped)';
      }
      if (!String(response || '').trim()) {
        if (isMediaMode) {
          response = 'Generation did not finish. Try sending again.';
        } else {
          let liveCap = capacity;
          try {
            liveCap = await probeLiveCapacity();
          } catch { /* keep */ }
          response = (liveCap && !liveCap.liveChat)
            ? honestNoLiveChatReply()
            : 'I couldn’t finish that answer. Check **Models** for a local brain or cloud key, then send again.';
        }
      }

      // Final continuity lock: never flash a different paragraph over what already streamed
      // unless this turn deliberately rewrote for disk apply / coding dump cleanup.
      {
        const live = String(lastGoodLive || '').trim();
        const final = String(response || '').trim();
        const intentionalRewrite = /I applied those updates on disk|Updating your project files on disk|I updated the project files/i.test(final);
        if (
          !isMediaMode
          && !pluginId
          && !intentionalRewrite
          && live.length >= 24
          && final
          && final !== live
          && !looksLikePromptEcho(live)
        ) {
          const prefixLen = Math.min(48, live.length, final.length);
          const sameFamily = prefixLen >= 12
            && (final.startsWith(live.slice(0, prefixLen)) || live.startsWith(final.slice(0, prefixLen)));
          if (!sameFamily) response = live;
        }
      }

      chatTurnCtlRef.current.finalizeAssistant(response, resolvedProvider, lastLibraryId);

      if (mode === 'general') {
        try {
          await saveChatMessage(null, 'user', content);
          await saveChatMessage(null, 'assistant', slimChatContent(response, lastLibraryId), resolvedProvider);
        } catch {
          // offline / guest ok
        }
      }

      // Flush the next queued prompt immediately once Stop is cleared.
      window.setTimeout(() => {
        if (mySeq === genSeqRef.current) flushQueuedSend();
      }, 0);
    })();
  };

  sendMessageRef.current = sendMessage;

  useEffect(() => {
    const onContinue = () => {
      setComposerMode('agent');
      setInput('Continue');
      void sendMessageRef.current('Continue');
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

  const applyIdea = (label: string) => {
    setInput(label);
    focusComposerIfSafe(textareaRef.current);
  };

  const viewingChatId = route.name === 'chat' ? route.chatId : undefined;
  // Explore / idea grid only for brand-new chats. never when a Recent thread is open.
  const showEmpty = !loading && messages.length === 0 && !viewingChatId;

  const voiceBusy = generating
    || voicePhase === 'listening'
    || voicePhase === 'thinking'
    || voicePhase === 'speaking';
  const showOpenThread = !loading && Boolean(viewingChatId);
  const ModelSourceIcon = activeModel.source === 'cloud' ? Cloud : Cpu;
  const kind = kindForMode(mode);
  const keyedCloud = CLOUD_CHAT_WHEN_KEYED.filter(
    m => hasProviderApiKey(m.keyId) && isCloudProviderEnabled(m.keyId),
  );
  const modelsForTab: ChatModelOption[] = kind === 'chat'
    ? [
        ...CHAT_MODELS.filter(m => m.kind === 'chat'),
        ...engineLocalModels,
        ...keyedCloud,
        ...ollamaModels,
      ]
    : kind === 'image'
      ? CHAT_MODELS.filter(m => {
          if (m.kind !== 'image') return false;
          if (m.id === 'dall-e-3') return hasProviderApiKey('openai');
          return true;
        })
      : CHAT_MODELS.filter(m => m.kind === 'video');
  const autoModels = modelsForTab.filter(m => m.source === 'auto');
  const localModels = modelsForTab.filter(m => m.source === 'local' && !engineInstallingModels.some(i => i.id === m.id));
  const installingModels = kind === 'chat' ? engineInstallingModels : [];
  const cloudModels = modelsForTab.filter(m => m.source === 'cloud');

  const modelMenu = modelMenuOpen && menuPos
    ? createPortal(
      <div
        ref={modelMenuRef}
        className="w-72 max-h-[min(22rem,calc(100vh-6rem))] overflow-y-auto rounded-xl border border-surface-border bg-ark-navy-900 shadow-2xl shadow-black/50 py-1.5"
        style={{
          position: 'fixed',
          left: menuPos.left,
          ...(menuPos.top != null ? { top: menuPos.top } : { bottom: menuPos.bottom }),
          zIndex: 99999,
        }}
      >
        {autoModels.length > 0 && (
          <>
            <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-content-tertiary font-semibold">
              Recommended
            </p>
            {autoModels.map(model => (
              <button
                key={model.id}
                type="button"
                onClick={() => {
                  setActiveModel(model);
                  if (model.kind === 'chat') {
                    setLocalPrefs({
                      defaultModelId: 'NOVA-auto',
                      lastChatModelId: undefined,
                      aiMode: 'automatic',
                      autoFailover: true,
                    });
                  }
                  setModelMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-hover"
              >
                <span className="w-7 h-7 flex items-center justify-center shrink-0 text-content-primary">
                  <ArkMark className="w-6 h-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-content-primary truncate">{model.name}</span>
                  <span className="block text-[11px] text-content-tertiary truncate">
                    {autoEquippedCaption(threadBrain) || 'Multi-model · including vision for builds'}
                  </span>
                </span>
                {activeModel.id === model.id && <Check className="w-4 h-4 text-ark-accent-green shrink-0" />}
              </button>
            ))}
            <div className="my-1.5 border-t border-surface-border" />
          </>
        )}
        {localModels.length > 0 && (
          <>
            <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-content-tertiary font-semibold">
              {mode === 'image' ? 'Image models' : mode === 'video' ? 'Video models' : 'Ready'}
            </p>
            {localModels.map(model => (
              <button
                key={model.id}
                type="button"
                onClick={() => {
                  setActiveModel(model);
                  if (model.kind === 'chat') {
                    unpickAutoSticky();
                    if (!model.id.startsWith('ollama:')) {
                      void setEngineModel(model.id).catch(() => undefined);
                    }
                    setLocalPrefs({ lastChatModelId: model.id, defaultModelId: model.id });
                  } else if (model.source !== 'auto') {
                    unpickAutoSticky();
                  }
                  setModelMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-hover"
              >
                <span className="w-7 h-7 flex items-center justify-center shrink-0 text-emerald-400">
                  <Cpu className="w-3.5 h-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-content-primary truncate">{model.name}</span>
                  {model.detail ? <span className="block text-[11px] text-content-tertiary truncate">{model.detail}</span> : null}
                </span>
                {activeModel.id === model.id && <Check className="w-4 h-4 text-ark-accent-green shrink-0" />}
              </button>
            ))}
          </>
        )}
        {installingModels.length > 0 && (
          <>
            <div className="my-1.5 border-t border-surface-border" />
            <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-content-tertiary font-semibold">
              Installing
            </p>
            {installingModels.map(model => (
              <div
                key={model.id}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left opacity-80"
              >
                <span className="w-7 h-7 flex items-center justify-center shrink-0 text-amber-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-content-primary truncate">{model.name}</span>
                  {model.detail ? <span className="block text-[11px] text-content-tertiary truncate">{model.detail}</span> : null}
                </span>
              </div>
            ))}
          </>
        )}
        {(() => {
          const notReadyLocal = modelsForTab.filter(m =>
            m.source === 'local'
            && m.id !== 'NOVA-auto'
            && !engineReadyIds.has(m.id)
            && !installingModels.some(i => i.id === m.id)
            && !localModels.some(l => l.id === m.id),
          );
          if (!notReadyLocal.length) return null;
          return (
            <>
              <div className="my-1.5 border-t border-surface-border" />
              <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-content-tertiary font-semibold">
                Not installed
              </p>
              {notReadyLocal.map(model => (
                <div
                  key={model.id}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left opacity-90"
                >
                  <span className="w-7 h-7 flex items-center justify-center shrink-0 text-content-tertiary">
                    <Cpu className="w-3.5 h-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-content-primary truncate">{model.name}</span>
                    {model.detail ? <span className="block text-[11px] text-content-tertiary truncate">{model.detail}</span> : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setModelMenuOpen(false);
                      navigate({ name: 'local-ai' });
                    }}
                    className="text-[10px] text-sky-400 hover:text-sky-300 shrink-0"
                  >
                    Install
                  </button>
                </div>
              ))}
            </>
          );
        })()}
        {cloudModels.length > 0 && (
          <>
            {(autoModels.length > 0 || localModels.length > 0 || installingModels.length > 0) && (
              <div className="my-1.5 border-t border-surface-border" />
            )}
            <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-content-tertiary font-semibold">Cloud</p>
            {cloudModels.map(model => (
              <button
                key={model.id}
                type="button"
                onClick={() => {
                  setActiveModel(model);
                  if (model.kind === 'chat') {
                    unpickAutoSticky();
                    setLocalPrefs({
                      lastChatModelId: model.id,
                      // Keep the menu on this cloud pick across remounts / new chats.
                      defaultModelId: model.id,
                    });
                  } else if (model.source !== 'auto') {
                    unpickAutoSticky();
                  }
                  setModelMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-hover"
              >
                <span className="w-7 h-7 flex items-center justify-center shrink-0 text-sky-400">
                  <Cloud className="w-3.5 h-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-content-primary truncate">{model.name}</span>
                  {model.detail ? <span className="block text-[11px] text-content-tertiary truncate">{model.detail}</span> : null}
                </span>
                {activeModel.id === model.id && <Check className="w-4 h-4 text-ark-accent-green shrink-0" />}
              </button>
            ))}
          </>
        )}
        {kind === 'chat' && keyedCloud.length === 0 && ollamaModels.length === 0 && engineLocalModels.length === 0 && (
          null
        )}
        {activeModel.source !== 'auto' && activeModel.kind === 'chat' && (
          <div className="border-t border-surface-border mt-1 pt-1 px-2 pb-1">
            <button
              type="button"
              className="w-full rounded-lg px-2 py-1.5 text-[11px] text-sky-300 hover:bg-sky-500/10 text-left"
              onClick={() => {
                setLocalPrefs({ defaultModelId: activeModel.id, lastChatModelId: activeModel.id });
                setModelMenuOpen(false);
              }}
            >
              Always use {activeModel.name} for new chats
            </button>
          </div>
        )}
        {kind === 'chat' && (
          <div className="border-t border-surface-border mt-1 pt-1 px-2 pb-1">
            <button
              type="button"
              className="w-full inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] text-content-secondary hover:bg-surface-hover hover:text-content-primary text-left"
              onClick={() => {
                setModelMenuOpen(false);
                navigate({ name: 'models', tab: 'cloud' });
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              Add or manage connected models
            </button>
          </div>
        )}
      </div>,
      document.body,
    )
    : null;

  const failoverChip = failoverNote ? (
    <div className="mb-2 flex justify-center gap-2 flex-wrap">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 pl-2.5 pr-1 py-0.5 text-[11px] text-sky-300/95">
        {failoverNote}
        <button
          type="button"
          onClick={() => setFailoverNote(null)}
          className="w-5 h-5 rounded-full flex items-center justify-center text-sky-400/80 hover:text-sky-200 hover:bg-sky-500/20 transition-colors"
          aria-label="Dismiss"
          title="Dismiss"
        >
          <X className="w-3 h-3" />
        </button>
      </span>
      {import.meta.env.DEV && ipcFallbackDev && (
        <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] text-amber-300/95">
          IPC fallback · brain HTTP
        </span>
      )}
    </div>
  ) : import.meta.env.DEV && ipcFallbackDev ? (
    <div className="mb-2 flex justify-center">
      <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] text-amber-300/95">
        IPC fallback · brain HTTP
      </span>
    </div>
  ) : null;

  const composer = (
    <div className="w-full max-w-3xl mx-auto min-w-0">
      {failoverChip}
      <div className="flex flex-col min-w-0 w-full">
        <div className="min-w-0 flex flex-col w-full">
          {attachUploading && (
            <p className="mb-2 px-1 text-[11px] text-sky-300/90 animate-pulse truncate">{attachUploading}</p>
          )}
          {pendingAttaches.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1 max-w-full overflow-hidden">
              {pendingAttaches.map(meta => (
                <span key={attachKey(meta)} className="inline-flex items-center gap-1">
                  <AttachCard meta={meta} />
                  <button
                    type="button"
                    className="text-[10px] text-content-tertiary hover:text-content-secondary"
                    onClick={() => removePendingAttach(meta)}
                    aria-label={`Remove ${meta.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {pendingAttaches.length > 1 && (
                <button
                  type="button"
                  className="text-[10px] text-content-tertiary hover:text-content-secondary"
                  onClick={() => {
                    setPendingAttaches([]);
                    setChatStudioFiles({});
                    setChatStudioProjectId(null);
                    setPendingImages([]);
                  }}
                >
                  Clear all
                </button>
              )}
            </div>
          )}
          {dictating ? (
            <p className="mb-2 px-1 text-[11px] text-rose-300/90 animate-pulse">
              Listening… speak now, then click the mic again when you’re done.
            </p>
          ) : dictationHint ? (
            <p className="mb-2 px-1 text-[11px] text-amber-300/90 break-words [overflow-wrap:anywhere] line-clamp-2">
              {dictationHint}
            </p>
          ) : null}
          {pendingImages.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
              {pendingImages.map(img => (
                <span
                  key={img.id}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-surface-border bg-ark-navy-900/80 pl-1 pr-1.5 py-1 text-[10px] text-content-secondary"
                >
                  <img src={img.dataUrl} alt="" className="w-8 h-8 rounded-md object-cover" />
                  <span className="max-w-[7rem] truncate">{img.name}</span>
                  <button
                    type="button"
                    className="text-content-tertiary hover:text-content-primary"
                    aria-label={`Remove ${img.name}`}
                    onClick={() => setPendingImages(prev => prev.filter(p => p.id !== img.id))}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {mode === 'video' && (
            <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
              <span className="text-[11px] text-content-tertiary">Clip length</span>
              {([10, 20, 30] as const).map(sec => (
                <button
                  key={sec}
                  type="button"
                  disabled={generating}
                  onClick={() => setVideoDurationSec(sec)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] border transition-colors ${
                    videoDurationSec === sec
                      ? 'border-sky-500/50 bg-sky-500/15 text-sky-100'
                      : 'border-surface-border bg-surface-hover/40 text-content-secondary hover:text-content-primary'
                  }`}
                >
                  {sec}s
                </button>
              ))}
              
            </div>
          )}
          <div className="flex gap-2 min-w-0 items-end">
          <div className="flex flex-col items-center justify-end shrink-0 self-end w-[1.25rem] select-none pb-1.5">
            {threadSwitching ? (
              <span title="Loading chat" className="inline-flex">
                <Loader2
                  className="w-3.5 h-3.5 text-content-tertiary animate-spin"
                  aria-label="Loading chat"
                />
              </span>
            ) : null}
          </div>
          <div className="flex-1 min-w-0 flex flex-col">
          {dropHint && !attachUploading && (
            <p
              className="mb-2 w-full min-w-0 overflow-hidden text-left text-[11px] text-amber-300/90 break-words [overflow-wrap:anywhere] line-clamp-2"
              title={dropHint}
            >
              {dropHint}
            </p>
          )}
          {pathBindOpen && (
            <div className="mb-2 w-full min-w-0 box-border rounded-xl border border-surface-border bg-ark-navy-900/90 px-2 py-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <Folder className="w-3.5 h-3.5 shrink-0 text-amber-300/90" />
                <input
                  ref={pathBindInputRef}
                  type="text"
                  value={pathBindDraft}
                  onChange={(e) => setPathBindDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void bindTypedPath();
                    }
                    if (e.key === 'Escape') {
                      setPathBindOpen(false);
                      setPathBindDraft('');
                    }
                  }}
                  placeholder="Folder path…"
                  className="min-w-0 flex-1 bg-transparent border-none px-1 py-1 text-xs text-content-primary placeholder:text-content-tertiary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void browseBindFolder()}
                  className="shrink-0 rounded-md px-2 py-1 text-[11px] text-content-secondary hover:bg-surface-hover hover:text-content-primary"
                >
                  Browse
                </button>
                <button
                  type="button"
                  onClick={() => void bindTypedPath()}
                  className="shrink-0 rounded-md bg-amber-500/90 px-2.5 py-1 text-[11px] font-medium text-ark-navy-950 hover:bg-amber-400"
                >
                  Bind
                </button>
                <button
                  type="button"
                  onClick={() => { setPathBindOpen(false); setPathBindDraft(''); }}
                  className="shrink-0 rounded-md p-1 text-content-tertiary hover:text-content-secondary hover:bg-surface-hover"
                  aria-label="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
          <div
            data-ark-composer="1"
            className={`w-full min-w-0 flex flex-col border border-surface-border bg-ark-navy-900 shadow-lg shadow-black/20 overflow-hidden ${
              mode === 'voice' ? 'rounded-2xl' : 'rounded-xl'
            }`}
          >
          {queueLen > 0 && pendingQueueRef.current.length > 0 && (
            <div className="w-full min-w-0 box-border flex flex-col gap-1.5 border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100/90">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {queueLen === 1
                    ? '1 message queued — edit or wait for this reply to finish'
                    : `${queueLen} messages queued — next sends when this reply finishes`}
                </span>
                <button
                  type="button"
                  className="shrink-0 rounded-md px-2 py-0.5 text-amber-200/90 hover:bg-amber-500/20 transition-colors"
                  onClick={() => {
                    pendingQueueRef.current = [];
                    setQueueLen(0);
                    setQueueTick(t => t + 1);
                    editingQueueIdRef.current = null;
                    setEditingQueueId(null);
                    setEditingQueueText('');
                  }}
                >
                  Clear
                </button>
              </div>
              <ul className="space-y-1.5" key={queueTick}>
                {pendingQueueRef.current.map((q, idx) => (
                  <li key={q.id} className="rounded-md border border-amber-500/20 bg-ark-navy-950/40 px-2 py-1.5">
                    {editingQueueId === q.id ? (
                      <div className="flex flex-col gap-1.5">
                        <textarea
                          value={editingQueueText}
                          onChange={e => setEditingQueueText(e.target.value)}
                          rows={2}
                          className="w-full resize-none rounded-md border border-amber-500/30 bg-ark-navy-950 px-2 py-1 text-[12px] text-content-primary outline-none focus:border-amber-400/50"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            className="rounded-md px-2 py-0.5 text-amber-200/80 hover:bg-amber-500/15"
                            onClick={() => {
                              editingQueueIdRef.current = null;
                              setEditingQueueId(null);
                              setEditingQueueText('');
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="rounded-md bg-amber-500/90 px-2.5 py-0.5 font-medium text-ark-navy-950 hover:bg-amber-400"
                            onClick={() => {
                              const text = editingQueueText.trim();
                              if (!text) return;
                              pendingQueueRef.current = pendingQueueRef.current.map(item => (
                                item.id === q.id ? { ...item, text } : item
                              ));
                              setQueueTick(t => t + 1);
                              editingQueueIdRef.current = null;
                              setEditingQueueId(null);
                              setEditingQueueText('');
                              // If the reply already finished while editing, flush now.
                              if (!generatingRef.current) flushQueuedSend();
                            }}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 text-amber-50/90 break-words [overflow-wrap:anywhere]">
                          <span className="text-amber-200/50 mr-1">{idx + 1}.</span>
                          {q.text.length > 160 ? `${q.text.slice(0, 157)}…` : q.text}
                        </span>
                        <button
                          type="button"
                          aria-label="Edit queued message"
                          className="shrink-0 rounded-md px-1.5 py-0.5 text-amber-200/90 hover:bg-amber-500/20"
                          onClick={() => {
                            editingQueueIdRef.current = q.id;
                            setEditingQueueId(q.id);
                            setEditingQueueText(q.text);
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <input
            ref={attachInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".ts,.tsx,.js,.jsx,.mjs,.cjs,.py,.go,.rs,.java,.kt,.swift,.cs,.cpp,.c,.h,.hpp,.rb,.php,.vue,.svelte,.css,.scss,.html,.json,.toml,.yaml,.yml,.md,.sql,.sh,.ps1,image/*,text/*,application/json"
            onChange={e => {
              void onPickCodeFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => {
              void addPendingImages([...(e.target.files || [])]);
              e.target.value = '';
            }}
          />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => onInput(e.target.value)}
            onPaste={onComposerPaste}
            spellCheck
            lang="en"
            autoCorrect="on"
            autoCapitalize="sentences"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                if (Date.now() < ignoreEnterUntilRef.current) {
                  e.preventDefault();
                  return;
                }
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              pendingAttaches.length || Object.keys(chatStudioFiles).length
                ? 'Press Enter to read this, or type an ask…'
                : placeholder
            }
            rows={1}
            title="Enter to send · Shift+Enter for a new line · Ctrl+V pastes screenshots"
            aria-label="Message. Enter to send, Shift+Enter for a new line"
            className="w-full bg-transparent border-none resize-none text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none leading-5 min-h-[2.75rem] px-3 pt-2.5 pb-1"
            style={{ overflowY: 'hidden' }}
          />

          <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-0.5 shrink-0 border-t border-transparent">
            {mode === 'image' && (
              <button
                type="button"
                onClick={() => void pickPhotosIntoChat()}
                className="w-8 h-8 rounded-full flex items-center justify-center text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors shrink-0"
                title="Upload a reference photo to recreate or improve"
                aria-label="Upload reference photo"
              >
                <ImagePlus className="w-4 h-4" />
              </button>
            )}
            <ComposerPlusMenu
              scope={mode === 'image' ? 'image' : 'chat'}
              busy={attachBusy || Boolean(attachUploading)}
              onAction={handlePlusAction}
              buttonClassName="w-8 h-8 rounded-full flex items-center justify-center text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors shrink-0"
            />
            {composerMode ? (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium shrink-0 ${COMPOSER_MODE_PILL[composerMode]}`}
              >
                {COMPOSER_MODE_LABEL[composerMode]}
                <button
                  type="button"
                  onClick={() => setComposerMode(null)}
                  className="opacity-60 hover:opacity-100 -mr-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                  aria-label="Clear mode"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ) : null}
            {(mode === 'general' || mode === 'code') && chatStudioDiskRoot ? (
              <button
                type="button"
                onClick={() => void openProjectFolder()}
                className="inline-flex items-center gap-1 max-w-[11rem] rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-100 hover:bg-amber-500/25 transition-colors shrink-0"
                title={`Open in Explorer:\n${chatStudioDiskRoot}`}
              >
                <Folder className="w-3.5 h-3.5 shrink-0 text-amber-300" />
                <span className="truncate">
                  {`bound: ${workspaceBadgeLabel || chatStudioDiskRoot.split(/[/\\]/).pop()}`}
                </span>
              </button>
            ) : null}
            {(mode === 'general' || mode === 'code') && chatStudioDiskRoot ? (
              <button
                type="button"
                onClick={() => void openProjectPreview()}
                className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/15 px-2.5 py-1 text-xs font-medium text-sky-100 hover:bg-sky-500/25 transition-colors shrink-0"
                title={
                  createJobLive?.status === 'npm'
                    ? 'Installing dependencies…'
                    : (createJobLive?.status === 'ready' && createJobLive.previewUrl)
                      ? `Open live preview (${createJobLive.previewUrl})`
                      : previewUrl
                        ? `Open live preview (${previewUrl})`
                        : 'Open live preview window'
                }
              >
                <Globe className="w-3.5 h-3.5 text-sky-300" />
                {createJobLive?.status === 'npm' ? 'Installing…' : 'Preview'}
              </button>
            ) : null}
            {(mode === 'general' || mode === 'code') && (showStudioPills || codePillSticky || chatStudioDiskRoot) ? (
              <button
                type="button"
                onClick={() => openCodeWorkspace()}
                disabled={!chatStudioDiskRoot && Object.keys(chatStudioFiles).length === 0}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors shrink-0 ${
                  !chatStudioDiskRoot && Object.keys(chatStudioFiles).length === 0
                    ? 'border-violet-500/20 bg-violet-500/10 text-violet-100/40 cursor-not-allowed'
                    : 'border-violet-500/45 bg-violet-500/20 text-violet-100 hover:bg-violet-500/30'
                }`}
                title={
                  generating
                    ? 'Live Code view — watch files update. Editing unlocks when the build finishes.'
                    : 'Open Code. files on the left, editor on the right'
                }
              >
                <Code2 className="w-3.5 h-3.5 text-violet-300" />
                Code
                {generating ? <span className="text-[10px] text-violet-200/80">· live</span> : null}
              </button>
            ) : null}
            <div className="flex-1 min-w-0" aria-hidden />
            <div className="flex items-center gap-1.5 shrink-0">
              {mode !== 'voice' ? (
                <button
                  type="button"
                  onClick={() => toggleComposerDictation()}
                  disabled={generating && !dictating}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                    dictating
                      ? 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/50 animate-pulse'
                      : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
                  } disabled:opacity-40`}
                  title={dictating ? 'Stop listening' : 'Speak — fill the chat box with voice-to-text'}
                  aria-label={dictating ? 'Stop listening' : 'Start voice to text'}
                  aria-pressed={dictating}
                >
                  {dictating ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              ) : null}
              <button
                ref={modelButtonRef}
                type="button"
                onClick={() => setModelMenuOpen(o => !o)}
                className="inline-flex items-center gap-1 rounded-full border border-surface-border bg-ark-navy-800 hover:bg-surface-hover px-2.5 py-1 text-xs text-content-primary transition-colors max-w-[11.5rem]"
                title={`Active model · ${
                  activeModel.source === 'auto'
                    ? (threadBrain ? autoEquippedCaption(threadBrain) : 'Nova Multimodal · multi-model routing')
                    : activeModel.name
                }`}
                aria-label="Select model"
                aria-expanded={modelMenuOpen}
              >
                {mode === 'image' ? (
                  <ImageIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                ) : mode === 'video' ? (
                  <Video className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                ) : activeModel.source !== 'auto' ? (
                  <ModelSourceIcon className={`w-3.5 h-3.5 shrink-0 ${
                    activeModel.source === 'local' ? 'text-emerald-400' : 'text-sky-400'
                  }`} />
                ) : null}
                <span className="font-medium truncate">
                  {activeModel.source === 'auto'
                    ? autoModelLabel
                    : activeModel.name}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-content-tertiary transition-transform shrink-0 ${modelMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {modelMenu}

              {generating && (
                <button
                  type="button"
                  onClick={handleStop}
                  className="flex items-center justify-center shrink-0 p-0.5 text-rose-500 hover:text-rose-400 transition-colors"
                  title="Stop generating"
                  aria-label="Stop generating"
                >
                  <Square className="w-4 h-4 fill-current" />
                </button>
              )}
            </div>
          </div>
          </div>
          </div>

          {(() => {
            const parts = generating ? stackedLiveTurnParts(liveTurnMs) : null;
            return (
              <div className="flex flex-col items-center justify-end shrink-0 self-end gap-1.5 w-[2rem] select-none pb-0.5">
                <div
                  className="min-h-[1.55rem] w-full flex flex-col items-center justify-end tabular-nums leading-none pointer-events-none"
                  title={parts ? `Working · ${parts.label}` : undefined}
                  aria-label={parts ? `Working ${parts.label}` : undefined}
                  aria-live="polite"
                  aria-hidden={!parts || undefined}
                >
                  {parts ? (
                    <>
                      <span className="text-[10px] font-medium text-content-secondary">{parts.top}</span>
                      <span className="text-[10px] text-content-tertiary mt-0.5">{parts.bottom}</span>
                    </>
                  ) : null}
                </div>
                <TokenUsageRing
                  contextRatio={tokenRatio}
                  modelRatio={modelRatio}
                  className="shrink-0"
                  modelName={
                    activeModel.source === 'auto'
                      ? autoModelLabel
                      : activeModel.name
                  }
                  modelDetail={
                    mode === 'image'
                      ? activeModel.source === 'auto'
                        ? autoRingDetail(threadBrain, 'image')
                        : 'Image · session budget'
                      : mode === 'video'
                        ? activeModel.source === 'auto'
                          ? autoRingDetail(threadBrain, 'video')
                          : 'Video · session budget'
                        : activeModel.source === 'auto'
                          ? autoRingDetail(threadBrain, threadKind)
                          : activeModel.source === 'local'
                            ? 'On-device · no cloud quota'
                            : 'Cloud · connected key'
                  }
                />
              </div>
            );
          })()}

          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5 px-1">
        {capacity && !capacity.liveChat && (mode === 'general' || mode === 'code') && (
          <>
            <button
              type="button"
              onClick={() => setFreeKeyOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
              title={
                capacity.suggestedFreeKeys.length
                  ? `Try ${capacity.suggestedFreeKeys.map(k => k.name).join(', ')}`
                  : 'Connect a free key'
              }
            >
              Connect free key
            </button>
            <button
              type="button"
              onClick={() => navigate({ name: 'local-ai' })}
              className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
              title="Install a local GGUF brain"
            >
              Install local brain
            </button>
          </>
        )}
        {capacity && mode === 'image' && !capacity.imageFree && !capacity.openaiImage && (
          <button
            type="button"
            onClick={() => setFreeKeyOpen(true)}
            className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
          >
            Add image key (HF / OpenAI)
          </button>
        )}
        {capacity && mode === 'video' && !capacity.videoFree && (
          <span className="text-[11px] text-amber-400/90">
            Open desktop NOVA Engine for free video routes
          </span>
        )}

        {(mode === 'general' || mode === 'code') && (!capacity || !capacity.liveChat) && (
          <>
            <button
              type="button"
              onClick={() => setGithubPickerOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] text-content-tertiary hover:text-content-secondary transition-colors"
              title="Pick a GitHub repo"
            >
              <Github className="w-3 h-3" />
              My GitHub
            </button>

            <button
              type="button"
              onClick={() => navigate({ name: 'build' })}
              className="inline-flex items-center gap-1.5 text-[11px] text-content-tertiary hover:text-content-secondary transition-colors"
            >
              <Puzzle className="w-3.5 h-3.5" strokeWidth={1.75} />
              {chatPlugins.length ? 'Manage plugins' : 'Add plugins'}
            </button>

            {mode === 'general' && (
              <button
                type="button"
                onClick={() => navigate({ name: 'projects' })}
                className="inline-flex items-center gap-1.5 text-[11px] text-content-tertiary hover:text-content-secondary transition-colors"
              >
                <Briefcase className="w-3.5 h-3.5" strokeWidth={1.75} />
                Open a project
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );

  const ideaGrid = (ideas: typeof IMAGE_IDEAS, uploadLabel?: string) => (
    <div className="w-full max-w-4xl mx-auto mt-6 flex-1 min-h-0 flex flex-col">
      <p className="text-sm font-semibold text-content-primary mb-3 px-1 shrink-0">Explore ideas</p>
      <div className="relative flex-1 min-h-0">
        <div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 h-full overflow-y-auto pb-14"
          style={{
            maskImage: 'linear-gradient(to bottom, #000 0%, #000 78%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 78%, transparent 100%)',
          }}
        >
          {uploadLabel && (
            <button
              type="button"
              className="aspect-square rounded-2xl border border-dashed border-surface-border bg-ark-navy-900/50 hover:bg-surface-hover transition-colors flex flex-col items-center justify-center gap-2 text-content-secondary hover:text-content-primary"
              onClick={() => void pickPhotosIntoChat()}
            >
              <Upload className="w-6 h-6" />
              <span className="text-xs font-medium px-2 text-center">{uploadLabel}</span>
            </button>
          )}
          {ideas.map(idea => (
            <button
              key={idea.id}
              type="button"
              onClick={() => applyIdea(idea.label)}
              className={`aspect-square rounded-2xl border border-surface-border bg-gradient-to-br ${idea.tone} p-3 flex items-end text-left hover:brightness-110 transition-all`}
            >
              <span className="text-xs font-medium text-white/95 drop-shadow">{idea.label}</span>
            </button>
          ))}
        </div>
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-ark-navy-950 via-ark-navy-950/75 to-transparent"
          aria-hidden="true"
        />
      </div>
    </div>
  );

  return (
    <div className="h-full min-w-0 flex flex-col overflow-hidden relative">
      {/* Always mounted. toggling mount caused flicker; only opacity changes. */}
      <div
        className={`absolute inset-0 z-50 flex items-center justify-center bg-black/50 pointer-events-none transition-opacity duration-150 ${
          dragOverChat ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden={!dragOverChat}
      >
        <div className="rounded-2xl border border-sky-400/40 bg-ark-navy-900/95 px-6 py-4 text-center shadow-xl">
          <p className="text-sm font-medium text-content-primary">Drop folder or files</p>
        </div>
      </div>
      {mode === 'voice' && !isVoiceTabEnabled() ? (
        <div className="absolute inset-0 z-40">
          <ParkedNotice feature="voice" />
        </div>
      ) : null}
      {(mode === 'general' || mode === 'voice') ? <ChatModeTabs /> : null}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-content-tertiary">
          <Loader2 className="w-5 h-5 animate-spin text-content-secondary" />
          <p className="text-xs text-content-tertiary">Loading chat…</p>
        </div>
      ) : mode === 'voice' ? (
        <VoiceModeLayout
          phase={voicePhase}
          onActivate={handleVoiceActivate}
          busy={voiceBusy}
          composer={composer}
          brainHint={
            capacity && !capacity.liveChat ? (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-center space-y-2.5">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFreeKeyOpen(true)}
                    className="rounded-full bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 px-3 py-1 text-[11px] font-medium transition-colors"
                  >
                    Connect free key
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'local-ai' })}
                    className="rounded-full bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 px-3 py-1 text-[11px] font-medium transition-colors"
                  >
                    Install local brain
                  </button>
                </div>
              </div>
            ) : undefined
          }
        />
      ) : showEmpty ? (
        mode === 'general' ? (
          <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 pb-16 w-full min-h-0">
            <h1 className="text-2xl sm:text-3xl font-semibold text-content-primary tracking-tight mb-3 text-center">
              {greeting}
            </h1>
            {capacity && !capacity.liveChat && engineInstallingModels.length > 0 && (
              <div className="mb-6 max-w-md w-full px-2">
                <RotatingTip />
              </div>
            )}
            {capacity && !capacity.liveChat && !engineInstallingModels.length && (
              <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
                <button
                  type="button"
                  onClick={() => setFreeKeyOpen(true)}
                  className="rounded-full bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 px-3.5 py-1.5 text-xs font-medium transition-colors"
                >
                  Connect free key
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ name: 'local-ai' })}
                  className="rounded-full bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 px-3.5 py-1.5 text-xs font-medium transition-colors"
                >
                  Install local brain
                </button>
              </div>
            )}
            <div className="w-full max-w-3xl">
              {composer}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col px-4 sm:px-8 pt-[min(12vh,5.5rem)] pb-4 min-h-0 overflow-hidden">
            <div className="shrink-0 flex flex-col items-center w-full max-w-3xl mx-auto">
              <h1 className="text-2xl sm:text-3xl font-semibold text-content-primary tracking-tight mb-8 text-center">
                {greeting}
              </h1>
              {composer}
            </div>
            {mode === 'image' && (
              <>
                {ideaGrid(IMAGE_IDEAS, 'Upload a photo')}
                {creations.filter(c => c.kind !== 'video').length > 0 && (
                  <div className="w-full max-w-4xl mx-auto mt-6">
                    <p className="text-sm font-semibold text-content-primary mb-3 px-1">Your images</p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {creations.filter(c => c.kind !== 'video').slice(0, 12).map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => navigate({
                            name: 'chat',
                            mode: 'image',
                            creationId: c.id,
                          })}
                          className="aspect-square rounded-xl overflow-hidden border border-surface-border bg-ark-navy-900"
                          title={c.title || c.prompt}
                        >
                          {c.dataUrl ? (
                            <img src={c.dataUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="flex h-full items-center justify-center text-[10px] text-content-tertiary">Image</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {mode === 'video' && ideaGrid(VIDEO_IDEAS)}
            {mode === 'code' && (!capacity || !capacity.liveChat) && ideaGrid(CODE_IDEAS)}
          </div>
        )
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="relative flex-1 min-h-0 flex flex-col">
            <div
              ref={messagesScrollRef}
              onScroll={onMessagesScroll}
              onWheel={onMessagesWheel}
              className="flex-1 min-h-0 overflow-auto px-3 sm:px-5 lg:px-8 py-6 NOVA-scroll-quiet"
            >
            <div className="max-w-6xl mx-auto w-full space-y-5">
              {messages.length === 0 && showOpenThread && (
                <div className="text-center py-10 space-y-4">
                  <p className="text-sm text-content-secondary">
                    Type what to build.
                  </p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {FIRST_RUN_KIND_CHIPS.map((chip) => (
                      <button
                        key={chip.label}
                        type="button"
                        className="text-[11px] rounded-full border border-sky-500/35 bg-sky-500/10 text-sky-200 px-3 py-1.5 hover:bg-sky-500/20 transition-colors"
                        onClick={() => void sendMessageRef.current(chip.prompt)}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex gap-3 animate-fade-in w-full ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`text-sm text-content-primary overflow-hidden min-w-0 ${
                      msg.role === 'user'
                        ? 'max-w-[min(48rem,88%)] min-w-0 break-words [overflow-wrap:anywhere] flex flex-col items-end gap-1'
                        : isMediaOnlyContent(msg.content)
                          || (
                            msg.content.startsWith('__generating__:image:')
                            || msg.content.startsWith('__generating__:video:')
                            || msg.content.startsWith('__progress__:')
                          )
                          || (
                            generating
                            && msg.id === messages[messages.length - 1]?.id
                            && (mode === 'image' || mode === 'video')
                          )
                          ? 'shrink-0 max-w-[min(56rem,94%)]'
                          : 'max-w-[min(56rem,94%)] min-w-0 break-words [overflow-wrap:anywhere]'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <>
                        <div className="min-w-0 max-w-full rounded-xl px-3.5 py-2.5 bg-surface-hover text-[13px] leading-5 text-content-primary">
                          <MessageContent
                            content={msg.content}
                            live={false}
                            onPromptChipPick={(prompt) => void sendMessageRef.current(prompt)}
                          />
                        </div>
                        {(() => {
                          const raw = String(msg.content || '').trim();
                          if (!raw) return null;
                          const copied = copiedMsgId === msg.id;
                          return (
                            <button
                              type="button"
                              title={copied ? 'Copied' : 'Copy prompt'}
                              aria-label={copied ? 'Copied' : 'Copy prompt'}
                              className="inline-flex items-center justify-center rounded-md p-1 text-content-tertiary/80 hover:text-content-secondary"
                              onClick={() => {
                                void navigator.clipboard.writeText(raw).then(() => {
                                  setCopiedMsgId(msg.id);
                                  window.setTimeout(() => {
                                    setCopiedMsgId(prev => (prev === msg.id ? null : prev));
                                  }, 1600);
                                }).catch(() => undefined);
                              }}
                            >
                              {copied ? <Check className="w-3.5 h-3.5 text-ark-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          );
                        })()}
                      </>
                    ) : (
                      <>
                    {(() => {
                      const isAssistant = msg.role === 'assistant';
                      const isLast = msg.id === messages[messages.length - 1]?.id;
                      const raw = String(msg.content || '');
                      // Only Image/Video tabs (or explicit image/video generating tags) show media placeholder.
                      // Empty chat bubbles must never become “Creating image”.
                      const showMediaGen = isAssistant && (
                        raw.startsWith('__generating__:image:')
                        || raw.startsWith('__generating__:video:')
                        || (
                          (mode === 'image' || mode === 'video')
                          && isLast
                          && generating
                          && (!raw.trim() || raw.startsWith('__generating__:'))
                          && !raw.includes('![')
                        )
                      );
                      if (showMediaGen) {
                        const genKind = raw.includes(':video:') || mode === 'video' ? 'video' : 'image';
                        const genLabel = raw.startsWith('__generating__:')
                          ? raw.split(':').slice(2).join(':') || undefined
                          : (genKind === 'video' ? 'Creating video' : 'Creating image');
                        return <GeneratingPlaceholder kind={genKind} label={genLabel} sessionKey={msg.id} />;
                      }
                      if (isAssistant && isLikelyErrorMessage(msg.content)) {
                        const errorInfo = classifyErrorMessage(msg.content);
                        return (
                          <ArkErrorInline
                            message={msg.content}
                            onAction={errorInfo.code === 'KEY_MISSING' ? () => setFreeKeyOpen(true) : undefined}
                          />
                        );
                      }
                      return (
                        <MessageContent
                          content={msg.content}
                          live={Boolean(generating && isLast && isAssistant && isTraceMessage(raw))}
                          messageId={msg.id}
                          onPromptChipPick={(prompt) => void sendMessageRef.current(prompt)}
                        />
                      );
                    })()}
                    {(() => {
                      const isAssistant = msg.role === 'assistant';
                      const isLast = msg.id === messages[messages.length - 1]?.id;
                      const raw = String(msg.content || '').trim();
                      const isLiveStreaming = Boolean(
                        isAssistant
                        && isLast
                        && generating
                        && !raw.startsWith('__generating__:'),
                      );
                      // Copy + time + model only after this bubble is finished — never mid-stream.
                      const showReplyMeta = isAssistant
                        && !isLiveStreaming
                        && !raw.startsWith('__generating__:')
                        && Boolean(raw)
                        && !isLikelyErrorMessage(raw)
                        && (
                          typeof msg.elapsed_ms === 'number'
                          || (!generating && Boolean(msg.provider_used))
                          || (!generating && !isLast)
                        );
                      if (!showReplyMeta) return null;
                      const copied = copiedMsgId === msg.id;
                      const timeBit = typeof msg.elapsed_ms === 'number' && msg.elapsed_ms >= 0
                        ? `Responded in ${formatReplyElapsed(msg.elapsed_ms)}`
                        : 'Responded';
                      const modelBit = String(msg.provider_used || '').trim() || 'NOVA';
                      return (
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-content-tertiary tabular-nums">
                          <button
                            type="button"
                            title={copied ? 'Copied' : 'Copy response'}
                            aria-label={copied ? 'Copied' : 'Copy response'}
                            className="inline-flex items-center justify-center rounded-md p-0.5 text-content-tertiary hover:text-content-secondary"
                            onClick={() => {
                              void navigator.clipboard.writeText(raw).then(() => {
                                setCopiedMsgId(msg.id);
                                window.setTimeout(() => {
                                  setCopiedMsgId(prev => (prev === msg.id ? null : prev));
                                }, 1600);
                              }).catch(() => undefined);
                            }}
                          >
                            {copied ? <Check className="w-3.5 h-3.5 text-ark-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <span>
                            {timeBit}
                            {' · '}
                            {modelBit}
                          </span>
                        </div>
                      );
                    })()}
                    {msg.role === 'assistant' && /Stopped at length limit/i.test(msg.content) ? (
                      <button
                        type="button"
                        className="mt-2 text-[10px] rounded-full bg-sky-600 text-white px-2.5 py-1"
                        onClick={() => void sendMessage('Continue the previous answer from where you stopped.')}
                      >
                        Continue from cutoff
                      </button>
                    ) : null}
                    {msg.role === 'assistant' && /Retry with cloud/i.test(msg.content) ? (
                      <button
                        type="button"
                        className="mt-2 text-[10px] rounded-full border border-sky-500/40 text-sky-300 px-2.5 py-1"
                        onClick={() => {
                          setLocalPrefs({ autoFailover: true, askBeforeCloudFailover: false });
                          const lastUser = [...messages].reverse().find(m => m.role === 'user');
                          if (lastUser) void sendMessage(lastUser.content);
                        }}
                      >
                        Retry with cloud
                      </button>
                    ) : null}
                    {msg.role === 'assistant' && getApplySnapshot(routeChatIdRef.current || persistChatIdRef.current || '') ? (
                      <button
                        type="button"
                        className="mt-2 ml-1 text-[10px] rounded-full border border-amber-500/40 text-amber-200 px-2.5 py-1"
                        onClick={() => {
                          void (async () => {
                            const chatId = routeChatIdRef.current || persistChatIdRef.current;
                            if (!chatId) return;
                            const snap = getApplySnapshot(chatId);
                            if (!snap) return;
                            const blocks = snapshotToRevertBlocks(snap);
                            if (!blocks) return;
                            const applied = await applyChatReplyEdits({
                              reply: blocks,
                              projectId: chatStudioProjectIdRef.current,
                              projectName: studioPathBasename(snap.diskRoot || '') || 'project',
                              files: snap.files,
                              userMessage: 'undo last apply',
                              diskRoot: snap.diskRoot,
                            });
                            if (applied.ok) {
                              setChatStudioFiles(applied.files);
                              chatStudioFilesRef.current = applied.files;
                              persistStudioSnapshot(chatId, {
                                files: applied.files,
                                projectId: chatStudioProjectIdRef.current,
                                diskRoot: snap.diskRoot,
                              });
                              clearApplySnapshot(chatId);
                              setDropHint('Undid the last file apply.');
                            }
                          })();
                        }}
                      >
                        Undo last edit
                      </button>
                    ) : null}
                    {msg.role === 'assistant' && /folder access|Allow Documents/i.test(msg.content) ? (
                      <button
                        type="button"
                        className="mt-2 text-[10px] rounded-full border border-emerald-500/40 text-emerald-200 px-2.5 py-1"
                        onClick={() => {
                          setLocalPrefs({ allowDocumentsFolderAccess: true });
                          void syncWorkspaceGrantsFromPrefs();
                          setDropHint('Documents access enabled. Say create again.');
                        }}
                      >
                        Allow Documents
                      </button>
                    ) : null}

                    {msg.role === 'assistant' && githubOfferId === msg.id && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        <button
                          type="button"
                          className="text-[10px] rounded-full bg-sky-600 text-white px-2.5 py-1"
                          onClick={() => setGithubPickerOpen(true)}
                        >
                          Pick a repo
                        </button>
                      </div>
                    )}
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            </div>
            {showJumpToBottom ? (
              <button
                type="button"
                onClick={jumpToBottom}
                title="Jump to latest"
                aria-label="Jump to latest message"
                className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 h-8 w-8 rounded-full border border-white/10 bg-ark-navy-950/75 text-content-tertiary/80 hover:text-content-secondary hover:bg-ark-navy-900/95 hover:border-white/20 backdrop-blur-sm flex items-center justify-center opacity-55 hover:opacity-100 transition-opacity shadow-sm"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            ) : null}
          </div>
          <div className="shrink-0 px-4 sm:px-8 pb-6 pt-2 space-y-2">
            {setupNote && (
              <div className="max-w-3xl mx-auto rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200/90 leading-relaxed flex items-start justify-between gap-3">
                <p>
                  Local brain install had an issue during setup. Use{' '}
                  <button type="button" className="underline hover:text-amber-100" onClick={() => navigate({ name: 'local-ai' })}>
                    Local AI
                  </button>
                  {' '}to retry, or connect a free key.
                </p>
                <button
                  type="button"
                  className="shrink-0 text-amber-300/80 hover:text-amber-100"
                  onClick={() => {
                    try { localStorage.removeItem('ark:setup-brain-note'); } catch { /* ignore */ }
                    setSetupNote(null);
                  }}
                >
                  Dismiss
                </button>
              </div>
            )}
            {composer}
          </div>
        </div>
      )}
      <GitHubRepoPicker
        open={githubPickerOpen}
        onClose={() => setGithubPickerOpen(false)}
        onPick={repo => void clonePickedRepo(repo)}
      />
      <ChatCodeOverlay
        open={codeOverlayOpen}
        onClose={() => setCodeOverlayOpen(false)}
        files={chatStudioFiles}
        readOnly={generating}
        projectName={
          loadChatStudio(route.name === 'chat' ? (route.chatId || '') : '')?.name
          || (chatStudioDiskRoot ? chatStudioDiskRoot.split(/[/\\]/).pop() : undefined)
        }
        onChangeFile={(path, content) => {
          if (generating) return;
          const next = { ...chatStudioFilesRef.current, [path]: content };
          setChatStudioFiles(next);
          chatStudioFilesRef.current = next;
          const chatId = routeChatIdRef.current || persistChatIdRef.current;
          if (chatId) {
            persistStudioSnapshot(chatId, { files: next });
          }
          const root = chatStudioDiskRootRef.current;
          const pid = chatStudioProjectIdRef.current;
          if (root && window.arkDesktop?.workspaceWriteFile) {
            const sep = root.includes('\\') ? '\\' : '/';
            const full = `${root.replace(/[/\\]+$/, '')}${sep}${path.replace(/\//g, sep)}`;
            void window.arkDesktop.workspaceWriteFile({
              targetPath: full,
              content,
            });
          } else if (pid) {
            void import('@/lib/projectWriteSafe').then(({ safeProjectWrite }) => {
              void safeProjectWrite({
                projectId: pid,
                projectName: path,
                files: { [path]: content },
              });
            });
          }
        }}
      />
      <FreeKeyWizard
        open={freeKeyOpen}
        onClose={() => {
          setFreeKeyOpen(false);
          void probeLiveCapacity().then(setCapacity).catch(() => undefined);
        }}
        preferIds={capacity?.suggestedFreeKeys.map(k => k.id)}
      />
      <DeleteProjectFolderModal
        prompt={deleteProjectPrompt}
        busy={deleteProjectBusy}
        onCancel={handleDeleteProjectCancel}
        onConfirm={() => { void handleDeleteProjectConfirm(); }}
      />
      <DeleteFileModal
        prompt={deleteFilePrompt}
        busy={deleteFileBusy}
        onCancel={handleDeleteFileCancel}
        onConfirm={() => { void handleDeleteFileConfirm(); }}
      />
      <DeleteFolderClarifyModal
        prompt={deleteFolderClarifyPrompt}
        busy={deleteFileBusy}
        onCancel={handleFolderClarifyCancel}
        onConfirmFolder={() => { void handleFolderClarifyConfirm(); }}
      />
    </div>
  );
}
