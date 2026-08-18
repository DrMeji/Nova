/**
 * Pick which ARK Engine GGUF Auto should run.
 * Never selects Ollama — Engine ids only.
 * Keep ranking in sync with electron/arkModelRank.cjs (Lindsay / Engine).
 */

import type { ChatIntent } from '@/lib/chatIntent';
import { isEngineDownloadable } from '@/lib/api';

/** Instruct / general chat — skip coder weights for “hello / what can you do”. */
export const CHAT_ENGINE_RANK = [
  'qwen25-14b',
  'llama31-8b',
  'qwen25-7b',
  'mistral-7b',
  'deepseek-r1-distill-8b',
  'llama32-3b',
  'phi3-mini',
  'gemma2-2b',
  'qwen25-15b',
] as const;

/** Coding / build asks. */
export const CODER_ENGINE_RANK = [
  'qwen25-coder-32b',
  'qwen25-coder-14b',
  'qwen25-coder-7b',
  'deepseek-coder-v2-lite',
  'starcoder2-7b',
] as const;

const WEAK_CHAT = new Set(['qwen25-15b', 'gemma2-2b', 'phi3-mini']);

const MIN_RAM_GB: Record<string, number> = {
  'qwen25-coder-32b': 28,
  'qwen25-coder-14b': 16,
  'qwen25-14b': 16,
  'qwen25-coder-7b': 10,
  'qwen25-7b': 10,
  'llama31-8b': 10,
  'mistral-7b': 10,
  'deepseek-r1-distill-8b': 10,
  'deepseek-coder-v2-lite': 12,
  'starcoder2-7b': 10,
  'llama32-3b': 6,
  'sd15-local': 8,
  'sdxl-turbo-local': 12,
  'flux-schnell-local': 18,
};

type EngineRow = { id?: string; status?: string };

function fitsRam(id: string, ramGb: number) {
  const need = MIN_RAM_GB[id];
  if (need == null) return true;
  return ramGb + 0.5 >= need;
}

export function isWeakChatBrain(id: string | undefined): boolean {
  if (!id) return true;
  return WEAK_CHAT.has(id);
}

export function rankedReadyEngineIds(
  models: EngineRow[] | undefined,
  intent: ChatIntent,
  ramGb = 8,
): string[] {
  const ready = new Set(
    (models || [])
      .filter(m =>
        m.status === 'ready'
        && m.id
        && m.id !== 'ark-core'
        && m.id !== 'ark-image-core'
        && m.id !== 'ark-video-core'
        && !String(m.id).includes('image')
        && !String(m.id).includes('video')
        && !String(m.id).startsWith('sd')
        && m.id !== 'flux-schnell-local',
      )
      .map(m => String(m.id)),
  );
  if (!ready.size) return [];

  const extraCoders = [...ready].filter(id =>
    /coder|starcoder|codestral|codellama|devstral|deepseek-coder/i.test(id)
    && !(CODER_ENGINE_RANK as readonly string[]).includes(id),
  );
  const rank: string[] =
    intent === 'coding'
      ? [...extraCoders, ...CODER_ENGINE_RANK, ...CHAT_ENGINE_RANK]
      : [...CHAT_ENGINE_RANK];

  const ordered: string[] = [];
  for (const id of rank) {
    if (!ready.has(id)) continue;
    if (!fitsRam(id, ramGb)) continue;
    ordered.push(id);
  }
  for (const id of ready) {
    if (ordered.includes(id)) continue;
    if (!fitsRam(id, ramGb)) continue;
    ordered.push(id);
  }
  return ordered.length ? ordered : [...ready];
}

export function pickReadyEngineId(
  models: EngineRow[] | undefined,
  intent: ChatIntent,
  ramGb = 8,
): string | undefined {
  return rankedReadyEngineIds(models, intent, ramGb)[0];
}

const IMAGE_BACKUP_RANK = ['sd15-local', 'sdxl-turbo-local', 'flux-schnell-local'] as const;

/** Next Engine catalog brain to download when the current one is exhausted. */
export function pickNextBackupId(
  models: EngineRow[] | undefined,
  kind: 'chat' | 'coding' | 'image' | 'video',
  ramGb = 8,
  currentId?: string,
): string | undefined {
  const blocked = new Set(
    (models || [])
      .filter(m => m.status === 'ready' || m.status === 'downloading')
      .map(m => String(m.id || ''))
      .filter(Boolean),
  );
  if (currentId) blocked.add(currentId);

  const rank: string[] =
    kind === 'image' || kind === 'video'
      ? [...IMAGE_BACKUP_RANK]
      : kind === 'coding'
        ? [...CODER_ENGINE_RANK, ...CHAT_ENGINE_RANK]
        : [...CHAT_ENGINE_RANK, 'llama32-3b', 'qwen25-15b'];

  for (const id of rank) {
    if (blocked.has(id)) continue;
    if (!fitsRam(id, ramGb)) continue;
    if (!isEngineDownloadable(id)) continue;
    return id;
  }
  return undefined;
}
