import { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/context/AuthContext';
import { useRouter, type ChatMode } from '@/context/RouterContext';
import { useRecentProjects } from '@/context/RecentProjectsContext';
import { saveChatMessage } from '@/lib/api';
import { getLocalPrefs, hasProviderApiKey, setLocalPrefs } from '@/lib/localPrefs';
import { isCloudProviderEnabled } from '@/lib/cloudSources';
import { honestNoLiveChatReply, probeLiveCapacity, type LiveCapacity } from '@/lib/arkCapacity';
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
  looksLikeDeleteFilesAsk,
  looksLikeFolderPathAsk,
  parseFolderPathAsk,
  GRANT_OFF_FOLDER_MSG,
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
import { hasFolderAccessGrant, resolveScopedFolderPath, formatFolderLocatedMessage, syncWorkspaceGrantsFromPrefs, grantsFromPrefs, resolveWorkFolderPath } from '@/lib/workspaceGrants';
import { saveChatStudio, loadChatStudio, clearChatStudio } from '@/lib/chatStudioStore';
import { runCodeStudioCommand } from '@/lib/studioCommands';
import { applyChatReplyEdits, deleteChatWorkspacePath, parseDeleteTargetFromMessage } from '@/lib/chatAgentApply';
import {
  inferAgentCommand,
  looksLikeRuntimeInstallAsk,
  proposeRuntimeInstall,
  runAgentCommand,
} from '@/lib/chatAgentExec';
import { isPlanPrefixedMessage, looksLikeImplementGo } from '@/lib/chatPlanMode';
import {
  chatTurnAllowsExec,
  chatTurnAllowsFileEdits,
  hasActiveWorkspace,
  isChatPlanTurn,
  NO_WORKSPACE_MSG,
  normalizeComposerMode,
  workspacePathLabel,
} from '@/lib/chatAgentTurn';
import { githubToken } from '@/lib/codeGitHubWorkflow';
import { FreeKeyWizard } from '@/components/FreeKeyWizard';
import { ComposerPlusMenu, type ComposerPlusAction } from '@/components/ComposerPlusMenu';
import { TokenUsageRing } from '@/components/TokenUsageRing';
import { ArkErrorInline } from '@/components/ArkErrorInline';
import { BrandMark } from '@/components/BrandMark';
import { classifyErrorMessage, isLikelyErrorMessage } from '@/lib/errors';
import { isVideoTabEnabled } from '@/lib/featurePark';
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
} from '@/lib/chatHistory';
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
  Bot, User as UserIcon, Loader2, ImageIcon, Video, Code2,
  Upload, Cpu, Cloud, ChevronDown, Check, Blocks, FolderKanban, Zap, Square, X, ImagePlus,
  Puzzle, Briefcase, Github,
} from 'lucide-react';
import { engineGenerateCancel, getEngineStatus, setEngineModel } from '@/lib/arkEngine';

const COMPOSER_MODE_PREFIX: Record<'plan' | 'ask' | 'agent' | 'debug' | 'multitask', string> = {
  plan: 'Plan this out step by step, then we can build:\n\n',
  ask: '',
  agent: 'Agent mode — edit files and run approved tools in this workspace:\n\n',
  debug: 'Debug this — find the issue and propose a fix:\n\n',
  multitask: 'Break this into parallel tasks and tackle them clearly:\n\n',
};

const COMPOSER_MODE_LABEL: Record<'plan' | 'ask' | 'agent' | 'debug' | 'multitask', string> = {
  plan: 'Plan',
  ask: 'Ask',
  agent: 'Agent',
  debug: 'Debug',
  multitask: 'Tasks',
};

function composerModeFromContent(content: string): 'plan' | 'ask' | 'agent' | 'debug' | 'multitask' | null {
  if (content.startsWith(COMPOSER_MODE_PREFIX.plan)) return 'plan';
  if (content.startsWith(COMPOSER_MODE_PREFIX.agent)) return 'agent';
  if (content.startsWith(COMPOSER_MODE_PREFIX.debug)) return 'debug';
  if (content.startsWith(COMPOSER_MODE_PREFIX.multitask)) return 'multitask';
  return null;
}

function formatAccessBadge(): string {
  const g = grantsFromPrefs();
  if (g.fullPc) return 'Full PC';
  const parts: string[] = [];
  if (g.desktop) parts.push('Desktop');
  if (g.documents) parts.push('Documents');
  return parts.length ? parts.join(' · ') : 'Off';
}

function previewFromText(text: string) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  return t.length > 52 ? `${t.slice(0, 50)}…` : t;
}

function ChatModeTabs() {
  const { route, navigate } = useRouter();
  const current = route.name === 'chat'
    ? (route.mode === 'image' || route.mode === 'video' ? route.mode : 'general')
    : 'general';
  const go = (next: 'general' | 'image' | 'video') => {
    if (next === 'video' && !isVideoTabEnabled()) return;
    if (next === 'general') {
      if (route.name === 'chat' && !route.mode && !route.chatId) return;
      navigate({ name: 'chat' });
      return;
    }
    // Already on this Image/Video thread — keep it (don't wipe an in-progress generate).
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
  const tabs: { id: 'general' | 'image' | 'video'; label: string }[] = [
    { id: 'general', label: 'Chat' },
    { id: 'image', label: 'Image' },
    { id: 'video', label: 'Video' },
  ];
  return (
    <div className="shrink-0 flex items-center justify-center gap-1 pt-3 pb-1">
      {tabs.map(t => {
        const videoOff = t.id === 'video' && !isVideoTabEnabled();
        return (
        <button
          key={t.id}
          type="button"
          disabled={videoOff}
          onClick={() => go(t.id)}
          title={videoOff ? 'Video · coming soon' : undefined}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
            videoOff
              ? 'text-content-tertiary/40 cursor-not-allowed opacity-50'
              : current === t.id
              ? 'bg-surface-hover text-content-primary'
              : 'text-content-tertiary hover:text-content-primary'
          }`}
        >
          {t.label}
          {videoOff ? ' · soon' : ''}
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
  // Chat — only Auto by default; keyed clouds + Ollama added at runtime
  { id: 'ark-auto', name: 'ARK', source: 'auto', detail: 'Best brain · stays on for this chat', kind: 'chat' },
  // Image — paths that generate today
  { id: 'ark-auto', name: 'ARK', source: 'auto', detail: 'Best path · stays on for this chat', kind: 'image' },
  { id: 'ark-image-core', name: 'ARK Image Core', source: 'local', detail: 'Free · Pollinations · local SD when installed', kind: 'image' },
  { id: 'sd15-local', name: 'SD 1.5 Local', source: 'local', detail: 'On-device · install from Local AI', kind: 'image' },
  { id: 'sdxl-turbo-local', name: 'SDXL Turbo Local', source: 'local', detail: 'Fast on-device · install from Local AI', kind: 'image' },
  { id: 'flux-schnell-local', name: 'FLUX Schnell Local', source: 'local', detail: 'On-device FLUX · ~13 GB · Local AI', kind: 'image' },
  { id: 'dall-e-3', name: 'DALL·E 3', source: 'cloud', detail: 'Cloud image · OpenAI key', kind: 'image' },
  // Video — ARK Engine only (Pollinations / HF / motion-still). Not Kling or Sora.
  { id: 'ark-auto', name: 'ARK', source: 'auto', detail: 'Best path · stays on for this chat', kind: 'video' },
  { id: 'ark-video-core', name: 'ARK Video Core', source: 'local', detail: 'Free MP4 when the host answers · motion still otherwise', kind: 'video' },
];

/** Cloud chat options — only shown in the picker when that provider key exists. */
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
  const prefId = prefs.defaultModelId;
  if (kind === 'chat' && prefId && prefId !== 'ark-auto') {
    const cloud = CLOUD_CHAT_WHEN_KEYED.find(m => m.id === prefId);
    if (cloud && hasProviderApiKey(cloud.keyId) && isCloudProviderEnabled(cloud.keyId)) return cloud;
    if (prefId.startsWith('ollama:')) {
      return { id: prefId, name: prefId.replace(/^ollama:/, ''), source: 'local', detail: 'Ollama', kind: 'chat' };
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
    'Describe the image — ARK may ask a quick brief first…',
    'Upload a photo (+) to recreate or improve it…',
    'Describe style, subject, and mood for best accuracy…',
  ],
  video: [
    'Describe the video you want to create...',
    'Ask ARK to generate a short clip...',
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
        if (read?.ok && read.files && Object.keys(read.files).length) {
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

export function AIChat() {
  const { user } = useAuth();
  const { route, navigate } = useRouter();
  const { addCreation, addChat, addRecent, touchRecentProject, creations, chats, renameChat } = useRecentProjects();

  // Requirement: each app launch starts on a fresh chat (no resume of last thread).
  // Only strip a chatId that was ALREADY present on first paint — never wipe a chat
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
  const [inspectOfferId, setInspectOfferId] = useState<string | null>(null);
  /** actions = what next; handoff = after inspect */
  const [studioOfferKind, setStudioOfferKind] = useState<'actions' | 'handoff' | null>(null);
  const [githubOfferId, setGithubOfferId] = useState<string | null>(null);
  const [composerTall, setComposerTall] = useState(false);
  const [composerMode, setComposerMode] = useState<'plan' | 'ask' | 'agent' | 'debug' | 'multitask' | null>(null);
  const [videoDurationSec, setVideoDurationSec] = useState<10 | 20 | 30>(10);
  const [tokenRatio, setTokenRatio] = useState(0);
  const [modelRatio, setModelRatio] = useState(0);
  const [attachBusy, setAttachBusy] = useState(false);
  const stopRequestedRef = useRef(false);
  const generatingRef = useRef(false);
  /** Which chat id currently owns the in-flight generation (queue only for that chat). */
  const activeGenChatIdRef = useRef<string | null>(null);
  const pendingQueueRef = useRef<string[]>([]);
  const persistChatIdRef = useRef<string | null>(null);
  /** Always-current route chat id — avoid stale closures when flushing the queue. */
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
    setLocalPrefs({ defaultModelId: 'ark-auto', aiMode: 'automatic', autoFailover: true });
  }, []);

  useEffect(() => {
    if (generatingRef.current && messagesRef.current.length > messages.length) return;
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!shouldForceNewChat) {
      // No launch-time thread to clear — never steal later navigations.
      if (forceNewChatOnLaunch) didForceNewChatRef.current = true;
      return;
    }
    didForceNewChatRef.current = true;
    const nextMode = chatRoute?.mode && chatRoute.mode !== 'general' ? chatRoute.mode : undefined;
    navigate({ name: 'chat', mode: nextMode });
  }, [shouldForceNewChat, forceNewChatOnLaunch, navigate, chatRoute?.mode]);

  useEffect(() => {
    if (route.name !== 'chat') {
      routeChatIdRef.current = undefined;
      return;
    }
    if (effectiveChatId) {
      routeChatIdRef.current = effectiveChatId;
      persistChatIdRef.current = effectiveChatId;
      return;
    }
    if (generatingRef.current && activeGenChatIdRef.current) {
      return;
    }
    // Explicit blank starter (New Chat / Image / Video with no id) — never keep a stale thread id.
    // Otherwise the next send attaches to the previous Recent chat and looks like a “duplicate mix”.
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
      // We just created this chat and already have messages in state — don't wipe them.
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
      // Don't carry a folder from another chat into this thread — but restore this chat's files.
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
      setGenerating(Boolean(generatingRef.current && activeGenChatIdRef.current === route.chatId));
      setLoading(false);
      // Remount / tab return: if this thread is still marked in-flight and the last
      // assistant bubble is still generating, keep Stop + placeholder visible.
      // Stale inflight (app closed mid-gen) must not lock Thinking forever.
      try {
        const raw = sessionStorage.getItem('ark:inflight-media');
        const inflight = raw ? JSON.parse(raw) as { chatId?: string; mode?: string; startedAt?: number } : null;
        const stale = Boolean(inflight?.startedAt && Date.now() - inflight.startedAt > 180_000);
        if (stale || (inflight?.chatId && inflight.chatId !== route.chatId)) {
          sessionStorage.removeItem('ark:inflight-media');
          setMessages(prev => {
            const next = prev.map(m => (
              m.role === 'assistant' && String(m.content || '').startsWith('__generating__:')
                ? { ...m, content: '(interrupted — send again)' }
                : m
            ));
            messagesRef.current = next;
            persistModeThread(mode, next, { chatId: route.chatId });
            return next;
          });
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

    // Fresh New Chat / Image / Video — empty canvas (never inherit a stuck Stop state)
    // Guard: a send is mid-flight (including the await before generatingRef flips).
    if (activeGenChatIdRef.current && (generatingRef.current || messagesRef.current.length > 0)) {
      setLoading(false);
      setGenerating(Boolean(generatingRef.current));
      return;
    }
    try {
      const raw = sessionStorage.getItem('ark:inflight-media');
      const inflight = raw ? JSON.parse(raw) as { chatId?: string; mode?: string } : null;
      if (
        inflight?.chatId
        && inflight.mode
        && (route.mode === inflight.mode || (!route.mode && inflight.mode === 'general'))
      ) {
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
    setChatStudioProjectId(null);
    setChatStudioDiskRoot(null);
    setPendingAttaches([]);
    setPendingImages([]);
    lastStudioIntentRef.current = null;
    lastFindingsRef.current = [];
    if (!activeGenChatIdRef.current) {
      generatingRef.current = false;
      setGenerating(false);
    } else {
      setGenerating(Boolean(generatingRef.current));
    }
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    setDropHint('Code workspace is coming back inside Chat. Use + → Open folder to work on projects here.');
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
    if (read?.ok && read.files && Object.keys(read.files).length) {
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
        { kind: 'folder', name: repo.name, count: Object.keys(read.files).length, projectId: project.id, id: project.id },
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
    // Only explicit image drops go in the preview strip — never folder contents.
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
      setDropHint('Nothing readable in that drop — try another folder or file.');
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

  // Capture-phase only — avoid React+window double handlers that flicker the overlay.
  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      allowWindowFileDrop(e);
      if (dropHasFiles(e.dataTransfer) || (e.dataTransfer?.types?.length ?? 0) === 0) {
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
        ? await window.arkDesktop.workspaceOpenRoot({
          projectId: pid,
          ...(sourceDir ? { sourceDir } : {}),
        })
        : await window.arkDesktop.projectImportFolder({
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
          setPendingAttaches(prev => [...prev, { kind: 'file', name: base, count: 1, id: `file-${pid}` }].slice(0, 12));
          return { ok: true };
        }
        const err = res?.error || 'Could not open that folder.';
        setDropHint(err);
        return { ok: false, error: err };
      }
      const rawFiles = res.files || {};
      const folderName = res.name || 'folder';
      const files: Record<string, string> = {};
      for (const [rel, text] of Object.entries(rawFiles)) {
        const pathKey = String(rel).replace(/\\/g, '/');
        files[pathKey.startsWith(`${folderName}/`) ? pathKey : `${folderName}/${pathKey}`] = text;
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
        { kind: 'folder', name: folderName, count, projectId: pid, id: pid },
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

  /** Native OS file picker — shows files inside folders. */
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
    }
    const userTyped = Boolean(content.trim());
    const parts: string[] = [];
    if (attaches.length) {
      parts.push(encodeChatAttaches(attaches));
    }
    if (userTyped) {
      parts.push(content);
    } else if (attaches.length || hasStudio) {
      // Enter with only a folder/file — read it. Marker is hidden in the bubble.
      parts.push('<!--ark-auto-read-->');
    } else if (images.length) {
      content = mode === 'image' ? 'Recreate and improve this image' : 'What is in this image?';
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

    // Prefer live route id. Blank starters (no chatId) always mint a new id — never reuse persist.
    const blankStarter = route.name === 'chat' && !route.chatId;
    let activeChatId = blankStarter
      ? undefined
      : (routeChatIdRef.current || persistChatIdRef.current || undefined);
    const isNewChat = !activeChatId;
    if (!activeChatId) {
      activeChatId = `chat-${crypto.randomUUID().slice(0, 10)}`;
      skipChatLoadIdsRef.current.add(activeChatId);
      messagesRef.current = [];
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
    // Bind any pending folder attach to this chat id for follow-ups.
    if (Object.keys(chatStudioFilesRef.current).length) {
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
    // Reading… only when THIS message includes an upload — not leftover studio files.
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

    // Recover folder files from every source before any model call.
    const resolvedStudio = await resolveStudioFiles({
      chatId: activeChatId,
      memoryFiles: chatStudioFilesRef.current,
      memoryProjectId: chatStudioProjectIdRef.current,
      memoryDiskRoot: chatStudioDiskRootRef.current,
      messages: messagesRef.current,
    });
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

    const clearGeneratingIfMineEarly = () => {
      if (mySeq !== genSeqRef.current) return;
      generatingRef.current = false;
      if (activeGenChatIdRef.current === activeChatId) {
        activeGenChatIdRef.current = null;
      }
      setGenerating(false);
    };

    const finishPlainReply = async (replyText: string) => {
      const reply: ChatMessage = {
        id: assistantId,
        user_id: user?.id ?? 'guest',
        role: 'assistant',
        content: replyText,
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

    const pushAssistantStatus = (label: string) => {
      if (mySeq !== genSeqRef.current) return;
      const statusContent = `__generating__:chat:${label}`;
      setMessages(prev => {
        const next = prev.map(m => (m.id === assistantId ? { ...m, content: statusContent } : m));
        messagesRef.current = next;
        return next;
      });
    };

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

      pushAssistantStatus(`Found ${opts.displayName} — ${opts.targetPath}`);
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
      await finishPlainReply(encodePcExploreMessage(data));
    };

    // Switch workspace — user chose a project to work in (bind folder + rename chat).
    if ((mode === 'general' || mode === 'code') && looksLikeStartWorkOnFolderAsk(content)) {
      if (!hasFolderAccessGrant()) {
        await finishPlainReply(GRANT_OFF_FOLDER_MSG);
        return;
      }

      const wantName = parseWorkOnFolderName(content);
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
        await finishPlainReply(located.error || 'Could not find that folder.');
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

      await finishPlainReply(
        `**Moving to ${projectName}**\n\n`
        + `Workspace set to \`${opened.root || located.path}\`.\n\n`
        + 'You can open files, edit code, install deps, or ask me to fix something in this project.',
      );
      return;
    }

    // Projects / folder catalog — list only (no workspace bind, no "say the folder name" template).
    if (
      (mode === 'general' || mode === 'code')
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
        await finishPlainReply('Could not find a Projects folder or Desktop path. Turn on **Settings → Security → Allow Desktop folder access**, then ask again.');
        return;
      }

      setPendingAttaches([]);
      setChatStudioFiles({});
      chatStudioFilesRef.current = {};
      setChatStudioProjectId(null);
      chatStudioProjectIdRef.current = null;
      setChatStudioDiskRoot(null);
      chatStudioDiskRootRef.current = null;
      clearChatStudio(activeChatId);

      await runFolderCatalog({
        targetPath,
        displayName: displayName || 'folder',
        resolvedFromDesktop,
      });
      return;
    }

    // PC explore — games, desktop top-level, installed apps (not folder catalog asks).
    if (
      (mode === 'general' || mode === 'code')
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

    // STEP 1: Natural-language folder open — full import for fix/build/scan asks only.
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
          role: 'assistant',
          content: 'Which folder on your Desktop? Say the name — for example: *“What is AutoTrade on my desktop?”* or *“On my desktop I have a folder called my-app.”*',
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

    // STEP 1b: Folder by name — default to catalog when we parsed a folder name.
    if (
      (mode === 'general' || mode === 'code')
      && Object.keys(resolvedStudio.files).length === 0
      && parseFolderPathAsk(content)
      && looksLikeFolderPathAsk(content)
      && !shouldFullImportFolderAsk(content)
      && !looksLikePcExploreAsk(content)
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
    const turnComposerMode = composerModeFromContent(content);
    const agentCwd = chatStudioDiskRootRef.current
      || chatStudioDiskRoot
      || (workspaceProjectId
        ? (await window.arkDesktop?.projectPath?.(workspaceProjectId))?.root
        : undefined);

    const finishAgentReply = (reply: string, provider = 'ARK · agent') => {
      const elapsedMs = Date.now() - replyStartedAt;
      const next = messagesRef.current.map(m => (
        m.id === assistantId
          ? { ...m, content: reply, provider_used: provider, elapsed_ms: elapsedMs }
          : m
      ));
      messagesRef.current = next;
      persistModeThread(mode, next, { chatId: activeChatId });
      setMessages(next);
      clearGeneratingIfMineEarly();
    };

    // STEP 7: Clone into Chat workspace (no Code tab)
    if (
      (mode === 'general' || mode === 'code')
      && classifyGitAsk(content) === 'clone'
      && !workspaceActive
    ) {
      const ref = parseGithubRepoRef(content);
      if (!ref) {
        finishAgentReply('Say: **clone owner/repo** — example: *clone vercel/next.js*', 'ARK');
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
      if (read?.ok && read.files && Object.keys(read.files).length) {
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
      || looksLikeDeleteFilesAsk(content)
      || Boolean(classifyGitAsk(content))
    ) && !looksLikeFolderPathAsk(content);

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
          if (read?.ok && read.files && Object.keys(read.files).length) {
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

    // STEP 3: Delete file in active workspace
    if (
      looksLikeDeleteFilesAsk(content)
      && workspaceProjectId
      && studioFileKeys.length
      && (mode === 'general' || mode === 'code')
    ) {
      const target = parseDeleteTargetFromMessage(content);
      if (!target) {
        finishAgentReply(
          'Which file should I delete? Name the path — e.g. *delete `src/old.ts`*.',
          'ARK',
        );
        return;
      }
      if (!window.confirm(`Delete from your workspace?\n\n${target}`)) {
        finishAgentReply('Delete canceled.', 'ARK');
        return;
      }
      const del = await deleteChatWorkspacePath({ projectId: workspaceProjectId, relPath: target });
      if (del.ok) {
        const nextFiles = { ...resolvedStudio.files };
        delete nextFiles[target];
        resolvedStudio.files = nextFiles;
        setChatStudioFiles(nextFiles);
        chatStudioFilesRef.current = nextFiles;
        persistStudioSnapshot(activeChatId, {
          files: nextFiles,
          projectId: workspaceProjectId,
          name: workspaceLabel,
        });
        finishAgentReply(`Deleted \`${target}\` from your workspace.`, 'ARK');
      } else {
        finishAgentReply(del.error || `Could not delete \`${target}\`.`, 'ARK');
      }
      return;
    }

    // STEP 4–5: Agent commands (npm/pip/git shell) and runtime installs
    if (
      (mode === 'general' || mode === 'code')
      && agentCwd
      && window.arkDesktop?.agentRun
      && chatTurnAllowsExec(content, turnComposerMode)
    ) {
      if (looksLikeRuntimeInstallAsk(content)) {
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
    }

    if (looksLikeDeleteFilesAsk(content) && !studioFileKeys.length) {
      const hint = hasFolderAccessGrant()
        ? 'Tell me exactly which files or folders to remove (name or path). With Desktop or Full PC access on, I can delete what you point at — or attach a screenshot and describe what to remove.'
        : 'Turn on **Full PC access** or **Desktop access** in Settings → Security, then tell me exactly which files to remove.';
      const next = messagesRef.current.map(m => (
        m.id === assistantId ? { ...m, content: hint, provider_used: 'ARK' } : m
      ));
      messagesRef.current = next;
      persistModeThread(mode, next, { chatId: activeChatId });
      setMessages(next);
      clearGeneratingIfMineEarly();
      return;
    }

    // HARD GATE: sticky files → unified answer engine (never bare arkRoute).
    const stickyFiles = resolvedStudio.files;
    const stickyCount = Object.keys(stickyFiles).length;
    if (
      (mode === 'general' || mode === 'code')
      && stickyCount > 0
      && shouldInspectInChat(content, true, content.startsWith(COMPOSER_MODE_PREFIX.debug))
    ) {
      setMessages(prev => prev.map(m => (
        m.id === assistantId
          ? { ...m, content: `__generating__:chat:Reading ${stickyCount} file${stickyCount === 1 ? '' : 's'}…` }
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
      const allowEdits = chatTurnAllowsFileEdits(content, turnComposerMode);
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
          setMessages(prev => {
            const next = prev.map(m => (
              m.id === assistantId ? { ...m, content: text } : m
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
      let reply = locateNote ? `${locateNote}\n\n${result.text}` : result.text;

      if (
        workspaceProjectId
        && allowEdits
        && !looksLikePromptEcho(result.text)
      ) {
        const applied = await applyChatReplyEdits({
          reply: result.text,
          projectId: workspaceProjectId,
          projectName: projectLabel,
          files: stickyFiles,
        });
        if (applied.ok) {
          setChatStudioFiles(applied.files);
          chatStudioFilesRef.current = applied.files;
          resolvedStudio.files = applied.files;
          persistStudioSnapshot(activeChatId, {
            files: applied.files,
            projectId: workspaceProjectId,
            name: projectLabel,
          });
          reply = locateNote
            ? `${locateNote}\n\n${result.text}\n\n${applied.reply}`
            : `${result.text}\n\n${applied.reply}`;
        }
      }

      const elapsedMs = Date.now() - replyStartedAt;
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
      setInspectOfferId(assistantId);
      setStudioOfferKind('actions');
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
    const keepContinuity = mode === 'code' || Boolean(
      threadBrainRef.current?.pendingModelId || threadBrainRef.current?.freshBudget,
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
    const rotation = await prepareBrainRotation({
      scopeId: activeChatId,
      kind: brainKindForChatMode(mode),
      history: seedHistory,
      currentModelId: threadBrainRef.current?.modelId || pinnedModel.id,
      brain: pinnedModel.source === 'auto' ? threadBrainRef.current : null,
    });
    if (rotation.brain) {
      threadBrainRef.current = rotation.brain;
      setThreadBrain(rotation.brain);
    }
    setTokenRatio(rotation.pressure);
    if (rotation.swapped) setModelRatio(0);
    else setModelRatio(getModelHealthRatio(activeChatId));
    const rotatedHistory = willInspect
      ? seedHistory
      : rotation.swapped && histPrefs.rememberContext
        ? buildRouterHistory(priorForHistory, content, undefined, {
          keepContinuity: true,
          kind: mode === 'code' ? 'coding' : 'chat',
        })
        : rotation.history;
    const stickyBrain = pinnedModel.source === 'auto' ? rotation.brain : null;

    const clearGeneratingIfMine = () => {
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
        setModelRatio(recordModelTurn(threadChatId, {
          tokens: Math.ceil((finalText?.length || 0) / 4),
          activeMs: elapsedMs,
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
      if (!routeChat || routeChat === threadChatId) {
        messagesRef.current = next;
      }

      const activeCreationId = route.name === 'chat' ? route.creationId : undefined;
      persistModeThread(mode, next, {
        chatId: threadChatId,
        creationId: activeCreationId || libraryId,
        libraryId,
        assistantId,
      });

      // Safe if unmounted — React ignores; persistence above already landed.
      setMessages(prev => {
        if (routeChat && threadChatId && routeChat !== threadChatId) return prev;
        return next;
      });

      notifyChatDone(threadChatId);
    };

    // First-run guarantee: no live chat path → honest CTA reply (no fake ARK Core answer).
    if (
      !pluginId
      && (mode === 'general' || mode === 'code')
      && capacity
      && !capacity.liveChat
      && !window.arkDesktop?.engineGenerate
    ) {
      const honest = honestNoLiveChatReply();
      finalizeAssistant(honest, 'ARK · setup needed');
      clearGeneratingIfMine();
      window.setTimeout(() => {
        if (mySeq === genSeqRef.current) flushQueuedSend();
      }, 0);
      return;
    }

    void (async () => {
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
        idleTimer = window.setTimeout(() => {
          if (mySeq !== genSeqRef.current || abandoned || stopRequestedRef.current) return;
          const cleaned = usableAssistantText(streamedPartial, content, previousAssistant);
          if (cleaned.trim().length < 8 && streamedPartial.trim().length < 12) return;
          if (looksLikePromptEcho(cleaned || streamedPartial)) return;
          const draft = (cleaned || streamedPartial).trim();
          const incomplete = /[:;,—–-]\s*$/.test(draft)
            || /\n\s*(?:\d+\.|[-*])\s+[^\n]{0,80}:\s*$/.test(draft)
            || /\b(and|or|the|to|of|for|with|a|an)\s*$/i.test(draft);
          if (incomplete && draft.length < 1200) return;
          abandoned = true;
          clearGeneratingIfMine();
          const echoFallback = looksLikePromptEcho(streamedPartial) ? '' : streamedPartial.trim();
          earlyResolve?.({ reply: cleaned || echoFallback || 'Model echoed its system prompt. Try switching models and send again.' });
        }, 22_000);
      };

      try {
      // Prefer sticky map from resolveStudioFiles — never trust an empty ref after attach.
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
            'Then say “what repos do I have?” or **open owner/repo in Code**. Empty repos are fine — we start from a blank page.',
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
                    ? 'It looks empty — say what to add and I will start building.'
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

      // Do not steal project follow-ups into Image when a folder is sticky.
      if (!usedPlugin && !hasStudioFiles && (mode === 'general' || mode === 'code') && looksLikeImageAsk(content) && composerMode !== 'ask') {
        imageOfferPromptRef.current = content;
        response = [
          'That sounds like an image request.',
          '',
          'Switch to **Image** to generate it — your prompt carries over and the result saves to Creations.',
        ].join('\n');
        setImageOfferId(assistantId);
        usedPlugin = true;
      }

      if (!usedPlugin && (mode === 'general' || mode === 'code') && shouldInspectInChat(content, hasStudioFiles, content.startsWith(COMPOSER_MODE_PREFIX.debug))) {
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
                if (read?.ok && read.files && Object.keys(read.files).length) {
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
            response = `I see the **${projectLabel}** attach, but no file contents loaded. Re-attach the folder with +, then ask again.`;
            usedPlugin = true;
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
            const allowEdits = chatTurnAllowsFileEdits(content, turnComposerMode);
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
                setMessages(prev => {
                  const next = prev.map(m => (
                    m.id === assistantId ? { ...m, content: text } : m
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
            response = engineResult.text;
            const inspectProjectId = chatStudioProjectIdRef.current || attachMeta?.projectId || null;
            if (
              inspectProjectId
              && allowEdits
              && !looksLikePromptEcho(engineResult.text)
            ) {
              const applied = await applyChatReplyEdits({
                reply: engineResult.text,
                projectId: inspectProjectId,
                projectName: projectLabel,
                files: filesForInspect,
              });
              if (applied.ok) {
                setChatStudioFiles(applied.files);
                chatStudioFilesRef.current = applied.files;
                persistStudioSnapshot(activeChatId, {
                  files: applied.files,
                  projectId: inspectProjectId,
                  name: projectLabel,
                });
                response = `${engineResult.text}\n\n${applied.reply}`;
              }
            }
            lastInspectReplyRef.current = response;
            resolvedProvider = engineResult.meta || `${providerLabel} · files`;
            usedPlugin = true;
            setInspectOfferId(assistantId);
            setStudioOfferKind('actions');
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
      } else if (!usedPlugin && mode === 'image') {
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

          if (imageBriefRef.current?.chatId === activeChatId) {
            promptForGen = mergeImageBrief(imageBriefRef.current.original, imageText);
            imageBriefRef.current = null;
          } else if (!referenceDataUrl && needsImageBrief(imageText)) {
            imageBriefRef.current = { chatId: activeChatId!, original: imageText };
            response = buildImageBriefMessage(imageText);
            setAssistantContent(response);
            usedPlugin = true;
          } else {
          const rewritten = rewriteImagePrompt(promptForGen);
          const sticky = stickyBrain;
          let routed: Awaited<ReturnType<typeof arkRoute>> | undefined;
          await runMediaGenStages('image', label => {
            setAssistantContent(`__generating__:image:${label}`);
          }, async () => {
            const IMAGE_TIMEOUT_MS = 120_000;
            routed = await Promise.race([
              arkRoute({
                message: rewritten,
                kind: 'image',
                preferredModelId: pinnedModel.id,
                preferredModelName: pinnedModel.name,
                preferredSource: pinnedModel.source,
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
            resolvedProvider = routerProviderLabel(routed, providerLabel);
            const hopNote = failoverChipText(routed, pinnedModel);
            if (hopNote) setFailoverNote(hopNote);
            if (pinnedModel.source === 'auto' && routed.source !== 'none') {
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
                modelName: routed.modelName || pinnedModel.name,
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
                mode,
                title: titleFromPrompt(content),
                updatedAt: new Date().toISOString(),
                creationId: libraryId,
                preview: previewFromText(content),
              });
            } else {
              const failText = String(routed.reply || '').replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim();
              response = failText || [
                'Couldn\'t generate image — try again.',
                '',
                'Try again in a minute, or connect a Hugging Face key in Models → Cloud.',
              ].join('\n');
            }
            usedPlugin = true;
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
                'Couldn\'t generate video — try again.',
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
          const history = prefs.rememberContext
            ? (rotatedHistory.length ? rotatedHistory : buildRouterHistory(priorForHistory, content, vision, {
              keepContinuity: true,
              kind: mode === 'code' ? 'coding' : 'chat',
            }))
            : buildRouterHistory([], content, vision);
          const sticky = stickyBrain;
          const timeoutMs = 250_000;
          const firstTokenMs = 35_000;
          let sawToken = false;
          const routePromise = arkRoute({
            message: content,
            kind: mode === 'code' ? 'coding' : 'chat',
            preferredModelId: pinnedModel.id,
            preferredModelName: pinnedModel.name,
            preferredSource: pinnedModel.source,
            stickyModelId: sticky?.modelId,
            stickyModelName: sticky?.modelName,
            stickyPinnedSource: sticky?.pinnedSource,
            history,
            onChunk: prefs.streamResponses
              ? (piece) => {
              if (abandoned || stopRequestedRef.current || mySeq !== genSeqRef.current) return;
              sawToken = true;
              streamedPartial += piece;
              const live = usableAssistantText(streamedPartial, content, previousAssistant)
                || streamedPartial.trim();
              setMessages(prev => {
                const next = prev.map(m => {
                  if (m.id !== assistantId) return m;
                  const liveClean = live && !looksLikePromptEcho(live) ? live : '';
                  return { ...m, content: liveClean || `__generating__:chat:${statusLabel}` };
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
                if (!sawToken && !streamedPartial.trim()) {
                  reject(new Error('No response yet. Try again or pick another model.'));
                }
              }, firstTokenMs);
            }));
          }
          const routed = await Promise.race(races);
          if (idleTimer) window.clearTimeout(idleTimer);
          // Release Stop as soon as we have a usable reply — don't wait on trailing work.
          clearGeneratingIfMine();
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
              'Your prompt works — Code workspace is the best path for a full calculator app with Explorer + Preview.',
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
          clearGeneratingIfMine();
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
        clearGeneratingIfMine();
      }

      if (mySeq !== genSeqRef.current) return;

      if (!isMediaMode && !pluginId && !skipReplySanitize) {
        const cleaned = usableAssistantText(response, content, previousAssistant);
        const candidate = String(cleaned || response || '').trim();
        response = looksLikePromptEcho(candidate) ? '' : (cleaned || candidate);
      }
      if (stopRequestedRef.current && !response.trim()) {
        response = '(stopped)';
      }
      if (!String(response || '').trim()) {
        response = isMediaMode
          ? 'Generation did not finish. Try sending again.'
          : '(no response)';
      }

      finalizeAssistant(response, resolvedProvider, lastLibraryId);

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
  // Explore / idea grid only for brand-new chats — never when a Recent thread is open.
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
                <span className="w-7 h-7 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
                  <Zap className="w-3.5 h-3.5" />
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
                    setLocalPrefs({ lastChatModelId: model.id });
                  } else if (model.source !== 'auto') {
                    unpickAutoSticky();
                  }
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
                    setLocalPrefs({ lastChatModelId: model.id });
                  } else if (model.source !== 'auto') {
                    unpickAutoSticky();
                  }
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
          <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface-hover/60 px-2.5 py-0.5 text-[11px] text-content-secondary">
            {COMPOSER_MODE_LABEL[composerMode]}
            <button
              type="button"
              onClick={() => setComposerMode(null)}
              className="text-content-tertiary hover:text-content-primary"
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
                  ? '1 message queued — sends as soon as this reply finishes'
                  : `${queueLen} messages queued — send next when this reply finishes`}
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
      {(mode === 'general' || mode === 'code') && (
        <div className="mt-2 flex flex-wrap items-center justify-start gap-x-3 gap-y-1 px-1 text-[10px] text-content-tertiary">
          {chatStudioDiskRoot ? (
            <span
              className="inline-flex items-center gap-1 max-w-[min(100%,16rem)] truncate text-violet-300/85"
              title={chatStudioDiskRoot}
            >
              <FolderKanban className="w-3 h-3 shrink-0" />
              {workspaceBadgeLabel || chatStudioDiskRoot.split(/[/\\]/).pop()}
            </span>
          ) : null}
          <span>Access: {formatAccessBadge()}</span>
          <span>Exec: {executionModeLabel(getAgentExecutionMode())}</span>
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
      {/* Always mounted — toggling mount caused flicker; only opacity changes. */}
      <div
        className={`absolute inset-0 z-50 flex items-center justify-center bg-black/50 pointer-events-none transition-opacity duration-150 ${
          dragOverChat ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden={!dragOverChat}
      >
        <div className="rounded-2xl border border-sky-400/40 bg-ark-navy-900/95 px-6 py-4 text-center shadow-xl">
          <p className="text-sm font-medium text-content-primary">Drop folder or files</p>
          <p className="text-[11px] text-content-tertiary mt-1">Add as many as you need — press Enter to read</p>
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
                ? 'No live model yet. Connect a free key or install a local brain, then send a message.'
                : null}
            </p>
            {capacity && !capacity.liveChat && (
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
                  Pick clip length (10 / 20 / 30s) above the composer before you send. ARK renders quality frames — expect ~15–30s.
                </p>
                {ideaGrid(VIDEO_IDEAS)}
              </>
            )}
            {mode === 'code' && (!capacity || !capacity.liveChat) && ideaGrid(CODE_IDEAS)}
          </div>
        )
      ) : (
        <>
          <div className="flex-1 overflow-auto px-4 sm:px-8 py-6">
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
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-surface-hover border border-surface-border mt-0.5">
                      <Bot className="w-4 h-4 text-content-secondary" />
                    </div>
                  )}
                  <div
                    className={`text-sm text-content-primary ${
                      msg.role === 'user'
                        ? 'max-w-[min(42rem,78%)] min-w-0 rounded-2xl px-4 py-3 bg-surface-hover'
                        : isMediaOnlyContent(msg.content)
                          || (msg.content.startsWith('__generating__:') && !isTraceMessage(msg.content))
                          || (
                            generating
                            && msg.id === messages[messages.length - 1]?.id
                            && (mode === 'image' || mode === 'video')
                          )
                          ? 'shrink-0'
                          : isCatalogMessage(String(msg.content || '')) || isPcExploreMessage(String(msg.content || ''))
                            ? 'max-w-[min(44rem,92%)] min-w-0 rounded-2xl px-4 py-3.5 bg-ark-navy-900/95 border border-surface-border/80 shadow-sm'
                            : 'max-w-[min(42rem,78%)] min-w-0 rounded-2xl px-4 py-3 bg-ark-navy-900 border border-surface-border'
                    }`}
                  >
                    {(() => {
                      const isAssistant = msg.role === 'assistant';
                      const isLast = msg.id === messages[messages.length - 1]?.id;
                      const raw = String(msg.content || '');
                      const isCatalog = isAssistant && isCatalogMessage(raw);
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
                        />
                      );
                    })()}
                    {msg.role === 'assistant'
                      && typeof msg.elapsed_ms === 'number'
                      && msg.elapsed_ms >= 0
                      && !msg.content.startsWith('__generating__:')
                      && !isTraceMessage(msg.content)
                      && !isLikelyErrorMessage(msg.content) ? (
                        <p className="text-[11px] text-content-tertiary mt-2 tabular-nums">
                          Responded in {formatReplyElapsed(msg.elapsed_ms)}
                          {msg.provider_used ? ` · ${msg.provider_used}` : ''}
                        </p>
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
                    {msg.role === 'assistant' && inspectOfferId === msg.id && studioOfferKind === 'actions' && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        <button
                          type="button"
                          className="text-[10px] rounded-full bg-emerald-600 text-white px-2.5 py-1"
                          onClick={() => {
                            void sendMessageRef.current('Go implement — build this in the attached workspace.');
                          }}
                        >
                          Go implement
                        </button>
                        <button
                          type="button"
                          className="text-[10px] rounded-full bg-sky-600 text-white px-2.5 py-1"
                          onClick={() => {
                            void sendMessageRef.current('Go into more detail about this project — what the main files do and how they connect.');
                          }}
                        >
                          More details
                        </button>
                        <button
                          type="button"
                          className="text-[10px] rounded-full border border-surface-border px-2.5 py-1 text-content-secondary"
                          onClick={() => {
                            void sendMessageRef.current(`${COMPOSER_MODE_PREFIX.debug}Propose a concrete fix for each bug, risky path, and broken path in these files.`);
                          }}
                        >
                          Debug this
                        </button>
                        <button
                          type="button"
                          className="text-[10px] rounded-full border border-surface-border px-2.5 py-1 text-content-secondary"
                          onClick={() => {
                            void sendMessageRef.current('List the most likely problems in these files (no full file dump).');
                          }}
                        >
                          Find problems
                        </button>
                        <button
                          type="button"
                          className="text-[10px] rounded-full border border-surface-border px-2.5 py-1 text-content-secondary"
                          onClick={() => {
                            void sendMessageRef.current(`${COMPOSER_MODE_PREFIX.agent}Install npm dependencies in this workspace.`);
                          }}
                        >
                          Install deps
                        </button>
                        <button
                          type="button"
                          className="text-[10px] rounded-full border border-surface-border px-2.5 py-1 text-content-tertiary"
                          onClick={() => {
                            setInspectOfferId(null);
                            setStudioOfferKind(null);
                          }}
                          title="Keep talking in Chat — chips hide, conversation stays"
                        >
                          Keep in Chat
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
      <FreeKeyWizard
        open={freeKeyOpen}
        onClose={() => {
          setFreeKeyOpen(false);
          void probeLiveCapacity().then(setCapacity).catch(() => undefined);
        }}
        preferIds={capacity?.suggestedFreeKeys.map(k => k.id)}
      />
    </div>
  );
}
