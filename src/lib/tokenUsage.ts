/** Approximate token budget for the UI ring (failover still handled by the router). */

const BUDGET = 28_000;
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
  return Math.max(0, Math.min(1, used / BUDGET));
}

export function recordTokenUsage(scopeId: string, text: string) {
  if (!scopeId) return getTokenUsageRatio(scopeId);
  const map = readMap();
  const next = (map[scopeId] || 0) + estimateTokens(text);
  // Soft wrap when budget fills — new “segment” after failover feels like a fresh ring.
  map[scopeId] = next >= BUDGET ? next % BUDGET : next;
  writeMap(map);
  return Math.max(0, Math.min(1, map[scopeId] / BUDGET));
}

export function resetTokenUsage(scopeId: string) {
  if (!scopeId) return;
  const map = readMap();
  delete map[scopeId];
  writeMap(map);
}
