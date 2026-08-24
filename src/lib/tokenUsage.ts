/** Approximate token budget for the UI ring. driven by real thread pressure. */

/** Matches electron/arkGguf.cjs GGUF_CTX. */
export const GGUF_CTX = 8192;
/** Leave room for the next reply (chat nPredict is 4096). */
export const REPLY_RESERVE = 4096;
export const USABLE_TOKENS = Math.max(2048, GGUF_CTX - REPLY_RESERVE - 256);
/** Fast-link band only. Rotation threshold is `preloadStartRatio(nextModel)` from saved MBps. */
export const ROTATION_PRESSURE = 0.9;

const KEY = 'ark:token-usage';

type UsageMap = Record<string, number>;

function readMap(): UsageMap {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as UsageMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: UsageMap) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function estimateTokens(text: string) {
  const t = text?.trim() || '';
  if (!t) return 0;
  return Math.max(1, Math.ceil(t.length / 4));
}

/** 0–1 how full the current model budget is for this thread. */
export function getTokenUsageRatio(scopeId: string): number {
  if (!scopeId) return 0;
  const used = readMap()[scopeId] || 0;
  return Math.max(0, Math.min(1, used / USABLE_TOKENS));
}

export function recordTokenUsage(scopeId: string, text: string) {
  if (!scopeId) return getTokenUsageRatio(scopeId);
  const map = readMap();
  map[scopeId] = (map[scopeId] || 0) + estimateTokens(text);
  writeMap(map);
  return getTokenUsageRatio(scopeId);
}

/** Set inner ring from **this turn’s packed prompt** (not cumulative import / session). */
export function syncTokenUsage(scopeId: string, tokens: number) {
  if (!scopeId) return 0;
  const map = readMap();
  map[scopeId] = Math.max(0, tokens);
  writeMap(map);
  return getTokenUsageRatio(scopeId);
}

/** Alias. inner ring tracks the current turn pack only. */
export function setTurnPackTokens(scopeId: string, tokens: number) {
  return syncTokenUsage(scopeId, tokens);
}

export function resetTokenUsage(scopeId: string) {
  if (!scopeId) return;
  const map = readMap();
  delete map[scopeId];
  writeMap(map);
}
