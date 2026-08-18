import { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/context/AuthContext';
import { useRouter, type ChatMode } from '@/context/RouterContext';
import { useRecentProjects } from '@/context/RecentProjectsContext';
import { saveChatMessage } from '@/lib/api';
import { getLocalPrefs, hasProviderApiKey, setLocalPrefs } from '@/lib/localPrefs';
import { honestNoLiveChatReply, probeLiveCapacity, type LiveCapacity } from '@/lib/arkCapacity';
import {
  chatThreadKey,
  mediaMessageMarkdown,
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
  shouldHandoffToCode,
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
} from '@/lib/mediaPrompt';
import { arkRoute, routerProviderLabel, type ArkRouterResult } from '@/lib/arkRouter';
import { FreeKeyWizard } from '@/components/FreeKeyWizard';
import { ComposerPlusMenu, type ComposerPlusAction } from '@/components/ComposerPlusMenu';
import { TokenUsageRing } from '@/components/TokenUsageRing';
import { activityKeyForChatMode, notifyWorkDone } from '@/lib/activityIndicators';
import { getTokenUsageRatio, recordTokenUsage } from '@/lib/tokenUsage';
import {
  buildRouterHistory,
  looksLikePromptEcho,
  sanitizeAssistantReply,
  usableAssistantText,
} from '@/lib/chatHistory';
import {
  autoPillLabel,
  autoRingDetail,
  brainKindForChatMode,
  clearThreadBrain,
  loadThreadBrain,
  saveAutoThreadBrain,
  type ThreadBrain,
} from '@/lib/threadBrain';
import { MessageContent } from '@/components/MediaMessage';
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
// CapacityMeter removed from footer — ring + model pill carry status

const CODE_FILE_RE =
  /\.(tsx?|jsx?|mjs|cjs|py|go|rs|java|kt|swift|cs|cpp|cxx|cc|c|h|hpp|rb|php|vue|svelte|css|scss|less|html|json|toml|ya?ml|md|sql|sh|bash|zsh|ps1|dockerfile|makefile)$/i;

const COMPOSER_MODE_PREFIX: Record<'plan' | 'ask' | 'debug' | 'multitask', string> = {
  plan: 'Plan this out step by step, then we can build:\n\n',
  ask: '',
  debug: 'Debug this — find the issue and propose a fix:\n\n',
  multitask: 'Break this into parallel tasks and tackle them clearly:\n\n',
};

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
  // Video — Engine path until real MP4 ships
  { id: 'ark-auto', name: 'ARK', source: 'auto', detail: 'Best path · stays on for this chat', kind: 'video' },
  { id: 'ark-video-core', name: 'ARK Video Core', source: 'local', detail: 'MP4 when free · motion fallback', kind: 'video' },
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

  if (pinned.id === 'ark-auto' || pinned.source === 'auto') {
    return hops > 1 ? `Switched to ${name}` : null;
  }

  const pinnedName = (pinned.name || '').toLowerCase();
  const pinnedId = (pinned.id || '').toLowerCase();
  const resolved = name.toLowerCase();
  const same =
    resolved.includes(pinnedName)
    || pinnedName.includes(resolved)
    || (pinnedId && resolved.includes(pinnedId.replace(/^(ollama|ark)-?/, '')));
  if (hops > 1 || !same) return `Switched to ${name}`;
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

const MODE_META: Record<Exclude<ChatMode, 'general'>, { icon: typeof ImageIcon; title: string }> = {
  image: { icon: ImageIcon, title: 'Image' },
  video: { icon: Video, title: 'Video' },
  code: { icon: Code2, title: 'Code' },
};

function isMediaOnlyContent(content: string) {
  if (!content) return false;
  if (content.startsWith('__generating__:') || content.startsWith('__progress__:')) return true;
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
  const [loading, setLoading] = useState(() => {
    // Sync-load the active Recent thread so clicking Recent doesn't flash blank.
    if (route.name === 'chat' && route.chatId) {
      try {
        const raw = localStorage.getItem(chatThreadKey(route.chatId));
        if (raw) return false;
      } catch {
        /* ignore */
      }
    }
    return true;
  });
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (route.name === 'chat' && route.chatId) {
      try {
        const raw = localStorage.getItem(chatThreadKey(route.chatId));
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
  const [capacity, setCapacity] = useState<LiveCapacity | null>(null);
  const [generating, setGenerating] = useState(false);
  const [queueLen, setQueueLen] = useState(0);
  const [codeSwitchDismissed, setCodeSwitchDismissed] = useState(false);
  const [chatStudioFiles, setChatStudioFiles] = useState<Record<string, string>>({});
  const [chatStudioProjectId, setChatStudioProjectId] = useState<string | null>(null);
  const [githubPickerOpen, setGithubPickerOpen] = useState(false);
  const [inspectOfferId, setInspectOfferId] = useState<string | null>(null);
  const [githubOfferId, setGithubOfferId] = useState<string | null>(null);
  const [composerTall, setComposerTall] = useState(false);
  const [composerMode, setComposerMode] = useState<'plan' | 'ask' | 'debug' | 'multitask' | null>(null);
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
  /** Auto: equipped brain for this chat thread (sticky until failover). */
  const [threadBrain, setThreadBrain] = useState<ThreadBrain | null>(() => {
    if (route.name === 'chat' && route.chatId) {
      const m = route.mode && route.mode !== 'general' ? route.mode : 'general';
      return loadThreadBrain(route.chatId, brainKindForChatMode(m));
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
    setLocalPrefs({ defaultModelId: 'ark-auto', aiMode: 'automatic', autoFailover: true });
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (route.name !== 'chat') {
      routeChatIdRef.current = undefined;
      return;
    }
    if (route.chatId) {
      routeChatIdRef.current = route.chatId;
      persistChatIdRef.current = route.chatId;
      return;
    }
    // Explicit blank starter (New Chat / Image / Video with no id) — never keep a stale thread id.
    // Otherwise the next send attaches to the previous Recent chat and looks like a “duplicate mix”.
    routeChatIdRef.current = undefined;
    persistChatIdRef.current = null;
  }, [route]);

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
        generatingRef.current && activeGenChatIdRef.current === route.chatId && messagesRef.current.length,
      );
      // We just created this chat and already have messages in state — don't wipe them.
      if (skipChatLoadIdsRef.current.has(route.chatId) || inFlight) {
        if (!inFlight) skipChatLoadIdsRef.current.delete(route.chatId);
        setLoading(false);
        setGenerating(Boolean(generatingRef.current && activeGenChatIdRef.current === route.chatId));
        return;
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

    // Fresh New Chat / Image / Video — empty canvas
    setMessages([]);
    messagesRef.current = [];
    setThreadBrain(null);
    setGenerating(Boolean(generatingRef.current && !activeGenChatIdRef.current));
    setLoading(false);
  }, [route, mode]);

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
        })
        .catch(() => {
          setEngineLocalModels([]);
          setEngineInstallingModels([]);
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
      saveProjectThread(project.id, messagesRef.current.map(m => ({
        ...m,
        project_id: project.id,
      })));
      const threadMsgs = messagesRef.current.map(m => ({
        ...m,
        project_id: project.id,
      }));
      if (Object.keys(files).length) {
        void persistProjectThreadToDisk(project.id, name, threadMsgs, files);
      } else {
        void persistProjectThreadToDisk(project.id, name, threadMsgs);
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

  const onPickCodeFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = [...list];
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
    if (action === 'file' || action === 'image') {
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
    if (!content || !user) return;
    if (composerMode && COMPOSER_MODE_PREFIX[composerMode]) {
      content = `${COMPOSER_MODE_PREFIX[composerMode]}${content}`;
    }
    setComposerMode(null);
    // Do not auto-navigate on build-ish prompts — Yes on the chip switches to Code.
    const viewingChatId = routeChatIdRef.current;
    const busyOnThisChat = generatingRef.current && (
      !viewingChatId
      || !activeGenChatIdRef.current
      || activeGenChatIdRef.current === viewingChatId
      || activeGenChatIdRef.current === persistChatIdRef.current
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
      // Fresh thread: wipe any leftover UI messages so history cannot leak from a prior chat.
      messagesRef.current = [];
      setMessages([]);
      addChat({
        id: activeChatId,
        mode,
        title: titleFromPrompt(content),
        updatedAt: new Date().toISOString(),
      });
    } else {
      const existing = chats.find(c => c.id === activeChatId);
      addChat({
        id: activeChatId,
        mode,
        title: existing?.title || titleFromPrompt(content),
        updatedAt: new Date().toISOString(),
        creationId: existing?.creationId,
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

    // Messages first — then navigate — so Explore ideas never replaces the thread.
    setMessages(() => {
      const next = messagesRef.current;
      persistModeThread(mode, next, { chatId: activeChatId });
      return next;
    });
    generatingRef.current = true;
    setGenerating(true);

    if (isNewChat) {
      navigate({
        name: 'chat',
        mode: mode === 'general' ? undefined : mode,
        chatId: activeChatId,
      });
    }

    const clearGeneratingIfMine = () => {
      if (mySeq !== genSeqRef.current) return;
      generatingRef.current = false;
      if (activeGenChatIdRef.current === activeChatId) {
        activeGenChatIdRef.current = null;
      }
      setGenerating(false);
    };

    const finalizeAssistant = (finalText: string, provider: string, libraryId?: string) => {
      if (mySeq !== genSeqRef.current) return;
      const threadChatId = persistChatIdRef.current || activeChatId;
      const routeChat = routeChatIdRef.current;
      const patchThread = (list: ChatMessage[]) => list.map(m => (
        m.id === assistantId
          ? { ...m, content: finalText, provider_used: provider }
          : m
      ));

      // Prefer live messages; fall back to stored thread when the view already switched chats.
      let next = patchThread(messagesRef.current);
      if (routeChat && threadChatId && routeChat !== threadChatId) {
        try {
          const raw = localStorage.getItem(chatThreadKey(threadChatId));
          const stored = raw ? JSON.parse(raw) as ChatMessage[] : [];
          if (Array.isArray(stored) && stored.some(m => m.id === assistantId)) {
            next = patchThread(stored);
          }
        } catch {
          /* ignore */
        }
      } else {
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

      notifyWorkDone(activityKeyForChatMode(mode));
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
          // GGUF often finishes streaming before llama-cli exits — release Stop quickly.
          abandoned = true;
          void engineGenerateCancel();
          clearGeneratingIfMine();
              const echoFallback = looksLikePromptEcho(streamedPartial) ? '' : streamedPartial.trim();
              earlyResolve?.({ reply: cleaned || echoFallback || 'Model echoed its system prompt. Try switching models and send again.' });
        }, 8_000);
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

      if (!usedPlugin && (mode === 'general' || mode === 'code') && shouldInspectInChat(content, hasStudioFiles, false)) {
        const findings = scanProjectFindings(studioFiles, content);
        const picked = pickFilesForInspect(studioFiles, content);
        const inspectMessage = buildInspectPrompt(
          content,
          studioFiles,
          picked,
          findings,
          'Chat inspect',
        );
        const prefs = getLocalPrefs();
        const history = prefs.rememberContext
          ? buildRouterHistory(priorForHistory, inspectMessage)
          : buildRouterHistory([], inspectMessage);
        const sticky = pinnedModel.source === 'auto' ? threadBrainRef.current : null;
        const routed = await arkRoute({
          message: inspectMessage,
          kind: 'chat',
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

      if (!usedPlugin && (mode === 'general' || mode === 'code') && shouldHandoffToCode(content, hasStudioFiles, false)) {
        openCodeWorkspace(handoffPrompt(content, lastInspectReplyRef.current), studioFiles);
        response = hasStudioFiles
          ? 'Opening **Code** with your files. I will apply the change there — you can keep adding, removing, or upgrading in that chat.'
          : 'Opening **Code** so I can start building. Keep going there to add, remove, or upgrade.';
        usedPlugin = true;
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
      } else if (!usedPlugin && (mode === 'image' || mode === 'video')) {
        try {
          const kind = mode === 'image' ? 'image' : 'video';
          const stages = MEDIA_GEN_STAGES[kind];
          const setAssistantContent = (text: string) => {
            if (abandoned || stopRequestedRef.current || mySeq !== genSeqRef.current) return;
            setMessages(prev => {
              const next = prev.map(m => (m.id === assistantId ? { ...m, content: text } : m));
              persistModeThread(mode, next, { chatId: persistChatIdRef.current || activeChatId });
              return next;
            });
          };

          for (const stage of stages) {
            if (!stage.ms) continue;
            if (stopRequestedRef.current || mySeq !== genSeqRef.current) break;
            setAssistantContent(`__generating__:${kind}:${stage.label}`);
            await new Promise(r => window.setTimeout(r, stage.ms));
          }
          setAssistantContent(`__generating__:${kind}:${stages[stages.length - 1].label}`);

          const rewritten =
            kind === 'image' ? rewriteImagePrompt(content) : rewriteVideoPrompt(content);

          const minMs = kind === 'image' ? 3200 : 5500;
          const sticky = pinnedModel.source === 'auto' ? threadBrainRef.current : null;
          const routePromise = arkRoute({
            message: rewritten,
            kind,
            preferredModelId: pinnedModel.id,
            preferredModelName: pinnedModel.name,
            preferredSource: pinnedModel.source,
            stickyModelId: sticky?.modelId,
            stickyModelName: sticky?.modelName,
            stickyPinnedSource: sticky?.pinnedSource,
          });
          const waitPromise = new Promise(r => window.setTimeout(r, minMs));
          const [routed] = await Promise.all([routePromise, waitPromise]);

          resolvedProvider = routerProviderLabel(routed, providerLabel);
          const hopNote = failoverChipText(routed, pinnedModel);
          if (hopNote) setFailoverNote(hopNote);
          if (pinnedModel.source === 'auto' && routed.source !== 'none') {
            const nextBrain = saveAutoThreadBrain(
              activeChatId,
              kind,
              routed,
              threadBrainRef.current,
              routed.attempted?.length ?? 0,
            );
            if (nextBrain) setThreadBrain(nextBrain);
          }
          const libraryId = routed.media?.libraryId || `local-${Date.now()}`;
          lastLibraryId = libraryId;
          if (routed.media?.dataUrl) {
            const isReal = Boolean(routed.media.real);
            rememberThumb(libraryId, routed.media.dataUrl);
            if (isReal) {
              addCreation({
                id: libraryId,
                kind,
                title: content.slice(0, 80),
                prompt: content,
                modelName: routed.modelName || pinnedModel.name,
                dataUrl: routed.media.dataUrl,
                createdAt: new Date().toISOString(),
                real: true,
                source: routed.source,
              });
            }
            if (!isReal && routed.reply) {
              response = routed.reply.includes('![')
                ? routed.reply
                : `${routed.reply}\n\n${mediaMessageMarkdown(content, libraryId, routed.media.dataUrl, { real: false, kind })}`;
            } else {
              response = mediaMessageMarkdown(content, libraryId, routed.media.dataUrl, {
                real: isReal,
                kind,
                source: routed.source,
              });
            }
            addChat({
              id: activeChatId!,
              mode,
              title: titleFromPrompt(content),
              updatedAt: new Date().toISOString(),
              creationId: libraryId,
            });
          } else {
            response = routed.reply;
          }
          usedPlugin = true;
        } catch (err) {
          response = err instanceof Error ? err.message : 'Media generation failed';
          usedPlugin = true;
        }
      } else if (!usedPlugin) {
        try {
          const prefs = getLocalPrefs();
          const history = prefs.rememberContext
            ? buildRouterHistory(priorForHistory, content)
            : buildRouterHistory([], content);
          const sticky = pinnedModel.source === 'auto' ? threadBrainRef.current : null;
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
            onChunk: (piece) => {
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
            },
          });
          const timeoutMs = 90_000;
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
          response = stopRequestedRef.current && streamedPartial
            ? usableAssistantText(streamedPartial, content, previousAssistant) || streamedPartial.trim()
            : streamedPartial.trim().length > 8
              ? usableAssistantText(streamedPartial, content, previousAssistant) || (looksLikePromptEcho(streamedPartial) ? '' : streamedPartial.trim())
              : (timedOut
                ? 'Response timed out. Try again or pick another model.'
                : (err instanceof Error ? err.message : 'ARK Router failed'));
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

  const setModeAndFocus = (next: ChatMode) => {
    setMode(next);
    setMessages([]);
    navigate({ name: 'chat', mode: next === 'general' ? undefined : next });
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const clearMode = () => setModeAndFocus('general');

  const applyIdea = (label: string) => {
    setInput(label);
    textareaRef.current?.focus();
  };

  const viewingChatId = route.name === 'chat' ? route.chatId : undefined;
  // Explore / idea grid only for brand-new chats — never when a Recent thread is open.
  const showEmpty = !loading && messages.length === 0 && !viewingChatId;
  const showOpenThread = !loading && Boolean(viewingChatId);
  const activeMode = mode !== 'general' ? MODE_META[mode] : null;
  const ModeIcon = activeMode?.icon;
  const ModelSourceIcon = activeModel.source === 'cloud' ? Cloud : Cpu;
  const kind = kindForMode(mode);
  const keyedCloud = CLOUD_CHAT_WHEN_KEYED.filter(m => hasProviderApiKey(m.keyId));
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
                  <span className="block text-[11px] text-content-tertiary truncate">{model.detail}</span>
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
            Install a local brain in Local AI / Models, or connect a free key in Settings.
          </p>
        )}
      </div>,
      document.body,
    )
    : null;

  const failoverChip = failoverNote ? (
    <div className="mb-2 flex justify-center">
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
    </div>
  ) : null;

  const composer = (
    <div className="w-full max-w-3xl mx-auto">
      {failoverChip}
      {composerMode && (
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface-hover/60 px-2.5 py-0.5 text-[11px] text-content-secondary capitalize">
            {composerMode}
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
          {(mode === 'general' || mode === 'code') && looksLikeCodeAsk(input) && !codeSwitchDismissed && (
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
                ? (threadBrain ? `${autoModelLabel} · equipped for this chat` : 'ARK Auto · picks best brain')
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
                    ? 'Local · ARK Engine'
                    : 'Cloud · connected key'
          }
        />

        {ModeIcon && (
          <button
            type="button"
            onClick={clearMode}
            title={`${activeMode.title} mode · click to clear`}
            aria-label={`${activeMode.title} mode`}
            className="w-8 h-8 rounded-full border border-sky-400/40 bg-sky-500/15 text-sky-300 flex items-center justify-center shrink-0 hover:bg-sky-500/25 transition-colors"
          >
            <ModeIcon className="w-3.5 h-3.5" />
          </button>
        )}

        {(mode === 'general' || mode === 'code') && looksLikeCodeAsk(input) && !codeSwitchDismissed && (
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

        {(mode === 'general' || mode === 'code') && (
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
            {looksLikeCodeAsk(input) && !codeSwitchDismissed && (
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

            {chatPlugins.map(plugin => (
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
    <div className="h-full flex flex-col">
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
            {mode === 'image' && ideaGrid(IMAGE_IDEAS, 'Upload a photo')}
            {mode === 'video' && ideaGrid(VIDEO_IDEAS, 'Upload a clip')}
            {mode === 'code' && ideaGrid(CODE_IDEAS)}
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
                    className={`max-w-[min(42rem,78%)] text-sm text-content-primary ${
                      msg.role === 'user'
                        ? 'rounded-2xl px-4 py-3 bg-surface-hover'
                        : isMediaOnlyContent(msg.content)
                          ? 'px-0 py-0 bg-transparent'
                          : 'rounded-2xl px-4 py-3 bg-ark-navy-900 border border-surface-border'
                    }`}
                  >
                    <MessageContent content={msg.content} />
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
