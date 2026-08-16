/**
 * What ARK can actually answer with right now (not catalog placeholders).
 */

import { getEngineStatus } from '@/lib/arkEngine';
import { hasAnyCloudChatKey } from '@/lib/cloudChat';
import { getProviderApiKeys } from '@/lib/localPrefs';
import { isOllamaEnabled, probeOllamaOptional } from '@/lib/ollamaOptional';

export type LiveCapacity = {
  /** At least one path that can produce a real chat reply */
  liveChat: boolean;
  cloudKeys: boolean;
  keyCount: number;
  ollama: boolean;
  /** Real GGUF + llama binary ready in ARK Engine */
  localGguf: boolean;
  /** Free image path (Pollinations via Engine) is available in desktop */
  imageFree: boolean;
  openaiImage: boolean;
  summary: string;
  /** Free-key providers still missing — for in-chat CTA */
  suggestedFreeKeys: { id: string; name: string }[];
};

const FREE_KEY_SUGGESTIONS = [
  { id: 'groq', name: 'Groq' },
  { id: 'google', name: 'Google AI Studio' },
  { id: 'openrouter', name: 'OpenRouter' },
  { id: 'huggingface', name: 'Hugging Face' },
  { id: 'together', name: 'Together AI' },
] as const;

export async function probeLiveCapacity(): Promise<LiveCapacity> {
  const keys = getProviderApiKeys();
  const cloudKeys = hasAnyCloudChatKey();
  const keyCount = [
    'groq', 'google', 'openrouter', 'huggingface', 'nvidia',
    'together', 'fireworks', 'deepseek', 'mistral', 'openai', 'anthropic',
  ].filter(id => Boolean(keys[id])).length;

  let ollama = false;
  if (isOllamaEnabled()) {
    try {
      const probe = await probeOllamaOptional();
      ollama = probe.online && probe.models.length > 0;
    } catch {
      ollama = false;
    }
  }

  let localGguf = false;
  let imageFree = Boolean(window.arkDesktop?.engineGenerate);
  try {
    const status = await getEngineStatus();
    localGguf = Boolean(status.ggufBinary && (status.ggufCount || 0) > 0);
    imageFree = status.phase === 'online' || Boolean(window.arkDesktop?.engineGenerate);
  } catch {
    /* keep defaults */
  }

  const liveChat = cloudKeys || ollama || localGguf;
  const openaiImage = Boolean(keys.openai);
  const suggestedFreeKeys = FREE_KEY_SUGGESTIONS
    .filter(p => !keys[p.id])
    .map(p => ({ id: p.id, name: p.name }))
    .slice(0, 3);

  let summary: string;
  if (liveChat) {
    const bits: string[] = [];
    if (cloudKeys) bits.push(`${keyCount} cloud key${keyCount === 1 ? '' : 's'}`);
    if (localGguf) bits.push('local GGUF');
    if (ollama) bits.push('Ollama');
    summary = `Ready · ${bits.join(' · ')}`;
  } else {
    summary = 'No live chat path yet — connect a free key or install a local brain';
  }

  return {
    liveChat,
    cloudKeys,
    keyCount,
    ollama,
    localGguf,
    imageFree,
    openaiImage,
    summary,
    suggestedFreeKeys,
  };
}

/** Honest reply when Router has no real LLM path (not ARK Core checklist). */
export function honestNoLiveChatReply(): string {
  return [
    'ARK doesn’t have a live model connected for this chat yet.',
    '',
    'To start getting real answers:',
    '1. Open Local AI and install the default local brain (Qwen2.5 1.5B) — ARK downloads llama-cli + weights for you.',
    '2. Or connect free capacity — Groq, Google AI Studio, OpenRouter, Hugging Face, or Together (Settings → Providers / Models).',
    '',
    'Once something is connected, leave the picker on ARK Auto — it will fail over for you and keep this thread’s context.',
  ].join('\n');
}
