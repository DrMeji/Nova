/** Shared model list ordering: Default → General → Coding → …, then size high → low. */

export const DEFAULT_ENGINE_MODEL_ID = 'qwen25-15b';

const CATEGORY_RANK: Record<string, number> = {
  default: 0,
  general: 1,
  chat: 1,
  coding: 2,
  reasoning: 3,
  fast: 4,
  vision: 5,
  image: 6,
  video: 7,
};

export function parseSizeGb(size: string | number | undefined): number {
  if (typeof size === 'number') return size;
  if (!size) return 0;
  const m = String(size).match(/([\d.]+)\s*GB/i);
  if (m) return parseFloat(m[1]) || 0;
  const n = parseFloat(String(size));
  return Number.isFinite(n) ? n : 0;
}

export function categorySortRank(category: string | undefined, modelId?: string): number {
  if (modelId === DEFAULT_ENGINE_MODEL_ID) return 0;
  if (!category) return 50;
  return CATEGORY_RANK[category] ?? 40;
}

export function compareModelsByCategoryThenSizeDesc(
  a: { id?: string; category?: string; size?: string | number; sizeGb?: number },
  b: { id?: string; category?: string; size?: string | number; sizeGb?: number },
): number {
  const cat = categorySortRank(a.category, a.id) - categorySortRank(b.category, b.id);
  if (cat !== 0) return cat;
  const sizeA = a.sizeGb ?? parseSizeGb(a.size);
  const sizeB = b.sizeGb ?? parseSizeGb(b.size);
  return sizeB - sizeA;
}

export function sortModelsByCategoryThenSizeDesc<T extends {
  id?: string;
  category?: string;
  size?: string | number;
  sizeGb?: number;
}>(models: T[]): T[] {
  return [...models].sort(compareModelsByCategoryThenSizeDesc);
}

/** Category section order for Local AI / Models tabs. */
export const LOCAL_CATEGORY_ORDER = [
  'general',
  'coding',
  'reasoning',
  'fast',
  'vision',
] as const;

export function categoryDisplayLabel(category: string | undefined, modelId?: string): string {
  if (modelId === DEFAULT_ENGINE_MODEL_ID) return 'Default';
  const map: Record<string, string> = {
    coding: 'Coding',
    general: 'General',
    reasoning: 'Reasoning',
    vision: 'Vision',
    image: 'Image',
    video: 'Video',
    fast: 'Fast',
    chat: 'Chat',
  };
  return (category && map[category]) || 'Model';
}
