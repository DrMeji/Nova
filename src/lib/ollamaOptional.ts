/**
 * Optional Ollama bridge — never required for ARK.
 * Only used when the user opts in from Models.
 */

import { desktopRequest } from '@/lib/httpDesktop';

const FLAG_KEY = 'ark:ollama-enabled';
const OLLAMA = 'http://127.0.0.1:11434';

export type OllamaModel = { name: string; size?: number };

export function isOllamaEnabled() {
  return localStorage.getItem(FLAG_KEY) === '1';
}

export function setOllamaEnabled(on: boolean) {
  if (on) localStorage.setItem(FLAG_KEY, '1');
  else localStorage.removeItem(FLAG_KEY);
  window.dispatchEvent(new Event('ark:ollama-changed'));
}

export async function probeOllamaOptional(): Promise<{
  online: boolean;
  models: OllamaModel[];
  error?: string;
}> {
  try {
    const res = await desktopRequest(`${OLLAMA}/api/tags`, { method: 'GET' });
    if (!res.ok) return { online: false, models: [], error: `Ollama ${res.status}` };
    const data = res.data as { models?: OllamaModel[] };
    return { online: true, models: data.models ?? [] };
  } catch (err) {
    return {
      online: false,
      models: [],
      error: err instanceof Error ? err.message : 'Ollama not reachable',
    };
  }
}

export async function ollamaGenerate(model: string, prompt: string): Promise<string> {
  const res = await desktopRequest(`${OLLAMA}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama generate failed (${res.status})`);
  const data = res.data as { response?: string };
  return data.response?.trim() || '(empty Ollama response)';
}

/** Multi-turn when possible; falls back to packed generate prompt. */
export async function ollamaChat(
  model: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  packedFallback: string,
): Promise<string> {
  try {
    const res = await desktopRequest(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: history.map(t => ({ role: t.role, content: t.content })),
      }),
    });
    if (res.ok) {
      const data = res.data as { message?: { content?: string } };
      const text = data.message?.content?.trim();
      if (text) return text;
    }
  } catch {
    /* fall through to generate */
  }
  return ollamaGenerate(model, packedFallback);
}
