/**
 * Pure helpers / constants for AIChat — extracted to shrink the view.
 */
import { useRouter, type ChatMode } from '@/context/RouterContext';
import { getLocalPrefs } from '@/lib/localPrefs';
import { stopSpeaking } from '@/lib/voiceSession';
import { isVoiceTabEnabled } from '@/lib/featurePark';
import type { ArkRouterResult } from '@/lib/novaRouter';
import {
  chatThreadKey,
  slimChatContent,
} from '@/lib/recentStore';
import {
  parseChatAttaches,
} from '@/lib/chatAttach';
import {
  loadChatStudio,
  studioPathBasename,
} from '@/lib/chatStudioStore';
import type { ChatMessage } from '@/types';

/** Stacked live timer: minutes|seconds under 1h, hours|seconds at 1h+. */
export function stackedLiveTurnParts(ms: number): { top: string; bottom: string; label: string } {
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

export const COMPOSER_MODE_PREFIX: Record<'plan' | 'ask' | 'agent' | 'debug' | 'multitask', string> = {
  plan: 'Plan this out step by step, then we can build:\n\n',
  ask: '',
  agent: 'Agent mode. edit files and run approved tools in this workspace:\n\n',
  debug: 'Debug this. find the issue and propose a fix:\n\n',
  multitask: '[Multi-agent] ',
};

export const COMPOSER_MODE_LABEL: Record<'plan' | 'ask' | 'agent' | 'debug' | 'multitask', string> = {
  plan: 'Plan',
  ask: 'Ask',
  agent: 'Agent',
  debug: 'Debug',
  multitask: 'Multi-agent',
};

export const COMPOSER_MODE_PILL: Record<'plan' | 'ask' | 'agent' | 'debug' | 'multitask', string> = {
  plan: 'border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-200',
  ask: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200',
  agent: 'border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-200',
  debug: 'border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-200',
  multitask: 'border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-200',
};

export function composerModeFromContent(content: string): 'plan' | 'ask' | 'agent' | 'debug' | 'multitask' | null {
  if (content.startsWith(COMPOSER_MODE_PREFIX.plan)) return 'plan';
  if (content.startsWith(COMPOSER_MODE_PREFIX.agent)) return 'agent';
  if (content.startsWith(COMPOSER_MODE_PREFIX.debug)) return 'debug';
  if (content.startsWith(COMPOSER_MODE_PREFIX.multitask) || /^\[Multi-agent\]/i.test(content.trim())) return 'multitask';
  if (content.startsWith(COMPOSER_MODE_PREFIX.ask)) return 'ask';
  return null;
}

export function previewFromText(text: string) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  return t.length > 52 ? `${t.slice(0, 50)}…` : t;
}

export function ChatModeTabs() {
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

export type ModelSource = 'local' | 'cloud' | 'auto';

export type ModelKind = 'chat' | 'image' | 'video';

export type ChatModelOption = {
  id: string;
  name: string;
  source: ModelSource;
  detail: string;
  kind: ModelKind;
};

export const CHAT_MODELS: ChatModelOption[] = [
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
export const CLOUD_CHAT_WHEN_KEYED: (ChatModelOption & { keyId: string })[] = [
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

export function kindForMode(mode: ChatMode): ModelKind {
  if (mode === 'image') return 'image';
  if (mode === 'video') return 'video';
  return 'chat';
}

export function defaultModelForKind(kind: ModelKind): ChatModelOption {
  // Chat always runs Nova Multimodal (Auto). Users install brains in Models;
  // Auto picks chat vs coder vs vision per turn — no manual chat picker.
  if (kind === 'chat') {
    return CHAT_MODELS.find(m => m.id === 'NOVA-auto' && m.kind === 'chat') ?? {
      id: 'NOVA-auto',
      name: 'Nova Multimodal',
      source: 'auto',
      detail: '',
      kind: 'chat',
    };
  }
  const prefs = getLocalPrefs();
  const roleId = prefs.activeCoderId || prefs.defaultCodeModelId || prefs.defaultModelId;
  const prefId =
    roleId && roleId !== 'NOVA-auto'
      ? roleId
      : (prefs.defaultModelId && prefs.defaultModelId !== 'NOVA-auto'
        ? prefs.defaultModelId
        : (prefs.lastChatModelId || prefs.defaultModelId));

  if (prefId && prefId !== 'NOVA-auto') {
    const hit = CHAT_MODELS.find(m => m.id === prefId && m.kind === kind);
    if (hit) return hit;
  }
  const auto = CHAT_MODELS.find(m => m.id === 'NOVA-auto' && m.kind === kind);
  if (auto) return auto;
  const local = CHAT_MODELS.find(m => m.kind === kind && m.source === 'local');
  return local ?? CHAT_MODELS.find(m => m.kind === kind) ?? CHAT_MODELS[0];
}

/** Show a small chip when Auto hopped or a pinned model was overridden. */
export function failoverChipText(routed: ArkRouterResult, pinned: ChatModelOption): string | null {
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

export const PLACEHOLDERS: Record<ChatMode, string[]> = {
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

export const GREETINGS = [
  'What are we doing today?',
  'Welcome back.',
  'Ready when you are.',
  'What would you like to explore?',
];

export const IMAGE_IDEAS = [
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

export const VIDEO_IDEAS = [
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

export const CODE_IDEAS = [
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

export function isMediaOnlyContent(content: string) {
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

export function projectIdFromThread(messages: { content?: string }[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const metas = parseChatAttaches(String(messages[i]?.content || ''));
    for (const m of metas) {
      if (m.projectId) return m.projectId;
    }
  }
  return null;
}

export function folderNameFromThread(messages: { content?: string }[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const metas = parseChatAttaches(String(messages[i]?.content || ''));
    for (const m of metas) {
      if (m.name) return m.name;
    }
  }
  return null;
}

export async function resolveStudioFiles(opts: {
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
    if (window.novaDesktop?.projectRead) {
      try {
        const read = await Promise.race([
          window.novaDesktop.projectRead(pid),
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

export function persistModeThread(
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
export function deletePrepareErrorReply(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err || '');
  console.error('[delete] failed:', err);
  if (/before initialization/i.test(msg)) {
    return 'Delete failed due to an internal app bug (module load). Please restart NOVA after update. not a permissions issue.';
  }
  return msg || 'Could not prepare delete. Try again.';
}

/** Don't steal focus from Settings/Search/API fields into the chat composer. */
export function focusComposerIfSafe(el: HTMLTextAreaElement | null | undefined) {
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
