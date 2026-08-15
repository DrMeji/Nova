/** Cloud chat completions using keys stored in local prefs. */

import { getProviderApiKeys } from '@/lib/localPrefs';
import { apiErrorMessage, desktopRequest } from '@/lib/httpDesktop';
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
  run: (key: string, history: RouterChatTurn[], model: string) => Promise<string | null>;
};

function isRateLimited(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b429\b|rate limit|quota|too many requests/i.test(msg);
}

function ensureHistory(history: RouterChatTurn[] | undefined, message: string): RouterChatTurn[] {
  if (history && history.length > 0) return history;
  return [{ role: 'user', content: message }];
}

async function openaiCompatible(
  url: string,
  key: string,
  model: string,
  history: RouterChatTurn[],
  extraHeaders?: Record<string, string>,
): Promise<string | null> {
  const system = routerSystemPrompt(history);
  const res = await desktopRequest(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        ...history.map(t => ({ role: t.role, content: t.content })),
      ],
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Cloud chat error'));
  const data = res.data as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() || null;
}

async function chatOpenAI(key: string, history: RouterChatTurn[], model: string) {
  return openaiCompatible('https://api.openai.com/v1/chat/completions', key, model, history);
}

async function chatAnthropic(key: string, history: RouterChatTurn[], model: string) {
  const system = routerSystemPrompt(history);
  // Anthropic requires alternating user/assistant and must start with user.
  const messages = history.map(t => ({
    role: t.role === 'assistant' ? 'assistant' : 'user',
    content: t.content,
  }));
  const res = await desktopRequest('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system,
      messages,
    }),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Anthropic error'));
  const data = res.data as { content?: { type: string; text?: string }[] };
  return data.content?.find(c => c.type === 'text')?.text?.trim() || null;
}

async function chatOpenRouter(key: string, history: RouterChatTurn[], model: string) {
  return openaiCompatible('https://openrouter.ai/api/v1/chat/completions', key, model, history, {
    'HTTP-Referer': 'https://ark.local',
    'X-Title': 'ARK',
  });
}

async function chatGroq(key: string, history: RouterChatTurn[], model: string) {
  return openaiCompatible('https://api.groq.com/openai/v1/chat/completions', key, model, history);
}

async function chatGoogle(key: string, history: RouterChatTurn[], model: string) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
    + `?key=${encodeURIComponent(key)}`;
  const contents = history.map(t => ({
    role: t.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: t.content }],
  }));
  const res = await desktopRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: routerSystemPrompt(history) }] },
      contents,
    }),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Google AI error'));
  const data = res.data as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  return text.trim() || null;
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
  return null;
}

async function runAttempt(
  attempt: ProviderAttempt,
  history: RouterChatTurn[],
  keys: Record<string, string>,
): Promise<CloudChatHit | null> {
  const key = keys[attempt.id];
  if (!key) return null;
  try {
    const reply = await attempt.run(key, history, attempt.model);
    if (!reply) return null;
    return {
      reply,
      provider: attempt.label,
      model: attempt.model,
      cost: attempt.cost,
    };
  } catch {
    // Rate limit or any error — skip so the router can try the next host
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
): Promise<CloudChatHit | null> {
  const keys = getProviderApiKeys();
  const turns = ensureHistory(history, message);
  for (const attempt of FREE_KEY_PROVIDERS) {
    attempted.push(attempt.label);
    const hit = await runAttempt(attempt, turns, keys);
    if (hit) return hit;
  }
  return null;
}

/** Paid cascade: OpenAI → Anthropic → OpenRouter paid model. */
export async function cloudChatPaidKeys(
  message: string,
  attempted: string[],
  history?: RouterChatTurn[],
): Promise<CloudChatHit | null> {
  const keys = getProviderApiKeys();
  const turns = ensureHistory(history, message);
  for (const attempt of PAID_PROVIDERS) {
    attempted.push(attempt.label);
    const hit = await runAttempt(attempt, turns, keys);
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
}): Promise<CloudChatHit | null> {
  const mapped = mapPreferred(opts.modelId, opts.modelName);
  const keys = getProviderApiKeys();
  const history = ensureHistory(opts.history, opts.message);
  if (mapped) {
    opts.attempted.push(mapped.label);
    const hit = await runAttempt(mapped, history, keys);
    if (hit) return hit;
    if (!opts.cascade) return null;
  }
  if (!opts.cascade) return null;
  return (
    (await cloudChatFreeKeys(opts.message, opts.attempted, history))
    || (await cloudChatPaidKeys(opts.message, opts.attempted, history))
  );
}

export function hasAnyCloudChatKey() {
  const keys = getProviderApiKeys();
  return Boolean(keys.groq || keys.google || keys.openrouter || keys.openai || keys.anthropic);
}

/** Exported for callers that only have a single string today. */
export function cloudLatestFromHistory(history: RouterChatTurn[] | undefined, message: string) {
  return latestUserMessage(history || [], message);
}
