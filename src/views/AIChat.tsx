import { useState, useEffect, useRef, useMemo, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/context/AuthContext';
import { useRouter, type ChatMode } from '@/context/RouterContext';
import { useRecentProjects } from '@/context/RecentProjectsContext';
import { saveChatMessage } from '@/lib/api';
import { getLocalPrefs, hasProviderApiKey, setLocalPrefs } from '@/lib/localPrefs';
import { isCloudProviderEnabled } from '@/lib/cloudSources';
import { resolvePreferredCloudProvider } from '@/lib/cloudChat';
import { honestNoLiveChatReply, probeLiveCapacity, type LiveCapacity } from '@/lib/arkCapacity';
import { tipAt, tipStartIndex } from '@/lib/arkTips';
import { RotatingTip } from '@/components/RotatingTip';
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
} from '@/lib/recentStore';
import { looksLikeCodeAsk, looksLikeImageAsk } from '@/lib/chatIntent';
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
  answerStudio,
  type StudioIntent,
} from '@/lib/studioAnswerEngine';
import {
  attachKey,
  encodeChatAttaches,
  parseChatAttach,
  parseChatAttaches,
  type ChatAttachMeta,
} from '@/lib/chatAttach';
import { allowWindowFileDrop, dropHasFiles, resolveChatDrop } from '@/lib/chatDrop';
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
import { isTraceMessage } from '@/lib/agentTrace';
import { hasFolderAccessGrant, resolveScopedFolderPath, formatFolderLocatedMessage, syncWorkspaceGrantsFromPrefs, resolveWorkFolderPath } from '@/lib/workspaceGrants';
import { saveChatStudio, loadChatStudio, clearChatStudio, setLastListedFolder, getLastListedFolder, clearLastListedFolder, setLastDiskTarget, getLastDiskTarget, clearLastDiskTarget, setLastPendingAddFile, getLastPendingAddFile, clearLastPendingAddFile, setLastPendingGreenfield, getLastPendingGreenfield, clearLastPendingGreenfield, setChatCodePill, hasChatCodePill } from '@/lib/chatStudioStore';
import { runCodeStudioCommand } from '@/lib/studioCommands';
import { applyChatReplyEdits } from '@/lib/chatAgentApply';
import { runProjectMultiAgent, wantsMultiAgentTurn } from '@/lib/arkMultiAgent';
import { beginChatInflight, endChatInflight, hasChatInflight } from '@/lib/chatInflight';
import { looksLikeNsfwAsk, nsfwBlockedReply } from '@/lib/nsfwGate';
import {
  arkSelfHarmBlockedReply,
  isArkProtectedPathOnDisk,
  looksLikeArkSelfHarmAsk,
} from '@/lib/arkSelfGuard';
import { redactArkSelfLeak } from '@/lib/replySanitizer';
import { listenOnce, speakText, stopSpeaking, voiceBrainPrompt, voiceSupported } from '@/lib/voiceSession';
import {
  formatMcpToolsHelp,
  parseMcpCallIntent,
  resolveMcpToolServer,
  callMcpTool,
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
  findBestProductBrief,
  parseNewProjectIntent,
  recoverOriginalUserBrief,
  resolveCreateIntentFromThread,
  resolveProjectKindForCreate,
  slugifyProjectName,
  type ProjectKind,
} from '@/lib/createProjectIntent';
import {
  formatCreateProjectReply,
  runCreateProjectFlow,
  bootstrapProjectWorkspace,
} from '@/lib/createProjectFlow';
import { projectUsesNpm } from '@/lib/projectScaffolds';
import { looksLikeImplementGo, shouldBlockChatFileWrites, planningConversationHint } from '@/lib/chatPlanMode';
import { looksLikeInPlaceRebuildAsk, looksLikeProjectBuildAsk } from '@/lib/chatBuildIntent';
import { isProjectCreateBrief } from '@/lib/chatCreateBrief';
import { briefReadDelayMs, detectPlanFocus, extractGreenfieldName, looksLikeConversationalPlanningAsk, looksLikeDirectJudgmentAsk, looksLikeGreenfieldCreateGo, looksLikeGreenfieldHaveFolder, looksLikeGreenfieldIdea, looksLikeGreenfieldKeepPlanning, looksLikeGreenfieldStartWorkGo, parseGreenfieldIdea, buildMissingWorkFolderReply, shouldInjectPlanningConversation, wantsPlanningOnly } from '@/lib/chatIdeaIntent';
import {
  chatTurnAllowsExec,
  chatTurnAllowsFileEdits,
  hasActiveWorkspace,
  isChatPlanTurn,
  looksLikeCodeEditAsk,
  NO_WORKSPACE_MSG,
  normalizeComposerMode,
  stripComposerPrefix,
  workspacePathLabel,
} from '@/lib/chatAgentTurn';
import {
  buildStudioTraceMessage,
  finalizeCodingChatBubble,
  liveCodingStatusText,
} from '@/lib/chatCodeReply';
import { githubToken } from '@/lib/codeGitHubWorkflow';
import { FreeKeyWizard } from '@/components/FreeKeyWizard';
import { DeleteProjectFolderModal } from '@/components/DeleteProjectFolderModal';
import { DeleteFileModal } from '@/components/DeleteFileModal';
import { DeleteFolderClarifyModal } from '@/components/DeleteFolderClarifyModal';
import { ComposerPlusMenu, type ComposerPlusAction } from '@/components/ComposerPlusMenu';
import { TokenUsageRing } from '@/components/TokenUsageRing';
import { ArkErrorInline } from '@/components/ArkErrorInline';
import { BrandMark } from '@/components/BrandMark';
import { ArkMark } from '@/components/ArkMark';
import { classifyErrorMessage, isLikelyErrorMessage } from '@/lib/errors';
import { isVideoTabEnabled, isCodeTabEnabled, isVoiceTabEnabled } from '@/lib/featurePark';
import { notifyChatDone } from '@/lib/activityIndicators';
import { formatReplyElapsed } from '@/lib/speedTest';
import { getTokenUsageRatio, recordTokenUsage, syncTokenUsage, estimateTokens } from '@/lib/tokenUsage';
import { getModelHealthRatio, recordModelTurn } from '@/lib/modelHealth';
import { prepareBrainRotation } from '@/lib/modelRotation';
import {
  buildRouterHistory,
  looksLikePromptEcho,
  sanitizeAssistantReply,
  usableAssistantText,
  historyWasCompacted,
} from '@/lib/chatHistory';
import {
  looksLikeWebGroundedAsk,
  webSearchForChat,
  formatWebLookupForPrompt,
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
  User as UserIcon, Loader2, ImageIcon, Video, Code2,
  Upload, Cpu, Cloud, ChevronDown, Check, Blocks, Folder, Square, X, ImagePlus,
  Puzzle, Briefcase, Github, Globe, Copy,
} from 'lucide-react';
import { engineGenerateCancel, getEngineStatus, setEngineModel } from '@/lib/arkEngine';
import { ensureViteDevServer, isViteProject, openInAppPreview, ensureInAppPreview, refreshLivePreview } from '@/lib/projectPreview';

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
    ? (route.mode === 'image' || route.mode === 'video' || route.mode === 'voice' ? route.mode : 'general')
    : 'general';
  const go = (next: 'general' | 'image' | 'video' | 'voice') => {
    if (next === 'video' && !isVideoTabEnabled()) return;
    if (next === 'voice' && !isVoiceTabEnabled()) return;
    if (next === 'general') {
      if (route.name === 'chat' && !route.mode && !route.chatId) return;
      navigate({ name: 'chat' });
      return;
    }
    // Already on this Image/Video/Voice thread. keep it (don't wipe an in-progress generate).
    if (route.name === 'chat' && route.mode === next) return;
    // If a generate is still running for this mode, return to that chat instead of a blank canvas.
    try {
      const raw = sessionStorage.getItem('ark:inflight-media');
      const inflight = raw ? JSON.parse(raw) as { chatId?: string; mode?: string } : null;
      if (inflight?.mode === next && inflight.chatId) {
        navigate({ name: 'chat', mode: next, chatId: inflight.chatId });
        return;
      }
    } catch {
      /* ignore */
    }
    navigate({ name: 'chat', mode: next });
  };
  const tabs: { id: 'general' | 'image' | 'video' | 'voice'; label: string }[] = [
    { id: 'general', label: 'Chat' },
    { id: 'image', label: 'Image' },
    { id: 'video', label: 'Video' },
    { id: 'voice', label: 'Voice' },
  ];
  return (
    <div className="shrink-0 flex items-center justify-center gap-1 pt-3 pb-1">
      {tabs.map(t => {
        const parked =
          (t.id === 'video' && !isVideoTabEnabled())
          || (t.id === 'voice' && !isVoiceTabEnabled());
        const soonTitle =
          t.id === 'voice'
            ? 'Voice · coming soon (conversation only — no PC control or builds)'
            : 'Video · coming soon';
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
  { id: 'ark-auto', name: 'ARK', source: 'auto', detail: 'Best brain · stays on for this chat', kind: 'chat' },
  // Image. paths that generate today
  { id: 'ark-auto', name: 'ARK', source: 'auto', detail: 'Best path · stays on for this chat', kind: 'image' },
  { id: 'ark-image-core', name: 'ARK Image Core', source: 'local', detail: 'Free · Pollinations · local SD when installed', kind: 'image' },
  { id: 'sd15-local', name: 'SD 1.5 Local', source: 'local', detail: 'On-device · install from Local AI', kind: 'image' },
  { id: 'sdxl-turbo-local', name: 'SDXL Turbo Local', source: 'local', detail: 'Fast on-device · install from Local AI', kind: 'image' },
  { id: 'flux-schnell-local', name: 'FLUX Schnell Local', source: 'local', detail: 'On-device FLUX · ~13 GB · Local AI', kind: 'image' },
  { id: 'dall-e-3', name: 'DALL·E 3', source: 'cloud', detail: 'Cloud image · OpenAI key', kind: 'image' },
  // Video. ARK Engine only (Pollinations / HF / motion-still). Not Kling or Sora.
  { id: 'ark-auto', name: 'ARK', source: 'auto', detail: 'Best path · stays on for this chat', kind: 'video' },
  { id: 'ark-video-core', name: 'ARK Video Core', source: 'local', detail: 'Free MP4 when the host answers · motion still otherwise', kind: 'video' },
];

/** Cloud chat options. only shown in the picker when that provider key exists. */
const CLOUD_CHAT_WHEN_KEYED: (ChatModelOption & { keyId: string })[] = [
  { id: 'groq-llama', name: 'Llama 3.3 (Groq)', source: 'cloud', detail: 'Free-key · fast', kind: 'chat', keyId: 'groq' },
  { id: 'gemini-flash', name: 'Gemini 2.0 Flash', source: 'cloud', detail: 'Free-key · Google', kind: 'chat', keyId: 'google' },
  { id: 'openrouter-free', name: 'OpenRouter Free', source: 'cloud', detail: 'Free routes', kind: 'chat', keyId: 'openrouter' },
  { id: 'hf-llama', name: 'Llama 3.1 (HF)', source: 'cloud', detail: 'Free-key · Hugging Face', kind: 'chat', keyId: 'huggingface' },
  { id: 'nvidia-llama', name: 'Llama 3.1 (NIM)', source: 'cloud', detail: 'Free-key · NVIDIA', kind: 'chat', keyId: 'nvidia' },
  { id: 'together-llama', name: 'Llama 3.1 (Together)', source: 'cloud', detail: 'Free-key · Together', kind: 'chat', keyId: 'together' },
  { id: 'fireworks-llama', name: 'Llama 3.1 (Fireworks)', source: 'cloud', detail: 'Free-key · Fireworks', kind: 'chat', keyId: 'fireworks' },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', source: 'cloud', detail: 'Free-key · DeepSeek', kind: 'chat', keyId: 'deepseek' },
  { id: 'mistral-small', name: 'Mistral Small', source: 'cloud', detail: 'Free-key · Mistral', kind: 'chat', keyId: 'mistral' },
  { id: 'cerebras-llama', name: 'Llama 3.1 (Cerebras)', source: 'cloud', detail: 'Free-key · ultra-fast', kind: 'chat', keyId: 'cerebras' },
  { id: 'sambanova-llama', name: 'Llama 3.1 (SambaNova)', source: 'cloud', detail: 'Free-key · SambaNova', kind: 'chat', keyId: 'sambanova' },
  { id: 'gpt-4o', name: 'GPT-4o', source: 'cloud', detail: 'Cloud chat and code', kind: 'chat', keyId: 'openai' },
  { id: 'claude-sonnet', name: 'Claude Sonnet', source: 'cloud', detail: 'Cloud long context', kind: 'chat', keyId: 'anthropic' },
];

function kindForMode(mode: ChatMode): ModelKind {
  if (mode === 'image') return 'image';
  if (mode === 'video') return 'video';
  return 'chat';
}

function defaultModelForKind(kind: ModelKind): ChatModelOption {
  const prefs = getLocalPrefs();
  // Prefer an explicit default; otherwise keep the last chat pick so cloud models stick.
  const prefId =
    prefs.defaultModelId && prefs.defaultModelId !== 'ark-auto'
      ? prefs.defaultModelId
      : (prefs.lastChatModelId || prefs.defaultModelId);

  if (kind === 'chat' && prefId && prefId !== 'ark-auto') {
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
      return {
        id: prefId,
        name: prefId,
        source: 'cloud',
        detail: `Cloud · ${resolved.label} · add key`,
        kind: 'chat',
      };
    }
    return { id: prefId, name: prefId, source: 'local', detail: 'Local · Settings default', kind: 'chat' };
  }
  if (prefId && prefId !== 'ark-auto') {
    const hit = CHAT_MODELS.find(m => m.id === prefId && m.kind === kind);
    if (hit) return hit;
  }
  const auto = CHAT_MODELS.find(m => m.id === 'ark-auto' && m.kind === kind);
  if (auto) return auto;
  if (kind === 'chat') {
    return CHAT_MODELS.find(m => m.id === 'ark-auto') ?? CHAT_MODELS[0];
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

  if (pinned.id === 'ark-auto' || pinned.source === 'auto') {
    return null;
  }

  const pinnedName = (pinned.name || '').toLowerCase();
  const pinnedId = (pinned.id || '').toLowerCase();
  const resolved = name.toLowerCase();
  const same =
    resolved.includes(pinnedName)
    || pinnedName.includes(resolved)
    || (pinnedId && resolved.includes(pinnedId.replace(/^(ollama|ark)-?/, '')));
  if (!same) return `Switched to ${name}`;
  return null;
}

const PLACEHOLDERS: Record<ChatMode, string[]> = {
  general: [
    'Ask ARK to build something...',
    'Ask ARK anything...',
    'Ask a question...',
  ],
  image: [
    'Describe the image. ARK may ask a quick brief first…',
    'Upload a photo (+) to recreate or improve it…',
    'Describe style, subject, and mood for best accuracy…',
  ],
  video: [
    'Describe the video you want to create...',
    'Ask ARK to generate a short clip...',
  ],
  voice: [
    'Voice conversation coming soon…',
    'Talk with ARK — conversation only, no PC control…',
  ],
  code: [
    'Describe the code you want to write...',
    'Ask ARK to fix a bug...',
    'Ask ARK to explain this function...',
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
  if (Object.keys(opts.memoryFiles).length) {
    return {
      files: opts.memoryFiles,
      projectId: opts.memoryProjectId,
      name: folderNameFromThread(opts.messages) || undefined,
      diskRoot: opts.memoryDiskRoot || null,
    };
  }
  const fromChat = loadChatStudio(opts.chatId);
  if (fromChat) {
    return {
      files: fromChat.files,
      projectId: fromChat.projectId,
      name: fromChat.name,
      diskRoot: fromChat.diskRoot || null,
    };
  }

  const pid = opts.memoryProjectId || projectIdFromThread(opts.messages);
  if (pid) {
    try {
      const raw = localStorage.getItem(`ark:chat-studio-files:${pid}`);
      if (raw) {
        const parsed = JSON.parse(raw) as { files?: Record<string, string>; name?: string };
        if (parsed?.files && Object.keys(parsed.files).length) {
          return { files: parsed.files, projectId: pid, name: parsed.name };
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
            name: folderNameFromThread(opts.messages) || undefined,
          };
        }
      } catch {
        /* ignore */
      }
    }
  }
  return { files: {}, projectId: pid, name: folderNameFromThread(opts.messages) || undefined };
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
      localStorage.setItem(`ark:chat-thread:${mode}`, JSON.stringify(slim));
    }
    if (opts?.creationId) {
      localStorage.setItem(`ark:chat-thread:creation:${opts.creationId}`, JSON.stringify(slim));
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
    return 'Delete failed due to an internal app bug (module load). Please restart ARK after update. not a permissions issue.';
  }
  return msg || 'Could not prepare delete. Try again.';
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
      const key = 'ark:session-first-chat-launch';
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
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [queueLen, setQueueLen] = useState(0);
  const [pendingImages, setPendingImages] = useState<{ id: string; name: string; dataUrl: string }[]>([]);
  const [chatStudioFiles, setChatStudioFiles] = useState<Record<string, string>>({});
  const [chatStudioProjectId, setChatStudioProjectId] = useState<string | null>(null);
  const [chatStudioDiskRoot, setChatStudioDiskRoot] = useState<string | null>(null);
  /** Folder/file ready to send with the next message (Cursor-style pending chip). */
  const [pendingAttaches, setPendingAttaches] = useState<ChatAttachMeta[]>([]);
  const [dragOverChat, setDragOverChat] = useState(false);
  const [dropHint, setDropHint] = useState<string | null>(null);
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
  /** actions = what next; handoff = after inspect; details = coding trace expand */
  const [studioOfferKind, setStudioOfferKind] = useState<'actions' | 'handoff' | 'details' | null>(null);
  const [traceDetailsId, setTraceDetailsId] = useState<string | null>(null);
  const [githubOfferId, setGithubOfferId] = useState<string | null>(null);
  const [composerTall, setComposerTall] = useState(false);
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
  const pendingQueueRef = useRef<string[]>([]);
  const persistChatIdRef = useRef<string | null>(null);
  /** Always-current route chat id. avoid stale closures when flushing the queue. */
  const routeChatIdRef = useRef<string | undefined>(undefined);
  const ignoreEnterUntilRef = useRef(0);
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
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const hydratedCreationRef = useRef<string | null>(null);
  /** Skip storage reload after we create a chat so Explore ideas doesn't flash back. */
  const skipChatLoadIdsRef = useRef<Set<string>>(new Set());
  const messagesRef = useRef(messages);
  const imageBriefRef = useRef<{ chatId: string; original: string } | null>(null);
  const imageOfferPromptRef = useRef('');
  const [imageOfferId, setImageOfferId] = useState<string | null>(null);
  const [imageSwitchDismissed, setImageSwitchDismissed] = useState(false);
  const [codePillSticky, setCodePillSticky] = useState(false);
  const [codeOverlayOpen, setCodeOverlayOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
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

  const persistStudioSnapshot = (
    chatId: string,
    patch?: {
      files?: Record<string, string>;
      projectId?: string | null;
      name?: string;
      diskRoot?: string | null;
    },
  ) => {
    const files = patch?.files ?? chatStudioFilesRef.current;
    const diskRoot = patch?.diskRoot ?? chatStudioDiskRootRef.current;
    if (!chatId || (!Object.keys(files).length && !diskRoot)) return;
    saveChatStudio(chatId, {
      files,
      projectId: patch?.projectId ?? chatStudioProjectIdRef.current,
      name: patch?.name,
      diskRoot,
    });
  };

  const clearWorkspaceBinding = useCallback((chatId: string) => {
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
      provider_used: 'ARK',
      created_at: new Date().toISOString(),
      elapsed_ms: Date.now() - replyStartedAt,
    };
    const next = messagesRef.current.map(m => (m.id === assistantId ? reply : m));
    messagesRef.current = next;
    persistModeThread(threadMode, next, { chatId });
    setMessages(next);
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
      if (mySeq !== genSeqRef.current) return;
      const text = del.ok
        ? `Deleted **${projectName}** from your PC.\n\n\`${del.path || folderPath}\``
        : (del.error || `Could not delete **${projectName}**. Close File Explorer if that folder is open, then try again.`);
      finishPendingDeleteReply(assistantId, chatId, threadMode, text, replyStartedAt);
    } catch (err) {
      if (mySeq !== genSeqRef.current) return;
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
      if (mySeq !== genSeqRef.current) return;
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
      if (mySeq !== genSeqRef.current) return;
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
      if (mySeq !== genSeqRef.current) return;
      const text = del.ok
        ? `Deleted **${folderName}** from your PC.\n\n\`${del.path || folderPath}\``
        : (del.error || `Could not delete **${folderName}**. Close File Explorer if that folder is open, then try again.`);
      finishPendingDeleteReply(assistantId, chatId, threadMode, text, replyStartedAt);
    } catch (err) {
      if (mySeq !== genSeqRef.current) return;
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
    if (pendingAttaches[0]?.name) return pendingAttaches[0].name;
    if (chatStudioDiskRoot) {
      const parts = chatStudioDiskRoot.split(/[/\\]/).filter(Boolean);
      return parts[parts.length - 1] || chatStudioDiskRoot;
    }
    const chatId = route.name === 'chat' ? route.chatId : undefined;
    if (chatId) {
      const snap = loadChatStudio(chatId);
      if (snap?.name) return snap.name;
    }
    if (Object.keys(chatStudioFiles).length) return 'Attached project';
    return null;
  }, [pendingAttaches, chatStudioDiskRoot, chatStudioFiles, route]);

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
    if (next === 'video' && !isVideoTabEnabled()) {
      navigate({ name: 'chat', mode: 'image' });
      return;
    }
    if (next === 'voice' && !isVoiceTabEnabled()) {
      navigate({ name: 'chat' });
      return;
    }
    setMode(next);
    const kind = kindForMode(next);
    setActiveModel(prev => (prev.kind === kind ? prev : defaultModelForKind(kind)));
    if (next === 'image' || next === 'video') {
      try {
        const draft = localStorage.getItem(`ark:chat-draft:${next}`);
        if (draft) {
          setInput(draft);
          localStorage.removeItem(`ark:chat-draft:${next}`);
        }
      } catch {
        /* ignore */
      }
    }
  }, [route, navigate]);

  // After Chat → Image handoff, auto-send the carried prompt once.
  useEffect(() => {
    if (route.name !== 'chat' || mode !== 'image') return;
    let prompt: string | null = null;
    try {
      if (sessionStorage.getItem('ark:image-handoff-send') === '1') {
        prompt = sessionStorage.getItem('ark:image-handoff-prompt');
        sessionStorage.removeItem('ark:image-handoff-send');
        sessionStorage.removeItem('ark:image-handoff-prompt');
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
      : 'image';
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
        const raw = localStorage.getItem(`ark:chat-thread:creation:${creationId}`);
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
        localStorage.setItem(`ark:chat-thread:creation:${creationId}`, JSON.stringify(seeded));
      } catch {
        /* ignore */
      }
      setMode(tab);
      setActiveModel(defaultModelForKind(
        tab === 'video' ? 'video' : tab === 'image' ? 'image' : 'chat',
      ));
      setLoading(false);
      requestAnimationFrame(() => textareaRef.current?.focus());
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
      if (skipChatLoadIdsRef.current.has(route.chatId)) {
        if (messagesRef.current.length > 0) {
          skipChatLoadIdsRef.current.delete(route.chatId);
          setLoading(false);
          setGenerating(Boolean(generatingRef.current && activeGenChatIdRef.current === route.chatId));
          return;
        }
        skipChatLoadIdsRef.current.delete(route.chatId);
        // Fall through and load from disk if state was emptied by a re-render race.
      }
      try {
        const raw = localStorage.getItem(chatThreadKey(route.chatId));
        const loaded = raw ? JSON.parse(raw) as ChatMessage[] : [];
        setMessages(Array.isArray(loaded) ? loaded : []);
        messagesRef.current = Array.isArray(loaded) ? loaded : [];
        setThreadBrain(loadThreadBrain(route.chatId, kind));
      } catch {
        setMessages([]);
        messagesRef.current = [];
        setThreadBrain(null);
      }
      // Don't carry a folder from another chat into this thread. but restore this chat's files.
      if (activeGenChatIdRef.current !== route.chatId) {
        const restored = loadChatStudio(route.chatId);
        if (restored) {
          setChatStudioFiles(restored.files);
          setChatStudioProjectId(restored.projectId);
          setChatStudioDiskRoot(restored.diskRoot || null);
        } else {
          setChatStudioFiles({});
          setChatStudioProjectId(null);
          setChatStudioDiskRoot(null);
          lastStudioIntentRef.current = null;
          lastFindingsRef.current = [];
        }
        setPendingAttaches([]);
      }
      setCodePillSticky(hasChatCodePill(route.chatId));
      setGenerating(Boolean(generatingRef.current && activeGenChatIdRef.current === route.chatId));
      setLoading(false);
      // Remount / tab return: if this thread is still marked in-flight and the last
      // assistant bubble is still generating, keep Stop + placeholder visible.
      // Stale inflight (app closed mid-gen) must not lock Thinking forever.
      try {
        const raw = sessionStorage.getItem('ark:inflight-media');
        const inflight = raw ? JSON.parse(raw) as { chatId?: string; mode?: string; startedAt?: number } : null;
        const stale = Boolean(inflight?.startedAt && Date.now() - inflight.startedAt > 180_000);
        const liveHere = Boolean(
          generatingRef.current && activeGenChatIdRef.current === route.chatId,
        );
        // Leftover "__generating__:chat:Thinking…" from a crashed turn — clear unless live.
        if (!liveHere) {
          const stuckChat = messagesRef.current.some(
            m => m.role === 'assistant' && String(m.content || '').startsWith('__generating__:chat:'),
          );
          if (stuckChat || stale || (inflight?.chatId && inflight.chatId !== route.chatId)) {
            if (stale || (inflight?.chatId && inflight.chatId !== route.chatId)) {
              sessionStorage.removeItem('ark:inflight-media');
            }
            setMessages(prev => {
              const next = prev.map(m => (
                m.role === 'assistant' && String(m.content || '').startsWith('__generating__:')
                  ? { ...m, content: '(interrupted. send again)' }
                  : m
              ));
              messagesRef.current = next;
              persistModeThread(mode, next, { chatId: route.chatId });
              return next;
            });
            generatingRef.current = false;
            setGenerating(false);
          }
        } else if (inflight?.chatId === route.chatId) {
          const last = messagesRef.current[messagesRef.current.length - 1];
          if (last?.role === 'assistant' && String(last.content || '').startsWith('__generating__:')) {
            activeGenChatIdRef.current = route.chatId;
            generatingRef.current = true;
            setGenerating(true);
          }
        }
      } catch {
        /* ignore */
      }
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }

    // Fresh New Chat / Image / Video — always empty canvas.
    // Never paint the previous recent thread here (that looked like "new chat shows old chat").
    // Background generation for another chatId can keep running via keepChatAlive; this route
    // must still show a blank starter.
    try {
      const raw = sessionStorage.getItem('ark:inflight-media');
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
    setThreadBrain(null);
    setChatStudioFiles({});
    chatStudioFilesRef.current = {};
    setChatStudioProjectId(null);
    chatStudioProjectIdRef.current = null;
    setChatStudioDiskRoot(null);
    chatStudioDiskRootRef.current = null;
    setPreviewUrl(null);
    setPendingAttaches([]);
    setPendingImages([]);
    setCodePillSticky(false);
    lastStudioIntentRef.current = null;
    lastFindingsRef.current = [];
    // Drop any pending create brief so a new chat cannot inherit the previous idea.
    try {
      const staleId = persistChatIdRef.current || routeChatIdRef.current;
      if (staleId) clearLastPendingGreenfield(staleId);
    } catch { /* ignore */ }
    persistChatIdRef.current = null;
    // Blank starter must not keep another chat's Stop / queue UI.
    // Bump genSeq so late idle/finalize from the previous thread cannot flip Stop back on.
    genSeqRef.current += 1;
    stopRequestedRef.current = true;
    pendingQueueRef.current = [];
    setQueueLen(0);
    activeGenChatIdRef.current = null;
    generatingRef.current = false;
    setGenerating(false);
    setLoading(false);
  }, [route, mode, navigate]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void probeLiveCapacity().then(cap => {
        if (!cancelled) setCapacity(cap);
      });
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('ark:ollama-changed', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('ark:ollama-changed', refresh);
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
    window.addEventListener('ark:ollama-changed', loadOllama);
    window.addEventListener('focus', loadOllama);
    return () => {
      window.removeEventListener('ark:ollama-changed', loadOllama);
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
              && m.id !== 'ark-core'
              && m.id !== 'ark-image-core'
              && m.id !== 'ark-video-core',
            )
            .map(m => ({
              id: m.id,
              name: m.name,
              source: 'local' as const,
              detail: 'Ready',
              kind: 'chat' as const,
            }));
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
          setEngineReadyIds(new Set(status.models.filter(m => m.status === 'ready').map(m => m.id)));
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
    window.addEventListener('ark:plugins-changed', onPlugins);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('ark:plugins-changed', onPlugins);
    };
  }, [route]);

  useEffect(() => {
    // Only pin to bottom when the user is already near the end. never yank scroll while reading history.
    if (!stickToBottomRef.current) return;
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
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Hysteresis: leave stick early when scrolling up; re-stick only when clearly at bottom.
    if (distFromBottom > 180) stickToBottomRef.current = false;
    else if (distFromBottom < 80) stickToBottomRef.current = true;
    setShowJumpToBottom(distFromBottom > 220);
  };

  const jumpToBottom = () => {
    const el = messagesScrollRef.current;
    stickToBottomRef.current = true;
    setShowJumpToBottom(false);
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      const left = r.left + r.width / 2;
      const spaceAbove = r.top;
      const spaceBelow = window.innerHeight - r.bottom;
      // Prefer opening toward the side with more room (top of screen → down, bottom → up).
      const openUp = spaceBelow < 300 && spaceAbove > spaceBelow;
      if (openUp) {
        setMenuPos({
          left,
          bottom: Math.max(12, window.innerHeight - r.top + 8),
          top: undefined,
        });
      } else {
        setMenuPos({
          left,
          top: Math.min(window.innerHeight - 24, r.bottom + 8),
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
    void engineGenerateCancel();
    generatingRef.current = false;
    activeGenChatIdRef.current = null;
    try {
      sessionStorage.removeItem('ark:inflight-media');
    } catch {
      /* ignore */
    }
    // Pair every beginChatInflight — Stop used to leave App thinking Chat was busy forever.
    while (hasChatInflight()) endChatInflight();
    setGenerating(false);
    setMessages(prev => {
      const next = prev.map(m => (
        m.role === 'assistant' && String(m.content || '').startsWith('__generating__:')
          ? { ...m, content: '(stopped)' }
          : m
      ));
      const chatId = persistChatIdRef.current || routeChatIdRef.current;
      if (chatId) persistModeThread(mode, next, { chatId });
      return next;
    });
  };

  const flushQueuedSend = () => {
    if (generatingRef.current) return;
    const next = pendingQueueRef.current.shift();
    setQueueLen(pendingQueueRef.current.length);
    if (next) {
      void sendMessageRef.current(next);
    }
  };

  const openImageTab = (seedPrompt?: string) => {
    const seed = (seedPrompt ?? imageOfferPromptRef.current ?? input).trim();
    setImageOfferId(null);
    setImageSwitchDismissed(true);
    try {
      if (seed) {
        localStorage.setItem('ark:chat-draft:image', seed);
        sessionStorage.setItem('ark:image-handoff-send', '1');
        sessionStorage.setItem('ark:image-handoff-prompt', seed);
      }
    } catch {
      /* ignore */
    }
    setInput('');
    setComposerTall(false);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    navigate({ name: 'chat', mode: 'image' });
  };

  const openCodeWorkspace = (_seedPrompt?: string, _seedFiles?: Record<string, string>) => {
    if (!isCodeTabEnabled()) return;
    if (_seedFiles && Object.keys(_seedFiles).length) {
      setChatStudioFiles(_seedFiles);
      chatStudioFilesRef.current = _seedFiles;
    }
    setCodeOverlayOpen(true);
  };

  const openProjectFolder = async () => {
    const root = chatStudioDiskRootRef.current;
    if (!root) return;
    try {
      const res = await window.arkDesktop?.openPath?.(root);
      if (res === true || (res && typeof res === 'object' && res.ok)) return;
      // Fallback: open parent via file:// explorer-friendly open
      if (window.arkDesktop?.openExternal) {
        const href = `file:///${root.replace(/\\/g, '/')}`;
        await window.arkDesktop.openExternal(href);
      }
    } catch {
      /* ignore */
    }
  };

  const openProjectPreview = async (): Promise<string | null> => {
    const root = chatStudioDiskRootRef.current;
    const pid = chatStudioProjectIdRef.current || persistChatIdRef.current || 'chat-preview';
    let files = chatStudioFilesRef.current;
    const title = workspaceBadgeLabel || 'Preview';

    // Prefer freshest on-disk files when a project folder is bound.
    if (chatStudioProjectIdRef.current && window.arkDesktop?.projectRead) {
      try {
        const read = await window.arkDesktop.projectRead(chatStudioProjectIdRef.current);
        if (read?.ok && read.files && Object.keys(read.files).length) {
          files = read.files as Record<string, string>;
          setChatStudioFiles(files);
          chatStudioFilesRef.current = files;
        }
      } catch {
        /* keep in-memory */
      }
    }

    // Vite/React → ARK preview window on the live localhost URL (HMR keeps it fresh).
    if (root && isViteProject(files)) {
      let url = previewUrl && /localhost|127\.0\.0\.1/.test(previewUrl) ? previewUrl : null;
      if (!url) {
        const dev = await ensureViteDevServer(root);
        if (dev.ok && dev.url) {
          url = dev.url;
          setPreviewUrl(dev.url);
        } else {
          return null;
        }
      }
      await openInAppPreview(url, { projectId: pid, title, forceNavigate: true });
      return url;
    }

    // Static HTML/CSS/JS (and anything else) → local ARK preview server + closable window.
    if (Object.keys(files).length) {
      const url = await ensureInAppPreview({
        projectId: pid,
        title,
        files,
        preferUrl: previewUrl,
      });
      if (url) setPreviewUrl(url);
      return url;
    }

    if (previewUrl) {
      await openInAppPreview(previewUrl, { projectId: pid, title });
      return previewUrl;
    }
    return null;
  };

  const pushLivePreview = async (files: Record<string, string>, openIfClosed = false) => {
    const pid = chatStudioProjectIdRef.current || persistChatIdRef.current || 'chat-preview';
    const title = workspaceBadgeLabel || 'Preview';
    const url = await refreshLivePreview({
      projectId: pid,
      title,
      files,
      previewUrl,
      openIfClosed,
    });
    if (url) setPreviewUrl(url);
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
          requestAnimationFrame(() => textareaRef.current?.focus());
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

  const openFolderInChat = async (sourceDir?: string): Promise<{
    ok: boolean;
    files?: Record<string, string>;
    projectId?: string;
    name?: string;
    root?: string;
    error?: string;
  }> => {
    if (!window.arkDesktop?.projectImportFolder && !window.arkDesktop?.workspaceOpenRoot) {
      attachInputRef.current?.click();
      return { ok: false, error: 'Folder open is only available in the desktop app.' };
    }
    const pid = `proj-${crypto.randomUUID().slice(0, 8)}`;
    setAttachUploading('Opening folder…');
    setAttachBusy(true);
    setDropHint(null);
    const onProg = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { label?: string; done?: number; total?: number } | undefined;
      if (d?.label) setAttachUploading(d.label);
      else if (d?.total) setAttachUploading(`Reading ${d.done || 0}/${d.total}`);
    };
    window.addEventListener('ark:project-import-progress', onProg);
    try {
      const useInPlace = Boolean(sourceDir || hasFolderAccessGrant()) && window.arkDesktop?.workspaceOpenRoot;
      const res = useInPlace
        ? await window.arkDesktop?.workspaceOpenRoot?.({
          projectId: pid,
          ...(sourceDir ? { sourceDir } : {}),
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
              setPendingImages(prev => [...prev, { id, name: base, dataUrl: data.dataUrl! }].slice(0, 4));
              return { ok: true };
            }
          }
          const read = await window.arkDesktop.readTextFile?.({ path: filePath });
          const text = read?.ok && read.text != null ? read.text : `[Attached file: ${base}]`;
          setChatStudioFiles(prev => ({ ...prev, [base]: text }));
          setPendingAttaches(prev => [...prev, { kind: 'file' as const, name: base, count: 1, id: `file-${pid}` }].slice(0, 12));
          return { ok: true };
        }
        const err = res?.error || 'Could not open that folder.';
        setDropHint(err);
        return { ok: false, error: err };
      }
      const rawFiles = res.files || {};
      const folderName = res.name || 'folder';
      const files: Record<string, string> = {};
      // In-place disk roots must keep paths relative to the folder (src/App.jsx).
      // Prefixing with folderName made writes land in Folder\\Folder\\src (nested clone).
      const inPlaceRoot = Boolean(res.root && res.inPlace !== false);
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
      const count = Object.keys(files).length;
      if (!count) {
        setDropHint(`Opened “${folderName}” but it looks empty.`);
        return { ok: false, error: 'empty folder' };
      }
      setChatStudioFiles(prev => ({ ...prev, ...files }));
      chatStudioFilesRef.current = { ...chatStudioFilesRef.current, ...files };
      setChatStudioProjectId(pid);
      chatStudioProjectIdRef.current = pid;
      if (res.root) {
        setChatStudioDiskRoot(res.root);
      }
      setPendingAttaches(prev => [
        ...prev,
        { kind: 'folder' as const, name: folderName, count, projectId: pid, id: pid },
      ].slice(0, 12));
      setDropHint(null);
      try {
        localStorage.setItem(`ark:chat-studio-files:${pid}`, JSON.stringify({ name: folderName, files }));
      } catch {
        /* ignore */
      }
      const scopeChat = routeChatIdRef.current || persistChatIdRef.current;
      if (scopeChat) {
        persistStudioSnapshot(scopeChat, {
          files,
          projectId: pid,
          name: folderName,
          diskRoot: res.root || null,
        });
      }
      ignoreEnterUntilRef.current = Date.now() + 600;
      requestAnimationFrame(() => textareaRef.current?.focus());
      return { ok: true, files, projectId: pid, name: folderName, root: res.root };
    } finally {
      window.removeEventListener('ark:project-import-progress', onProg);
      setAttachUploading(null);
      setAttachBusy(false);
    }
  };

  const enterPathInChat = async () => {
    const typed = window.prompt('Folder path on this PC:', chatStudioDiskRoot || '')?.trim();
    if (!typed) return;
    const stat = await window.arkDesktop?.workspaceStatPath?.(typed);
    if (!stat?.ok || !stat.isDirectory || !stat.path) {
      setDropHint(stat?.error || 'That path is not a folder.');
      return;
    }
    if (!window.confirm(`Allow ARK to read and use this folder?\n\n${stat.path}`)) return;
    await openFolderInChat(stat.path);
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
    for (const abs of paths) {
      const base = abs.split(/[/\\]/).pop() || 'file';
      if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(base)) {
        await attachImagesFromPaths([abs]);
        continue;
      }
      const read = await window.arkDesktop?.readTextFile?.({ path: abs });
      const text = read?.ok && read.text != null ? read.text : `[Attached file: ${base}]`;
      setChatStudioFiles(prev => ({ ...prev, [base]: text }));
      setPendingAttaches(prev => {
        if (prev.some(a => a.name === base && a.kind === 'file')) return prev;
        return [...prev, {
          kind: 'file' as const,
          name: base,
          count: 1,
          id: `file-${crypto.randomUUID().slice(0, 8)}`,
        }].slice(0, 12);
      });
    }
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
    if (action === 'folder') {
      void openFolderInChat();
      return;
    }
    if (action === 'import-folder') {
      void openFolderInChat();
      return;
    }
    if (action === 'enter-path') {
      void enterPathInChat();
      return;
    }
    if (action === 'plan' || action === 'ask' || action === 'agent' || action === 'debug' || action === 'multitask') {
      setComposerMode(action);
      requestAnimationFrame(() => textareaRef.current?.focus());
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

  const handleSend = () => {
    let content = input.trim();
    const images = pendingImages;
    const attaches = pendingAttaches;
    const hasStudio = Object.keys(chatStudioFilesRef.current).length > 0;
    if ((!content && !images.length && !attaches.length && !hasStudio) || !user) return;
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
    if (attaches.length) {
      parts.push(encodeChatAttaches(attaches));
    }
    if (userTyped) {
      parts.push(content);
    } else if (attaches.length || hasStudio) {
      // Enter with only a folder/file. read it. Marker is hidden in the bubble.
      parts.push('<!--ark-auto-read-->');
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
    const busyOnThisChat = generatingRef.current && Boolean(genId) && (
      Boolean(viewingChatId) && viewingChatId === genId
    );
    if (busyOnThisChat) {
      pendingQueueRef.current.push(content);
      setQueueLen(pendingQueueRef.current.length);
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }
    setInput('');
    setComposerTall(false);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    void sendMessageRef.current(content);
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || !user) return;
    // New send → follow the reply; history scroll stays free until the user scrolls up again.
    stickToBottomRef.current = true;
    // Free a stuck prior GGUF job (timed-out inspect was locking “More details”).
    void engineGenerateCancel();
    if (generatingRef.current) {
      generatingRef.current = false;
      setGenerating(false);
    }
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
      // Fresh chat must not inherit the previous thread's workspace / preview.
      chatStudioFilesRef.current = {};
      chatStudioProjectIdRef.current = null;
      chatStudioDiskRootRef.current = null;
      setPreviewUrl(null);
      setChatStudioFiles({});
      setChatStudioProjectId(null);
      setChatStudioDiskRoot(null);
      lastStudioIntentRef.current = null;
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
    // Bind any pending folder attach to this chat id for follow-ups. never on a brand-new chat.
    if (!isNewChat && Object.keys(chatStudioFilesRef.current).length) {
      const meta = parseChatAttach(content) || parseChatAttaches(content)[0];
      persistStudioSnapshot(activeChatId, {
        name: meta?.name,
        projectId: chatStudioProjectIdRef.current || meta?.projectId || null,
      });
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
      user_id: user.id,
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
        ? 'ARK Auto'
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
      user_id: user.id,
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
    messagesRef.current = [...normalized, userMsg, assistantMsg];
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
          'ark:inflight-media',
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
      endInflightOnce();
      if (mySeq !== genSeqRef.current) return;
      generatingRef.current = false;
      if (activeGenChatIdRef.current === activeChatId) {
        activeGenChatIdRef.current = null;
      }
      setGenerating(false);
    };

    const finishPlainReply = async (replyText: string) => {
      const safeText = redactArkSelfLeak(replyText);
      const reply: ChatMessage = {
        id: assistantId,
        user_id: user?.id ?? 'guest',
        project_id: null,
        role: 'assistant',
        content: safeText,
        provider_used: 'ARK',
        created_at: new Date().toISOString(),
        elapsed_ms: Date.now() - replyStartedAt,
      };
      const next = messagesRef.current.map(m => (m.id === assistantId ? reply : m));
      messagesRef.current = next;
      persistModeThread(mode, next, { chatId: activeChatId });
      setMessages(next);
      setTokenRatio(syncTokenUsage(activeChatId, estimateTokens(
        isCatalogMessage(replyText)
          ? 'folder catalog summary'
          : replyText,
      )));
      clearGeneratingIfMineEarly();
      notifyChatDone(activeChatId);
    };

    if (looksLikeArkSelfHarmAsk(content)) {
      await finishPlainReply(arkSelfHarmBlockedReply());
      return;
    }

    if (mode === 'voice') {
      if (!voiceSupported()) {
        await finishPlainReply(
          'Voice needs a browser with speech recognition and text-to-speech. Use text Chat for builds and file edits.',
        );
        return;
      }
      await finishPlainReply('Listening… speak now.');
      const heard = await listenOnce(14_000);
      if (!heard.ok || !heard.text.trim()) {
        await finishPlainReply(heard.error || 'I did not catch that. Tap send and try again.');
        return;
      }
      const voiceMsg = heard.text.trim();
      const routed = await arkRoute({
        message: voiceBrainPrompt(voiceMsg),
        kind: 'chat',
        preferredModelId: pinnedModel.id,
        preferredModelName: pinnedModel.name,
        preferredSource: pinnedModel.source,
      });
      const spoken = redactArkSelfLeak(String(routed.reply || '').trim())
        || 'I did not have a reply for that.';
      await finishPlainReply(spoken);
      void speakText(spoken.replace(/\*\*/g, '').replace(/[#*`]/g, ''));
      return;
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
    if (Object.keys(resolvedStudio.files).length) {
      setChatStudioFiles(resolvedStudio.files);
      chatStudioFilesRef.current = resolvedStudio.files;
      if (resolvedStudio.projectId) {
        setChatStudioProjectId(resolvedStudio.projectId);
        chatStudioProjectIdRef.current = resolvedStudio.projectId;
      }
      if (resolvedStudio.diskRoot) {
        setChatStudioDiskRoot(resolvedStudio.diskRoot);
        chatStudioDiskRootRef.current = resolvedStudio.diskRoot;
      }
      persistStudioSnapshot(activeChatId, {
        files: resolvedStudio.files,
        projectId: resolvedStudio.projectId,
        name: resolvedStudio.name,
        diskRoot: resolvedStudio.diskRoot,
      });
    }

    const pushAssistantStatus = (label: string) => {
      if (mySeq !== genSeqRef.current) return;
      const statusContent = `__generating__:chat:${label}`;
      setMessages(prev => {
        const next = prev.map(m => (m.id === assistantId ? { ...m, content: statusContent } : m));
        messagesRef.current = next;
        return next;
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
      if (mySeq !== genSeqRef.current) return;

      if (opts.resolvedFromDesktop) {
        pushAssistantStatus('Exploring your Desktop…');
        await new Promise<void>(r => { window.setTimeout(r, 80); });
      } else {
        pushAssistantStatus(`Exploring ${opts.displayName}…`);
      }
      if (mySeq !== genSeqRef.current) return;

      pushAssistantStatus(`Found ${opts.displayName}. ${opts.targetPath}`);
      await new Promise<void>(r => { window.setTimeout(r, 100); });
      if (mySeq !== genSeqRef.current) return;

      pushAssistantStatus('Reading project summaries…');
      const roots = await window.arkDesktop?.browseRoots?.();
      const desktopPath = roots?.roots?.find(r => r.id === 'desktop')?.path || null;
      const built = await buildFolderCatalogData(opts.targetPath, opts.displayName, {
        desktopPath,
        showDesktopSiblings: opts.resolvedFromDesktop,
      });
      if (mySeq !== genSeqRef.current) return;

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
      for (let i = 0; i < stages.length - 1; i++) {
        pushAssistantStatus(stages[i]);
        await new Promise<void>(r => { window.setTimeout(r, i === 0 ? 100 : 85); });
        if (mySeq !== genSeqRef.current) return;
      }

      if (mode === 'installed_apps' || mode === 'games') {
        await syncWorkspaceGrantsFromPrefs();
      } else {
        await syncWorkspaceGrantsFromPrefs();
      }
      if (mySeq !== genSeqRef.current) return;

      const data = await buildPcExploreData(userMessage, mode);
      if (mySeq !== genSeqRef.current) return;

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
    const intentText = stripComposerPrefix(content);
    const diskIntent = classifyDiskIntent(intentText, {
      recentUserMessages: recentUserLines,
      pendingAddFile: getLastPendingAddFile(activeChatId)?.fileName || null,
      stickyDiskTarget,
    });
    const diskRoot = resolvedStudio.diskRoot || chatStudioDiskRootRef.current;
    const diskProjectId = resolvedStudio.projectId || chatStudioProjectIdRef.current || null;
    const diskWorkspaceName = resolvedStudio.name || loadChatStudio(activeChatId)?.name || null;

    const relPathFromDisk = (filePath: string): string | null => {
      if (!diskRoot || !filePath) return null;
      const normRoot = diskRoot.replace(/[/\\]+$/, '');
      if (!filePath.startsWith(normRoot)) return null;
      return filePath.slice(normRoot.length).replace(/^[/\\]/, '') || null;
    };

    // Disk intents. delete_file → delete_project → add_file.
    // Create/build briefs are excluded in classifyDiskIntent (see chatMessageRouter.ts).
    if (mode === 'general' || mode === 'code') {
      if (diskIntent.type === 'delete_file' || shouldRouteDeleteToStickyFile(content, stickyDiskTarget)) {
        try {
          const deleteFileName = diskIntent.type === 'delete_file'
            ? diskIntent.name
            : (stickyDiskTarget?.name ?? null);
          const deleteParentHint = diskIntent.type === 'delete_file'
            ? diskIntent.parentHint
            : undefined;
          const outcome = await handleDeleteFileChatRequest({
            fileName: deleteFileName,
            parentHint: deleteParentHint,
            workspaceDiskRoot: diskRoot,
            workspaceProjectId: diskProjectId,
            workspaceFiles: resolvedStudio.files,
            stickyTarget: stickyDiskTarget,
            lastListedFolder: getLastListedFolder(activeChatId),
          });

          if (outcome.kind === 'reply') {
            await finishPlainReply(outcome.text);
            return;
          }
          if (outcome.kind === 'folder_mismatch') {
            pendingFolderClarifyRef.current = {
              assistantId,
              chatId: activeChatId,
              mode,
              replyStartedAt,
              folderPath: outcome.folderPath,
              folderName: outcome.folderName,
              projectId: outcome.projectId,
              mySeq,
            };
            setDeleteFolderClarifyPrompt({
              folderName: outcome.folderName,
              folderPath: outcome.folderPath,
            });
            await finishPlainReply(
              `**${outcome.folderName}** is a folder at \`${outcome.folderPath}\`, not a single file.\n\n`
              + 'Confirm in the dialog if you want to delete the **entire project folder**.',
            );
            return;
          }
          if (outcome.kind === 'prompt') {
            const relPath = relPathFromDisk(outcome.filePath)
              || Object.keys(resolvedStudio.files).find(k => k.endsWith(outcome.fileName))
              || null;
            pendingFileDeleteRef.current = {
              assistantId,
              chatId: activeChatId,
              mode,
              replyStartedAt,
              filePath: outcome.filePath,
              fileName: outcome.fileName,
              projectId: outcome.projectId,
              relPath,
              mySeq,
            };
            setDeleteFilePrompt({
              fileName: outcome.fileName,
              filePath: outcome.filePath,
            });
            await finishPlainReply(
              `Ready to delete **${outcome.fileName}**.\n\nConfirm in the dialog. this removes only that file:\n\`${outcome.filePath}\``,
            );
            return;
          }
        } catch (err) {
          await finishPlainReply(deletePrepareErrorReply(err));
          return;
        }
      }

      if (
        (diskIntent.type === 'delete_project' || looksLikeDeleteFolderAsk(content))
        && !shouldRouteDeleteToStickyFile(content, stickyDiskTarget)
      ) {
        console.log('[delete] router hit', content.slice(0, 80));
        try {
          const outcome = await handleDeleteProjectChatRequest({
            content,
            messages: messagesRef.current,
            workspaceDiskRoot: diskRoot,
            workspaceName: diskWorkspaceName,
            workspaceProjectId: diskProjectId,
            stickyListedFolder: getLastListedFolder(activeChatId),
            stickyDiskTarget,
          });

          if (outcome.kind === 'reply') {
            await finishPlainReply(outcome.text);
            return;
          }
          if (outcome.kind === 'prompt') {
            pendingProjectDeleteRef.current = {
              assistantId,
              chatId: activeChatId,
              mode,
              replyStartedAt,
              folderPath: outcome.folderPath,
              projectId: outcome.projectId,
              projectName: outcome.projectName,
              mySeq,
            };
            setDeleteProjectPrompt({
              projectName: outcome.projectName,
              folderPath: outcome.folderPath,
            });
            setLastDiskTarget(activeChatId, {
              path: outcome.folderPath,
              name: outcome.projectName,
              kind: 'folder',
            });
            await finishPlainReply(
              `Ready to delete **${outcome.projectName}**.\n\nConfirm in the dialog. this removes the folder from your PC:\n\`${outcome.folderPath}\``,
            );
            return;
          }
        } catch (err) {
          await finishPlainReply(deletePrepareErrorReply(err));
          return;
        }
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

      if (diskIntent.type === 'add_file' && !isProjectCreateBrief(intentText)) {
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
        if (mySeq !== genSeqRef.current) return;

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
        const cmd = buildRestorePointCommand(`ARK ${new Date().toLocaleDateString()}`);
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
            ? `${ran.reply}\n\nWindows restore points need **Run as administrator**. Approve the UAC prompt if it appears, or run ARK as admin once.`
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
        await finishPlainReply(
          'I lost the project brief for this chat.\n\nPaste your idea again (or start a new chat with it), and I’ll keep planning from that.',
        );
        return;
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

    // In-place scrap/rebuild of the bound workspace. never catalog Desktop or create sibling folders.
    if (
      (mode === 'general' || mode === 'code')
      && looksLikeInPlaceRebuildAsk(intentText)
      && hasActiveWorkspace({
        files: resolvedStudio.files,
        projectId: resolvedStudio.projectId || chatStudioProjectIdRef.current,
        diskRoot: resolvedStudio.diskRoot || chatStudioDiskRootRef.current,
      })
    ) {
      // Fall through to code-edit / inspect with sticky files. skip catalog & create.
    } else if ((mode === 'general' || mode === 'code') && looksLikeStartWorkOnFolderAsk(intentText)) {
      if (!hasFolderAccessGrant()) {
        await finishPlainReply(GRANT_OFF_FOLDER_MSG);
        return;
      }

      const wantName = parseWorkOnFolderName(intentText);
      if (!wantName) {
        await finishPlainReply(
          'Which project folder? Say for example **“Let’s work on DeBloat”** or **“Start working on Lyndsey.”**',
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

      // "Open DeBloat and summarize…". bind, then keep going into inspect/edit.
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
              content.match(/\bcall(?:ed)?\s+it\s+([A-Za-z][A-Za-z0-9_-]{1,40})\b/i)?.[1]
              || content.match(/\bleaning\s+([A-Za-z][A-Za-z0-9_-]{1,40})\s+as\s+the\s+name\b/i)?.[1]
              || extractGreenfieldName(content)
              || idea?.name
              || brief.match(/\bleaning\s+([A-Za-z][A-Za-z0-9_-]{1,40})\s+as\s+the\s+name\b/i)?.[1]
              || brief.match(/\bcall(?:ed)?\s+it\s+([A-Za-z][A-Za-z0-9_-]{1,40})\b/i)?.[1]
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
    );
    const renameFromAsk = content.match(/\bcall(?:ed)?\s+it\s+([A-Za-z][A-Za-z0-9_-]{1,40})\b/i)?.[1]
      || content.match(/\bleaning\s+([A-Za-z][A-Za-z0-9_-]{1,40})\s+as\s+the\s+name\b/i)?.[1]
      || null;
    const createIntent = createIntentRaw && renameFromAsk
      ? {
          ...createIntentRaw,
          name: renameFromAsk,
          slug: slugifyProjectName(renameFromAsk),
          // Prefer the go-message text when it carries the product spec (TradeRail tabs, etc.).
          summary: content.length > 40 ? `${content}\n\n${createIntentRaw.summary}` : createIntentRaw.summary,
        }
      : createIntentRaw;
    if (
      (mode === 'general' || mode === 'code')
      && createIntent
      && diskIntent.type !== 'add_file'
      && !wantsPlanningOnly(content)
      && !looksLikeConversationalPlanningAsk(content)
      && !looksLikeInPlaceRebuildAsk(content)
    ) {
      const turnMode = composerModeFromContent(content);
      const workspaceActive = workspaceActiveForCreate;

      if (workspaceActive && parseNewProjectIntent(content) && !looksLikeImplementGo(content)) {
        await finishPlainReply(
          'This chat already has a workspace open.\n\n'
          + 'To create **another** project, start a new chat or say **“new project called …”** with a different name.',
        );
        return;
      }

      if (
        createIntent.preferPlan
        && !looksLikeImplementGo(content)
        && !/^create\s+project\s+/i.test(content.trim())
        && !/\bcreate\s+it\b/i.test(content)
        && !/\bgo\s+ahead\s+and\s+(?:create|build)\b/i.test(content)
      ) {
        setLastPendingGreenfield(activeChatId, {
          name: createIntent.name,
          slug: createIntent.slug,
          kind: resolveProjectKindForCreate(createIntent.summary, createIntent.kind, createIntent.kind),
          summary: createIntent.summary,
          problemLine: `Build ${createIntent.name} from your brief.`,
        });
        renameChat(activeChatId, createIntent.name);
        // Prefer talking it through in the model. do not dump a canned plan + create chips.
      } else {

      // Always prefer the original user brief for this chat. never assistant plan text.
      // (Must resolve brief BEFORE any status/delay. using userBrief early caused a TDZ hang on "Reading your brief…".)
      const pending = getLastPendingGreenfield(activeChatId);
      const userLines = messagesRef.current.filter(m => m.role === 'user').map(m => String(m.content || ''));
      const userBrief = recoverOriginalUserBrief(messagesRef.current);
      const bestBrief = findBestProductBrief(userLines);
      const richestBrief = [pending?.summary, userBrief, bestBrief, createIntent.summary]
        .filter((s): s is string => Boolean(s && String(s).trim()))
        .sort((a, b) => b.length - a.length)[0] || createIntent.summary;
      let buildIntent = {
        ...createIntent,
        name: createIntent.name || pending?.name || createIntent.name,
        slug: createIntent.slug || pending?.slug || createIntent.slug,
        kind: resolveProjectKindForCreate(
          richestBrief,
          (pending?.kind as ProjectKind) || createIntent.kind,
          createIntent.kind,
        ),
        summary: richestBrief,
        preferPlan: false,
      };

      // "lets build this" with no recoverable product brief → refuse empty mountain scaffolds.
      // Do NOT treat "Create project Name" chips as thin. those carry a name and may use pending brief.
      const summaryText = String(buildIntent.summary || '').trim();
      const goOnlyAsk = /^(?:lets?\s+build(?:\s+(?:this|that|it))?|build\s+this|build\s+that|go\s+implement|go\s+build|implement\s+it|ship\s+it)\s*[.!]?\s*$/i.test(content.trim());
      const thinBrief = goOnlyAsk && (
        summaryText.length < 60
        || /^(?:lets?\s+build|build\s+this|build\s+that|go\s+implement|go\s+build)\b/i.test(summaryText)
      );
      if (thinBrief) {
        await finishPlainReply(
          'I don’t have enough of your product brief to build accurately.\n\n'
          + 'Paste the brief again (name + what the page/app should include), then say **lets build this**.',
        );
        return;
      }

      pushAssistantStatus(`Reading your brief for ${buildIntent.name}…`);
      await new Promise<void>(r => { window.setTimeout(r, Math.max(800, briefReadDelayMs(buildIntent.summary) / 2)); });
      if (mySeq !== genSeqRef.current) return;

      pushAssistantStatus(`Creating folder Desktop\\Projects\\${buildIntent.slug}…`);
      try {
      await syncWorkspaceGrantsFromPrefs();
      await new Promise<void>(r => { window.setTimeout(r, 200); });
      if (mySeq !== genSeqRef.current) return;

      pushAssistantStatus('Writing project files from your brief…');
      const newProjectId = `proj-${crypto.randomUUID().slice(0, 8)}`;
      const created = await runCreateProjectFlow(buildIntent, newProjectId);
      if (mySeq !== genSeqRef.current) return;

      if (!created.ok) {
        await finishPlainReply(created.error || 'Could not create the project.');
        return;
      }

      clearLastPendingGreenfield(activeChatId);

      setChatStudioFiles(created.files);
      chatStudioFilesRef.current = created.files;
      setChatStudioProjectId(created.projectId || newProjectId);
      chatStudioProjectIdRef.current = created.projectId || newProjectId;
      if (created.projectPath) {
        setChatStudioDiskRoot(created.projectPath);
        chatStudioDiskRootRef.current = created.projectPath;
      }
      setChatCodePill(activeChatId, true);
      setCodePillSticky(true);
      renameChat(activeChatId, buildIntent.name);
      addChat({
        id: activeChatId,
        mode,
        title: buildIntent.name,
        updatedAt: new Date().toISOString(),
        preview: previewFromText(content),
      });
      persistStudioSnapshot(activeChatId, {
        files: created.files,
        projectId: created.projectId || newProjectId,
        name: buildIntent.name,
        diskRoot: created.projectPath || null,
      });
      if (created.projectPath) {
        setLastDiskTarget(activeChatId, {
          path: created.projectPath,
          name: buildIntent.name,
          kind: 'folder',
        });
      }

      pushAssistantStatus('Applying layout from your brief…');
      let followNote = '';
      const pid = created.projectId || newProjectId;
      if (pid && created.files) {
        const applied = await applyChatReplyEdits({
          reply: '',
          projectId: pid,
          projectName: buildIntent.name,
          files: created.files,
          userMessage: buildIntent.summary || content,
          diskRoot: created.projectPath || chatStudioDiskRootRef.current,
        });
        if (applied.ok) {
          setChatStudioFiles(applied.files);
          chatStudioFilesRef.current = applied.files;
          persistStudioSnapshot(activeChatId, {
            files: applied.files,
            projectId: pid,
            name: buildIntent.name,
            diskRoot: created.projectPath || null,
          });
          followNote = `\n\nLayout applied (${applied.updated.join(', ')}). Click **Preview** under the chat box to open the live window.`;
        }
      }

      pushAssistantStatus('Finishing setup…');
      const scaffoldKind = resolveProjectKindForCreate(
        buildIntent.summary || content,
        buildIntent.kind,
        buildIntent.kind,
      );
      const bootstrapFiles = Object.keys(chatStudioFilesRef.current).length
        ? chatStudioFilesRef.current
        : (created.files || {});
      const needsNpm = projectUsesNpm(scaffoldKind)
        && Object.keys(bootstrapFiles).some(p => /(^|\/)package\.json$/i.test(p.replace(/\\/g, '/')));
      if (needsNpm) pushAssistantStatus('Installing dependencies…');
      const bootstrap = created.projectPath
        ? await bootstrapProjectWorkspace(created.projectPath, scaffoldKind, {
          files: bootstrapFiles,
        })
        : { npmInstalled: true };
      if (bootstrap.devServerUrl) {
        setPreviewUrl(bootstrap.devServerUrl);
        await openInAppPreview(bootstrap.devServerUrl, {
          projectId: pid,
          title: buildIntent.name,
        });
      } else {
        const liveFiles = chatStudioFilesRef.current;
        if (Object.keys(liveFiles).length) {
          const url = await ensureInAppPreview({
            projectId: pid,
            title: buildIntent.name,
            files: liveFiles,
          });
          if (url) setPreviewUrl(url);
        }
      }

      pushAssistantStatus('Preparing answer…');
      await finishPlainReply(`${formatCreateProjectReply({ ...buildIntent, kind: scaffoldKind }, created, bootstrap)}${followNote}`);
      return;
      } catch (createErr) {
        const msg = createErr instanceof Error ? createErr.message : String(createErr || 'unknown error');
        await finishPlainReply(`Could not finish creating **${buildIntent.name}**.\n\n${msg}`);
        return;
      }
      } // end create (non-preferPlan)
    }

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

    // STEP 1: Natural-language folder open. full import for fix/build/scan asks only.
    if (
      (mode === 'general' || mode === 'code')
      && Object.keys(resolvedStudio.files).length === 0
      && looksLikeFolderPathAsk(content)
      && shouldFullImportFolderAsk(content)
    ) {
      if (!hasFolderAccessGrant()) {
        const errMsg: ChatMessage = {
          id: assistantId,
          user_id: user?.id ?? 'guest',
      project_id: null,
          role: 'assistant',
          content: GRANT_OFF_FOLDER_MSG,
          provider_used: 'ARK',
          created_at: new Date().toISOString(),
        };
        const next = messagesRef.current.map(m => (m.id === assistantId ? errMsg : m));
        messagesRef.current = next;
        persistModeThread(mode, next, { chatId: activeChatId });
        setMessages(next);
        clearGeneratingIfMineEarly();
        return;
      }

      const folderRef = parseFolderPathAsk(content);
      if (!folderRef) {
        const errMsg: ChatMessage = {
          id: assistantId,
          user_id: user?.id ?? 'guest',
      project_id: null,
          role: 'assistant',
          content: 'Which folder on your Desktop? Say the name. for example: *“What is AutoTrade on my desktop?”* or *“On my desktop I have a folder called my-app.”*',
          provider_used: 'ARK',
          created_at: new Date().toISOString(),
        };
        const next = messagesRef.current.map(m => (m.id === assistantId ? errMsg : m));
        messagesRef.current = next;
        persistModeThread(mode, next, { chatId: activeChatId });
        setMessages(next);
        clearGeneratingIfMineEarly();
        return;
      }

      await syncWorkspaceGrantsFromPrefs();
      const located = await resolveScopedFolderPath(folderRef);
      if (located.ok && located.path) {
        const opened = await openFolderInChat(located.path);
        if (opened.ok && opened.files) {
          resolvedStudio.files = opened.files;
          resolvedStudio.projectId = opened.projectId || resolvedStudio.projectId;
          resolvedStudio.name = opened.name || located.matchedName || folderRef.name;
          chatStudioFilesRef.current = opened.files;
          setChatStudioFiles(opened.files);
          if (opened.projectId) {
            chatStudioProjectIdRef.current = opened.projectId;
            setChatStudioProjectId(opened.projectId);
          }
          if (opened.root) setChatStudioDiskRoot(opened.root);
          persistStudioSnapshot(activeChatId, {
            files: opened.files,
            projectId: opened.projectId,
            name: resolvedStudio.name,
            diskRoot: opened.root || null,
          });
          const locateNote = formatFolderLocatedMessage(located, folderRef.name);
          if (locateNote) {
            lastFolderLocateNoteRef.current = locateNote;
          }
        } else if (opened.error && opened.error !== 'canceled') {
          const errReply = opened.error === 'empty folder'
            ? 'That folder opened but looks empty.'
            : (opened.error || 'Could not open that folder.');
          const errMsg: ChatMessage = {
            id: assistantId,
            user_id: user?.id ?? 'guest',
      project_id: null,
            role: 'assistant',
            content: errReply,
            provider_used: 'ARK',
            created_at: new Date().toISOString(),
          };
          const next = messagesRef.current.map(m => (m.id === assistantId ? errMsg : m));
          messagesRef.current = next;
          persistModeThread(mode, next, { chatId: activeChatId });
          setMessages(next);
          clearGeneratingIfMineEarly();
          return;
        }
      } else if (located.error) {
        const errMsg: ChatMessage = {
          id: assistantId,
          user_id: user?.id ?? 'guest',
      project_id: null,
          role: 'assistant',
          content: located.error,
          provider_used: 'ARK',
          created_at: new Date().toISOString(),
        };
        const next = messagesRef.current.map(m => (m.id === assistantId ? errMsg : m));
        messagesRef.current = next;
        persistModeThread(mode, next, { chatId: activeChatId });
        setMessages(next);
        clearGeneratingIfMineEarly();
        return;
      }
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
      diskRoot: chatStudioDiskRootRef.current || chatStudioDiskRoot,
    });
    const turnComposerMode = composerModeFromContent(content) || composerMode;
    const agentCwd = chatStudioDiskRootRef.current
      || chatStudioDiskRoot
      || (workspaceProjectId
        ? await Promise.race([
          window.arkDesktop?.projectPath?.(workspaceProjectId).then(r => r?.root).catch(() => undefined),
          new Promise<undefined>((resolve) => { window.setTimeout(() => resolve(undefined), 2_500); }),
        ])
        : undefined);

    const finishAgentReply = (reply: string, provider = 'ARK · agent') => {
      const elapsedMs = Date.now() - replyStartedAt;
      const safeText = redactArkSelfLeak(reply);
      const next = messagesRef.current.map(m => (
        m.id === assistantId
          ? { ...m, content: safeText, provider_used: provider, elapsed_ms: elapsedMs }
          : m
      ));
      messagesRef.current = next;
      persistModeThread(mode, next, { chatId: activeChatId });
      setMessages(next);
      clearGeneratingIfMineEarly();
    };

    // Open / refresh the in-app Preview window (closable BrowserWindow. not system browser).
    if (
      (mode === 'general' || mode === 'code')
      && /\b(open|show|launch|start)\b[\s\S]{0,40}\b(preview|localhost|live\s+preview)\b/i.test(content)
    ) {
      const url = await openProjectPreview();
      finishAgentReply(
        url
          ? `Opened **Preview** in an ARK window (\`${url}\`).\n\nIt stays open while you edit. file changes reload the window automatically.`
          : 'Bind a project first (create one or say **Lets work on …**), then open Preview.',
        'ARK · preview',
      );
      return;
    }

    // Hands-free debug: problem + path → open project on disk, then inspect/fix (no separate "work on" step).
    if (
      (mode === 'general' || mode === 'code')
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
      if (opened.name) renameChat(activeChatId, opened.name);
      // Warm dev server for Vite projects so Preview is one tap away after fixes.
      if (opened.root && isViteProject(opened.files)) {
        void ensureViteDevServer(opened.root).then(async (dev) => {
          if (dev.ok && dev.url) {
            setPreviewUrl(dev.url);
            await ensureInAppPreview({
              projectId: opened.projectId || chatStudioProjectIdRef.current || activeChatId,
              title: opened.name || 'Preview',
              files: opened.files || {},
              preferUrl: dev.url,
            });
          }
        });
      }
      // Fall through to inspect / code-edit below with files bound.
    }

    // Capability asks ("can you edit files?", "what can you do?") — answer as ARK, not a
    // generic programming tutorial from the local model.
    if (
      (mode === 'general' || mode === 'code')
      && looksLikeArkCapabilityAsk(content)
      && !looksLikeProjectDebugAsk(content)
      && !parseMcpCallIntent(content)
    ) {
      finishAgentReply(
        formatArkCapabilitiesHelp({
          question: content,
          hasProject: Boolean(chatStudioProjectIdRef.current || chatStudioDiskRootRef.current),
          hasFolderAccess: true,
        }),
        'ARK',
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
      finishAgentReply(formatMcpToolsHelp(), 'ARK · mcp');
      return;
    }

    // Explicit MCP tools/call: "run mcp tool read_graph" / "call mcp create_entities {…}"
    if (mode === 'general' || mode === 'code') {
      const mcpCall = parseMcpCallIntent(content);
      if (mcpCall) {
        const server = resolveMcpToolServer(mcpCall.toolName);
        if (!server) {
          finishAgentReply(
            `No enabled MCP server has tool **${mcpCall.toolName}**.\n\nAdd/enable a server in **Settings → MCP**, press **Test**, then try again.\n\n${formatMcpToolsHelp()}`,
            'ARK · mcp',
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
            'ARK · mcp',
          );
        } else {
          finishAgentReply(
            `**${mcpCall.toolName}** failed on **${server.name}**.\n\n${res.error || 'Unknown error'}`,
            'ARK · mcp',
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
        finishAgentReply('Say: **clone owner/repo**. example: *clone vercel/next.js*', 'ARK');
        return;
      }
      const token = githubToken() || getPluginRuntime('github', loadPluginState()).token?.trim();
      const project = addRecent(ref.repo);
      setMessages(prev => prev.map(m => (
        m.id === assistantId ? { ...m, content: '__generating__:chat:Cloning…' } : m
      )));
      const cloned = await gitClone(project.id, githubCloneUrl(ref.owner, ref.repo), token || undefined);
      if (!cloned.ok) {
        finishAgentReply(cloned.error || 'Clone failed.', 'ARK · git');
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
        'ARK · git',
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
      && !looksLikeBuildStart(content);

    if (turnNeedsWorkspace && !workspaceActive && (mode === 'general' || mode === 'code')) {
      finishAgentReply(NO_WORKSPACE_MSG, 'ARK');
      return;
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
        finishAgentReply(studioCmd.reply, 'ARK · git');
        return;
      }
    }

    // STEP 4–5: Agent commands (npm/pip/git shell) and runtime installs
    if (
      (mode === 'general' || mode === 'code')
      && agentCwd
      && window.arkDesktop?.agentRun
      && chatTurnAllowsExec(content, turnComposerMode)
    ) {
      const agentCmd = inferAgentCommand(content, hasPackageJson);
      if (agentCmd) {
        const agentOutcome = await runAgentCommand({
          command: agentCmd,
          cwd: agentCwd,
          confirmLabel: agentCmd,
        });
        if (agentOutcome.needsConfirm) {
          const { command, cwd, label } = agentOutcome.needsConfirm;
          const modeLabel = executionModeLabel(getAgentExecutionMode());
          if (!window.confirm(`Run on your PC?\n\n${label}\n\nFolder: ${cwd}\n\nMode: ${modeLabel}`)) {
            finishAgentReply(
              'Command canceled. Say it again when ready, or switch to Run everything in Settings → Security.',
              'ARK',
            );
            return;
          }
          setMessages(prev => prev.map(m => (
            m.id === assistantId
              ? { ...m, content: `__generating__:chat:Running ${command}…` }
              : m
          )));
          const ran = await runAgentCommand({ command, cwd, skipConfirm: true });
          finishAgentReply(ran.reply || 'Command finished.', 'ARK · agent');
          return;
        }
        if (agentOutcome.handled && agentOutcome.reply) {
          finishAgentReply(agentOutcome.reply, 'ARK · agent');
          return;
        }
      }

      if (looksLikeRuntimeInstallAsk(content) && !looksLikeInstallDepsAsk(content)) {
        const runtimeCmd = proposeRuntimeInstall(content);
        if (runtimeCmd) {
          const runtimeOutcome = await runAgentCommand({
            command: runtimeCmd,
            cwd: agentCwd,
            confirmLabel: runtimeCmd,
          });
          if (runtimeOutcome.needsConfirm) {
            const { command, cwd, label } = runtimeOutcome.needsConfirm;
            const modeLabel = executionModeLabel(getAgentExecutionMode());
            if (!window.confirm(`Install on your PC?\n\n${label}\n\nMode: ${modeLabel}`)) {
              finishAgentReply(
                'Install canceled. Say it again when ready, or switch to Run everything in Settings → Security.',
                'ARK',
              );
              return;
            }
            const ran = await runAgentCommand({ command, cwd, skipConfirm: true });
            finishAgentReply(
              ran.reply || 'Install finished.',
              'ARK · agent',
            );
            return;
          }
          if (runtimeOutcome.handled && runtimeOutcome.reply) {
            finishAgentReply(runtimeOutcome.reply, 'ARK · agent');
            return;
          }
        }
      }
    }
    const stickyFiles = resolvedStudio.files;
    let stickyCount = Object.keys(stickyFiles).length;
    const diskBound = Boolean(chatStudioDiskRootRef.current || resolvedStudio.projectId || chatStudioProjectIdRef.current);
    const wantsCodeEdit = chatTurnAllowsFileEdits(content, turnComposerMode);

    // Reload files from disk/project if sticky is empty but a workspace is bound.
    if (stickyCount === 0 && diskBound && wantsCodeEdit) {
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
      const diskRoot = chatStudioDiskRootRef.current;
      if (stickyCount === 0 && diskRoot && window.arkDesktop?.readTextFile) {
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
    }

    if (
      (mode === 'general' || mode === 'code')
      && (stickyCount > 0 || (diskBound && wantsCodeEdit))
      && shouldInspectInChat(content, stickyCount > 0 || diskBound, content.startsWith(COMPOSER_MODE_PREFIX.debug))
    ) {
      setMessages(prev => prev.map(m => (
        m.id === assistantId
          ? { ...m, content: `__generating__:chat:${wantsCodeEdit ? 'Updating project files…' : `Reading ${stickyCount || 'project'} file${stickyCount === 1 ? '' : 's'}…`}` }
          : m
      )));
      await new Promise<void>(r => { window.setTimeout(r, 40); });
      if (mySeq !== genSeqRef.current) return;

      const projectLabel = resolvedStudio.name
        || loadRecentProjects().find(p => p.id === resolvedStudio.projectId)?.name
        || loadChatStudio(activeChatId)?.name
        || 'Attached project';
      const sticky = pinnedModel.source === 'auto' ? threadBrainRef.current : null;

      const planTurn = isChatPlanTurn(content) && !looksLikeImplementGo(content);
      const allowEdits = wantsCodeEdit;

      // Multi-agent: Design → Code → Verify (+ → Multi-agent, or explicit ask).
      if (
        allowEdits
        && (workspaceProjectId || chatStudioDiskRootRef.current)
        && wantsMultiAgentTurn(content, turnComposerMode === 'multitask')
        && stickyCount > 0
      ) {
        setMessages(prev => prev.map(m => (
          m.id === assistantId
            ? { ...m, content: '__generating__:chat:Multi-agent: Design → Code → Verify…' }
            : m
        )));
        const multi = await runProjectMultiAgent({
          brief: content,
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
          finishAgentReply(multi.reply, 'ARK · multi-agent');
          return;
        }
        // If multi-agent produced nothing useful, fall through to normal edit path.
      }

      // Fast path: deterministic UI patches. surgical tweaks + layout rebuilds.
      if (allowEdits && (workspaceProjectId || chatStudioDiskRootRef.current)) {
        const { finalizeWebEdits } = await import('@/lib/webProjectCanon');
        const micro = finalizeWebEdits(stickyFiles, content, [], { projectName: projectLabel });
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
            userMessage: content,
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
            const reply = buildStudioTraceMessage({
              startedAt: replyStartedAt,
              elapsedMs,
              userMessage: content,
              answer,
              wrotePaths: applied.updated,
              projectName: projectLabel,
            });
            const next = messagesRef.current.map(m => (
              m.id === assistantId
                ? {
                  ...m,
                  content: reply,
                  provider_used: 'ARK · local patch',
                  elapsed_ms: elapsedMs,
                }
                : m
            ));
            messagesRef.current = next;
            persistModeThread(mode, next, { chatId: activeChatId });
            setMessages(next);
            setInspectOfferId(assistantId);
            setStudioOfferKind('details');
            setTraceDetailsId(null);
            clearGeneratingIfMineEarly();
            lastInspectReplyRef.current = reply;
            window.setTimeout(() => {
              if (mySeq === genSeqRef.current) flushQueuedSend();
            }, 0);
            return;
          }
        }
      }

      const result = await answerStudio(
        {
          userMessage: content,
          files: stickyFiles,
          projectName: projectLabel,
          lastIntent: lastStudioIntentRef.current,
          lastFindings: lastFindingsRef.current,
          mode: allowEdits ? 'code' : 'chat',
          preferredModelId: pinnedModel.id,
          preferredModelName: pinnedModel.name,
          preferredSource: pinnedModel.source,
          stickyModelId: sticky?.modelId,
          stickyModelName: sticky?.modelName,
          stickyPinnedSource: sticky?.pinnedSource,
          planOnly: planTurn,
          allowFileEdits: allowEdits,
          shouldAbort: () => mySeq !== genSeqRef.current || stopRequestedRef.current,
        },
        (live) => {
          if (mySeq !== genSeqRef.current || stopRequestedRef.current) return;
          const text = String(live || '').trim();
          if (text.length < 2) return;
          const dump = /@@@FILE|```[\w]*\n|<!DOCTYPE\b|<html[\s>]|export\s+default\s+function/i.test(text);
          const bubble = (allowEdits || dump)
            ? `__generating__:chat:${liveCodingStatusText(text)}`
            : text;
          setMessages(prev => {
            const next = prev.map(m => (
              m.id === assistantId ? { ...m, content: bubble } : m
            ));
            messagesRef.current = next;
            return next;
          });
        },
      );

      if (mySeq !== genSeqRef.current) return;

      lastStudioIntentRef.current = result.intent;
      if (result.findings?.length) lastFindingsRef.current = result.findings;
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
          userMessage: content,
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
            provider_used: result.meta || 'Local scan · attached files',
            elapsed_ms: elapsedMs,
          }
          : m
      ));
      messagesRef.current = next;
      persistModeThread(mode, next, { chatId: activeChatId });
      setMessages(next);
      if (allowEdits) {
        setInspectOfferId(assistantId);
        setStudioOfferKind('details');
        setTraceDetailsId(null);
      } else {
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
      || histPrefs.rememberContext
      // Long threads stay continuous even if the setting was turned off mid-chat.
      || priorForHistory.length >= 4;
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
        const raw = sessionStorage.getItem('ark:inflight-media');
        const inflight = raw ? JSON.parse(raw) as { chatId?: string } : null;
        if (!inflight?.chatId || inflight.chatId === activeChatId) {
          sessionStorage.removeItem('ark:inflight-media');
        }
      } catch {
        sessionStorage.removeItem('ark:inflight-media');
      }
      setGenerating(false);
    };

    const finalizeAssistant = (finalText: string, provider: string, libraryId?: string) => {
      if (mySeq !== genSeqRef.current) return;
      if (provider && provider !== 'ARK · setup needed') {
        setLocalPrefs({ lastAnsweredLabel: provider });
      }
      const threadChatId = persistChatIdRef.current || activeChatId;
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

      // Prefer live messages; fall back to stored thread when the view already switched chats.
      let next = patchThread(messagesRef.current);
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

    // First-run guarantee: no live chat path → wait if installing, else honest CTA (no fake ARK Core answer).
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
      finalizeAssistant(honest, installing ? 'ARK · installing' : 'ARK · setup needed');
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
      let response = 'ARK Router could not complete this request.';
      let usedPlugin = false;
      let skipReplySanitize = false;
      let lastLibraryId: string | undefined;
      let resolvedProvider = providerLabel;
      let streamedPartial = '';
      let abandoned = false;
      let idleTimer: number | undefined;
      let earlyResolve: ((value: { reply: string }) => void) | null = null;
      const earlyDone = new Promise<{ reply: string }>((resolve) => {
        earlyResolve = resolve;
      });

      const armStreamIdleFinish = () => {
        if (idleTimer) window.clearTimeout(idleTimer);
        const draftNow = String(streamedPartial || '').trim();
        // Once we have a real answer, finish quickly when the model goes quiet.
        // Long 22s idle + "incomplete" early-return used to leave Stop + queue stuck forever.
        const solid = draftNow.length >= 40 && /[.!?…]["')\]]*\s*$/.test(draftNow);
        const idleMs = solid ? 2_500 : draftNow.length >= 12 ? 6_000 : 22_000;
        idleTimer = window.setTimeout(() => {
          if (mySeq !== genSeqRef.current || abandoned || stopRequestedRef.current) return;
          const cleaned = usableAssistantText(streamedPartial, content, previousAssistant);
          const draft = (cleaned || streamedPartial).trim();
          if (draft.length < 8) return;
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
            }, 4_000);
            return;
          }
          const incomplete = /[:;,—–-]\s*$/.test(draft)
            || /\n\s*(?:\d+\.|[-*])\s+[^\n]{0,80}:\s*$/.test(draft)
            || /\b(and|or|the|to|of|for|with|a|an)\s*$/i.test(draft);
          // Short incomplete drafts can wait one more beat; long drafts must release Stop.
          if (incomplete && draft.length < 400) {
            idleTimer = window.setTimeout(() => {
              if (mySeq !== genSeqRef.current || abandoned || stopRequestedRef.current) return;
              abandoned = true;
              void engineGenerateCancel();
              chatTurnCtlRef.current.clearGenerating();
              earlyResolve?.({ reply: cleaned || draft });
            }, 3_500);
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

      if ((mode === 'general' || mode === 'code') && isGithubPullAsk(content)) {
        const runtime = getPluginRuntime('github', loadPluginState());
        const token = runtime.token?.trim();
        if (!token) {
          response = [
            'Connect GitHub under Plugins so ARK can see your repos.',
            '',
            'Then say “what repos do I have?” or **open owner/repo in Code**. Empty repos are fine. we start from a blank page.',
          ].join('\n');
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
                  localStorage.setItem(`ark:project-draft:${project.id}`, seed);
                } catch { /* ignore */ }
                response = [
                  `Pulled **${picked.full_name}** into Code.`,
                  cloned.branch ? `Branch: ${cloned.branch}` : '',
                  (picked.size ?? 1) === 0
                    ? 'It looks empty. say what to add and I will start building.'
                    : 'Explorer has the files. Keep chatting in Code to add, remove, upgrade, or fix.',
                ].filter(Boolean).join('\n');
                usedPlugin = true;
                window.setTimeout(() => navigate({ name: 'project', id: project.id }), 120);
              }
            }
          } catch (err) {
            response = err instanceof Error ? err.message : 'GitHub could not list your repos.';
            usedPlugin = true;
          }
        }
      }

      if (!usedPlugin && hasStudioFiles && (mode === 'general' || mode === 'code') && looksLikeImageAsk(content) && composerMode !== 'ask') {
        imageOfferPromptRef.current = content;
        response = [
          'That sounds like an image request.',
          '',
          'Switch to **Image** to generate it. your prompt carries over and the result saves to Creations.',
        ].join('\n');
        setImageOfferId(assistantId);
        usedPlugin = true;
      }

      if (!usedPlugin && (mode === 'general' || mode === 'code') && shouldInspectInChat(content, hasStudioFiles, content.startsWith(COMPOSER_MODE_PREFIX.debug))) {
        // Planning follow-ups (“more details”) must stay in normal chat. never the empty-attach wall.
        const pendingPlan = getLastPendingGreenfield(activeChatId);
        const planningFollowUp = Boolean(
          looksLikeConversationalPlanningAsk(content)
          || wantsPlanningOnly(content)
          || (pendingPlan && !looksLikeImplementGo(content) && !content.includes('<!--ark-attach:')),
        );
        if (planningFollowUp && !content.includes('<!--ark-attach:') && !content.includes('<!--ark-auto-read-->')) {
          // fall through to model chat below
        } else {
        skipReplySanitize = true;
        try {
          const attachMeta = parseChatAttach(content) || parseChatAttaches(content)[0];
          let filesForInspect = studioFiles;
          if (Object.keys(filesForInspect).length === 0) {
            const pid = attachMeta?.projectId || chatStudioProjectIdRef.current;
            if (pid && window.arkDesktop?.projectRead) {
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
                const raw = localStorage.getItem(`ark:chat-studio-files:${pid}`);
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
            const engineResult = await answerStudio(
              {
                userMessage: inspectAsk,
                files: filesForInspect,
                projectName: projectLabel,
                lastIntent: lastStudioIntentRef.current,
                lastFindings: lastFindingsRef.current,
                mode: allowEdits ? 'code' : 'chat',
                preferredModelId: pinnedModel.id,
                preferredModelName: pinnedModel.name,
                preferredSource: pinnedModel.source,
                stickyModelId: sticky?.modelId,
                stickyModelName: sticky?.modelName,
                stickyPinnedSource: sticky?.pinnedSource,
                planOnly: planTurn,
                allowFileEdits: allowEdits,
                shouldAbort: () => abandoned || stopRequestedRef.current || mySeq !== genSeqRef.current,
              },
              (live) => {
                if (abandoned || stopRequestedRef.current || mySeq !== genSeqRef.current) return;
                const text = String(live || '').trim();
                if (text.length < 2) return;
                const dump = /@@@FILE|```[\w]*\n|<!DOCTYPE\b|<html[\s>]|export\s+default\s+function/i.test(text);
                const bubble = (allowEdits || dump)
                  ? `__generating__:chat:${liveCodingStatusText(text)}`
                  : text;
                setMessages(prev => {
                  const next = prev.map(m => (
                    m.id === assistantId ? { ...m, content: bubble } : m
                  ));
                  messagesRef.current = next;
                  return next;
                });
              },
            );
            lastStudioIntentRef.current = engineResult.intent;
            if (engineResult.findings?.length) lastFindingsRef.current = engineResult.findings;
            if (engineResult.packedTokens != null) {
              setTokenRatio(syncTokenUsage(activeChatId, engineResult.packedTokens));
            }
            let changedPaths: string[] = [];
            let appliedOk = false;
            let applyError: string | undefined;
            const inspectProjectId = chatStudioProjectIdRef.current || attachMeta?.projectId || null;
            if (
              (inspectProjectId || chatStudioDiskRootRef.current)
              && allowEdits
              && !looksLikePromptEcho(engineResult.text)
            ) {
              const applied = await applyChatReplyEdits({
                reply: engineResult.text,
                projectId: inspectProjectId,
                projectName: projectLabel,
                files: filesForInspect,
                userMessage: content,
                diskRoot: chatStudioDiskRootRef.current,
              });
              if (applied.ok) {
                appliedOk = true;
                changedPaths = applied.updated;
                setChatStudioFiles(applied.files);
                chatStudioFilesRef.current = applied.files;
                setChatCodePill(activeChatId, true);
                setCodePillSticky(true);
                persistStudioSnapshot(activeChatId, {
                  files: applied.files,
                  projectId: inspectProjectId,
                  name: projectLabel,
                });
                void pushLivePreview(applied.files, false);
              } else {
                applyError = applied.error || 'write_failed';
              }
            } else if (allowEdits && !inspectProjectId && !chatStudioDiskRootRef.current) {
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
            resolvedProvider = engineResult.meta || `${providerLabel} · files`;
            usedPlugin = true;
            if (allowEdits) {
              setInspectOfferId(assistantId);
              setStudioOfferKind('details');
              setTraceDetailsId(null);
            } else {
              setInspectOfferId(null);
              setStudioOfferKind(null);
            }
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
            const threadChatId = persistChatIdRef.current || activeChatId;
            const patch = (list: ChatMessage[]) =>
              list.map(m => (m.id === assistantId ? { ...m, content: text } : m));
            const viewing = !routeChatIdRef.current || routeChatIdRef.current === threadChatId;
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
                : messagesRef.current;
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
              id: 'ark-image-core',
              name: 'ARK Image Core',
              source: 'local',
              detail: 'Free · Pollinations · local SD when installed',
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
            resolvedProvider = routerProviderLabel(routed, 'ARK Image Core');
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
          response = 'Video generation is coming soon. Use **Image** or **Chat** for now.';
          usedPlugin = true;
        } else {
        try {
          const setAssistantContent = (text: string) => {
            if (abandoned || stopRequestedRef.current || mySeq !== genSeqRef.current) return;
            const threadChatId = persistChatIdRef.current || activeChatId;
            const patch = (list: ChatMessage[]) =>
              list.map(m => (m.id === assistantId ? { ...m, content: text } : m));
            const viewing = !routeChatIdRef.current || routeChatIdRef.current === threadChatId;
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
                : messagesRef.current;
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
          const planningTalk = shouldInjectPlanningConversation(content, { pendingIdea: Boolean(pendingIdea) });
          let routeMessage = content;
          let history = prefs.rememberContext
            ? (routeHistory.length ? routeHistory : buildRouterHistory(priorForHistory, content, vision, {
              keepContinuity: true,
              kind: 'chat',
            }))
            : buildRouterHistory([], content, vision);
          if (planningTalk) {
            chatTurnCtlRef.current.pushStatus('Thinking through your idea…');
            await new Promise<void>(r => {
              window.setTimeout(
                r,
                Math.max(2800, Math.min(10000, briefReadDelayMs(content || pendingIdea?.summary || ''))),
              );
            });
            if (mySeq !== genSeqRef.current || stopRequestedRef.current) return;
            history = [
              { role: 'user' as const, content: planningConversationHint(pendingIdea?.summary || undefined) },
              { role: 'assistant' as const, content: 'Understood. I will stay on their topic, give a thorough answer, and not invent a random product.' },
              ...history,
            ];
            routeMessage = content;
          }
          if (looksLikeWebGroundedAsk(content)) {
            chatTurnCtlRef.current.pushStatus('Looking that up…');
            try {
              const hit = await webSearchForChat(content);
              if (mySeq !== genSeqRef.current || stopRequestedRef.current) return;
              const note = hit.ok ? formatWebLookupForPrompt(hit) : '';
              if (note) {
                history = [
                  ...history,
                  { role: 'user' as const, content: note },
                  {
                    role: 'assistant' as const,
                    content: 'Understood — I will use those lookup notes where helpful, ask clarifying questions when needed, and answer their request directly.',
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
          const sticky = stickyBrain;
          const pinnedIsCoder = /coder|starcoder/i.test(`${pinnedModel.id || ''} ${pinnedModel.name || ''}`);
          const judgmentAsk = looksLikeDirectJudgmentAsk(content);
          const useChatBrain = (planningTalk || judgmentAsk) && (pinnedIsCoder || /1\.5b|1.5B|0\.5b/i.test(`${pinnedModel.id || ''} ${pinnedModel.name || ''}`));
          const timeoutMs = 250_000;
          const firstTokenMs = planningTalk ? 55_000 : 35_000;
          let sawToken = false;
          const routePromise = arkRoute({
            message: routeMessage,
            kind: 'chat',
            preferredModelId: useChatBrain ? undefined : pinnedModel.id,
            preferredModelName: useChatBrain ? undefined : pinnedModel.name,
            preferredSource: useChatBrain ? undefined : pinnedModel.source,
            stickyModelId: useChatBrain ? undefined : sticky?.modelId,
            stickyModelName: useChatBrain ? undefined : sticky?.modelName,
            stickyPinnedSource: useChatBrain ? undefined : sticky?.pinnedSource,
            history,
            onChunk: prefs.streamResponses
              ? (piece) => {
              if (abandoned || stopRequestedRef.current || mySeq !== genSeqRef.current) return;
              if (!piece) return;
              streamedPartial += piece;
              const dump = /@@@FILE|```[\w]*\n|<!DOCTYPE\b|<html[\s>]|export\s+default\s+function/i.test(streamedPartial);
              const live = usableAssistantText(streamedPartial, content, previousAssistant)
                || streamedPartial.trim();
              const liveClean = live && !looksLikePromptEcho(live) ? live : '';
              // Only real answer tokens count — echo used to flip sawToken and disable the 35s timeout.
              if (liveClean) sawToken = true;
              // Fast-fail when the model is only re-emitting the system prompt.
              if (
                !liveClean
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
              setMessages(prev => {
                // Don't stream another thread onto a blank New Chat / different recent.
                if (routeChatIdRef.current !== activeChatId) {
                  if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
                  persistTimerRef.current = window.setTimeout(() => {
                    const liveMsg = {
                      ...assistantMsg,
                      content: liveClean || `__generating__:chat:${statusLabel}`,
                    };
                    persistModeThread(mode, [...normalized, userMsg, liveMsg], {
                      chatId: activeChatId,
                    });
                  }, 220);
                  return prev;
                }
                const next = prev.map(m => {
                  if (m.id !== assistantId) return m;
                  if (dump) {
                    return { ...m, content: `__generating__:chat:${liveCodingStatusText(streamedPartial)}` };
                  }
                  return { ...m, content: liveClean || `__generating__:chat:${planningTalk ? 'Thinking through your idea…' : statusLabel}` };
                });
                messagesRef.current = next;
                if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
                persistTimerRef.current = window.setTimeout(() => {
                  persistModeThread(mode, messagesRef.current, {
                    chatId: persistChatIdRef.current || activeChatId,
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
          const candidate = String(rawReply || streamedPartial || '').trim();
          response = usableAssistantText(rawReply, content, previousAssistant)
            || usableAssistantText(streamedPartial, content, previousAssistant)
            || (looksLikePromptEcho(candidate) ? '' : candidate);
          if (
            looksLikeCodeAsk(content)
            && mode !== 'image'
            && mode !== 'video'
            && (!response.trim() || (!/```[\s\S]+```/.test(response) && response.length < 100))
          ) {
            response = [
              "I couldn't produce copy-pasteable code with the current brain yet.",
              '',
              '**In chat:** try again with a stronger model from the ARK menu, or open **Code** (sidebar or **Yes** above) so ARK writes files you can edit and preview.',
              '',
              'Your prompt works. Code workspace is the best path for a full calculator app with Explorer + Preview.',
            ].join('\n');
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
            if (pinnedModel.source === 'local' && pinnedModel.id !== 'ark-auto') {
              setLocalPrefs({ lastChatModelId: pinnedModel.id });
            }
          }
          usedPlugin = true;
        } catch (err) {
          if (idleTimer) window.clearTimeout(idleTimer);
          abandoned = true;
          void engineGenerateCancel();
          chatTurnCtlRef.current.clearGenerating();
          const timedOut = err instanceof Error && /timed out/i.test(err.message);
          const rawErr = stopRequestedRef.current && streamedPartial
            ? usableAssistantText(streamedPartial, content, previousAssistant) || streamedPartial.trim()
            : streamedPartial.trim().length > 8
              ? usableAssistantText(streamedPartial, content, previousAssistant) || (looksLikePromptEcho(streamedPartial) ? '' : streamedPartial.trim())
              : (timedOut
                ? 'Response timed out. Try again or pick another model.'
                : (err instanceof Error ? err.message : 'ARK Router failed'));
          response = classifyErrorMessage(rawErr).message;
          usedPlugin = true;
        }
      }
      } finally {
        if (idleTimer) window.clearTimeout(idleTimer);
        chatTurnCtlRef.current.clearGenerating();
      }

      if (mySeq !== genSeqRef.current) return;

      if (!isMediaMode && !pluginId && !skipReplySanitize) {
        const cleaned = usableAssistantText(response, content, previousAssistant);
        const candidate = String(cleaned || response || '').trim();
        response = looksLikePromptEcho(candidate) ? '' : (cleaned || candidate);
        // Never dump raw @@@FILE / HTML source into the chat transcript.
        if (/@@@FILE|<!DOCTYPE\b|<html[\s>]/i.test(response)) {
          response = finalizeCodingChatBubble({
            userMessage: content,
            rawReply: response,
          });
        }
      }
      if (
        !String(response || '').trim()
        && looksLikeDirectJudgmentAsk(content)
      ) {
        response = [
          '**How fast:** for a focused MVP (core map view + a couple of layers), a usable beta is often about **3–8 weeks** of steady work — longer if you need heavy offline data, turn-by-turn, or polished mobile releases.',
          '',
          '**Worth building?** **Yes as a personal / niche project** if you care about the craft or a specific use case Google Maps does not cover. As a broad public “Google Maps competitor,” it is harder — the market already has strong apps, so you need a clear niche (private property maps, specialty layers, offline-first, etc.) and real testers.',
          '',
          'Want to lock the niche and a one-month beta scope next?',
        ].join('\n');
      }
      if (stopRequestedRef.current && !response.trim()) {
        response = '(stopped)';
      }
      if (!String(response || '').trim()) {
        response = isMediaMode
          ? 'Generation did not finish. Try sending again.'
          : '(no response)';
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

  const resizeComposer = () => {
    const el = textareaRef.current;
    if (!el) return;
    const value = el.value || '';
    if (!value) {
      el.style.height = '';
      el.style.maxHeight = '';
      el.style.overflowY = 'hidden';
      setComposerTall(false);
      return;
    }
    // Leave pill layout early so wrapped lines are never clipped.
    const wantsTall = value.includes('\n') || value.length > 24;
    setComposerTall(wantsTall);

    const applyHeight = () => {
      const box = textareaRef.current;
      if (!box) return;
      box.style.height = 'auto';
      void box.offsetHeight;
      const raw = box.scrollHeight;
      const max = Math.round(window.innerHeight * 0.4);
      const minPx = wantsTall ? 56 : 22;
      const next = Math.max(minPx, Math.min(Math.max(raw, minPx), max));
      box.style.height = `${next}px`;
      box.style.overflowY = raw > max ? 'auto' : 'hidden';
    };

    applyHeight();
    requestAnimationFrame(applyHeight);
  };

  const onInput = (value: string) => {
    setInput(value);
    if (imageSwitchDismissed && !looksLikeImageAsk(value)) setImageSwitchDismissed(false);
    requestAnimationFrame(resizeComposer);
  };

  useEffect(() => {
    requestAnimationFrame(resizeComposer);
  }, [input]);

  const applyIdea = (label: string) => {
    setInput(label);
    textareaRef.current?.focus();
  };

  const viewingChatId = route.name === 'chat' ? route.chatId : undefined;
  // Explore / idea grid only for brand-new chats. never when a Recent thread is open.
  const showEmpty = !loading && messages.length === 0 && !viewingChatId;
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
        className="w-72 max-h-[min(22rem,calc(100vh-6rem))] overflow-y-auto rounded-xl border border-surface-border bg-ark-navy-900 shadow-2xl py-1.5"
        style={{
          position: 'fixed',
          left: menuPos.left,
          ...(menuPos.top != null ? { top: menuPos.top } : { bottom: menuPos.bottom }),
          transform: 'translateX(-50%)',
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
                      defaultModelId: 'ark-auto',
                      lastChatModelId: undefined,
                      aiMode: 'automatic',
                      autoFailover: true,
                    });
                  }
                  setModelMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-hover"
              >
                <span className="w-7 h-7 flex items-center justify-center shrink-0">
                  <ArkMark className="w-6 h-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-content-primary truncate">{model.name}</span>
                  <span className="block text-[11px] text-content-tertiary truncate">
                    {autoEquippedCaption(threadBrain)}
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
                <span className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                  <Cpu className="w-3.5 h-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-content-primary truncate">{model.name}</span>
                  <span className="block text-[11px] text-content-tertiary truncate">{model.detail}</span>
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
                <span className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-content-primary truncate">{model.name}</span>
                  <span className="block text-[11px] text-content-tertiary truncate">{model.detail}</span>
                </span>
              </div>
            ))}
          </>
        )}
        {(() => {
          const notReadyLocal = modelsForTab.filter(m =>
            m.source === 'local'
            && m.id !== 'ark-auto'
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
                  <span className="w-7 h-7 rounded-lg bg-surface-hover text-content-tertiary flex items-center justify-center shrink-0">
                    <Cpu className="w-3.5 h-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-content-primary truncate">{model.name}</span>
                    <span className="block text-[11px] text-content-tertiary truncate">{model.detail}</span>
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
                <span className="w-7 h-7 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
                  <Cloud className="w-3.5 h-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-content-primary truncate">{model.name}</span>
                  <span className="block text-[11px] text-content-tertiary truncate">{model.detail}</span>
                </span>
                {activeModel.id === model.id && <Check className="w-4 h-4 text-ark-accent-green shrink-0" />}
              </button>
            ))}
          </>
        )}
        {kind === 'chat' && keyedCloud.length === 0 && ollamaModels.length === 0 && engineLocalModels.length === 0 && (
          <p className="px-3 py-2 text-[11px] text-content-tertiary leading-relaxed">
            Install a local brain in Models, or connect a free key in Settings.
          </p>
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
    <div className="w-full max-w-3xl mx-auto">
      {failoverChip}
      {composerMode && (
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${COMPOSER_MODE_PILL[composerMode]}`}>
            {COMPOSER_MODE_LABEL[composerMode]}
            <button
              type="button"
              onClick={() => setComposerMode(null)}
              className="opacity-70 hover:opacity-100"
              aria-label="Clear mode"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        </div>
      )}
      <div className="flex flex-col">
        <div className="min-w-0 flex flex-col">
          {queueLen > 0 && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-3.5 py-2 text-[11px] text-amber-100/90">
              <span className="min-w-0 truncate">
                {queueLen === 1
                  ? '1 message queued. sends as soon as this reply finishes'
                  : `${queueLen} messages queued. send next when this reply finishes`}
              </span>
              <button
                type="button"
                className="shrink-0 rounded-md px-2 py-0.5 text-amber-200/90 hover:bg-amber-500/20 transition-colors"
                onClick={() => {
                  pendingQueueRef.current = [];
                  setQueueLen(0);
                }}
              >
                Clear
              </button>
            </div>
          )}
          {attachUploading && (
            <p className="mb-2 px-1 text-[11px] text-sky-300/90 animate-pulse">{attachUploading}</p>
          )}
          {pendingAttaches.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
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
          {dropHint && !pendingAttaches.length && !attachUploading && (
            <p className="mb-2 px-1 text-[11px] text-amber-300/90">{dropHint}</p>
          )}
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
          {(mode === 'general' || mode === 'code') && looksLikeImageAsk(input) && composerMode !== 'ask' && !imageSwitchDismissed && !looksLikeCodeAsk(input) && (
            <div className="mb-1 flex justify-center px-1">
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/25 bg-sky-500/10 pl-2 pr-0.5 py-0.5 text-[10px] text-sky-100/90 shadow-sm max-w-full">
                <ImageIcon className="w-3 h-3 shrink-0 text-sky-300/90" />
                <span className="truncate max-w-[11rem] sm:max-w-[14rem]">
                  Generate in Image?
                </span>
                <button
                  type="button"
                  className="rounded-full px-1.5 py-0.5 text-sky-100/60 hover:bg-sky-500/15 transition-colors"
                  onClick={() => setImageSwitchDismissed(true)}
                  title="Stay in chat"
                >
                  Stay
                </button>
                <button
                  type="button"
                  className="rounded-full px-1.5 py-0.5 text-sky-50 hover:bg-sky-500/20 transition-colors font-medium"
                  onClick={() => openImageTab()}
                >
                  Yes
                </button>
              </span>
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
              <span className="text-[10px] text-content-tertiary">Max 30s · quality render may take up to ~30s</span>
            </div>
          )}
          <div className={`flex gap-2 min-w-0 ${composerTall ? 'items-end' : 'items-center'}`}>
          <div
            className={`flex-1 min-w-0 border border-surface-border bg-ark-navy-900/90 shadow-lg shadow-black/20 ${
              composerTall
                ? 'flex flex-col rounded-2xl overflow-visible'
                : 'flex items-center gap-1 rounded-full min-h-11 pl-1 pr-1.5 py-1.5 overflow-visible'
            }`}
          >
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

          {!composerTall && mode === 'image' && (
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

          {!composerTall && (
            <ComposerPlusMenu
              scope={mode === 'image' ? 'image' : 'chat'}
              busy={attachBusy || Boolean(attachUploading)}
              onAction={handlePlusAction}
              buttonClassName="w-8 h-8 rounded-full flex items-center justify-center text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors shrink-0"
            />
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => onInput(e.target.value)}
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
            title="Enter to send · Shift+Enter for a new line"
            aria-label="Message. Enter to send, Shift+Enter for a new line"
            className={`bg-transparent border-none resize-none text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none leading-5 ${
              composerTall
                ? 'w-full min-h-[3.25rem] px-3.5 pt-3.5 pb-2'
                : 'flex-1 min-w-0 min-h-[1.25rem] px-1 py-0 self-center'
            }`}
            style={{ overflowY: 'hidden' }}
          />

          <div
            className={
              composerTall
                ? 'flex items-center justify-between gap-2 px-2 pb-2 pt-1'
                : 'flex items-center shrink-0'
            }
          >
          {composerTall && (
            <ComposerPlusMenu
              scope={mode === 'image' ? 'image' : 'chat'}
              busy={attachBusy || Boolean(attachUploading)}
              onAction={handlePlusAction}
              buttonClassName="w-8 h-8 rounded-full flex items-center justify-center text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors shrink-0"
            />
          )}

          <div className="flex items-center gap-1.5 shrink-0">
          <button
            ref={modelButtonRef}
            type="button"
            onClick={() => setModelMenuOpen(o => !o)}
            className="inline-flex items-center gap-1 rounded-full border border-surface-border/80 bg-surface-hover/60 hover:bg-surface-hover px-2.5 py-1 text-xs text-content-primary transition-colors max-w-[9rem]"
            title={`Active model · ${
              activeModel.source === 'auto'
                ? (threadBrain ? autoEquippedCaption(threadBrain) : 'ARK Auto · picks best brain')
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
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
              title="Stop generating"
              aria-label="Stop generating"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          )}
          </div>
          </div>
          </div>

          <TokenUsageRing
            contextRatio={tokenRatio}
            modelRatio={modelRatio}
            size={20}
            className={`text-content-primary shrink-0 ${composerTall ? 'mb-2' : 'self-center'}`}
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
            Open desktop ARK Engine for free video routes
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
        {(mode === 'general' || mode === 'code') && chatPlugins.map(plugin => (
              <button
                key={plugin.id}
                type="button"
                onClick={() => {
                  const first = plugin.actions[0]?.prompt;
                  if (first) {
                    setInput(first);
                    textareaRef.current?.focus();
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-ark-navy-900/80 px-2 py-0.5 text-[11px] text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors"
                title={plugin.actions[0]?.label ?? plugin.name}
              >
                <BrandMark id={plugin.id} name={plugin.name} initial={plugin.initial} tone={plugin.tone} size="xs" />
                {plugin.name}
              </button>
            ))}
      </div>
      {(mode === 'general' || mode === 'code') && (chatStudioDiskRoot || codePillSticky) && (
        <div className="mt-2 flex flex-wrap items-center justify-start gap-1.5 px-1">
          {isCodeTabEnabled() && codePillSticky ? (
            <button
              type="button"
              onClick={() => openCodeWorkspace()}
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/45 bg-violet-500/20 px-2.5 py-1 text-[11px] font-medium text-violet-100 hover:bg-violet-500/30 transition-colors"
              title="Open Code. files on the left, editor on the right"
            >
              <Code2 className="w-3.5 h-3.5 text-violet-300" />
              Code
            </button>
          ) : null}
          {chatStudioDiskRoot ? (
            <button
              type="button"
              onClick={() => void openProjectFolder()}
              className="inline-flex items-center gap-1.5 max-w-[min(100%,14rem)] rounded-full border border-amber-500/45 bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-200 hover:bg-amber-500/25 transition-colors"
              title={`Open folder: ${chatStudioDiskRoot}`}
            >
              <Folder className="w-3.5 h-3.5 shrink-0 text-amber-300" />
              <span className="truncate">
                {workspaceBadgeLabel || chatStudioDiskRoot.split(/[/\\]/).pop()}
              </span>
            </button>
          ) : null}
          {(chatStudioDiskRoot || previewUrl || Object.keys(chatStudioFiles).length > 0) ? (
            <button
              type="button"
              onClick={() => void openProjectPreview()}
              className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/45 bg-sky-500/15 px-2.5 py-1 text-[11px] font-medium text-sky-100 hover:bg-sky-500/25 transition-colors"
              title={previewUrl ? `Open live preview (${previewUrl})` : 'Open live preview window'}
            >
              <Globe className="w-3.5 h-3.5 text-sky-300" />
              {previewUrl && /localhost|127\.0\.0\.1/.test(previewUrl) ? 'Localhost' : 'Preview'}
            </button>
          ) : null}
        </div>
      )}
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
          <p className="text-[11px] text-content-tertiary mt-1">Add as many as you need. press Enter to read</p>
        </div>
      </div>
      <ChatModeTabs />
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-content-tertiary">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : showEmpty ? (
        mode === 'general' ? (
          <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 pb-16 w-full">
            <h1 className="text-2xl sm:text-3xl font-semibold text-content-primary tracking-tight mb-3 text-center">
              {greeting}
            </h1>
            <p className="text-xs text-content-tertiary mb-4 text-center max-w-lg">
              {capacity && !capacity.liveChat
                ? (engineInstallingModels.length
                  ? `Installing ${engineInstallingModels[0]?.name || 'local brain'}… Chat unlocks when it’s ready (or connect a free key).`
                  : 'No live model yet. Connect a free key or install a local brain, then send a message.')
                : null}
            </p>
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
                          onClick={() => navigate({ name: 'creation', id: c.id })}
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
            {mode === 'video' && (
              <>
                <p className="text-[11px] text-content-tertiary text-center mt-4 max-w-md mx-auto">
                  Pick clip length (10 / 20 / 30s) above the composer before you send. ARK renders quality frames. expect ~15–30s.
                </p>
                {ideaGrid(VIDEO_IDEAS)}
              </>
            )}
            {mode === 'code' && (!capacity || !capacity.liveChat) && ideaGrid(CODE_IDEAS)}
          </div>
        )
      ) : (
        <>
          <div className="relative flex-1 min-h-0 flex flex-col">
            <div
              ref={messagesScrollRef}
              onScroll={onMessagesScroll}
              className="flex-1 min-h-0 overflow-auto px-4 sm:px-8 py-6 ark-scroll-quiet"
            >
            <div className="max-w-5xl mx-auto w-full space-y-5">
              {messages.length === 0 && showOpenThread && (
                <p className="text-center text-xs text-content-tertiary py-8">
                  This chat is empty. Send a message to continue here.
                </p>
              )}
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex gap-3 animate-fade-in w-full ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.role !== 'user' && (
                    <div className="w-8 h-8 flex items-center justify-center shrink-0 mt-0.5">
                      <ArkMark className="w-7 h-7" title="ARK" />
                    </div>
                  )}
                  <div
                    className={`text-sm text-content-primary ${
                      msg.role === 'user'
                        ? 'max-w-[min(42rem,78%)] min-w-0 flex flex-col items-end gap-1'
                        : isMediaOnlyContent(msg.content)
                          || (msg.content.startsWith('__generating__:') && !isTraceMessage(msg.content))
                          || (
                            generating
                            && msg.id === messages[messages.length - 1]?.id
                            && (mode === 'image' || mode === 'video')
                          )
                          ? 'shrink-0'
                          : 'max-w-[min(44rem,92%)] min-w-0'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <>
                        <div className="min-w-0 max-w-full rounded-2xl px-4 py-3 bg-surface-hover">
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
                        return <ArkErrorInline message={msg.content} />;
                      }
                      return (
                        <MessageContent
                          content={msg.content}
                          live={Boolean(generating && isLast && isAssistant && isTraceMessage(raw))}
                          traceExpanded={traceDetailsId === msg.id}
                          onPromptChipPick={(prompt) => void sendMessageRef.current(prompt)}
                        />
                      );
                    })()}
                    {msg.role === 'assistant'
                      && !String(msg.content || '').startsWith('__generating__:')
                      && !isTraceMessage(msg.content)
                      && String(msg.content || '').trim() ? (
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-content-tertiary tabular-nums">
                          {(() => {
                            const raw = String(msg.content || '').trim();
                            const copied = copiedMsgId === msg.id;
                            return (
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
                            );
                          })()}
                          {typeof msg.elapsed_ms === 'number' && msg.elapsed_ms >= 0 && !isLikelyErrorMessage(msg.content) ? (
                            <span>
                              Responded in {formatReplyElapsed(msg.elapsed_ms)}
                              {msg.provider_used ? ` · ${msg.provider_used}` : ''}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
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
                    {msg.role === 'assistant' && imageOfferId === msg.id && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        <button
                          type="button"
                          className="text-[10px] rounded-full bg-sky-600 text-white px-2.5 py-1"
                          onClick={() => openImageTab(imageOfferPromptRef.current)}
                        >
                          Yes, open Image
                        </button>
                        <button
                          type="button"
                          className="text-[10px] rounded-full border border-surface-border px-2.5 py-1 text-content-secondary"
                          onClick={() => setImageOfferId(null)}
                        >
                          Stay in Chat
                        </button>
                      </div>
                    )}
                    {msg.role === 'assistant' && inspectOfferId === msg.id && studioOfferKind === 'details' && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        <button
                          type="button"
                          className="text-[10px] rounded-full bg-sky-600 text-white px-2.5 py-1"
                          onClick={() => setTraceDetailsId(traceDetailsId === msg.id ? null : msg.id)}
                        >
                          {traceDetailsId === msg.id ? 'Hide details' : 'More details'}
                        </button>
                      </div>
                    )}
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
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-surface-hover border border-surface-border mt-0.5">
                      <UserIcon className="w-4 h-4 text-content-secondary" />
                    </div>
                  )}
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
        </>
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
        projectName={
          loadChatStudio(route.name === 'chat' ? (route.chatId || '') : '')?.name
          || (chatStudioDiskRoot ? chatStudioDiskRoot.split(/[/\\]/).pop() : undefined)
        }
        onChangeFile={(path, content) => {
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
