/**
 * createV2 — craft stage only (stream App write).
 * Success is owned by Create Runtime Loop + pass spine, not by craft alone.
 *
 * Rules:
 * - Craft stays staged single-coder write (avoids tool-loop thrash on create).
 * - After craft: createRuntimeLoop runs gather→fix→verify (plan repair, commander, judge).
 * - Quality Ready requires createPassSpine (plan + design + host judge) — floors never alone.
 * - Mid-craft: status labels; optional stream paint.
 * - Stall abort uses idle OR App-family wall — thrash must not hang forever.
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

/**
 * Soft-bind / React paint interval during create (ms).
 * Keep low so Code can typewriter-reveal toward the latest buffer (not multi-second dumps).
 */
export const CREATE_V2_SOFT_BIND_MS = 36;

/** Do not auto-open the Code overlay while crafting (avoids tree+editor freezes). */
export const CREATE_V2_AUTO_OPEN_CODE = false;

/**
 * Mid-stream: paint App / App.css into Code so users see live writing.
 * Still throttled via softBind — never full-tree thrash every token.
 */
export const CREATE_V2_STREAM_PAINT_FILES = true;

/**
 * Craft attempts: initial write + one short repair if truncated/stalled.
 * Avoids endless rewrite thrash while still recovering one bad dump.
 */
export const CREATE_V2_MAX_CRAFT_ATTEMPTS = 2;
/** Hard upper bound across both craft writes; do not keep retraining the same stalled turn. */
export const CREATE_V2_CRAFT_TOTAL_WALL_MS = 5 * 60_000;

/** Max wait for the first @@@FILE token after craft starts (GGUF load). */
export const CREATE_V2_FIRST_TOKEN_MS = 90_000;

/**
 * Cap for every await setEngineModel during create.
 * setActiveModel itself is sync, but a cold warmServer prelude can block the
 * main-thread IPC reply — never await unbound on any craft bind site.
 */
export const MODEL_LOAD_CAP_MS = 45_000;

/** Idle (no streamed tokens at all) before cancelling the GGUF turn on App / App.css. */
export const CREATE_V2_APP_IDLE_MS = 45_000;

/** Idle before cancelling on other paths. */
export const CREATE_V2_OTHER_IDLE_MS = 14_000;

/**
 * Hard wall on one focus path regardless of trickle growth.
 * Keep below the old 8m thrash — fail forward to heal/Live instead.
 */
export const CREATE_V2_APP_PATH_WALL_MS = 180_000;
/**
 * Combined wall for App.jsx + App.css as one craft family.
 * Prevents infinite wall reset when the model thrash-switches between the two.
 */
export const CREATE_V2_APP_FAMILY_WALL_MS = 150_000;
export const CREATE_V2_SCAFFOLD_PATH_WALL_MS = 10_000;

/** Total wall for one craft attempt (stream must end or abort). */
export function createV2AttemptWallMs(profile: CreateBudgetProfile): number {
  // Brief-sized budgets — simple apps must finish, not thrash for 5–7m.
  if (profile === 'simple') return 150_000; // 2.5m
  if (profile === 'complex') return 360_000; // 6m
  return 240_000; // 4m
}

export function createV2CraftTotalWallMs(profile: CreateBudgetProfile): number {
  return profile === 'simple' ? 3 * 60_000 : CREATE_V2_CRAFT_TOTAL_WALL_MS;
}

/** Staged-write instructions so models emit shell → fill → CSS instead of one novel. */
export function createV2StagedWriteInstructions(preferTs: boolean): string {
  const app = preferTs ? 'src/App.tsx' : 'src/App.jsx';
  return [
    'STAGE THE WRITE (smaller dumps survive better than one giant file):',
    `1) Emit @@@FILE ${app} as a compositional shell: imports, export default, brand h1, and empty section landmarks`,
    '   (<section> / <header> / <footer> / <main> placeholders the depth pass will fill). Do not claim the page is finished.',
    '2) Continue the same @@@FILE to fill real copy + interactions into those sections — finish every tag and brace.',
    '3) Emit @@@FILE src/App.css with real styles (not empty).',
    'Do NOT linger on index.html, main, package.json, or index.css during craft.',
  ].join('\n');
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
  return `Craft · **${coderName}** (createV2 · staged write)…`;
}

export function createV2StatusRepair(path: string): string {
  const base = String(path || 'App').split('/').pop() || 'App';
  return `Repair pass · finishing ${base}…`;
}

export function createV2StatusVerify(): string {
  return 'Verify · Live evidence…';
}

export function createV2StatusDone(): string {
  return 'Create finished';
}

export function createV2StatusFailed(reason: string): string {
  return `Create failed — ${String(reason || 'unknown').slice(0, 120)}`;
}
