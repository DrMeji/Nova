/** Cloud chat completions using keys stored in local prefs. */

import { getProviderApiKeys } from '@/lib/localPrefs';
import { isCloudProviderEnabled } from '@/lib/cloudSources';
import { apiErrorMessage, desktopRequest, desktopStreamRequest } from '@/lib/httpDesktop';
import {
  latestUserMessage,
  routerSystemPrompt,
  type RouterChatTurn,
} from '@/lib/chatHistory';

export type CloudChatHit = {
  reply: string;
  provider: string;
  model: string;
  /** free-key vs paid — helps the router label tiers */
  cost: 'free-key' | 'paid';
};

type ProviderAttempt = {
  id: string;
  label: string;
  cost: 'free-key' | 'paid';
  model: string;
  run: (
    key: string,
    history: RouterChatTurn[],
    model: string,
    onChunk?: (text: string) => void,
  ) => Promise<string | null>;
};

function isRateLimited(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b429\b|rate limit|quota|too many requests/i.test(msg);
}

function ensureHistory(history: RouterChatTurn[] | undefined, message: string): RouterChatTurn[] {
  if (history && history.length > 0) return history;
  return [{ role: 'user', content: message }];
}

function historyHasVision(history: RouterChatTurn[]): boolean {
  return history.some(t => Boolean(t.images?.length));
}

function lastUserIndex(history: RouterChatTurn[]): number {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') return i;
  }
  return -1;
}

function openaiTurnContent(t: RouterChatTurn, attachVision: boolean) {
  if (!attachVision || !t.images?.length) return t.content;
  return [
    { type: 'text' as const, text: t.content },
    ...t.images.map(img => ({
      type: 'image_url' as const,
      image_url: { url: `data:${img.mime};base64,${img.data}` },
    })),
  ];
}

async function openaiCompatible(
  url: string,
  key: string,
  model: string,
  history: RouterChatTurn[],
  extraHeaders?: Record<string, string>,
  onChunk?: (text: string) => void,
  providerKeyId?: string,
): Promise<string | null> {
  const system = routerSystemPrompt(history);
  const visionAt = lastUserIndex(history);
  const messages = [
    { role: 'system', content: system },
    ...history.map((t, i) => ({
      role: t.role,
      content: openaiTurnContent(t, i === visionAt),
    })),
  ];

  const useMainAuth = Boolean(providerKeyId && window.arkDesktop?.httpRequest);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  if (!useMainAuth && key) headers.Authorization = `Bearer ${key}`;
  const authOpts = useMainAuth ? { authProviderId: providerKeyId } : {};

  if (onChunk) {
    const streamed = await desktopStreamRequest(
      url,
      {
        method: 'POST',
        headers,
        ...authOpts,
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 4096,
          stream: true,
        }),
      },
      onChunk,
    );
    if (!streamed.ok) throw new Error(streamed.error || 'Cloud stream error');
    return streamed.text.trim() || null;
  }

  const res = await desktopRequest(url, {
    method: 'POST',
    headers,
    ...authOpts,
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Cloud chat error'));
  const data = res.data as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() || null;
}

async function chatOpenAI(
  key: string,
  history: RouterChatTurn[],
  model: string,
  onChunk?: (text: string) => void,
) {
  return openaiCompatible('https://api.openai.com/v1/chat/completions', key, model, history, undefined, onChunk, 'openai');
}

function anthropicTurnContent(t: RouterChatTurn, attachVision: boolean) {
  if (!attachVision || !t.images?.length) return t.content;
  return [
    { type: 'text' as const, text: t.content },
    ...t.images.map(img => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: img.mime || 'image/jpeg',
        data: img.data,
      },
    })),
  ];
}

async function chatAnthropic(
  key: string,
  history: RouterChatTurn[],
  model: string,
  onChunk?: (text: string) => void,
) {
  const system = routerSystemPrompt(history);
  const visionAt = lastUserIndex(history);
  const messages = history.map((t, i) => ({
    role: t.role === 'assistant' ? 'assistant' : 'user',
    content: anthropicTurnContent(t, i === visionAt),
  }));
  const useMainAuth = Boolean(window.arkDesktop?.httpRequest);
  const headers: Record<string, string> = {
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  };
  if (!useMainAuth) headers['x-api-key'] = key;
  const authOpts = useMainAuth ? { authProviderId: 'anthropic' } : {};
  const body = {
    model,
    max_tokens: 4096,
    system,
    messages,
  };

  if (onChunk) {
    const streamed = await desktopStreamRequest(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers,
        ...authOpts,
        body: JSON.stringify({ ...body, stream: true }),
      },
      onChunk,
    );
    if (!streamed.ok) throw new Error(streamed.error || 'Anthropic stream error');
    return streamed.text.trim() || null;
  }

  const res = await desktopRequest('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    ...authOpts,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Anthropic error'));
  const data = res.data as { content?: { type: string; text?: string }[] };
  return data.content?.find(c => c.type === 'text')?.text?.trim() || null;
}

async function chatOpenRouter(
  key: string,
  history: RouterChatTurn[],
  model: string,
  onChunk?: (text: string) => void,
) {
  return openaiCompatible('https://openrouter.ai/api/v1/chat/completions', key, model, history, {
    'HTTP-Referer': 'https://ark.local',
    'X-Title': 'ARK',
  }, onChunk, 'openrouter');
}

async function chatGroq(
  key: string,
  history: RouterChatTurn[],
  model: string,
  onChunk?: (text: string) => void,
) {
  return openaiCompatible('https://api.groq.com/openai/v1/chat/completions', key, model, history, undefined, onChunk, 'groq');
}

async function chatGoogle(
  key: string,
  history: RouterChatTurn[],
  model: string,
  onChunk?: (text: string) => void,
) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
    + `?key=${encodeURIComponent(key)}`;
  const lastVision = [...history].reverse().find(t => t.role === 'user')?.images;
  const contents = history.map((t, i) => {
    const isLastUser = t.role === 'user' && i === history.length - 1 && lastVision?.length;
    const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [
      { text: t.content },
    ];
    if (isLastUser && lastVision) {
      for (const img of lastVision) {
        parts.push({ inlineData: { mimeType: img.mime, data: img.data } });
      }
    }
    return {
      role: t.role === 'assistant' ? 'model' : 'user',
      parts,
    };
  });
  const payload = {
    systemInstruction: { parts: [{ text: routerSystemPrompt(history) }] },
    contents,
    generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
  };

  if (onChunk) {
    const streamUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent`
      + `?alt=sse&key=${encodeURIComponent(key)}`;
    const streamed = await desktopStreamRequest(
      streamUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      onChunk,
    );
    if (!streamed.ok) throw new Error(streamed.error || 'Google stream error');
    return streamed.text.trim() || null;
  }

  const res = await desktopRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Google AI error'));
  const data = res.data as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  return text.trim() || null;
}

/** Hugging Face Inference Providers (OpenAI-compatible router). */
async function chatHuggingFace(
  key: string,
  history: RouterChatTurn[],
  model: string,
  onChunk?: (text: string) => void,
) {
  return openaiCompatible(
    'https://router.huggingface.co/v1/chat/completions',
    key,
    model,
    history,
    undefined,
    onChunk,
    'huggingface',
  );
}

/** NVIDIA NIM / build.nvidia.com OpenAI-compatible endpoints. */
async function chatNvidia(
  key: string,
  history: RouterChatTurn[],
  model: string,
  onChunk?: (text: string) => void,
) {
  return openaiCompatible(
    'https://integrate.api.nvidia.com/v1/chat/completions',
    key,
    model,
    history,
    undefined,
    onChunk,
    'nvidia',
  );
}

async function chatTogether(
  key: string,
  history: RouterChatTurn[],
  model: string,
  onChunk?: (text: string) => void,
) {
  return openaiCompatible('https://api.together.xyz/v1/chat/completions', key, model, history, undefined, onChunk, 'together');
}

async function chatFireworks(
  key: string,
  history: RouterChatTurn[],
  model: string,
  onChunk?: (text: string) => void,
) {
  return openaiCompatible(
    'https://api.fireworks.ai/inference/v1/chat/completions',
    key,
    model,
    history,
    undefined,
    onChunk,
    'fireworks',
  );
}

async function chatDeepSeek(
  key: string,
  history: RouterChatTurn[],
  model: string,
  onChunk?: (text: string) => void,
) {
  return openaiCompatible('https://api.deepseek.com/chat/completions', key, model, history, undefined, onChunk, 'deepseek');
}

async function chatMistral(
  key: string,
  history: RouterChatTurn[],
  model: string,
  onChunk?: (text: string) => void,
) {
  return openaiCompatible('https://api.mistral.ai/v1/chat/completions', key, model, history, undefined, onChunk, 'mistral');
}

async function chatCerebras(
  key: string,
  history: RouterChatTurn[],
  model: string,
  onChunk?: (text: string) => void,
) {
  return openaiCompatible('https://api.cerebras.ai/v1/chat/completions', key, model, history, undefined, onChunk, 'cerebras');
}

async function chatSambaNova(
  key: string,
  history: RouterChatTurn[],
  model: string,
  onChunk?: (text: string) => void,
) {
  return openaiCompatible('https://api.sambanova.ai/v1/chat/completions', key, model, history, undefined, onChunk, 'sambanova');
}

/** Progressive word reveal — fallback when a provider has no SSE path (Google/Anthropic). */
export async function revealCloudReply(
  reply: string,
  onChunk?: (text: string) => void,
  signal?: { cancelled: boolean },
) {
  if (!onChunk || !reply) return;
  const parts = reply.match(/\S+\s*/g) || [reply];
  for (const part of parts) {
    if (signal?.cancelled) return;
    onChunk(part);
    await new Promise(r => setTimeout(r, 6));
  }
}

/** Free-key providers first, then paid — only entries with a stored key are attempted. */
const FREE_KEY_PROVIDERS: ProviderAttempt[] = [
  {
    id: 'groq',
    label: 'Groq',
    cost: 'free-key',
    model: 'llama-3.3-70b-versatile',
    run: chatGroq,
  },
  {
    id: 'google',
    label: 'Google AI Studio',
    cost: 'free-key',
    model: 'gemini-2.0-flash',
    run: chatGoogle,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter free',
    cost: 'free-key',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    run: chatOpenRouter,
  },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    cost: 'free-key',
    model: 'meta-llama/Llama-3.1-8B-Instruct',
    run: chatHuggingFace,
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    cost: 'free-key',
    model: 'meta/llama-3.1-8b-instruct',
    run: chatNvidia,
  },
  {
    id: 'together',
    label: 'Together AI',
    cost: 'free-key',
    model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    run: chatTogether,
  },
  {
    id: 'fireworks',
    label: 'Fireworks',
    cost: 'free-key',
    model: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
    run: chatFireworks,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    cost: 'free-key',
    model: 'deepseek-chat',
    run: chatDeepSeek,
  },
  {
    id: 'mistral',
    label: 'Mistral',
    cost: 'free-key',
    model: 'mistral-small-latest',
    run: chatMistral,
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    cost: 'free-key',
    model: 'llama3.1-8b',
    run: chatCerebras,
  },
  {
    id: 'sambanova',
    label: 'SambaNova',
    cost: 'free-key',
    model: 'Meta-Llama-3.1-8B-Instruct',
    run: chatSambaNova,
  },
];

const PAID_PROVIDERS: ProviderAttempt[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    cost: 'paid',
    model: 'gpt-4o-mini',
    run: chatOpenAI,
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    cost: 'paid',
    model: 'claude-3-5-haiku-latest',
    run: chatAnthropic,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    cost: 'paid',
    model: 'openai/gpt-4o-mini',
    run: chatOpenRouter,
  },
];

function mapPreferred(modelId: string, modelName: string): ProviderAttempt | null {
  const id = modelId.toLowerCase();
  const name = modelName.toLowerCase();

  if (id.includes('gemini') || name.includes('gemini') || id.includes('google')) {
    return {
      id: 'google',
      label: 'Google AI Studio',
      cost: 'free-key',
      model: 'gemini-2.0-flash',
      run: chatGoogle,
    };
  }
  if (id.includes('groq') || name.includes('groq') || id.includes('llama-3.3')) {
    return {
      id: 'groq',
      label: 'Groq',
      cost: 'free-key',
      model: 'llama-3.3-70b-versatile',
      run: chatGroq,
    };
  }
  if (id.includes('openrouter') || name.includes('openrouter')) {
    return {
      id: 'openrouter',
      label: 'OpenRouter',
      cost: 'free-key',
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      run: chatOpenRouter,
    };
  }
  if (id.includes('gpt') || id.includes('o3') || id.includes('o1') || name.includes('gpt') || id.includes('dall')) {
    return {
      id: 'openai',
      label: 'OpenAI',
      cost: 'paid',
      model: id.includes('mini') ? 'gpt-4o-mini' : 'gpt-4o',
      run: chatOpenAI,
    };
  }
  if (id.includes('claude') || name.includes('claude')) {
    return {
      id: 'anthropic',
      label: 'Anthropic',
      cost: 'paid',
      model: id.includes('haiku') ? 'claude-3-5-haiku-latest' : 'claude-3-5-sonnet-latest',
      run: chatAnthropic,
    };
  }
  if (id.includes('huggingface') || id.includes('hf-') || name.includes('hugging face') || name.includes('huggingface')) {
    return {
      id: 'huggingface',
      label: 'Hugging Face',
      cost: 'free-key',
      model: 'meta-llama/Llama-3.1-8B-Instruct',
      run: chatHuggingFace,
    };
  }
  if (id.includes('nvidia') || id.includes('nim') || name.includes('nvidia') || name.includes('nim')) {
    return {
      id: 'nvidia',
      label: 'NVIDIA NIM',
      cost: 'free-key',
      model: 'meta/llama-3.1-8b-instruct',
      run: chatNvidia,
    };
  }
  if (id.includes('together') || name.includes('together')) {
    return {
      id: 'together',
      label: 'Together AI',
      cost: 'free-key',
      model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
      run: chatTogether,
    };
  }
  if (id.includes('fireworks') || name.includes('fireworks')) {
    return {
      id: 'fireworks',
      label: 'Fireworks',
      cost: 'free-key',
      model: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
      run: chatFireworks,
    };
  }
  if (id.includes('deepseek') || name.includes('deepseek')) {
    return {
      id: 'deepseek',
      label: 'DeepSeek',
      cost: 'free-key',
      model: 'deepseek-chat',
      run: chatDeepSeek,
    };
  }
  if (id.includes('mistral') || id.includes('codestral') || name.includes('mistral') || name.includes('codestral')) {
    return {
      id: 'mistral',
      label: 'Mistral',
      cost: 'free-key',
      model: id.includes('codestral') ? 'codestral-latest' : 'mistral-small-latest',
      run: chatMistral,
    };
  }
  if (id.includes('cerebras') || name.includes('cerebras')) {
    return {
      id: 'cerebras',
      label: 'Cerebras',
      cost: 'free-key',
      model: 'llama3.1-8b',
      run: chatCerebras,
    };
  }
  if (id.includes('sambanova') || name.includes('sambanova') || name.includes('samba')) {
    return {
      id: 'sambanova',
      label: 'SambaNova',
      cost: 'free-key',
      model: 'Meta-Llama-3.1-8B-Instruct',
      run: chatSambaNova,
    };
  }
  return null;
}

async function runAttempt(
  attempt: ProviderAttempt,
  history: RouterChatTurn[],
  keys: Record<string, string>,
  onChunk?: (text: string) => void,
): Promise<CloudChatHit | null> {
  if (!isCloudProviderEnabled(attempt.id)) return null;
  const key = keys[attempt.id];
  if (!key) return null;
  try {
    const reply = await attempt.run(key, history, attempt.model, onChunk);
    if (!reply) return null;
    return {
      reply,
      provider: attempt.label,
      model: attempt.model,
      cost: attempt.cost,
    };
  } catch (err) {
    if (isRateLimited(err)) {
      void import('@/lib/arkHuntBootstrap').then(m =>
        m.installNextWhenCurrentRanOut({ kind: 'chat', reason: 'quota' }),
      ).catch(() => undefined);
    }
    return null;
  }
}

/** Try a specific picker model against its mapped provider (no cascade). */
export async function cloudChat(opts: {
  modelId: string;
  modelName: string;
  message: string;
  history?: RouterChatTurn[];
}): Promise<string | null> {
  const mapped = mapPreferred(opts.modelId, opts.modelName);
  if (!mapped) return null;
  const keys = getProviderApiKeys();
  const history = ensureHistory(opts.history, opts.message);
  const hit = await runAttempt(mapped, history, keys);
  return hit?.reply ?? null;
}

/** Free-key cascade: Groq → Google → OpenRouter free. */
export async function cloudChatFreeKeys(
  message: string,
  attempted: string[],
  history?: RouterChatTurn[],
  onChunk?: (text: string) => void,
  opts?: {
    acceptReply?: (reply: string) => boolean;
    onHop?: () => void;
  },
): Promise<CloudChatHit | null> {
  const keys = getProviderApiKeys();
  const turns = ensureHistory(history, message);
  const hasVision = turns.some(t => t.images?.length);
  const providers = hasVision
    ? [
        ...FREE_KEY_PROVIDERS.filter(p => p.id === 'google'),
        ...FREE_KEY_PROVIDERS.filter(p => p.id !== 'google'),
      ]
    : FREE_KEY_PROVIDERS;
  for (const attempt of providers) {
    if (attempted.length) opts?.onHop?.();
    attempted.push(attempt.label);
    const hit = await runAttempt(attempt, turns, keys, onChunk);
    if (!hit) continue;
    if (opts?.acceptReply && !opts.acceptReply(hit.reply)) continue;
    return hit;
  }
  return null;
}

/** Paid cascade: OpenAI → Anthropic → OpenRouter paid model. */
export async function cloudChatPaidKeys(
  message: string,
  attempted: string[],
  history?: RouterChatTurn[],
  onChunk?: (text: string) => void,
): Promise<CloudChatHit | null> {
  const keys = getProviderApiKeys();
  const turns = ensureHistory(history, message);
  const providers = historyHasVision(turns)
    ? [
        { ...PAID_PROVIDERS[0], model: 'gpt-4o' },
        { ...PAID_PROVIDERS[1], model: 'claude-3-5-sonnet-latest' },
        ...PAID_PROVIDERS.slice(2),
      ]
    : PAID_PROVIDERS;
  for (const attempt of providers) {
    attempted.push(attempt.label);
    const hit = await runAttempt(attempt, turns, keys, onChunk);
    if (hit) return hit;
  }
  return null;
}

/** Photo attach: send pixels to models that can see them (Gemini, GPT-4o, Claude). */
export async function cloudChatVisionKeys(
  message: string,
  attempted: string[],
  history: RouterChatTurn[],
  onChunk?: (text: string) => void,
): Promise<CloudChatHit | null> {
  const keys = getProviderApiKeys();
  const turns = ensureHistory(history, message);
  if (!historyHasVision(turns)) return null;
  const providers: ProviderAttempt[] = [
    {
      id: 'google',
      label: 'Google AI Studio',
      cost: 'free-key',
      model: 'gemini-2.0-flash',
      run: chatGoogle,
    },
    {
      id: 'openai',
      label: 'OpenAI',
      cost: 'paid',
      model: 'gpt-4o',
      run: chatOpenAI,
    },
    {
      id: 'anthropic',
      label: 'Anthropic',
      cost: 'paid',
      model: 'claude-3-5-sonnet-latest',
      run: chatAnthropic,
    },
  ];
  for (const attempt of providers) {
    attempted.push(`${attempt.label} vision`);
    const hit = await runAttempt(attempt, turns, keys, onChunk);
    if (hit) return hit;
  }
  return null;
}

/** Prefer a mapped cloud model first, then optional free/paid cascades. */
export async function cloudChatPreferredThenCascade(opts: {
  modelId: string;
  modelName: string;
  message: string;
  cascade: boolean;
  attempted: string[];
  history?: RouterChatTurn[];
  onChunk?: (text: string) => void;
}): Promise<CloudChatHit | null> {
  const mapped = mapPreferred(opts.modelId, opts.modelName);
  const keys = getProviderApiKeys();
  const history = ensureHistory(opts.history, opts.message);
  if (mapped) {
    opts.attempted.push(mapped.label);
    const hit = await runAttempt(mapped, history, keys, opts.onChunk);
    if (hit) return hit;
    if (!opts.cascade) return null;
  }
  if (!opts.cascade) return null;
  return (
    (await cloudChatFreeKeys(opts.message, opts.attempted, history, opts.onChunk))
    || (await cloudChatPaidKeys(opts.message, opts.attempted, history, opts.onChunk))
  );
}

export function hasAnyCloudChatKey() {
  const ids = [
    'groq', 'google', 'openrouter', 'huggingface', 'nvidia', 'together',
    'fireworks', 'deepseek', 'mistral', 'cerebras', 'sambanova', 'openai', 'anthropic',
  ];
  const keys = getProviderApiKeys();
  return ids.some(id => Boolean(keys[id]) && isCloudProviderEnabled(id));
}

/** Exported for callers that only have a single string today. */
export function cloudLatestFromHistory(history: RouterChatTurn[] | undefined, message: string) {
  return latestUserMessage(history || [], message);
}
