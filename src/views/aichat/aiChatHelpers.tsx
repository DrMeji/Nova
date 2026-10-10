/**
 * Pure helpers / constants for AIChat — extracted to shrink the view.
 */
import { useEffect } from 'react';
import { MessageSquare, AudioLines } from 'lucide-react';
import { useRouter, type ChatMode } from '@/context/RouterContext';
import { getLocalPrefs, hasProviderApiKey } from '@/lib/localPrefs';
import { isCloudProviderEnabled } from '@/lib/cloudSources';
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
import { isCoderEngineId } from '@/lib/enginePick';

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
  // Hidden marker — Plan mode routes to the deep plan card (not prose prefix pollution).
  plan: '<!--nova-plan-mode-->\n',
  ask: '',
  // Hidden markers — Agent / Multi-agent early send paths (no prose pollution in the bubble).
  agent: '<!--nova-agent-mode-->\n',
  // Debug uses a hidden marker + seeded composer text — never the old "find the issue" line
  // (that word falsely routed to the GitHub plugin).
  debug: '<!--nova-debug-clinic-->\n',
  multitask: '<!--nova-multi-agent-->\n',
};

/** Default composer draft when Plan is armed (user can edit freely). */
export const PLAN_MODE_SEED = 'Help me plan this out before we build.';

/** Default composer draft when Debug is armed (user can edit freely). */
export const DEBUG_CLINIC_SEED = 'Find all problems in this project.';

/** Default composer draft when Agent is armed. */
export const AGENT_MODE_SEED = 'Work through the bound project one task at a time.';

/** Default composer draft when Multi-agent is armed. */
export const MULTI_AGENT_MODE_SEED = 'Scout, build, and verify the next fix on this project.';

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
  // Clinic mode — rose, distinct from the amber folder bind pill.
  debug: 'border-rose-500/55 bg-rose-500/20 text-rose-100 shadow-[0_0_0_1px_rgba(244,63,94,0.25)]',
  multitask: 'border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-200',
};

const LEGACY_DEBUG_PREFIX = 'Debug this. find the issue and propose a fix:';

export function composerModeFromContent(content: string): 'plan' | 'ask' | 'agent' | 'debug' | 'multitask' | null {
  const raw = String(content || '');
  if (/<!--nova-debug-clinic-->/i.test(raw) || raw.startsWith(LEGACY_DEBUG_PREFIX) || /^\[Debug\]/i.test(raw.trim())) {
    return 'debug';
  }
  if (/<!--nova-plan-mode-->/i.test(raw) || /^\[Plan\]/i.test(raw.trim())) {
    return 'plan';
  }
  if (/<!--nova-multi-agent-->/i.test(raw) || /^\[Multi-agent\]/i.test(raw.trim())) {
    return 'multitask';
  }
  if (/<!--nova-agent-mode-->/i.test(raw) || /^\[Agent\]/i.test(raw.trim())) {
    return 'agent';
  }
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
  const voiceFocus = current === 'voice';

  const emitVoiceVisual = (mode: 'voice' | 'chat') => {
    window.dispatchEvent(new CustomEvent('NOVA:voice-visual', { detail: { mode } }));
  };

  useEffect(() => {
    emitVoiceVisual(current === 'voice' ? 'voice' : 'chat');
  }, [current]);

  const go = (next: 'general' | 'voice') => {
    if (next === 'voice' && !isVoiceTabEnabled()) return;
    if (next === 'general') {
      stopSpeaking();
      emitVoiceVisual('chat');
      if (route.name === 'chat' && !route.mode && !route.chatId) return;
      navigate({ name: 'chat' });
      return;
    }
    if (route.name === 'chat' && route.mode === next) return;
    emitVoiceVisual('voice');
    navigate({ name: 'chat', mode: next });
  };

  const tabs: { id: 'general' | 'voice'; label: string; Icon: typeof MessageSquare }[] = [
    { id: 'general', label: 'Chat', Icon: MessageSquare },
    { id: 'voice', label: 'Voice', Icon: AudioLines },
  ];

  return (
    <div
      className={`fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center pointer-events-none transition-opacity duration-500 ${
        voiceFocus ? 'opacity-[0.38] hover:opacity-70' : 'opacity-100'
      }`}
    >
      <div className="nova-glass-tabs pointer-events-auto inline-flex items-center justify-center gap-0.5 rounded-full p-1 min-w-[6.5rem]">
        {tabs.map(t => {
          const parked = t.id === 'voice' && !isVoiceTabEnabled();
          const soonTitle = 'Voice · coming soon (conversation only, no PC control or builds)';
          const active = !parked && current === t.id;
          const Icon = t.Icon;
          return (
            <button
              key={t.id}
              type="button"
              disabled={parked}
              data-active={active ? 'true' : 'false'}
              onClick={() => go(t.id)}
              title={parked ? soonTitle : t.label}
              aria-label={t.label}
              className={`relative z-10 flex items-center justify-center rounded-full min-w-[2.75rem] min-h-[2.35rem] px-3.5 py-2 transition-colors ${
                parked
                  ? 'text-content-tertiary/40 cursor-not-allowed opacity-50'
                  : active
                  ? 'text-content-primary'
                  : 'text-content-tertiary/70 hover:text-content-primary cursor-pointer'
              }`}
            >
              <Icon className="w-4 h-4 pointer-events-none" strokeWidth={2} aria-hidden />
              <span className="sr-only">{t.label}{parked ? ' · soon' : ''}</span>
            </button>
          );
        })}
      </div>
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
  { id: 'NOVA-auto', name: 'Nova Auto', source: 'auto', detail: '', kind: 'chat' },
  // Image. paths that generate today
  { id: 'NOVA-auto', name: 'Nova Auto', source: 'auto', detail: '', kind: 'image' },
  { id: 'NOVA-image-core', name: 'NOVA Image Core', source: 'local', detail: '', kind: 'image' },
  { id: 'sd15-local', name: 'SD 1.5 Local', source: 'local', detail: '', kind: 'image' },
  { id: 'sdxl-turbo-local', name: 'SDXL Turbo Local', source: 'local', detail: '', kind: 'image' },
  { id: 'flux-schnell-local', name: 'FLUX Schnell Local', source: 'local', detail: '', kind: 'image' },
  { id: 'dall-e-3', name: 'DALL·E 3', source: 'cloud', detail: '', kind: 'image' },
  // Video. NOVA Engine only (Pollinations / HF / motion-still). Not Kling or Sora.
  { id: 'NOVA-auto', name: 'Nova Auto', source: 'auto', detail: '', kind: 'video' },
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
  const multimodal = (): ChatModelOption =>
    CHAT_MODELS.find(m => m.id === 'NOVA-auto' && m.kind === kind) ?? {
      id: 'NOVA-auto',
      name: 'Nova Auto',
      source: 'auto',
      detail: '',
      kind,
    };

  const prefs = getLocalPrefs();

  if (kind === 'chat') {
    let prefId = [prefs.activeChatId, prefs.lastChatModelId]
      .map((s) => String(s || '').trim())
      .find((id) => id && id !== 'NOVA-auto') || '';
    if (!prefId) {
      const legacy = String(prefs.defaultModelId || '').trim();
      if (legacy && legacy !== 'NOVA-auto' && !isCoderEngineId(legacy)) prefId = legacy;
    }
    if (!prefId || prefId === 'NOVA-auto') return multimodal();

    const cloud = CLOUD_CHAT_WHEN_KEYED.find(m => m.id === prefId && m.kind === 'chat');
    if (cloud) {
      if (hasProviderApiKey(cloud.keyId) && isCloudProviderEnabled(cloud.keyId)) return cloud;
      // Key removed / provider disabled — fall back to Auto.
      return multimodal();
    }

    const catalog = CHAT_MODELS.find(m => m.id === prefId && m.kind === 'chat');
    if (catalog) return catalog;

    // Engine / Ollama pin — keep a stub until live lists hydrate the real row.
    if (prefId.startsWith('ollama:')) {
      return {
        id: prefId,
        name: prefId.replace(/^ollama:/i, '') || prefId,
        source: 'local',
        detail: 'Ollama',
        kind: 'chat',
      };
    }
    return {
      id: prefId,
      name: prefId,
      source: 'local',
      detail: '',
      kind: 'chat',
    };
  }

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
  const auto = multimodal();
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
    'Type a message or tap the mic, then press Enter…',
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

/** Spoken when entering Voice — one line per visit, conversation-only. */
export const VOICE_GREETINGS = [
  'Hey — what do you want to talk about today?',
  'Welcome back. How can I help?',
  'Hi. What’s on your mind?',
  'Ready when you are. What should we chat about?',
  'Hey there. How’s your day going?',
  'What can we dig into today?',
  'Hello. What would you like to talk through?',
  'I’m here. What do you want to discuss?',
  'Good to see you. How can I assist you today?',
  'What would you like to explore in conversation?',
  'Take your time — what’s on your plate today?',
  'How’s everything going? What should we cover?',
  'Whenever you’re ready — what can I help with?',
  'Nice to have you back. What are we chatting about?',
  'How was your day? Want to talk something through?',
  'I’m listening. What would you like to start with?',
];

/** Brief hold lines while Voice works — pick by ask intent, not one generic “research” line. */
export const VOICE_RESEARCH_FILLERS = [
  'Just a moment — let me look that up.',
  'One second while I check that for you.',
  'Give me a moment to research that.',
  'Just a moment while I look into that.',
  'One moment while I dig into that.',
];

const VOICE_STORY_FILLERS = [
  'Okay — let me get a story together for you.',
  'Alright, give me a second to put a story together.',
  'Sure — let me spin up a short story.',
  'One moment — I’ve got a story coming.',
];

const VOICE_CAPABILITY_FILLERS = [
  'Sure — let me walk you through what I can do.',
  'Happy to — give me a second to cover what Nova’s good for.',
  'Alright, let me explain what I can help with.',
];

const VOICE_JOKE_FILLERS = [
  'Okay — let me think of a good one.',
  'One sec — I’ve got a joke brewing.',
];

const VOICE_GENERAL_FILLERS = [
  'Okay — give me a moment.',
  'Sure, one second.',
  'Alright, let me think that through.',
  'On it — just a moment.',
  'Give me a second.',
];

function pickFrom(list: string[], fallback: string): string {
  return list[Math.floor(Math.random() * list.length)] || fallback;
}

/** Pick a greeting different from the last spoken one when possible. */
export function pickVoiceGreeting(previous?: string | null): string {
  const list = VOICE_GREETINGS;
  if (list.length <= 1) return list[0] || '';
  let pick = list[Math.floor(Math.random() * list.length)];
  if (previous && list.length > 1) {
    let guard = 0;
    while (pick === previous && guard++ < 8) {
      pick = list[Math.floor(Math.random() * list.length)];
    }
  }
  return pick;
}

/** Hold line matched to what the user asked — avoids “pulling that up” on unrelated asks. */
export function pickVoiceHoldLine(ask: string): string {
  const t = String(ask || '').toLowerCase();
  if (/\b(stor(?:y|ies)|tale|fable|bedtime|narrat)/i.test(t)) {
    return pickFrom(VOICE_STORY_FILLERS, 'Okay — let me get a story together for you.');
  }
  if (
    /\b(what can (?:you|nova)|what do you do|what(?:'s| is) nova|capabilities|what are you|who are you|how can you help|what can nova do)\b/i.test(t)
  ) {
    return pickFrom(VOICE_CAPABILITY_FILLERS, 'Sure — let me walk you through what I can do.');
  }
  if (/\b(joke|funny|make me laugh|pun)\b/i.test(t)) {
    return pickFrom(VOICE_JOKE_FILLERS, 'Okay — let me think of a good one.');
  }
  if (/\b(who is|who was|what is|tell me about|look(?:ing)? up|search|research|explain|wikipedia|define)\b/i.test(t)) {
    return pickFrom(VOICE_RESEARCH_FILLERS, 'Just a moment — let me look that up.');
  }
  return pickFrom(VOICE_GENERAL_FILLERS, 'Okay — give me a moment.');
}

/** @deprecated Prefer pickVoiceHoldLine(ask) — kept for older call sites. */
export function pickVoiceResearchFiller(): string {
  return pickFrom(VOICE_GENERAL_FILLERS, 'Okay — give me a moment.');
}

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

/** Debounced persist — avoid main-thread JSON.stringify on every stream tick (item 15). */
const persistTimers = new Map<string, number>();
const persistPending = new Map<string, { mode: ChatMode; messages: ChatMessage[]; opts?: { chatId?: string; creationId?: string; libraryId?: string; assistantId?: string } }>();

function flushPersistModeThread(key: string) {
  persistTimers.delete(key);
  const pending = persistPending.get(key);
  persistPending.delete(key);
  if (!pending) return;
  try {
    const { mode, messages, opts } = pending;
    const slim = messages.map(m => ({
      ...m,
      content:
        opts?.assistantId && m.id === opts.assistantId
          ? slimChatContent(m.content, opts.libraryId)
          : slimChatContent(m.content),
    }));
    const json = JSON.stringify(slim);
    if (opts?.chatId) {
      localStorage.setItem(chatThreadKey(opts.chatId), json);
    }
    if (mode !== 'general') {
      localStorage.setItem(`NOVA:chat-thread:${mode}`, json);
    }
    if (opts?.creationId) {
      localStorage.setItem(`NOVA:chat-thread:creation:${opts.creationId}`, json);
    }
  } catch {
    /* ignore */
  }
}

export function persistModeThread(
  mode: ChatMode,
  messages: ChatMessage[],
  opts?: { chatId?: string; creationId?: string; libraryId?: string; assistantId?: string },
) {
  const key = String(opts?.chatId || opts?.creationId || mode || 'general');
  persistPending.set(key, { mode, messages, opts });
  if (persistTimers.has(key)) return;
  const id = window.setTimeout(() => flushPersistModeThread(key), 450);
  persistTimers.set(key, id);
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
