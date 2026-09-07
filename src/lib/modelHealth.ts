/** Model wear / freshness for the dual usage ring (separate from turn context budget). */

const KEY = 'NOVA:model-health';

/** ~45 minutes of continuous heavy use → ring near full (image waits are long). */
const WEAR_MS_FULL = 50 * 60_000;
/** ~150 casual chat turns on the same brain → ring near full. */
const WEAR_TURNS_FULL = 150;
/** Token volume that fills wear when combined with turns/time. */
const WEAR_TOKENS_FULL = 96_000;

type HealthEntry = {
  turns: number;
  tokens: number;
  /** Wall time actively generating on this brain (ms). */
  activeMs: number;
  startedAt: number;
  lastAt: number;
};

type HealthMap = Record<string, HealthEntry>;

function readMap(): HealthMap {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as HealthMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: HealthMap) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function entry(scopeId: string, map: HealthMap): HealthEntry {
  const cur = map[scopeId];
  if (cur) return cur;
  const now = Date.now();
  return { turns: 0, tokens: 0, activeMs: 0, startedAt: now, lastAt: now };
}

/** 0 = fresh brain, 1 = worn (slow / ready to rotate). */
export function getModelHealthRatio(scopeId: string): number {
  if (!scopeId) return 0;
  const e = entry(scopeId, readMap());
  const turnPart = e.turns / WEAR_TURNS_FULL;
  const timePart = e.activeMs / WEAR_MS_FULL;
  const tokenPart = e.tokens / WEAR_TOKENS_FULL;
  return Math.max(0, Math.min(1, turnPart * 0.08 + timePart * 0.35 + tokenPart * 0.18));
}

/** Call after each completed generate on this scope. */
export function recordModelTurn(
  scopeId: string,
  opts: { tokens?: number; activeMs?: number } = {},
): number {
  if (!scopeId) return 0;
  const map = readMap();
  const e = entry(scopeId, map);
  const now = Date.now();
  e.turns += 1;
  e.tokens += Math.min(Math.max(0, opts.tokens || 0), 280);
  e.activeMs += Math.min(Math.max(0, opts.activeMs || 0), 8_000);
  e.lastAt = now;
  map[scopeId] = e;
  writeMap(map);
  return getModelHealthRatio(scopeId);
}

/** New on-device brain / rotation. start fresh. */
export function resetModelHealth(scopeId: string) {
  if (!scopeId) return;
  const map = readMap();
  delete map[scopeId];
  writeMap(map);
}
