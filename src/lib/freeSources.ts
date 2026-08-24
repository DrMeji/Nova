/**
 * Free model / capacity discovery. sources ARK can lock in for coding & creation.
 * Catalog grows over time; UI surfaces these in Models search / Cloud.
 */

export type FreeSourceKind = 'no-key' | 'free-key' | 'local-weights' | 'optional-runtime';

export type FreeSource = {
  id: string;
  name: string;
  kind: FreeSourceKind;
  use: 'chat' | 'coding' | 'image' | 'video' | 'multi';
  detail: string;
  wired: boolean;
  notes?: string;
  tone: string;
  initial: string;
};

/** What ARK already wires or is actively locking in. */
export const FREE_SOURCES: FreeSource[] = [
  {
    id: 'ark-engine-core',
    name: 'ARK Engine Core',
    kind: 'local-weights',
    use: 'chat',
    detail: 'Built-in local brain. first hop in ARK Router; no third-party runtime required.',
    wired: true,
    tone: 'from-sky-500 to-blue-700',
    initial: 'AE',
  },
  {
    id: 'pollinations-image',
    name: 'Pollinations (images)',
    kind: 'no-key',
    use: 'image',
    detail: 'Free no-key image host. ARK Router image path via ARK Image Core.',
    wired: true,
    tone: 'from-pink-500 to-rose-700',
    initial: 'Po',
  },
  {
    id: 'pollinations-video-still',
    name: 'Pollinations (video)',
    kind: 'no-key',
    use: 'video',
    detail: 'Tries Pollinations + Hugging Face MP4 routes; honest motion-still fallback if hosts need credits.',
    wired: true,
    tone: 'from-fuchsia-500 to-pink-800',
    initial: 'Pv',
  },
  {
    id: 'ollama-optional',
    name: 'Ollama models',
    kind: 'optional-runtime',
    use: 'multi',
    detail: 'Optional plug-in hop in ARK Router. never required.',
    wired: true,
    tone: 'from-zinc-400 to-zinc-700',
    initial: 'Ol',
  },
  {
    id: 'gguf-local',
    name: 'GGUF + llama-cli',
    kind: 'local-weights',
    use: 'coding',
    detail: 'Drop .gguf into the models folder (Local AI → Advanced can change the path), or install from Local AI.',
    wired: true,
    tone: 'from-emerald-500 to-teal-800',
    initial: 'GG',
  },
  {
    id: 'github-models',
    name: 'GitHub Models',
    kind: 'free-key',
    use: 'coding',
    detail: 'Retired by GitHub (July 2026). kept in catalog for history only.',
    wired: false,
    notes: 'Use Groq, Google AI Studio, or OpenRouter free routes instead.',
    tone: 'from-zinc-500 to-zinc-900',
    initial: 'GH',
  },
  {
    id: 'google-ai-studio',
    name: 'Google AI Studio',
    kind: 'free-key',
    use: 'coding',
    detail: 'Gemini free tier API key. Routed by ARK Router.',
    wired: true,
    tone: 'from-blue-500 to-sky-700',
    initial: 'G',
  },
  {
    id: 'groq-free',
    name: 'Groq',
    kind: 'free-key',
    use: 'coding',
    detail: 'Fast free-tier Llama. routed by ARK Router.',
    wired: true,
    tone: 'from-orange-500 to-red-700',
    initial: 'Gq',
  },
  {
    id: 'openrouter-free',
    name: 'OpenRouter free routes',
    kind: 'free-key',
    use: 'coding',
    detail: 'Community free model routes. routed by ARK Router.',
    wired: true,
    tone: 'from-violet-500 to-purple-800',
    initial: 'OR',
  },
  {
    id: 'huggingface-inference',
    name: 'Hugging Face Inference',
    kind: 'free-key',
    use: 'multi',
    detail: 'HF token for chat (router) and FLUX image generation. Wired into ARK Router.',
    wired: true,
    tone: 'from-yellow-500 to-amber-700',
    initial: 'HF',
  },
  {
    id: 'nvidia-nim-free',
    name: 'NVIDIA NIM free',
    kind: 'free-key',
    use: 'coding',
    detail: 'NIM / build.nvidia.com key. OpenAI-compatible chat hop in ARK Router.',
    wired: true,
    tone: 'from-lime-500 to-green-800',
    initial: 'NV',
  },
  {
    id: 'together-ai',
    name: 'Together AI',
    kind: 'free-key',
    use: 'coding',
    detail: 'Together open-model hosting. Wired into ARK Router.',
    wired: true,
    tone: 'from-indigo-500 to-blue-800',
    initial: 'To',
  },
  {
    id: 'fireworks-ai',
    name: 'Fireworks AI',
    kind: 'free-key',
    use: 'coding',
    detail: 'Fireworks serverless open models. Wired into ARK Router.',
    wired: true,
    tone: 'from-rose-500 to-orange-700',
    initial: 'Fw',
  },
  {
    id: 'deepseek-api',
    name: 'DeepSeek',
    kind: 'free-key',
    use: 'coding',
    detail: 'DeepSeek chat/coder API. Wired into ARK Router.',
    wired: true,
    tone: 'from-blue-400 to-indigo-700',
    initial: 'DS',
  },
  {
    id: 'mistral-api',
    name: 'Mistral',
    kind: 'free-key',
    use: 'coding',
    detail: 'Mistral / Codestral API. Wired into ARK Router.',
    wired: true,
    tone: 'from-orange-400 to-amber-700',
    initial: 'Mi',
  },
  {
    id: 'cerebras-free',
    name: 'Cerebras',
    kind: 'free-key',
    use: 'coding',
    detail: 'Ultra-fast Llama free tier. Wired into ARK Router.',
    wired: true,
    tone: 'from-cyan-500 to-teal-800',
    initial: 'Ce',
  },
  {
    id: 'sambanova-free',
    name: 'SambaNova',
    kind: 'free-key',
    use: 'coding',
    detail: 'SambaNova Cloud free-key hop. Wired into ARK Router.',
    wired: true,
    tone: 'from-fuchsia-500 to-purple-800',
    initial: 'Sn',
  },
];

export function wiredFreeSources() {
  return FREE_SOURCES.filter(s => s.wired);
}

export function searchFreeSources(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return FREE_SOURCES;
  return FREE_SOURCES.filter(
    s =>
      s.name.toLowerCase().includes(q)
      || s.detail.toLowerCase().includes(q)
      || s.use.includes(q)
      || s.kind.includes(q),
  );
}
