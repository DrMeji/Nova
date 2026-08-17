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
import {
  MEDIA_GEN_STAGES,
  rewriteImagePrompt,
  rewriteVideoPrompt,
} from '@/lib/mediaPrompt';
import { arkRoute, routerProviderLabel, type ArkRouterResult } from '@/lib/arkRouter';
import { FreeKeyWizard } from '@/components/FreeKeyWizard';
import { CapacityMeter } from '@/components/CapacityMeter';
import { buildRouterHistory, sanitizeAssistantReply } from '@/lib/chatHistory';
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
  Bot, User as UserIcon, Loader2, Plus, ImageIcon, Video, Code2,
  Upload, Cpu, Cloud, ChevronDown, Check, Blocks, FolderKanban, Zap, Square, X,
} from 'lucide-react';
import { engineGenerateCancel, getEngineStatus, setEngineModel } from '@/lib/arkEngine';

const CODE_FILE_RE =
  /\.(tsx?|jsx?|mjs|cjs|py|go|rs|java|kt|swift|cs|cpp|cxx|cc|c|h|hpp|rb|php|vue|svelte|css|scss|less|html|json|toml|ya?ml|md|sql|sh|bash|zsh|ps1|dockerfile|makefile)$/i;

function looksLikeCodeAsk(text: string) {
  const t = text.trim();
  if (!t) return false;
  if (/```[\w]*\n/.test(t)) return true;
  if (/\b(build|create|make|scaffold|implement|refactor|debug|fix)\b[\s\S]{0,40}\b(app|website|component|function|api|project|calculator|tool)\b/i.test(t)) {
    return true;
  }
  if (/\b(look (at|into)|review|open|edit|read)\b[\s\S]{0,40}\b(file|code|repo|project|source)\b/i.test(t)) {
    return true;
  }
  if (/\b(typescript|javascript|python|react|node\.?js|html|css)\b/i.test(t) && /\b(build|write|create|fix|add)\b/i.test(t)) {
    return true;
  }
  return false;
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
  { id: 'ark-auto', name: 'ARK Auto', source: 'auto', detail: 'Free-first · silent failover', kind: 'chat' },
  // Image — paths that generate today
  { id: 'ark-image-core', name: 'ARK Image Core', source: 'local', detail: 'Free · Pollinations · local SD when installed', kind: 'image' },
  { id: 'sd15-local', name: 'SD 1.5 Local', source: 'local', detail: 'On-device · install from Local AI', kind: 'image' },
  { id: 'sdxl-turbo-local', name: 'SDXL Turbo Local', source: 'local', detail: 'Fast on-device · install from Local AI', kind: 'image' },
  { id: 'flux-schnell-local', name: 'FLUX Schnell Local', source: 'local', detail: 'On-device FLUX · ~13 GB · Local AI', kind: 'image' },
  { id: 'dall-e-3', name: 'DALL·E 3', source: 'cloud', detail: 'Cloud image · OpenAI key', kind: 'image' },
  // Video — Engine path until real MP4 ships
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
  const { addCreation, addChat, addRecent, creations, chats } = useRecentProjects();
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
    if (kind !== 'chat') return defaultModelForKind(kind);
    const savedId = getLocalPrefs().defaultModelId;
    if (savedId === 'ark-auto' || !savedId) return defaultModelForKind('chat');
    const keyed = CLOUD_CHAT_WHEN_KEYED.find(m => m.id === savedId);
    if (keyed && hasProviderApiKey(keyed.keyId)) return keyed;
    // Local / other pinned ids resolve once engine status loads.
    return { id: savedId, name: savedId, source: 'local', detail: 'Pinned', kind: 'chat' };
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
  const activeModelRef = useRef(activeModel);
  const [freeKeyOpen, setFreeKeyOpen] = useState(false);
  const [failoverNote, setFailoverNote] = useState<string | null>(null);
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

  useEffect(() => {
    activeModelRef.current = activeModel;
  }, [activeModel]);

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
    routeChatIdRef.current = undefined;
    // Blank New Chat — clear prior thread id unless a generation is still creating one.
    if (!generatingRef.current) {
      persistChatIdRef.current = null;
    }
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

    if (route.chatId) {
      // We just created this chat and already have messages in state — don't wipe them.
      if (skipChatLoadIdsRef.current.has(route.chatId)) {
        skipChatLoadIdsRef.current.delete(route.chatId);
        setLoading(false);
        setGenerating(Boolean(generatingRef.current && activeGenChatIdRef.current === route.chatId));
        return;
      }
      try {
        const raw = localStorage.getItem(chatThreadKey(route.chatId));
        const loaded = raw ? JSON.parse(raw) as ChatMessage[] : [];
        setMessages(Array.isArray(loaded) ? loaded : []);
        messagesRef.current = Array.isArray(loaded) ? loaded : [];
      } catch {
        setMessages([]);
        messagesRef.current = [];
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
    setGenerating(Boolean(generatingRef.current && !activeGenChatIdRef.current));
    setLoading(false);
  }, [route]);

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
          const prefs = getLocalPrefs();
          // Never let last-used backend hijack Auto / cloud picks back to Qwen.
          const pinned = prefs.defaultModelId;
          if (!pinned || pinned === 'ark-auto') return;
          if (CLOUD_CHAT_WHEN_KEYED.some(m => m.id === pinned) || pinned.startsWith('ollama:')) return;
          const hit = ready.find(m => m.id === pinned);
          if (hit) {
            setActiveModel(prev => (prev.id === hit.id ? prev : hit));
          }
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
    const name = seed
      ? titleFromPrompt(seed).replace(/^(let'?s|lets|please)\s+/i, '').slice(0, 48) || 'Code project'
      : 'Code project';
    const project = addRecent(name);
    try {
      if (seed) localStorage.setItem(`ark:project-draft:${project.id}`, seed);
      if (seedFiles && Object.keys(seedFiles).length) {
        localStorage.setItem(`ark:project-seed-files:${project.id}`, JSON.stringify(seedFiles));
      }
    } catch {
      /* ignore */
    }
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    navigate({ name: 'project', id: project.id });
  };

  const onPickCodeFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = [...list];
    const codeFiles = files.filter(f => CODE_FILE_RE.test(f.name) || /javascript|typescript|json|text\/plain|xml/.test(f.type));
    if (!codeFiles.length) return;
    const seedFiles: Record<string, string> = {};
    for (const f of codeFiles.slice(0, 20)) {
      try {
        seedFiles[f.name] = await f.text();
      } catch {
        /* skip unreadable */
      }
    }
    const prompt = input.trim()
      || `Review and work with ${codeFiles.map(f => f.name).join(', ')}`;
    openCodeWorkspace(prompt, seedFiles);
  };

  const handleSend = () => {
    const content = input.trim();
    if (!content || !user) return;
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
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    void sendMessageRef.current(content);
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || !user || generatingRef.current) return;
    stopRequestedRef.current = false;
    setFailoverNote(null);
    const mySeq = ++genSeqRef.current;

    // Prefer live route id, then the id created by an in-flight first send (queue-safe).
    let activeChatId = routeChatIdRef.current || persistChatIdRef.current || undefined;
    const isNewChat = !activeChatId;
    if (!activeChatId) {
      activeChatId = `chat-${crypto.randomUUID().slice(0, 10)}`;
      skipChatLoadIdsRef.current.add(activeChatId);
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
      setMessages(prev => {
        const routeChat = routeChatIdRef.current;
        if (routeChat && threadChatId && routeChat !== threadChatId) {
          try {
            const raw = localStorage.getItem(chatThreadKey(threadChatId));
            const stored = raw ? JSON.parse(raw) as ChatMessage[] : [];
            const nextStored = stored.map(m => (
              m.id === assistantId
                ? { ...m, content: finalText, provider_used: provider }
                : m
            ));
            persistModeThread(mode, nextStored, {
              chatId: threadChatId,
              libraryId,
              assistantId,
            });
          } catch {
            /* ignore */
          }
          return prev;
        }
        const next = prev.map(m => (
          m.id === assistantId
            ? { ...m, content: finalText, provider_used: provider }
            : m
        ));
        messagesRef.current = next;
        const activeCreationId = route.name === 'chat' ? route.creationId : undefined;
        persistModeThread(mode, next, {
          chatId: threadChatId,
          creationId: activeCreationId || libraryId,
          libraryId,
          assistantId,
        });
        return next;
      });
    };

    // First-run guarantee: no live chat path → honest CTA reply (no fake ARK Core answer).
    if (
      !pluginId
      && (mode === 'general' || mode === 'code')
      && capacity
      && !capacity.liveChat
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
          const cleaned = sanitizeAssistantReply(streamedPartial, content, previousAssistant);
          if (cleaned.trim().length < 24) return;
          // GGUF often finishes streaming before llama-cli exits — don't leave Stop stuck.
          abandoned = true;
          void engineGenerateCancel();
          earlyResolve?.({ reply: cleaned });
        }, 2200);
      };

      try {
      if (pluginId) {
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
      } else if (mode === 'image' || mode === 'video') {
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
          const routePromise = arkRoute({
            message: rewritten,
            kind,
            preferredModelId: pinnedModel.id,
            preferredModelName: pinnedModel.name,
            preferredSource: pinnedModel.source,
          });
          const waitPromise = new Promise(r => window.setTimeout(r, minMs));
          const [routed] = await Promise.all([routePromise, waitPromise]);

          resolvedProvider = routerProviderLabel(routed, providerLabel);
          const hopNote = failoverChipText(routed, pinnedModel);
          if (hopNote) setFailoverNote(hopNote);
          const libraryId = routed.media?.libraryId || `local-${Date.now()}`;
          lastLibraryId = libraryId;
          if (routed.media?.dataUrl) {
            const isReal = Boolean(routed.media.real);
            rememberThumb(libraryId, routed.media.dataUrl);
            addCreation({
              id: libraryId,
              kind,
              title: isReal ? content.slice(0, 80) : `Preview · ${content.slice(0, 70)}`,
              prompt: content,
              modelName: routed.modelName || pinnedModel.name,
              dataUrl: routed.media.dataUrl,
              createdAt: new Date().toISOString(),
              real: isReal,
              source: routed.source,
            });
            if (!isReal && routed.reply) {
              response = routed.reply.includes('![')
                ? routed.reply
                : `${routed.reply}\n\n${mediaMessageMarkdown(content, libraryId, routed.media.dataUrl, { real: false, kind })}`;
            } else {
              response = mediaMessageMarkdown(content, libraryId, routed.media.dataUrl, {
                real: isReal,
                kind,
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
      } else {
        try {
          const prefs = getLocalPrefs();
          const history = prefs.rememberContext
            ? buildRouterHistory(priorForHistory, content)
            : buildRouterHistory([], content);
          const routePromise = arkRoute({
            message: content,
            kind: mode === 'code' ? 'coding' : 'chat',
            preferredModelId: pinnedModel.id,
            preferredModelName: pinnedModel.name,
            preferredSource: pinnedModel.source,
            history,
            onChunk: (piece) => {
              if (abandoned || stopRequestedRef.current || mySeq !== genSeqRef.current) return;
              streamedPartial += piece;
              const cleaned = sanitizeAssistantReply(streamedPartial, content, previousAssistant);
              setMessages(prev => prev.map(m => {
                if (m.id !== assistantId) return m;
                return { ...m, content: cleaned || '__generating__:chat:Thinking…' };
              }));
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
          const rawReply = stopRequestedRef.current && streamedPartial
            ? streamedPartial
            : routed.reply;
          response = sanitizeAssistantReply(rawReply, content, previousAssistant);
          if (routed.full) {
            resolvedProvider = routerProviderLabel(routed.full, providerLabel);
            const hopNote = failoverChipText(routed.full, pinnedModel);
            if (hopNote) setFailoverNote(hopNote);
            if (pinnedModel.source === 'local' && pinnedModel.id !== 'ark-auto') {
              setLocalPrefs({ lastChatModelId: pinnedModel.id });
            }
          }
          usedPlugin = true;
        } catch (err) {
          if (idleTimer) window.clearTimeout(idleTimer);
          abandoned = true;
          void engineGenerateCancel();
          const timedOut = err instanceof Error && /timed out/i.test(err.message);
          response = stopRequestedRef.current && streamedPartial
            ? sanitizeAssistantReply(streamedPartial, content, previousAssistant)
            : streamedPartial.trim().length > 20
              ? sanitizeAssistantReply(streamedPartial, content, previousAssistant)
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
        response = sanitizeAssistantReply(response, content, previousAssistant);
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

  const onInput = (value: string) => {
    setInput(value);
    if (codeSwitchDismissed && !looksLikeCodeAsk(value)) setCodeSwitchDismissed(false);
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
    }
  };

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
                      defaultModelId: model.id,
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
                    setLocalPrefs({ defaultModelId: model.id, lastChatModelId: model.id });
                    if (!model.id.startsWith('ollama:')) {
                      void setEngineModel(model.id).catch(() => undefined);
                    }
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
                  if (model.kind === 'chat') setLocalPrefs({ defaultModelId: model.id, lastChatModelId: model.id });
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
    <div className="w-full max-w-2xl mx-auto">
      {failoverChip}
      {(mode === 'general' || mode === 'code') && looksLikeCodeAsk(input) && !codeSwitchDismissed && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-violet-500/25 bg-violet-500/10 px-3 py-2 text-[11px] text-violet-100/90">
          <span>This looks like a build — switch to Code?</span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              className="rounded-md px-2 py-0.5 text-violet-100/70 hover:bg-violet-500/20 transition-colors"
              onClick={() => setCodeSwitchDismissed(true)}
              title="Stay in chat"
            >
              Stay
            </button>
            <button
              type="button"
              className="rounded-md px-2 py-0.5 text-violet-100 hover:bg-violet-500/20 transition-colors font-medium"
              onClick={() => openCodeWorkspace()}
            >
              Yes
            </button>
          </div>
        </div>
      )}
      {queueLen > 0 && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100/90">
          <span>
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
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-1 rounded-full border border-surface-border bg-ark-navy-900/90 pl-1.5 pr-1.5 py-1.5 shadow-lg shadow-black/20 min-w-0">
          <input
            ref={attachInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".ts,.tsx,.js,.jsx,.mjs,.cjs,.py,.go,.rs,.java,.kt,.swift,.cs,.cpp,.c,.h,.hpp,.rb,.php,.vue,.svelte,.css,.scss,.html,.json,.toml,.yaml,.yml,.md,.sql,.sh,.ps1,text/*,application/json"
            onChange={e => {
              void onPickCodeFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="w-9 h-9 rounded-full flex items-center justify-center text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors shrink-0"
            title="Add files (code files open Code workspace)"
            aria-label="Add files"
            onClick={() => attachInputRef.current?.click()}
          >
            <Plus className="w-4 h-4" />
          </button>

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
            placeholder={placeholder}
            rows={1}
            className="flex-1 bg-transparent border-none resize-none px-1 py-2 text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none max-h-32 leading-5 min-w-0"
          />

          <button
            ref={modelButtonRef}
            type="button"
            onClick={() => setModelMenuOpen(o => !o)}
            className="inline-flex items-center gap-1 rounded-full border border-surface-border/80 bg-surface-hover/60 hover:bg-surface-hover px-2 py-1.5 text-xs text-content-primary transition-colors shrink-0 max-w-[9.5rem]"
            title={`Active model · ${activeModel.source === 'auto' ? 'Auto' : activeModel.source === 'local' ? 'Local' : 'Cloud'}`}
            aria-label="Select model"
            aria-expanded={modelMenuOpen}
          >
            <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
              activeModel.source === 'auto'
                ? 'text-sky-400'
                : activeModel.source === 'local'
                  ? 'text-emerald-400'
                  : 'text-sky-400'
            }`}>
              {mode === 'image' ? <ImageIcon className="w-3.5 h-3.5" />
                : mode === 'video' ? <Video className="w-3.5 h-3.5" />
                  : activeModel.source === 'auto' ? <Zap className="w-3.5 h-3.5" />
                    : <ModelSourceIcon className="w-3.5 h-3.5" />}
            </span>
            <span className="font-medium truncate">
              {activeModel.source === 'auto' ? 'Auto' : activeModel.name}
            </span>
            {activeModel.source === 'auto' && (
              <span className="text-[10px] text-sky-400/90 font-medium hidden sm:inline">ARK</span>
            )}
            <ChevronDown className={`w-3.5 h-3.5 text-content-tertiary transition-transform shrink-0 ${modelMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {modelMenu}

          {generating && (
            <button
              type="button"
              onClick={handleStop}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
              title="Stop generating"
              aria-label="Stop generating"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          )}
        </div>

        {ModeIcon && (
          <button
            type="button"
            onClick={clearMode}
            title={`${activeMode.title} mode · click to clear`}
            aria-label={`${activeMode.title} mode`}
            className="w-11 h-11 rounded-full border border-sky-400/40 bg-sky-500/15 text-sky-300 flex items-center justify-center shrink-0 hover:bg-sky-500/25 transition-colors"
          >
            <ModeIcon className="w-5 h-5" />
          </button>
        )}

        {(mode === 'general' || mode === 'code') && (
          <button
            type="button"
            onClick={() => openCodeWorkspace()}
            title="Open Code workspace (explorer, editor, chat)"
            aria-label="Open Code workspace"
            className="w-11 h-11 rounded-full border border-violet-400/35 bg-violet-500/15 text-violet-200 flex items-center justify-center shrink-0 hover:bg-violet-500/25 transition-colors"
          >
            <Code2 className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5 px-1">
        <CapacityMeter
          capacity={capacity}
          kind={mode === 'image' ? 'image' : mode === 'video' ? 'video' : 'chat'}
        />
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
              onClick={() => openCodeWorkspace()}
              className="inline-flex items-center gap-1 text-[11px] text-violet-300/90 hover:text-violet-200 transition-colors"
              title="Switch to Code workspace"
            >
              <Code2 className="w-3 h-3" />
              Code
            </button>

            <button
              type="button"
              onClick={() => navigate({ name: 'build' })}
              className="inline-flex items-center gap-1 text-[11px] text-content-tertiary hover:text-content-secondary transition-colors"
            >
              <Blocks className="w-3 h-3" />
              {chatPlugins.length ? 'Manage plugins' : 'Add plugins'}
            </button>

            {mode === 'general' && (
              <button
                type="button"
                onClick={() => navigate({ name: 'projects' })}
                className="inline-flex items-center gap-1.5 text-[11px] text-content-tertiary hover:text-content-secondary transition-colors"
              >
                <FolderKanban className="w-3 h-3" />
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
          <div className="flex-1 flex flex-col items-center justify-center px-6 pb-16">
            <h1 className="text-2xl sm:text-3xl font-semibold text-content-primary tracking-tight mb-3 text-center">
              {greeting}
            </h1>
            <p className="text-xs text-content-tertiary mb-4 text-center max-w-md">
              {capacity && !capacity.liveChat
                ? 'No live model yet. Connect a free key or install a local brain, then send a message.'
                : 'Say hello to start. ARK Auto uses your local brain and free keys, and switches if one runs out.'}
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
            {composer}
          </div>
        ) : (
          <div className="flex-1 flex flex-col px-6 pt-[min(12vh,5.5rem)] pb-4 min-h-0 overflow-hidden">
            <div className="shrink-0 flex flex-col items-center">
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
          <div className="shrink-0 px-6 pb-6 pt-2 space-y-2">
            {setupNote && (
              <div className="max-w-2xl mx-auto rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200/90 leading-relaxed flex items-start justify-between gap-3">
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
