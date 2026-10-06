/**
 * Pick which NOVA Engine GGUF Auto should run.
 * Never selects Ollama. Engine ids only.
 * Keep ranking in sync with electron/novaModelRank.cjs (Lindsay / Engine).
 *
 * Adaptive: uses whatever coder GGUFs are ready + fit this PC (RAM/params),
 * not a single hardcoded “always 7B” path.
 */

import type { ChatIntent } from '@/lib/chatIntent';
import { isEngineDownloadable } from '@/lib/api';
import { parseParamsB } from '@/lib/gpuLimits';

/** Instruct / general chat. skip coder weights for “hello / what can you do”. */
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

/** Coding / build asks — quality order (largest create-safe first). */
export const CODER_ENGINE_RANK = [
  'qwen25-coder-14b',
  'qwen25-coder-7b',
  'deepseek-coder-v2-lite',
  'starcoder2-7b',
] as const;

/** Design / UI layout brains (LayoutContract hop) — prefer UI-specialist GGUFs. */
export const DESIGN_ENGINE_RANK = [
  'uigen-fx-4b',
  'qwendean-4b',
  'qwen25-14b',
  'qwen25-7b',
  'llama31-8b',
  'mistral-7b',
] as const;

/** Fast polish preference when the PC is mid-tier (still coder-only). */
export const CREATE_POLISH_CODER_RANK = [
  'qwen25-coder-14b',
  'qwen25-coder-7b',
  'deepseek-coder-v2-lite',
  'starcoder2-7b',
] as const;

const WEAK_CHAT = new Set(['qwen25-15b', 'gemma2-2b', 'phi3-mini']);

const MIN_RAM_GB: Record<string, number> = {
  'qwen25-coder-14b': 16,
  'qwen25-14b': 16,
  'qwen25-coder-7b': 10,
  'qwen25-7b': 10,
  'llama31-8b': 10,
  'mistral-7b': 10,
  'deepseek-r1-distill-8b': 10,
  'deepseek-coder-v2-lite': 12,
  'starcoder2-7b': 10,
  'uigen-fx-4b': 6,
  'llama32-3b': 6,
  'sd15-local': 8,
  'sdxl-turbo-local': 12,
  'flux-schnell-local': 18,
};

type EngineRow = { id?: string; status?: string; name?: string };

export function isCoderEngineId(id: string | undefined | null): boolean {
  const s = String(id || '');
  // Vision / VL packs must never be treated as craft coders.
  if (/\b(?:vl|vision|llava|moondream|minicpm[-_]?v|mmproj)\b/i.test(s)) return false;
  return /coder|starcoder|codestral|codellama|devstral|deepseek-coder/i.test(s);
}

/** UI / design-specialist GGUFs (not craft coders). */
export function isUiDesignEngineId(id: string | undefined | null): boolean {
  return /uigen|qwendean|ui[-_]?architect|frontend[-_]?ui/i.test(String(id || ''));
}

/** Prefer UI-specialist GGUFs for Design role; fall back to Instruct chats. */
export function rankedReadyDesignIds(
  models: EngineRow[] | undefined,
  ramGb = 8,
  maxCoderParamsB?: number | null,
): string[] {
  const ready = (models || [])
    .filter((m) => String(m.status || '') === 'ready')
    .map((m) => String(m.id || ''))
    .filter(Boolean)
    .filter((id) => fitsRam(id, ramGb));
  const specialists = ready.filter((id) => isUiDesignEngineId(id));
  const instruct = rankedReadyEngineIds(models, 'chat', ramGb, maxCoderParamsB)
    .filter((id) => !isCoderEngineId(id))
    .filter((id) => !/\b(?:vl|vision|llava|moondream|minicpm[-_]?v|mmproj|qwen2-vl)\b/i.test(id));
  const ordered: string[] = [];
  for (const id of DESIGN_ENGINE_RANK) {
    if (specialists.includes(id) || instruct.includes(id)) ordered.push(id);
  }
  for (const id of specialists) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  for (const id of instruct) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

function fitsRam(id: string, ramGb: number) {
  const need = MIN_RAM_GB[id];
  if (need == null) return true;
  return ramGb + 0.5 >= need;
}

function coderQualityScore(id: string): number {
  const params = parseParamsB(id);
  if (params != null) return params * 10;
  const idx = (CODER_ENGINE_RANK as readonly string[]).indexOf(id);
  if (idx >= 0) return 100 - idx;
  return 1;
}

export function isWeakChatBrain(id: string | undefined): boolean {
  if (!id) return true;
  return WEAK_CHAT.has(id);
}

/** Ready coder ids on disk that fit this RAM, largest / best first. */
export function rankedReadyCoderIds(
  models: EngineRow[] | undefined,
  ramGb = 8,
  maxParamsB?: number | null,
): string[] {
  const readyRows = (models || []).filter((m) =>
    m.status === 'ready'
    && m.id
    && m.id !== 'NOVA-core'
    && !String(m.id).includes('image')
    && !String(m.id).includes('video')
    && !String(m.id).startsWith('sd')
    && m.id !== 'flux-schnell-local',
  );
  const ready = readyRows.map((m) => String(m.id)).filter((id) => isCoderEngineId(id) && fitsRam(id, ramGb));
  const capped = typeof maxParamsB === 'number' && maxParamsB > 0
    ? ready.filter((id) => {
      const p = parseParamsB(id);
      return p == null || p <= maxParamsB + 0.01;
    })
    : ready;

  const known = (CODER_ENGINE_RANK as readonly string[]).filter((id) => capped.includes(id));
  const extras = capped
    .filter((id) => !(CODER_ENGINE_RANK as readonly string[]).includes(id))
    .sort((a, b) => coderQualityScore(b) - coderQualityScore(a));
  return [...known, ...extras];
}

export function rankedReadyEngineIds(
  models: EngineRow[] | undefined,
  intent: ChatIntent,
  ramGb = 8,
  maxCoderParamsB?: number | null,
): string[] {
  const ready = new Set(
    (models || [])
      .filter(m =>
        m.status === 'ready'
        && m.id
        && m.id !== 'NOVA-core'
        && m.id !== 'NOVA-image-core'
        && m.id !== 'NOVA-video-core'
        && !String(m.id).includes('image')
        && !String(m.id).includes('video')
        && !String(m.id).startsWith('sd')
        && m.id !== 'flux-schnell-local'
        // Vision / mmproj packs are never chat or coding engines.
        && !/\b(?:vl|vision|llava|moondream|minicpm[-_]?v|mmproj|qwen2-vl|qwen2\.5-vl)\b/i.test(String(m.id)),
      )
      .map(m => String(m.id)),
  );
  if (!ready.size) return [];

  if (intent === 'coding') {
    return rankedReadyCoderIds([...ready].map((id) => ({ id, status: 'ready' })), ramGb, maxCoderParamsB);
  }

  const ordered: string[] = [];
  for (const id of CHAT_ENGINE_RANK) {
    if (!ready.has(id)) continue;
    if (!fitsRam(id, ramGb)) continue;
    ordered.push(id);
  }
  // Chat never appends coder GGUFs — those are build-only and cause freezey mid-chat switches.
  for (const id of ready) {
    if (ordered.includes(id)) continue;
    if (isCoderEngineId(id)) continue;
    if (!fitsRam(id, ramGb)) continue;
    ordered.push(id);
  }
  return ordered.length ? ordered : [...ready].filter((id) => !isCoderEngineId(id));
}

export function pickReadyEngineId(
  models: EngineRow[] | undefined,
  intent: ChatIntent,
  ramGb = 8,
  maxCoderParamsB?: number | null,
): string | undefined {
  return rankedReadyEngineIds(models, intent, ramGb, maxCoderParamsB)[0];
}

/**
 * Pick the best ready coder for this PC.
 * - quality: largest that fits (builds / edits)
 * - fast: prefer mid-size (7B–14B) for snappy create polish on mid PCs; never hops above create-safe 14B
 */
export function pickBestReadyCoder(
  models: EngineRow[] | undefined,
  opts?: {
    ramGb?: number;
    maxParamsB?: number | null;
    preferSelectedId?: string | null;
    mode?: 'quality' | 'fast';
  },
): { id: string; name: string } | null {
  const ramGb = opts?.ramGb ?? 8;
  const maxParamsB = opts?.maxParamsB;
  const mode = opts?.mode || 'quality';
  const readyRows = (models || []).filter((m) => m.status === 'ready' && m.id);
  const nameOf = (id: string) => readyRows.find((m) => m.id === id)?.name || id;

  const selected = String(opts?.preferSelectedId || '').trim();
  if (selected && selected !== 'NOVA-auto' && isCoderEngineId(selected)) {
    const hit = readyRows.find((m) => m.id === selected);
    if (hit && fitsRam(selected, ramGb)) {
      const p = parseParamsB(selected);
      if (maxParamsB == null || maxParamsB <= 0 || p == null || p <= maxParamsB + 0.01) {
        return { id: selected, name: nameOf(selected) };
      }
    }
  }

  const ranked = rankedReadyCoderIds(models, ramGb, maxParamsB);
  if (!ranked.length) return null;

  if (mode === 'fast') {
    // Snappy polish: prefer the smallest mid-tier coder that still fits (7B before 14B).
    // Strong PCs use mode=quality instead (largest first).
    const mid = [...ranked].reverse().find((id) => {
      const p = parseParamsB(id);
      return p != null && p >= 6 && p <= 16;
    });
    if (mid) return { id: mid, name: nameOf(mid) };
    for (const id of CREATE_POLISH_CODER_RANK) {
      if (ranked.includes(id)) return { id, name: nameOf(id) };
    }
  }

  // quality — largest first (rankedReadyCoderIds already orders that way)
  return { id: ranked[0], name: nameOf(ranked[0]) };
}

/** Prefer a ready local coder GGUF from the chat model menu (id/name rows). */
export function pickLocalCoderModel(
  models: Array<{ id: string; name: string; source?: string }>,
): { id: string; name: string } | null {
  const local = models.filter((m) => !m.source || m.source === 'local');
  const asRows = local.map((m) => ({ id: m.id, name: m.name, status: 'ready' }));
  return pickBestReadyCoder(asRows, { ramGb: 64, mode: 'quality' });
}

/**
 * Create UI polish: always the best ready coder that fits (14B+ when ready).
 * Never stick on a weaker pinned coder (e.g. 7B) when a stronger one is ready.
 * Pill + engine must match what status announces.
 */
export function pickReadyCreatePolishCoder(
  models: EngineRow[] | undefined,
  opts?: {
    preferSelectedId?: string | null;
    ramGb?: number;
    maxParamsB?: number | null;
  },
): { id: string; name: string } | null {
  const maxParamsB = opts?.maxParamsB;
  const ramGb = opts?.ramGb ?? 16;
  const readyHas14 = (models || []).some((m) => {
    if (m.status !== 'ready' || !m.id) return false;
    const p = parseParamsB(m.id);
    return p != null && p >= 13.5 && /coder/i.test(String(m.id));
  });
  const cappedMax = (maxParamsB == null || maxParamsB <= 0)
    ? (readyHas14 ? 14 : maxParamsB)
    : maxParamsB;
  const mode: 'quality' | 'fast' =
    (typeof cappedMax === 'number' && cappedMax >= 14) || (readyHas14 && (maxParamsB == null || maxParamsB <= 0))
      ? 'quality'
      : 'fast';

  // Explicit pin (chat picker / ladder) always wins when ready — never upgrade to 32B.
  // Include UIGEN / design GGUFs — ladder stress pins them for create craft.
  const selected = String(opts?.preferSelectedId || '').trim();
  if (
    selected
    && selected !== 'NOVA-auto'
    && (isCoderEngineId(selected) || isUiDesignEngineId(selected))
  ) {
    const readyRows = (models || []).filter((m) => m.status === 'ready' && m.id);
    const hit = readyRows.find((m) => m.id === selected);
    if (hit && fitsRam(selected, ramGb)) {
      const p = parseParamsB(selected);
      // Design / small pins ignore coder param caps (ladder / manual stress).
      if (isUiDesignEngineId(selected) || cappedMax == null || cappedMax <= 0 || p == null || p <= cappedMax + 0.01) {
        return { id: selected, name: String(hit.name || selected) };
      }
    }
  }

  const best = pickBestReadyCoder(models, {
    preferSelectedId: undefined,
    ramGb,
    maxParamsB: cappedMax,
    mode,
  });
  return best;
}

const IMAGE_BACKUP_RANK = ['sd15-local', 'sdxl-turbo-local', 'flux-schnell-local'] as const;

/** Ready GGUF to hot-swap onto when the current thread is near context capacity. */
export function pickSuccessorReadyId(
  models: EngineRow[] | undefined,
  kind: 'chat' | 'coding' | 'image' | 'video',
  ramGb = 8,
  currentId?: string,
): string | undefined {
  if (kind === 'image' || kind === 'video') {
    const ready = new Set(
      (models || []).filter(m => m.status === 'ready' && m.id).map(m => String(m.id)),
    );
    return IMAGE_BACKUP_RANK.find(id => ready.has(id) && id !== currentId);
  }
  const intent: ChatIntent = kind === 'coding' ? 'coding' : 'chat';
  return rankedReadyEngineIds(models, intent, ramGb).find(id => id !== currentId);
}

/** Next Engine catalog brain to download when the current one is exhausted. */
export function pickNextBackupId(
  models: EngineRow[] | undefined,
  kind: 'chat' | 'coding' | 'image' | 'video',
  ramGb = 8,
  currentId?: string,
  maxParamsB?: number | null,
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
        ? [...CODER_ENGINE_RANK]
        : [...CHAT_ENGINE_RANK, 'llama32-3b', 'qwen25-15b'];

  for (const id of rank) {
    if (blocked.has(id)) continue;
    if (!fitsRam(id, ramGb)) continue;
    if (!isEngineDownloadable(id)) continue;
    if (typeof maxParamsB === 'number' && maxParamsB > 0) {
      const p = parseParamsB(id);
      if (p != null && p > maxParamsB) continue;
    }
    return id;
  }
  return undefined;
}
