/**
 * Free model / capacity discovery — sources ARK can lock in for coding & creation.
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
};

/** What ARK already wires or is actively locking in. */
export const FREE_SOURCES: FreeSource[] = [
  {
    id: 'ark-engine-core',
    name: 'ARK Engine Core',
    kind: 'local-weights',
    use: 'chat',
    detail: 'Built-in local brain — first hop in ARK Router; no third-party runtime required.',
    wired: true,
  },
  {
    id: 'pollinations-image',
    name: 'Pollinations (images)',
    kind: 'no-key',
    use: 'image',
    detail: 'Free no-key image host — ARK Router image path via ARK Image Core.',
    wired: true,
  },
  {
    id: 'pollinations-video-still',
    name: 'Pollinations (video stills)',
    kind: 'no-key',
    use: 'video',
    detail: 'Cinematic stills for Video tab until MP4 pipeline ships.',
    wired: true,
  },
  {
    id: 'ollama-optional',
    name: 'Ollama models',
    kind: 'optional-runtime',
    use: 'multi',
    detail: 'Optional plug-in hop in ARK Router — never required.',
    wired: true,
  },
  {
    id: 'gguf-local',
    name: 'GGUF + llama-cli',
    kind: 'local-weights',
    use: 'coding',
    detail: 'Drop .gguf into ARK Engine models folder, or install from Local AI (auto-fetches weights + llama-cli).',
    wired: true,
  },
  {
    id: 'github-models',
    name: 'GitHub Models',
    kind: 'free-key',
    use: 'coding',
    detail: 'Retired by GitHub (July 2026) — kept in catalog for history only.',
    wired: false,
    notes: 'Use Groq, Google AI Studio, or OpenRouter free routes instead.',
  },
  {
    id: 'google-ai-studio',
    name: 'Google AI Studio',
    kind: 'free-key',
    use: 'coding',
    detail: 'Gemini free tier API key — routed by ARK Router.',
    wired: true,
  },
  {
    id: 'groq-free',
    name: 'Groq',
    kind: 'free-key',
    use: 'coding',
    detail: 'Fast free-tier Llama — routed by ARK Router.',
    wired: true,
  },
  {
    id: 'openrouter-free',
    name: 'OpenRouter free routes',
    kind: 'free-key',
    use: 'coding',
    detail: 'Community free model routes — routed by ARK Router.',
    wired: true,
  },
  {
    id: 'huggingface-inference',
    name: 'Hugging Face Inference',
    kind: 'free-key',
    use: 'multi',
    detail: 'HF token for open chat/image endpoints.',
    wired: false,
    notes: 'Catalog listed; full image wiring next.',
  },
  {
    id: 'nvidia-nim-free',
    name: 'NVIDIA NIM free',
    kind: 'free-key',
    use: 'coding',
    detail: 'NIM / build.nvidia.com free endpoints when keyed.',
    wired: false,
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
