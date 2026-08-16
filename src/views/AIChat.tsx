import { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/context/AuthContext';
import { useRouter, type ChatMode } from '@/context/RouterContext';
import { useRecentProjects } from '@/context/RecentProjectsContext';
import { saveChatMessage } from '@/lib/api';
import { getLocalPrefs, hasProviderApiKey, setLocalPrefs } from '@/lib/localPrefs';
import { probeLiveCapacity, type LiveCapacity } from '@/lib/arkCapacity';
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
import { arkRoute, routerProviderLabel } from '@/lib/arkRouter';
import { FreeKeyWizard } from '@/components/FreeKeyWizard';
import { buildRouterHistory } from '@/lib/chatHistory';
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
  Bot, User as UserIcon, Loader2, Plus, Mic, ImageIcon, Video, Code2,
  Upload, Cpu, Cloud, ChevronDown, Check, Blocks, FolderKanban, Zap,
} from 'lucide-react';

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
  { id: 'ark-image-core', name: 'ARK Image Core', source: 'local', detail: 'Free · Pollinations via Engine', kind: 'image' },
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
  const { addCreation, addChat, creations, chats } = useRecentProjects();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
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
    return defaultModelForKind('chat');
  });
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [chatPlugins, setChatPlugins] = useState<PluginDef[]>(() => getChatEnabledPlugins(loadPluginState()));
  const [ollamaModels, setOllamaModels] = useState<ChatModelOption[]>([]);
  const [capacity, setCapacity] = useState<LiveCapacity | null>(null);
  const [generating, setGenerating] = useState(false);
  const [freeKeyOpen, setFreeKeyOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const hydratedCreationRef = useRef<string | null>(null);
  /** Skip one storage reload after we create a chat so Explore ideas doesn't flash back. */
  const skipChatLoadRef = useRef<string | null>(null);

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
      if (skipChatLoadRef.current === route.chatId) {
        skipChatLoadRef.current = null;
        setLoading(false);
        return;
      }
      try {
        const raw = localStorage.getItem(chatThreadKey(route.chatId));
        if (raw) {
          setMessages(JSON.parse(raw) as ChatMessage[]);
        } else {
          setMessages([]);
        }
      } catch {
        setMessages([]);
      }
      setLoading(false);
      return;
    }

    // Fresh New Chat / Image / Video — empty canvas
    setMessages([]);
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

  const handleSend = async () => {
    if (!input.trim() || !user || generating) return;
    const content = input.trim();

    // Move this conversation into Recent (ChatGPT-style) on first send.
    let activeChatId = route.name === 'chat' ? route.chatId : undefined;
    const isNewChat = !activeChatId;
    if (!activeChatId) {
      activeChatId = `chat-${crypto.randomUUID().slice(0, 10)}`;
      skipChatLoadRef.current = activeChatId;
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
      : activeModel.source === 'auto'
        ? 'ARK Auto'
        : `${activeModel.source === 'local' ? 'Local' : 'Cloud'} · ${activeModel.name}`;

    const assistantId = crypto.randomUUID();
    const isMediaMode = mode === 'image' || mode === 'video';
    const assistantMsg: ChatMessage = {
      id: assistantId,
      user_id: user.id,
      project_id: null,
      role: 'assistant',
      content: isMediaMode
        ? `__generating__:${mode}:${MEDIA_GEN_STAGES[mode][0].label}`
        : '',
      provider_used: providerLabel,
      created_at: new Date().toISOString(),
    };

    // Messages first — then navigate — so Explore ideas never replaces the thread.
    setMessages(prev => {
      const next = [...prev, userMsg, assistantMsg];
      persistModeThread(mode, next, { chatId: activeChatId });
      return next;
    });
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    if (isMediaMode) setGenerating(true);

    if (isNewChat) {
      navigate({
        name: 'chat',
        mode: mode === 'general' ? undefined : mode,
        chatId: activeChatId,
      });
    }

    void (async () => {
      let response = 'ARK Router could not complete this request.';
      let usedPlugin = false;
      let lastLibraryId: string | undefined;
      let resolvedProvider = providerLabel;

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
            setMessages(prev => {
              const next = prev.map(m => (m.id === assistantId ? { ...m, content: text } : m));
              persistModeThread(mode, next, { chatId: activeChatId });
              return next;
            });
          };

          for (const stage of stages) {
            if (!stage.ms) continue;
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
            preferredModelId: activeModel.id,
            preferredModelName: activeModel.name,
            preferredSource: activeModel.source,
          });
          const waitPromise = new Promise(r => window.setTimeout(r, minMs));
          const [routed] = await Promise.all([routePromise, waitPromise]);

          resolvedProvider = routerProviderLabel(routed, providerLabel);
          const libraryId = routed.media?.libraryId || `local-${Date.now()}`;
          lastLibraryId = libraryId;
          if (routed.media?.dataUrl) {
            rememberThumb(libraryId, routed.media.dataUrl);
            addCreation({
              id: libraryId,
              kind,
              title: content.slice(0, 80),
              prompt: content,
              modelName: routed.modelName || activeModel.name,
              dataUrl: routed.media.dataUrl,
              createdAt: new Date().toISOString(),
              real: Boolean(routed.media.real),
              source: routed.source,
            });
            response = mediaMessageMarkdown(content, libraryId, routed.media.dataUrl);
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
        } finally {
          setGenerating(false);
        }
      } else {
        try {
          // Prior thread + this user turn — ARK owns memory across provider hops.
          const prefs = getLocalPrefs();
          const history = prefs.rememberContext
            ? buildRouterHistory(messages, content)
            : buildRouterHistory([], content);
          const routed = await arkRoute({
            message: content,
            kind: mode === 'code' ? 'coding' : 'chat',
            preferredModelId: activeModel.id,
            preferredModelName: activeModel.name,
            preferredSource: activeModel.source,
            history,
            onChunk: (piece) => {
              setMessages(prev => prev.map(m => {
                if (m.id !== assistantId) return m;
                const base = (m.content.startsWith('__generating__:') || m.content.startsWith('__progress__:'))
                  ? ''
                  : m.content;
                return { ...m, content: base + piece };
              }));
            },
          });
          response = routed.reply;
          resolvedProvider = routerProviderLabel(routed, providerLabel);
          usedPlugin = true;
        } catch (err) {
          response = err instanceof Error ? err.message : 'ARK Router failed';
          usedPlugin = true;
        }
      }

      window.setTimeout(async () => {
        setMessages(prev => {
          const next = prev.map(m => (
            m.id === assistantId
              ? { ...m, content: response, provider_used: resolvedProvider }
              : m
          ));
          const activeCreationId = route.name === 'chat' ? route.creationId : undefined;
          persistModeThread(mode, next, {
            chatId: activeChatId,
            creationId: activeCreationId || lastLibraryId,
            libraryId: lastLibraryId,
            assistantId,
          });
          return next;
        });
        if (mode === 'general') {
          try {
            await saveChatMessage(null, 'user', content);
            await saveChatMessage(null, 'assistant', slimChatContent(response, lastLibraryId), resolvedProvider);
          } catch {
            // offline / guest ok
          }
        }
      }, usedPlugin ? 200 : 800);
    })();
  };

  const onInput = (value: string) => {
    setInput(value);
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

  const showEmpty = !loading && messages.length === 0;
  const activeMode = mode !== 'general' ? MODE_META[mode] : null;
  const ModeIcon = activeMode?.icon;
  const ModelSourceIcon = activeModel.source === 'cloud' ? Cloud : Cpu;
  const kind = kindForMode(mode);
  const keyedCloud = CLOUD_CHAT_WHEN_KEYED.filter(m => hasProviderApiKey(m.keyId));
  const modelsForTab: ChatModelOption[] = kind === 'chat'
    ? [
        ...CHAT_MODELS.filter(m => m.kind === 'chat'),
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
  const localModels = modelsForTab.filter(m => m.source === 'local');
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
                  if (model.kind === 'chat') setLocalPrefs({ defaultModelId: model.id, aiMode: 'automatic', autoFailover: true });
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
              {mode === 'image' ? 'Image models' : mode === 'video' ? 'Video models' : 'Local'}
            </p>
            {localModels.map(model => (
              <button
                key={model.id}
                type="button"
                onClick={() => {
                  setActiveModel(model);
                  if (model.kind === 'chat') setLocalPrefs({ defaultModelId: model.id });
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
        {cloudModels.length > 0 && (
          <>
            {(autoModels.length > 0 || localModels.length > 0) && (
              <div className="my-1.5 border-t border-surface-border" />
            )}
            <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-content-tertiary font-semibold">Cloud</p>
            {cloudModels.map(model => (
              <button
                key={model.id}
                type="button"
                onClick={() => {
                  setActiveModel(model);
                  if (model.kind === 'chat') setLocalPrefs({ defaultModelId: model.id });
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
        {kind === 'chat' && keyedCloud.length === 0 && ollamaModels.length === 0 && (
          <p className="px-3 py-2 text-[11px] text-content-tertiary leading-relaxed">
            Connect a free key in Settings to unlock cloud models here. ARK Auto will use them automatically.
          </p>
        )}
      </div>,
      document.body,
    )
    : null;

  const composer = (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-1 rounded-full border border-surface-border bg-ark-navy-900/90 pl-1.5 pr-1.5 py-1.5 shadow-lg shadow-black/20 min-w-0">
          <button
            type="button"
            className="w-9 h-9 rounded-full flex items-center justify-center text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors shrink-0"
            title="Add files"
            aria-label="Add files"
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
                if (!generating) handleSend();
              }
            }}
            placeholder={placeholder}
            rows={1}
            disabled={generating}
            className="flex-1 bg-transparent border-none resize-none px-1 py-2 text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none max-h-32 leading-5 min-w-0 disabled:opacity-60"
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

          <button
            type="button"
            className="w-9 h-9 rounded-full flex items-center justify-center text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors shrink-0"
            title="Voice input"
            aria-label="Voice input"
          >
            <Mic className="w-4 h-4" />
          </button>
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
      </div>

      {(mode === 'general' || mode === 'code') && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5 px-1">
          {mode === 'general' && (
            <>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-content-tertiary">
                <span className={`w-1.5 h-1.5 rounded-full ${capacity?.liveChat ? 'bg-emerald-400' : 'bg-content-tertiary'}`} />
                {capacity?.summary ?? 'Checking capacity...'}
              </span>
              {capacity && !capacity.liveChat && (
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
              )}
            </>
          )}

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
            <h1 className="text-2xl sm:text-3xl font-semibold text-content-primary tracking-tight mb-8 text-center">
              {greeting}
            </h1>
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
          <div className="shrink-0 px-6 pb-6 pt-2">
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
