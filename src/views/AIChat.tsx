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
  resolveCreationDataUrl,
  slimChatContent,
  titleFromPrompt,
} from '@/lib/recentStore';
import { looksLikeCodeAsk } from '@/lib/chatIntent';
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
  buildInspectPrompt,
  pickFilesForInspect,
  scanProjectFindings,
} from '@/lib/projectInspect';
import { saveProjectThread, persistProjectThreadToDisk } from '@/lib/projectThread';
import { GitHubRepoPicker } from '@/components/GitHubRepoPicker';
import { gitClone, githubCloneUrl, parseGithubRepoRef } from '@/lib/arkGitClient';
import { verifyGitHubToken, type GitHubRepo } from '@/lib/github';
import {
  MEDIA_GEN_STAGES,
  rewriteImagePrompt,
  rewriteVideoPrompt,
  runMediaGenStages,
} from '@/lib/mediaPrompt';
import { arkRoute, routerProviderLabel, type ArkRouterResult } from '@/lib/arkRouter';
import { FreeKeyWizard } from '@/components/FreeKeyWizard';
import { ComposerPlusMenu, type ComposerPlusAction } from '@/components/ComposerPlusMenu';
import { TokenUsageRing } from '@/components/TokenUsageRing';
import { ArkErrorInline } from '@/components/ArkErrorInline';
import { classifyErrorMessage, isLikelyErrorMessage } from '@/lib/errors';
import { notifyChatDone } from '@/lib/activityIndicators';
import { formatReplyElapsed } from '@/lib/speedTest';
import { getTokenUsageRatio, recordTokenUsage } from '@/lib/tokenUsage';
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
  Upload, Cpu, Cloud, ChevronDown, Check, Blocks, FolderKanban, Zap, Square, X,
  Puzzle, Briefcase, Github,
} from 'lucide-react';
import { engineGenerateCancel, getEngineStatus, setEngineModel } from '@/lib/arkEngine';

const CODE_FILE_RE =
  /\.(tsx?|jsx?|mjs|cjs|py|go|rs|java|kt|swift|cs|cpp|cxx|cc|c|h|hpp|rb|php|vue|svelte|css|scss|less|html|json|toml|ya?ml|md|sql|sh|bash|zsh|ps1|dockerfile|makefile)$/i;

const COMPOSER_MODE_PREFIX: Record<'plan' | 'ask' | 'debug' | 'multitask', string> = {
  plan: 'Plan this out step by step, then we can build:\n\n',
  ask: '',
  debug: 'Debug this — find the issue and propose a fix:\n\n',
  multitask: 'Break this into parallel tasks and tackle them clearly:\n\n',
};

const COMPOSER_MODE_LABEL: Record<'plan' | 'ask' | 'debug' | 'multitask', string> = {
  plan: 'Plan',
  ask: 'Ask',
  debug: 'Debug',
  multitask: 'Tasks',
};

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
      {tabs.map(t => (
        <button
          key={t.id}
          type="button"
          onClick={() => go(t.id)}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
            current === t.id
              ? 'bg-surface-hover text-content-primary'
              : 'text-content-tertiary hover:text-content-primary'
          }`}
        >
          {t.label}
        </button>
      ))}
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
    'Describe the image you want to create...',
    'Ask ARK to generate an image...',
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
  const { addCreation, addChat, addRecent, touchRecentProject, creations, chats } = useRecentProjects();

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
  const [codeSwitchDismissed, setCodeSwitchDismissed] = useState(false);
  const [pendingImages, setPendingImages] = useState<{ id: string; name: string; dataUrl: string }[]>([]);
  const [chatStudioFiles, setChatStudioFiles] = useState<Record<string, string>>({});
  const [chatStudioProjectId, setChatStudioProjectId] = useState<string | null>(null);
  const [githubPickerOpen, setGithubPickerOpen] = useState(false);
  const [inspectOfferId, setInspectOfferId] = useState<string | null>(null);
  const [githubOfferId, setGithubOfferId] = useState<string | null>(null);
  const [composerTall, setComposerTall] = useState(false);
  const [composerMode, setComposerMode] = useState<'plan' | 'ask' | 'debug' | 'multitask' | null>(null);
  const [videoDurationSec, setVideoDurationSec] = useState<10 | 20 | 30>(10);
  const [tokenRatio, setTokenRatio] = useState(0);
  const stopRequestedRef = useRef(false);
  const generatingRef = useRef(false);
  /** Which chat id currently owns the in-flight generation (queue only for that chat). */
  const activeGenChatIdRef = useRef<string | null>(null);
  const pendingQueueRef = useRef<string[]>([]);
  const persistChatIdRef = useRef<string | null>(null);
  /** Always-current route chat id — avoid stale closures when flushing the queue. */
  const routeChatIdRef = useRef<string | undefined>(undefined);
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
  const attachInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const chatStudioFilesRef = useRef<Record<string, string>>({});
  const chatStudioProjectIdRef = useRef<string | null>(null);
  const lastInspectReplyRef = useRef('');
  chatStudioFilesRef.current = chatStudioFiles;
  chatStudioProjectIdRef.current = chatStudioProjectId;

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
  }, [route]);

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
    const tab = creation.kind === 'video' ? 'video' : 'image';
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
            setActiveModel(defaultModelForKind(tab === 'video' ? 'video' : 'image'));
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
      setActiveModel(defaultModelForKind(tab === 'video' ? 'video' : 'image'));
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
      // We just created this chat and already have messages in state — don't wipe them.
      if (skipChatLoadIdsRef.current.has(route.chatId) || inFlight) {
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
      // Stop button / queue only apply to the chat that is actively generating.
      setGenerating(Boolean(generatingRef.current && activeGenChatIdRef.current === route.chatId));
      setLoading(false);
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

  const openCodeWorkspace = (seedPrompt?: string, seedFiles?: Record<string, string>) => {
    const seed = (seedPrompt ?? input).trim();
    const files = { ...chatStudioFilesRef.current, ...(seedFiles || {}) };
    const name = seed
      ? titleFromPrompt(seed).replace(/^(let'?s|lets|please)\s+/i, '').slice(0, 48) || 'Code project'
      : 'Code project';
    const existingId = chatStudioProjectIdRef.current;
    const project = existingId
      ? { id: existingId, name }
      : addRecent(name);
    if (existingId) touchRecentProject(existingId, name);
    try {
      if (seed) localStorage.setItem(`ark:project-draft:${project.id}`, seed);
      if (!existingId && Object.keys(files).length) {
        localStorage.setItem(`ark:project-seed-files:${project.id}`, JSON.stringify(files));
      }
    } catch {
      /* ignore */
    }
    try {
      if (Object.keys(files).length) {
        const threadMsgs = messagesRef.current.map(m => ({
          ...m,
          project_id: project.id,
        }));
        saveProjectThread(project.id, threadMsgs);
        void persistProjectThreadToDisk(project.id, name, threadMsgs, files);
      } else {
        saveProjectThread(project.id, []);
      }
      try {
        localStorage.setItem(`ark:project-source-chat:${project.id}`, routeChatIdRef.current || persistChatIdRef.current || '');
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
    setInput('');
    setComposerTall(false);
    setChatStudioFiles({});
    setChatStudioProjectId(null);
    setInspectOfferId(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    navigate({ name: 'project', id: project.id });
  };

  const clonePickedRepo = async (repo: GitHubRepo) => {
    setGithubPickerOpen(false);
    setGithubOfferId(null);
    const token = getPluginRuntime('github', loadPluginState()).token?.trim();
    const project = addRecent(repo.name);
    const [owner, name] = repo.full_name.split('/');
    const cloned = await gitClone(project.id, githubCloneUrl(owner, name), token);
    const seed = (repo.size ?? 1) === 0
      ? 'This GitHub repo is empty. Start with a blank page, then add what I describe.'
      : `Continue in ${repo.full_name}. Inspect the files, then add, remove, or upgrade as I ask.`;
    try {
      localStorage.setItem(`ark:project-draft:${project.id}`, seed);
      saveProjectThread(project.id, messagesRef.current.map(m => ({
        ...m,
        project_id: project.id,
      })));
    } catch {
      /* ignore */
    }
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
    navigate({ name: 'project', id: project.id });
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
    setPendingImages(prev => [...prev, ...next].slice(0, 4));
  };

  const onPickCodeFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = [...list];
    void addPendingImages(files);
    const codeFiles = files.filter(f => CODE_FILE_RE.test(f.name) || /javascript|typescript|json|text\/plain|xml/.test(f.type));
    if (!codeFiles.length) return;
    const seedFiles: Record<string, string> = { ...chatStudioFilesRef.current };
    for (const f of codeFiles.slice(0, 40)) {
      try {
        const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
        seedFiles[rel.replace(/\\/g, '/')] = await f.text();
      } catch {
        /* skip unreadable */
      }
    }
    setChatStudioFiles(seedFiles);
  };

  const openFolderInChat = async () => {
    if (!window.arkDesktop?.projectImportFolder) {
      attachInputRef.current?.click();
      return;
    }
    const pid = `proj-${crypto.randomUUID().slice(0, 8)}`;
    const res = await window.arkDesktop.projectImportFolder({
      projectId: pid,
      projectName: 'Inspect',
    });
    if (!res?.ok || res.canceled) return;
    const files = res.files || {};
    setChatStudioFiles(files);
    setChatStudioProjectId(pid);
    touchRecentProject(pid, res.name || 'Inspect');
    if (res.root && window.arkDesktop.projectRead) {
      /* files already on disk for later Code handoff */
    }
  };

  useEffect(() => {
    const scope = route.name === 'chat' ? (route.chatId || 'new-chat') : 'new-chat';
    setTokenRatio(getTokenUsageRatio(scope));
  }, [route]);

  const handlePlusAction = (action: ComposerPlusAction) => {
    if (action === 'image') {
      imageInputRef.current?.click();
      return;
    }
    if (action === 'file') {
      attachInputRef.current?.click();
      return;
    }
    if (action === 'folder') {
      void openFolderInChat();
      return;
    }
    setComposerMode(action);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleSend = () => {
    let content = input.trim();
    const images = pendingImages;
    if ((!content && !images.length) || !user) return;
    if (composerMode && COMPOSER_MODE_PREFIX[composerMode]) {
      content = `${COMPOSER_MODE_PREFIX[composerMode]}${content}`;
    }
    if (!content && images.length) content = 'What is in this image?';
    if (images.length) {
      content = [
        content,
        ...images.map(img => `![${img.name.replace(/[\[\]]/g, '')}](ark-media:${img.id})`),
      ].join('\n\n');
    }
    setPendingImages([]);
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
    if (!content.trim() || !user || generatingRef.current) return;
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
    setTokenRatio(recordTokenUsage(activeChatId, content));
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
    const assistantMsg: ChatMessage = {
      id: assistantId,
      user_id: user.id,
      project_id: null,
      role: 'assistant',
      content: isMediaMode
        ? `__generating__:${mode}:${MEDIA_GEN_STAGES[mode][0].label}`
        : '__generating__:chat:Thinking…',
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
          JSON.stringify({ chatId: activeChatId, mode }),
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
    const keepContinuity = mode === 'code' || Boolean(
      threadBrainRef.current?.pendingModelId || threadBrainRef.current?.freshBudget,
    );
    const seedHistory = histPrefs.rememberContext
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
    const rotatedHistory = rotation.swapped && histPrefs.rememberContext
      ? buildRouterHistory(priorForHistory, content, undefined, {
        keepContinuity: true,
        kind: mode === 'code' ? 'coding' : 'chat',
      })
      : rotation.history;
    const stickyBrain = pinnedModel.source === 'auto' ? rotation.brain : null;
    const replyStartedAt = Date.now();

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
      const studioFiles = chatStudioFilesRef.current;
      const hasStudioFiles = Object.keys(studioFiles).length > 0;

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

      if (!usedPlugin && (mode === 'general' || mode === 'code') && shouldInspectInChat(content, hasStudioFiles, content.startsWith(COMPOSER_MODE_PREFIX.debug))) {
        const findings = scanProjectFindings(studioFiles, content);
        const picked = pickFilesForInspect(studioFiles, content);
        const inspectMessage = buildInspectPrompt(
          content,
          studioFiles,
          picked,
          findings,
          'Chat inspect',
        );
          const vision = extractVisionImages(content);
          const prefs = getLocalPrefs();
          const history = prefs.rememberContext
            ? (rotatedHistory.length ? rotatedHistory : buildRouterHistory(priorForHistory, inspectMessage, vision, {
              keepContinuity: true,
              kind: mode === 'code' ? 'coding' : 'chat',
            }))
            : buildRouterHistory([], inspectMessage, vision);
        const sticky = stickyBrain;
        const routed = await arkRoute({
          message: inspectMessage,
          kind: mode === 'code' ? 'coding' : 'chat',
          preferredModelId: pinnedModel.id,
          preferredModelName: pinnedModel.name,
          preferredSource: pinnedModel.source,
          stickyModelId: sticky?.modelId,
          stickyModelName: sticky?.modelName,
          stickyPinnedSource: sticky?.pinnedSource,
          history,
        });
        response = formatChatInspectReply(
          routed.reply,
          findings,
          Object.keys(studioFiles),
        );
        lastInspectReplyRef.current = response;
        resolvedProvider = routerProviderLabel(routed, providerLabel);
        usedPlugin = true;
        setInspectOfferId(assistantId);
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

          const rewritten = rewriteImagePrompt(content);
          const sticky = stickyBrain;
          let routed: Awaited<ReturnType<typeof arkRoute>> | undefined;
          await runMediaGenStages('image', label => {
            setAssistantContent(`__generating__:image:${label}`);
          }, async () => {
            routed = await arkRoute({
              message: rewritten,
              kind: 'image',
              preferredModelId: pinnedModel.id,
              preferredModelName: pinnedModel.name,
              preferredSource: pinnedModel.source,
              stickyModelId: sticky?.modelId,
              stickyModelName: sticky?.modelName,
              stickyPinnedSource: sticky?.pinnedSource,
            });
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
                'Could not generate a real image right now.',
                '',
                'Try again in a minute, or connect a Hugging Face key in Models → Cloud.',
              ].join('\n');
            }
            usedPlugin = true;
          }
        } catch (err) {
          response = classifyErrorMessage(err instanceof Error ? err.message : 'Image generation failed').message;
          usedPlugin = true;
        }
      } else if (!usedPlugin && mode === 'video') {
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
            routed = await arkRoute({
              message: rewritten,
              kind: 'video',
              preferredModelId: pinnedModel.id,
              preferredModelName: pinnedModel.name,
              preferredSource: pinnedModel.source,
              stickyModelId: sticky?.modelId,
              stickyModelName: sticky?.modelName,
              stickyPinnedSource: sticky?.pinnedSource,
              mediaDurationSec: videoDurationSec,
            });
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
            if (routed.media?.dataUrl) {
              const isMp4 = routed.media.dataUrl.startsWith('data:video/');
              const isMotionStill = (routed.source || '').includes('motion-still');
              const isReal = Boolean(routed.media.real) && isMp4 && !isMotionStill;
              rememberThumb(libraryId, routed.media.dataUrl);
              if (isMp4) {
                addCreation({
                  id: libraryId,
                  kind: 'video',
                  title: content.slice(0, 80),
                  prompt: content,
                  modelName: routed.modelName || pinnedModel.name,
                  dataUrl: routed.media.dataUrl,
                  createdAt: new Date().toISOString(),
                  real: isReal,
                  source: routed.source,
                });
              }
              if (routed.reply && (routed.reply.includes('![') || isMotionStill || !isReal)) {
                response = routed.reply.includes('![')
                  ? routed.reply
                  : `${routed.reply}\n\n${mediaMessageMarkdown(content, libraryId, routed.media.dataUrl, {
                      real: isReal,
                      kind: 'video',
                      source: routed.source,
                    })}`;
              } else {
                response = mediaMessageMarkdown(content, libraryId, routed.media.dataUrl, {
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
              response = routed.reply || 'Video generation failed. Try again in a moment.';
            }
            usedPlugin = true;
          }
        } catch (err) {
          response = classifyErrorMessage(err instanceof Error ? err.message : 'Video generation failed').message;
          usedPlugin = true;
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
              streamedPartial += piece;
              const live = usableAssistantText(streamedPartial, content, previousAssistant)
                || streamedPartial.trim();
              setMessages(prev => {
                const next = prev.map(m => {
                  if (m.id !== assistantId) return m;
                  const liveClean = live && !looksLikePromptEcho(live) ? live : '';
                  return { ...m, content: liveClean || '__generating__:chat:Thinking…' };
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
          const timeoutMs = 250_000;
          const routed = await Promise.race([
            routePromise.then(r => ({ reply: r.reply, full: r as Awaited<typeof routePromise> })),
            earlyDone.then(r => ({ reply: r.reply, full: null })),
            new Promise<never>((_, reject) => {
              window.setTimeout(() => reject(new Error('Response timed out. Try again or pick another model.')), timeoutMs);
            }),
          ]);
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

      if (!isMediaMode && !pluginId) {
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
    if (!el.value) {
      el.style.height = '20px';
      el.style.overflowY = 'hidden';
      setComposerTall(false);
      return;
    }
    el.style.height = '20px';
    const raw = el.scrollHeight;
    const max = Math.round(window.innerHeight * 0.55);
    el.style.height = `${Math.min(raw, max)}px`;
    el.style.overflowY = raw > max ? 'auto' : 'hidden';
    setComposerTall(raw > 28);
  };

  const onInput = (value: string) => {
    setInput(value);
    if (codeSwitchDismissed && !looksLikeCodeAsk(value)) setCodeSwitchDismissed(false);
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
          {pendingImages.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
              {pendingImages.map(img => (
                <span
                  key={img.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-ark-navy-900/80 pl-1 pr-1.5 py-0.5 text-[10px] text-content-secondary"
                >
                  <img src={img.dataUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
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
          {Object.keys(chatStudioFiles).length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
              {Object.keys(chatStudioFiles).slice(0, 8).map(name => (
                <span
                  key={name}
                  className="inline-flex items-center max-w-[10rem] truncate rounded-full border border-surface-border bg-ark-navy-900/80 px-2 py-0.5 text-[10px] text-content-secondary"
                  title={name}
                >
                  {name.split('/').pop()}
                </span>
              ))}
              {Object.keys(chatStudioFiles).length > 8 ? (
                <span className="text-[10px] text-content-tertiary">
                  +{Object.keys(chatStudioFiles).length - 8}
                </span>
              ) : null}
              <button
                type="button"
                className="text-[10px] text-violet-300/90 hover:text-violet-200"
                onClick={() => openCodeWorkspace(
                  input.trim() || lastInspectReplyRef.current || 'Continue from chat',
                )}
              >
                Continue in Code
              </button>
              <button
                type="button"
                className="text-[10px] text-amber-200/90 hover:text-amber-100"
                onClick={() => {
                  const text = input.trim() || 'Look at these files and tell me what you see.';
                  setInput('');
                  void sendMessageRef.current(`${COMPOSER_MODE_PREFIX.debug}${text}`);
                }}
              >
                Debug
              </button>
              <button
                type="button"
                className="text-[10px] text-content-tertiary hover:text-content-secondary"
                onClick={() => {
                  setChatStudioFiles({});
                  setChatStudioProjectId(null);
                }}
              >
                Clear
              </button>
            </div>
          )}
          {(mode === 'general' || mode === 'code') && looksLikeCodeAsk(input) && composerMode !== 'ask' && !codeSwitchDismissed && (
            <div className="mb-1 flex justify-center px-1">
              <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/25 bg-violet-500/10 pl-2 pr-0.5 py-0.5 text-[10px] text-violet-100/90 shadow-sm max-w-full">
                <Code2 className="w-3 h-3 shrink-0 text-violet-300/90" />
                <span className="truncate max-w-[11rem] sm:max-w-[14rem]">
                  {Object.keys(chatStudioFiles).length
                    ? 'Fix or build in Code?'
                    : looksLikeBuildStart(input)
                      ? 'Start building in Code?'
                      : 'Build? Switch to Code'}
                </span>
                <button
                  type="button"
                  className="rounded-full px-1.5 py-0.5 text-violet-100/60 hover:bg-violet-500/15 transition-colors"
                  onClick={() => setCodeSwitchDismissed(true)}
                  title="Stay in chat"
                >
                  Stay
                </button>
                <button
                  type="button"
                  className="rounded-full px-1.5 py-0.5 text-violet-50 hover:bg-violet-500/20 transition-colors font-medium"
                  onClick={() => openCodeWorkspace()}
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
                ? 'flex flex-col rounded-2xl overflow-hidden'
                : 'flex items-center gap-1 rounded-full h-11 pl-1 pr-1.5'
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

          {!composerTall && (
            <ComposerPlusMenu
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
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              Object.keys(chatStudioFiles).length
                ? 'Ask me to debug these files, or say what to add…'
                : placeholder
            }
            rows={1}
            title="Enter to send · Shift+Enter for a new line"
            aria-label="Message. Enter to send, Shift+Enter for a new line"
            className={`bg-transparent border-none resize-none overflow-hidden text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none leading-5 ${
              composerTall
                ? 'w-full px-3.5 pt-3.5 pb-2'
                : 'flex-1 min-w-0 px-1 py-0'
            }`}
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

          <div className={`flex items-center gap-1.5 shrink-0 ${composerTall ? 'pb-2' : ''}`}>
        <TokenUsageRing
          ratio={tokenRatio}
          size={16}
          className="text-content-primary shrink-0"
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

        {(mode === 'general' || mode === 'code') && looksLikeCodeAsk(input) && composerMode !== 'ask' && !codeSwitchDismissed && (
          <button
            type="button"
            onClick={() => openCodeWorkspace()}
            title="Open Code workspace (explorer, editor, chat)"
            aria-label="Open Code workspace"
            className="w-8 h-8 rounded-full border border-violet-400/35 bg-violet-500/15 text-violet-200 flex items-center justify-center shrink-0 hover:bg-violet-500/25 transition-colors"
          >
            <Code2 className="w-3.5 h-3.5" />
          </button>
        )}
        </div>
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
            {looksLikeCodeAsk(input) && composerMode !== 'ask' && !codeSwitchDismissed && (
              <button
                type="button"
                onClick={() => openCodeWorkspace()}
                className="inline-flex items-center gap-1 text-[11px] text-violet-300/90 hover:text-violet-200 transition-colors"
                title="Switch to Code workspace"
              >
                <Code2 className="w-3 h-3" />
                Code
              </button>
            )}

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
                <span className={`w-3.5 h-3.5 rounded bg-gradient-to-br ${plugin.tone} flex items-center justify-center text-[7px] font-bold text-white`}>
                  {plugin.initial}
                </span>
                {plugin.name}
              </button>
            ))}
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
              onClick={() => imageInputRef.current?.click()}
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
    <div className="h-full min-w-0 flex flex-col overflow-hidden">
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
                : 'Say hello to start. ARK uses your local brain and free keys, and switches if one runs out.'}
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
                    className={`min-w-0 text-sm text-content-primary ${
                      msg.role === 'user'
                        ? 'max-w-[min(42rem,78%)] rounded-2xl px-4 py-3 bg-surface-hover'
                        : isMediaOnlyContent(msg.content) || msg.content.startsWith('__generating__:image:') || msg.content.startsWith('__generating__:video:')
                          ? 'w-[min(100%,26rem)] px-0 py-0 bg-transparent'
                          : 'max-w-[min(42rem,78%)] rounded-2xl px-4 py-3 bg-ark-navy-900 border border-surface-border'
                    }`}
                  >
                    {msg.role === 'assistant' && (
                      !msg.content.trim()
                      || msg.content.startsWith('__generating__:image:')
                      || msg.content.startsWith('__generating__:video:')
                      || (
                        generating
                        && msg.id === messages[messages.length - 1]?.id
                        && (mode === 'image' || mode === 'video')
                        && !msg.content.includes('![')
                      )
                    ) ? (
                      <GeneratingPlaceholder
                        kind={
                          msg.content.includes(':video:') || mode === 'video' ? 'video' : 'image'
                        }
                        label={
                          msg.content.startsWith('__generating__:')
                            ? msg.content.split(':').slice(2).join(':') || undefined
                            : (mode === 'video' ? 'Creating video' : 'Creating image')
                        }
                      />
                    ) : msg.role === 'assistant' && isLikelyErrorMessage(msg.content) ? (
                      <ArkErrorInline message={msg.content} />
                    ) : (
                      <MessageContent content={msg.content} />
                    )}
                    {msg.role === 'assistant'
                      && typeof msg.elapsed_ms === 'number'
                      && msg.elapsed_ms >= 0
                      && !msg.content.startsWith('__generating__:')
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
                    {msg.role === 'assistant' && inspectOfferId === msg.id && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        <button
                          type="button"
                          className="text-[10px] rounded-full bg-sky-600 text-white px-2.5 py-1"
                          onClick={() => openCodeWorkspace(
                            handoffPrompt('yes, fix these', lastInspectReplyRef.current),
                          )}
                        >
                          Yes, fix this
                        </button>
                        <button
                          type="button"
                          className="text-[10px] rounded-full border border-surface-border px-2.5 py-1 text-content-secondary"
                          onClick={() => {
                            setComposerMode('debug');
                            setInput('Look at these files');
                            requestAnimationFrame(() => textareaRef.current?.focus());
                          }}
                        >
                          Debug
                        </button>
                        <button
                          type="button"
                          className="text-[10px] rounded-full border border-surface-border px-2.5 py-1 text-content-secondary"
                          onClick={() => openCodeWorkspace(
                            input.trim() || lastInspectReplyRef.current || 'Continue from chat',
                          )}
                        >
                          Continue in Code
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
