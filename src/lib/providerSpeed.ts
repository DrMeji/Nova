/** Latency/health probes for connected cloud API keys (not GGUF download speed). */

import { desktopRequest } from '@/lib/httpDesktop';
import { getProviderApiKeys } from '@/lib/localPrefs';

export type ProviderProbe = {
  id: string;
  name: string;
  ok: boolean;
  ms: number;
  status?: number;
  error?: string;
};

type ProbeSpec = {
  name: string;
  run: (key: string) => Promise<{ ok: boolean; status: number }>;
};

const API_SPEED_STORE_KEY = 'NOVA:api-speed';

function openaiModels(url: string, extraHeaders?: Record<string, string>) {
  return async (key: string) => {
    const res = await desktopRequest(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        ...extraHeaders,
      },
    });
    return { ok: res.ok, status: res.status };
  };
}

const PROBES: Record<string, ProbeSpec> = {
  groq: {
    name: 'Groq',
    run: openaiModels('https://api.groq.com/openai/v1/models'),
  },
  openrouter: {
    name: 'OpenRouter',
    run: openaiModels('https://openrouter.ai/api/v1/models', {
      'HTTP-Referer': 'https://nova.local',
      'X-Title': 'NOVA',
    }),
  },
  openai: {
    name: 'OpenAI',
    run: openaiModels('https://api.openai.com/v1/models'),
  },
  huggingface: {
    name: 'Hugging Face',
    run: openaiModels('https://router.huggingface.co/v1/models'),
  },
  nvidia: {
    name: 'NVIDIA NIM',
    run: openaiModels('https://integrate.api.nvidia.com/v1/models'),
  },
  together: {
    name: 'Together AI',
    run: openaiModels('https://api.together.xyz/v1/models'),
  },
  fireworks: {
    name: 'Fireworks AI',
    run: openaiModels('https://api.fireworks.ai/inference/v1/models'),
  },
  deepseek: {
    name: 'DeepSeek',
    run: openaiModels('https://api.deepseek.com/models'),
  },
  mistral: {
    name: 'Mistral',
    run: openaiModels('https://api.mistral.ai/v1/models'),
  },
  cerebras: {
    name: 'Cerebras',
    run: openaiModels('https://api.cerebras.ai/v1/models'),
  },
  sambanova: {
    name: 'SambaNova',
    run: openaiModels('https://api.sambanova.ai/v1/models'),
  },
  perplexity: {
    name: 'Perplexity',
    run: openaiModels('https://api.perplexity.ai/models'),
  },
  xai: {
    name: 'xAI',
    run: openaiModels('https://api.x.ai/v1/models'),
  },
  google: {
    name: 'Google AI Studio',
    run: async (key) => {
      const res = await desktopRequest(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
        { method: 'GET' },
      );
      return { ok: res.ok, status: res.status };
    },
  },
  anthropic: {
    name: 'Anthropic',
    run: async (key) => {
      const res = await desktopRequest('https://api.anthropic.com/v1/models', {
        method: 'GET',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
      });
      return { ok: res.ok, status: res.status };
    },
  },
  ollama: {
    name: 'Ollama',
    run: async () => {
      const res = await desktopRequest('http://127.0.0.1:11434/api/tags', { method: 'GET' });
      return { ok: res.ok, status: res.status };
    },
  },
};

function displayName(id: string) {
  return PROBES[id]?.name || id;
}

export function formatMs(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return 'n/a';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function loadSavedApiProbes(): { at: number; results: ProviderProbe[] } | null {
  try {
    const raw = localStorage.getItem(API_SPEED_STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; results?: ProviderProbe[] };
    if (!parsed?.results || !Array.isArray(parsed.results)) return null;
    return { at: parsed.at ?? 0, results: parsed.results };
  } catch {
    return null;
  }
}

export function saveApiProbes(results: ProviderProbe[]) {
  try {
    localStorage.setItem(API_SPEED_STORE_KEY, JSON.stringify({ at: Date.now(), results }));
  } catch {
    /* ignore */
  }
}

export async function probeProviderKey(id: string, key: string): Promise<ProviderProbe> {
  return probeOne(id, key);
}

async function probeOne(id: string, key: string): Promise<ProviderProbe> {
  const started = performance.now();
  if (id === 'github-models') {
    return {
      id,
      name: 'GitHub Models',
      ok: false,
      ms: 0,
      error: 'Retired by GitHub',
    };
  }
  const spec = PROBES[id];
  if (!spec) {
    return {
      id,
      name: displayName(id),
      ok: false,
      ms: 0,
      error: 'No probe for this source',
    };
  }
  try {
    const res = await spec.run(key);
    const ms = Math.round(performance.now() - started);
    return {
      id,
      name: spec.name,
      ok: res.ok,
      ms,
      status: res.status,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      id,
      name: spec.name,
      ok: false,
      ms: Math.round(performance.now() - started),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Ping every saved API key. Does not download model files or spend chat tokens. */
export async function probeConnectedApis(): Promise<ProviderProbe[]> {
  const keys = getProviderApiKeys();
  const entries = Object.entries(keys).filter(
    ([id, value]) => Boolean(value?.trim()) && !id.startsWith('plugin:'),
  );
  const results = await Promise.all(entries.map(([id, key]) => probeOne(id, key)));
  results.sort((a, b) => a.name.localeCompare(b.name));
  saveApiProbes(results);
  return results;
}
