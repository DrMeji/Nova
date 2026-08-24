/**
 * Cloud source toggles on Models → Cloud AI.
 * Keys stay in the vault; these flags decide which sources Auto / Chat may use.
 */

import { getProviderApiKeys } from '@/lib/localPrefs';
import { isOllamaEnabled } from '@/lib/ollamaOptional';

const CLOUD_SOURCE_KEY = 'ark:cloud-sources';

export const NO_KEY_PROVIDER_IDS = new Set(['pollinations', 'ollama']);

export const PROVIDER_NAME_TO_ID: Record<string, string> = {
  OpenAI: 'openai',
  Anthropic: 'anthropic',
  Google: 'google',
  Groq: 'groq',
  OpenRouter: 'openrouter',
  'Hugging Face': 'huggingface',
  NVIDIA: 'nvidia',
  Together: 'together',
  'Together AI': 'together',
  Fireworks: 'fireworks',
  'Fireworks AI': 'fireworks',
  DeepSeek: 'deepseek',
  Mistral: 'mistral',
  Cerebras: 'cerebras',
  SambaNova: 'sambanova',
  Perplexity: 'perplexity',
  xAI: 'xai',
  XAI: 'xai',
  Pollinations: 'pollinations',
  Ollama: 'ollama',
  'GitHub Models': 'github-models',
};

type CloudSourceState = {
  /** Providers the user turned off (the key can still be saved). */
  disconnected: string[];
  /** No-key sources the user turned on (Pollinations). */
  extraOn: string[];
  /** Cloud catalog rows enabled for Chat. null = every live model for connected providers. */
  enabledModels: string[] | null;
};

function readState(): CloudSourceState {
  try {
    const raw = localStorage.getItem(CLOUD_SOURCE_KEY);
    if (!raw) return { disconnected: [], extraOn: [], enabledModels: null };
    const parsed = JSON.parse(raw) as Partial<CloudSourceState>;
    return {
      disconnected: Array.isArray(parsed.disconnected) ? parsed.disconnected.map(String) : [],
      extraOn: Array.isArray(parsed.extraOn) ? parsed.extraOn.map(String) : [],
      enabledModels: Array.isArray(parsed.enabledModels) ? parsed.enabledModels.map(String) : null,
    };
  } catch {
    return { disconnected: [], extraOn: [], enabledModels: null };
  }
}

function writeState(next: CloudSourceState) {
  try {
    localStorage.setItem(CLOUD_SOURCE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('ark:cloud-sources-changed'));
  } catch {
    /* ignore */
  }
}

export function providerIdFromName(name: string): string | null {
  return PROVIDER_NAME_TO_ID[name] || null;
}

export function providerNeedsKey(providerId: string) {
  return !NO_KEY_PROVIDER_IDS.has(providerId) && providerId !== 'github-models';
}

/** True when Chat Auto may call this provider. */
export function isCloudProviderEnabled(providerId: string): boolean {
  const state = readState();
  if (state.disconnected.includes(providerId)) return false;
  if (providerId === 'ollama') return isOllamaEnabled();
  if (NO_KEY_PROVIDER_IDS.has(providerId)) return state.extraOn.includes(providerId);
  return Boolean(getProviderApiKeys()[providerId]);
}

export function listConnectedProviderIds(): string[] {
  const ids = new Set<string>();
  for (const id of Object.keys(getProviderApiKeys())) {
    if (isCloudProviderEnabled(id)) ids.add(id);
  }
  for (const id of readState().extraOn) ids.add(id);
  if (isOllamaEnabled()) ids.add('ollama');
  return [...ids];
}

export function setCloudProviderEnabled(providerId: string, on: boolean) {
  const state = readState();
  const disconnected = new Set(state.disconnected);
  const extraOn = new Set(state.extraOn);
  if (on) {
    disconnected.delete(providerId);
    if (NO_KEY_PROVIDER_IDS.has(providerId)) extraOn.add(providerId);
  } else {
    extraOn.delete(providerId);
    disconnected.add(providerId);
  }
  writeState({
    ...state,
    disconnected: [...disconnected],
    extraOn: [...extraOn],
  });
}

export function isCloudModelEnabled(modelId: string, providerId: string | null, live: boolean) {
  if (!live || !providerId) return false;
  if (!isCloudProviderEnabled(providerId)) return false;
  const state = readState();
  if (state.enabledModels == null) return true;
  return state.enabledModels.includes(modelId);
}

/** currentlyOn = every model id that is checked right now (before this click). */
export function setCloudModelEnabled(modelId: string, on: boolean, currentlyOn: string[]) {
  const state = readState();
  const next = new Set(state.enabledModels ?? currentlyOn);
  if (on) next.add(modelId);
  else next.delete(modelId);
  writeState({ ...state, enabledModels: [...next] });
  return next;
}

export function addEnabledCloudModels(modelIds: string[], currentlyOn: string[]) {
  const state = readState();
  const next = new Set(state.enabledModels ?? currentlyOn);
  for (const id of modelIds) next.add(id);
  writeState({ ...state, enabledModels: [...next] });
  return next;
}

export function removeEnabledCloudModels(modelIds: string[], currentlyOn: string[]) {
  const state = readState();
  if (state.enabledModels == null && !currentlyOn.length) return new Set<string>();
  const next = new Set(state.enabledModels ?? currentlyOn);
  for (const id of modelIds) next.delete(id);
  writeState({ ...state, enabledModels: [...next] });
  return next;
}
