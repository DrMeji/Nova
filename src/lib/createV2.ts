/**
 * createV2 — single-coder create spine (redesign A–E).
 *
 * Rules:
 * - No agent tool loop on create (unless Settings opts back into agentLoopOnCreate).
 * - No micro / prebuilt App templates.
 * - No Design→Copy ensemble unless multiModelCreate is on.
 * - Mid-craft: status labels only — do not paint full studio / Code every token.
 * - Scaffold must ship a complete Vite package.json before craft.
 * - Craft = whole-file App write; at most one stall retry; then stop (no polish handoff thrash).
 * - Stall abort uses idle OR hard path wall — trickle tokens must not hang for minutes.
 */

import { getLocalPrefs } from '@/lib/localPrefs';
import type { CreateBudgetProfile } from '@/lib/createRuntime';

/** Active when the create tool loop is off (default after prefs v4). */
export function isCreateV2Active(): boolean {
  try {
    return getLocalPrefs().agentLoopOnCreate !== true;
  } catch {
    return true;
  }
}

/** Soft-bind / React paint interval during create (ms). Higher = less freeze. */
export const CREATE_V2_SOFT_BIND_MS = 4_200;

/** Do not auto-open the Code overlay while crafting (avoids tree+editor freezes). */
export const CREATE_V2_AUTO_OPEN_CODE = false;

/**
 * Mid-stream: paint App / App.css into Code so users see live writing.
 * Still throttled via softBind — never full-tree thrash every token.
 */
export const CREATE_V2_STREAM_PAINT_FILES = true;

/** Craft attempts: initial write + one stall/empty retry. No enrich thrash. */
export const CREATE_V2_MAX_CRAFT_ATTEMPTS = 2;

/** Max wait for the first @@@FILE token after craft starts (GGUF load). */
export const CREATE_V2_FIRST_TOKEN_MS = 40_000;

/** Idle (no App byte growth) before cancelling the GGUF turn on App / App.css. */
export const CREATE_V2_APP_IDLE_MS = 14_000;

/** Idle before cancelling on other paths. */
export const CREATE_V2_OTHER_IDLE_MS = 8_000;

/**
 * Hard wall on one focus path regardless of trickle growth.
 * Fixes: index.css streaming 1 token / few seconds for 2+ minutes.
 */
export const CREATE_V2_APP_PATH_WALL_MS = 75_000;
export const CREATE_V2_SCAFFOLD_PATH_WALL_MS = 18_000;

/** Total wall for one craft attempt (stream must end or abort). */
export function createV2AttemptWallMs(profile: CreateBudgetProfile): number {
  if (profile === 'simple') return 75_000;
  if (profile === 'complex') return 180_000;
  return 120_000;
}

/** Scaffold / chrome files the coder must not linger on during craft. */
export function isCreateV2ScaffoldPath(path: string): boolean {
  return /(?:^|\/)(?:package\.json|package-lock\.json|tsconfig.*\.json|vite\.config\.\w+|index\.html|main\.[jt]sx?|index\.css|README\.md|\.gitignore)$/i
    .test(String(path || '').replace(/\\/g, '/'));
}

export function isCreateV2AppPath(path: string): boolean {
  return /(?:^|\/)(?:App\.(tsx|jsx)|(?:js\/)?app\.js|(?:css\/)?App\.css)$/i
    .test(String(path || '').replace(/\\/g, '/'));
}

/** Stall retry should always target App, never index.css / main. */
export function createV2StallRetryPath(stalledPath: string, preferTs: boolean): string {
  if (isCreateV2AppPath(stalledPath) && /App\.css$/i.test(stalledPath)) return 'src/App.css';
  return preferTs ? 'src/App.tsx' : 'src/App.jsx';
}

export function createV2PathWallMs(path: string): number {
  if (isCreateV2ScaffoldPath(path)) return CREATE_V2_SCAFFOLD_PATH_WALL_MS;
  if (isCreateV2AppPath(path)) return CREATE_V2_APP_PATH_WALL_MS;
  return CREATE_V2_SCAFFOLD_PATH_WALL_MS;
}

export function createV2IdleStallMs(path: string): number {
  if (isCreateV2AppPath(path)) return CREATE_V2_APP_IDLE_MS;
  return CREATE_V2_OTHER_IDLE_MS;
}

export function createV2StatusCraft(coderName: string): string {
  return `Craft · **${coderName}** (createV2 · single write)…`;
}

export function createV2StatusVerify(): string {
  return 'Verify · Preview Ready…';
}

export function createV2StatusDone(): string {
  return 'Create finished';
}

export function createV2StatusFailed(reason: string): string {
  return `Create failed — ${String(reason || 'unknown').slice(0, 120)}`;
}
