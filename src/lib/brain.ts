/** ARK brain localhost API — backed by ARK Engine only. */

import { desktopRequest } from '@/lib/httpDesktop';
import { engineGenerate } from '@/lib/arkEngine';

export const BRAIN_URL = 'http://127.0.0.1:8787';

export async function probeBrain(): Promise<{
  ok: boolean;
  version?: string;
  enginePhase?: string;
  error?: string;
}> {
  try {
    const res = await desktopRequest(`${BRAIN_URL}/health`, { method: 'GET' });
    if (!res.ok) return { ok: false, error: `Brain API ${res.status}` };
    const data = res.data as {
      ok?: boolean;
      version?: string;
      engine?: { phase?: string };
    };
    return {
      ok: Boolean(data.ok),
      version: data.version,
      enginePhase: data.engine?.phase,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Brain offline' };
  }
}

/** Prefer IPC engine when available; else brain HTTP; always ARK-owned. */
export async function brainGenerate(
  message: string,
  modelId?: string,
  kind?: 'image' | 'video' | 'chat' | 'coding',
): Promise<{
  reply: string;
  media?: { kind: string; dataUrl: string; path?: string; libraryId?: string; real?: boolean };
  modelName?: string;
  source?: string;
  streamed?: boolean;
}> {
  try {
    if (window.arkDesktop?.engineGenerate) {
      const result = await engineGenerate(message, modelId, kind);
      return {
        reply: result.reply,
        media: result.media,
        modelName: result.modelName,
        source: result.source,
      };
    }
  } catch {
    /* fall through to HTTP brain */
  }

  const res = await desktopRequest(`${BRAIN_URL}/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, model: modelId, kind }),
  });
  if (!res.ok) throw new Error(`Brain chat failed (${res.status})`);
  const data = res.data as {
    reply?: string;
    media?: { kind: string; dataUrl: string; path?: string; libraryId?: string; real?: boolean };
    modelName?: string;
    source?: string;
  };
  return {
    reply: data.reply?.trim() || 'ARK brain had nothing to say.',
    media: data.media,
    modelName: data.modelName,
    source: data.source,
  };
}

/** Stream GGUF tokens when desktop IPC is available. */
export async function brainGenerateStream(
  message: string,
  modelId: string | undefined,
  onChunk: (text: string) => void,
  kind?: 'image' | 'video' | 'chat' | 'coding',
) {
  try {
    if (window.arkDesktop?.engineGenerateStream) {
      const { engineGenerateStream } = await import('@/lib/arkEngine');
      const result = await engineGenerateStream(message, modelId, onChunk, kind);
      return {
        reply: result.reply,
        media: result.media,
        modelName: result.modelName,
        source: result.source || 'ark-gguf',
        streamed: true,
      };
    }
  } catch {
    /* fall back */
  }
  return brainGenerate(message, modelId, kind);
}

export async function brainChat(
  message: string,
  modelId?: string,
  kind?: 'image' | 'video' | 'chat' | 'coding',
): Promise<string> {
  const result = await brainGenerate(message, modelId, kind);
  return result.reply;
}
