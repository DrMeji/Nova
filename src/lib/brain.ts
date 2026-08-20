/** ARK brain localhost API — backed by ARK Engine only. */

import { desktopRequest } from '@/lib/httpDesktop';
import { engineGenerate } from '@/lib/arkEngine';

import { refreshBrainUrl, getBrainUrl } from '@/lib/brainUrl';

export { getBrainUrl, refreshBrainUrl };

export const BRAIN_URL = 'http://127.0.0.1:8787';

async function brainAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const row = await window.arkDesktop?.brainTokenGet?.();
    if (row?.token) headers.Authorization = `Bearer ${row.token}`;
  } catch {
    /* dev without token */
  }
  return headers;
}

export async function probeBrain(): Promise<{
  ok: boolean;
  version?: string;
  enginePhase?: string;
  error?: string;
}> {
  try {
    const res = await desktopRequest(`${await refreshBrainUrl()}/health`, { method: 'GET' });
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

export type BrainMediaOpts = {
  mediaDurationSec?: number;
};

/** Prefer IPC engine when available; else brain HTTP; always ARK-owned. */
export async function brainGenerate(
  message: string,
  modelId?: string,
  kind?: 'image' | 'video' | 'chat' | 'coding',
  mediaOpts?: BrainMediaOpts,
): Promise<{
  reply: string;
  media?: { kind: string; dataUrl: string; path?: string; libraryId?: string; real?: boolean };
  modelName?: string;
  source?: string;
  streamed?: boolean;
  ipcFallback?: boolean;
}> {
  let ipcFailed = false;
  try {
    if (window.arkDesktop?.engineGenerate) {
      const result = await engineGenerate(message, modelId, kind, {
        mediaDurationSec: mediaOpts?.mediaDurationSec,
      });
      return {
        reply: result.reply,
        media: result.media,
        modelName: result.modelName,
        source: result.source,
      };
    }
  } catch (err) {
    ipcFailed = true;
    if (!window.arkDesktop?.engineGenerate) throw err;
  }

  const headers = await brainAuthHeaders();
  const base = await refreshBrainUrl();
  const res = await desktopRequest(`${base}/v1/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message, model: modelId, kind }),
  });
  if (!res.ok) {
    const errBody = res.data as { error?: string };
    throw new Error(errBody?.error || `Brain chat failed (${res.status})`);
  }
  const data = res.data as {
    ok?: boolean;
    error?: string;
    reply?: string;
    media?: { kind: string; dataUrl: string; path?: string; libraryId?: string; real?: boolean };
    modelName?: string;
    source?: string;
  };
  if (data.ok === false) {
    throw new Error(data.error || 'Brain generation failed');
  }
  const reply = data.reply?.trim();
  if (!reply) {
    throw new Error('Brain returned empty output');
  }
  return {
    reply,
    media: data.media,
    modelName: data.modelName,
    source: data.source,
    ipcFallback: ipcFailed,
  };
}

/** Stream GGUF tokens when desktop IPC is available. */
export async function brainGenerateStream(
  message: string,
  modelId: string | undefined,
  onChunk: (text: string) => void,
  kind?: 'image' | 'video' | 'chat' | 'coding',
) {
  let streamFailed = false;
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
    streamFailed = true;
  }
  const fallback = await brainGenerate(message, modelId, kind);
  return { ...fallback, streamed: false, streamFallback: streamFailed };
}

export async function brainChat(
  message: string,
  modelId?: string,
  kind?: 'image' | 'video' | 'chat' | 'coding',
): Promise<string> {
  const result = await brainGenerate(message, modelId, kind);
  return result.reply;
}
