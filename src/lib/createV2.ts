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

/**
 * Active when create invent-craft (createV2) owns the turn.
 * Coding foundation: agentLoopOnCreate defaults on → this is false; scaffold+tool loop owns build.
 */
export function isCreateV2Active(): boolean {
  try {
    return getLocalPrefs().agentLoopOnCreate === false;
  } catch {
    return false;
  }
}

/**
 * Soft-bind / React paint interval during create (ms).
 * Trailing coalesce flushes the latest map after this gap (no drop / no 36ms flood).
 * Keep ≥500ms — tighter gaps re-freeze the chat shell while invent streams.
 */
export const CREATE_V2_SOFT_BIND_MS = 640;

/**
 * Do not auto-open the Code overlay while crafting (avoids tree+editor freezes).
 * Always false — create must never dispatch NOVA:open-code-overlay.
 * The Code *pill* remains a manual control (setChatCodePill); users open Code themselves.
 */
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

/**
 * Max wait for the first @@@FILE token after craft starts (GGUF load).
 * Must cover the large-GGUF bind budget — electron/novaGguf.cjs:884 gives a
 * >=12GB GGUF up to 180_000ms to bind. The earlier 90s fired "no tokens"
 * while a big coder was still cold-loading, failing closed on a healthy build.
 */
export const CREATE_V2_FIRST_TOKEN_MS = 180_000;

/**
 * Cap for every await setEngineModel during create.
 * setActiveModel itself is sync, but a cold warmServer prelude can block the
 * main-thread IPC reply — never await unbound on any craft bind site.
 */
export const MODEL_LOAD_CAP_MS = 45_000;

/**
 * Idle (no streamed tokens at all) before cancelling the GGUF turn on App / App.css.
 * A 7B on a weak CPU paces 1–3 tok/sec, so ~45s of quiet mid-generation is real
 * progress, not a stall. The hard path-wall (180s) + App-family wall (150s)
 * still cap a genuine thrash, so a slower idle trigger cannot hang craft forever.
 */
export const CREATE_V2_APP_IDLE_MS = 60_000;

/** Idle before cancelling on other paths (App.css / section writes have quiet stretches). */
export const CREATE_V2_OTHER_IDLE_MS = 20_000;

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

/** Focus craft output on the requested UI so one reply does not balloon into scaffolding. */
export function createV2StagedWriteInstructions(preferTs: boolean, compositional = false): string {
  const app = preferTs ? 'src/App.tsx' : 'src/App.jsx';
  if (compositional) {
    return [
      'COMPOSITIONAL FILE CONTRACT:',
      `1) Write ${app} as the complete page shell: import and render every required section component in the requested order.`,
      '2) Write src/App.css with the complete shared page design tokens and section styling.',
      '3) Follow-up depth passes generate the section component files. Ready stays blocked until each required file has complete, brief-specific content.',
      'Do not emit placeholder section components or scaffold files.',
    ].join('\n');
  }
  return [
    'FOCUSED FILE CONTRACT:',
    `1) Write @@@FILE ${app} with the complete, working user-facing UI and all requested interactions. Do not use empty placeholders.`,
    '2) Write @@@FILE src/App.css with complete responsive styling.',
    '3) Add only supporting files required by this product; finish every file you emit.',
    'Do NOT write scaffold files such as index.html, main, package.json, or index.css.',
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
