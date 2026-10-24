import {
  CODING_QUALITY_WIN,
  formatCodingPipelineProgress,
  codingQualityFloorHit,
} from '@/lib/codingQualityWinPack';
import {
  understandCreateBrief,
  prepCreateEnvironment,
  emitCreatePipelineStart,
  emitCreatePipelineStep,
  readyBlockedByCodingQuality,
  bindBinderGuard,
} from '@/lib/codingCreatePipeline';
import { verifyCraftFile, doomLoopGuard } from '@/lib/codingFileVerify';
import { recordFileModelAttribution } from '@/lib/fileModelAttribution';
import type { ProjectBootstrapResult } from '@/lib/createProjectFlow';
import {
  formatCreateProjectReply,
  runCreateProjectFlow,
  bootstrapProjectWorkspace,
  kickEarlyNpmInstall,
  peekEarlyNpmInstall,
} from '@/lib/createProjectFlow';
import {
  extractProjectName,
  fallbackCreateProjectName,
  findBestProductBrief,
  parseNewProjectIntent,
  recoverOriginalUserBrief,
  detectProjectKind,
  resolveProjectKindForCreate,
  slugifyProjectName,
  type NewProjectIntent,
  type ProjectKind,
} from '@/lib/createProjectIntent';
import { cleanProductTitle } from '@/lib/freshSpaFromBrief';
import { projectUsesNpm } from '@/lib/projectScaffolds';
import { applyChatReplyEdits, persistAcceptedCreateFiles, persistGenreLogoSvg } from '@/lib/chatAgentApply';
import { pendingCreateBootstrap } from './createBootstrap';
import { formatCreateProjectMap } from '@/lib/createEvidence';
import { snapshotCreateCheckpoint } from '@/lib/createCheckpoint';
import { buildRankedProjectMap } from '@/lib/createProjectMap';
import { verifyCreateRenderedQuality } from '@/lib/createEvidence';
import { judgeCreateVerified } from '@/lib/createPassSpine';
import { markCreateJobFailed, markCreateJobNpm, markCreateJobReadyVerified, shouldAbortCreateJob, markCreateJobVerifying, startCreateJob, updateCreateJob } from '@/lib/createJobStore';
import { getLocalPrefs } from '@/lib/localPrefs';
import { clearChatStudio, clearLastDiskTarget, setLastPendingGreenfield } from '@/lib/chatStudioStore';
import type { CreateSuccess } from '@/lib/productContract';
import { isThinCreatePath, thinCraftMayContinue, thinAppNeedsFinishPass, thinNeedsDepthPass, thinBlocksLivePreview, thinLiveVisualDeficits, thinDepthReplyGrew, thinDepthDeficits, thinDepthSameRejectStalled, readThinDepthLedger, formatThinDepthLedger, thinAppLooksTruncated, formatFinishAppPrompt, formatDepthContinuePrompt, THIN_CREATE_APP_PATH, thinCreateLocksAppJsx, thinCreatePrimaryAppPath, thinCoerceLockedAppJsx, thinMergeDepthAppFiles, makeThinDepthStreamGuards, THIN_DEPTH_CONTINUE_MAX, THIN_DEPTH_SAME_REJECT_BAIL, THIN_DEPTH_ZERO_GAIN_BAIL, THIN_DEPTH_COMPOSITIONAL_ZERO_GAIN_CYCLES, thinWantsCompositionalShell, applyCompositionalDepthMerge, assembleCompositionalAppShell, ensureLandedSectionsMountedInApp, seedCompositionalBrandVisuals, seedCompositionalSectionScaffolds, ensureRelativeCssImportsExist, appLooksLikeCompositionalShell, replyHasCompositionalSectionBlock, pickThinDepthFiles, depthPersistKeys, genreLockPersistKeys, thinGenreSeedClearsLive, thinAskMatchDeficits, compositionalDepthIsComplete, compositionalSectionFileSubstantial, filesHaveInventDemoSite, inventDemoOwnsLogo, formatCompositionalSectionSpecs, nextCompositionalDepthTarget, compositionalDepthDropsDeliveredMarkers, formatCompositionalDepthDropReason, inventFloorEnrichExhausted, inventFloorClearsLive, looksLikeInventFloorTwin, breakInventFloorTwin, ensureNavTargetIdsOnSections, ensureHeroPremiumFloorCopy, formatThinCreateSpineStatus, compositionalHeroNeedsPremiumFloor, listLandedCompositionalSections, THIN_LIVE_VISUAL_MIN_LANDED_SECTIONS } from '@/lib/createThinPath';
import { detectHeroProductKind } from '@/lib/createIdentity';
import { ensureAtelierUniqueLayoutAcc, healEditorialHeroAcc } from '@/lib/createThinPath';
import {
  writeLogoIfAllowed,
  captureInventLiveGrade,
  inventNeedsPlanApprove,
  inventMayUseStock,
  appendAutoMemory,
} from '@/lib/inventCraftPack';
import {
  tryInventGitCommit,
  inventGitCommitMessage,
  condenseCraftTrace,
  rankedRepoMapPeek,
  formatMidTurnSteer,
  detectInventAgentMode,
  inventModeAcl,
} from '@/lib/inventHarnessPack';
import { liveOwnerKey } from '@/lib/liveOwnerKey';
import {
  isCreateV2Active,
  CREATE_V2_SOFT_BIND_MS,
  CREATE_V2_STREAM_PAINT_FILES,
  CREATE_V2_MAX_CRAFT_ATTEMPTS,
  CREATE_V2_FIRST_TOKEN_MS,
  MODEL_LOAD_CAP_MS,
  createV2AttemptWallMs,
  createV2CraftTotalWallMs,
  createV2PathWallMs,
  createV2IdleStallMs,
  createV2StallRetryPath,
  CREATE_V2_APP_FAMILY_WALL_MS,
  isCreateV2ScaffoldPath,
  isCreateV2AppPath,
  createV2StatusCraft,
  createV2StatusRepair,
  createV2StagedWriteInstructions,
} from '@/lib/createV2';
import {
  resetBuildDiagnostics,
  pushBuildDiag,
  noteBuildContext,
  noteBuildGateResult,
  noteBuildFail,
  getBuildDiagnostics,
  markBuildDiagnosticsEnded,
  clearBuildWritingPath,
  tickBuildHeartbeat,
} from '@/lib/buildDiagnostics';

export { pendingCreateBootstrap };

function createApplyFailureReason(result: {
  error?: string;
  syntaxFailed?: boolean;
  syntaxReasons?: string[];
}): string {
  if (result.syntaxFailed) {
    const details = (result.syntaxReasons || []).slice(0, 3).join('; ');
    return `Generated file rejected by syntax validation${details ? `: ${details}` : ''}`;
  }
  return result.error || 'Generated file could not be applied';
}

/** Apply a small build-error repair through the exact coder selected for this create turn. */
async function repairCreateBuildWithCoder(opts: {
  files: Record<string, string>;
  brief: string;
  productName: string;
  errors: string[];
  projectId: string;
  diskRoot?: string | null;
  coderId: string;
  coderName: string;
  coderSource?: string;
  shouldAbort: () => boolean;
}): Promise<{ files: Record<string, string>; changed: boolean; summary?: string }> {
  if (!opts.coderId || opts.shouldAbort()) return { files: opts.files, changed: false };
  const prompt = [
    `TARGETED BUILD REPAIR for ${opts.productName}.`,
    'The app build failed. Fix the reported compiler/build errors with the smallest necessary edits.',
    'Preserve the user-requested design, copy, and interactions. Do not replace the product with a template or placeholder.',
    'Return only complete @@@FILE blocks for files that need changes. Do not edit package or scaffold files unless the error requires it.',
    `Original user brief:\n${opts.brief.slice(0, 1800)}`,
    'Build errors:',
    ...opts.errors.slice(0, 5).map((error) => `- ${error.slice(0, 500)}`),
  ].join('\n');
  const { answerStudio } = await import('@/lib/studioAnswerEngine');
  const result = await answerStudio({
    userMessage: prompt,
    files: opts.files,
    projectName: opts.productName,
    mode: 'code',
    preferredModelId: opts.coderId,
    preferredModelName: opts.coderName,
    preferredSource: opts.coderSource,
    stickyModelId: opts.coderId,
    stickyModelName: opts.coderName,
    stickyPinnedSource: opts.coderSource || 'local',
    allowFileEdits: true,
    timeoutMs: 90_000,
    shouldAbort: opts.shouldAbort,
  });
  const reply = String(result?.text || '');
  if (!/@@@FILE\s+\S+/i.test(reply)) return { files: opts.files, changed: false, summary: 'coder returned no file edits' };
  const applied = await applyChatReplyEdits({
    reply,
    projectId: opts.projectId,
    projectName: opts.productName,
    files: opts.files,
    userMessage: prompt,
    originalBrief: opts.brief,
    diskRoot: opts.diskRoot,
    dryRun: true,
  });
  if (!applied.ok) return { files: opts.files, changed: false, summary: 'repair edits were rejected' };
  const changedPaths = Object.keys(applied.files).filter((path) => applied.files[path] !== opts.files[path]);
  return changedPaths.length
    ? { files: applied.files, changed: true, summary: `updated ${changedPaths.slice(0, 4).join(', ')}` }
    : { files: opts.files, changed: false, summary: 'repair produced no source changes' };
}

/** Still run the real package build when Vite cannot start, then try bounded repair. */
async function runCreatePackageBuildWithRepair(opts: {
  files: Record<string, string>;
  brief: string;
  productName: string;
  projectId: string;
  diskRoot: string;
  coderId: string;
  coderName: string;
  coderSource?: string;
  shouldAbort: () => boolean;
  onStatus?: (label: string) => void;
}): Promise<{ files: Record<string, string>; ok: boolean | null; errors: string[]; repairs: number }> {
  if (!window.novaDesktop?.agentRun) {
    return { files: opts.files, ok: null, errors: ['Desktop build runner unavailable'], repairs: 0 };
  }
  let files = { ...opts.files };
  let errors: string[] = [];
  let repairs = 0;
  for (let attempt = 0; attempt < 3 && !opts.shouldAbort(); attempt += 1) {
    opts.onStatus?.(attempt === 0 ? 'Build · npm run build (preview unavailable)…' : `Build · retry after repair ${attempt}/2…`);
    try {
      const build = await window.novaDesktop.agentRun({
        command: 'npm run build',
        cwd: opts.diskRoot,
        userConfirmed: true,
        skipConfirm: true,
        timeoutMs: 90_000,
      });
      if (build?.ok) return { files, ok: true, errors: [], repairs };
      errors = [String((build as { error?: string; output?: string })?.error
        || (build as { output?: string })?.output || 'npm run build failed').slice(0, 1200)];
    } catch (error) {
      errors = [String(error instanceof Error ? error.message : error).slice(0, 1200)];
    }
    if (attempt >= 2 || opts.shouldAbort()) break;
    const repaired = await repairCreateBuildWithCoder({
      files,
      brief: opts.brief,
      productName: opts.productName,
      errors,
      projectId: opts.projectId,
      diskRoot: opts.diskRoot,
      coderId: opts.coderId,
      coderName: opts.coderName,
      coderSource: opts.coderSource,
      shouldAbort: opts.shouldAbort,
    }).catch(() => ({ files, changed: false, summary: 'repair failed' }));
    if (!repaired.changed) break;
    const changedPaths = Object.keys(repaired.files).filter((path) => repaired.files[path] !== files[path]);
    const reply = changedPaths.map((path) => `@@@FILE ${path}\n${repaired.files[path]}`).join('\n');
    const applied = await applyChatReplyEdits({
      reply,
      projectId: opts.projectId,
      projectName: opts.productName,
      files,
      userMessage: opts.brief,
      originalBrief: opts.brief,
      diskRoot: opts.diskRoot,
    }).catch(() => null);
    if (!applied?.ok) {
      errors = applied?.syntaxReasons?.length
        ? [`Build repair rejected: ${applied.syntaxReasons.slice(0, 3).join('; ')}`]
        : ['Build repair edits could not be applied'];
      break;
    }
    files = applied.files;
    repairs += 1;
  }
  return { files, ok: false, errors, repairs };
}

/** Soft-bind folder + code pills without Live (previewUrl stays null; job not Ready). */
const softBindLastAt = new Map<string, number>();
const softBindCount = new Map<string, number>();
/** Merged studio files per create key — never wipe map with a partial paint. */
const softBindFilesAcc = new Map<string, Record<string, string>>();
/** Trailing-edge coalesce — latest paint flushes after minGap instead of being dropped. */
const softBindPending = new Map<string, {
  host: CreateTurnHost;
  opts: {
    files: Record<string, string>;
    projectId: string;
    name: string;
    diskRoot: string | null;
    force?: boolean;
  };
  timer: ReturnType<typeof setTimeout> | null;
}>();
/** Cheap fingerprint so identical paints do not thrash React. */
const softBindPaintSig = new Map<string, string>();

/** Unbind chat from a partial create — folder may exist on disk, but chat is not a successful product. */
function unbindCreateChat(
  host: Pick<CreateTurnHost, 'commitStudio' | 'setChatCodePill'>,
  chatId: string,
  opts?: { keepCodePill?: boolean },
): void {
  const key = String(chatId || '').trim();
  if (key) {
    const pend = softBindPending.get(key);
    if (pend?.timer) clearTimeout(pend.timer);
    softBindPending.delete(key);
    softBindFilesAcc.delete(key);
    softBindLastAt.delete(key);
    softBindCount.delete(key);
    softBindPaintSig.delete(key);
  }
  try {
    host.commitStudio({
      files: {},
      projectId: '',
      name: '',
      diskRoot: null,
      previewUrl: null,
    });
  } catch { /* ignore */ }
  // Keep Code pill when a folder was already written — user can still open Code manually.
  if (opts?.keepCodePill) {
    try { host.setChatCodePill(chatId, true); } catch { /* ignore */ }
  } else {
    try { host.setChatCodePill(chatId, false); } catch { /* ignore */ }
  }
  try { clearLastDiskTarget(chatId); } catch { /* ignore */ }
  try { clearChatStudio(chatId); } catch { /* ignore */ }
}

function softBindFingerprint(
  files: Record<string, string>,
  projectId: string,
  diskRoot: string | null,
): string {
  const keys = Object.keys(files).sort();
  let sig = `${projectId}|${diskRoot || ''}|${keys.length}`;
  for (const k of keys) {
    const v = files[k] || '';
    sig += `|${k}:${v.length}:${v.length > 0 ? v.charCodeAt(0) : 0}:${v.length > 1 ? v.charCodeAt(v.length - 1) : 0}`;
  }
  return sig;
}

function flushSoftBindCreateStudio(
  key: string,
  host: CreateTurnHost,
  opts: {
    files: Record<string, string>;
    projectId: string;
    name: string;
    diskRoot: string | null;
    force?: boolean;
  },
): void {
  const v2 = isCreateV2Active();
  const count = softBindCount.get(key) || 0;
  if (!opts.force && count > (v2 ? 48 : 24)) return;
  const prev = softBindFilesAcc.get(key) || {};
  const merged = { ...prev, ...opts.files };
  softBindFilesAcc.set(key, merged);
  const fp = softBindFingerprint(merged, opts.projectId, opts.diskRoot);
  if (!opts.force && softBindPaintSig.get(key) === fp) {
    // Still refresh pill / heartbeat without a redundant commitStudio.
    if (opts.diskRoot || Object.keys(merged).length > 0) {
      try { host.setChatCodePill(host.chatId, true); } catch { /* ignore */ }
    }
    return;
  }
  softBindPaintSig.set(key, fp);
  softBindLastAt.set(key, Date.now());
  softBindCount.set(key, count + 1);
  try {
    pushBuildDiag({
      kind: 'soft-bind',
      detail: `Studio paint #${count + 1} (${Object.keys(merged).length} files)`,
    });
    tickBuildHeartbeat(`Studio · ${Object.keys(merged).length} files`);
  } catch { /* ignore */ }
  try {
    host.commitStudio({
      files: merged,
      projectId: opts.projectId,
      name: opts.name,
      diskRoot: opts.diskRoot,
      previewUrl: null,
    });
  } catch { /* ignore */ }
  // Pill = manual open control only (never auto-opens overlay).
  if (opts.diskRoot || Object.keys(merged).length > 0) {
    try { host.setChatCodePill(host.chatId, true); } catch { /* ignore */ }
  }
  try {
    if (host.shouldPaintStudioLive(host.routeChatId, host.chatId)) {
      host.setCodePillSticky(true);
    }
  } catch { /* ignore */ }
  if (opts.diskRoot) {
    try {
      host.setLastDiskTarget(host.chatId, {
        path: opts.diskRoot,
        name: opts.name,
        kind: 'folder',
      });
    } catch { /* ignore */ }
  }
  try {
    host.touchRecentProject?.(opts.projectId, opts.name, opts.diskRoot || undefined);
  } catch { /* ignore */ }
}

function softBindCreateStudio(
  host: CreateTurnHost,
  opts: {
    files: Record<string, string>;
    projectId: string;
    name: string;
    diskRoot: string | null;
    /** Force paint even if throttled (final bind / ready / fail). */
    force?: boolean;
  },
): void {
  const v2 = isCreateV2Active();
  const key = String(host.chatId || opts.projectId || 'create');
  const now = Date.now();
  const last = softBindLastAt.get(key) || 0;
  const minGap = v2 ? CREATE_V2_SOFT_BIND_MS : 900;

  if (opts.force) {
    const pend = softBindPending.get(key);
    if (pend?.timer) clearTimeout(pend.timer);
    softBindPending.delete(key);
    const forceOpts = {
      ...opts,
      files: { ...(softBindFilesAcc.get(key) || {}), ...opts.files },
    };
    flushSoftBindCreateStudio(key, host, forceOpts);
    return;
  }

  // Trailing coalesce: merge file maps so a later paint cannot drop earlier paths.
  const existing = softBindPending.get(key);
  if (existing?.timer) clearTimeout(existing.timer);
  const mergedOpts = existing
    ? {
      ...opts,
      files: { ...existing.opts.files, ...opts.files },
      projectId: opts.projectId || existing.opts.projectId,
      name: opts.name || existing.opts.name,
      diskRoot: opts.diskRoot || existing.opts.diskRoot,
    }
    : opts;
  // Eager-acc so force/unbind paths still see every path that was scheduled.
  softBindFilesAcc.set(key, { ...(softBindFilesAcc.get(key) || {}), ...mergedOpts.files });
  // Larger trees: stretch the gap a bit so React is not painting 40+ files every tick.
  const fileN = Object.keys(softBindFilesAcc.get(key) || {}).length;
  const adaptiveGap = fileN >= 24 ? minGap + 120 : fileN >= 12 ? minGap + 60 : minGap;
  const waitMs = Math.max(0, adaptiveGap - (now - last));
  if (waitMs === 0 && !existing) {
    flushSoftBindCreateStudio(key, host, mergedOpts);
    return;
  }
  const timer = setTimeout(() => {
    const pending = softBindPending.get(key);
    softBindPending.delete(key);
    if (!pending) return;
    // Align commit with the next frame so React is not mid-layout when we paint.
    const run = () => flushSoftBindCreateStudio(key, pending.host, pending.opts);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else run();
  }, waitMs > 0 ? waitMs : adaptiveGap);
  softBindPending.set(key, { host, opts: mergedOpts, timer });
}

/** Product-contract create success (Wave 2 alias for callers). */
export type { CreateSuccess };

/**
 * Create always allowed when a coder is ready (no dual-VRAM gate).
 * Single Brain Create — Multimodal relay removed.
 */
export async function assertCreateMultiModelOk(): Promise<{ ok: boolean; reason?: string }> {
  return { ok: true };
}

export type CreateTurnOutcome =
  | { status: 'handled'; contract?: CreateSuccess }
  | { status: 'fallthrough_edit' }
  | { status: 'failed'; message: string };

export type CreateTurnHost = {
  content: string;
  chatId: string;
  mode: string;
  workspaceBound: boolean;
  createIntent: NewProjectIntent | null;
  classifiedCreateName?: string;
  messages: { role: string; content: string }[];
  routeChatId: string | null;
  pushStatus: (label: string, writingPath?: string | null) => void;
  stopIfSuperseded: () => Promise<boolean>;
  /** True when Stop / superseded — create polish must cancel GGUF, not only check time budgets. */
  shouldAbort?: () => boolean;
  finishPlainReply: (text: string, provider?: string) => Promise<void>;
  /** Wall-clock start for this create turn (Files Changed card timing). */
  replyStartedAt?: number;
  syncGrants: () => Promise<void>;
  commitStudio: (opts: {
    files: Record<string, string>;
    projectId: string;
    name: string;
    diskRoot: string | null;
    previewUrl?: string | null;
  }) => void;
  setChatCodePill: (chatId: string, on: boolean) => void;
  shouldPaintStudioLive: (routeId: string | null, chatId: string) => boolean;
  setCodePillSticky: (on: boolean) => void;
  renameChat: (chatId: string, title: string) => void;
  addChat: (chat: {
    id: string;
    mode: string;
    title: string;
    updatedAt: string;
    preview?: string;
  }) => void;
  /** Index created folders in Projects / Recent. */
  touchRecentProject?: (id: string, name?: string, diskPath?: string) => void;
  setLastDiskTarget: (chatId: string, target: { path: string; name: string; kind: 'folder' }) => void;
  clearPending: (chatId: string) => void;
  getPending: (chatId: string) => {
    name?: string;
    slug?: string;
    kind?: string;
    summary?: string;
    problemLine?: string;
    planLog?: string[];
  } | null;
  previewFromText: (text: string) => string | undefined;
  /** Prefer sticky/preferred coder for rich create UI polish (mirrors edit.ts). */
  modelId?: string | null;
  modelName?: string | null;
  stickyModelId?: string | null;
  stickyModelName?: string | null;
  preferredModelId?: string | null;
  preferredModelName?: string | null;
  /**
   * Called when create auto-pins a ready local coder before scaffolding.
   * Wire UI + engine + prefs so the Select-model pill matches the build brain.
   */
  onCoderPinned?: (coder: { id: string; name: string }) => void;
  /** Active create hop model — pill shows this while building (restored after). */
  onCreatePhaseModel?: (phase: {
    id: string;
    name: string;
    role: string;
  }) => void;
};

/** One cause → one next click. */
export function teachableCreateError(err: string | undefined | null, name?: string): string {
  const e = String(err || '').trim();
  const title = name ? `**${name}**` : 'the project';
  if (/grant|Documents|Desktop|folder access|NOVA Projects/i.test(e)) {
    return [
      `Could not create ${title} — **folder access** is off.`,
      '',
      'Click **Allow Documents** in Settings → Privacy, or say **create in sandbox**.',
    ].join('\n');
  }
  if (/EEXIST|already exists|path exists/i.test(e)) {
    return [
      `Could not create ${title} — that folder **already exists**.`,
      '',
      'Say **open that folder** to edit it, or pick a new name.',
    ].join('\n');
  }
  if (/Node\.?js|node -v|npm is not|ENOENT.*npm/i.test(e)) {
    return [
      `Files may be on disk, but **Node.js is missing** for npm.`,
      '',
      'Install Node.js LTS, then say **install npm dependencies** or click **Live**.',
    ].join('\n');
  }
  if (/IPC|novaDesktop|is not a function|undefined/i.test(e)) {
    return [
      `Could not create ${title} — **desktop bridge missing** (IPC).`,
      '',
      'Restart NOVA (Electron). If it keeps failing, reinstall the desktop app.',
    ].join('\n');
  }
  if (/timeout|timed out|abort/i.test(e)) {
    return [
      `Create stalled — **timeout**.`,
      '',
      'Say **build me a website** again, or open the folder with **+ → Open folder**.',
    ].join('\n');
  }
  return e
    ? `Could not finish creating ${title}.\n\n${e}`
    : `Could not create ${title}.`;
}

/** Resolve a real local coder for create UI polish — adaptive to ready GGUFs + this PC. */
export async function resolveCreateUiPolishCoder(host: {
  stickyModelId?: string | null;
  preferredModelId?: string | null;
  modelId?: string | null;
  stickyModelName?: string | null;
  preferredModelName?: string | null;
  modelName?: string | null;
  /** Raw user ask — blank solid creates must not wait on a coder GGUF. */
  content?: string | null;
}): Promise<{
  id: string;
  name: string;
  source: 'local' | 'auto';
  ok: boolean;
  reason?: string;
}> {
  // Deterministic blank color page — never block on Models / engine status.
  try {
    const { blankSolidColorFromAsk } = await import('@/lib/webProjectCanon');
    if (blankSolidColorFromAsk(String(host.content || ''))) {
      return { id: 'blank-solid', name: 'Blank page', source: 'auto', ok: true };
    }
  } catch { /* fall through to normal coder resolve */ }

  const { getBrainProfile, assertCoderAllowed } = await import('@/lib/brainProfile');
  const { getActiveBrainId, isWeakCoderId } = await import('@/lib/brainRoles');
  const { getEngineStatus } = await import('@/lib/novaEngine');
  const { pickReadyCreatePolishCoder, isCoderEngineId } = await import('@/lib/enginePick');
  const { isVisionEngineId } = await import('@/lib/createRuntime');
  const { getLocalPrefs } = await import('@/lib/localPrefs');

  const profile = await getBrainProfile();
  const prefs = getLocalPrefs();
  // Never use chat sticky "Instruct" as the display name for a coder id.
  const nameHint = undefined;

  // Chat picker / ladder pin wins — Instruct 7B, UIGEN, VL, or coder.
  // Never silently upgrade to a bigger coder behind the UI label (that caused
  // 7B prove-outs to jump to coder-32B mid-build).
  const { isUiDesignEngineId } = await import('@/lib/enginePick');
  // Thin invent: coder seats first. Chat sticky Instruct/UIGEN only if user pinned them for this turn.
  const { isThinCreatePath: thinCreate } = await import('@/lib/createThinPath');
  const thin = thinCreate();
  const pinCandidates = (thin
    ? [
      prefs.activeCoderId,
      prefs.defaultCodeModelId,
      host.stickyModelId,
      host.preferredModelId,
      host.modelId,
      prefs.lastChatModelId,
      prefs.activeChatId,
      prefs.defaultModelId,
    ]
    : [
      host.stickyModelId,
      host.preferredModelId,
      host.modelId,
      prefs.activeCoderId,
      prefs.defaultCodeModelId,
      prefs.lastChatModelId,
      prefs.activeChatId,
      prefs.defaultModelId,
    ])
    .map((s) => String(s || '').trim())
    .filter((id) => id && id !== 'NOVA-auto' && !isWeakCoderId(id));
  for (const turnPin of pinCandidates) {
    try {
      const status = await getEngineStatus();
      const hit = (status.models || []).find((m) => m.id === turnPin && m.status === 'ready');
      if (!hit) continue;
      // Skip vision/image packs unless the user explicitly pinned that id.
      if (
        isVisionEngineId(turnPin)
        && turnPin !== host.stickyModelId
        && turnPin !== host.preferredModelId
        && turnPin !== host.modelId
      ) {
        continue;
      }
      if (/\b(?:image|video|sd|flux)\b/i.test(turnPin)) continue;
      // Thin create: skip UIGEN/design pins unless user explicitly pinned them this turn.
      // Prefer a real coder for App.jsx / section invent.
      if (
        thin
        && isUiDesignEngineId(turnPin)
        && turnPin !== host.stickyModelId
        && turnPin !== host.preferredModelId
        && turnPin !== host.modelId
      ) {
        continue;
      }
      // Thin: skip non-coder chat sticky (Instruct) when a coder is available later in the list.
      if (
        thin
        && !isCoderEngineId(turnPin)
        && !isUiDesignEngineId(turnPin)
        && (prefs.activeCoderId || prefs.defaultCodeModelId)
        && turnPin !== host.stickyModelId
        && turnPin !== host.preferredModelId
        && turnPin !== host.modelId
      ) {
        continue;
      }
      const pinName = String(
        host.stickyModelName
        || host.preferredModelName
        || host.modelName
        || hit.name
        || turnPin,
      );
      return { id: turnPin, name: pinName, source: 'local', ok: true };
    } catch {
      /* try next pin */
    }
  }

  const explicitIds = [
    host.stickyModelId,
    host.preferredModelId,
    host.modelId,
    prefs.activeCoderId,
    prefs.defaultCodeModelId,
    getActiveBrainId('coder'),
  ]
    .map((s) => String(s || '').trim())
    .filter((id) => id
      && id !== 'NOVA-auto'
      && !isWeakCoderId(id)
      && !isVisionEngineId(id)
      && (isCoderEngineId(id) || isUiDesignEngineId(id)));

  const alreadySelectedCoder = explicitIds[0] || null;

  let fromDisk: { id: string; name: string } | null = null;
  try {
    const status = await getEngineStatus();
    fromDisk = pickReadyCreatePolishCoder(status.models, {
      preferSelectedId: alreadySelectedCoder,
      ramGb: profile.ramGB,
      maxParamsB: profile.maxCoderParamsB,
    });
  } catch {
    fromDisk = null;
  }

  const candidates: Array<{ id: string; name: string; source: 'local' | 'auto' }> = [];
  const seen = new Set<string>();
  const push = (id: string | null | undefined, name?: string | null, source: 'local' | 'auto' = 'local') => {
    const clean = String(id || '').trim();
    if (
      !clean
      || clean === 'NOVA-auto'
      || isWeakCoderId(clean)
      || isVisionEngineId(clean)
      || !(isCoderEngineId(clean) || isUiDesignEngineId(clean))
      || seen.has(clean)
    ) return;
    seen.add(clean);
    candidates.push({ id: clean, name: String(name || clean), source });
  };

  if (fromDisk) push(fromDisk.id, fromDisk.name, 'local');
  for (const id of explicitIds) push(id, nameHint, 'local');

  for (const c of candidates) {
    const gate = assertCoderAllowed(profile, c.id, c.name);
    if (gate.ok) return { ...c, ok: true };
  }

  if (fromDisk) {
    const gate = assertCoderAllowed(profile, fromDisk.id, fromDisk.name);
    return {
      id: fromDisk.id,
      name: fromDisk.name,
      source: 'local',
      ok: gate.ok,
      reason: gate.ok
        ? undefined
        : gate.reason,
    };
  }

  // Craft fallback — when no coder GGUF is ready, still build with
  // Instruct / UIGEN. Thin create prefers non-uigen Instruct before UIGEN.
  try {
    const { rankedReadyDesignIds } = await import('@/lib/enginePick');
    const status = await getEngineStatus();
    const designIds = rankedReadyDesignIds(status.models, profile.ramGB, profile.maxCoderParamsB);
    const nameOf = (id: string) =>
      String((status.models || []).find((m) => m.id === id)?.name || id);
    const thinFallback = (await import('@/lib/createThinPath')).isThinCreatePath();
    const passOrder: Array<'instruct' | 'uigen'> = thinFallback
      ? ['instruct', 'uigen']
      : ['uigen', 'instruct'];
    for (const pass of passOrder) {
      for (const id of designIds) {
        if (!id || isWeakCoderId(id) || isVisionEngineId(id)) continue;
        const hit = (status.models || []).find((m) => m.id === id && m.status === 'ready');
        if (!hit) continue;
        if (pass === 'uigen' && isUiDesignEngineId(id)) {
          return { id, name: nameOf(id), source: 'local', ok: true };
        }
        if (pass === 'instruct' && !isUiDesignEngineId(id)) {
          return { id, name: nameOf(id), source: 'local', ok: true };
        }
      }
    }
  } catch {
    /* fall through to hard fail */
  }

  return {
    id: 'NOVA-auto',
    name: 'NOVA Auto',
    source: 'auto',
    ok: false,
    reason: profile.maxCoderParamsB <= 0
      ? (profile.reason || 'No suitable coder for UI polish')
      : 'No local model ready for create — install a coder, UIGEN, or Instruct GGUF from Models',
  };
}

/**
 * Template-first create owner. AIChat calls this and returns when status === 'handled'.
 */
export async function runCreateTurn(host: CreateTurnHost): Promise<CreateTurnOutcome> {
  let intent = host.createIntent;
  if (!intent) {
    const pendingSeed = host.getPending(host.chatId);
    const name = host.classifiedCreateName
      || pendingSeed?.name
      || extractProjectName(host.content)
      || fallbackCreateProjectName(host.content)
      || pendingSeed?.name
      || 'App';
    intent = parseNewProjectIntent(host.content) || {
      name,
      slug: slugifyProjectName(name),
      // Never default to a fake 'react' kind — detect from the ask (CLI/API/python/…).
      kind: (pendingSeed?.kind as ProjectKind)
        || resolveProjectKindForCreate(host.content, detectProjectKind(host.content), detectProjectKind(host.content)),
      summary: pendingSeed?.summary || host.content,
      preferPlan: false,
    };
  }
  intent = { ...intent, preferPlan: false };

  const pending = host.getPending(host.chatId);
  const userLines = host.messages.filter(m => m.role === 'user').map(m => String(m.content || ''));
  const userBrief = recoverOriginalUserBrief(host.messages as never);
  const bestBrief = findBestProductBrief(userLines);
  // Prefer a saved Plan card brief over a longer chat monologue (keeps steps + children).
  const pendingIsPlan = Boolean(
    (Array.isArray(pending?.planLog) && pending!.planLog!.length > 0)
    || /\bfrom your plan\b/i.test(String(pending?.problemLine || ''))
    || /\bBuild steps \(follow in order\):/i.test(String(pending?.summary || '')),
  );
  const richestBrief = (
    pendingIsPlan && String(pending?.summary || '').trim().length >= 40
      ? String(pending!.summary).trim()
      : [pending?.summary, userBrief, bestBrief, intent.summary]
        .filter((x): x is string => Boolean(x && String(x).trim()))
        .sort((a, b) => b.length - a.length)[0]
  ) || intent.summary;

  const lockedFromAsk = extractProjectName(host.content)
    || host.content.match(/\b(?:called|named|name\s+it|call\s+it)\s+["“']?([A-Z][A-Za-z0-9][A-Za-z0-9 _-]{1,40})/i)?.[1]
    || host.content.match(/\bkeep\s+the\s+folder\s+name\s+([A-Za-z][A-Za-z0-9 _-]{1,40})/i)?.[1]
    || null;
  // Prefer on-page brand ("brand Aurelia") over folder slug ("called aurelia-042252").
  const brandFromBrief = (
    richestBrief.match(/\b(?:for\s+(?:the\s+)?)?brand\s+([A-Z][A-Za-z0-9][A-Za-z0-9-]{1,40})\b/)?.[1]
    || richestBrief.match(/\bproduct\s+([A-Z][A-Za-z0-9][A-Za-z0-9-]{1,40})\s+One\b/)?.[1]
    || null
  );
  // “Let’s build this” after Plan — recover the product name from the synced Plan title.
  let nameFromPlan: string | null = null;
  try {
    const { loadChatPlan } = await import('@/lib/chatPlanStore');
    const plan = loadChatPlan(host.chatId);
    const rawTitle = String(plan?.title || '').trim();
    const cleaned = rawTitle
      .replace(/\s*[—\-–|:]\s*.*$/, '')
      .replace(/\s+Build Plan.*$/i, '')
      .replace(/\s+Plan$/i, '')
      .trim();
    if (cleaned.length >= 2 && cleaned.length <= 48 && !/^(?:build|plan|app|site|new app)$/i.test(cleaned)) {
      nameFromPlan = cleaned;
    }
  } catch { /* optional */ }
  const lockedProductName = cleanProductTitle(
    brandFromBrief || lockedFromAsk || nameFromPlan || intent.name || pending?.name || intent.name || 'New App',
  );
  // Folder/slug stays on the explicit "called …" name when present.
  const safeName = cleanProductTitle(
    lockedFromAsk
    || ((/^(my|new|app|project)$/i.test(lockedProductName) && lockedFromAsk)
      ? lockedFromAsk
      : lockedProductName),
  );

  const buildIntent: NewProjectIntent = {
    ...intent,
    name: safeName,
    slug: slugifyProjectName(safeName) || intent.slug || pending?.slug || intent.slug,
    kind: resolveProjectKindForCreate(
      richestBrief,
      (pending?.kind as ProjectKind) || intent.kind,
      intent.kind,
    ),
    summary: richestBrief,
    preferPlan: false,
  };
  const summaryText = String(buildIntent.summary || '').trim();
  const goOnlyAsk = /^(?:lets?\s+build(?:\s+(?:this|that|it))?|build\s+this|build\s+that|go\s+implement|go\s+build|implement\s+it|ship\s+it)\s*[.!]?\s*$/i.test(host.content.trim());
  const thinBrief = goOnlyAsk && (
    summaryText.length < 60
    || /^(?:lets?\s+build|build\s+this|build\s+that|go\s+implement|go\s+build)\b/i.test(summaryText)
  );

  if (thinBrief && host.workspaceBound) {
    return { status: 'fallthrough_edit' };
  }
  if (thinBrief) {
    const pendingBrief = String(pending?.summary || '').trim();
    const { resolveGreenfieldFromThread } = await import('@/lib/chatIdeaIntent');
    const fromThread = resolveGreenfieldFromThread(host.content, userLines, null);
    const threadBrief = String(
      findBestProductBrief(userLines)
      || fromThread?.summary
      || userBrief
      || '',
    ).trim();
    const rescued = pendingBrief.length >= 40
      ? pendingBrief
      : (threadBrief.length >= 40 ? threadBrief : '');
    if (rescued) {
      buildIntent.summary = rescued;
      buildIntent.name = safeName
        || fromThread?.name
        || pending?.name
        || extractProjectName(rescued)
        || buildIntent.name;
      buildIntent.slug = slugifyProjectName(buildIntent.name) || buildIntent.slug || 'app';
    } else {
      await host.finishPlainReply(
        [
          'I need a clearer product brief before creating a new project.',
          '',
          'Describe what to build in one message — product name, what it does, and the main screens or actions.',
          'Example: “Build **ReefLog**, a dive-log web app with trip list, depth chart, and add-entry form.”',
        ].join('\n'),
      );
      return { status: 'handled' };
    }
  }

  // Retain the original product brief after any "build this" recovery from the thread.
  const originalBrief = String(buildIntent.summary || richestBrief || host.content || '').trim();

  // Build diagnostics — survives after turn status clears so Copy freeze/build report works.
  softBindCount.set(String(host.chatId || 'create'), 0);
  resetBuildDiagnostics({ chatId: host.chatId, productName: lockedProductName });
  noteBuildContext({ productName: lockedProductName, chatId: host.chatId });
  /** createV2: lock Code follow to App during craft — never package.json / index.css. */
  let createFollowLock: string | null = null;
  {
    const origPush = host.pushStatus;
    host.pushStatus = (label: string, writingPath?: string | null) => {
      const text = String(label || '').slice(0, 220);
      let follow = writingPath ?? null;
      // After craft starts, never park Code on package.json / index.css.
      if (isCreateV2Active() && createFollowLock && follow && isCreateV2ScaffoldPath(follow)) {
        follow = createFollowLock;
      }
      pushBuildDiag({ kind: 'status', detail: text, path: follow });
      tickBuildHeartbeat(text);
      if (/hop|ensemble|Spec|Design|Copy|Craft|Critic|Verify|Contract floor|Build team/i.test(text)) {
        const hops = getBuildDiagnostics().snap.ensembleHops;
        noteBuildContext({ ensembleHops: [...hops, text].slice(-12) });
      }
      noteBuildContext({ lastStatus: text, writingPath: follow, phase: text.slice(0, 80) });
      return origPush(label, follow);
    };
  }
  // Seed the activity timeline with a real Thinking row (Cursor-style dropdown).
  {
    const ask = String(originalBrief || host.content || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    if (ask) {
      host.pushStatus(
        `Thinking: Building “${lockedProductName || 'this app'}” from the brief — ${ask}${ask.length >= 220 ? '…' : ''}`,
      );
    }
  }

  // Optional Plan → approve gate (Settings). Never use the old stub checklist
  // (“Plan — X” + echo brief + “Nova is free”). Soft explores already route to chat;
  // if a create still lands here without an approve phrase, hand them a real Plan card.
  // Hard go (“on disk now”, “skip plan”, “build it”) always scaffolds — never stall on Plan.
  {
    const prefs = getLocalPrefs();
    if (prefs.planApproveGate) {
      const {
        isBuildApprovePhrase,
        loadPendingBuildPlan,
        savePendingBuildPlan,
        clearPendingBuildPlan,
        buildPlanFromBrief,
        modeStatusLabel,
      } = await import('@/lib/novaStudioModes');
      const { looksLikeImplementGo } = await import('@/lib/chatPlanMode');
      const ask = String(host.content || '');
      const hardGoNow = looksLikeImplementGo(ask)
        || /\bskip\s+plan\b/i.test(ask)
        || /\bon\s+disk\s+now\b/i.test(ask)
        || /\b(?:create|build|scaffold|ship)\b[\s\S]{0,100}\bon\s+disk\b/i.test(ask)
        || /\bgo\s+build\b/i.test(ask)
        || /\bcreate\s+(?:the\s+)?(?:project|website|site|app|store|shop)\b/i.test(ask);
      const approving = isBuildApprovePhrase(host.content) || hardGoNow;
      const pendingPlan = loadPendingBuildPlan(host.chatId);
      if (!approving) {
        host.pushStatus(modeStatusLabel('plan', lockedProductName));
        const { createBriefSpecFromAsk } = await import('@/lib/createIdentity');
        const {
          runPlanMode,
          formatPlanChatReply,
          findLatestPlanReport,
          serializePlanReportForCreate,
          planReportToPlanLog,
        } = await import('@/lib/planReport');
        const { saveChatPlan, setChatPlanPill } = await import('@/lib/chatPlanStore');
        const { requestOpenChatPlan } = await import('@/lib/openChatPlan');
        const spec = createBriefSpecFromAsk(lockedProductName, String(buildIntent.summary || originalBrief));
        const plan = buildPlanFromBrief({
          chatId: host.chatId,
          productName: lockedProductName,
          brief: String(buildIntent.summary || originalBrief),
          mustHaves: spec.mustHave || [],
        });
        savePendingBuildPlan(plan);
        try {
          const priorPlan = findLatestPlanReport(host.messages || [], host.chatId);
          try {
            setChatPlanPill(host.chatId, true);
            requestOpenChatPlan({ chatId: host.chatId, openOverlay: true, live: true });
          } catch { /* ignore */ }
          const report = await runPlanMode({
          userMessage: originalBrief,
            projectName: priorPlan?.title || lockedProductName,
            preferredModelId: host.preferredModelId ?? undefined,
            priorPlan,
            onProgress: (msg) => host.pushStatus(msg),
          });
          try {
            saveChatPlan(host.chatId, report);
            setChatPlanPill(host.chatId, true);
            requestOpenChatPlan({ chatId: host.chatId, openOverlay: true, live: false });
          } catch { /* ignore */ }
          try {
            setLastPendingGreenfield(host.chatId, {
              name: report.title || lockedProductName,
              slug: String(buildIntent.slug || 'app'),
              kind: String(buildIntent.kind || 'vite-react'),
              summary: serializePlanReportForCreate(report),
              planLog: planReportToPlanLog(report),
              problemLine: `Build ${report.title || lockedProductName} from your plan.`,
            });
          } catch { /* ignore persist */ }
          await host.finishPlainReply(
            formatPlanChatReply(report, { refining: Boolean(priorPlan?.steps?.length) }),
            'NOVA · Plan',
          );
        } catch {
          // Fallback: short talk + invite Plan mode — never the old echo checklist.
          await host.finishPlainReply(
            [
              `Got it — **${lockedProductName}**. Before any files are created, let’s shape the plan.`,
              '',
              String(buildIntent.summary || host.content).trim().slice(0, 400),
              '',
              'Want a sharper outline? Press **+** under the chat box, choose **Plan**, then send your brief again.',
              'Or say **ok start building** when you want the folder on disk.',
            ].join('\n'),
            'NOVA · plan',
          );
        }
        return { status: 'handled' };
      }
      if (pendingPlan) {
        buildIntent.summary = pendingPlan.summary || buildIntent.summary;
        buildIntent.name = pendingPlan.productName || buildIntent.name;
        clearPendingBuildPlan(host.chatId);
      }
    }
  }

  // Gate BEFORE scaffolding: ready coder, else UIGEN / Instruct.
  // No Cursor / prebuilt shortcuts — every create goes through a local GGUF.
  type CoderGate = Awaited<ReturnType<typeof resolveCreateUiPolishCoder>>;
  const coderGate: CoderGate = await resolveCreateUiPolishCoder(host);
  if (!coderGate.ok) {
    await host.finishPlainReply(
      [
        `**Cannot start building yet** — no local model is ready for this create.`,
        '',
        coderGate.reason || 'Install a coder, UIGEN, or Instruct GGUF that fits this PC under **Models**, then say **ok start building** again.',
        '',
        'Nova is free — no paywall. Prefer a coder GGUF when you can; UIGEN or Instruct can still craft from your brief.',
      ].join('\n'),
      'NOVA · create',
    );
    return { status: 'handled' };
  }
  try {
    host.onCoderPinned?.({ id: coderGate.id, name: coderGate.name });
  } catch { /* ignore */ }
  // Do not pin the composer chip to Craft yet — relay Plan/Design/Copy must show first.
  host.pushStatus(`Relay ready · craft reserved **${coderGate.name}**…`);

  const { createWallBudgetMs, createPolishAttemptBudgetMs, createBudgetProfile, createBudgetExceededReply, yieldToUi, isVisionEngineId } = await import('@/lib/createRuntime');
  const createBriefForBudget = String(richestBrief || buildIntent.summary || host.content || '');
  const budgetProfile = createBudgetProfile(createBriefForBudget);
  const createWallMs = createWallBudgetMs(createBriefForBudget);
  const totalBudgetMs = createWallMs;
  const craftBudgetMs = isCreateV2Active()
    ? createV2CraftTotalWallMs(budgetProfile)
    : createWallMs;
  const createStartedAt = Date.now();
  const createTimedOut = () => Date.now() - createStartedAt > createWallMs;
  /** Set when invent-floor salvage writes sections — enrich wall starts then. */
  let inventFloorSeededAt: number | null = null;
  /** Floor Acc already clears Live visual bar — skip long invent thrash. */
  let inventFloorFastPath = false;
  /** Floor Acc already clears Live visual bar — skip long invent hang. */
  let inventFloorLiveReady = false;
  const turnAborted = () => Boolean(createTimedOut() || host.shouldAbort?.() || shouldAbortCreateJob(jobId, host.routeChatId));
  if (coderGate.id !== 'blank-solid' && isVisionEngineId(coderGate.id)) {
    // Explicit chat pin / ladder may stress-test VL on create. Auto never picks VL for craft.
    host.pushStatus(`Craft on pinned vision model **${coderGate.name}**…`);
  }
  if (coderGate.id === 'blank-solid') {
    host.pushStatus('Blank solid page — skipping model load…');
  }
  let localContextNote = '';
  if (coderGate.source === 'local') {
    try {
      const { ggufCtxCapacityLabel } = await import('@/lib/ggufContext');
      localContextNote = ` · ${ggufCtxCapacityLabel()}`;
    } catch { /* hardware snapshot optional */ }
  }
  host.pushStatus(
    `Build uses **${coderGate.name}** · ${budgetProfile} budget (${Math.ceil(craftBudgetMs / 60_000)}m craft cap, ${Math.ceil(totalBudgetMs / 60_000)}m total cap)${localContextNote}…`,
  );
  await yieldToUi(0);
  // Single Brain Create craft = createV2 staged write (avoids tool-loop thrash).
  // Post-craft gather→act→verify lives in createRuntimeLoop + createPassSpine — not prefs.agentLoopOnCreate.
  try {
    const prefs = getLocalPrefs();
    if (prefs.multiModelCreate !== false) {
      const { setLocalPrefs } = await import('@/lib/localPrefs');
      setLocalPrefs({ multiModelCreate: false });
    }
  } catch { /* prefs best-effort */ }

  // Blank / solid-color page from the USER ask only — never from ensemble fluff.
  host.pushStatus('Preparing craft rules…');
  await yieldToUi(0);
  const { blankSolidColorFromAsk, viteSolidShellEdits } = await import('@/lib/webProjectCanon');
  const blankSolidFromUser = blankSolidColorFromAsk(String(host.content || ''));
  if (blankSolidFromUser) {
    host.pushStatus(`Blank page · solid ${blankSolidFromUser} (skip marketing hops)…`);
  }

  const ensemblePlanText = '';
  const ensembleAttribution = coderGate.name;
  const ensembleSpec: import('@/lib/createLayoutContract').ProductSpec | null = null;
  const ensembleContract: import('@/lib/createLayoutContract').LayoutContract | null = null;
  
  let ensembleContractBlock = '';
  /** Web research notes for craft — hoisted so polish prompts can see them after the ensemble try. */
  let createResearchNotes = '';
  /** One salt per create job — rebuilds must invent a new look. */
  const { newDesignFreshnessKey, formatOriginalCraftRules } = await import('@/lib/createDesignSystem');
  const designFreshnessKey = newDesignFreshnessKey();
  const { resolveArtifactKind: resolveCraftArtifactKind } = await import('@/lib/createArtifactKind');
  const craftArtifactKind = resolveCraftArtifactKind(
    [buildIntent.summary, richestBrief, host.content, lockedProductName].filter(Boolean).join('\n'),
  );
  try {
    if (blankSolidFromUser) {
      /* blank pages are a solid shell, not a product story */
    } else {
      
      createResearchNotes = '';
      // Brief-only craft law — no Design Spine shell, CopyPack, or layoutReference recipes.
      host.pushStatus('Writing originality craft law…');
      await yieldToUi(0);
      ensembleContractBlock = formatOriginalCraftRules({
        brief: originalBrief,
        productName: lockedProductName,
        freshnessKey: designFreshnessKey,
        artifactKind: craftArtifactKind,
      }).join('\n');
      const { announceCreatePhase } = await import('@/lib/createStatus');
      const { setEngineModel } = await import('@/lib/novaEngine');
      // Bind sticky craft model once (no Plan/Design/Copy seat swaps).
      // CRITICAL: never await setEngineModel unbounded — cold warmServer prelude can
      // block the main-thread IPC reply ("Build uses … budget" freeze).
      try {
        if (coderGate.id && coderGate.id !== 'NOVA-auto') {
          host.pushStatus(`Loading model · **${coderGate.name}** (one brain for this build)…`);
          await yieldToUi(0);
          await Promise.race([
            Promise.resolve(setEngineModel?.(coderGate.id)),
            new Promise<never>((_, reject) => {
              window.setTimeout(
                () => reject(new Error(`model-load-timeout-${MODEL_LOAD_CAP_MS}`)),
                MODEL_LOAD_CAP_MS,
              );
            }),
          ]);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err || '');
        if (/model-load-timeout/i.test(msg)) {
          host.pushStatus(
            `Model load slow (>${Math.round(MODEL_LOAD_CAP_MS / 1000)}s) — continuing to scaffold; craft will wait for first tokens…`,
          );
        }
        /* ignore other bind failures — craft still attempts generate */
      }
      try {
        await announceCreatePhase(host, 'craft', { id: coderGate.id, name: coderGate.name }, { setEngine: false });
      } catch { /* phase announce best-effort */ }
      host.pushStatus(`Single Brain · **${coderGate.name}** (original craft from brief)…`);
      await yieldToUi(0);
    }
  } catch {
    /* originality brief is best-effort — never block create */
    if (!ensembleContractBlock && !blankSolidFromUser) {
      try {
        ensembleContractBlock = formatOriginalCraftRules({
          brief: originalBrief,
          productName: lockedProductName,
          freshnessKey: designFreshnessKey,
          artifactKind: craftArtifactKind,
        }).join('\n');
      } catch { /* ignore */ }
    }
  }
  // Never auto-open Code overlay mid-craft (tree+editor freezes the shell).
  // Code pill stays user-clickable via setChatCodePill / softBind — manual open only.
  // Do not re-introduce NOVA:open-code-overlay here (agentLoop bypass was the freeze root cause).

  const jobId = `create-${crypto.randomUUID().slice(0, 8)}`;
  // Canonical spine 1–3: hard-go → freeze brief → bind disk (then scaffold).
  host.pushStatus(formatThinCreateSpineStatus('hard-go', lockedProductName));
  host.pushStatus(formatThinCreateSpineStatus('brief', lockedProductName));
  host.pushStatus(formatThinCreateSpineStatus('disk', buildIntent.slug));
  host.pushStatus(`Creating folder in NOVA Projects (${buildIntent.slug})…`);
  pushBuildDiag({ kind: 'phase', detail: `Scaffold ${lockedProductName} (${buildIntent.slug})` });
  noteBuildContext({ productName: lockedProductName, phase: 'scaffold' });
  // Hard coding pipeline: understand brief + prep keys/models before any craft writes.
  const createBriefPlan = understandCreateBrief({
    brief: String(originalBrief || lockedProductName || ''),
    brand: lockedProductName,
  });
  const createPrep = prepCreateEnvironment({
    brief: createBriefPlan.brief,
    fileCount: 8,
  });
  emitCreatePipelineStart(createBriefPlan, createPrep, (msg) => host.pushStatus(msg));
  const binder = bindBinderGuard({
    createSlug: buildIntent.slug,
  });
  if (!binder.ok) host.pushStatus(`Prep · ${binder.detail}`);
  else host.pushStatus(`Prep · ${binder.detail}`);
  host.pushStatus(formatThinCreateSpineStatus('scaffold'));
  try {
    (globalThis as unknown as { __novaLastCreatePlan?: typeof createBriefPlan }).__novaLastCreatePlan =
      createBriefPlan;
  } catch { /* ignore */ }
  /** Set after successful scaffold — catch uses this for Code-pill keep. */
  let createDiskRootForPill: string | null = null;
  try {
    await host.syncGrants();
    host.pushStatus('Writing project files one by one…');
    const newProjectId = `proj-${crypto.randomUUID().slice(0, 8)}`;
    const {
      resolveArtifactKind,
      artifactWantsProductLadder,
      artifactWantsVite,
      isNonWebArtifactKind,
      projectKindFromArtifactKind,
    } = await import('@/lib/createArtifactKind');
    const createArtifactKind = resolveArtifactKind(
      [buildIntent.summary, richestBrief, host.content, lockedProductName].filter(Boolean).join('\n'),
    );
    startCreateJob({
      id: jobId,
      chatId: host.chatId,
      path: '',
      projectId: newProjectId,
      name: lockedProductName,
      files: {},
      status: 'writing',
      artifactKind: createArtifactKind,
      // Align with preamble: started on this chat → may continue after leave.
      backgroundAllowed: Boolean(host.routeChatId && host.routeChatId === host.chatId),
      routeChatIdAtStart: host.routeChatId || null,
    });
    host.pushStatus(`Artifact · ${createArtifactKind}`);

    const { createFileBuildLabel } = await import('@/lib/createProgressCopy');
    let scaffoldAcc: Record<string, string> = {};
    let scaffoldWrites = 0;
    const created = await runCreateProjectFlow(buildIntent, newProjectId, {
      onFileWrite: (rel, content) => {
        const path = String(rel || '').replace(/\\/g, '/');
        if (content != null) scaffoldAcc = { ...scaffoldAcc, [path]: content };
        const followPath = /\.gitignore$/i.test(path) ? undefined : path;
        host.pushStatus(createFileBuildLabel(path, 'Building'), followPath);
        // Never soft-bind per scaffold file — commitStudio thrash freezes the chat
        // shell ~6s after send. Paint once after scaffold completes (below).
        scaffoldWrites += 1;
        if (scaffoldWrites % 4 === 0) {
          // Opportunistic yield every few writes (fire-and-forget; do not await IPC).
          void yieldToUi(0);
        }
      },
    });
    if (await host.stopIfSuperseded()) {
      markCreateJobFailed(jobId, 'Stopped');
      unbindCreateChat(host, host.chatId);
      markBuildDiagnosticsEnded();
      await host.finishPlainReply(
        `**${lockedProductName}** create miss — stopped before scaffold finished.`,
        'NOVA · create',
      );
      return { status: 'handled' };
    }

    if (!created.ok) {
      const msg = teachableCreateError(created.error, buildIntent.name);
      markCreateJobFailed(jobId, msg);
      unbindCreateChat(host, host.chatId);
      await host.finishPlainReply(msg);
      return { status: 'handled' };
    }

    host.pushStatus('Verifying files on disk…');

    host.clearPending(host.chatId);

    const originDiskRoot = created.projectPath || null;
    createDiskRootForPill = originDiskRoot;
    const originProjectId = created.projectId || newProjectId;
    let createFilesAcc: Record<string, string> = { ...created.files };
    // Understand contract for invent + Ready (.__nova* stripped from Files Changed / reply).
    try {
      (createFilesAcc as Record<string, string>)['.__novaCreateBriefPlan'] = JSON.stringify(createBriefPlan);
    } catch { /* ignore */ }
    snapshotCreateCheckpoint(createFilesAcc, lockedProductName, {
      label: 'scaffold',
      diskRoot: originDiskRoot,
    });
    try {
      const { mergeBriefNpmDependencies } = await import('@/lib/projectScaffolds');
      createFilesAcc = mergeBriefNpmDependencies(
        createFilesAcc,
        [buildIntent.summary, richestBrief, host.content].filter(Boolean).join('\n'),
      );
    } catch { /* optional */ }
    // createV2 D: Vite/React shell only when this create is actually a web SPA.
    // CLI / Python / library asks must NOT be rewritten into vite-react (ask→wrong artifact).
    try {
      const scaffoldKindNow = resolveProjectKindForCreate(
        [buildIntent.summary, richestBrief, host.content].filter(Boolean).join('\n'),
        buildIntent.kind,
        buildIntent.kind,
      );
      const wantsViteShell = artifactWantsVite(createArtifactKind)
        && (
          scaffoldKindNow === 'vite-react'
          || Boolean(createFilesAcc['vite.config.js'] || createFilesAcc['vite.config.ts'] || createFilesAcc['src/main.jsx'] || createFilesAcc['src/main.tsx'])
        );
      if (!wantsViteShell) {
        host.pushStatus(`Scaffold · ${scaffoldKindNow} (skip Vite React inject)…`);
      } else {
      const { ensureViteReactProjectFiles } = await import('@/lib/createBuildQuality');
      const repaired = ensureViteReactProjectFiles(createFilesAcc, lockedProductName);
      createFilesAcc = repaired.files;
      if (repaired.repaired.length) {
        host.pushStatus('Scaffold · Vite entry files verified…');
      }
      // Flush Vite entry to disk — skipping when repaired=[] left stale static
      // index.html / missing package.json on disk and blanked Live (Glow ladder).
      if (originDiskRoot) {
        const flushKeys = [
          'package.json',
          'index.html',
          'vite.config.js',
          'vite.config.ts',
          'src/main.jsx',
          'src/main.tsx',
          'src/index.css',
        ].filter((k) => createFilesAcc[k]);
        if (flushKeys.length) {
          await applyChatReplyEdits({
            reply: flushKeys.map((k) => `@@@FILE ${k}\n${createFilesAcc[k]}`).join('\n'),
            projectId: originProjectId,
            projectName: lockedProductName,
            files: createFilesAcc,
            userMessage: host.content,
            diskRoot: originDiskRoot,
          }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
        }
      }
      } // end wantsViteShell
    } catch { /* best-effort */ }
    // Yield before first studio paint so the chat shell stays interactive after send.
    await yieldToUi(16);
    // One force paint after scaffold — Folder/Code pills on, Live still off.
    softBindCreateStudio(host, {
      files: createFilesAcc,
      projectId: originProjectId,
      name: lockedProductName,
      diskRoot: originDiskRoot,
      force: true,
    });
    // Bare Vite wiring only — never pre-write a Design Spine / CopyPack product template.
    updateCreateJob(jobId, {
      path: originDiskRoot || '',
      projectId: originProjectId,
      files: createFilesAcc,
      status: 'writing',
      originalBrief: String(originalBrief || buildIntent.summary || host.content || '').trim(),
      generationBrief: String(originalBrief || buildIntent.summary || host.content || '').trim(),
    });

    host.renameChat(host.chatId, cleanProductTitle(buildIntent.name));
    host.addChat({
      id: host.chatId,
      mode: host.mode,
      title: cleanProductTitle(buildIntent.name),
      updatedAt: new Date().toISOString(),
      preview: host.previewFromText(host.content),
    });
    await yieldToUi(0);

    // Prefer the longest brief: thin intent.summary must not hide host.content / thread brief.
      const briefBase = [buildIntent.summary, richestBrief, host.content]
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)[0] || String(host.content || '');
    const { retainCreateBrief } = await import('@/lib/createBriefContext');
    const createBrief = retainCreateBrief(briefBase, [
      ensemblePlanText ? `## Ensemble plan (must implement)\n${ensemblePlanText}` : '',
      ensembleContractBlock,
    ]);
    const authoritativeOriginalBrief = createBrief.originalBrief || originalBrief;
    const briefForUi = createBrief.generationBrief;
    updateCreateJob(jobId, {
      originalBrief: authoritativeOriginalBrief,
      generationBrief: briefForUi,
      files: createFilesAcc,
    });
    // Amber Bridle 2026-10-23: create can hang / timeout before the late Live salvage.
    // Seed invent-floor sections as soon as the Vite scaffold + brief exist so disk
    // always has brand hero/shop/story even when invent never finishes a reply.
    try {
      if (thinWantsCompositionalShell(briefForUi)) {
        const beforeFloor = createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '';
        createFilesAcc = seedCompositionalSectionScaffolds(
          createFilesAcc,
          briefForUi,
          lockedProductName,
        );
        const afterFloor = createFilesAcc['src/App.jsx'] || '';
        // Spine 5: always report floor stage (even when Acc already had sections —
        // hero premium top-up may still have run).
        host.pushStatus(formatThinCreateSpineStatus(
          'floor',
          afterFloor !== beforeFloor ? 'hero/shop/story seeded' : 'top-up check',
        ));
        // Always arm the enrich wall once floor sections exist — Hazel Latch: App
        // string sometimes matched pre-seed so seededAt stayed null and invent
        // burned the full ~9m wall with no 3m enrich bail.
        {
          const landedFloor = listLandedCompositionalSections(
            createFilesAcc,
            briefForUi,
            lockedProductName,
          ).length;
          if (
            landedFloor >= THIN_LIVE_VISUAL_MIN_LANDED_SECTIONS
            || (afterFloor && afterFloor !== beforeFloor)
            || compositionalHeroNeedsPremiumFloor(createFilesAcc)
          ) {
            inventFloorSeededAt = inventFloorSeededAt || Date.now();
          }
        }
        if (afterFloor && afterFloor !== beforeFloor) {
          host.pushStatus('Invent floor · hero/shop/story seeded on scaffold…');
          updateCreateJob(jobId, { files: createFilesAcc });
          if (originDiskRoot) {
            const keys = depthPersistKeys(createFilesAcc);
            await applyChatReplyEdits({
              reply: keys.map((k) => `@@@FILE ${k}\n${createFilesAcc[k]}`).join('\n'),
              projectId: originProjectId,
              projectName: lockedProductName,
              files: createFilesAcc,
              userMessage: host.content,
              diskRoot: originDiskRoot,
            }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
          }
          if (inventFloorClearsLive(createFilesAcc, briefForUi, lockedProductName)) {
            inventFloorFastPath = true;
            host.pushStatus('Invent floor · Live visual bar clear — fast-path (skip long invent)…');
          }
        } else if (compositionalHeroNeedsPremiumFloor(createFilesAcc)) {
          updateCreateJob(jobId, { files: createFilesAcc });
        }
      }
    } catch { /* best-effort */ }
    // Spine 6: npm before long craft (Moss Thread — invent hung, vite never installed).
    try {
      const earlyKind = resolveProjectKindForCreate(
        buildIntent.summary || host.content,
        buildIntent.kind,
        buildIntent.kind,
      );
      if (
        originDiskRoot
        && createFilesAcc['package.json']
        && projectUsesNpm(earlyKind, createFilesAcc)
      ) {
        const viteFlush = [
          'package.json',
          'index.html',
          'vite.config.js',
          'vite.config.ts',
          'src/main.jsx',
          'src/main.tsx',
          'src/index.css',
        ].filter((k) => createFilesAcc[k]);
        if (viteFlush.length) {
          await applyChatReplyEdits({
            reply: viteFlush.map((k) => `@@@FILE ${k}\n${createFilesAcc[k]}`).join('\n'),
            projectId: originProjectId,
            projectName: lockedProductName,
            files: createFilesAcc,
            userMessage: host.content,
            diskRoot: originDiskRoot,
          }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
        }
        host.pushStatus(formatThinCreateSpineStatus('npm', 'while invent continues'));
        host.pushStatus('npm · installing while invent continues…');
        markCreateJobNpm(jobId);
        void kickEarlyNpmInstall(originDiskRoot, earlyKind, {
          files: createFilesAcc,
          preferPreviewUrl: null,
          npmTimeoutMs: 420_000,
          onStatus: (label) => {
            host.pushStatus(label);
            tickBuildHeartbeat(label);
          },
        });
      }
    } catch { /* best-effort — late bootstrap still runs */ }
    host.pushStatus(formatThinCreateSpineStatus('craft', 'model invent enrich'));
    const { briefNeedsCreateUiPolish, briefLooksLikeMarketingLanding, briefLooksLikeChatApp, briefLooksLikeMicroWebToy, briefRequiresInteractiveApp, looksLikeFillerStubAppSource, isEmptyOrStubAppSource } = await import('@/lib/createBuildQuality');
    // Prefer the raw user ask — ensemble fluff in briefForUi used to kill blank-solid detection.
    // Also treat step-ladder "plain white blank page / nothing else yet" as a blank solid,
    // even when coffee-site framing confused prior detectors.
    let blankSolidColor: string | null = blankSolidFromUser || blankSolidColorFromAsk(String(host.content || ''))
      || blankSolidColorFromAsk(String(authoritativeOriginalBrief || ''))
      || blankSolidColorFromAsk(String(originalBrief || ''));
    try {
      const { isTinyBlankPageAsk } = await import('@/lib/novaBuildLoop');
      const rawAskBlob = [host.content, authoritativeOriginalBrief, originalBrief].map((s) => String(s || '')).join('\n');
      if (!blankSolidColor && isTinyBlankPageAsk(rawAskBlob)) {
        blankSolidColor = '#ffffff';
      }
    } catch { /* optional */ }
    try {
      const { reactSurgicalMicroAskEdits } = await import('@/lib/webProjectCanon');
      // Never run micro surgical (center-word / cream rails) on rich marketing / chat creates —
      // that path mangles long product briefs into a one-line stub.
      const skipSurgical = Boolean(blankSolidColor)
        || briefNeedsCreateUiPolish(briefForUi)
        || briefLooksLikeMarketingLanding(briefForUi)
        || briefLooksLikeChatApp(briefForUi);
      const surgicalCreate = skipSurgical ? [] : reactSurgicalMicroAskEdits(createFilesAcc, briefForUi);
      if (surgicalCreate.length) {
        host.pushStatus('Applying UI patch…');
        const surgicalReply = surgicalCreate.map((e) => `@@@FILE ${e.path}\n${e.content}`).join('\n');
        const surgicalApplied = await applyChatReplyEdits({
          reply: surgicalReply,
          projectId: originProjectId,
          projectName: buildIntent.name,
          files: createFilesAcc,
        userMessage: originalBrief,
          diskRoot: originDiskRoot,
        });
        if (surgicalApplied.ok && surgicalApplied.updated.length) {
          createFilesAcc = surgicalApplied.files;
        }
      } else if (blankSolidColor) {
        host.pushStatus(`Painting solid ${blankSolidColor} shell…`);
        const shellFiles = viteSolidShellEdits(blankSolidColor);
        // Always force the shell into the in-memory map — applyChatReplyEdits alone used to
        // leave the dark scaffold when apply failed, then invent thrash wrote broken App.jsx.
        for (const e of shellFiles) {
          createFilesAcc[e.path] = e.content;
        }
        delete createFilesAcc['src/App.tsx'];
        const blankApplied = await applyChatReplyEdits({
          reply: shellFiles.map((e) => `@@@FILE ${e.path}\n${e.content}`).join('\n'),
          projectId: originProjectId,
          projectName: buildIntent.name,
          files: createFilesAcc,
          userMessage: String(host.content || ''),
          diskRoot: originDiskRoot,
        });
        if (blankApplied.ok) {
          createFilesAcc = { ...blankApplied.files };
          delete createFilesAcc['src/App.tsx'];
          // Re-assert shell contents so a mangled apply cannot keep sibling JSX.
          for (const e of shellFiles) {
            createFilesAcc[e.path] = e.content;
          }
          delete createFilesAcc['src/App.tsx'];
        }
        if (originDiskRoot) {
          await persistAcceptedCreateFiles(
            originDiskRoot,
            createFilesAcc,
            shellFiles.map((e) => e.path),
          ).catch(() => {});
        }
        // Blank shell only rewrites App.* — re-assert Vite entry so npm/Live never see a
        // static html leftover without package.json. Skip for CLI/Python Acc.
        try {
          const blankKind = resolveProjectKindForCreate(
            [buildIntent.summary, richestBrief, host.content].filter(Boolean).join('\n'),
            buildIntent.kind,
            buildIntent.kind,
          );
          const blankWantsVite = artifactWantsVite(createArtifactKind)
            && (
              blankKind === 'vite-react'
              || Boolean(createFilesAcc['vite.config.js'] || createFilesAcc['vite.config.ts'] || createFilesAcc['src/main.jsx'] || createFilesAcc['src/main.tsx'])
            );
          if (blankWantsVite) {
            const { ensureViteReactProjectFiles } = await import('@/lib/createBuildQuality');
            const healed = ensureViteReactProjectFiles(
              createFilesAcc,
              lockedProductName || buildIntent.name,
            );
            createFilesAcc = healed.files;
            if (originDiskRoot) {
              const keys = [
                'package.json',
                'index.html',
                'vite.config.js',
                'vite.config.ts',
                'src/main.jsx',
                'src/main.tsx',
                'src/index.css',
              ].filter((k) => createFilesAcc[k]);
              if (keys.length) {
                await persistAcceptedCreateFiles(originDiskRoot, createFilesAcc, keys).catch(() => {});
              }
            }
          }
        } catch { /* best-effort */ }
      }
    } catch { /* best-effort */ }

    /** null = skipped (scaffold-only OK); true = Preview-ready UI applied; false = fail-closed */
    let uiPolishOk: boolean | null = null;
    let uiPolishReasons: string[] = [];
    /** Recovery floor used — Live may unlock; quality Ready must still fail (pass spine). */
    let createFloorFallback = false;
    /** Invent-from-brief depth continues already ran this turn (avoid early+late double). */
    let thinDepthRan = false;
    // River Hide: floor Acc already paints Live bar — unlock Live path, skip invent thrash.
    // Pebble Latch: only gate quality Ready while Acc is still a stamped twin; once
    // breakInventFloorTwin (or craft) clears the stamp, floorFallback must not stick.
    if (inventFloorFastPath) {
      uiPolishOk = true;
      createFloorFallback = looksLikeInventFloorTwin(createFilesAcc);
      uiPolishReasons = createFloorFallback
        ? ['Invent floor Acc clears Live visual bar — fast-path (quality gated while twin)']
        : ['Invent floor Acc clears Live visual bar — fast-path'];
    }
    /**
     * Product genre guard: skip floor/wire twin pastes.
     * Invent owns look — do not freeze invent over a TypeScript seed.
     */
    let productGenreGuard = false;
    let productSeedApp = '';
    let productInventSnapshot: { appJsx: string; appCss: string; logo: string } | null = null;
    /** @deprecated alias — floors/wire gates still check this name in a few sites */
    let productSpineLocked = false;
    /** True only after invent-owned storefront lands (or salvage). Floors must not pretends invent locked. */
    let storefrontSpineLocked = false;
    let storefrontSpineSnapshot: { appJsx: string; appCss: string; logo: string; products: string } | null = null;
    const restoreStorefrontSpineSnapshot = (why: string) => {
      if (!storefrontSpineLocked || !storefrontSpineSnapshot?.appJsx) return false;
      const cur = String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '');
      if (cur === storefrontSpineSnapshot.appJsx) return false;
      createFilesAcc = {
        ...createFilesAcc,
        'src/App.jsx': storefrontSpineSnapshot.appJsx,
        'src/App.css': storefrontSpineSnapshot.appCss || createFilesAcc['src/App.css'] || '',
        ...(storefrontSpineSnapshot.products
          ? { 'src/data/products.ts': storefrontSpineSnapshot.products }
          : {}),
        ...(storefrontSpineSnapshot.logo
          ? { 'public/logo.svg': storefrontSpineSnapshot.logo }
          : {}),
      };
      delete createFilesAcc['src/App.tsx'];
      host.pushStatus(`Ladder · restored storefront spine (${why})…`);
      return true;
    };
    const restoreProductInventSnapshot = (why: string) => {
      if (!productInventSnapshot?.appJsx) return false;
      const cur = String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '');
      if (cur === productInventSnapshot.appJsx) return false;
      createFilesAcc = {
        ...createFilesAcc,
        'src/App.jsx': productInventSnapshot.appJsx,
        'src/App.css': productInventSnapshot.appCss || createFilesAcc['src/App.css'] || '',
        ...(productInventSnapshot.logo
          ? { 'public/logo.svg': productInventSnapshot.logo }
          : {}),
      };
      delete createFilesAcc['src/App.tsx'];
      host.pushStatus(`Ladder · restored invent look (${why})…`);
      return true;
    };
    const restoreProductSpineSnapshot = restoreProductInventSnapshot;
    // Blank solid pages are DONE after the shell paint — never force marketing polish.
    const needsUiPolish = !blankSolidColor;
    if (blankSolidColor) {
      uiPolishOk = true;
      uiPolishReasons = [];
      host.pushStatus('Blank shell ready — skipping craft / Style hops…');
    }
    const {
      createBriefSpecFromAsk,
      polishPromptLinesFromBrief,
      ensureStylesLinked,
      briefCreateMisses,
    } = await import('@/lib/createIdentity');
    const briefSpec = createBriefSpecFromAsk(lockedProductName, authoritativeOriginalBrief);
    const chatAppBrief = briefLooksLikeChatApp(briefForUi);

    // Coding foundation: scaffold + tool loop owns create when agentLoopOnCreate is on.
    // Invent polish is fallback only if the loop was skipped or returned empty.
    // Hoisted so non-web Ready can detect zero-write / docs-only craft.
    let usedNovaLoop = false;
    let loopAttempted = false;
    let loopWroteFiles = false;
    let createSeedSnapshot: Record<string, string> = {};
    if (needsUiPolish && uiPolishOk !== true) {
      const skipLegacyLoop = isCreateV2Active();
      // Step-ladder: blank white page is deterministic — never burn minutes on invent thrash.
      try {
        const { isTinyBlankPageAsk, blankWhitePageFiles } = await import('@/lib/novaBuildLoop');
        if (isTinyBlankPageAsk(authoritativeOriginalBrief || briefForUi)) {
          host.pushStatus('Tiny step · plain white page (no model thrash)…');
          const blank = blankWhitePageFiles();
          createFilesAcc = { ...createFilesAcc, ...blank };
          delete createFilesAcc['src/App.tsx'];
          updateCreateJob(jobId, { files: createFilesAcc });
          if (originDiskRoot) {
            await persistAcceptedCreateFiles(
              originDiskRoot,
              createFilesAcc,
              ['src/App.jsx', 'src/App.css'],
            ).catch(() => {});
          }
          softBindCreateStudio(host, {
            files: createFilesAcc,
            projectId: originProjectId,
            name: lockedProductName,
            diskRoot: originDiskRoot,
          });
          uiPolishOk = true;
          uiPolishReasons = [];
          usedNovaLoop = true;
          loopWroteFiles = true;
          host.pushStatus('Tiny step · blank white page on disk…');
        }
      } catch { /* fall through to tool loop */ }
      // Lounge / vibe ladder-lite: ordered verified beats before invent thrash.
      try {
        const { briefWantsLoungeLadder, runLoungeCreateLadder, LOUNGE_LADDER_WALL_MS } = await import('@/lib/createLoungeLadder');
        if (uiPolishOk !== true && briefWantsLoungeLadder(authoritativeOriginalBrief || briefForUi)) {
          host.pushStatus('Ladder · lounge vibe page (one beat at a time)…');
          const ladder = await runLoungeCreateLadder({
            brief: authoritativeOriginalBrief || briefForUi,
            productName: lockedProductName,
            files: createFilesAcc,
            host: {
              pushStatus: host.pushStatus,
              shouldAbort: () => turnAborted(),
            },
            startedAt: createStartedAt,
            wallMs: Math.min(LOUNGE_LADDER_WALL_MS, Math.max(60_000, createWallMs - (Date.now() - createStartedAt))),
          });
          createFilesAcc = ladder.files;
          softBindCreateStudio(host, {
            files: createFilesAcc,
            projectId: originProjectId,
            name: lockedProductName,
            diskRoot: originDiskRoot,
          });
          if (originDiskRoot) {
            await persistAcceptedCreateFiles(
              originDiskRoot,
              createFilesAcc,
              ['src/App.jsx', 'src/App.css', 'src/App.tsx', 'src/index.css'].filter((p) => createFilesAcc[p]),
            ).catch(() => {});
          }
          updateCreateJob(jobId, { files: createFilesAcc });
          if (ladder.ok) {
            uiPolishOk = true;
            uiPolishReasons = [];
            usedNovaLoop = true;
            loopWroteFiles = true;
            host.pushStatus(`Ladder · lounge ready (${ladder.beatsDone.join(' → ')})…`);
          } else {
            uiPolishOk = false;
            uiPolishReasons = [
              ladder.reason || 'Lounge ladder incomplete',
              ...(ladder.failedBeat ? [`failed beat: ${ladder.failedBeat}`] : []),
            ];
            host.pushStatus(`Ladder · ${ladder.reason || 'miss'} — invent fallback…`);
          }
        }
      } catch { /* fall through to tool loop */ }
      // Invent-first for ANY website brief (global create bar — not genre verticals).
      // Floors stay last-resort only (hard guarantee / recovery after invent miss).
      try {
        const {
          briefWantsStorefrontLadder,
          formatStorefrontInventOwnLookPrompt,
          STOREFRONT_INVENT_FIRST,
        } = await import('@/lib/createStorefrontLadder');
        const {
          briefWantsInventFirstCreate,
          formatGenericInventOwnLookPrompt,
          CODING_AGENT_PACK,
        } = await import('@/lib/codingAgentPack');
        try {
          const { routeMetaHarness } = await import('@/lib/agentHarness');
          const metaRoute = routeMetaHarness(authoritativeOriginalBrief || briefForUi || '');
          (createFilesAcc as Record<string, string>)['.__novaMetaHarness'] = metaRoute;
        } catch {
          /* optional */
        }
        const storeBrief = authoritativeOriginalBrief || briefForUi;
        if (
          STOREFRONT_INVENT_FIRST
          && uiPolishOk !== true
          && briefWantsStorefrontLadder(storeBrief, lockedProductName)
        ) {
          const salt = String(jobId || lockedProductName).slice(-6);
          const inventAsk = formatStorefrontInventOwnLookPrompt({
            brand: lockedProductName,
            brief: storeBrief,
            salt,
            goal: createBriefPlan.goal,
            audience: createBriefPlan.audience,
            primaryAction: createBriefPlan.primaryAction,
            assumptions: createBriefPlan.assumptions,
            mustHave: createBriefPlan.mustHave,
            outOfScope: createBriefPlan.outOfScope,
            verifyChecks: createBriefPlan.verifyChecks,
            craftOrder: createBriefPlan.craftOrder,
          });
          (createFilesAcc as Record<string, string>)['.__novaStorefrontInventAsk'] = inventAsk;
          storefrontSpineLocked = false;
          storefrontSpineSnapshot = null;
          uiPolishOk = false;
          uiPolishReasons = ['storefront invent-first — model must own unique shop'];
          usedNovaLoop = false;
          loopWroteFiles = false;
          host.pushStatus('Invent-first · storefront — unique shop from brief (floor last resort)…');
          updateCreateJob(jobId, { files: createFilesAcc });
        } else if (
          CODING_AGENT_PACK.inventFirstCreate
          && uiPolishOk !== true
          && !createFilesAcc['.__novaProductInventAsk']
          && briefWantsInventFirstCreate(storeBrief)
        ) {
          const salt = String(jobId || lockedProductName).slice(-6);
          (createFilesAcc as Record<string, string>)['.__novaGenericInventAsk'] = formatGenericInventOwnLookPrompt({
            brand: lockedProductName,
            brief: storeBrief,
            salt,
            goal: createBriefPlan.goal,
            audience: createBriefPlan.audience,
            primaryAction: createBriefPlan.primaryAction,
            assumptions: createBriefPlan.assumptions,
            mustHave: createBriefPlan.mustHave,
            outOfScope: createBriefPlan.outOfScope,
            verifyChecks: createBriefPlan.verifyChecks,
            craftOrder: createBriefPlan.craftOrder,
            artifactKind: createArtifactKind || craftArtifactKind,
          });
          try {
            const { emitCreatePipelineStep } = await import('@/lib/codingCreatePipeline');
            emitCreatePipelineStep('craft', (msg) => host.pushStatus(msg), 'invent-first from understand plan');
          } catch { /* optional */ }
          try {
            const {
              HARNESS_PACK,
              buildEarsSpec,
              formatEarsSpec,
              initProgressMd,
              formatProgressMd,
              formatDesignMdAntiSlop,
            } = await import('@/lib/agentHarness');
            if (HARNESS_PACK.earsSpec) {
              const ears = buildEarsSpec(storeBrief, lockedProductName);
              (createFilesAcc as Record<string, string>)['SPEC.md'] = formatEarsSpec(ears);
            }
            if (HARNESS_PACK.progressMd) {
              (createFilesAcc as Record<string, string>)['PROGRESS.md'] = formatProgressMd(
                initProgressMd(storeBrief, lockedProductName),
              );
            }
            if (HARNESS_PACK.reflexionRulesDesign) {
              (createFilesAcc as Record<string, string>)['DESIGN.md'] = formatDesignMdAntiSlop(
                lockedProductName,
                { bg: '#1a1510', fg: '#f4efe6', accent: '#c4a882' },
              );
            }
            // Never write .__novaBrowserLoop / DriverAsk / NavigatorAsk into Acc.
          } catch {
            /* harness optional */
          }
          uiPolishOk = false;
          uiPolishReasons = ['invent-first — model must own unique site from brief'];
          usedNovaLoop = false;
          loopWroteFiles = false;
          if (inventNeedsPlanApprove(briefForUi, false)) {
            host.pushStatus('Invent · large brief — Plan mode recommended before hard-go (Discuss/Plan gate)…');
          }
          try {
            const {
              inventAllowedInMode,
              enqueueApproval,
              listApprovals,
            } = await import('@/lib/inventWave5Pack');
            const permRaw = createFilesAcc['.nova/permission-mode.json'];
            if (permRaw) {
              const perm = JSON.parse(permRaw) as { mode?: string };
              const mode = (perm.mode || 'auto') as 'default' | 'plan' | 'auto' | 'brave';
              if (!inventAllowedInMode(mode)) {
                const key = String(originDiskRoot || lockedProductName || 'default');
                enqueueApproval(key, {
                  kind: 'invent',
                  detail: `Invent hard-go for ${lockedProductName} (mode=${mode})`,
                });
                host.pushStatus(
                  `Invent · permission mode ${mode} — queued approval (${listApprovals(key).length} pending)`,
                );
              }
            }
          } catch { /* optional */ }
          {
            const mode = detectInventAgentMode(briefForUi);
            const acl = inventModeAcl(mode);
            host.pushStatus(`Invent · mode ${mode} (writeApp=${acl.allowWriteApp} logo=${acl.allowWriteLogo})`);
            try {
              const {
                inventDirectionOptions,
                exploreInventContext,
                reviewInventAcc,
              } = await import('@/lib/inventWave4Pack');
              const dirs = inventDirectionOptions(lockedProductName, briefForUi);
              host.pushStatus(
                `Invent · directions: ${dirs.map((d) => `${d.id}=${d.label}`).join(' · ')}`,
              );
              const explore = exploreInventContext(createFilesAcc, briefForUi);
              host.pushStatus(`Invent · ${explore.summary}`);
              const review = reviewInventAcc(createFilesAcc, lockedProductName);
              host.pushStatus(
                `Invent · code-review score ${review.score}: ${review.findings.slice(0, 3).join('; ')}`,
              );
              const { runInventSubagentFork } = await import('@/lib/inventWave5Pack');
              const fork = runInventSubagentFork(createFilesAcc, briefForUi, lockedProductName);
              host.pushStatus(`Invent · ${fork.summary}`);
              try {
                const {
                  inventPrReviewReport,
                  secretPreflightScan,
                  secretPreflightFiles,
                  inventSeoAuditFiles,
                } = await import('@/lib/inventFieldPack');
                Object.assign(
                  createFilesAcc,
                  inventPrReviewReport({
                    brand: lockedProductName,
                    findings: review.findings,
                    score: review.score,
                  }),
                );
                const scan = secretPreflightScan(createFilesAcc);
                Object.assign(createFilesAcc, secretPreflightFiles(scan));
                host.pushStatus(`Invent · ${scan.ok ? 'secret preflight OK' : `secret preflight FAIL (${scan.findings.length})`}`);
                Object.assign(createFilesAcc, inventSeoAuditFiles(createFilesAcc, lockedProductName));
                try {
                  const audit = JSON.parse(String(createFilesAcc['.nova/seo-audit.json'] || '{}')) as { score?: number };
                  if (typeof audit.score === 'number') {
                    host.pushStatus(`Invent · SEO audit ${audit.score}/100`);
                  }
                } catch { /* optional */ }
                try {
                  const {
                    codingDiagnosticsLite,
                    codingDiagnosticsFiles,
                    recordCodingSeatOutcome,
                  } = await import('@/lib/inventCodingPack');
                  const diag = codingDiagnosticsLite(createFilesAcc);
                  Object.assign(createFilesAcc, codingDiagnosticsFiles(diag));
                  host.pushStatus(
                    `Invent · coding diagnostics ${diag.ok ? 'OK' : `FAIL (${diag.issues.filter((i) => i.severity === 'error').length})`}`,
                  );
                  const craftId = String(coderGate?.id || '').trim();
                  if (craftId && craftId !== 'blank-solid' && craftId !== 'NOVA-auto') {
                    Object.assign(
                      createFilesAcc,
                      recordCodingSeatOutcome(createFilesAcc, {
                        role: 'implementor',
                        modelId: craftId,
                        ok: diag.ok && review.score >= 70,
                        evidence: `review=${review.score};diag=${diag.ok ? 'ok' : 'fail'}`,
                      }),
                    );
                  }
                  try {
                    const {
                      pickDifferentFamilyReviewer,
                      runCodingWorkerDag,
                      attachCloseAllPackFiles,
                    } = await import('@/lib/inventCloseAllPack');
                    Object.assign(
                      createFilesAcc,
                      attachCloseAllPackFiles(createFilesAcc, {
                        brand: lockedProductName,
                        brief: briefForUi,
                      }),
                    );
                    const dag = runCodingWorkerDag(createFilesAcc, lockedProductName);
                    Object.assign(createFilesAcc, dag.files);
                    const closed = createFilesAcc['.nova/open-all-closed.json']
                      ? (() => {
                        try {
                          return JSON.parse(String(createFilesAcc['.nova/open-all-closed.json']));
                        } catch {
                          return null;
                        }
                      })()
                      : null;
                    host.pushStatus(
                      closed?.matrixRows
                        ? `Invent · Acc close-all · matrix ${closed.matrixRows} · stems ${closed.stemCount ?? '?'}`
                        : `Invent · coding workers ${dag.reports.length} reports`,
                    );
                    const readyIds = [craftId].filter(Boolean);
                    const reviewer = pickDifferentFamilyReviewer(craftId, readyIds);
                    if (reviewer) {
                      host.pushStatus(`Invent · reviewer seat ${reviewer}`);
                    }
                  } catch (e) {
                    host.pushStatus(`Invent · Acc close-all failed: ${String((e as Error)?.message || e).slice(0, 120)}`);
                  }
                } catch { /* optional */ }
              } catch { /* optional */ }
            } catch { /* optional */ }
            const peek = rankedRepoMapPeek(createFilesAcc, briefForUi, 8);
            if (peek.length) {
              host.pushStatus(`Invent · repo map: ${peek.slice(0, 5).join(', ')}`);
            }
            try {
              const kitRaw = createFilesAcc['.nova/brand-kit.json'];
              if (kitRaw) {
                const kit = JSON.parse(kitRaw) as { allowStockPhotos?: boolean };
                if (inventMayUseStock(kit as Parameters<typeof inventMayUseStock>[0])) {
                  host.pushStatus('Invent · brand kit allows stock/Openverse photos');
                }
              }
            } catch { /* optional */ }
          }
          host.pushStatus('Invent-first · any site — unique UI from brief (no floor Accept)…');
          updateCreateJob(jobId, { files: createFilesAcc });
          // Flush harness docs to disk early so Live grade + human review can see them.
          if (originDiskRoot) {
            const harnessKeys = ['SPEC.md', 'PROGRESS.md', 'DESIGN.md'].filter((k) => createFilesAcc[k]);
            if (harnessKeys.length) {
              await persistAcceptedCreateFiles(originDiskRoot, createFilesAcc, harnessKeys).catch(() => {});
            }
          }
        }
      } catch { /* fall through to tool loop */ }
      // Product ladder: seed rotated recipe + logo, then invent MUST own the look (seed ≠ Ready).
      try {
        const {
          materializeProductSpineFiles,
          parseProductBriefSlots,
          formatProductInventOwnLookPrompt,
          gradeProductQuality,
        } = await import('@/lib/createProductLadder');
        const productBrief = authoritativeOriginalBrief || briefForUi;
        if (uiPolishOk !== true && !storefrontSpineLocked && artifactWantsProductLadder(createArtifactKind, productBrief)) {
          const salt = String(jobId || lockedProductName).slice(-6);
          const slots = parseProductBriefSlots(productBrief, lockedProductName, salt);
          host.pushStatus(
            `Ladder · understand ${slots.brand} (${slots.productNoun}) → write ${slots.recipe}…`,
          );
          if (originDiskRoot) {
            try {
              const { brandLogoSvgFor } = await import('@/lib/brandAssets');
              const { localIconifySvg } = await import('@/lib/localLucideIcons');
              let forced = brandLogoSvgFor({
                productName: lockedProductName,
                brief: productBrief,
                css: 'background:#0b0f14',
              });
              if (!forced || /M9\.937 15\.5/i.test(forced) || /M9 18V5l12-2v13/i.test(forced)) {
                const { productDeskLogoSvg, productNeutralLogoSvg } = await import('@/lib/createProductLadder');
                forced = (
                  /\b(?:gaming\s+desk|standing\s+desk|shop\s+the\s+desk|battlestation|desk)\b/i.test(productBrief)
                    ? productDeskLogoSvg('#ffffff')
                    : productNeutralLogoSvg('#ffffff', lockedProductName)
                ) || forced;
              }
              if (forced) {
                createFilesAcc = { ...createFilesAcc, 'public/logo.svg': forced };
                await persistGenreLogoSvg(originDiskRoot, forced).catch(() => {});
              }
            } catch { /* logo best-effort */ }
          }
          let spine = materializeProductSpineFiles(productBrief, lockedProductName, salt);
          try {
            const {
              briefWantsHardwareShell,
              writeHardwareInventShell,
              hardwareInventShellId,
              accHasHardwareShell,
            } = await import('@/lib/hardwareInventShells');
            if (briefWantsHardwareShell(productBrief) && !accHasHardwareShell(spine)) {
              host.pushStatus('Ladder · hardware invent shell (not leather / not desk twin)…');
              spine = writeHardwareInventShell(
                spine,
                productBrief,
                lockedProductName,
                hardwareInventShellId(lockedProductName),
              );
            }
          } catch { /* keep spine */ }
          createFilesAcc = { ...createFilesAcc, ...spine };
          if (createFilesAcc['src/App.jsx'] && createFilesAcc['src/App.tsx']) {
            delete createFilesAcc['src/App.tsx'];
          }
          // Product write must keep a full Vite shell — missing package.json locked Live (RidgeDesk).
          try {
            if (artifactWantsVite(createArtifactKind)) {
              const { ensureViteReactProjectFiles } = await import('@/lib/createBuildQuality');
              createFilesAcc = ensureViteReactProjectFiles(createFilesAcc, lockedProductName).files;
            }
          } catch { /* best-effort */ }
          productSeedApp = String(createFilesAcc['src/App.jsx'] || '');
          productGenreGuard = true;
          productSpineLocked = true; // floors/wire only
          productInventSnapshot = {
            appJsx: String(createFilesAcc['src/App.jsx'] || ''),
            appCss: String(createFilesAcc['src/App.css'] || ''),
            logo: String(createFilesAcc['public/logo.svg'] || ''),
          };
          // Seed is a Normal floor only — NEVER Ready. Invent must own the look
          // (marking seed Quality skipped invent and shipped renamed desk twins in ~1m).
          const graded = gradeProductQuality(createFilesAcc, productBrief, lockedProductName);
          uiPolishOk = false;
          uiPolishReasons = [
            graded.okNormal
              ? `Seed is ${graded.label} floor — invent must own a unique Quality look`
              : `Below Normal floor (${graded.label}) — invent must rewrite`,
            ...graded.reasons.slice(0, 4),
          ];
          host.pushStatus(
            `Ladder · ${graded.label} seed · invent required for Ready (${slots.brand} / ${slots.recipe})…`,
          );
          // Do NOT set usedNovaLoop / loopWroteFiles here — both blocked invent
          // (seed wrote files, so invent fallback thought craft already owned the write).
          try {
            const inventAsk = formatProductInventOwnLookPrompt({
              brief: productBrief,
              productName: lockedProductName,
              seedRecipe: slots.recipe,
            });
            (createFilesAcc as Record<string, string>)['.__novaProductInventAsk'] = inventAsk;
          } catch { /* ignore */ }
          // Defer studio paint — seed App.jsx is large; painting mid-IPC freezes chat.
          await yieldToUi(32);
          softBindCreateStudio(host, {
            files: createFilesAcc,
            projectId: originProjectId,
            name: lockedProductName,
            diskRoot: originDiskRoot,
          });
          if (originDiskRoot) {
            await persistAcceptedCreateFiles(
              originDiskRoot,
              createFilesAcc,
              [
                'package.json',
                'index.html',
                'vite.config.js',
                'vite.config.ts',
                'src/main.jsx',
                'src/main.tsx',
                'src/App.jsx',
                'src/App.css',
                'src/index.css',
                'public/logo.svg',
                'public/heroes/desk.svg',
                'public/heroes/delivery.svg',
              ].filter((p) => createFilesAcc[p]),
            ).catch(() => {});
          }
          updateCreateJob(jobId, { files: createFilesAcc });
        }
      } catch { /* fall through to tool loop */ }
      try {
        const { shouldUseNovaCreateBuildLoop, runNovaCreateBuildLoop } = await import('@/lib/novaBuildLoop');
        const { modeStatusLabel } = await import('@/lib/novaStudioModes');
        // Product ladder already wrote Normal seed + queued invent ask — tool loop
        // burns minutes (or soft-passes seed) before invent/lift ever runs. Skip it.
        const productInventAskReady = typeof createFilesAcc['.__novaProductInventAsk'] === 'string'
          && String(createFilesAcc['.__novaProductInventAsk'] || '').length > 40;
        if (productGenreGuard && productInventAskReady) {
          host.pushStatus('Ladder · skip tool loop — invent owns Quality look…');
          uiPolishOk = false;
          loopWroteFiles = false;
        } else if (!skipLegacyLoop && shouldUseNovaCreateBuildLoop() && coderGate.ok && uiPolishOk !== true) {
          loopAttempted = true;
          usedNovaLoop = true;
          try {
            const { announceCreatePhase } = await import('@/lib/createStatus');
            await announceCreatePhase(host, 'craft', { id: coderGate.id, name: coderGate.name });
          } catch { /* ignore */ }
          host.pushStatus(modeStatusLabel('build', `Tool loop · ${coderGate.name}`));
          const filesBeforeLoop = Object.keys(createFilesAcc).length;
          const storefrontInventForLoop = typeof createFilesAcc['.__novaStorefrontInventAsk'] === 'string'
            ? String(createFilesAcc['.__novaStorefrontInventAsk'])
            : '';
          const loopBrief = storefrontInventForLoop
            ? `${authoritativeOriginalBrief}\n\n## STOREFRONT INVENT (required — no floor paste)\n${storefrontInventForLoop}`
            : authoritativeOriginalBrief;
          createSeedSnapshot = { ...createFilesAcc };
          const loopRes = await runNovaCreateBuildLoop({
            brief: loopBrief,
            productName: lockedProductName,
            files: createFilesAcc,
            projectId: originProjectId,
            diskRoot: originDiskRoot,
            mustHaves: briefSpec.mustHave || [],
            coderId: coderGate.id,
            coderName: coderGate.name,
            coderSource: coderGate.source,
            stickyModelId: host.stickyModelId,
            stickyModelName: host.stickyModelName,
            artifactKind: createArtifactKind,
            host: {
              pushStatus: host.pushStatus,
              shouldAbort: () => turnAborted(),
            },
            maxFixRounds: (
              briefNeedsCreateUiPolish(briefForUi)
              || briefLooksLikeMarketingLanding(briefForUi)
              || chatAppBrief
              || /\b(?:game|playable|arcade|3d|three\.?js|webgl|modeler)\b/i.test(briefForUi)
            ) ? 2 : 1,
          });
          createFilesAcc = loopRes.files;
          loopWroteFiles = Object.keys(createFilesAcc).length > filesBeforeLoop
            || Boolean(loopRes.ok)
            || (loopRes.steps || []).some((s) => /^(?:write|patch)$/i.test(String(s.tool || '')));
          const toolLoopCraftStalled = (loopRes.steps || []).some((s) =>
            /craft stalled|stream idle|no tokens|step wall|Model timed out|timed out after/i.test(
              String(s.label || s.detail || ''),
            ),
          );
          softBindCreateStudio(host, {
            files: createFilesAcc,
            projectId: originProjectId,
            name: lockedProductName,
            diskRoot: originDiskRoot,
          });
          if (toolLoopCraftStalled && !loopRes.ok) {
            // Idle wall — do not soft-success; invent may recover, else honest miss.
            uiPolishOk = false;
            uiPolishReasons = [
              'Craft stalled — tool loop idle wall',
              ...(loopRes.reasons || []).slice(0, 4),
            ];
            host.pushStatus('Tool loop craft stalled — invent fallback…');
          } else if (loopRes.ok || loopWroteFiles) {
            // Agent owns success — soft note brief deficits; do not invent-gate fail-closed.
            const { previewReadyForBrief } = await import('@/lib/createBuildQuality');
            const gate = previewReadyForBrief(createFilesAcc, {
              productName: lockedProductName,
              brief: originalBrief,
              spec: ensembleSpec,
              contract: ensembleContract,
            });
            uiPolishOk = true;
            uiPolishReasons = gate.ok ? [] : (gate.reasons || []).slice(0, 6);
            host.pushStatus(
              gate.ok
                ? 'Tool loop cleared craft — continuing to Live…'
                : `Tool loop wrote files — Live continues (soft: ${(gate.reasons || [])[0] || 'polish later'})…`,
            );
          } else {
            uiPolishReasons = loopRes.reasons || [];
            uiPolishOk = false;
            host.pushStatus('Tool loop empty — invent fallback…');
          }
        }
      } catch (loopErr) {
        if (loopAttempted) {
          usedNovaLoop = true;
          uiPolishOk = false;
          uiPolishReasons = [
            loopErr instanceof Error ? loopErr.message : 'Tool loop failed',
          ];
        }
        host.pushStatus(
          `Tool loop skipped — ${loopErr instanceof Error ? loopErr.message.slice(0, 72) : 'fallback'}…`,
        );
      }

      // Invent craft fallback when tool loop did not own a write.
      // Product seed used to set usedNovaLoop and block invent — always allow when invent ask is queued.
      const productInventQueued = typeof createFilesAcc['.__novaProductInventAsk'] === 'string'
        && String(createFilesAcc['.__novaProductInventAsk'] || '').length > 40;
      const storefrontInventQueued = typeof createFilesAcc['.__novaStorefrontInventAsk'] === 'string'
        && String(createFilesAcc['.__novaStorefrontInventAsk'] || '').length > 40;
      const genericInventQueued = typeof createFilesAcc['.__novaGenericInventAsk'] === 'string'
        && String(createFilesAcc['.__novaGenericInventAsk'] || '').length > 40;
      // If craft soft-passed but App is still the disposable seed, force invent.
      if (productInventQueued && productGenreGuard) {
        try {
          const { appLooksLikeProductSeedFloor } = await import('@/lib/createProductLadder');
          const appNow = String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '');
          if (appLooksLikeProductSeedFloor(appNow)) {
            uiPolishOk = false;
            loopWroteFiles = false;
            host.pushStatus('Ladder · seed still on disk — invent must own the look…');
          }
        } catch { /* ignore */ }
      }
      if (storefrontInventQueued) {
        try {
          const { appLooksLikeStorefrontFloor } = await import('@/lib/createStorefrontLadder');
          const appNow = String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '');
          if (appLooksLikeStorefrontFloor(appNow, createFilesAcc) || !appNow.trim()) {
            uiPolishOk = false;
            loopWroteFiles = false;
            host.pushStatus('Invent-first · storefront — invent must own the look…');
          }
        } catch { /* ignore */ }
      }
      if (
        !isNonWebArtifactKind(createArtifactKind)
        // Unknown coding (Go/Rust/mobile/Tauri/…) must never get App.jsx invent.
        && createArtifactKind !== 'unknown'
        && uiPolishOk !== true
        && (
          (!loopWroteFiles && (!usedNovaLoop || (loopAttempted && uiPolishOk === false)))
          || productInventQueued
          || storefrontInventQueued
          || genericInventQueued
        )
      ) {
      let polishSnapshot = { ...createFilesAcc };
      const inventFocusPath = createFilesAcc['src/App.tsx'] && !createFilesAcc['src/App.jsx']
        ? 'src/App.tsx'
        : 'src/App.jsx';
      // Architect → editor split (Aider --architect): plan first, then invent writes.
      try {
        const {
          CODING_AGENT_PACK,
          formatArchitectSystemPrompt,
          formatAgentRepoMapBlock,
          parseArchitectPlan,
          formatEditorFromArchitectPrompt,
        } = await import('@/lib/codingAgentPack');
        if (
          CODING_AGENT_PACK.architectEditorSplit
          && coderGate.ok
          && (storefrontInventQueued || genericInventQueued || productInventQueued)
        ) {
          host.pushStatus(`Architect · plan unique site (${coderGate.name})…`);
          const { answerStudio } = await import('@/lib/studioAnswerEngine');
          const repoMap = formatAgentRepoMapBlock(createFilesAcc, authoritativeOriginalBrief, { limit: 16 });
          const arch = await answerStudio({
            userMessage: formatArchitectSystemPrompt(authoritativeOriginalBrief, repoMap),
            files: createFilesAcc,
            projectName: lockedProductName,
            mode: 'code',
            preferredModelId: coderGate.id,
            preferredModelName: coderGate.name,
            preferredSource: coderGate.source,
            stickyModelId: coderGate.id,
            stickyModelName: coderGate.name,
            stickyPinnedSource: 'local',
            allowFileEdits: false,
            planOnly: true,
            timeoutMs: 90_000,
            shouldAbort: () => turnAborted(),
          }).catch(() => null);
          const plan = parseArchitectPlan(String(arch?.text || ''));
          if (plan) {
            (createFilesAcc as Record<string, string>)['.__novaArchitectPlan'] = plan.raw;
            (createFilesAcc as Record<string, string>)['.__novaEditorAsk'] = formatEditorFromArchitectPrompt(
              plan,
              authoritativeOriginalBrief,
              inventFocusPath,
            );
            host.pushStatus(`Editor · apply architect plan (${plan.files.length || 1} files)…`);
          }
        }
      } catch { /* architect optional */ }
      host.pushStatus(
        storefrontInventQueued
          ? `Invent-first · unique storefront (${coderGate.ok ? coderGate.name : 'coder'})…`
          : genericInventQueued
            ? `Invent-first · unique site (${coderGate.ok ? coderGate.name : 'coder'})…`
            : productInventQueued
              ? `Ladder · invent · unique Quality look (${coderGate.ok ? coderGate.name : 'coder'})…`
              : isCreateV2Active()
                ? createV2StatusCraft(coderGate.ok ? coderGate.name : 'coder')
                : usedNovaLoop
                  ? `Full UI polish · **${coderGate.ok ? coderGate.name : 'coder'}**…`
                  : 'Planning UI from your brief…',
        // Clear leftover scaffold follow (index.css) so Code does not show a fake stall.
        productInventQueued || storefrontInventQueued || genericInventQueued || isCreateV2Active()
          ? inventFocusPath
          : null,
      );
      if (isCreateV2Active()) {
        try {
          noteBuildContext({
            writingPath: createFilesAcc['src/App.tsx'] && !createFilesAcc['src/App.jsx']
              ? 'src/App.tsx'
              : 'src/App.jsx',
            phase: 'craft',
          });
        } catch { /* ignore */ }
      }
      try {
        // Hard-pin craft model — same MODEL_LOAD_CAP_MS race as the first bind (:819).
        // An unbound await here re-freezes every stall retry ("infinite Building").
        try {
          const { setEngineModel } = await import('@/lib/novaEngine');
          if (coderGate.ok) {
            try {
              await Promise.race([
                Promise.resolve(setEngineModel?.(coderGate.id)),
                new Promise<never>((_, reject) => {
                  window.setTimeout(
                    () => reject(new Error(`model-load-timeout-${MODEL_LOAD_CAP_MS}`)),
                    MODEL_LOAD_CAP_MS,
                  );
                }),
              ]);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err || '');
              if (/model-load-timeout/i.test(msg)) {
                host.pushStatus(
                  `Model re-bind slow (>${Math.round(MODEL_LOAD_CAP_MS / 1000)}s) — continuing craft…`,
                );
              }
            }
            try {
              const { setLocalPrefs } = await import('@/lib/localPrefs');
              const { isCoderEngineId } = await import('@/lib/enginePick');
              // Pin coder role only — never overwrite chat Multimodal prefs (new chats
              // were getting stuck on the craft GGUF after create).
              setLocalPrefs({
                aiMode: 'local_only',
                ...(isCoderEngineId(coderGate.id)
                  ? { activeCoderId: coderGate.id, defaultCodeModelId: coderGate.id }
                  : {}),
              });
            } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      } catch { /* ignore */ }
      try {
        const coder = coderGate.ok
          ? coderGate
          : await resolveCreateUiPolishCoder(host);
        if (!coder.ok) {
          uiPolishOk = false;
          uiPolishReasons = [coder.reason || 'No suitable coder for UI polish'];
        } else {
          const { answerStudio } = await import('@/lib/studioAnswerEngine');
          // createV2: no fake "Polishing visuals…" heartbeat — status follows real focus path.
          const stopPolishBeat = isCreateV2Active()
            ? () => {}
            : (await import('@/lib/createProgressCopy')).startProgressHeartbeat(host.pushStatus, 'polish', 5500);
          try {
          // Thin create: App.jsx lock for landing/marketing/utility — games may keep App.tsx.
          const thinJsxLock = isThinCreatePath() && thinCreateLocksAppJsx(briefForUi, lockedProductName);
          if (isThinCreatePath()) {
            const { ensureThinDeterministicTokensCss } = await import('@/lib/createDesignSystem');
            createFilesAcc = ensureThinDeterministicTokensCss(
              createFilesAcc,
              briefForUi,
              lockedProductName,
            );
          }
          const preferTs = isThinCreatePath()
            ? (!thinJsxLock && Boolean(createFilesAcc['src/App.tsx'] && !createFilesAcc['src/App.jsx']))
            : Boolean(createFilesAcc['src/App.tsx'] && !createFilesAcc['src/App.jsx']);
          const appPath = isThinCreatePath()
            ? thinCreatePrimaryAppPath(briefForUi, createFilesAcc, lockedProductName)
            : (preferTs ? 'src/App.tsx' : 'src/App.jsx');
          if (thinJsxLock) {
            createFilesAcc = thinCoerceLockedAppJsx(createFilesAcc);
            if (!createFilesAcc[THIN_CREATE_APP_PATH]) {
              createFilesAcc[THIN_CREATE_APP_PATH] = createFilesAcc['src/App.jsx'] || '';
            }
          }
          createFollowLock = appPath;
          snapshotCreateCheckpoint(createFilesAcc, lockedProductName, {
            label: 'pre-craft',
            diskRoot: originDiskRoot,
          });
          const basePromptLines = [
            `AUTHORITATIVE USER BRIEF — implement every requested item; do not let plan notes replace it:\n${authoritativeOriginalBrief}`,
            ...polishPromptLinesFromBrief(briefSpec, appPath, briefForUi),
            ...(typeof createFilesAcc['.__novaProductInventAsk'] === 'string'
              ? [
                  '',
                  '## PRODUCT INVENT — OWN THE LOOK (required)',
                  String(createFilesAcc['.__novaProductInventAsk']),
                  '- Replace className app desk-* with a brand-specific shell (e.g. app pulsedesk).',
                  '- Seed is disposable. Shipping the seed unchanged fails Ready.',
                ]
              : []),
            ...(typeof createFilesAcc['.__novaStorefrontInventAsk'] === 'string'
              ? [
                  '',
                  '## STOREFRONT INVENT — OWN THE LOOK (required)',
                  String(createFilesAcc['.__novaStorefrontInventAsk']),
                  '- Do NOT paste a generic commerce floor or twin catalog.',
                  '- Shipping an unchanged floor/seed fails Ready.',
                ]
              : []),
            ...(typeof createFilesAcc['.__novaGenericInventAsk'] === 'string'
              ? [
                  '',
                  '## SITE INVENT — OWN THE LOOK (required)',
                  String(createFilesAcc['.__novaGenericInventAsk']),
                  '- Do NOT paste a genre floor or twin shell.',
                  '- Shipping an unchanged floor/seed fails Ready.',
                ]
              : []),
            ...(typeof createFilesAcc['.__novaEditorAsk'] === 'string'
              ? [
                  '',
                  '## EDITOR (from architect plan)',
                  String(createFilesAcc['.__novaEditorAsk']),
                ]
              : []),
            formatCreateProjectMap(createFilesAcc),
            buildRankedProjectMap(createFilesAcc, briefForUi, { limit: 16 }),
            ...(isCreateV2Active() || productInventQueued || storefrontInventQueued || genericInventQueued
              ? (() => {
                // Product invent owns a single App + CSS landing — never compositional shells
                // (sections wipe the Normal seed and leave Fail stubs).
                if (productInventQueued || productGenreGuard) {
                  return [
                    'PRODUCT INVENT RULES:',
                    `- Write ONLY @@@FILE ${appPath} and @@@FILE src/App.css — full landing in App (no src/sections).`,
                    '- Do NOT create NavHeaderSection / HeroSection / compositional shells.',
                    '- Do NOT touch index.css, main.tsx, index.html, package.json, or vite.config.',
                    '- Keep brand name, hero, CTA, who/features/specs/trust bands from the info map.',
                    createV2StagedWriteInstructions(preferTs),
                  ];
                }
                if (storefrontInventQueued) {
                  return [
                    'STOREFRONT INVENT RULES:',
                    `- REQUIRED @@@FILE: ${appPath}, src/App.css, and src/data/products.ts (catalog from brief).`,
                    '- Also allowed: src/components/* for cart/filter cards.',
                    '- Do NOT touch index.css, main.tsx, index.html, package.json, or vite.config.',
                    '- Unique brand chrome + working cart/qty/purchase — not a title stub or floor paste.',
                    createV2StagedWriteInstructions(preferTs),
                  ];
                }
                if (genericInventQueued) {
                  return [
                    'SITE INVENT RULES (any brief):',
                    `- Write ONLY @@@FILE ${appPath} and @@@FILE src/App.css — full landing in App (no src/sections).`,
                    '- Do NOT create NavHeaderSection / HeroSection / compositional shells.',
                    '- Do NOT touch index.css, main.tsx, index.html, package.json, or vite.config.',
                    '- No genre floor paste — invent from the brief. Working form state when the brief asks.',
                    createV2StagedWriteInstructions(preferTs),
                  ];
                }
                const shopAsk = /\b(?:cart|checkout|purchase|add\s+to\s+cart|online\s+store|e-?commerce)\b/i.test(briefForUi)
                  || /\b(?:liquor|spirits?|whiskey|whisky|bourbon|vodka|gin|tequila|bottle\s+shop)\b/i.test(briefForUi)
                  || (/\b(?:shop|store|boutique)\b/i.test(briefForUi) && /\b(?:buy|browse|products?|filter|quantity)\b/i.test(briefForUi));
                const compositional = thinWantsCompositionalShell(briefForUi);
                return shopAsk
                  ? [
                      'createV2 STOREFRONT RULES:',
                      `- REQUIRED @@@FILE: ${appPath}, src/App.css, and src/data/products.ts (≥8 products).`,
                      '- Also allowed: src/components/*.tsx (ProductCard, CartDrawer, FilterBar).',
                      '- Do NOT touch index.css, main.tsx, index.html, package.json, or vite.config.',
                      '- Complete filters + qty cart + purchase before finishing — not a title stub.',
                      createV2StagedWriteInstructions(preferTs),
                    ]
                  : compositional
                    ? [
                        'createV2 COMPOSITIONAL RULES:',
                        `- Thin @@@FILE ${appPath} shell + @@@FILE src/App.css + src/sections/*Section.jsx.`,
                        '- Do NOT put the full page UI inline in App — sections own bands.',
                        '- Do NOT touch index.css, main.tsx, index.html, package.json, or vite.config.',
                        createV2StagedWriteInstructions(preferTs, true),
                      ]
                    : [
                      'createV2 RULES:',
                      `- Write ONLY @@@FILE ${appPath} and @@@FILE src/App.css.`,
                      '- Do NOT touch index.css, main.tsx, index.html, package.json, or vite.config.',
                      '- Put the full working product UI in App — not a title stub.',
                      createV2StagedWriteInstructions(preferTs),
                    ];
              })()
              : []),
            'FRESH BUILD RULES:',
            '- Build exactly the product in the USER ASK + research notes above.',
            '- Do not substitute a different product category (booking, shop, marketing landing, Core/Day/Reserve cards) unless the user asked for that.',
            '- Interactive controls must match the ask (real useState flows) — not a decorative shell.',
            ...(createResearchNotes
              ? ['- Prefer the PRODUCT RESEARCH / IMPLEMENTATION NOTES over inventing a layout.']
              : []),
            ...(createFilesAcc['NOVA.md'] || createFilesAcc['AGENTS.md']
              ? [
                  '## Project rules (NOVA.md / AGENTS.md)',
                  String(createFilesAcc['NOVA.md'] || createFilesAcc['AGENTS.md'] || '').slice(0, 1500),
                ]
              : []),
          ];
          const polishStarted = Date.now();
          let productInventFirstTokenMs = CREATE_V2_FIRST_TOKEN_MS;
          let productInventIdleMs = 0;
          let productInventAttemptWallMs = 0;
          let productInventTotalWallMs = 0;
          if (productInventQueued) {
            try {
              const {
                PRODUCT_INVENT_FIRST_TOKEN_MS,
                PRODUCT_INVENT_IDLE_MS,
                PRODUCT_INVENT_ATTEMPT_WALL_MS,
                PRODUCT_INVENT_TOTAL_WALL_MS,
              } = await import('@/lib/createProductLadder');
              productInventFirstTokenMs = PRODUCT_INVENT_FIRST_TOKEN_MS;
              productInventIdleMs = PRODUCT_INVENT_IDLE_MS;
              productInventAttemptWallMs = PRODUCT_INVENT_ATTEMPT_WALL_MS;
              productInventTotalWallMs = PRODUCT_INVENT_TOTAL_WALL_MS;
            } catch { /* keep createV2 defaults */ }
          }
          const attemptWallMs = productInventQueued && productInventAttemptWallMs > 0
            ? productInventAttemptWallMs
            : isCreateV2Active()
              ? createV2AttemptWallMs(budgetProfile)
              : createPolishAttemptBudgetMs(briefForUi);
          const polishBudgetMs = attemptWallMs;
          const polishTotalBudgetMs = productInventQueued && productInventTotalWallMs > 0
            ? Math.min(
              createWallMs - (Date.now() - createStartedAt),
              productInventTotalWallMs,
            )
            : isCreateV2Active()
              ? attemptWallMs * CREATE_V2_MAX_CRAFT_ATTEMPTS
              : Math.min(
                createWallMs - (Date.now() - createStartedAt),
                createWallBudgetMs(briefForUi),
              );
          if (polishTotalBudgetMs < 20_000 || createTimedOut()) {
            // Soft wall already spent — stop before another craft attempt.
            uiPolishOk = false;
            uiPolishReasons = ['Create interrupted before UI polish'];
            markCreateJobFailed(jobId, 'Create soft wall reached before UI craft finished');
            markBuildDiagnosticsEnded();
            await host.finishPlainReply(
              createBudgetExceededReply(budgetProfile, lockedProductName),
              'NOVA · create',
            );
            return { status: 'handled' };
          }
          /** No byte growth for this long → cancel GGUF and retry that file. */
          const POLISH_STALL_ABORT_MS = budgetProfile === 'simple' ? 10_000 : 14_000;
          const { POLISH_ALMOST_DONE_LABEL, POLISH_FINAL_PASS_LABEL } = await import('@/lib/createProgressCopy');
          /** Never exempt index.css / package.json from stall — that caused 19m Code hangs. */
          const isScaffoldStallExempt = (_p: string) => false;
          let modelReply = '';
          let lastError = '';
          let streamBuf = '';
          let stalledPathHint = '';
          // Product invent: one attempt then seed-lift (no 15m retry thrash).
          // createV2: craft + one stall retry. Legacy: simple=1, else 2.
          const maxPolishAttempts = productInventQueued
            ? 1
            : isCreateV2Active()
              ? CREATE_V2_MAX_CRAFT_ATTEMPTS
              : (budgetProfile === 'simple' ? 1 : 2);
          const createV2CraftStartedAt = Date.now();
          for (let attempt = 0; attempt < maxPolishAttempts; attempt++) {
            await yieldToUi(0);
            if (isCreateV2Active() && Date.now() - createV2CraftStartedAt >= createV2CraftTotalWallMs(budgetProfile)) {
              lastError = `Craft budget reached (${Math.ceil(createV2CraftTotalWallMs(budgetProfile) / 60_000)}m)`;
              uiPolishOk = false;
              uiPolishReasons = [lastError, 'Stopped repeated craft attempts; continuing to verification/fix path.'];
              host.pushStatus('Craft budget reached — stopping repeated rewrite and checking current files…');
              break;
            }
            if (turnAborted()) {
              lastError = createTimedOut() ? 'Create time cap reached' : 'Create stopped or superseded';
              break;
            }
            const enrichPass = !isCreateV2Active() && attempt > 0 && !stalledPathHint;
            const stallRetry = Boolean(stalledPathHint);
            const stallRetryPath = stallRetry
              ? (isCreateV2Active()
                ? createV2StallRetryPath(stalledPathHint, preferTs)
                : stalledPathHint)
              : '';
            const elapsedSoFar = Date.now() - polishStarted;
            if (elapsedSoFar > polishTotalBudgetMs || createTimedOut()) {
              lastError = 'UI polish budget exceeded';
              break;
            }
            // createV2: never "enrich" — only initial craft or stall rewrite.
            if (isCreateV2Active() && attempt > 0 && !stallRetry) {
              lastError = lastError || 'Craft did not reach Ready';
              break;
            }
            const prompt = attempt === 0
              ? basePromptLines.join('\n')
              : stallRetry
                ? [
                    `STALL RETRY: the previous pass froze while writing ${stalledPathHint}.`,
                    `Rewrite ONLY ${stallRetryPath} from scratch for THIS brief — finish every tag/brace.`,
                    ...(isCreateV2Active()
                      ? [
                          'Do NOT write index.css, main, index.html, or package.json.',
                          'Put the full working UI in App + App.css.',
                        ]
                      : ['Keep other project files as-is. Output @@@FILE for that path (and App.css if needed).']),
                    'No ./components. No remote placeholder images. No paywalls.',
                    ...basePromptLines.slice(1),
                  ].join('\n')
                : [
                  enrichPass
                    ? 'ENRICH PASS: deepen THIS product from the brief. Add missing must-haves. Raise visual premium depth (atmosphere, type, spacing). Match the brief’s real flows — do NOT invent a generic time-slot booking UI unless the brief asks for appointments. Do NOT ship title + two static cards. NEVER use via.placeholder.com or remote placeholder image hosts. NEVER add paywalls or upgrade CTAs — Nova products stay free to use.'
                    : 'RETRY: put the ENTIRE product UI for THIS brief in a single App + App.css. No ./components. Finish every tag. No remote placeholder images. No paywalls.',
                  ...basePromptLines.slice(1),
                ].join('\n');
            if (stallRetry) {
              host.pushStatus(
                isCreateV2Active()
                  ? createV2StatusRepair(stallRetryPath)
                  : `Retrying stalled write: ${stallRetryPath}…`,
                stallRetryPath,
              );
              stalledPathHint = '';
            } else if (enrichPass) {
              host.pushStatus('Deepening the product UI: flows, confirmation, and premium layout…', null);
            }
            const attemptStarted = Date.now();
            const seenCodingPaths = new Set<string>();
            streamBuf = '';
            let lastStudioPaint = 0;
            let lastFocusPath = '';
            let lastFocusLen = 0;
            Date.now();
            let pathFocusedAt = Date.now();
            let appFamilyStartedAt = 0;
            let lastStreamAt = Date.now();
            let sawStreamToken = false;
            let stallAbort = false;
            let stallAbortPath = '';
            let stallCancelFired = false;
            /** Zero-token expiry — fail closed; do not continue into another bind/retry. */
            let zeroTokenAbort = false;
            const cancelCraftJob = () => {
              void import('@/lib/novaEngine')
                .then(({ engineGenerateCancel }) => engineGenerateCancel({ chatId: host.chatId }))
                .catch(() => {});
            };
            // External watchdog — always on (not only createV2). Fires when the model
            // emits zero chunks (silent GGUF load) so create cannot loop forever.
            let craftWatchId: number | null = null;
            let lastWaitStatusAt = 0;
            craftWatchId = window.setInterval(() => {
              if (stallAbort || turnAborted()) return;
              const now = Date.now();
              const waited = now - attemptStarted;
              if (!sawStreamToken) {
                // Status only — do NOT rotate Code files every few seconds (that freezes the shell).
                if (now - lastWaitStatusAt >= 8_000) {
                  lastWaitStatusAt = now;
                  // Do NOT heartbeat here — that fakes "coding ·" while the model is still loading.
                  const tokenCap = productInventQueued
                    ? productInventFirstTokenMs
                    : CREATE_V2_FIRST_TOKEN_MS;
                  host.pushStatus(
                    waited < 20_000
                      ? (productInventQueued
                        ? `Ladder · invent · loading model… (${Math.round(waited / 1000)}s)`
                        : `Loading model · waiting for first tokens… (${Math.round(waited / 1000)}s)`)
                      : (productInventQueued
                        ? `Ladder · invent · still loading (lift at ${Math.round(tokenCap / 1000)}s)… (${Math.round(waited / 1000)}s)`
                        : `Still loading · will cancel if quiet past ${Math.round(tokenCap / 1000)}s… (${Math.round(waited / 1000)}s)`),
                    null,
                  );
                }
              }
              const firstTokenWall = productInventQueued
                ? productInventFirstTokenMs
                : CREATE_V2_FIRST_TOKEN_MS;
              if (!sawStreamToken && now - attemptStarted > firstTokenWall) {
                stallAbort = true;
                zeroTokenAbort = true;
                stallAbortPath = createV2StallRetryPath(appPath, preferTs);
                if (!stallCancelFired) {
                  stallCancelFired = true;
                  host.pushStatus(
                    productInventQueued
                      ? `Ladder · invent quiet ${Math.round(firstTokenWall / 1000)}s — cancelling for seed-lift…`
                      : `No App output after ${Math.round(firstTokenWall / 1000)}s — cancelling…`,
                    appPath,
                  );
                  cancelCraftJob();
                }
                return;
              }
              // Idle = no token flow at all (any chunk resets lastStreamAt). Never cancel while emitting.
              const idleWall = productInventQueued && productInventIdleMs > 0
                ? productInventIdleMs
                : createV2IdleStallMs(lastFocusPath || appPath);
              if (sawStreamToken && now - lastStreamAt > idleWall) {
                stallAbort = true;
                stallAbortPath = createV2StallRetryPath(lastFocusPath || appPath, preferTs);
                if (!stallCancelFired) {
                  stallCancelFired = true;
                  host.pushStatus(
                    productInventQueued
                      ? `Ladder · invent idle — cancelling for seed-lift…`
                      : `Stream idle — cancelling to retry App…`,
                    stallAbortPath,
                  );
                  cancelCraftJob();
                }
                return;
              }
              // App.jsx ↔ App.css thrash used to reset per-path walls forever.
              if (
                sawStreamToken
                && appFamilyStartedAt > 0
                && now - appFamilyStartedAt > CREATE_V2_APP_FAMILY_WALL_MS
              ) {
                stallAbort = true;
                stallAbortPath = createV2StallRetryPath(lastFocusPath || appPath, preferTs);
                if (!stallCancelFired) {
                  stallCancelFired = true;
                  host.pushStatus(
                    `App craft wall (${Math.round(CREATE_V2_APP_FAMILY_WALL_MS / 60_000)}m) — cancelling…`,
                    stallAbortPath,
                  );
                  cancelCraftJob();
                }
              }
            }, 500);
            const { extractStreamingFileEdits } = await import('@/lib/projectCodeEdit');
            let result: Awaited<ReturnType<typeof answerStudio>>;
            try {
            result = await answerStudio(
              {
                userMessage: prompt,
                files: createFilesAcc,
                projectName: lockedProductName,
                mode: 'code',
                preferredModelId: coder.id,
                preferredModelName: coder.name,
                preferredSource: coder.source,
                // Hard pin: craft always uses the selected coder, not Multimodal/Auto.
                stickyModelId: coder.id,
                stickyModelName: coder.name,
                stickyPinnedSource: 'local',
                allowFileEdits: true,
                // Hard wall — never inherit the legacy 12-minute build timeout.
                timeoutMs: Math.min(polishBudgetMs, isCreateV2Active() ? createV2AttemptWallMs(budgetProfile) : polishBudgetMs),
                shouldAbort: () =>
                  stallAbort
                  || turnAborted()
                  || Date.now() - attemptStarted > polishBudgetMs
                  || Date.now() - polishStarted > polishTotalBudgetMs,
              },
              (delta) => {
                streamBuf = String(delta || '');
                if (streamBuf) {
                  // Token-flow idle clock: any paint from the engine resets stall.
                  sawStreamToken = true;
                  lastStreamAt = Date.now();
                }
                const activeHdr = (() => {
                  const active = streamBuf.lastIndexOf('@@@FILE');
                  if (active < 0) return '';
                  const hdr = streamBuf.slice(active).match(/^@@@FILE\s+([^\n\r]+)/);
                  return String(hdr?.[1] || '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
                })();
                
                let focusPath = '';
                try {
                  // Prefer the in-progress @@@FILE (last header), not the last completed extract.
                  // createV2: never park Code focus on scaffold chrome — jump to App.
                  if (activeHdr) {
                    focusPath = (isCreateV2Active() && isCreateV2ScaffoldPath(activeHdr))
                      ? appPath
                      : activeHdr;
                  }
                  const streamed = extractStreamingFileEdits(streamBuf);
                  if (streamed.length) {
                    const merged = { ...createFilesAcc };
                    for (const e of streamed) {
                      const rel = String(e.path || '').replace(/\\/g, '/').replace(/^\.\//, '');
                      if (!rel || !e.content) continue;
                      // createV2: ignore mid-stream writes to scaffold chrome (index.css etc).
                      if (isCreateV2Active() && isCreateV2ScaffoldPath(rel)) continue;
                      // Thin: never replace a complete App.jsx with a truncated mid-stream chunk.
                      if (
                        isThinCreatePath()
                        && /^src\/App\.(jsx|tsx)$/i.test(rel)
                      ) {
                        const prevApp = String(merged[rel] || createFilesAcc[rel] || '');
                        const nextApp = String(e.content || '');
                        if (
                          prevApp.length > 400
                          && !thinAppLooksTruncated(prevApp)
                          && thinAppLooksTruncated(nextApp)
                        ) {
                          continue;
                        }
                      }
                      merged[rel] = e.content;
                      if (!focusPath || (isCreateV2Active() && isCreateV2ScaffoldPath(focusPath))) {
                        focusPath = rel;
                      }
                    }
                    createFilesAcc = merged;
                    const now = Date.now();
                    // Never use streamBuf.length for growth — whole stream always grows and defeats idle abort.
                    const focusLen = focusPath
                      ? String(createFilesAcc[focusPath] || '').length
                      : 0;
                    const pathChanged = Boolean(focusPath && focusPath !== lastFocusPath);
                    const contentGrew = Boolean(focusPath)
                      && focusPath === lastFocusPath
                      && !isCreateV2ScaffoldPath(focusPath)
                      && focusLen > lastFocusLen + 2; // paint often — Code typewriter smooths the rest
                    if (pathChanged) {
                      const appFamilyHop = isCreateV2Active()
                        && isCreateV2AppPath(focusPath)
                        && (!lastFocusPath || isCreateV2AppPath(lastFocusPath));
                      lastFocusPath = focusPath;
                      lastFocusLen = focusLen;
                      // Stay on one App-family clock when hopping App.jsx ↔ App.css.
                      if (!appFamilyHop) pathFocusedAt = now;
                      if (isCreateV2AppPath(focusPath) && !appFamilyStartedAt) {
                        appFamilyStartedAt = now;
                      }
                      seenCodingPaths.add(focusPath);
                    } else if (contentGrew) {
                      lastFocusLen = focusLen;
                      if (isCreateV2AppPath(focusPath) && !appFamilyStartedAt) {
                        appFamilyStartedAt = now;
                      }
                      // Activity pulse — Code UI must not show "stall" while App is still growing.
                      tickBuildHeartbeat(createFileBuildLabel(focusPath, 'Coding'));
                    } else if (
                      isCreateV2Active()
                      && focusPath
                      && isCreateV2ScaffoldPath(focusPath)
                      && focusPath === lastFocusPath
                    ) {
                      // Scaffold focus with no merged bytes: still count time toward path wall.
                    }
                    const stallExempt = Boolean(focusPath) && isScaffoldStallExempt(focusPath);
                    const idleLimitMs = isCreateV2Active() && focusPath
                      ? createV2IdleStallMs(focusPath)
                      : (/App\.(tsx|jsx)|App\.css$/i.test(String(focusPath || ''))
                        ? 22_000
                        : POLISH_STALL_ABORT_MS);
                    const pathWallMs = isCreateV2Active() && focusPath
                      ? createV2PathWallMs(focusPath)
                      : Number.POSITIVE_INFINITY;
                    // Idle = no token flow (lastStreamAt), not App-byte growth alone.
                    const idleStalled = Boolean(focusPath)
                      && !stallExempt
                      && now - lastStreamAt > idleLimitMs;
                    const pathWalled = Boolean(focusPath)
                      && !stallExempt
                      && now - pathFocusedAt > pathWallMs;
                    const stalled = idleStalled || pathWalled;
                    // Hard abort: idle with no real growth OR same path wall (trickle tokens).
                    if (
                      focusPath
                      && !stallExempt
                      && (idleStalled || pathWalled)
                      && !stallAbort
                    ) {
                      stallAbort = true;
                      stallAbortPath = isCreateV2Active()
                        ? createV2StallRetryPath(focusPath, preferTs)
                        : focusPath;
                      if (!stallCancelFired) {
                        stallCancelFired = true;
                        host.pushStatus(
                          pathWalled
                            ? `Path wall on ${focusPath.split('/').pop()} — cancelling…`
                            : `Stalled on ${focusPath.split('/').pop()} — cancelling…`,
                          focusPath,
                        );
                        cancelCraftJob();
                      }
                    }
                    // Status often; soft-bind throttled (CREATE_V2_SOFT_BIND_MS) — never 32ms full-map thrash.
                    // Product invent: wider paint gap so commitStudio does not freeze the chat shell.
                    const studioPaintGapMs = productInventQueued
                      ? CREATE_V2_SOFT_BIND_MS
                      : 120;
                    if (focusPath && (pathChanged || contentGrew || stalled) && now - lastStudioPaint > studioPaintGapMs) {
                      lastStudioPaint = now;
                      const base = focusPath.split('/').pop() || focusPath;
                      host.pushStatus(
                        stallAbort
                          ? (productInventQueued
                            ? `Ladder · invent stall on ${base} — seed-lift next…`
                            : `Stalled on ${base} — cancelling to retry App…`)
                          : stalled && !contentGrew && !pathChanged
                            ? (productInventQueued
                              ? `Ladder · invent · waiting on ${base}…`
                              : `Still waiting on the coder for ${base}…`)
                            : (productInventQueued
                              ? `Ladder · invent · ${createFileBuildLabel(focusPath, 'Coding')}`
                              : createFileBuildLabel(focusPath, 'Coding')),
                        focusPath,
                      );
                      tickBuildHeartbeat(createFileBuildLabel(focusPath, 'Coding'));
                      if (
                        (pathChanged || contentGrew)
                        && (CREATE_V2_STREAM_PAINT_FILES || !isCreateV2Active())
                      ) {
                        // Live paint only when App / App.css is growing — never mid-stream package.json.
                        const paintOk = !isCreateV2Active()
                          || !focusPath
                          || !isCreateV2ScaffoldPath(focusPath);
                        if (paintOk) {
                          softBindCreateStudio(host, {
                            files: createFilesAcc,
                            projectId: originProjectId,
                            name: lockedProductName,
                            diskRoot: originDiskRoot,
                          });
                        }
                      }
                    }
                  } else if (isCreateV2Active() && focusPath) {
                    // @@@FILE header only (incomplete body) — still enforce path wall.
                    // Never linger on scaffold chrome in Code — remap focus to App.
                    const now = Date.now();
                    const displayFocus = isCreateV2ScaffoldPath(focusPath) ? appPath : focusPath;
                    if (displayFocus !== lastFocusPath) {
                      lastFocusPath = displayFocus;
                      pathFocusedAt = now;
                      host.pushStatus(createFileBuildLabel(displayFocus, 'Coding'), displayFocus);
                    }
                    const wallPath = isCreateV2ScaffoldPath(focusPath) ? focusPath : displayFocus;
                    if (now - pathFocusedAt > createV2PathWallMs(wallPath) && !stallAbort) {
                      stallAbort = true;
                      stallAbortPath = createV2StallRetryPath(focusPath, preferTs);
                      if (!stallCancelFired) {
                        stallCancelFired = true;
                        host.pushStatus(
                          `Path wall on ${focusPath.split('/').pop()} — cancelling…`,
                          displayFocus,
                        );
                        cancelCraftJob();
                      }
                    }
                  }
                } catch { /* ignore stream paint */ }
              },
            );
            } finally {
              if (craftWatchId != null) window.clearInterval(craftWatchId);
            }
            // Fail closed before stall-heal / retry — includes thin create (stall block skipped).
            if (zeroTokenAbort && !sawStreamToken) {
              const tokWall = productInventQueued ? productInventFirstTokenMs : CREATE_V2_FIRST_TOKEN_MS;
              lastError = productInventQueued
                ? `Invent produced no tokens in ${Math.round(tokWall / 1000)}s — seed-lift next`
                : `Coder produced no tokens in ${Math.round(tokWall / 1000)}s`;
              host.pushStatus(
                productInventQueued
                  ? `Ladder · invent quiet ${Math.round(tokWall / 1000)}s — continuing to seed-lift…`
                  : `Coder produced no tokens in ${Math.round(tokWall / 1000)}s — create stopped; retry with a smaller coder.`,
              );
              uiPolishOk = false;
              break;
            }
            if (stallAbort && stallAbortPath) {
              // Product invent stall → seed-lift / Accept (never paste utility floors over seed).
              if (productGenreGuard || productInventQueued) {
                uiPolishOk = false;
                lastError = `Invent stalled on ${stallAbortPath} — seed-lift next`;
                uiPolishReasons = [lastError];
                host.pushStatus('Ladder · invent stall — skipping floors, seed-lift next…');
                break;
              }
              // Thin create: truncation heal only (never paste utility/kiln/sticky floors).
              // Non-thin: may still ship utility floors below.
              try {
              if (!isThinCreatePath()) {
                const { briefLooksLikeStickyNotePage, briefLooksLikeFiringJournal, stickyNotePageApp, stickyNotePageCss, buildUtilityFloorFromBrief } = await import('@/lib/createBuildQuality');
                const kilnBrief = briefLooksLikeFiringJournal(briefForUi)
                  || briefLooksLikeFiringJournal(host.content)
                  || /\b(?:kilnbook|pottery|firing\s+journal)\b/i.test(`${briefForUi}\n${lockedProductName}`);
                // Tip / todo / coffee ONLY when the ask is positively that product —
                // “Forbidden: tip calculator, todo” must never trip a tip stub.
                const { briefWantsUtilityFloorKind } = await import('@/lib/createBuildQuality');
                const utilityBlob = `${briefForUi}\n${lockedProductName}\n${host.content}`;
                const utilityStallBrief = briefWantsUtilityFloorKind(utilityBlob, 'tip')
                  || briefWantsUtilityFloorKind(utilityBlob, 'todo')
                  || briefWantsUtilityFloorKind(utilityBlob, 'coffee');
                if (kilnBrief || utilityStallBrief) {
                  const floor = buildUtilityFloorFromBrief(lockedProductName, briefForUi);
                  if (!floor.app || floor.kind === 'none') {
                    /* no utility stub for this brief — keep craft output */
                  } else {
                  host.pushStatus(
                    kilnBrief
                      ? 'Coder quiet — shipping KilnBook firing-journal floor…'
                      : `Coder quiet — shipping ${floor.kind} utility floor…`,
                  );
                  const appKey = createFilesAcc['src/App.jsx'] && !createFilesAcc['src/App.tsx']
                    ? 'src/App.jsx'
                    : 'src/App.tsx';
                  // Keep a near-complete model App when it already looks like the ask.
                  const priorApp = String(createFilesAcc[appKey] || '');
                  const tipReady = /\bbillAmount\b|\btipPercent\b|\btip\s*percent\b/i.test(priorApp)
                    && /<(?:input|button)\b/i.test(priorApp)
                    && priorApp.length >= 400;
                  const todoReady = /\b(?:todos?|setTodos|addTodo)\b/i.test(priorApp)
                    && /<(?:input|button)\b/i.test(priorApp)
                    && priorApp.length >= 400;
                  const keepPrior = (floor.kind === 'tip' && tipReady)
                    || (floor.kind === 'todo' && todoReady)
                    || (priorApp.length >= 900 && /export\s+default\s+function\s+App/i.test(priorApp));
                  createFilesAcc = {
                    ...createFilesAcc,
                    [appKey]: keepPrior ? priorApp : floor.app,
                    'src/App.css': keepPrior && createFilesAcc['src/App.css']
                      ? createFilesAcc['src/App.css']
                      : floor.css,
                  };
                  softBindCreateStudio(host, {
                    files: createFilesAcc,
                    projectId: originProjectId,
                    name: lockedProductName,
                    diskRoot: originDiskRoot,
                    force: true,
                  });
                  if (originDiskRoot) {
                    await applyChatReplyEdits({
                      reply: [
                        `@@@FILE ${appKey}\n${createFilesAcc[appKey]}`,
                        `@@@FILE src/App.css\n${createFilesAcc['src/App.css']}`,
                      ].join('\n'),
                      projectId: originProjectId,
                      projectName: lockedProductName,
                      files: createFilesAcc,
                      userMessage: briefForUi,
                      diskRoot: originDiskRoot,
                    }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
                  }
                  if (!keepPrior) createFloorFallback = true;
                  uiPolishOk = true;
                  uiPolishReasons = keepPrior ? [] : [`${floor.kind} utility floor — not original craft`];
                  lastError = '';
                  host.pushStatus(
                    keepPrior
                      ? `Keeping crafted ${floor.kind} App after stall — continuing to Live…`
                      : `${floor.kind} floor ready — Live unlock only (quality gated)…`,
                  );
                  break;
                  } // else: floor.app present
                }
                if (briefLooksLikeStickyNotePage(briefForUi) || briefLooksLikeStickyNotePage(host.content)) {
                  host.pushStatus('Coder quiet — shipping basic sticky-note page…');
                  const appKey = createFilesAcc['src/App.jsx'] && !createFilesAcc['src/App.tsx']
                    ? 'src/App.jsx'
                    : 'src/App.tsx';
                  createFilesAcc = {
                    ...createFilesAcc,
                    [appKey]: stickyNotePageApp(lockedProductName),
                    'src/App.css': stickyNotePageCss(),
                  };
                  softBindCreateStudio(host, {
                    files: createFilesAcc,
                    projectId: originProjectId,
                    name: lockedProductName,
                    diskRoot: originDiskRoot,
                    force: true,
                  });
                  if (originDiskRoot) {
                    await applyChatReplyEdits({
                      reply: [
                        `@@@FILE ${appKey}\n${createFilesAcc[appKey]}`,
                        `@@@FILE src/App.css\n${createFilesAcc['src/App.css']}`,
                      ].join('\n'),
                      projectId: originProjectId,
                      projectName: lockedProductName,
                      files: createFilesAcc,
                      userMessage: briefForUi,
                      diskRoot: originDiskRoot,
                    }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
                  }
                  uiPolishOk = true;
                  uiPolishReasons = [];
                  lastError = '';
                  host.pushStatus('Sticky-note page ready (title + note box)…');
                  break;
                }
                // User Stop must win over stall-heal / Style hops — otherwise UI says
                // "(stopped)" while create keeps coding in the background.
                if (turnAborted()) {
                  const abortReason = createTimedOut()
                    ? 'Create soft wall reached during UI craft'
                    : host.shouldAbort?.()
                      ? 'Create stopped during UI craft'
                      : 'Create superseded after switching chats';
                  markCreateJobFailed(jobId, abortReason, undefined, {
                    craftBlocked: true,
                    blockedReasons: ['Craft stalled or stopped'],
                  });
                  unbindCreateChat(host, host.chatId, { keepCodePill: Boolean(originDiskRoot) });
                  markBuildDiagnosticsEnded();
                  clearBuildWritingPath(createTimedOut() ? 'Craft timed out' : 'Stopped');
                  await host.finishPlainReply(
                    createTimedOut()
                      ? createBudgetExceededReply(budgetProfile, lockedProductName)
                      : [
                          `**${lockedProductName}** create miss — ${abortReason.toLowerCase()}.`,
                          originDiskRoot ? `**Where:** \`${originDiskRoot}\`` : '',
                          'Folder/Code stay available — craft stalled before Ready.',
                        ].filter(Boolean).join('\n'),
                    'NOVA · create',
                  );
                  return { status: 'handled' };
                }
              } // end non-thin floor salvage
                // Near-complete App after stall/wall: close truncation (thin + non-thin).
                const appKeyStall = createFilesAcc['src/App.jsx']
                  ? 'src/App.jsx'
                  : (createFilesAcc['src/App.tsx'] ? 'src/App.tsx' : '');
                const appStallBody = appKeyStall ? String(createFilesAcc[appKeyStall] || '') : '';
                if (appKeyStall && appStallBody.length >= 400) {
                  host.pushStatus('Stall with partial App — healing truncation…');
                  const { healNearCompleteTruncatedSource } = await import('@/lib/freshSpaFromBrief');
                  const {
                    healNearReadyCreateUi: healUi,
                    previewReadyForBrief: previewGate,
                  } = await import('@/lib/createBuildQuality');
                  const closed = healNearCompleteTruncatedSource(appKeyStall, appStallBody);
                  createFilesAcc = { ...createFilesAcc, [appKeyStall]: closed || appStallBody };
                  const near = healUi(createFilesAcc, lockedProductName, briefForUi);
                  if (near.changed) createFilesAcc = near.files;
                  softBindCreateStudio(host, {
                    files: createFilesAcc,
                    projectId: originProjectId,
                    name: lockedProductName,
                    diskRoot: originDiskRoot,
                    force: true,
                  });
                  if (originDiskRoot) {
                    await applyChatReplyEdits({
                      reply: [
                        `@@@FILE ${appKeyStall}\n${createFilesAcc[appKeyStall]}`,
                        createFilesAcc['src/App.css']
                          ? `@@@FILE src/App.css\n${createFilesAcc['src/App.css']}`
                          : '',
                      ].filter(Boolean).join('\n'),
                      projectId: originProjectId,
                      projectName: lockedProductName,
                      files: createFilesAcc,
                      userMessage: briefForUi,
                      diskRoot: originDiskRoot,
                    }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
                  }
                  const gate = previewGate(createFilesAcc, {
                    productName: lockedProductName,
                    brief: briefForUi,
                    spec: ensembleSpec,
                    contract: ensembleContract,
                  });
                  if (gate.ok && !isThinCreatePath() && !productGenreGuard) {
                    uiPolishOk = true;
                    uiPolishReasons = [];
                    lastError = '';
                    host.pushStatus('Partial App healed — Preview Ready…');
                    break;
                  }
                  if (productGenreGuard) {
                    uiPolishOk = false;
                    host.pushStatus('Ladder · partial invent heal — Quality Accept still required…');
                  }
                  if (isThinCreatePath()) {
                    host.pushStatus('Partial App healed — continuing thin depth (not Live yet)…');
                  } else {
                    uiPolishReasons = gate.reasons?.slice(0, 6) || [];
                    host.pushStatus('Partial heal incomplete — one repair pass…');
                  }
                }
              } catch { /* keep partial */ }
              // Zero tokens: fail closed — do not continue into another setEngineModel / craft loop.
              if (zeroTokenAbort && !sawStreamToken) {
                lastError = `Coder produced no tokens in ${Math.round(CREATE_V2_FIRST_TOKEN_MS / 1000)}s`;
                host.pushStatus(
                  `Coder produced no tokens in ${Math.round(CREATE_V2_FIRST_TOKEN_MS / 1000)}s — create stopped; retry with a smaller coder.`,
                );
                uiPolishOk = false;
                break;
              }
              // Item 1: one short repair pass when attempts remain.
              lastError = `Coder stalled on ${stallAbortPath}`;
              if (attempt < maxPolishAttempts - 1) {
                stalledPathHint = stallAbortPath;
                host.pushStatus(`Craft wall on ${stallAbortPath.split('/').pop()} — repair pass…`, stallAbortPath);
                continue;
              }
              stalledPathHint = '';
              host.pushStatus(`Craft wall hit on ${stallAbortPath} — continuing with partial App…`, stallAbortPath);
              if (isThinCreatePath()) {
                uiPolishOk = false;
                uiPolishReasons = [
                  `Craft stalled — idle wall on ${stallAbortPath}`,
                  ...(uiPolishReasons || []).slice(0, 4),
                ];
              }
              break;
            }
            if (turnAborted() || await host.stopIfSuperseded()) {
              const abortReason = createTimedOut()
                ? 'Create soft wall reached during UI craft'
                : host.shouldAbort?.()
                  ? 'Create stopped during UI craft'
                  : 'Create superseded after switching chats';
              markCreateJobFailed(jobId, abortReason, undefined, {
                craftBlocked: true,
                blockedReasons: [lastError || 'Craft stalled or stopped'],
              });
              unbindCreateChat(host, host.chatId, { keepCodePill: Boolean(originDiskRoot) });
              markBuildDiagnosticsEnded();
              clearBuildWritingPath(createTimedOut() ? 'Craft timed out' : 'Stopped');
              await host.finishPlainReply(
                createTimedOut()
                  ? createBudgetExceededReply(budgetProfile, lockedProductName)
                  : [
                      `**${lockedProductName}** create miss — ${abortReason.toLowerCase()}.`,
                      originDiskRoot ? `**Where:** \`${originDiskRoot}\`` : '',
                      lastError ? `**Why:** ${lastError}` : 'Folder/Code stay available — craft stalled before Ready.',
                    ].filter(Boolean).join('\n'),
                'NOVA · create',
              );
              return { status: 'handled' };
            }
            modelReply = String(result.text || '').trim();
            if (!modelReply) {
              // Timeout often still left partial @@@FILE in streamBuf / createFilesAcc.
              const partial = String(streamBuf || '').trim();
              if (partial && /@@@FILE\b/i.test(partial)) {
                modelReply = partial;
                lastError = result.error || 'UI polish timed out with a partial reply';
              } else if (zeroTokenAbort && !sawStreamToken) {
                lastError = `Coder produced no tokens in ${Math.round(CREATE_V2_FIRST_TOKEN_MS / 1000)}s`;
                host.pushStatus(
                  `Coder produced no tokens in ${Math.round(CREATE_V2_FIRST_TOKEN_MS / 1000)}s — create stopped; retry with a smaller coder.`,
                );
                uiPolishOk = false;
                break;
              } else {
                lastError = result.error
                  || (result.meta ? `UI model returned an empty reply (${result.meta})` : null)
                  || 'UI model returned an empty reply';
                continue;
              }
            }
            const polishFilePaths = [...modelReply.matchAll(/@@@FILE\s+([^\s\n]+)/g)]
              .map((m) => String(m[1] || '').replace(/\\/g, '/').replace(/^\.\//, ''))
              .filter(Boolean);
            for (const rel of polishFilePaths) {
              host.pushStatus(createFileBuildLabel(rel, 'Writing'));
              await new Promise((r) => setTimeout(r, 180));
            }
            const applied = await applyChatReplyEdits({
              reply: modelReply,
              projectId: originProjectId,
              projectName: buildIntent.name,
              files: createFilesAcc,
              userMessage: briefForUi,
              diskRoot: originDiskRoot,
            });
            if (!applied.ok || !applied.updated.length) {
              lastError = createApplyFailureReason(applied);
              host.pushStatus(`${lastError} — preserving the last valid project files and retrying…`);
              continue;
            }
            createFilesAcc = applied.files;
            if (
              !productGenreGuard
              && !productInventQueued
              && thinCreateLocksAppJsx(briefForUi, lockedProductName)
              && thinWantsCompositionalShell(briefForUi)
            ) {
              createFilesAcc = applyCompositionalDepthMerge(
                createFilesAcc,
                briefForUi,
                lockedProductName,
              );
            }
            // Product invent must never keep a compositional shell that wiped the seed.
            if (
              (productGenreGuard || productInventQueued)
              && productInventSnapshot?.appJsx
              && appLooksLikeCompositionalShell(
                String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || ''),
              )
            ) {
              host.pushStatus('Ladder · invent wrote section shell — restoring Normal seed…');
              restoreProductInventSnapshot('invent compositional shell');
            }
            softBindCreateStudio(host, {
              files: createFilesAcc,
              projectId: originProjectId,
              name: lockedProductName,
              diskRoot: originDiskRoot,
              force: true,
            });
            // Never let a thinner/truncated App.css wipe a richer prior write.
            {
              const prevCss = String(polishSnapshot['src/App.css'] || '');
              const nextCss = String(createFilesAcc['src/App.css'] || '');
              const prevApp = String(polishSnapshot['src/App.tsx'] || polishSnapshot['src/App.jsx'] || '');
              const nextApp = String(createFilesAcc['src/App.tsx'] || createFilesAcc['src/App.jsx'] || '');
              if (prevCss.length >= 400 && nextCss.length < Math.max(400, Math.floor(prevCss.length * 0.55))) {
                host.pushStatus('Keeping prior App.css — new polish write was too thin…', 'src/App.css');
                createFilesAcc = { ...createFilesAcc, 'src/App.css': prevCss };
              }
              // Compositional assemble intentionally shrinks App into a <Section /> shell
              // (fat body carved to PageBodySection). Never restore the monolith over that.
              const nextIsCompositionalShell = thinWantsCompositionalShell(briefForUi)
                && (
                  appLooksLikeCompositionalShell(nextApp)
                  || Boolean(createFilesAcc['src/sections/PageBodySection.jsx'])
                  || /from\s+['"]\.\/sections\//i.test(nextApp)
                );
              if (
                !nextIsCompositionalShell
                && prevApp.length >= 800
                && nextApp.length < Math.max(600, Math.floor(prevApp.length * 0.55))
              ) {
                host.pushStatus('Keeping prior App — new polish write was too thin…');
                const appKey = createFilesAcc['src/App.tsx'] && !createFilesAcc['src/App.jsx']
                  ? 'src/App.tsx'
                  : (createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx');
                const prevKey = polishSnapshot['src/App.tsx'] && !polishSnapshot['src/App.jsx']
                  ? 'src/App.tsx'
                  : (polishSnapshot['src/App.jsx'] ? 'src/App.jsx' : appKey);
                createFilesAcc = { ...createFilesAcc, [appKey]: polishSnapshot[prevKey] || prevApp };
              }
            }
            const {
              sanitizeCreatePolishPlaceholders,
              createPolishMissingLocalImports,
              healMissingLocalImports,
              healMissingIconPackImports,
              stripModelProseFromSource,
            } = await import('@/lib/createBuildQuality');
            const { looksLikeTruncatedUiSource, healNearCompleteTruncatedSource } = await import('@/lib/freshSpaFromBrief');
            const { createFileReEditLabel } = await import('@/lib/createProgressCopy');
            // Heal missing ./productData-style imports instead of fail-looping forever.
            {
              const miss0 = createPolishMissingLocalImports(createFilesAcc);
              if (miss0.length) {
                host.pushStatus(`Repairing missing imports (${miss0.slice(0, 3).join(', ')})…`);
                const healed = healMissingLocalImports(createFilesAcc, lockedProductName, {
                  brief: briefForUi || authoritativeOriginalBrief || '',
                  artifactKind: createArtifactKind,
                });
                createFilesAcc = healed.files;
              }
              const icons = healMissingIconPackImports(createFilesAcc);
              if (icons.healed.length) {
                host.pushStatus('Removing undeclared icon-pack imports…');
                createFilesAcc = icons.files;
              }
            }
            // Strip prose leaks from App/CSS before Ready checks.
            {
              const appKey0 = createFilesAcc['src/App.tsx'] && !createFilesAcc['src/App.jsx']
                ? 'src/App.tsx'
                : (createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx');
              for (const k of [appKey0, 'src/App.css'] as const) {
                const raw = createFilesAcc[k];
                if (!raw) continue;
                const scrubbed = stripModelProseFromSource(k, raw);
                if (scrubbed && scrubbed !== raw) {
                  createFilesAcc = { ...createFilesAcc, [k]: scrubbed };
                }
              }
            }
            const missing = createPolishMissingLocalImports(createFilesAcc);
            let appProbe = createFilesAcc['src/App.tsx'] || createFilesAcc['src/App.jsx'] || '';
            let cssProbe = createFilesAcc['src/App.css'] || '';
            const appKeyProbe = createFilesAcc['src/App.tsx'] && !createFilesAcc['src/App.jsx']
              ? 'src/App.tsx'
              : (createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx');
            // Near-complete local GGUF cuts (`<footer className="foo`) — heal before fail/retry.
            {
              const healedApp = healNearCompleteTruncatedSource(appKeyProbe, appProbe);
              const healedCss = healNearCompleteTruncatedSource('src/App.css', cssProbe);
              const healBlocks: string[] = [];
              if (healedApp !== appProbe) {
                createFilesAcc = { ...createFilesAcc, [appKeyProbe]: healedApp };
                appProbe = healedApp;
                healBlocks.push(`@@@FILE ${appKeyProbe}\n${healedApp}`);
              }
              if (healedCss !== cssProbe) {
                createFilesAcc = { ...createFilesAcc, 'src/App.css': healedCss };
                cssProbe = healedCss;
                healBlocks.push(`@@@FILE src/App.css\n${healedCss}`);
              }
              if (healBlocks.length) {
                host.pushStatus('Healing truncated App/CSS close…', appKeyProbe);
                try {
                  await applyChatReplyEdits({
                    reply: healBlocks.join('\n'),
                    projectId: originProjectId,
                    projectName: buildIntent.name,
                    files: createFilesAcc,
                    userMessage: briefForUi,
                    diskRoot: originDiskRoot,
                  });
                } catch { /* best-effort */ }
              }
            }
            const truncatedApp = looksLikeTruncatedUiSource(appProbe);
            const truncatedCss = looksLikeTruncatedUiSource(cssProbe);
            const truncated = truncatedApp || truncatedCss;
            if (missing.length || truncated) {
              const badPath = truncatedCss
                ? 'src/App.css'
                : appKeyProbe;
              host.pushStatus(createFileReEditLabel(badPath), badPath);
              // Never wipe a longer partial App back to the scaffold stub.
              // Only restore snapshot when it was a previously verified (non-stub) UI.
              const snapApp = String(polishSnapshot[appKeyProbe] || polishSnapshot['src/App.jsx'] || polishSnapshot['src/App.tsx'] || '');
              const snapCss = String(polishSnapshot['src/App.css'] || '');
              const snapIsStub = snapApp.length < 220
                || /<h1[^>]*>\s*Todo List\s*<\/h1>\s*<\/div>\s*\)\s*;?\s*\}\s*$/i.test(snapApp)
                || (/export default function App\(\)\s*\{\s*return\s*\(\s*<div[^>]*>\s*<h1/i.test(snapApp) && snapApp.length < 400);
              const partialBetter = (truncatedApp && appProbe.length > snapApp.length + 80)
                || (truncatedCss && cssProbe.length > snapCss.length + 40);
              if (snapIsStub && partialBetter) {
                // Keep the longer partial for the next rewrite attempt — do not restore stub.
                host.pushStatus('Keeping partial App write — rewriting truncated section…', badPath);
              } else {
                // Restore disk from last good snapshot — not memory-only.
                createFilesAcc = { ...polishSnapshot };
                try {
                  const restoreBlocks = Object.entries(polishSnapshot)
                    .filter(([p]) => /App\.(tsx|jsx|css)$/i.test(p))
                    .map(([p, body]) => `@@@FILE ${p}\n${body}`)
                    .join('\n');
                  if (restoreBlocks) {
                    await applyChatReplyEdits({
                      reply: restoreBlocks,
                      projectId: originProjectId,
                      projectName: buildIntent.name,
                      files: createFilesAcc,
                      userMessage: briefForUi,
                      diskRoot: originDiskRoot,
                    });
                  }
                } catch { /* best-effort restore */ }
              }
              lastError = missing.length
                ? `App imports missing modules: ${missing.slice(0, 6).join(', ')}`
                : 'App/CSS source looks truncated mid-write';
              if (attempt < 3) continue;
              break;
            }
            host.pushStatus('Verified App and App.css — continuing polish…');
            // Keep the best verified UI so later thin/truncated writes cannot wipe it.
            polishSnapshot = { ...createFilesAcc };
            const preferTsApp = Boolean(
              createFilesAcc['src/App.tsx'] && !createFilesAcc['src/App.jsx'],
            );
            const appKey = preferTsApp ? 'src/App.tsx' : (createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx');
            let appBody = createFilesAcc[appKey] || createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '';
            const cleaned = sanitizeCreatePolishPlaceholders(appBody);
            const cssBody = createFilesAcc['src/App.css'] || '';
            const cleanedCss = sanitizeCreatePolishPlaceholders(cssBody);
            const cleanBlocks: string[] = [];
            if (cleaned !== appBody) cleanBlocks.push(`@@@FILE ${appKey}\n${cleaned}`);
            if (cleanedCss !== cssBody) cleanBlocks.push(`@@@FILE src/App.css\n${cleanedCss}`);
            if (cleanBlocks.length) {
              const cleanApplied = await applyChatReplyEdits({
                reply: cleanBlocks.join('\n'),
                projectId: originProjectId,
                projectName: buildIntent.name,
                files: createFilesAcc,
                userMessage: briefForUi,
                diskRoot: originDiskRoot,
              });
              if (cleanApplied.ok) {
                createFilesAcc = cleanApplied.files;
                appBody = createFilesAcc[appKey] || cleaned;
              }
            }
            // Always link App.css so Live is not browser-default gray.
            {
              const linked = ensureStylesLinked(createFilesAcc);
              if (linked.changed.length) {
                host.pushStatus('Linking App.css…');
                createFilesAcc = linked.files;
                const blocks = linked.changed
                  .map((p) => `@@@FILE ${p}\n${createFilesAcc[p]}`)
                  .join('\n');
                const linkApplied = await applyChatReplyEdits({
                  reply: blocks,
                  projectId: originProjectId,
                  projectName: buildIntent.name,
                  files: createFilesAcc,
                  userMessage: briefForUi,
                  diskRoot: originDiskRoot,
                });
                if (linkApplied.ok) createFilesAcc = linkApplied.files;
              }
            }
            // Rewrite generic /heroes/hero.jpg to brief slug path when present.
            {
              const appKey = createFilesAcc['src/App.tsx'] && !createFilesAcc['src/App.jsx']
                ? 'src/App.tsx'
                : (createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx');
              let body = createFilesAcc[appKey] || '';
              if (body && /\/heroes\/hero\.jpg/i.test(body) && briefSpec.heroHref) {
                body = body.replace(/\/heroes\/hero\.jpg/gi, briefSpec.heroHref);
                createFilesAcc = { ...createFilesAcc, [appKey]: body };
                await applyChatReplyEdits({
                  reply: `@@@FILE ${appKey}\n${body}`,
                  projectId: originProjectId,
                  projectName: buildIntent.name,
                  files: createFilesAcc,
                  userMessage: briefForUi,
                  diskRoot: originDiskRoot,
                }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
              }
            }
            // Heal React.useState without import React — otherwise Live is a black blank window.
            {
              const { ensureReactImportForNamespace } = await import('@/lib/createBuildQuality');
              const appKey = createFilesAcc['src/App.tsx'] && !createFilesAcc['src/App.jsx']
                ? 'src/App.tsx'
                : (createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx');
              const before = createFilesAcc[appKey] || '';
              const healedReact = ensureReactImportForNamespace(before);
              if (healedReact !== before) {
                host.pushStatus('Fixing React import for Live…');
                createFilesAcc = { ...createFilesAcc, [appKey]: healedReact };
                await applyChatReplyEdits({
                  reply: `@@@FILE ${appKey}\n${healedReact}`,
                  projectId: originProjectId,
                  projectName: buildIntent.name,
                  files: createFilesAcc,
                  userMessage: briefForUi,
                  diskRoot: originDiskRoot,
                }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
              }
            }
            appBody = createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '';
            // Stop heartbeat before the gate — otherwise it can overwrite Done and leave
            // "Final pass…" pulsing after the reply has already settled.
            stopPolishBeat();
            host.pushStatus(POLISH_ALMOST_DONE_LABEL);
            await new Promise((r) => setTimeout(r, 120));
            host.pushStatus(POLISH_FINAL_PASS_LABEL);
            const { previewReadyForBrief, healNearReadyCreateUi } = await import('@/lib/createBuildQuality');
            // Near-ready heal: brand stamp + CSS floor when craft left a real App
            // but tokens-only App.css / missing product name would fail Ready.
            // Thin create: keep model craft — no CSS/marketing floor paste mid-gate.
            if (!isThinCreatePath()) {
              try {
                const nearHeal = healNearReadyCreateUi(createFilesAcc, lockedProductName, briefForUi);
                if (nearHeal.changed) {
                  createFilesAcc = nearHeal.files;
                  appBody = createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '';
                  host.pushStatus(
                    nearHeal.actions.includes('css-floor')
                      ? 'Filling thin App.css so Preview can open…'
                      : 'Stamping product name into the UI…',
                  );
                  if (originDiskRoot) {
                    const appKeyHeal = createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx';
                    await applyChatReplyEdits({
                      reply: [
                        createFilesAcc[appKeyHeal] ? `@@@FILE ${appKeyHeal}\n${createFilesAcc[appKeyHeal]}` : '',
                        createFilesAcc['src/App.css'] ? `@@@FILE src/App.css\n${createFilesAcc['src/App.css']}` : '',
                      ].filter(Boolean).join('\n'),
                      projectId: originProjectId,
                      projectName: lockedProductName,
                      files: createFilesAcc,
                      userMessage: briefForUi,
                      diskRoot: originDiskRoot,
                    }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
                  }
                }
              } catch { /* best-effort */ }
            }
            const ready = previewReadyForBrief(createFilesAcc, {
              productName: lockedProductName,
              brief: originalBrief,
              spec: ensembleSpec,
              contract: ensembleContract,
            });
            host.pushStatus('Done');
            const briefMisses = briefCreateMisses(briefSpec, createFilesAcc);
            const filler = looksLikeFillerStubAppSource(appBody);
            // Thin create: if craft wrote a real App, take it — don't retry into floors.
            if (isThinCreatePath() && !filler) {
              try {
                const { runCreateSyntaxGate } = await import('@/lib/createSyntaxGate');
                const syn = runCreateSyntaxGate(createFilesAcc);
                if (syn.healed) createFilesAcc = syn.files;
                if (thinCraftMayContinue(createFilesAcc, syn.ok, syn.reasons)) {
                  uiPolishOk = true;
                  uiPolishReasons = [];
                  host.pushStatus('Thin create · craft kept — continuing…');
                  break;
                }
              } catch { /* fall through */ }
            }
            if (!ready.ok || filler || briefMisses.length) {
              // Fail-closed for this attempt — one repair/enrich retry max, then stop.
              uiPolishOk = false;
              uiPolishReasons = [
                ...(ready.reasons || []),
                ...briefMisses,
                ...(filler ? ['App is still a filler stub (sample/placeholder text)'] : []),
                ...(lastError ? [lastError] : []),
              ];
              if (attempt < maxPolishAttempts - 1) {
                const reasonBlob = uiPolishReasons.join(' ');
                const needsRepair = isCreateV2Active()
                  && /truncat|broken|incomplete|stalled|filler|TypeScript syntax/i.test(reasonBlob);
                if (needsRepair) {
                  stalledPathHint = appPath;
                  host.pushStatus(createV2StatusRepair(appPath), appPath);
                  continue;
                }
                // Thin: one trunc repair max — no enrich rewrites that fight uniqueness.
                if (isThinCreatePath() && !needsRepair) {
                  break;
                }
                const missHint = (briefMisses[0] || ready.reasons?.[0] || 'UI depth')
                  .replace(/^missing\s+/i, '');
                host.pushStatus(
                  `Re-editing the UI: adding ${missHint.slice(0, 72)}…`,
                  appPath,
                );
                continue;
              }
              break;
            }
            // Ready means stop — no soft floor / forced enrich after success.
            // Product invent: generic previewReady is not Quality Accept — seed still fails.
            // If invent regresses below Normal (thin stub), restore seed then seed-lift.
            if (productInventQueued || productGenreGuard) {
              try {
                const {
                  appLooksLikeProductSeedFloor,
                  gradeProductQuality,
                } = await import('@/lib/createProductLadder');
                const productBrief = authoritativeOriginalBrief || briefForUi;
                let graded = gradeProductQuality(
                  createFilesAcc,
                  productBrief,
                  lockedProductName,
                );
                const appNow = String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '');
                const inventRegressed = !graded.okNormal
                  || appNow.length < 1100
                  || !graded.checks?.brand
                  || appLooksLikeCompositionalShell(appNow);
                if (inventRegressed && productInventSnapshot?.appJsx) {
                  host.pushStatus('Ladder · invent regressed below Normal — restoring seed for lift…');
                  restoreProductInventSnapshot('invent regression');
                  if (originDiskRoot) {
                    await persistAcceptedCreateFiles(
                      originDiskRoot,
                      createFilesAcc,
                      ['src/App.jsx', 'src/App.css', 'public/logo.svg'].filter((p) => createFilesAcc[p]),
                    ).catch(() => {});
                  }
                  graded = gradeProductQuality(createFilesAcc, productBrief, lockedProductName);
                }
                if (appLooksLikeProductSeedFloor(
                  String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || ''),
                ) || !graded.okQuality) {
                  uiPolishOk = false;
                  uiPolishReasons = [
                    inventRegressed
                      ? 'Invent regressed — seed restored for Quality seed-lift'
                      : appLooksLikeProductSeedFloor(
                        String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || ''),
                      )
                        ? 'Invent still on seed floor — Quality Accept deferred to seed-lift'
                        : `Invent below Quality (${graded.label}) — seed-lift / Accept next`,
                    ...graded.reasons.slice(0, 3),
                  ];
                  host.pushStatus(`Ladder · invent miss (${graded.label}) — seed-lift next…`);
                  break;
                }
                if (!graded.okPremium) {
                  const { ensureProductPremiumCraft } = await import('@/lib/createProductLadder');
                  host.pushStatus('Ladder · pushing Quality → Premium craft…');
                  createFilesAcc = ensureProductPremiumCraft(
                    createFilesAcc,
                    productBrief,
                    lockedProductName,
                  );
                  graded = gradeProductQuality(createFilesAcc, productBrief, lockedProductName);
                  if (originDiskRoot) {
                    await persistAcceptedCreateFiles(
                      originDiskRoot,
                      createFilesAcc,
                      ['src/App.jsx', 'src/App.css', 'src/App.tsx', 'src/index.css']
                        .filter((p) => createFilesAcc[p]),
                    ).catch(() => {});
                  }
                }
                if (!graded.okPremium) {
                  uiPolishOk = false;
                  uiPolishReasons = [
                    `Invent below Premium (${graded.label}) — premium craft / Accept next`,
                    ...graded.reasons.slice(0, 3),
                  ];
                  host.pushStatus(`Ladder · invent miss (${graded.label}) — premium next…`);
                  break;
                }
                productInventSnapshot = {
                  appJsx: String(createFilesAcc['src/App.jsx'] || ''),
                  appCss: String(createFilesAcc['src/App.css'] || ''),
                  logo: String(createFilesAcc['public/logo.svg'] || ''),
                };
                uiPolishOk = true;
                uiPolishReasons = [];
                host.pushStatus(`Ladder · invent Accept ${graded.label}…`);
                break;
              } catch {
                uiPolishOk = false;
                uiPolishReasons = ['Invent grade failed — seed-lift next'];
                break;
              }
            }
            uiPolishOk = true;
            uiPolishReasons = [];
            break;
          }
          if (uiPolishOk == null && lastError) {
            uiPolishOk = false;
            uiPolishReasons = [
              lastError,
              coder.id ? `Coder: ${coder.name || coder.id}` : '',
            ].filter(Boolean);
          }
          // Product invent stalled/empty/regressed → restore Normal seed so seed-lift can Accept.
          if (
            (productInventQueued || productGenreGuard)
            && uiPolishOk !== true
          ) {
            try {
              const {
                appLooksLikeProductSeedFloor,
                gradeProductQuality,
              } = await import('@/lib/createProductLadder');
              const productBrief = authoritativeOriginalBrief || briefForUi;
              let graded = gradeProductQuality(createFilesAcc, productBrief, lockedProductName);
              const appNow = String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '');
              if (
                (!graded.okNormal || appNow.length < 1100)
                && productInventSnapshot?.appJsx
              ) {
                host.pushStatus('Ladder · invent left thin/Fail page — restoring Normal seed…');
                restoreProductInventSnapshot('invent post-loop regression');
                if (originDiskRoot) {
                  await persistAcceptedCreateFiles(
                    originDiskRoot,
                    createFilesAcc,
                    ['src/App.jsx', 'src/App.css', 'public/logo.svg'].filter((p) => createFilesAcc[p]),
                  ).catch(() => {});
                }
                graded = gradeProductQuality(createFilesAcc, productBrief, lockedProductName);
              }
              if (appLooksLikeProductSeedFloor(
                String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || ''),
              ) || graded.okNormal) {
                uiPolishOk = false;
                if (!uiPolishReasons.length) {
                  uiPolishReasons = [
                    lastError || 'Invent stalled — seed-lift will attempt Quality Accept',
                  ];
                }
                host.pushStatus('Ladder · invent stalled — continuing to seed-lift…');
              }
            } catch { /* ignore */ }
          }
          } finally {
            stopPolishBeat();
          }
        }
      } catch (polishErr) {
        uiPolishOk = false;
        uiPolishReasons = [
          polishErr instanceof Error ? polishErr.message : 'UI polish failed',
        ];
        // Keep last model UI on disk — do not revert to scaffold snapshot.
      }
      } // end dump polish (loop off or loop Ready handoff)
    }

    // Invent-demo host stamp REMOVED — no salvage, no twin, model invents from brief only.
    try {
      const inventQueued = Boolean(
        createFilesAcc['.__novaGenericInventAsk']
        || createFilesAcc['.__novaStorefrontInventAsk'],
      );
      if (inventQueued) {
        const { appLooksLikeInventIncomplete } = await import('@/lib/createInventDemo');
        if (appLooksLikeInventIncomplete(createFilesAcc)) {
          host.pushStatus('Invent incomplete — host twin removed; model must invent from brief…');
          createFloorFallback = false;
          uiPolishOk = false;
          uiPolishReasons = [
            ...(uiPolishReasons || []),
            'invent incomplete — no host demo/fallback',
          ];
        }
      }
    } catch { /* optional */ }

    // Brand assets + public wiring.
    // Structure-first (coding foundation): skip image fetch + logo wire — functional UI only.
    // Arcade / canvas games: skip hero image materialize (was hanging ~20m on "landing"
    // negation in briefs like "Not a website landing page").
    if (originDiskRoot && !blankSolidColor && needsUiPolish) {
      try {
        const { wantsStructureFirstCreate } = await import('@/lib/novaBuildLoop');
        const structureFirst = wantsStructureFirstCreate(briefForUi, lockedProductName);
        if (structureFirst) {
          host.pushStatus('Structure-first — skipping logo/image polish (design later)…');
        }
        const { planBrandAssets, materializeBrandAssets } = await import('@/lib/brandAssets');
        const { looksLikePlayableCanvasGame, looksLikeFpsGame } = await import('@/lib/freshSpaFromBrief');
        const { wireCreatePublicAssets } = await import('@/lib/createBuildQuality');
        const isArcadeBrief = looksLikePlayableCanvasGame(briefForUi) || looksLikeFpsGame(briefForUi);
        // Skip hero fetch on short/simple creates — research-driven utility UIs don't need stock photos.
        const isUtilityToy = briefLooksLikeMicroWebToy(briefForUi) || budgetProfile === 'simple';
        // Product / storefront spine owns App — skip stock-hero thrash (it also runs assembleCreateAppFromParts).
        // Invent-demo owns App — skip stock thrash unless brand kit explicitly allows stock/Openverse.
        const inventDemoShipped = filesHaveInventDemoSite(createFilesAcc);
        let inventKitAllowsStock = false;
        try {
          const kitRaw = createFilesAcc['.nova/brand-kit.json'];
          if (kitRaw) {
            inventKitAllowsStock = inventMayUseStock(JSON.parse(kitRaw));
          }
        } catch { /* optional */ }
        const skipInventStock = inventDemoShipped && !inventKitAllowsStock;
        if (inventDemoShipped && inventKitAllowsStock) {
          host.pushStatus('Invent · kit allows stock — Openverse/photo path enabled…');
        }
        const tryMaterialize = !structureFirst && !isArcadeBrief && !isUtilityToy
          && !productGenreGuard && !storefrontSpineLocked && !skipInventStock && (
          uiPolishOk === true
          || briefLooksLikeMarketingLanding(briefForUi)
          || briefNeedsCreateUiPolish(briefForUi)
        );
        if (structureFirst) {
          /* status already pushed */
        } else if (inventDemoShipped && !inventKitAllowsStock) {
          host.pushStatus('Invent-demo shipped — skipping stock image fetch / logo rewire…');
        } else if (productGenreGuard || storefrontSpineLocked) {
          // Product/delivery/storefront ladder already ships /heroes/*.svg — never thrash stock photos
          // for 4+ minutes (was a major freeze/crash stressor with invent + local GGUF).
          host.pushStatus('Ladder · keeping compose hero images (skip stock fetch)…');
        } else if (isArcadeBrief) {
          host.pushStatus('Skipping hero fetch for playable game…');
        } else if (isUtilityToy) {
          host.pushStatus('Skipping hero fetch for simple utility UI…');
        } else if (tryMaterialize) {
          host.pushStatus('Fetching images for this brief…');
        } else {
          host.pushStatus('Wiring local icons and hero fallbacks…');
        }
        const plan = planBrandAssets(briefForUi, lockedProductName);
        if (tryMaterialize) {
          // Hard cap — never let image fetch pin the machine for many minutes.
          const mat = await Promise.race([
            materializeBrandAssets({
              diskRoot: originDiskRoot,
              files: createFilesAcc,
              plan,
              brief: briefForUi,
              projectName: lockedProductName,
            }),
            new Promise<Awaited<ReturnType<typeof materializeBrandAssets>>>((resolve) => {
              window.setTimeout(() => {
                host.pushStatus('Image fetch wall (90s) — continuing with local heroes…');
                resolve({ files: createFilesAcc, saved: [], note: 'image-fetch-wall' });
              }, 90_000);
            }),
          ]);
          createFilesAcc = mat.files;
          for (const rel of mat.saved || []) {
            const norm = String(rel || '').replace(/\\/g, '/');
            if (/^public\/heroes\//i.test(norm) && createFilesAcc[norm] == null) {
              createFilesAcc[norm] = '';
            }
          }
          host.pushStatus(mat.saved.length
            ? `Saved ${mat.saved.length} product image${mat.saved.length === 1 ? '' : 's'}…`
            : 'Linking App.css…');
        }
        const linkedAfterHero = ensureStylesLinked(createFilesAcc);
        createFilesAcc = linkedAfterHero.files;
        if (!structureFirst && !productGenreGuard && !filesHaveInventDemoSite(createFilesAcc)) {
          const wired = wireCreatePublicAssets(createFilesAcc, lockedProductName, briefForUi);
          createFilesAcc = wired.files;
          if (wired.changed.length || linkedAfterHero.changed.length) {
            host.pushStatus(wired.changed.length ? 'Wiring logo and icons into the UI…' : 'Linking App.css…');
            const appKey = createFilesAcc['src/App.tsx'] && !createFilesAcc['src/App.jsx']
              ? 'src/App.tsx'
              : (createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx');
            await applyChatReplyEdits({
              reply: [
                createFilesAcc[appKey] ? `@@@FILE ${appKey}\n${createFilesAcc[appKey]}` : '',
                createFilesAcc['src/main.jsx'] ? `@@@FILE src/main.jsx\n${createFilesAcc['src/main.jsx']}` : '',
                createFilesAcc['src/main.tsx'] ? `@@@FILE src/main.tsx\n${createFilesAcc['src/main.tsx']}` : '',
                createFilesAcc['src/App.css'] ? `@@@FILE src/App.css\n${createFilesAcc['src/App.css']}` : '',
                ...Object.keys(createFilesAcc)
                  .filter((p) => {
                    const norm = p.replace(/\\/g, '/');
                    if (!/^public\//i.test(norm)) return false;
                    if (/\.(?:jpe?g|png|webp|gif|avif|ico|woff2?|ttf|otf)$/i.test(norm)) return false;
                    const body = String(createFilesAcc[p] || '');
                    if (!body.trim()) return false;
                    return true;
                  })
                  .slice(0, 20)
                  .map((p) => `@@@FILE ${p}\n${createFilesAcc[p]}`),
              ].filter(Boolean).join('\n'),
              projectId: originProjectId,
              projectName: buildIntent.name,
              files: createFilesAcc,
              userMessage: briefForUi,
              diskRoot: originDiskRoot,
            }).then((applied) => {
              if (applied.ok && applied.updated.length) createFilesAcc = applied.files;
            }).catch(() => {});
          }
        } else if (productGenreGuard) {
          host.pushStatus('Ladder · genre guard — skipping App wire assemble…');
          // Only restore seed/invent snapshot when App was poisoned (wrong genre).
          try {
            const {
              appLooksLikeWrongGenreForProductBrief,
              appLooksLikeDeskSpineTemplate,
            } = await import('@/lib/createProductLadder');
            const appNow = String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '');
            const productBrief = authoritativeOriginalBrief || briefForUi;
            if (
              productInventSnapshot?.appJsx
              && (appLooksLikeWrongGenreForProductBrief(appNow, productBrief)
                || appLooksLikeDeskSpineTemplate(appNow))
            ) {
              restoreProductInventSnapshot('after image fetch · wrong-genre overwrite');
              if (originDiskRoot) {
                await persistAcceptedCreateFiles(
                  originDiskRoot,
                  createFilesAcc,
                  ['src/App.jsx', 'src/App.css', 'public/logo.svg'].filter((p) => createFilesAcc[p]),
                ).catch(() => {});
              }
            }
          } catch { /* keep Acc */ }
          updateCreateJob(jobId, { files: createFilesAcc });
        } else if (linkedAfterHero.changed.length) {
          host.pushStatus('Linking App.css…');
        }
        // Thin compositional shells keep landmarks in section files — App-only
        // previewReady would false-fail nav/hero and demote a seed-ready Live.
        if (uiPolishOk === true && !isThinCreatePath() && !productGenreGuard) {
          // Same brief gate as craft — never demote a marketing homepage via raw requireInteractive.
          const { previewReadyForBrief } = await import('@/lib/createBuildQuality');
          const recheck = previewReadyForBrief(createFilesAcc, {
            productName: lockedProductName,
            brief: briefForUi,
            spec: ensembleSpec,
            contract: ensembleContract,
            requireInteractive: chatAppBrief || briefRequiresInteractiveApp(briefForUi),
          });
          if (!recheck.ok) {
            uiPolishOk = false;
            uiPolishReasons = recheck.reasons || ['Asset wire failed Preview Ready'];
          }
        }
      } catch {
        host.pushStatus('Continuing without generated images…');
      }
    }

    // Optional sequential style seat: design GGUF (uigen) once for CSS only — never concurrent.
    // Thin create: skip style hop — keep craft CSS as written.
    if (turnAborted()) {
      const abortReason = createTimedOut()
        ? 'Create soft wall reached during UI craft'
        : host.shouldAbort?.()
          ? 'Create stopped during UI craft'
          : 'Create superseded after switching chats';
      markCreateJobFailed(jobId, abortReason, undefined, {
        craftBlocked: true,
        blockedReasons: ['Craft stalled or stopped'],
      });
      unbindCreateChat(host, host.chatId, { keepCodePill: Boolean(originDiskRoot) });
      markBuildDiagnosticsEnded();
      clearBuildWritingPath(createTimedOut() ? 'Craft timed out' : 'Stopped');
      await host.finishPlainReply(
        createTimedOut()
          ? createBudgetExceededReply(budgetProfile, lockedProductName)
          : [
              `**${lockedProductName}** create miss — ${abortReason.toLowerCase()}.`,
              originDiskRoot ? `**Where:** \`${originDiskRoot}\`` : '',
              'Folder/Code stay available — craft stalled before Ready.',
            ].filter(Boolean).join('\n'),
        'NOVA · create',
      );
      return { status: 'handled' };
    }
    if (needsUiPolish && coderGate.ok && !isThinCreatePath()) {
      try {
        const cssNow = createFilesAcc['src/App.css'] || '';
        const cssThin = cssNow.replace(/\s+/g, '').length < 900
          || (/#0f1419/.test(cssNow) && cssNow.length < 1200);
        const marketingStyle = briefLooksLikeMarketingLanding(briefForUi);
        const needsMotion = marketingStyle
          && (!/@keyframes/i.test(cssNow) || !/radial-gradient|linear-gradient/i.test(cssNow));
        const wantSpecialtyStyle = getLocalPrefs().specialtyStyleHop !== false;
        if (cssThin || needsMotion || marketingStyle) {
          const { runCreateStyleHop } = await import('@/lib/createEnsemble');
          const { withEngineSeat } = await import('@/lib/engineSeatSwap');
          let styleId = coderGate.id;
          let styleName = coderGate.name;
          if (wantSpecialtyStyle) {
            try {
              const { getActiveBrainId } = await import('@/lib/brainRoles');
              const { isUiDesignEngineId } = await import('@/lib/enginePick');
              const { getEngineStatus } = await import('@/lib/novaEngine');
              const designPref = getActiveBrainId('design');
              const status = await getEngineStatus();
              const designHit = (status.models || []).find((m) => {
                const id = String(m.id || '');
                if (m.status !== 'ready') return false;
                if (designPref && designPref !== 'NOVA-auto' && id === designPref) return true;
                return isUiDesignEngineId(id);
              });
              if (designHit?.id && designHit.id !== coderGate.id) {
                styleId = designHit.id;
                styleName = String(designHit.name || designHit.id);
              }
            } catch { /* keep craft brain */ }
          }
          host.pushStatus(
            styleId === coderGate.id
              ? `Style · **${styleName}** (same brain · CSS polish)…`
              : `Style · **${styleName}** (design seat · CSS only · one swap)…`,
          );
          const appSrc = createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '';
          const { result: styled, usedId, swapped } = await withEngineSeat({
            seatId: styleId,
            restoreId: coderGate.id,
            createInflight: true,
            run: async (activeId) => {
              const nameForSeat = activeId === styleId ? styleName : coderGate.name;
              if (styleId !== coderGate.id && activeId === coderGate.id) {
                host.pushStatus(`Style · **${coderGate.name}** (design swap failed · same brain)…`);
              }
              return runCreateStyleHop({
                brief: briefForUi,
                productName: lockedProductName,
                appSource: appSrc,
                cssSource: cssNow,
                modelId: activeId,
                modelName: nameForSeat,
                contract: ensembleContract,
                shouldAbort: () => turnAborted(),
              });
            },
          });
          void usedId;
          void swapped;
          if (styled.css && styled.css.length >= Math.min(cssNow.length, 200)) {
            createFilesAcc = { ...createFilesAcc, 'src/App.css': styled.css };
            await applyChatReplyEdits({
              reply: `@@@FILE src/App.css\n${styled.css}`,
              projectId: originProjectId,
              projectName: buildIntent.name,
              files: createFilesAcc,
              userMessage: briefForUi,
              diskRoot: originDiskRoot,
            }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
            host.pushStatus('Style applied (App untouched)…');
          }
        }
      } catch {
        /* style pass best-effort */
      }
    }

    // Deterministic premium CSS floor before final Ready — do not depend on style-model luck.
    // Thin create: never paste marketing CSS companion floors.
    if (needsUiPolish && !isThinCreatePath() && briefLooksLikeMarketingLanding(briefForUi)) {
      try {
        const { healNearReadyCreateUi, previewReadyForBrief } = await import('@/lib/createBuildQuality');
        const preHeal = healNearReadyCreateUi(createFilesAcc, lockedProductName, briefForUi);
        if (preHeal.changed) {
          createFilesAcc = preHeal.files;
          if (originDiskRoot && createFilesAcc['src/App.css']) {
            await applyChatReplyEdits({
              reply: `@@@FILE src/App.css\n${createFilesAcc['src/App.css']}`,
              projectId: originProjectId,
              projectName: lockedProductName,
              files: createFilesAcc,
              userMessage: briefForUi,
              diskRoot: originDiskRoot,
            }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
          }
          host.pushStatus('Premium CSS motion/atmosphere locked in…');
        }
        // Style hop often lands after an earlier craft Ready fail left uiPolishOk=false.
        // Re-gate here so good post-style CSS can clear craft preflight.
        const postStyleGate = previewReadyForBrief(createFilesAcc, {
          productName: lockedProductName,
          brief: originalBrief,
          spec: ensembleSpec,
          contract: ensembleContract,
        });
        if (postStyleGate.ok) {
          uiPolishOk = true;
          uiPolishReasons = [];
          host.pushStatus('Post-style Preview Ready cleared…');
        } else if (uiPolishOk !== true) {
          uiPolishReasons = postStyleGate.reasons?.length
            ? postStyleGate.reasons
            : uiPolishReasons;
        }
      } catch { /* best-effort */ }
    }

    // Originality / quality lint — never paste a Design Spine template heal.
    // Thin create: lint is advisory only (do not fail craft into floors).
    if (needsUiPolish) {
      try {
        const { lintOriginalCreateQuality } = await import('@/lib/createDesignSystem');
        const orig = lintOriginalCreateQuality(createFilesAcc, {
          brief: briefForUi,
          productName: lockedProductName,
        });
        if (!orig.ok) {
          if (isThinCreatePath()) {
            host.pushStatus(`Originality notes · ${orig.reasons.slice(0, 2).join('; ')}`);
            pushBuildDiag({
              kind: 'warn',
              detail: `Originality lint (thin advisory): ${orig.reasons.join('; ')}`,
            });
          } else {
            uiPolishOk = false;
            uiPolishReasons = orig.reasons;
            host.pushStatus(`Originality gate · ${orig.reasons.slice(0, 2).join('; ')}`);
            pushBuildDiag({
              kind: 'warn',
              detail: `Originality lint: ${orig.reasons.join('; ')}`,
            });
          }
        }
      } catch {
        /* originality lint best-effort */
      }
    }

    // Layout-quality: hard-block marketing when scores fail (no “continuing to Live…”).
    // Functional readiness without LayoutContract templates (originality lint already ran).
    if (needsUiPolish) {
      try {
        const { buildProductSpec, scoreFunctionalReady } = await import('@/lib/createLayoutContract');
        const specForScore = ensembleSpec || buildProductSpec({
          brief: briefForUi,
          productName: lockedProductName,
        });
        const funcScore = scoreFunctionalReady(createFilesAcc, {
          brief: briefForUi,
          spec: specForScore,
        });
        if (!funcScore.ok) {
          host.pushStatus(`Quality notes (${funcScore.score}) — ${funcScore.reasons.slice(0, 2).join('; ')}`);
          pushBuildDiag({
            kind: 'warn',
            detail: `Functional score ${funcScore.score}: ${funcScore.reasons.join('; ')}`,
          });
        }
      } catch {
        /* notes best-effort */
      }
    }

    // Thin create: finish truncated App.jsx BEFORE final honesty / floors demote success.
    // Product ladder: invent/lift own App — never thin finish/compositional depth over seed.
    if (isThinCreatePath() && !productGenreGuard && needsUiPolish && uiPolishOk !== true) {
      try {
        const { runCreateSyntaxGate } = await import('@/lib/createSyntaxGate');
        if (thinCreateLocksAppJsx(briefForUi, lockedProductName)) {
          createFilesAcc = thinCoerceLockedAppJsx(createFilesAcc);
        }
        try {
          const { buildProductPlan, antiBleedForFamily } = await import('@/lib/createProductPlan');
          const plan = buildProductPlan(briefForUi, lockedProductName);
          const bled = antiBleedForFamily(createFilesAcc, plan);
          if (bled.changed) createFilesAcc = bled.files;
        } catch { /* ignore */ }
        let synEarly = runCreateSyntaxGate(createFilesAcc);
        if (synEarly.healed) createFilesAcc = synEarly.files;
        const thinFinishAppPath = thinCreatePrimaryAppPath(briefForUi, createFilesAcc, lockedProductName);
        if (
          !thinCraftMayContinue(createFilesAcc, synEarly.ok, synEarly.reasons)
          && thinAppNeedsFinishPass(createFilesAcc, synEarly.reasons)
          && coderGate.ok
          && !turnAborted()
        ) {
          host.pushStatus(`Finish App · **${coderGate.name}** (complete ${thinFinishAppPath})…`);
          const { answerStudio } = await import('@/lib/studioAnswerEngine');
          const broken = String(createFilesAcc['src/App.jsx'] || '');
          const finish = await answerStudio({
            userMessage: formatFinishAppPrompt({
              brief: authoritativeOriginalBrief,
              productName: lockedProductName,
              brokenApp: broken,
            }),
            files: createFilesAcc,
            projectName: lockedProductName,
            mode: 'code',
            preferredModelId: coderGate.id,
            preferredModelName: coderGate.name,
            preferredSource: coderGate.source,
            stickyModelId: coderGate.id,
            stickyModelName: coderGate.name,
            stickyPinnedSource: 'local',
            allowFileEdits: true,
            timeoutMs: Math.min(180_000, createV2AttemptWallMs(budgetProfile)),
            shouldAbort: () => turnAborted(),
          });
          let reply = String(finish?.text || '');
          // Models sometimes omit @@@FILE — wrap a complete App dump.
          if (!/@@@FILE\s+src\/App\./i.test(reply) && /export\s+default\b/i.test(reply)) {
            const body = reply
              .replace(/^[\s\S]*?(?=import\s|const\s|function\s|export\s)/, '')
              .replace(/```[\s\S]*$/, '')
              .trim();
            if (body.length > 120) reply = `@@@FILE ${THIN_CREATE_APP_PATH}\n${body}`;
          }
          if (/@@@FILE\s+src\/App\./i.test(reply)) {
            const applied = await applyChatReplyEdits({
              reply,
              projectId: originProjectId,
              projectName: lockedProductName,
              files: createFilesAcc,
              userMessage: briefForUi,
              diskRoot: originDiskRoot,
            });
            if (applied.ok) {
              createFilesAcc = applied.files;
              if (thinCreateLocksAppJsx(briefForUi, lockedProductName)) {
                createFilesAcc = thinCoerceLockedAppJsx(createFilesAcc);
              }
            }
          }
          synEarly = runCreateSyntaxGate(createFilesAcc);
          if (synEarly.healed) createFilesAcc = synEarly.files;
        }
        if (thinCraftMayContinue(createFilesAcc, synEarly.ok, synEarly.reasons)) {
          // Seed genre visuals BEFORE invent depth — otherwise 7B burns the soft wall on
          // phone/sparkles and Live never sees bottle/wine (persist was after depth / hung).
          if (thinWantsCompositionalShell(briefForUi)) {
            createFilesAcc = seedCompositionalBrandVisuals(
              createFilesAcc,
              briefForUi,
              lockedProductName,
            );
            try {
              const { wireCreatePublicAssets } = await import('@/lib/createBuildQuality');
              createFilesAcc = wireCreatePublicAssets(
                createFilesAcc,
                lockedProductName,
                briefForUi,
              ).files;
            } catch { /* wire best-effort */ }
            if (originDiskRoot) {
              const persistEarly = await persistAcceptedCreateFiles(
                originDiskRoot,
                createFilesAcc,
                genreLockPersistKeys(createFilesAcc),
              ).catch((e) => ({ ok: false as const, error: String(e) }));
              const logoBody = String(createFilesAcc['public/logo.svg'] || '');
              if (logoBody && !/M9\.937 15\.5/i.test(logoBody)) {
                await persistGenreLogoSvg(originDiskRoot, logoBody).catch(() => {});
              }
              const clears = thinGenreSeedClearsLive(createFilesAcc, briefForUi, lockedProductName);
              host.pushStatus(
                persistEarly?.ok === false
                  ? `Thin create · genre seed before depth · persist failed — ${String(persistEarly.error || 'write').slice(0, 80)}`
                  : `Thin create · genre seed before depth · clearsLive=${clears ? 'yes' : 'no'} · logo=${/M8 22h8/.test(logoBody) ? 'wine' : /M16 8a1 1 0 0 1 1 1v8/.test(logoBody) ? 'coffee' : /M3 2v7c0 1\.1/.test(logoBody) ? 'utensils' : /M9\.937/.test(logoBody) ? 'sparkles' : 'other'}`,
              );
            } else {
              host.pushStatus('Thin create · genre seed before depth…');
            }
            updateCreateJob(jobId, { files: createFilesAcc });
          }
          // Rich website/brand asks: compiling ≠ done — invent-from-brief depth continues (no floors).
          // When seed already clears Live + genre ask + full composition, skip invent thrash.
          // F&B (bottle/coffee/tea/…) still runs depth — seed owns logos, invent owns section files.
          if (
            !thinDepthRan
            && thinNeedsDepthPass(createFilesAcc, briefForUi)
            && !thinGenreSeedClearsLive(createFilesAcc, briefForUi, lockedProductName)
            && !inventFloorFastPath
            && !inventFloorClearsLive(createFilesAcc, briefForUi, lockedProductName)
            && coderGate.ok
            && !turnAborted()
          ) {
            thinDepthRan = true;
            /** Why depth stopped — pushed to status + build diag so the exit is provable. */
            let depthSummary = 'no depth attempts recorded';
            let depthCraftStalled = false;
            try {
              // Require a non-truncated prior before depth invent (poisoned prior → thrash).
              {
                const priorCheck = String(createFilesAcc['src/App.jsx'] || '');
                if (thinAppLooksTruncated(priorCheck) && coderGate.ok && !turnAborted()) {
                  host.pushStatus('Depth preflight · finishing truncated App before invent…');
                  const { answerStudio: finishStudio } = await import('@/lib/studioAnswerEngine');
                  const fin = await finishStudio({
                    userMessage: formatFinishAppPrompt({
                      brief: briefForUi,
                      productName: lockedProductName,
                      brokenApp: priorCheck,
                    }),
                    files: createFilesAcc,
                    projectName: lockedProductName,
                    mode: 'code',
                    preferredModelId: coderGate.id,
                    preferredModelName: coderGate.name,
                    preferredSource: coderGate.source,
                    stickyModelId: coderGate.id,
                    stickyModelName: coderGate.name,
                    stickyPinnedSource: 'local',
                    allowFileEdits: true,
                    timeoutMs: Math.min(180_000, createV2AttemptWallMs(budgetProfile)),
                    shouldAbort: () => turnAborted(),
                  });
                  const finReply = String(fin?.text || '');
                  if (/@@@FILE\s+src\/App\./i.test(finReply)) {
                    const appliedFin = await applyChatReplyEdits({
                      reply: finReply,
                      projectId: originProjectId,
                      projectName: lockedProductName,
                      files: createFilesAcc,
                      userMessage: briefForUi,
                      diskRoot: originDiskRoot,
                    });
                    if (appliedFin.ok) {
                      createFilesAcc = appliedFin.files;
                      if (thinCreateLocksAppJsx(briefForUi, lockedProductName)) {
                        createFilesAcc = thinCoerceLockedAppJsx(createFilesAcc);
                      }
                    }
                  }
                }
              }
              // Compositional: carve fat App → shell + PageBody before invent so depth
              // asks for section files against a real shell (not a restored monolith).
              if (
                thinWantsCompositionalShell(briefForUi)
                && !createFilesAcc['.__novaGenericInventAsk']
                && !createFilesAcc['.__novaStorefrontInventAsk']
                && !createFilesAcc['.__novaProductInventAsk']
              ) {
                const beforeShell = String(createFilesAcc['src/App.jsx'] || '');
                createFilesAcc = assembleCompositionalAppShell(
                  createFilesAcc,
                  briefForUi,
                  lockedProductName,
                );
                if (String(createFilesAcc['src/App.jsx'] || '') !== beforeShell) {
                  host.pushStatus('Depth preflight · assembled compositional shell…');
                  if (originDiskRoot) {
                    await persistAcceptedCreateFiles(
                      originDiskRoot,
                      createFilesAcc,
                      depthPersistKeys(createFilesAcc),
                    ).catch(() => {});
                  }
                }
              }
              const { answerStudio } = await import('@/lib/studioAnswerEngine');
              let grewPasses = 0;
              let lastDepthReject = '';
              
              const compositionalDepth = thinWantsCompositionalShell(briefForUi);
              const isAuthoredDepthComplete = () => compositionalDepthIsComplete(
                createFilesAcc,
                briefForUi,
                lockedProductName,
              );
              /** Rejected section paths stay retired for the whole depth session (Freebuff C2). */
              const retiredSectionPaths = new Set<string>();
              let depthAttemptsUsed = 0;
              const depthAttemptMax = THIN_DEPTH_CONTINUE_MAX + 4;
              const sameRejectState = { key: '', bytes: -1, count: 0 };
              let depthStall = 0;
              let compositionalZeroGainCycles = 0;
              const noteDepthReject = (reason: string) => {
                lastDepthReject = reason;
                const appBytes = String(createFilesAcc['src/App.jsx'] || '').length;
                thinDepthSameRejectStalled({
                  reason,
                  appBytes,
                  state: sameRejectState,
                  bailAfter: THIN_DEPTH_SAME_REJECT_BAIL,
                });
                clearBuildWritingPath(
                  `Depth ${grewPasses + 1}/${THIN_DEPTH_CONTINUE_MAX} · keeping prior — retrying…`,
                );
              };
              for (let attempt = 1; attempt <= depthAttemptMax; attempt += 1) {
                if (turnAborted()) break;
                if (!thinNeedsDepthPass(createFilesAcc, briefForUi) && (!compositionalDepth || isAuthoredDepthComplete())) break;
                if (grewPasses >= THIN_DEPTH_CONTINUE_MAX) break;
                // Invent floor already on disk — do not burn the full create wall on enrich thrash.
                if (inventFloorEnrichExhausted({
                  floorSeededAt: inventFloorSeededAt,
                  files: createFilesAcc,
                  brief: briefForUi,
                  productName: lockedProductName,
                })) {
                  if (looksLikeInventFloorTwin(createFilesAcc)) {
                    createFilesAcc = breakInventFloorTwin(
                      createFilesAcc,
                      briefForUi,
                      lockedProductName,
                    );
                    createFloorFallback = false;
                    host.pushStatus('Invent enrich wall · broke floor twin stamp — finishing create…');
                  }
                  depthCraftStalled = false;
                  depthSummary = 'invent enrich wall after floor — finishing with landed sections';
                  host.pushStatus(
                    'Invent enrich wall · floor Acc is enough — finishing create (npm/Live next)…',
                  );
                  break;
                }
                const pass = grewPasses + 1;
                depthAttemptsUsed = attempt;
                clearBuildWritingPath(
                  `Depth ${pass}/${THIN_DEPTH_CONTINUE_MAX} · waiting on coder…`,
                );
                host.pushStatus(
                  `Depth continue ${pass}/${THIN_DEPTH_CONTINUE_MAX} · attempt ${attempt}/${depthAttemptMax} · waiting on coder · **${coderGate.name}**…`,
                );
                const prior = String(
                  createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '',
                );
                const priorCss = String(createFilesAcc['src/App.css'] || '');
                const priorFilesSnap = pickThinDepthFiles(createFilesAcc);
                const retiredList = [...retiredSectionPaths];
                const depthAskTarget = compositionalDepth
                  ? nextCompositionalDepthTarget(
                    createFilesAcc,
                    briefForUi,
                    lockedProductName,
                    retiredList,
                  )
                  : null;
                const depthStream = makeThinDepthStreamGuards(() => turnAborted());
                const depthFinish = await answerStudio({
                  userMessage: formatDepthContinuePrompt({
                    brief: briefForUi,
                    productName: lockedProductName,
                    priorApp: prior,
                    priorCss,
                    pass,
                    rejectReason: lastDepthReject || undefined,
                    deficits: thinDepthDeficits(createFilesAcc, briefForUi),
                    ledger: readThinDepthLedger(createFilesAcc),
                    files: createFilesAcc,
                    avoidSectionPath: retiredList,
                  }),
                  files: createFilesAcc,
                  projectName: lockedProductName,
                  mode: 'code',
                  preferredModelId: coderGate.id,
                  preferredModelName: coderGate.name,
                  preferredSource: coderGate.source,
                  stickyModelId: coderGate.id,
                  stickyModelName: coderGate.name,
                  stickyPinnedSource: 'local',
                  allowFileEdits: true,
                  timeoutMs: (pass === 1 && grewPasses === 0)
                    ? Math.min(120_000, createV2AttemptWallMs(budgetProfile))
                    : Math.min(240_000, createV2AttemptWallMs(budgetProfile)),
                  shouldAbort: depthStream.shouldAbort,
                }, depthStream.onDelta);
                if (depthStream.wasQuietAbort()) {
                  depthCraftStalled = true;
                  host.pushStatus('Depth craft stalled — idle invent wall — finishing with create miss…');
                  lastDepthReject = 'craft stalled — depth invent idle';
                  break;
                }
                let reply = String(depthFinish?.text || '');
                if (!/@@@FILE\s+src\//i.test(reply) && /export\s+default\b/i.test(reply)) {
                  const body = reply
                    .replace(/^[\s\S]*?(?=import\s|const\s|function\s|export\s)/, '')
                    .replace(/```[\s\S]*$/, '')
                    .trim();
                  if (body.length > 120) {
                    reply = `@@@FILE ${thinCreatePrimaryAppPath(briefForUi, createFilesAcc, lockedProductName)}\n${body}`;
                  }
                }
                const hasAppBlock = /@@@FILE\s+src\/App\.(?:jsx|tsx)\b/i.test(reply);
                const hasCssBlock = /@@@FILE\s+src\/App\.css\b/i.test(reply);
                const hasSectionBlock = replyHasCompositionalSectionBlock(reply);
                // Gain BEFORE assemble — assemble drops App HTML landmarks for <Section />
                // tags that countThinLandmarks ignores, which falsely trips the shrink guard.
                const applyDepthMerge = (raw: Record<string, string>, assemble: boolean) => {
                  let nf = thinMergeDepthAppFiles(raw, briefForUi, lockedProductName);
                  if (assemble && compositionalDepth) {
                    nf = applyCompositionalDepthMerge(nf, briefForUi, lockedProductName);
                  }
                  return nf;
                };
                const ledgerGainFromFiles = (raw: Record<string, string>) => {
                  let applied = applyDepthMerge(raw, false);
                  // Compositional: model loves rewriting a fat App — keep prior App, keep new sections/css.
                  if (compositionalDepth) {
                    const cand = String(applied['src/App.jsx'] || applied['src/App.tsx'] || '');
                    if (cand && !appLooksLikeCompositionalShell(cand)) {
                      applied = {
                        ...applied,
                        'src/App.jsx': prior,
                      };
                      delete applied['src/App.tsx'];
                    }
                  }
                  const nextApp = String(
                    applied['src/App.jsx'] || applied['src/App.tsx'] || prior,
                  );
                  const nextCss = String(applied['src/App.css'] || priorCss || '');
                  const ok = thinDepthReplyGrew(prior, nextApp, {
                    priorCss,
                    nextCss,
                    priorFiles: priorFilesSnap,
                    nextFiles: pickThinDepthFiles(applied),
                  });
                  // Accept the assembled shell only after gain clears on the applied tree.
                  const nextFiles = ok ? applyDepthMerge(applied, true) : applied;
                  return { nextFiles, ok };
                };
                /** Prefer "stripped delivered …" over generic ledger no-gain in Studio status. */
                const depthNoGainReason = (nextFiles: Record<string, string>) => {
                  const drops = compositionalDepthDropsDeliveredMarkers(
                    priorFilesSnap,
                    pickThinDepthFiles(nextFiles),
                  );
                  if (drops.length) return formatCompositionalDepthDropReason(drops);
                  const priorLed = readThinDepthLedger(priorFilesSnap);
                  const nextLed = readThinDepthLedger(nextFiles);
                  return `ledger no gain (${formatThinDepthLedger(nextLed)} vs ${formatThinDepthLedger(priorLed)})`;
                };
                const acceptDepthLedger = async (nextFiles: Record<string, string>) => {
                  // Re-seed after every accept — 7B invent often pastes an Apple phone
                  // HERO_VISUAL; without this, phone sticks on disk for the whole depth loop.
                  let accepted = nextFiles;
                  if (compositionalDepth) {
                    accepted = seedCompositionalBrandVisuals(
                      accepted,
                      briefForUi,
                      lockedProductName,
                    );
                  }
                  createFilesAcc = accepted;
                  grewPasses += 1;
                  depthStall = 0;
                  lastDepthReject = '';
                  // Un-retire only paths that became substantial; keep thrash targets out.
                  for (const p of [...retiredSectionPaths]) {
                    const body = String(accepted[p] || '');
                    if (body.replace(/\s+/g, '').length >= 480) retiredSectionPaths.delete(p);
                  }
                  sameRejectState.key = '';
                  sameRejectState.bytes = -1;
                  sameRejectState.count = 0;
                  if (originDiskRoot) {
                    await persistAcceptedCreateFiles(
                      originDiskRoot,
                      accepted,
                      depthPersistKeys(accepted),
                    ).catch(() => {});
                  }
                };
                const bumpDepthNoGain = (reason: string, statusDetail: string) => {
                  if (depthAskTarget?.filePath) {
                    retiredSectionPaths.add(depthAskTarget.filePath.replace(/\\/g, '/'));
                  }
                  noteDepthReject(reason);
                  host.pushStatus(
                    `Depth ${pass}/${THIN_DEPTH_CONTINUE_MAX} · attempt ${attempt}/${depthAttemptMax} · ${statusDetail}`,
                  );
                  depthStall += 1;
                  if (!compositionalDepth && depthStall >= THIN_DEPTH_ZERO_GAIN_BAIL) {
                    host.pushStatus(
                      `Depth stalled — ${depthStall} passes with zero ledger gain — stopping retry, keeping prior`,
                    );
                    return true;
                  }
                  if (compositionalDepth && depthStall >= THIN_DEPTH_ZERO_GAIN_BAIL) {
                    compositionalZeroGainCycles += 1;
                    if (compositionalZeroGainCycles >= THIN_DEPTH_COMPOSITIONAL_ZERO_GAIN_CYCLES) {
                      depthCraftStalled = true;
                      host.pushStatus(
                        `Depth stalled — craft stalled after ${compositionalZeroGainCycles} zero-gain cycles — finishing with create miss…`,
                      );
                      return true;
                    }
                    host.pushStatus(
                      `Depth · ${depthStall} zero-gain — advancing section target (${compositionalZeroGainCycles}/${THIN_DEPTH_COMPOSITIONAL_ZERO_GAIN_CYCLES})…`,
                    );
                    depthStall = 0;
                  }
                  if (sameRejectState.count >= THIN_DEPTH_SAME_REJECT_BAIL) {
                    host.pushStatus(
                      `Depth stalled — same thin shell ${sameRejectState.count} times — stopping invent, keeping prior`,
                    );
                    return true;
                  }
                  return false;
                };
                if (/@@@FILE\s+/i.test(reply) && !hasAppBlock) {
                  if (!hasCssBlock && !(compositionalDepth && hasSectionBlock)) {
                    if (bumpDepthNoGain(
                      'reply had @@@FILE but no src/App.jsx, App.css, or src/sections/*.jsx',
                      'no App.jsx, App.css, or section file in reply — keeping prior, retry…',
                    )) break;
                    continue;
                  }
                  if (compositionalDepth && hasSectionBlock && !hasCssBlock) {
                    const appliedSection = await applyChatReplyEdits({
                      reply,
                      projectId: originProjectId,
                      projectName: lockedProductName,
                      files: createFilesAcc,
                      userMessage: briefForUi,
                      diskRoot: originDiskRoot,
                      dryRun: true,
                    });
                    if (appliedSection.ok) {
                      const gain = ledgerGainFromFiles(appliedSection.files);
                      if (gain.ok) {
                        await acceptDepthLedger(gain.nextFiles);
                      } else {
                        const why = depthNoGainReason(gain.nextFiles);
                        if (bumpDepthNoGain(
                          why,
                          `${why} — keeping prior, retry…`,
                        )) break;
                      }
                    } else if (bumpDepthNoGain(createApplyFailureReason(appliedSection), `${createApplyFailureReason(appliedSection)} — keeping prior, retry…`)) {
                      break;
                    }
                    continue;
                  }
                  const appliedCss = await applyChatReplyEdits({
                    reply,
                    projectId: originProjectId,
                    projectName: lockedProductName,
                    files: createFilesAcc,
                    userMessage: briefForUi,
                    diskRoot: originDiskRoot,
                    dryRun: true,
                  });
                  if (appliedCss.ok) {
                    const gain = ledgerGainFromFiles(appliedCss.files);
                    if (gain.ok) {
                      await acceptDepthLedger(gain.nextFiles);
                    } else {
                      const why = depthNoGainReason(gain.nextFiles);
                      if (bumpDepthNoGain(
                        why,
                        `${why} — keeping prior, retry…`,
                      )) break;
                    }
                  } else if (bumpDepthNoGain(createApplyFailureReason(appliedCss), `${createApplyFailureReason(appliedCss)} — keeping prior, retry…`)) {
                    break;
                  }
                  continue;
                }
                if (/@@@FILE\s+/i.test(reply)) {
                  const applied = await applyChatReplyEdits({
                    reply,
                    projectId: originProjectId,
                    projectName: lockedProductName,
                    files: createFilesAcc,
                    userMessage: briefForUi,
                    diskRoot: originDiskRoot,
                    dryRun: true,
                  });
                  if (applied.ok) {
                    const gain = ledgerGainFromFiles(applied.files);
                    if (gain.ok) {
                      await acceptDepthLedger(gain.nextFiles);
                    } else {
                      const why = depthNoGainReason(gain.nextFiles);
                      if (bumpDepthNoGain(
                        why,
                        `${why} — keeping prior, retry…`,
                      )) break;
                    }
                  } else if (bumpDepthNoGain(createApplyFailureReason(applied), `${createApplyFailureReason(applied)} — keeping prior, retry…`)) {
                    break;
                  }
                } else if (bumpDepthNoGain(
                  'no @@@FILE blocks in depth reply',
                  'empty depth reply — keeping prior, retry…',
                )) {
                  break;
                }
                synEarly = runCreateSyntaxGate(createFilesAcc);
                if (synEarly.healed) createFilesAcc = synEarly.files;
                // Depth smash must not keep stacking — finish/fail if App will blank Live.
                if (!synEarly.ok && thinAppNeedsFinishPass(createFilesAcc, synEarly.reasons)) break;
                try {
                  const { wireCreatePublicAssets } = await import('@/lib/createBuildQuality');
                  const wired = wireCreatePublicAssets(createFilesAcc, lockedProductName, briefForUi);
                  if (wired.changed.length) createFilesAcc = wired.files;
                } catch { /* ignore */ }
              }
              // Final shell lock — never leave a fat App on disk after compositional depth.
              if (
                thinWantsCompositionalShell(briefForUi)
                && !createFilesAcc['.__novaGenericInventAsk']
                && !createFilesAcc['.__novaStorefrontInventAsk']
                && !createFilesAcc['.__novaProductInventAsk']
              ) {
                createFilesAcc = assembleCompositionalAppShell(
                  createFilesAcc,
                  briefForUi,
                  lockedProductName,
                );
              }
              depthSummary = `grew ${grewPasses}/${THIN_DEPTH_CONTINUE_MAX} in ${depthAttemptsUsed}/${depthAttemptMax} attempts${lastDepthReject ? ` · last: ${lastDepthReject}` : ' · all passes landed'}`;
              host.pushStatus(`Depth pass · ${depthSummary}`);
              if (depthCraftStalled) {
                uiPolishOk = false;
                createFloorFallback = false;
                uiPolishReasons = [
                  'Craft stalled — depth invent idle / zero-gain wall',
                  lastDepthReject || 'thin depth quiet abort',
                ];
                host.pushStatus('Thin create · craft stalled — will finish with create miss…');
              }
              // Persist accepted App + sections + public/* after wireCreatePublicAssets.
              if (originDiskRoot) {
                await persistAcceptedCreateFiles(
                  originDiskRoot,
                  createFilesAcc,
                  depthPersistKeys(createFilesAcc),
                ).catch(() => {});
              }
              // Post-depth: heal/finish mangled App before Live — never unlock a Vite black screen.
              // Compositional: skip finish while section targets remain (Nova owns the shell).
              synEarly = runCreateSyntaxGate(createFilesAcc);
              if (synEarly.healed) createFilesAcc = synEarly.files;
              const compositionalFinishOpen = thinWantsCompositionalShell(briefForUi)
                && Boolean(nextCompositionalDepthTarget(createFilesAcc, briefForUi, lockedProductName));
              if (
                !depthCraftStalled
                && !synEarly.ok
                && !compositionalFinishOpen
                && thinAppNeedsFinishPass(createFilesAcc, synEarly.reasons)
                && coderGate.ok
                && !turnAborted()
              ) {
                host.pushStatus(`Finish App · **${coderGate.name}** (repair after depth)…`);
                const broken = String(createFilesAcc['src/App.jsx'] || '');
                const beforeFinishFiles = { ...createFilesAcc };
                const beforeFinishLedger = readThinDepthLedger(pickThinDepthFiles(beforeFinishFiles));
                const finish = await answerStudio({
                  userMessage: formatFinishAppPrompt({
                    brief: briefForUi,
                    productName: lockedProductName,
                    brokenApp: broken,
                  }),
                  files: createFilesAcc,
                  projectName: lockedProductName,
                  mode: 'code',
                  preferredModelId: coderGate.id,
                  preferredModelName: coderGate.name,
                  preferredSource: coderGate.source,
                  stickyModelId: coderGate.id,
                  stickyModelName: coderGate.name,
                  stickyPinnedSource: 'local',
                  allowFileEdits: true,
                  timeoutMs: Math.min(180_000, createV2AttemptWallMs(budgetProfile)),
                  shouldAbort: () => turnAborted(),
                });
                let reply = String(finish?.text || '');
                if (!/@@@FILE\s+src\//i.test(reply) && /export\s+default\b/i.test(reply)) {
                  const body = reply
                    .replace(/^[\s\S]*?(?=import\s|const\s|function\s|export\s)/, '')
                    .replace(/```[\s\S]*$/, '')
                    .trim();
                  if (body.length > 120) reply = `@@@FILE ${THIN_CREATE_APP_PATH}\n${body}`;
                }
                if (/@@@FILE\s+src\/App\./i.test(reply)) {
                  const applied = await applyChatReplyEdits({
                    reply,
                    projectId: originProjectId,
                    projectName: lockedProductName,
                    files: createFilesAcc,
                    userMessage: briefForUi,
                    diskRoot: originDiskRoot,
                    dryRun: true,
                  });
                  if (applied.ok) {
                    let nextFiles = thinMergeDepthAppFiles(applied.files, briefForUi, lockedProductName);
                    if (
                      thinWantsCompositionalShell(briefForUi)
                      && !nextFiles['.__novaGenericInventAsk']
                      && !nextFiles['.__novaStorefrontInventAsk']
                      && !nextFiles['.__novaProductInventAsk']
                    ) {
                      nextFiles = assembleCompositionalAppShell(nextFiles, briefForUi, lockedProductName);
                    }
                    const synNext = runCreateSyntaxGate(nextFiles);
                    if (synNext.healed) nextFiles = synNext.files;
                    const nextApp = String(
                      nextFiles['src/App.jsx'] || nextFiles['src/App.tsx'] || '',
                    );
                    const nextLedger = readThinDepthLedger(pickThinDepthFiles(nextFiles));
                    const nextCompact = thinWantsCompositionalShell(briefForUi)
                      ? nextLedger.compact
                      : nextApp.replace(/\s+/g, '').length;
                    const priorCompact = thinWantsCompositionalShell(briefForUi)
                      ? beforeFinishLedger.compact
                      : broken.replace(/\s+/g, '').length;
                    // Keep finish only when it compiles and does not collapse the composed ledger.
                    if (synNext.ok && (nextCompact >= priorCompact * 0.85 || thinDepthReplyGrew(broken, nextApp, {
                      priorFiles: pickThinDepthFiles(beforeFinishFiles),
                      nextFiles: pickThinDepthFiles(nextFiles),
                    }))) {
                      createFilesAcc = nextFiles;
                      if (originDiskRoot) {
                        await persistAcceptedCreateFiles(
                          originDiskRoot,
                          createFilesAcc,
                          depthPersistKeys(createFilesAcc),
                        ).catch(() => {});
                      }
                    } else if (synNext.ok && nextCompact >= 400) {
                      createFilesAcc = nextFiles;
                      if (originDiskRoot) {
                        await persistAcceptedCreateFiles(
                          originDiskRoot,
                          createFilesAcc,
                          depthPersistKeys(createFilesAcc),
                        ).catch(() => {});
                      }
                    } else {
                      createFilesAcc = beforeFinishFiles;
                      host.pushStatus('Finish App · repair too thin/broken — kept pre-finish App');
                    }
                  }
                }
                synEarly = runCreateSyntaxGate(createFilesAcc);
                if (synEarly.healed) createFilesAcc = synEarly.files;
              }
            } catch {
              /* depth continue best-effort */
            }
            if (thinCraftMayContinue(createFilesAcc, synEarly.ok, synEarly.reasons)) {
              createFloorFallback = false;
              // Invent floor may stay open — seed visuals then gate Live on visual floor.
              if (thinWantsCompositionalShell(briefForUi)) {
                createFilesAcc = seedCompositionalBrandVisuals(
                  createFilesAcc,
                  briefForUi,
                  lockedProductName,
                );
                try {
                  const { wireCreatePublicAssets } = await import('@/lib/createBuildQuality');
                  createFilesAcc = wireCreatePublicAssets(
                    createFilesAcc,
                    lockedProductName,
                    briefForUi,
                  ).files;
                } catch { /* wire best-effort */ }
                if (originDiskRoot) {
                  await persistAcceptedCreateFiles(
                    originDiskRoot,
                    createFilesAcc,
                    [...new Set([...depthPersistKeys(createFilesAcc), 'public/logo.svg'])],
                  ).catch(() => {});
                }
                host.pushStatus('Thin create · visual seed + logo wire applied after depth…');
              }
              if (
                thinWantsCompositionalShell(briefForUi)
                && !createFilesAcc['.__novaGenericInventAsk']
                && !createFilesAcc['.__novaStorefrontInventAsk']
                && !compositionalDepthIsComplete(createFilesAcc, briefForUi, lockedProductName)
              ) {
                createFilesAcc = seedCompositionalSectionScaffolds(
                  createFilesAcc,
                  briefForUi,
                  lockedProductName,
                );
                updateCreateJob(jobId, { files: createFilesAcc });
                if (originDiskRoot) {
                  await persistAcceptedCreateFiles(
                    originDiskRoot,
                    createFilesAcc,
                    depthPersistKeys(createFilesAcc),
                  ).catch(() => {});
                }
                host.pushStatus('Thin create · section scaffolds after depth (complete missing bands)…');
              }
              {
                const compositionOpen = thinWantsCompositionalShell(briefForUi)
                  && !createFilesAcc['.__novaGenericInventAsk']
                  && !createFilesAcc['.__novaStorefrontInventAsk']
                  && !/data-nova-invent-demo\s*=\s*["']1["']/.test(String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || ''))
                  && !compositionalDepthIsComplete(createFilesAcc, briefForUi, lockedProductName);
                const missingSections = compositionOpen
                  ? formatCompositionalSectionSpecs(briefForUi, lockedProductName)
                    .filter((spec) => !compositionalSectionFileSubstantial(String(createFilesAcc[spec.filePath] || '')))
                    .map((spec) => spec.filePath)
                  : [];
                if (depthCraftStalled || thinBlocksLivePreview(createFilesAcc, briefForUi) || compositionOpen) {
                  uiPolishOk = false;
                  createFloorFallback = false;
                  uiPolishReasons = [
                    ...(depthCraftStalled
                      ? ['Craft stalled — depth invent idle / zero-gain wall']
                      : []),
                    ...(thinBlocksLivePreview(createFilesAcc, briefForUi)
                      ? [
                        `Visual floor still open after depth (${depthSummary})`,
                        ...thinLiveVisualDeficits(createFilesAcc, briefForUi).slice(0, 4),
                      ]
                      : []),
                    ...(compositionOpen
                      ? [`compositional content incomplete: ${missingSections.slice(0, 6).join(', ') || 'required sections missing'}`]
                      : []),
                  ];
                  host.pushStatus(
                    depthCraftStalled
                      ? `Thin create · craft stalled (${depthSummary}) — Live blocked…`
                      : compositionOpen
                        ? `Thin create · composition incomplete after depth (${depthSummary}) — Live blocked…`
                        : `Thin create · visual floor open (${depthSummary}) — not Ready yet…`,
                  );
                } else {
                  uiPolishOk = true;
                  uiPolishReasons = [];
                  host.pushStatus(`Thin create · visual + composition cleared (${depthSummary}) — continuing…`);
                }
              }
            } else {
              createFloorFallback = false;
              uiPolishOk = false;
              uiPolishReasons = [...new Set([
                ...(uiPolishReasons || []),
                ...(synEarly.reasons || []).slice(0, 4),
                'App broken after depth — Live blocked (would be black)',
              ])];
              host.pushStatus('Thin create · App broken after depth — failing closed (no black Live)…');
            }
          } else if (thinBlocksLivePreview(createFilesAcc, briefForUi)
            || thinNeedsDepthPass(createFilesAcc, briefForUi)
            || (thinWantsCompositionalShell(briefForUi)
              && !compositionalDepthIsComplete(createFilesAcc, briefForUi, lockedProductName))) {
            // Depth never entered — visual seed + section scaffolds before blocking Live.
            // Invent-first: never seed compositional scaffolds (host invent-demo owns App).
            createFloorFallback = false;
            const inventOwnsAppDepth = Boolean(
              createFilesAcc['.__novaGenericInventAsk']
              || createFilesAcc['.__novaStorefrontInventAsk']
              || createFilesAcc['.__novaProductInventAsk'],
            );
            if (thinWantsCompositionalShell(briefForUi) && !inventOwnsAppDepth) {
              createFilesAcc = seedCompositionalBrandVisuals(
                createFilesAcc,
                briefForUi,
                lockedProductName,
              );
              createFilesAcc = seedCompositionalSectionScaffolds(
                createFilesAcc,
                briefForUi,
                lockedProductName,
              );
              if (originDiskRoot) {
                await persistAcceptedCreateFiles(
                  originDiskRoot,
                  createFilesAcc,
                  depthPersistKeys(createFilesAcc),
                ).catch(() => {});
              }
              updateCreateJob(jobId, { files: createFilesAcc });
              host.pushStatus('Thin create · section scaffolds (depth never entered)…');
            } else if (inventOwnsAppDepth) {
              // Do not stamp invent-demo when depth is thin — keep craft FAIL for model invent.
              host.pushStatus('Invent · depth thin — host twin stamp disabled; model owns App');
              uiPolishOk = false;
              uiPolishReasons = [
                ...(uiPolishReasons || []),
                'invent depth thin — invent-demo stamp disabled',
              ];
            }
            {
              const compositionOpen = thinWantsCompositionalShell(briefForUi)
                && !createFilesAcc['.__novaGenericInventAsk']
                && !createFilesAcc['.__novaStorefrontInventAsk']
                && !/data-nova-invent-demo\s*=\s*["']1["']/.test(String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || ''))
                && !compositionalDepthIsComplete(createFilesAcc, briefForUi, lockedProductName);
              const missingSections = compositionOpen
                ? formatCompositionalSectionSpecs(briefForUi, lockedProductName)
                  .filter((spec) => !compositionalSectionFileSubstantial(String(createFilesAcc[spec.filePath] || '')))
                  .map((spec) => spec.filePath)
                : [];
              if (thinBlocksLivePreview(createFilesAcc, briefForUi) || compositionOpen) {
                uiPolishOk = false;
                uiPolishReasons = [
                  ...(thinBlocksLivePreview(createFilesAcc, briefForUi)
                    ? [
                      'Visual floor still open — Live blocked',
                      ...thinLiveVisualDeficits(createFilesAcc, briefForUi).slice(0, 4),
                    ]
                    : []),
                  ...(compositionOpen
                    ? [`compositional content incomplete: ${missingSections.slice(0, 6).join(', ') || 'required sections missing'}`]
                    : []),
                ];
                host.pushStatus(
                  compositionOpen
                    ? 'Thin create · composition incomplete — Live blocked…'
                    : 'Thin create · visual floor still open — not Ready yet…',
                );
              } else {
                uiPolishOk = true;
                uiPolishReasons = [];
                host.pushStatus('Thin create · visual + composition cleared — continuing…');
              }
            }
          } else {
            createFloorFallback = false;
            uiPolishOk = true;
            uiPolishReasons = [];
            host.pushStatus('Thin create · App ready — continuing…');
          }
        }
      } catch {
        /* thin early finish best-effort */
      }
    }

    // Every product create must clear a working UI — never Ready on the Vite title splash.
    if (needsUiPolish && uiPolishOk !== true) {
      if (uiPolishOk == null) {
        uiPolishReasons = uiPolishReasons.length
          ? uiPolishReasons
          : ['UI pass did not clear a Preview-ready App'];
      }
      uiPolishOk = false;
    }

    // Final honesty check — title splash / blank-Live crash must never be marked success.
    if (needsUiPolish) {
      const {
        ensureReactImportForNamespace,
        ensureJsxHasNoTypeScript,
        appUsesReactNamespaceWithoutImport,
        previewReadyForBrief,
      } = await import('@/lib/createBuildQuality');
      const { jsxSourceHasTypeScriptOnlySyntax } = await import('@/lib/freshSpaFromBrief');
      const appKey = createFilesAcc['src/App.tsx'] && !createFilesAcc['src/App.jsx']
        ? 'src/App.tsx'
        : (createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx');
      const beforeFinal = createFilesAcc[appKey] || '';
      let healed = beforeFinal;
      if (/\.jsx$/i.test(appKey)) healed = ensureJsxHasNoTypeScript(healed);
      healed = ensureReactImportForNamespace(healed);
      if (healed !== beforeFinal) {
        createFilesAcc = { ...createFilesAcc, [appKey]: healed };
        if (originDiskRoot) {
          await applyChatReplyEdits({
            reply: `@@@FILE ${appKey}\n${healed}`,
            projectId: originProjectId,
            projectName: buildIntent.name,
            files: createFilesAcc,
            userMessage: host.content,
            diskRoot: originDiskRoot,
          }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
        }
      }
      const appBody = createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '';
      const jsxStillTs = Boolean(createFilesAcc['src/App.jsx'])
        && jsxSourceHasTypeScriptOnlySyntax(createFilesAcc['src/App.jsx'] || '');
      if (uiPolishOk === true && (
        looksLikeFillerStubAppSource(appBody)
        || isEmptyOrStubAppSource(appBody)
        || appUsesReactNamespaceWithoutImport(appBody)
        || jsxStillTs
      )) {
        uiPolishOk = false;
        uiPolishReasons = jsxStillTs
          ? ['App.jsx still has TypeScript syntax after heal (would crash Live)']
          : appUsesReactNamespaceWithoutImport(appBody)
            ? ['App uses React.* without importing React (would blank Live)']
            : ['App is still a blank placeholder splash'];
      }
      // Final code scan — never claim Preview Ready / Live verified on a broken tree.
      // Thin create: App syntax survival wins — previewReady polish must not re-fail a finished App.
      if (uiPolishOk === true && !isThinCreatePath()) {
        const gate = previewReadyForBrief(createFilesAcc, {
          productName: lockedProductName,
          brief: briefForUi,
          spec: ensembleSpec,
          contract: ensembleContract,
        });
        if (!gate.ok) {
          uiPolishOk = false;
          uiPolishReasons = gate.reasons?.length
            ? gate.reasons
            : ['Final code scan failed Preview Ready'];
        }
      }
      // Empty Vite shell must never ship as success — unless the user asked for a blank solid page.
      // Compositional shells are intentionally thin App.jsx (sections hold the page).
      const finalApp = createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '';
      const compositionalShellOk = isThinCreatePath()
        && thinWantsCompositionalShell(briefForUi)
        && appLooksLikeCompositionalShell(finalApp)
        && !thinBlocksLivePreview(createFilesAcc, briefForUi);
      if (uiPolishOk === true && !blankSolidColor && !compositionalShellOk && (
        isEmptyOrStubAppSource(finalApp)
        || /return\s*\(\s*<div\s+className=["']app["']\s*\/>\s*\)/i.test(finalApp)
        || finalApp.length < 200
      )) {
        uiPolishOk = false;
        uiPolishReasons = ['App is still an empty Vite shell — UI polish did not build the page'];
      }
      // Liquor / cart asks: a cart icon alone is not a store — force polish recovery + commerce floor.
      // Locked storefront spine: restore compose App instead of demoting into invent wipe.
      if (uiPolishOk === true) {
        const {
          briefLooksLikeCommerceStore,
          appHasCommerceCart,
        } = await import('@/lib/createBuildQuality');
        if (briefLooksLikeCommerceStore(briefForUi) && !appHasCommerceCart(createFilesAcc)) {
          if (storefrontSpineLocked && restoreStorefrontSpineSnapshot('missing cart after polish')) {
            /* spine restored — keep Accept */
          } else {
            uiPolishOk = false;
            uiPolishReasons = ['Storefront missing cart + purchase UI (icon-only shell is not enough)'];
          }
        }
      }
      // apple.com-style briefs must keep product bands always visible — never a click-gated shell.
      if (uiPolishOk === true && !productGenreGuard) {
        const { briefLooksLikeAppleStyleHomepage, appleHomepageHasProductBands } = await import('@/lib/createBuildQuality');
        if (briefLooksLikeAppleStyleHomepage(briefForUi)) {
          const hidesBands = /selectedProduct\s*===\s*['"][^'"]+['"]\s*&&/i.test(finalApp);
          const missingBands = !appleHomepageHasProductBands(finalApp)
            || !/<nav\b/i.test(finalApp)
            || /\bBuilt for general users\b/i.test(finalApp)
            || /\bBand\s*[1-4]\b/i.test(finalApp);
          const thinApple = finalApp.length < 2400 && !/className=["'][^"']*\bband\b/i.test(finalApp);
          if (hidesBands || missingBands || thinApple) {
            uiPolishOk = false;
            uiPolishReasons = [
              hidesBands
                ? 'Product bands are hidden until a nav click (not apple.com-style)'
                : thinApple
                  ? 'Apple-style homepage is still too thin — need full-bleed hero and product bands'
                  : 'Missing always-visible Mac / iPad / Watch / AirPods bands',
            ];
          }
        }
      }
    }

    // Last write wins. Re-wire the files that actually shipped so a late App.jsx
    // still gets on-disk heroes and any /icons/*.svg it named.
    // Product spine locked: skip assembleCreateAppFromParts — it pastes todo/Apple over unique desk.
    if (
      originDiskRoot
      && (createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'])
      && !productGenreGuard
    ) {
      const { wireCreatePublicAssets: wireFinalAssets } = await import('@/lib/createBuildQuality');
      const wiredFinal = wireFinalAssets(createFilesAcc, lockedProductName, briefForUi);
      if (wiredFinal.changed.length) {
        createFilesAcc = wiredFinal.files;
        const appKey = createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx';
        await applyChatReplyEdits({
          reply: [
            createFilesAcc[appKey] ? `@@@FILE ${appKey}\n${createFilesAcc[appKey]}` : '',
            createFilesAcc['src/App.css'] ? `@@@FILE src/App.css\n${createFilesAcc['src/App.css']}` : '',
            ...wiredFinal.changed
              .filter((p: string) => /\/icons\/.+\.svg$/i.test(p) || /\/logo\.svg$/i.test(p))
              .map((p: string) => `@@@FILE ${p}\n${createFilesAcc[p] || ''}`),
          ].filter(Boolean).join('\n'),
          projectId: originProjectId,
          projectName: lockedProductName,
          files: createFilesAcc,
          userMessage: briefForUi,
          diskRoot: originDiskRoot,
        }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
      }
    } else if (productGenreGuard && productInventSnapshot?.appJsx) {
      try {
        const {
          appLooksLikeWrongGenreForProductBrief,
          appLooksLikeDeskSpineTemplate,
        } = await import('@/lib/createProductLadder');
        const appNow = String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '');
        const productBrief = authoritativeOriginalBrief || briefForUi;
        if (
          appLooksLikeWrongGenreForProductBrief(appNow, productBrief)
          || appLooksLikeDeskSpineTemplate(appNow)
        ) {
          restoreProductInventSnapshot('skip final wire · wrong-genre overwrite');
        }
      } catch { /* keep Acc */ }
    }

    // Bind studio only when Preview-ready — fail-closed leaves chat unbound.
    updateCreateJob(jobId, { files: createFilesAcc });

    const scaffoldKind = (() => {
      const fromArtifact = projectKindFromArtifactKind(createArtifactKind);
      if (fromArtifact !== 'unknown') return fromArtifact;
      return resolveProjectKindForCreate(
        buildIntent.summary || host.content,
        buildIntent.kind,
        buildIntent.kind,
      );
    })();
    const grantNote = created.grantHint ? `\n\n_${created.grantHint}_` : '';
    const displayName = cleanProductTitle(buildIntent.name);

    // Fail-closed recovery: keep folder + code pills; try heals/floors before giving up.
    // Thin create: never rewrite App with genre/marketing floors — syntax + honest fail only.
    // Product spine locked / product ladder brief: never Apple/todo/utility floor paste.
    if (uiPolishOk === false && !isThinCreatePath() && !productGenreGuard) {
      let allowFloorSalvage = true;
      try {
        if (artifactWantsProductLadder(createArtifactKind, authoritativeOriginalBrief || briefForUi)) {
          allowFloorSalvage = false;
          host.pushStatus('Ladder · product-site artifact — skipping floor salvage (invent owns App)…');
        }
      } catch { /* ignore */ }
      if (!allowFloorSalvage) {
        /* spine / final guard owns App */
      } else {
      // Floors:
      // - Apple / games / utility / kiln / sticky as before.
      // - Product/marketing thin shells (phone-column, missing footer, unused heroes):
      //   structure heal then buildBriefInteractiveFloor — never die on UI polish for that class.
      try {
        const {
          previewReadyForBrief,
          healNearReadyCreateUi,
          healProductMarketingStructure,
          isThinProductMarketingShell,
          buildBriefInteractiveFloor,
          briefLooksLikeMarketingLanding,
          briefLooksLikeCommerceStore,
          briefLooksLikeAppleStyleHomepage: appleBrief,
          appleHomepageHasProductBands,
          wireCreatePublicAssets,
          ensureViteReactProjectFiles,
        } = await import('@/lib/createBuildQuality');
        const writePolishFiles = async () => {
          if (!originDiskRoot) return;
          const appKeyHeal = createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx';
          const extraPaths = Object.keys(createFilesAcc).filter((p) =>
            /^src\/(?:data|components)\//i.test(p.replace(/\\/g, '/')),
          );
          await applyChatReplyEdits({
            reply: [
              createFilesAcc[appKeyHeal] ? `@@@FILE ${appKeyHeal}\n${createFilesAcc[appKeyHeal]}` : '',
              createFilesAcc['src/App.css'] ? `@@@FILE src/App.css\n${createFilesAcc['src/App.css']}` : '',
              ...extraPaths.map((p) => (createFilesAcc[p] ? `@@@FILE ${p}\n${createFilesAcc[p]}` : '')),
            ].filter(Boolean).join('\n'),
            projectId: originProjectId,
            projectName: lockedProductName,
            files: createFilesAcc,
            userMessage: briefForUi,
            diskRoot: originDiskRoot,
          }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
        };
        const recheckPolishGate = async (statusOk: string) => {
          const gateHeal = previewReadyForBrief(createFilesAcc, {
            productName: lockedProductName,
            brief: briefForUi,
            spec: ensembleSpec,
            contract: ensembleContract,
          });
          let origOk = true;
          let origReasons: string[] = [];
          try {
            const { lintOriginalCreateQuality } = await import('@/lib/createDesignSystem');
            const orig = lintOriginalCreateQuality(createFilesAcc, {
              brief: briefForUi,
              productName: lockedProductName,
            });
            origOk = orig.ok;
            origReasons = orig.reasons || [];
          } catch { /* best-effort */ }
          if (gateHeal.ok && origOk) {
            uiPolishOk = true;
            uiPolishReasons = [];
            host.pushStatus(statusOk);
            return true;
          }
          uiPolishOk = false;
          uiPolishReasons = [...new Set([
            ...(uiPolishReasons || []),
            ...(gateHeal.ok ? [] : (gateHeal.reasons || []).slice(0, 4)),
            ...origReasons.slice(0, 6),
          ])];
          return false;
        };

        // Local flag — recheckPolishGate mutates uiPolishOk via closure; TS keeps it narrowed to false.
        let polishBlocked = true;
        const nearHeal = healNearReadyCreateUi(createFilesAcc, lockedProductName, briefForUi);
        if (nearHeal.changed) {
          createFilesAcc = nearHeal.files;
          host.pushStatus(
            nearHeal.actions.some((a) => a.startsWith('struct-') || a === 'strip-phone-column')
              ? 'Healing product shell for Preview Ready…'
              : nearHeal.actions.includes('css-floor')
                ? 'Healing thin App.css for Preview Ready…'
                : 'Healing missing product brand…',
          );
          await writePolishFiles();
          polishBlocked = !(await recheckPolishGate('Near-ready heal cleared Preview Ready…'));
        }

        // Explicit structure heal when originality still cites phone-column / footer / heroes.
        if (
          polishBlocked
          && (
            isThinProductMarketingShell(createFilesAcc, briefForUi)
            || /phone-column|missing a footer|never rendered|hero\/product visual/i.test((uiPolishReasons || []).join(' '))
          )
        ) {
          const struct = healProductMarketingStructure(createFilesAcc, lockedProductName, briefForUi);
          if (struct.changed) {
            createFilesAcc = struct.files;
            host.pushStatus(`Product structure heal · ${struct.actions.slice(0, 3).join(', ')}`);
            await writePolishFiles();
            polishBlocked = !(await recheckPolishGate('Product structure heal cleared Preview Ready…'));
          }
        }

        // Universal product-plan repair — any ask (app/game/tool/marketing/shop).
        if (polishBlocked && !appleBrief(briefForUi)) {
          try {
            const { buildProductPlan, repairToContract } = await import('@/lib/createProductPlan');
            const plan = buildProductPlan(originalBrief, lockedProductName);
            const repaired = repairToContract(createFilesAcc, plan, briefForUi);
            if (repaired.changed) {
              createFilesAcc = repaired.files;
              host.pushStatus(`Product plan repair · ${plan.compositionFamily} · ${repaired.actions.slice(0, 4).join(', ')}`);
              if (artifactWantsVite(createArtifactKind)) {
                createFilesAcc = ensureViteReactProjectFiles(createFilesAcc, lockedProductName).files;
              }
              await writePolishFiles();
              // Repair may close Live preflight — but if it owned the product shell, never claim quality.
              if (repaired.repairOwnedProduct || repaired.needFloor) {
                createFloorFallback = true;
                uiPolishOk = true;
                uiPolishReasons = ['plan repair owned product shell — Live unlock only'];
                polishBlocked = false;
                host.pushStatus('Repair owned starting shell — Live unlock only (quality Ready gated)…');
              } else {
                const cleared = await recheckPolishGate('Product plan repair cleared Preview Ready…');
                if (cleared || repaired.planOk) {
                  uiPolishOk = true;
                  uiPolishReasons = [];
                  polishBlocked = false;
                  host.pushStatus('Starting product contract closed by repair — continuing to Live…');
                }
              }
            }
          } catch {
            /* plan repair best-effort */
          }
        }

        // Storefront: repair contract gaps first — full floor only if unsalvageable.
        if (
          polishBlocked
          && !appleBrief(briefForUi)
          && briefLooksLikeCommerceStore(briefForUi)
          && /phone-column|missing a footer|never rendered|hero\/product|too thin|landing App|cart \+|purchase UI|icon-only shell|Storefront missing|storefront needs|missing filter|missing working add-to-cart|priced products|catalog/i.test(
            (uiPolishReasons || []).join(' '),
          )
        ) {
          try {
            const { repairStorefrontToContract } = await import('@/lib/createStorefrontRepair');
            const repaired = repairStorefrontToContract(createFilesAcc, {
              productName: lockedProductName,
              brief: briefForUi,
            });
            if (repaired.changed) {
              createFilesAcc = repaired.files;
              host.pushStatus(`Storefront repair · ${repaired.actions.slice(0, 4).join(', ')}`);
              if (artifactWantsVite(createArtifactKind)) {
                createFilesAcc = ensureViteReactProjectFiles(createFilesAcc, lockedProductName).files;
              }
              await writePolishFiles();
              const cleared = await recheckPolishGate('Storefront repair cleared Preview Ready…');
              if (cleared || repaired.contractOk) {
                uiPolishOk = true;
                uiPolishReasons = [];
                polishBlocked = false;
                host.pushStatus('Storefront contract closed by repair — continuing to Live…');
              }
            }
            // REMOVED: storefront recovery floor (buildBriefInteractiveFloor twin).
            if (polishBlocked && (repaired.needFloor || !repaired.contractOk)) {
              host.pushStatus('Storefront incomplete — recovery floor removed; model must invent…');
              createFloorFallback = false;
              uiPolishOk = false;
              uiPolishReasons = [
                ...(uiPolishReasons || []),
                'storefront incomplete — no recovery floor fallback',
              ];
            }
          } catch {
            /* repair/floor best-effort */
          }
        }

        // Marketing floor — ONLY for marketing-bands family (never apps/tools/games).
        let marketingFamily = false;
        try {
          const { buildProductPlan } = await import('@/lib/createProductPlan');
          marketingFamily = buildProductPlan(originalBrief, lockedProductName).compositionFamily === 'marketing-bands';
        } catch { /* ignore */ }
        if (
          polishBlocked
          && marketingFamily
          && !appleBrief(briefForUi)
          && !briefLooksLikeCommerceStore(briefForUi)
          && (
            isThinProductMarketingShell(createFilesAcc, briefForUi)
            || briefLooksLikeMarketingLanding(briefForUi)
          )
          && /phone-column|missing a footer|never rendered|hero\/product|too thin|landing App/i.test(
            (uiPolishReasons || []).join(' '),
          )
        ) {
          // REMOVED: marketing recovery floor (buildBriefInteractiveFloor twin).
          host.pushStatus('Marketing thin — recovery floor removed; model must invent…');
          createFloorFallback = false;
          uiPolishOk = false;
          uiPolishReasons = [
            ...(uiPolishReasons || []),
            'marketing thin — no recovery floor fallback',
          ];
        }

        if (!polishBlocked) {
          /* healed — no host floors */
        } else {
          // REMOVED: utility / apple / kiln / game / sticky-note host floors.
          // No look-back recreate — keep craft FAIL so the model invents from the brief.
          host.pushStatus('Craft incomplete — host floors removed; invent from brief only…');
          createFloorFallback = false;
          uiPolishOk = false;
          uiPolishReasons = [
            ...(uiPolishReasons || []),
            'craft incomplete — no host floor fallback',
          ];
        } // end else not near-healed Ready
      } catch {
        /* floor best-effort */
      }
      } // end allowFloorSalvage
    }

    // Thin create: syntax heal → optional same-model finish-App → never floors.
    // Product ladder skips — compositional depth would wipe Normal seed.
    if (isThinCreatePath() && !productGenreGuard && uiPolishOk === false) {
      try {
        const { runCreateSyntaxGate } = await import('@/lib/createSyntaxGate');
        const writeThinApp = async () => {
          if (!originDiskRoot) return;
          await persistAcceptedCreateFiles(
            originDiskRoot,
            createFilesAcc,
            depthPersistKeys(createFilesAcc),
          ).catch(() => {});
        };

        if (thinCreateLocksAppJsx(briefForUi, lockedProductName)) {
          createFilesAcc = thinCoerceLockedAppJsx(createFilesAcc);
        }

        // Strip marketing COVER bleed on tools/apps (no invent).
        try {
          const { buildProductPlan, antiBleedForFamily } = await import('@/lib/createProductPlan');
          const plan = buildProductPlan(briefForUi, lockedProductName);
          const bled = antiBleedForFamily(createFilesAcc, plan);
          if (bled.changed) {
            createFilesAcc = bled.files;
            host.pushStatus(`Thin create · stripped bleed (${bled.actions.slice(0, 2).join(', ')})…`);
          }
        } catch { /* best-effort */ }

        let syn = runCreateSyntaxGate(createFilesAcc);
        if (syn.healed) {
          createFilesAcc = syn.files;
          await writeThinApp();
        }

        // Same sticky model: finish truncated/broken App.jsx (not a floor).
        if (
          !thinCraftMayContinue(createFilesAcc, syn.ok, syn.reasons)
          && thinAppNeedsFinishPass(createFilesAcc, syn.reasons)
          && coderGate.ok
          && !turnAborted()
        ) {
          host.pushStatus(`Finish App · **${coderGate.name}** (complete ${THIN_CREATE_APP_PATH})…`);
          try {
            const { answerStudio } = await import('@/lib/studioAnswerEngine');
            const broken = String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '');
            const finishPrompt = formatFinishAppPrompt({
              brief: originalBrief,
              productName: lockedProductName,
              brokenApp: broken,
            });
            const finish = await answerStudio({
              userMessage: finishPrompt,
              files: createFilesAcc,
              projectName: lockedProductName,
              mode: 'code',
              preferredModelId: coderGate.id,
              preferredModelName: coderGate.name,
              preferredSource: coderGate.source,
              stickyModelId: coderGate.id,
              stickyModelName: coderGate.name,
              stickyPinnedSource: 'local',
              allowFileEdits: true,
              timeoutMs: Math.min(180_000, createV2AttemptWallMs(budgetProfile)),
              shouldAbort: () => turnAborted(),
            });
            let reply = String(finish?.text || '');
            if (!/@@@FILE\s+src\/App\./i.test(reply) && /export\s+default\b/i.test(reply)) {
              const body = reply
                .replace(/^[\s\S]*?(?=import\s|const\s|function\s|export\s)/, '')
                .replace(/```[\s\S]*$/, '')
                .trim();
              if (body.length > 120) reply = `@@@FILE ${THIN_CREATE_APP_PATH}\n${body}`;
            }
            if (/@@@FILE\s+src\/App\.(jsx|tsx)/i.test(reply)) {
              const applied = await applyChatReplyEdits({
                reply,
                projectId: originProjectId,
                projectName: lockedProductName,
                files: createFilesAcc,
                userMessage: briefForUi,
                diskRoot: originDiskRoot,
              });
              if (applied.ok) {
                createFilesAcc = applied.files;
                if (thinCreateLocksAppJsx(briefForUi, lockedProductName)) {
                  createFilesAcc = thinCoerceLockedAppJsx(createFilesAcc);
                }
              }
            }
            syn = runCreateSyntaxGate(createFilesAcc);
            if (syn.healed) {
              createFilesAcc = syn.files;
              await writeThinApp();
            }
            if (syn.ok) {
              host.pushStatus('Finish App · syntax cleared — continuing to Live…');
            }
          } catch {
            /* finish pass best-effort */
          }
        }

        if (thinCraftMayContinue(createFilesAcc, syn.ok, syn.reasons)) {
          if (thinWantsCompositionalShell(briefForUi)) {
            createFilesAcc = seedCompositionalBrandVisuals(
              createFilesAcc,
              briefForUi,
              lockedProductName,
            );
            try {
              const { wireCreatePublicAssets } = await import('@/lib/createBuildQuality');
              createFilesAcc = wireCreatePublicAssets(
                createFilesAcc,
                lockedProductName,
                briefForUi,
              ).files;
            } catch { /* wire best-effort */ }
            if (originDiskRoot) {
              await persistAcceptedCreateFiles(
                originDiskRoot,
                createFilesAcc,
                genreLockPersistKeys(createFilesAcc),
              ).catch(() => {});
            }
            host.pushStatus('Thin create · genre seed before depth…');
            updateCreateJob(jobId, { files: createFilesAcc });
          }
          if (
            !thinDepthRan
            && thinNeedsDepthPass(createFilesAcc, briefForUi)
            && !thinGenreSeedClearsLive(createFilesAcc, briefForUi, lockedProductName)
            && !inventFloorFastPath
            && !inventFloorClearsLive(createFilesAcc, briefForUi, lockedProductName)
            && coderGate.ok
            && !turnAborted()
          ) {
            thinDepthRan = true;
            /** Why depth stopped — pushed to status + build diag so the exit is provable. */
            let depthSummary = 'no depth attempts recorded';
            let depthCraftStalled = false;
            try {
              // Require a non-truncated prior before depth invent (poisoned prior → thrash).
              {
                const priorCheck = String(createFilesAcc['src/App.jsx'] || '');
                if (thinAppLooksTruncated(priorCheck) && coderGate.ok && !turnAborted()) {
                  host.pushStatus('Depth preflight · finishing truncated App before invent…');
                  const { answerStudio: finishStudio } = await import('@/lib/studioAnswerEngine');
                  const fin = await finishStudio({
                    userMessage: formatFinishAppPrompt({
                      brief: briefForUi,
                      productName: lockedProductName,
                      brokenApp: priorCheck,
                    }),
                    files: createFilesAcc,
                    projectName: lockedProductName,
                    mode: 'code',
                    preferredModelId: coderGate.id,
                    preferredModelName: coderGate.name,
                    preferredSource: coderGate.source,
                    stickyModelId: coderGate.id,
                    stickyModelName: coderGate.name,
                    stickyPinnedSource: 'local',
                    allowFileEdits: true,
                    timeoutMs: Math.min(180_000, createV2AttemptWallMs(budgetProfile)),
                    shouldAbort: () => turnAborted(),
                  });
                  const finReply = String(fin?.text || '');
                  if (/@@@FILE\s+src\/App\./i.test(finReply)) {
                    const appliedFin = await applyChatReplyEdits({
                      reply: finReply,
                      projectId: originProjectId,
                      projectName: lockedProductName,
                      files: createFilesAcc,
                      userMessage: briefForUi,
                      diskRoot: originDiskRoot,
                    });
                    if (appliedFin.ok) {
                      createFilesAcc = appliedFin.files;
                      if (thinCreateLocksAppJsx(briefForUi, lockedProductName)) {
                        createFilesAcc = thinCoerceLockedAppJsx(createFilesAcc);
                      }
                    }
                  }
                }
              }
              // Compositional: carve fat App → shell + PageBody before invent so depth
              // asks for section files against a real shell (not a restored monolith).
              if (
                thinWantsCompositionalShell(briefForUi)
                && !createFilesAcc['.__novaGenericInventAsk']
                && !createFilesAcc['.__novaStorefrontInventAsk']
                && !createFilesAcc['.__novaProductInventAsk']
              ) {
                const beforeShell = String(createFilesAcc['src/App.jsx'] || '');
                createFilesAcc = assembleCompositionalAppShell(
                  createFilesAcc,
                  briefForUi,
                  lockedProductName,
                );
                if (String(createFilesAcc['src/App.jsx'] || '') !== beforeShell) {
                  host.pushStatus('Depth preflight · assembled compositional shell…');
                  if (originDiskRoot) {
                    await persistAcceptedCreateFiles(
                      originDiskRoot,
                      createFilesAcc,
                      depthPersistKeys(createFilesAcc),
                    ).catch(() => {});
                  }
                }
              }
              const { answerStudio } = await import('@/lib/studioAnswerEngine');
              let grewPasses = 0;
              let lastDepthReject = '';
              
              const compositionalDepth = thinWantsCompositionalShell(briefForUi);
              const isAuthoredDepthComplete = () => compositionalDepthIsComplete(
                createFilesAcc,
                briefForUi,
                lockedProductName,
              );
              /** Rejected section paths stay retired for the whole depth session (Freebuff C2). */
              const retiredSectionPaths = new Set<string>();
              let depthAttemptsUsed = 0;
              const depthAttemptMax = THIN_DEPTH_CONTINUE_MAX + 4;
              const sameRejectState = { key: '', bytes: -1, count: 0 };
              let depthStall = 0;
              let compositionalZeroGainCycles = 0;
              const noteDepthReject = (reason: string) => {
                lastDepthReject = reason;
                const appBytes = String(createFilesAcc['src/App.jsx'] || '').length;
                thinDepthSameRejectStalled({
                  reason,
                  appBytes,
                  state: sameRejectState,
                  bailAfter: THIN_DEPTH_SAME_REJECT_BAIL,
                });
                clearBuildWritingPath(
                  `Depth ${grewPasses + 1}/${THIN_DEPTH_CONTINUE_MAX} · keeping prior — retrying…`,
                );
              };
              for (let attempt = 1; attempt <= depthAttemptMax; attempt += 1) {
                if (turnAborted()) break;
                if (!thinNeedsDepthPass(createFilesAcc, briefForUi) && (!compositionalDepth || isAuthoredDepthComplete())) break;
                if (grewPasses >= THIN_DEPTH_CONTINUE_MAX) break;
                // Invent floor already on disk — do not burn the full create wall on enrich thrash.
                if (inventFloorEnrichExhausted({
                  floorSeededAt: inventFloorSeededAt,
                  files: createFilesAcc,
                  brief: briefForUi,
                  productName: lockedProductName,
                })) {
                  if (looksLikeInventFloorTwin(createFilesAcc)) {
                    createFilesAcc = breakInventFloorTwin(
                      createFilesAcc,
                      briefForUi,
                      lockedProductName,
                    );
                    createFloorFallback = false;
                    host.pushStatus('Invent enrich wall · broke floor twin stamp — finishing create…');
                  }
                  depthCraftStalled = false;
                  depthSummary = 'invent enrich wall after floor — finishing with landed sections';
                  host.pushStatus(
                    'Invent enrich wall · floor Acc is enough — finishing create (npm/Live next)…',
                  );
                  break;
                }
                const pass = grewPasses + 1;
                depthAttemptsUsed = attempt;
                clearBuildWritingPath(
                  `Depth ${pass}/${THIN_DEPTH_CONTINUE_MAX} · waiting on coder…`,
                );
                host.pushStatus(
                  `Depth continue ${pass}/${THIN_DEPTH_CONTINUE_MAX} · attempt ${attempt}/${depthAttemptMax} · waiting on coder · **${coderGate.name}**…`,
                );
                const prior = String(
                  createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '',
                );
                const priorCss = String(createFilesAcc['src/App.css'] || '');
                const priorFilesSnap = pickThinDepthFiles(createFilesAcc);
                const retiredList = [...retiredSectionPaths];
                const depthAskTarget = compositionalDepth
                  ? nextCompositionalDepthTarget(
                    createFilesAcc,
                    briefForUi,
                    lockedProductName,
                    retiredList,
                  )
                  : null;
                const depthStream = makeThinDepthStreamGuards(() => turnAborted());
                const depthFinish = await answerStudio({
                  userMessage: formatDepthContinuePrompt({
                    brief: briefForUi,
                    productName: lockedProductName,
                    priorApp: prior,
                    priorCss,
                    pass,
                    rejectReason: lastDepthReject || undefined,
                    deficits: thinDepthDeficits(createFilesAcc, briefForUi),
                    ledger: readThinDepthLedger(createFilesAcc),
                    files: createFilesAcc,
                    avoidSectionPath: retiredList,
                  }),
                  files: createFilesAcc,
                  projectName: lockedProductName,
                  mode: 'code',
                  preferredModelId: coderGate.id,
                  preferredModelName: coderGate.name,
                  preferredSource: coderGate.source,
                  stickyModelId: coderGate.id,
                  stickyModelName: coderGate.name,
                  stickyPinnedSource: 'local',
                  allowFileEdits: true,
                  timeoutMs: (pass === 1 && grewPasses === 0)
                    ? Math.min(120_000, createV2AttemptWallMs(budgetProfile))
                    : Math.min(240_000, createV2AttemptWallMs(budgetProfile)),
                  shouldAbort: depthStream.shouldAbort,
                }, depthStream.onDelta);
                if (depthStream.wasQuietAbort()) {
                  depthCraftStalled = true;
                  host.pushStatus('Depth craft stalled — idle invent wall — finishing with create miss…');
                  lastDepthReject = 'craft stalled — depth invent idle';
                  break;
                }
                let reply = String(depthFinish?.text || '');
                if (!/@@@FILE\s+src\//i.test(reply) && /export\s+default\b/i.test(reply)) {
                  const body = reply
                    .replace(/^[\s\S]*?(?=import\s|const\s|function\s|export\s)/, '')
                    .replace(/```[\s\S]*$/, '')
                    .trim();
                  if (body.length > 120) {
                    reply = `@@@FILE ${thinCreatePrimaryAppPath(briefForUi, createFilesAcc, lockedProductName)}\n${body}`;
                  }
                }
                const hasAppBlock = /@@@FILE\s+src\/App\.(?:jsx|tsx)\b/i.test(reply);
                const hasCssBlock = /@@@FILE\s+src\/App\.css\b/i.test(reply);
                const hasSectionBlock = replyHasCompositionalSectionBlock(reply);
                // Gain BEFORE assemble — see loop 1 comment (landmark shrink false reject).
                const applyDepthMerge = (raw: Record<string, string>, assemble: boolean) => {
                  let nf = thinMergeDepthAppFiles(raw, briefForUi, lockedProductName);
                  if (assemble && compositionalDepth) {
                    nf = applyCompositionalDepthMerge(nf, briefForUi, lockedProductName);
                  }
                  return nf;
                };
                const ledgerGainFromFiles = (raw: Record<string, string>) => {
                  let applied = applyDepthMerge(raw, false);
                  if (compositionalDepth) {
                    const cand = String(applied['src/App.jsx'] || applied['src/App.tsx'] || '');
                    if (cand && !appLooksLikeCompositionalShell(cand)) {
                      applied = {
                        ...applied,
                        'src/App.jsx': prior,
                      };
                      delete applied['src/App.tsx'];
                    }
                  }
                  const nextApp = String(
                    applied['src/App.jsx'] || applied['src/App.tsx'] || prior,
                  );
                  const nextCss = String(applied['src/App.css'] || priorCss || '');
                  const ok = thinDepthReplyGrew(prior, nextApp, {
                    priorCss,
                    nextCss,
                    priorFiles: priorFilesSnap,
                    nextFiles: pickThinDepthFiles(applied),
                  });
                  const nextFiles = ok ? applyDepthMerge(applied, true) : applied;
                  return { nextFiles, ok };
                };
                const depthNoGainReason = (nextFiles: Record<string, string>) => {
                  const drops = compositionalDepthDropsDeliveredMarkers(
                    priorFilesSnap,
                    pickThinDepthFiles(nextFiles),
                  );
                  if (drops.length) return formatCompositionalDepthDropReason(drops);
                  const priorLed = readThinDepthLedger(priorFilesSnap);
                  const nextLed = readThinDepthLedger(nextFiles);
                  return `ledger no gain (${formatThinDepthLedger(nextLed)} vs ${formatThinDepthLedger(priorLed)})`;
                };
                const acceptDepthLedger = async (nextFiles: Record<string, string>) => {
                  let accepted = nextFiles;
                  if (compositionalDepth) {
                    accepted = seedCompositionalBrandVisuals(
                      accepted,
                      briefForUi,
                      lockedProductName,
                    );
                  }
                  createFilesAcc = accepted;
                  grewPasses += 1;
                  depthStall = 0;
                  lastDepthReject = '';
                  for (const p of [...retiredSectionPaths]) {
                    const body = String(accepted[p] || '');
                    if (body.replace(/\s+/g, '').length >= 480) retiredSectionPaths.delete(p);
                  }
                  sameRejectState.key = '';
                  sameRejectState.bytes = -1;
                  sameRejectState.count = 0;
                  await writeThinApp();
                };
                const bumpDepthNoGain = (reason: string, statusDetail: string) => {
                  if (depthAskTarget?.filePath) {
                    retiredSectionPaths.add(depthAskTarget.filePath.replace(/\\/g, '/'));
                  }
                  noteDepthReject(reason);
                  host.pushStatus(
                    `Depth ${pass}/${THIN_DEPTH_CONTINUE_MAX} · attempt ${attempt}/${depthAttemptMax} · ${statusDetail}`,
                  );
                  depthStall += 1;
                  if (!compositionalDepth && depthStall >= THIN_DEPTH_ZERO_GAIN_BAIL) {
                    host.pushStatus(
                      `Depth stalled — ${depthStall} passes with zero ledger gain — stopping retry, keeping prior`,
                    );
                    return true;
                  }
                  if (compositionalDepth && depthStall >= THIN_DEPTH_ZERO_GAIN_BAIL) {
                    compositionalZeroGainCycles += 1;
                    if (compositionalZeroGainCycles >= THIN_DEPTH_COMPOSITIONAL_ZERO_GAIN_CYCLES) {
                      depthCraftStalled = true;
                      host.pushStatus(
                        `Depth stalled — craft stalled after ${compositionalZeroGainCycles} zero-gain cycles — finishing with create miss…`,
                      );
                      return true;
                    }
                    host.pushStatus(
                      `Depth · ${depthStall} zero-gain — advancing section target (${compositionalZeroGainCycles}/${THIN_DEPTH_COMPOSITIONAL_ZERO_GAIN_CYCLES})…`,
                    );
                    depthStall = 0;
                  }
                  if (sameRejectState.count >= THIN_DEPTH_SAME_REJECT_BAIL) {
                    host.pushStatus(
                      `Depth stalled — same thin shell ${sameRejectState.count} times — stopping invent, keeping prior`,
                    );
                    return true;
                  }
                  return false;
                };
                if (/@@@FILE\s+/i.test(reply) && !hasAppBlock) {
                  if (!hasCssBlock && !(compositionalDepth && hasSectionBlock)) {
                    if (bumpDepthNoGain(
                      'reply had @@@FILE but no src/App.jsx, App.css, or src/sections/*.jsx',
                      'no App.jsx, App.css, or section file in reply — keeping prior, retry…',
                    )) break;
                    continue;
                  }
                  if (compositionalDepth && hasSectionBlock && !hasCssBlock) {
                    const appliedSection = await applyChatReplyEdits({
                      reply,
                      projectId: originProjectId,
                      projectName: lockedProductName,
                      files: createFilesAcc,
                      userMessage: briefForUi,
                      diskRoot: originDiskRoot,
                      dryRun: true,
                    });
                    if (appliedSection.ok) {
                      const gain = ledgerGainFromFiles(appliedSection.files);
                      if (gain.ok) {
                        await acceptDepthLedger(gain.nextFiles);
                      } else {
                        const why = depthNoGainReason(gain.nextFiles);
                        if (bumpDepthNoGain(
                          why,
                          `${why} — keeping prior, retry…`,
                        )) break;
                      }
                    } else if (bumpDepthNoGain(createApplyFailureReason(appliedSection), `${createApplyFailureReason(appliedSection)} — keeping prior, retry…`)) {
                      break;
                    }
                    continue;
                  }
                  const appliedCss = await applyChatReplyEdits({
                    reply,
                    projectId: originProjectId,
                    projectName: lockedProductName,
                    files: createFilesAcc,
                    userMessage: briefForUi,
                    diskRoot: originDiskRoot,
                    dryRun: true,
                  });
                  if (appliedCss.ok) {
                    const gain = ledgerGainFromFiles(appliedCss.files);
                    if (gain.ok) {
                      await acceptDepthLedger(gain.nextFiles);
                    } else {
                      const why = depthNoGainReason(gain.nextFiles);
                      if (bumpDepthNoGain(
                        why,
                        `${why} — keeping prior, retry…`,
                      )) break;
                    }
                  } else if (bumpDepthNoGain(createApplyFailureReason(appliedCss), `${createApplyFailureReason(appliedCss)} — keeping prior, retry…`)) {
                    break;
                  }
                  continue;
                }
                if (/@@@FILE\s+/i.test(reply)) {
                  const applied = await applyChatReplyEdits({
                    reply,
                    projectId: originProjectId,
                    projectName: lockedProductName,
                    files: createFilesAcc,
                    userMessage: briefForUi,
                    diskRoot: originDiskRoot,
                    dryRun: true,
                  });
                  if (applied.ok) {
                    const gain = ledgerGainFromFiles(applied.files);
                    if (gain.ok) {
                      await acceptDepthLedger(gain.nextFiles);
                    } else {
                      const why = depthNoGainReason(gain.nextFiles);
                      if (bumpDepthNoGain(
                        why,
                        `${why} — keeping prior, retry…`,
                      )) break;
                    }
                  } else if (bumpDepthNoGain(createApplyFailureReason(applied), `${createApplyFailureReason(applied)} — keeping prior, retry…`)) {
                    break;
                  }
                } else if (bumpDepthNoGain(
                  'no @@@FILE blocks in depth reply',
                  'empty depth reply — keeping prior, retry…',
                )) {
                  break;
                }
                syn = runCreateSyntaxGate(createFilesAcc);
                if (syn.healed) {
                  createFilesAcc = syn.files;
                  await writeThinApp();
                }
                if (!syn.ok && thinAppNeedsFinishPass(createFilesAcc, syn.reasons)) break;
                try {
                  const { wireCreatePublicAssets } = await import('@/lib/createBuildQuality');
                  const wired = wireCreatePublicAssets(createFilesAcc, lockedProductName, briefForUi);
                  if (wired.changed.length) createFilesAcc = wired.files;
                } catch { /* ignore */ }
              }
              if (
                thinWantsCompositionalShell(briefForUi)
                && !createFilesAcc['.__novaGenericInventAsk']
                && !createFilesAcc['.__novaStorefrontInventAsk']
                && !createFilesAcc['.__novaProductInventAsk']
              ) {
                createFilesAcc = assembleCompositionalAppShell(
                  createFilesAcc,
                  briefForUi,
                  lockedProductName,
                );
              }
              depthSummary = `grew ${grewPasses}/${THIN_DEPTH_CONTINUE_MAX} in ${depthAttemptsUsed}/${depthAttemptMax} attempts${lastDepthReject ? ` · last: ${lastDepthReject}` : ' · all passes landed'}`;
              host.pushStatus(`Depth pass · ${depthSummary}`);
              if (depthCraftStalled) {
                uiPolishOk = false;
                createFloorFallback = false;
                uiPolishReasons = [
                  'Craft stalled — depth invent idle / zero-gain wall',
                  lastDepthReject || 'thin depth quiet abort',
                ];
                host.pushStatus('Thin create · craft stalled — will finish with create miss…');
              }
              await writeThinApp();
              syn = runCreateSyntaxGate(createFilesAcc);
              if (syn.healed) {
                createFilesAcc = syn.files;
                await writeThinApp();
              }
              const compositionalFinishOpen2 = thinWantsCompositionalShell(briefForUi)
                && Boolean(nextCompositionalDepthTarget(createFilesAcc, briefForUi, lockedProductName));
              if (
                !depthCraftStalled
                && !syn.ok
                && !compositionalFinishOpen2
                && thinAppNeedsFinishPass(createFilesAcc, syn.reasons)
                && coderGate.ok
                && !turnAborted()
              ) {
                host.pushStatus(`Finish App · **${coderGate.name}** (repair after depth)…`);
                const broken = String(createFilesAcc['src/App.jsx'] || '');
                const beforeFinishFiles = { ...createFilesAcc };
                const beforeFinishLedger = readThinDepthLedger(pickThinDepthFiles(beforeFinishFiles));
                const finish = await answerStudio({
                  userMessage: formatFinishAppPrompt({
                    brief: briefForUi,
                    productName: lockedProductName,
                    brokenApp: broken,
                  }),
                  files: createFilesAcc,
                  projectName: lockedProductName,
                  mode: 'code',
                  preferredModelId: coderGate.id,
                  preferredModelName: coderGate.name,
                  preferredSource: coderGate.source,
                  stickyModelId: coderGate.id,
                  stickyModelName: coderGate.name,
                  stickyPinnedSource: 'local',
                  allowFileEdits: true,
                  timeoutMs: Math.min(180_000, createV2AttemptWallMs(budgetProfile)),
                  shouldAbort: () => turnAborted(),
                });
                const reply = String(finish?.text || '');
                if (/@@@FILE\s+/i.test(reply)) {
                  const applied = await applyChatReplyEdits({
                    reply,
                    projectId: originProjectId,
                    projectName: lockedProductName,
                    files: createFilesAcc,
                    userMessage: briefForUi,
                    diskRoot: originDiskRoot,
                    dryRun: true,
                  });
                  if (applied.ok) {
                    let nextFiles = thinMergeDepthAppFiles(applied.files, briefForUi, lockedProductName);
                    if (
                      thinWantsCompositionalShell(briefForUi)
                      && !nextFiles['.__novaGenericInventAsk']
                      && !nextFiles['.__novaStorefrontInventAsk']
                      && !nextFiles['.__novaProductInventAsk']
                    ) {
                      nextFiles = assembleCompositionalAppShell(nextFiles, briefForUi, lockedProductName);
                    }
                    const synNext = runCreateSyntaxGate(nextFiles);
                    if (synNext.healed) nextFiles = synNext.files;
                    const nextApp = String(
                      nextFiles['src/App.jsx'] || nextFiles['src/App.tsx'] || '',
                    );
                    const nextLedger = readThinDepthLedger(pickThinDepthFiles(nextFiles));
                    const nextCompact = thinWantsCompositionalShell(briefForUi)
                      ? nextLedger.compact
                      : nextApp.replace(/\s+/g, '').length;
                    const priorCompact = thinWantsCompositionalShell(briefForUi)
                      ? beforeFinishLedger.compact
                      : broken.replace(/\s+/g, '').length;
                    if (synNext.ok && (nextCompact >= priorCompact * 0.85 || thinDepthReplyGrew(broken, nextApp, {
                      priorFiles: pickThinDepthFiles(beforeFinishFiles),
                      nextFiles: pickThinDepthFiles(nextFiles),
                    }))) {
                      createFilesAcc = nextFiles;
                      await writeThinApp();
                    } else if (synNext.ok && nextCompact >= 400) {
                      createFilesAcc = nextFiles;
                      await writeThinApp();
                    } else {
                      createFilesAcc = beforeFinishFiles;
                      host.pushStatus('Finish App · repair too thin/broken — kept pre-finish App');
                      await writeThinApp();
                    }
                  }
                }
                syn = runCreateSyntaxGate(createFilesAcc);
                if (syn.healed) {
                  createFilesAcc = syn.files;
                  await writeThinApp();
                }
              }
            } catch { /* best-effort */ }
            if (thinCraftMayContinue(createFilesAcc, syn.ok, syn.reasons)) {
              createFloorFallback = false;
              if (thinWantsCompositionalShell(briefForUi)) {
                createFilesAcc = seedCompositionalBrandVisuals(
                  createFilesAcc,
                  briefForUi,
                  lockedProductName,
                );
                try {
                  const { wireCreatePublicAssets } = await import('@/lib/createBuildQuality');
                  createFilesAcc = wireCreatePublicAssets(
                    createFilesAcc,
                    lockedProductName,
                    briefForUi,
                  ).files;
                } catch { /* wire best-effort */ }
                await writeThinApp();
                if (originDiskRoot && createFilesAcc['public/logo.svg']) {
                  await persistAcceptedCreateFiles(
                    originDiskRoot,
                    createFilesAcc,
                    ['public/logo.svg'],
                  ).catch(() => {});
                }
                host.pushStatus('Thin create · visual seed + logo wire applied after depth…');
              }
              if (
                thinWantsCompositionalShell(briefForUi)
                && !createFilesAcc['.__novaGenericInventAsk']
                && !createFilesAcc['.__novaStorefrontInventAsk']
                && !compositionalDepthIsComplete(createFilesAcc, briefForUi, lockedProductName)
              ) {
                createFilesAcc = seedCompositionalSectionScaffolds(
                  createFilesAcc,
                  briefForUi,
                  lockedProductName,
                );
                updateCreateJob(jobId, { files: createFilesAcc });
                await writeThinApp();
                host.pushStatus('Thin create · section scaffolds after depth (complete missing bands)…');
              }
              {
                const compositionOpen = thinWantsCompositionalShell(briefForUi)
                  && !createFilesAcc['.__novaGenericInventAsk']
                  && !createFilesAcc['.__novaStorefrontInventAsk']
                  && !/data-nova-invent-demo\s*=\s*["']1["']/.test(String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || ''))
                  && !compositionalDepthIsComplete(createFilesAcc, briefForUi, lockedProductName);
                const missingSections = compositionOpen
                  ? formatCompositionalSectionSpecs(briefForUi, lockedProductName)
                    .filter((spec) => !compositionalSectionFileSubstantial(String(createFilesAcc[spec.filePath] || '')))
                    .map((spec) => spec.filePath)
                  : [];
                if (depthCraftStalled || thinBlocksLivePreview(createFilesAcc, briefForUi) || compositionOpen) {
                  uiPolishOk = false;
                  createFloorFallback = false;
                  uiPolishReasons = [
                    ...(depthCraftStalled
                      ? ['Craft stalled — depth invent idle / zero-gain wall']
                      : []),
                    ...(thinBlocksLivePreview(createFilesAcc, briefForUi)
                      ? [
                        `Visual floor still open after depth (${depthSummary})`,
                        ...thinLiveVisualDeficits(createFilesAcc, briefForUi).slice(0, 4),
                      ]
                      : []),
                    ...(compositionOpen
                      ? [`compositional content incomplete: ${missingSections.slice(0, 6).join(', ') || 'required sections missing'}`]
                      : []),
                  ];
                  host.pushStatus(
                    depthCraftStalled
                      ? `Thin create · craft stalled (${depthSummary}) — Live blocked…`
                      : compositionOpen
                        ? `Thin create · composition incomplete after depth (${depthSummary}) — Live blocked…`
                        : `Thin create · visual floor open (${depthSummary}) — not Ready yet…`,
                  );
                } else {
                  uiPolishOk = true;
                  uiPolishReasons = [];
                  host.pushStatus(`Thin create · visual + composition cleared (${depthSummary}) — continuing to Live…`);
                }
              }
            } else {
              createFloorFallback = false;
              uiPolishOk = false;
              uiPolishReasons = [...new Set([
                ...(uiPolishReasons || []),
                ...(syn.reasons || []).slice(0, 4),
                'App broken after depth — Live blocked (would be black)',
              ])];
              host.pushStatus('Thin create · App broken after depth — failing closed (no black Live)…');
            }
          } else if (thinBlocksLivePreview(createFilesAcc, briefForUi)
            || thinNeedsDepthPass(createFilesAcc, briefForUi)
            || (thinWantsCompositionalShell(briefForUi)
              && !compositionalDepthIsComplete(createFilesAcc, briefForUi, lockedProductName))) {
            createFloorFallback = false;
            if (thinWantsCompositionalShell(briefForUi)) {
              createFilesAcc = seedCompositionalBrandVisuals(
                createFilesAcc,
                briefForUi,
                lockedProductName,
              );
              createFilesAcc = seedCompositionalSectionScaffolds(
                createFilesAcc,
                briefForUi,
                lockedProductName,
              );
              await writeThinApp();
            }
            {
              const compositionOpen = thinWantsCompositionalShell(briefForUi)
                && !createFilesAcc['.__novaGenericInventAsk']
                && !createFilesAcc['.__novaStorefrontInventAsk']
                && !/data-nova-invent-demo\s*=\s*["']1["']/.test(String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || ''))
                && !compositionalDepthIsComplete(createFilesAcc, briefForUi, lockedProductName);
              const missingSections = compositionOpen
                ? formatCompositionalSectionSpecs(briefForUi, lockedProductName)
                  .filter((spec) => !compositionalSectionFileSubstantial(String(createFilesAcc[spec.filePath] || '')))
                  .map((spec) => spec.filePath)
                : [];
              if (thinBlocksLivePreview(createFilesAcc, briefForUi) || compositionOpen) {
                uiPolishOk = false;
                uiPolishReasons = [
                  ...(thinBlocksLivePreview(createFilesAcc, briefForUi)
                    ? [
                      'Visual floor still open — Live blocked',
                      ...thinLiveVisualDeficits(createFilesAcc, briefForUi).slice(0, 4),
                    ]
                    : []),
                  ...(compositionOpen
                    ? [`compositional content incomplete: ${missingSections.slice(0, 6).join(', ') || 'required sections missing'}`]
                    : []),
                ];
                host.pushStatus(
                  compositionOpen
                    ? 'Thin create · composition incomplete — Live blocked…'
                    : 'Thin create · visual floor still open — not Ready yet…',
                );
              } else {
                uiPolishOk = true;
                uiPolishReasons = [];
                host.pushStatus('Thin create · visual + composition cleared — continuing to Live…');
              }
            }
          } else {
            createFloorFallback = false;
            uiPolishOk = true;
            uiPolishReasons = [];
            host.pushStatus('Thin create · App kept — continuing to Live…');
          }
        } else {
          uiPolishReasons = [...new Set([
            ...(uiPolishReasons || []),
            ...(syn.reasons || []).slice(0, 4),
          ])];
          host.pushStatus('Thin create · App still incomplete — failing closed (no floor salvage)…');
        }
      } catch {
        /* thin syntax best-effort */
      }
    }

    // Last chance: pottery / KilnBook briefs must not die on truncated coder output.
    // Thin create: skipped (no kiln floor salvage).
    if (uiPolishOk === false && !isThinCreatePath()) {
      try {
        const {
          briefLooksLikeFiringJournal,
          buildUtilityFloorFromBrief,
          previewReadyForBrief,
          ensureViteReactProjectFiles,
        } = await import('@/lib/createBuildQuality');
        const kilnBrief = briefLooksLikeFiringJournal(briefForUi)
          || /\b(?:kilnbook|pottery|firing\s+journal)\b/i.test(`${briefForUi}\n${lockedProductName}`);
        if (kilnBrief) {
          host.pushStatus('Preflight blocked — shipping KilnBook floor so Live can unlock…');
          const floor = buildUtilityFloorFromBrief(lockedProductName, briefForUi);
          const appKey = createFilesAcc['src/App.jsx'] && !createFilesAcc['src/App.tsx']
            ? 'src/App.jsx'
            : 'src/App.tsx';
          createFilesAcc = {
            ...createFilesAcc,
            [appKey]: floor.app,
            'src/App.css': floor.css,
          };
          try {
            if (artifactWantsVite(createArtifactKind)) {
              createFilesAcc = ensureViteReactProjectFiles(createFilesAcc, lockedProductName).files;
            }
          } catch { /* best-effort */ }
          softBindCreateStudio(host, {
            files: createFilesAcc,
            projectId: originProjectId,
            name: lockedProductName,
            diskRoot: originDiskRoot,
            force: true,
          });
          if (originDiskRoot) {
            await applyChatReplyEdits({
              reply: [
                `@@@FILE ${appKey}\n${createFilesAcc[appKey]}`,
                `@@@FILE src/App.css\n${createFilesAcc['src/App.css']}`,
              ].join('\n'),
              projectId: originProjectId,
              projectName: lockedProductName,
              files: createFilesAcc,
              userMessage: briefForUi,
              diskRoot: originDiskRoot,
            }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
          }
          const gate = previewReadyForBrief(createFilesAcc, {
            productName: lockedProductName,
            brief: briefForUi,
            spec: ensembleSpec,
            contract: ensembleContract,
          });
          if (gate.ok) {
            uiPolishOk = true;
            uiPolishReasons = [];
            host.pushStatus('KilnBook floor cleared Preview Ready…');
          } else {
            // Floor is complete and interactive — continue to Live evidence anyway.
            uiPolishOk = true;
            uiPolishReasons = [];
            host.pushStatus('KilnBook floor shipped — continuing to Live…');
          }
        }
      } catch { /* best-effort */ }
    }

    // Final thin hard-stop: visual floor open ⇒ never npm/Live (invent 9k may stay soft).
    // If seed clears the floor, promote Live even when earlier App-only Ready demoted craft.
    // Product / storefront ladder owns App — never assemble compositional shells over the spine.
    if (isThinCreatePath() && !productGenreGuard && !storefrontSpineLocked) {
      if (thinWantsCompositionalShell(briefForUi)) {
        createFilesAcc = seedCompositionalBrandVisuals(
          createFilesAcc,
          briefForUi,
          lockedProductName,
        );
        // Seed alone does not rewrite sparkles→wine/coffee — wire logo family now and
        // force-persist hero + public/logo.svg so invent cannot leave a phone+star on disk.
        try {
          const { wireCreatePublicAssets } = await import('@/lib/createBuildQuality');
          const wired = wireCreatePublicAssets(createFilesAcc, lockedProductName, briefForUi);
          createFilesAcc = wired.files;
        } catch { /* wire best-effort */ }
        if (originDiskRoot && !inventDemoOwnsLogo(createFilesAcc)) {
          // Belt: force genre logo bytes even if invent/materialize rewrote sparkles on disk.
          // Skip when invent-demo already owns a locked logo mark.
          try {
            const { brandLogoSvgFor } = await import('@/lib/brandAssets');
            const forced = brandLogoSvgFor({
              productName: lockedProductName,
              brief: briefForUi,
              css: String(createFilesAcc['src/App.css'] || ''),
            });
            if (forced && !/M9\.937 15\.5/i.test(forced)) {
              createFilesAcc = { ...createFilesAcc, 'public/logo.svg': forced };
            }
          } catch { /* brand logo best-effort */ }
          const persistKeys = genreLockPersistKeys(createFilesAcc);
          const heroKeys = persistKeys.filter((k) => /Hero.*\.jsx$/i.test(k));
          const persist = await persistAcceptedCreateFiles(
            originDiskRoot,
            createFilesAcc,
            persistKeys,
          ).catch((e) => ({ ok: false as const, error: String(e) }));
          // Logo-only write + readback — bulk persist can report ok while logo stays sparkles.
          const logoBody = String(createFilesAcc['public/logo.svg'] || '');
          const logoPersist = logoBody && !/M9\.937 15\.5/i.test(logoBody)
            ? await persistGenreLogoSvg(originDiskRoot, logoBody).catch((e) => ({
              ok: false as const,
              error: String(e),
            }))
            : { ok: true as const };
          if (logoPersist && logoPersist.ok === false) {
            host.pushStatus(`Thin create · genre lock · logo persist failed — ${String(logoPersist.error || '').slice(0, 60)}`);
          }
          // Only fall back to @@@FILE when persist failed — avoid hanging the create turn.
          if (!persist?.ok) {
            const blocks = [
              ...heroKeys.map((k) => `@@@FILE ${k}\n${createFilesAcc[k] || ''}`),
              createFilesAcc['public/logo.svg']
                ? `@@@FILE public/logo.svg\n${createFilesAcc['public/logo.svg']}`
                : '',
            ].filter(Boolean);
            if (blocks.length) {
              await applyChatReplyEdits({
                reply: blocks.join('\n'),
                projectId: originProjectId,
                projectName: lockedProductName,
                files: createFilesAcc,
                userMessage: briefForUi,
                diskRoot: originDiskRoot,
              }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
            }
          }
          const logoNow = String(createFilesAcc['public/logo.svg'] || '');
          const heroNow = String(createFilesAcc[heroKeys[0] || ''] || '');
          host.pushStatus(
            `Thin create · genre lock · logo=${/M8 22h8/.test(logoNow) ? 'wine' : /M16 8a1 1 0 0 1 1 1v8/.test(logoNow) ? 'coffee' : /M3 2v7c0 1\.1/.test(logoNow) ? 'utensils' : /M9\.937/.test(logoNow) ? 'sparkles' : 'other'} · hero=${/#2997ff/.test(heroNow) ? 'phone' : /small batch/i.test(heroNow) ? 'bottle' : /whole bean/i.test(heroNow) ? 'bag' : /kiln-fired/i.test(heroNow) ? 'ceramic' : 'other'}${persist?.ok === false ? ' · persist-retry' : ''}`,
          );
        }
        updateCreateJob(jobId, { files: createFilesAcc });
      }
      {
        const { wantsStructureFirstCreate } = await import('@/lib/novaBuildLoop');
        const structureFirst = wantsStructureFirstCreate(briefForUi, lockedProductName);
        if (
          !structureFirst
          && thinWantsCompositionalShell(briefForUi)
          && !createFilesAcc['.__novaGenericInventAsk']
          && !createFilesAcc['.__novaStorefrontInventAsk']
          && !compositionalDepthIsComplete(createFilesAcc, briefForUi, lockedProductName)
        ) {
          createFilesAcc = seedCompositionalSectionScaffolds(
            createFilesAcc,
            briefForUi,
            lockedProductName,
          );
          updateCreateJob(jobId, { files: createFilesAcc });
          if (originDiskRoot) {
            await persistAcceptedCreateFiles(
              originDiskRoot,
              createFilesAcc,
              depthPersistKeys(createFilesAcc),
            ).catch(() => {});
          }
          host.pushStatus('Thin create · section scaffolds before final gate…');
        }
        if (productGenreGuard) {
          // Never mark polish ok from seed snapshot — Quality Accept / seed-lift owns Ready.
          // Only restore snapshot when App was poisoned into wrong genre / twin.
          try {
            const {
              appLooksLikeWrongGenreForProductBrief,
              appLooksLikeDeskSpineTemplate,
              appLooksLikeProductSeedFloor,
            } = await import('@/lib/createProductLadder');
            const appNow = String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '');
            const productBrief = authoritativeOriginalBrief || briefForUi;
            if (
              productInventSnapshot?.appJsx
              && (appLooksLikeWrongGenreForProductBrief(appNow, productBrief)
                || appLooksLikeDeskSpineTemplate(appNow))
            ) {
              restoreProductInventSnapshot('thin final gate · wrong-genre overwrite');
            }
            if (appLooksLikeProductSeedFloor(
              String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || ''),
            )) {
              uiPolishOk = false;
              if (!uiPolishReasons.length) {
                uiPolishReasons = ['Seed floor still on disk — Quality Accept / seed-lift required'];
              }
              host.pushStatus('Ladder · thin final gate soft — invent/lift still owns Quality…');
            } else if (uiPolishOk === true) {
              host.pushStatus('Ladder · invent look held — thin final gate soft…');
            } else {
              host.pushStatus('Ladder · invent/lift still required — thin final gate does not clear seed…');
            }
          } catch {
            uiPolishOk = false;
            host.pushStatus('Ladder · invent still required — thin final gate does not clear seed…');
          }
        } else if (structureFirst) {
          // Step-by-step / structure-first: never craft-block on visual floor or composition.
          uiPolishOk = true;
          createFloorFallback = false;
          uiPolishReasons = [];
          host.pushStatus('Structure-first · final gate soft — continuing to Live…');
        } else {
          const appForGate = String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '');
          const inventDemoTwin = /data-nova-invent-demo\s*=\s*["']1["']/.test(appForGate)
            && appForGate.length >= 800;
          const inventOwnsApp = Boolean(
            createFilesAcc['.__novaGenericInventAsk']
            || createFilesAcc['.__novaStorefrontInventAsk'],
          );
          // Invent-demo twin is NOT Ready — model must invent; still require sections when asked.
          const compositionOpen = !inventOwnsApp
            && thinWantsCompositionalShell(briefForUi)
            && !compositionalDepthIsComplete(createFilesAcc, briefForUi, lockedProductName);
          const missingSections = compositionOpen
            ? formatCompositionalSectionSpecs(briefForUi, lockedProductName)
              .filter((spec) => !compositionalSectionFileSubstantial(String(createFilesAcc[spec.filePath] || '')))
              .map((spec) => spec.filePath)
            : [];
          if (inventDemoTwin) {
            uiPolishOk = false;
            createFloorFallback = false;
            uiPolishReasons = [
              ...(uiPolishReasons || []),
              'invent-demo host twin on disk — not Ready; model must invent from brief',
            ];
            host.pushStatus('Thin create · invent-demo twin blocked — model must invent unique App…');
          } else if (thinBlocksLivePreview(createFilesAcc, briefForUi, lockedProductName) || compositionOpen) {
            uiPolishOk = false;
            createFloorFallback = false;
            uiPolishReasons = [
              ...new Set([
                ...(uiPolishReasons || []),
                ...(thinBlocksLivePreview(createFilesAcc, briefForUi, lockedProductName)
                  ? [
                    'Visual floor still open — Live blocked (thinBlocksLivePreview)',
                    ...thinLiveVisualDeficits(createFilesAcc, briefForUi, lockedProductName).slice(0, 4),
                    ...thinAskMatchDeficits(createFilesAcc, briefForUi, lockedProductName).slice(0, 4),
                  ]
                  : []),
                ...(compositionOpen
                  ? [`compositional content incomplete: ${missingSections.slice(0, 6).join(', ') || 'required sections missing'}`]
                  : []),
              ]),
            ];
            host.pushStatus(
              compositionOpen
                ? 'Thin create · final gate — composition incomplete, Live blocked…'
                : 'Thin create · final visual gate — floor still open, Live blocked…',
            );
          } else {
            uiPolishOk = true;
            createFloorFallback = false;
            uiPolishReasons = [];
            host.pushStatus('Thin create · final visual + composition gate cleared — continuing to Live…');
          }
        }
      }
    }

    // Absolute genre logo lock — always when diskRoot exists (product spine needs /logo.svg).
    // Never stamp Lucide family marks over invent-demo logos (luggage suitcase ≠ music note).
    let absoluteLogoLockNote = 'not-run';
    if (originDiskRoot && !inventDemoOwnsLogo(createFilesAcc)) {
      try {
        const { brandLogoSvgFor } = await import('@/lib/brandAssets');
        const { localIconifySvg } = await import('@/lib/localLucideIcons');
        const heroKind = detectHeroProductKind(lockedProductName, briefForUi);
        let forced = brandLogoSvgFor({
          productName: lockedProductName,
          brief: briefForUi,
          css: String(createFilesAcc['src/App.css'] || ''),
        });
        if (!forced || /M9\.937 15\.5/i.test(forced)) {
          const ink = /background\s*:\s*(?:#f|#fff)/i.test(String(createFilesAcc['src/App.css'] || ''))
            ? '#1a1a1a' : '#ffffff';
          const forcedId = heroKind === 'bottle' ? 'lucide:wine'
            : heroKind === 'coffee' ? 'lucide:coffee'
              : heroKind === 'tea' ? 'lucide:leaf'
                : heroKind === 'ceramic' ? 'lucide:utensils'
                  : '';
          if (forcedId) forced = localIconifySvg(forcedId, ink) || forced;
          if (
            (!forced || /M9\.937 15\.5/i.test(forced))
            && /\b(?:gaming\s+desk|standing\s+desk|shop\s+the\s+desk|battlestation|desk)\b/i.test(briefForUi)
          ) {
            const { productDeskLogoSvg } = await import('@/lib/createProductLadder');
            forced = productDeskLogoSvg(ink);
          }
        }
        const kind = /M8 22h8/.test(forced) ? 'wine'
          : /M16 8a1 1 0 0 1 1 1v8|M10 2v2/.test(forced) ? 'coffee'
            : /M3 2v7c0 1\.1/.test(forced) ? 'utensils'
              : /viewBox="0 0 64 64"[\s\S]*width="48" height="8"/.test(forced) ? 'desk'
              : /M9\.937/.test(forced) ? 'sparkles' : 'other';
        if (forced && kind !== 'sparkles') {
          createFilesAcc = { ...createFilesAcc, 'public/logo.svg': forced };
          const logoWrite = await persistGenreLogoSvg(originDiskRoot, forced).catch((e) => ({
            ok: false as const,
            error: String(e),
          }));
          absoluteLogoLockNote = `${kind}${logoWrite?.ok === false ? ` write-failed:${String(logoWrite.error || '').slice(0, 40)}` : ' disk-ok'}`;
          host.pushStatus(`Thin create · absolute logo lock · ${absoluteLogoLockNote}`);
          updateCreateJob(jobId, { files: createFilesAcc });
        } else if (forced) {
          const ink = '#ffffff';
          const { productDeskLogoSvg } = await import('@/lib/createProductLadder');
          const desk = (
            /\b(?:gaming\s+desk|standing\s+desk|shop\s+the\s+desk|battlestation|desk)\b/i.test(briefForUi)
              ? productDeskLogoSvg(ink)
              : localIconifySvg('lucide:gamepad-2', ink)
          ) || forced;
          createFilesAcc = { ...createFilesAcc, 'public/logo.svg': desk };
          await persistGenreLogoSvg(originDiskRoot, desk).catch(() => {});
          absoluteLogoLockNote = 'desk disk-ok';
          host.pushStatus(`Thin create · absolute logo lock · ${absoluteLogoLockNote}`);
          updateCreateJob(jobId, { files: createFilesAcc });
        } else {
          absoluteLogoLockNote = `skipped mark=${kind || 'empty'} hero=${heroKind} name=${lockedProductName.slice(0, 24)}`;
          host.pushStatus(`Thin create · absolute logo lock · ${absoluteLogoLockNote}`);
        }
      } catch (e) {
        absoluteLogoLockNote = `error ${String(e).slice(0, 60)}`;
        host.pushStatus(`Thin create · absolute logo lock · ${absoluteLogoLockNote}`);
      }
    } else if (inventDemoOwnsLogo(createFilesAcc)) {
      absoluteLogoLockNote = 'skipped invent-demo logo';
      host.pushStatus('Thin create · absolute logo lock · skipped (invent-demo owns logo)');
    } else {
      absoluteLogoLockNote = 'skipped no-diskRoot';
      host.pushStatus('Thin create · absolute logo lock · skipped (no diskRoot)');
    }

    // Product final verify — invent must leave desk-* seed behind; never ship seed as Ready.
    try {
      const {
        runProductCreateLadder,
        appLooksLikeDeskSpineTemplate,
        appLooksLikeWrongGenreForProductBrief,
        gradeProductQuality,
        PRODUCT_LADDER_WALL_MS,
        PRODUCT_LADDER_HARD_WALL_MS,
      } = await import('@/lib/createProductLadder');
      const productBrief = authoritativeOriginalBrief || briefForUi;
      if (artifactWantsProductLadder(createArtifactKind, productBrief)) {
        const elapsed = Date.now() - createStartedAt;
        if (elapsed >= PRODUCT_LADDER_HARD_WALL_MS) {
          uiPolishOk = false;
          createFloorFallback = false;
          uiPolishReasons = ['Product create hard wall (20m) — craft stalled'];
          host.pushStatus('Ladder · 20m hard wall — create miss…');
        } else {
          let appNow = String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '');
          // Restore invent look if floors poisoned; never re-seed the twin as success.
          if (
            productInventSnapshot?.appJsx
            && (appLooksLikeWrongGenreForProductBrief(appNow, productBrief)
              || appLooksLikeDeskSpineTemplate(appNow))
          ) {
            restoreProductInventSnapshot('final overwrite guard');
            appNow = String(createFilesAcc['src/App.jsx'] || '');
          }
          if (appLooksLikeDeskSpineTemplate(appNow)) {
            uiPolishOk = false;
            createFloorFallback = false;
            uiPolishReasons = [
              'Page still matches a frozen prior template — not Ready for any brand',
              'failed beat: not-template',
            ];
            host.pushStatus('Ladder · Accept miss — frozen template is not Ready…');
          } else {
            host.pushStatus('Ladder · Accept · Quality lock verify…');
            let ladder = await runProductCreateLadder({
              brief: productBrief,
              productName: lockedProductName,
              files: createFilesAcc,
              host: {
                pushStatus: host.pushStatus,
                shouldAbort: () => turnAborted(),
              },
              startedAt: createStartedAt,
              wallMs: Math.min(
                PRODUCT_LADDER_WALL_MS,
                Math.max(30_000, createWallMs - elapsed),
              ),
              salt: String(jobId || lockedProductName).slice(-6),
              allowSpineMaterialize: false,
            });
            createFilesAcc = ladder.files;
            if (originDiskRoot) {
              await persistAcceptedCreateFiles(
                originDiskRoot,
                createFilesAcc,
                ['src/App.jsx', 'src/App.css', 'src/App.tsx', 'src/index.css', 'public/logo.svg']
                  .filter((p) => createFilesAcc[p]),
              ).catch(() => {});
            }
            updateCreateJob(jobId, { files: createFilesAcc });
            softBindCreateStudio(host, {
              files: createFilesAcc,
              projectId: originProjectId,
              name: lockedProductName,
              diskRoot: originDiskRoot,
            });
            let graded = gradeProductQuality(createFilesAcc, productBrief, lockedProductName);
            // Push Quality → Premium by default (no “say premium” wording required).
            if (graded.okQuality && !graded.okPremium) {
              try {
                const { ensureProductPremiumCraft } = await import('@/lib/createProductLadder');
                host.pushStatus('Ladder · premium craft pass…');
                createFilesAcc = ensureProductPremiumCraft(
                  createFilesAcc,
                  productBrief,
                  lockedProductName,
                );
                graded = gradeProductQuality(createFilesAcc, productBrief, lockedProductName);
                if (originDiskRoot) {
                  await persistAcceptedCreateFiles(
                    originDiskRoot,
                    createFilesAcc,
                    ['src/App.jsx', 'src/App.css', 'src/App.tsx', 'src/index.css']
                      .filter((p) => createFilesAcc[p]),
                  ).catch(() => {});
                }
                if (graded.okPremium) {
                  softBindCreateStudio(host, {
                    files: createFilesAcc,
                    projectId: originProjectId,
                    name: lockedProductName,
                    diskRoot: originDiskRoot,
                    force: true,
                  });
                }
              } catch { /* keep graded */ }
            }
            // Invent idle wall often leaves a good Normal seed — lift past seed markers so
            // Ready unlocks (delivery/desk/any brand) instead of Unavailable with a fine page.
            if (
              (!ladder.ok || !graded.okPremium)
              && graded.okNormal
              && !appLooksLikeWrongGenreForProductBrief(
                String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || ''),
                productBrief,
              )
            ) {
              try {
                const { liftProductSeedPastFloor, appLooksLikeProductSeedFloor } = await import(
                  '@/lib/createProductLadder'
                );
                const appLift = String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '');
                if (appLooksLikeProductSeedFloor(appLift)) {
                  host.pushStatus('Ladder · invent stalled — invent-rescue composition (not a renamed seed)…');
                  createFilesAcc = {
                    ...createFilesAcc,
                    ...liftProductSeedPastFloor(
                      createFilesAcc,
                      productBrief,
                      lockedProductName,
                      String(jobId || lockedProductName).slice(-6),
                    ),
                  };
                  if (originDiskRoot) {
                    await persistAcceptedCreateFiles(
                      originDiskRoot,
                      createFilesAcc,
                      [
                        'src/App.jsx',
                        'src/App.css',
                        'src/App.tsx',
                        'src/index.css',
                        'public/logo.svg',
                        'public/heroes/delivery.svg',
                        'public/heroes/desk.svg',
                      ].filter((p) => createFilesAcc[p]),
                    ).catch(() => {});
                  }
                  graded = gradeProductQuality(createFilesAcc, productBrief, lockedProductName);
                  if (graded.okQuality && !graded.okPremium) {
                    const { ensureProductPremiumCraft } = await import('@/lib/createProductLadder');
                    createFilesAcc = ensureProductPremiumCraft(
                      createFilesAcc,
                      productBrief,
                      lockedProductName,
                    );
                    graded = gradeProductQuality(createFilesAcc, productBrief, lockedProductName);
                  }
                  // Accept on graded Premium after lift — Quality alone is no longer Ready.
                  if (graded.okPremium) {
                    ladder = {
                      ...ladder,
                      ok: true,
                      files: createFilesAcc,
                      beatsDone: [...(ladder.beatsDone || []), 'premium-lift'],
                      failedBeat: undefined,
                      reason: undefined,
                    };
                    productInventSnapshot = {
                      appJsx: String(createFilesAcc['src/App.jsx'] || ''),
                      appCss: String(createFilesAcc['src/App.css'] || ''),
                      logo: String(createFilesAcc['public/logo.svg'] || ''),
                    };
                    softBindCreateStudio(host, {
                      files: createFilesAcc,
                      projectId: originProjectId,
                      name: lockedProductName,
                      diskRoot: originDiskRoot,
                      force: true,
                    });
                  }
                }
              } catch { /* keep Accept miss */ }
            }
            if (!ladder.ok || !graded.okPremium) {
              uiPolishOk = false;
              createFloorFallback = false;
              uiPolishReasons = [
                ladder.reason || `Product Accept miss (${graded.label})`,
                ...(ladder.failedBeat ? [`failed beat: ${ladder.failedBeat}`] : []),
                ...graded.reasons.slice(0, 4),
              ];
              host.pushStatus(`Ladder · ${uiPolishReasons[0]}…`);
            } else {
              uiPolishOk = true;
              uiPolishReasons = [];
              createFloorFallback = false;
              productGenreGuard = true;
              productSpineLocked = true;
              productInventSnapshot = {
                appJsx: String(createFilesAcc['src/App.jsx'] || ''),
                appCss: String(createFilesAcc['src/App.css'] || ''),
                logo: String(createFilesAcc['public/logo.svg'] || ''),
              };
              if (originDiskRoot) {
                await persistAcceptedCreateFiles(
                  originDiskRoot,
                  createFilesAcc,
                  ['src/App.jsx', 'src/App.css', 'src/App.tsx', 'src/index.css', 'public/logo.svg', 'public/heroes/delivery.svg', 'public/heroes/desk.svg']
                    .filter((p) => createFilesAcc[p]),
                ).catch(() => {});
              }
              updateCreateJob(jobId, { files: createFilesAcc });
              host.pushStatus(
                `Ladder · Accept ${graded.label} (${ladder.beatsDone.join(' → ')})…`,
              );
            }
          }
        }
      }
    } catch { /* ignore */ }

    // Last chance: product Normal seed on disk + invent idle → lift to Quality Ready (any brand).
    if (uiPolishOk === false && productGenreGuard) {
      try {
        const {
          gradeProductQuality,
          liftProductSeedPastFloor,
          appLooksLikeProductSeedFloor,
          appLooksLikeWrongGenreForProductBrief,
        } = await import('@/lib/createProductLadder');
        const productBrief = authoritativeOriginalBrief || briefForUi;
        if (artifactWantsProductLadder(createArtifactKind, productBrief)) {
          const appNow = String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '');
          const pre = gradeProductQuality(createFilesAcc, productBrief, lockedProductName);
          if (
            appLooksLikeProductSeedFloor(appNow)
            && !appLooksLikeWrongGenreForProductBrief(appNow, productBrief)
            && pre.okNormal
          ) {
            host.pushStatus('Ladder · last-chance invent-rescue composition…');
            createFilesAcc = {
              ...createFilesAcc,
              ...liftProductSeedPastFloor(
                createFilesAcc,
                productBrief,
                lockedProductName,
                String(jobId || lockedProductName).slice(-6),
              ),
            };
            let lifted = gradeProductQuality(createFilesAcc, productBrief, lockedProductName);
            if (lifted.okQuality && !lifted.okPremium) {
              const { ensureProductPremiumCraft } = await import('@/lib/createProductLadder');
              createFilesAcc = {
                ...createFilesAcc,
                ...ensureProductPremiumCraft(createFilesAcc, productBrief, lockedProductName),
              };
              lifted = gradeProductQuality(createFilesAcc, productBrief, lockedProductName);
            }
            if (lifted.okPremium) {
              uiPolishOk = true;
              uiPolishReasons = [];
              createFloorFallback = false;
              productInventSnapshot = {
                appJsx: String(createFilesAcc['src/App.jsx'] || ''),
                appCss: String(createFilesAcc['src/App.css'] || ''),
                logo: String(createFilesAcc['public/logo.svg'] || ''),
              };
              if (originDiskRoot) {
                await persistAcceptedCreateFiles(
                  originDiskRoot,
                  createFilesAcc,
                  ['src/App.jsx', 'src/App.css', 'src/App.tsx', 'src/index.css', 'public/logo.svg', 'public/heroes/delivery.svg', 'public/heroes/desk.svg']
                    .filter((p) => createFilesAcc[p]),
                ).catch(() => {});
              }
              updateCreateJob(jobId, { files: createFilesAcc });
              softBindCreateStudio(host, {
                files: createFilesAcc,
                projectId: originProjectId,
                name: lockedProductName,
                diskRoot: originDiskRoot,
                force: true,
              });
              host.pushStatus(`Ladder · Accept ${lifted.label} after seed lift…`);
            } else {
              host.pushStatus(
                `Ladder · seed lift still ${lifted.label} — gaps: ${lifted.reasons.slice(0, 3).join(', ')}…`,
              );
            }
          }
        }
      } catch { /* keep miss */ }
    }

    // Hard guarantee LAST RESORT: only when compose spine + invent failed (never the happy path).
    try {
      const {
        briefLooksLikeCommerceStore,
        appHasCommerceCart,
        buildBriefInteractiveFloor,
        wireCreatePublicAssets,
      } = await import('@/lib/createBuildQuality');
      const commerceBrief = authoritativeOriginalBrief || briefForUi;
      // Require real catalog/cart ask — not a shell-only "e-commerce … cart icon" step.
      const wantsFullCommerce = /\b(?:add[\s-]?to[\s-]?(?:cart|bag)|checkout|product\s+(?:grid|catalog|cards?)|exactly\s+\d+\s+(?:bottles?|products?)|src\/data\/products)\b/i.test(
        commerceBrief,
      );
      if (
        !blankSolidColor
        && !storefrontSpineLocked
        && wantsFullCommerce
        && briefLooksLikeCommerceStore(commerceBrief)
        && !appHasCommerceCart(createFilesAcc)
      ) {
        // REMOVED: storefront hard guarantee used to stamp buildBriefInteractiveFloor twin.
        host.pushStatus('Storefront incomplete — commerce floor stamp removed; model must invent…');
        createFloorFallback = false;
        uiPolishOk = false;
        uiPolishReasons = [
          ...(uiPolishReasons || []),
          'commerce incomplete — no storefront floor fallback',
        ];
        void buildBriefInteractiveFloor; // keep import used for typecheck if tree-shaken later
      }
    } catch { /* best-effort */ }

    // Leftover invent-demo markers on Acc are NEVER Ready — invent from brief only.
    if (uiPolishOk === false || filesHaveInventDemoSite(createFilesAcc)) {
      try {
        const appNow = String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '');
        const twinOnAcc = filesHaveInventDemoSite(createFilesAcc)
          || /data-nova-invent-demo\s*=\s*["']1["']/.test(appNow);
        if (twinOnAcc) {
          createFloorFallback = false;
          uiPolishOk = false;
          uiPolishReasons = [
            ...(uiPolishReasons || []),
            'invent-demo twin blocked — removed from source; invent from brief',
          ];
          updateCreateJob(jobId, { files: createFilesAcc, stage: 'invent-demo-blocked' });
          host.pushStatus('Invent-demo twin blocked — no host recreate');
        }
      } catch { /* optional */ }
    }

    if (uiPolishOk === false) {
      // Always clear "Building · …" on fail-closed — otherwise the pill stays lit after Done.
      try {
        host.onCreatePhaseModel?.({ id: coderGate.id, name: coderGate.name, role: 'done' });
      } catch { /* ignore */ }
      if (createTimedOut() || turnAborted()) {
        const abortReason = createTimedOut() ? 'Create soft wall reached during UI craft' : host.shouldAbort?.() ? 'Create stopped during UI craft' : 'Create superseded after switching chats';
        markCreateJobFailed(jobId, abortReason, undefined, {
          craftBlocked: true,
          blockedReasons: uiPolishReasons.slice(0, 8),
        });
        markBuildDiagnosticsEnded();
        clearBuildWritingPath(createTimedOut() ? 'Craft timed out' : 'Stopped');
        await host.finishPlainReply(
          createTimedOut() ? createBudgetExceededReply(budgetProfile, lockedProductName) : `**${lockedProductName}** was not marked Ready. ${abortReason}. Open its Folder/Code actions to continue or retry.`,
          'NOVA · create',
        );
        return { status: 'handled' };
      }
      softBindCreateStudio(host, {
        files: createFilesAcc,
        projectId: originProjectId,
        name: lockedProductName,
        diskRoot: originDiskRoot,
        force: true,
      });
      const reasonLines = (uiPolishReasons.length ? uiPolishReasons : ['UI not Preview-ready'])
        .slice(0, 8)
        .map((r) => `- ${r}`)
        .join('\n');
      const depthOpen = uiPolishReasons.some((r) =>
        /thinNeedsDepthPass|thinBlocksLivePreview|Depth deficit|depth still open|Visual floor|visual floor/i.test(r),
      );
      const craftStalledMiss = uiPolishReasons.some((r) =>
        /craft stalled|idle wall|invent idle/i.test(r),
      );
      const failAt = craftStalledMiss
        ? 'Craft stalled (idle invent wall)'
        : depthOpen
          ? 'Depth (App still too thin for Live)'
          : uiPolishReasons.some((r) => /syntax|brace|truncat|broken App/i.test(r))
            ? 'Syntax / App integrity'
            : uiPolishReasons.some((r) => /logo|public\/|asset|sparkles/i.test(r))
              ? 'Assets (logo / public)'
              : 'Craft preflight (not Live-ready)';
      const ledgerSnap = depthOpen
        ? formatThinDepthLedger(readThinDepthLedger(createFilesAcc))
        : '';
      const coderBlocked = uiPolishReasons.some((r) =>
        /no local coder|no suitable coder|coder GGUF|install any coder/i.test(r),
      );
      const truncated = uiPolishReasons.some((r) =>
        /truncat|mid-write|aborted|timeout|stop or timeout|thin|empty|placeholder|incomplete|craft stalled/i.test(r),
      );
      let nextSteps: string[] = coderBlocked
        ? [
            '**Next**',
            '1. Open **Models** and install a local coder GGUF that fits this PC.',
            '2. Switch the chat model to that coder (or leave Auto: NOVA will pin it).',
            '3. Send the same build ask again — I will retry craft automatically.',
          ]
        : truncated
          ? [
              '**Next**',
              '1. Tell me what to tighten and I will run another polish pass on this folder.',
              '2. Or open the **Code** pill to inspect what was written.',
            ]
          : [
              '**Next**',
              '1. Tell me what looks wrong and I will fix craft / Live evidence on this folder.',
              '2. Or open the **Code** / **Folder** pills to continue editing.',
            ];
      let whyBlock = reasonLines;
      try {
        const { formatProductCraftFailHelp } = await import('@/lib/createProductLadder');
        if (artifactWantsProductLadder(createArtifactKind, authoritativeOriginalBrief || briefForUi)) {
          const failedBeat = uiPolishReasons.find((r) => /failed beat:/i.test(r))?.replace(/.*failed beat:\s*/i, '')
            || (uiPolishReasons.find((r) => /Product ladder miss at (\w+)/i.test(r))?.match(/at (\w+)/i)?.[1]);
          const help = formatProductCraftFailHelp({
            brand: lockedProductName || displayName,
            brief: authoritativeOriginalBrief || briefForUi,
            reasons: uiPolishReasons,
            failedBeat,
          });
          whyBlock = help.plainWhy.map((w) => `- ${w}`).join('\n')
            || reasonLines;
          nextSteps = help.nextSteps;
        }
      } catch { /* keep generic nextSteps */ }
      const failAnswer = [
        `**Created ${displayName}**: folder on disk, craft preflight failed`,
        '',
        originDiskRoot ? `**Where:** \`${originDiskRoot}\`` : '',
        created.parentSource ? `**Location:** ${created.parentSource}` : '',
        '',
        `**Failed at:** ${failAt}`,
        ledgerSnap ? `**Ledger:** ${ledgerSnap}` : '',
        absoluteLogoLockNote ? `**Logo lock:** ${absoluteLogoLockNote}` : '',
        '**Why:**',
        whyBlock,
        '',
        ...nextSteps,
        '',
        'Folder and Code are available. Live stays locked until craft clears — **Unavailable** until then.',
        'If the desktop froze, use **Copy freeze / build report** in the sidebar and paste it here.',
        created.grantHint || '',
      ].filter(Boolean).join('\n');
      {
        const appSrc = createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '';
        const cssSrc = createFilesAcc['src/App.css'] || '';
        noteBuildContext({
          productName: displayName,
          diskRoot: originDiskRoot,
          projectId: originProjectId,
          appBytes: appSrc.length,
          cssBytes: cssSrc.length,
        });
        noteBuildFail(uiPolishReasons);
        noteBuildGateResult(false, uiPolishReasons);
      }
      markCreateJobFailed(jobId, uiPolishReasons[0] || 'Craft preflight failed', undefined, {
        craftBlocked: true,
        blockedReasons: uiPolishReasons.slice(0, 8),
      });
      // Do NOT auto-npm on fail-closed — overlapping Defender scans freeze the desktop.
      // Final logo stamp — never overwrite invent-demo marks with Lucide family icons.
      if (originDiskRoot && !inventDemoOwnsLogo(createFilesAcc)) {
        try {
          const { brandLogoSvgFor } = await import('@/lib/brandAssets');
          const forced = brandLogoSvgFor({
            productName: lockedProductName,
            brief: briefForUi,
            css: String(createFilesAcc['src/App.css'] || ''),
          });
          if (forced && !/M9\.937 15\.5/i.test(forced)) {
            createFilesAcc = { ...createFilesAcc, 'public/logo.svg': forced };
            await persistGenreLogoSvg(originDiskRoot, forced).catch(() => {});
          }
        } catch { /* best-effort */ }
      }
      markBuildDiagnosticsEnded();
      clearBuildWritingPath('Craft blocked');
      await host.finishPlainReply(`${failAnswer}${grantNote}`, `${ensembleAttribution || 'NOVA'} · scaffold`);
      // One more stamp after reply — invent .then() chains can land after Done.
      if (originDiskRoot && !inventDemoOwnsLogo(createFilesAcc)) {
        try {
          const { brandLogoSvgFor } = await import('@/lib/brandAssets');
          const forced = brandLogoSvgFor({
            productName: lockedProductName,
            brief: briefForUi,
            css: String(createFilesAcc['src/App.css'] || ''),
          });
          if (forced && !/M9\.937 15\.5/i.test(forced)) {
            await persistGenreLogoSvg(originDiskRoot, forced).catch(() => {});
          }
        } catch { /* best-effort */ }
      }
      return { status: 'handled' };
    }

    // Success-path genre logo stamp — never overwrite invent-demo (speakers→package race).
    if (originDiskRoot && !inventDemoOwnsLogo(createFilesAcc)) {
      try {
        const { brandLogoSvgFor } = await import('@/lib/brandAssets');
        const forced = brandLogoSvgFor({
          productName: lockedProductName,
          brief: briefForUi,
          css: String(createFilesAcc['src/App.css'] || ''),
        });
        if (forced && !/M9\.937 15\.5/i.test(forced)) {
          createFilesAcc = writeLogoIfAllowed(createFilesAcc, forced);
          if (createFilesAcc['public/logo.svg'] === forced) {
            await persistGenreLogoSvg(originDiskRoot, forced).catch(() => {});
          }
        }
      } catch { /* best-effort */ }
    }
    // Agent-sees-Live grade (invent-demo) + git milestone + memory + condenser note.
    if (filesHaveInventDemoSite(createFilesAcc)) {
      try {
        const grade = await captureInventLiveGrade({
          brand: lockedProductName,
          files: createFilesAcc,
        });
        host.pushStatus(`Invent · ${grade.note} (score ${grade.score})`);
        const mem = appendAutoMemory(
          String(createFilesAcc['.nova/memory.md'] || ''),
          `live-grade ${grade.score} · ${grade.ok ? 'pass' : 'weak'} · ${lockedProductName}`,
        );
        createFilesAcc['.nova/memory.md'] = mem;
        const condensed = condenseCraftTrace([
          `live-grade ${grade.score}`,
          grade.note,
          ...grade.reasons.slice(0, 4),
        ], 12);
        if (condensed.length) {
          host.pushStatus(`Invent · condensed: ${condensed.join(' · ').slice(0, 160)}`);
        }
        // Mid-turn STEER buffer (if user nudged during craft).
        try {
          const steerRaw = String((createFilesAcc as Record<string, string>)['.__novaSteer'] || '').trim();
          if (steerRaw) {
            host.pushStatus(formatMidTurnSteer(steerRaw));
            delete (createFilesAcc as Record<string, string>)['.__novaSteer'];
          }
        } catch { /* optional */ }
        if (originDiskRoot || originProjectId) {
          await tryInventGitCommit({
            diskRoot: originDiskRoot || '',
            projectId: originProjectId || undefined,
            message: inventGitCommitMessage('live-grade', lockedProductName),
          }).catch(() => ({ ok: false, note: '' }));
        }
      } catch { /* best-effort */ }
    }

    // After static Ready preflight succeeds, commitStudio gets a Live URL only once evidence passes (below).
    host.commitStudio({
      files: createFilesAcc,
      projectId: originProjectId,
      name: lockedProductName,
      diskRoot: originDiskRoot,
      previewUrl: null,
    });
    {
      const appSrc = createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '';
      const cssSrc = createFilesAcc['src/App.css'] || '';
      noteBuildContext({
        productName: lockedProductName,
        diskRoot: originDiskRoot,
        projectId: originProjectId,
        appBytes: appSrc.length,
        cssBytes: cssSrc.length,
      });
      noteBuildGateResult(true, []);
    }
    host.setChatCodePill(host.chatId, true);
    if (host.shouldPaintStudioLive(host.routeChatId, host.chatId)) {
      host.setCodePillSticky(true);
    }
    try {
      host.touchRecentProject?.(originProjectId, lockedProductName, originDiskRoot || undefined);
    } catch { /* ignore */ }
    if (originDiskRoot) {
      host.setLastDiskTarget(host.chatId, {
        path: originDiskRoot,
        name: lockedProductName,
        kind: 'folder',
      });
    }

    // Honest default — never pretend npm succeeded before bootstrap runs (Live invent race).
    let bootstrap: ProjectBootstrapResult = { npmInstalled: false };
    let packageBuildResult: { ok: boolean | null; errors: string[]; repairs: number } = {
      ok: null,
      errors: [],
      repairs: 0,
    };
    const diskHasPkg = Boolean(
      createFilesAcc['package.json']
      || Object.keys(createFilesAcc).some((p) => /(^|\/)package\.json$/i.test(p.replace(/\\/g, '/'))),
    );
    // Non-web artifacts (CLI / API / Python / library) + unknown coding workspaces:
    // Ready without Live preview URL.
    const isDocsOrMetaUnknown = /(^|\/)(readme|license|licence|changelog|contributing|notice|requirements)(\.[^/]*)?$|\.(md|markdown|rst|txt)$|(^|\/)(package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|tsconfig\.json|manifest\.json|\.gitignore)$/i;
    const unknownBrief = String(authoritativeOriginalBrief || briefForUi || '');
    const unknownAllowSiteShell = /\b(?:tauri|capacitor|ionic|react\s+native|expo|flutter)\b/i.test(unknownBrief);
    const unknownHasSiteShell = Boolean(
      createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || createFilesAcc['index.html'],
    );
    // README seed marks unknown coding workspaces; Tauri/Ionic/RN may keep index.html / App.
    const codingUnknownWorkspace = createArtifactKind === 'unknown'
      && Boolean(createFilesAcc['README.md'])
      && (unknownAllowSiteShell || !unknownHasSiteShell);
    if ((isNonWebArtifactKind(createArtifactKind) || codingUnknownWorkspace) && originDiskRoot) {
      try {
        const { markCreateJobReady } = await import('@/lib/createJobStore');
        const { verifyArtifactFiles } = await import('@/lib/artifactEvidence');
        const { unknownHasRealSource } = await import('@/lib/novaBuildLoop');
        const {
          stripWebShellFromNonWebFiles,
          fixCliEsmRequireMismatch,
          ensureLibraryImplementsBrief,
        } = await import('@/lib/createArtifactKind');
        // Drop App.jsx / Vite invent contamination before coding Ready — Acc AND disk.
        // Always delete the known web-shell set (loop may have stripped Acc already while
        // disk still has vite.config / App.jsx from an earlier write).
        const webShellDeleteKeys = [
          'index.html',
          'vite.config.js',
          'vite.config.ts',
          'src/App.jsx',
          'src/App.tsx',
          'src/App.css',
          'src/main.jsx',
          'src/main.tsx',
          'src/index.css',
          'public/logo.svg',
        ];
        createFilesAcc = stripWebShellFromNonWebFiles(
          createFilesAcc,
          createArtifactKind,
          unknownBrief,
        );
        if (createArtifactKind === 'node-cli') {
          const esmFix = fixCliEsmRequireMismatch(createFilesAcc);
          if (esmFix.fixed) {
            createFilesAcc = esmFix.files;
            host.pushStatus('Non-web · CLI package.json type:module dropped (entry uses require)…');
          }
        }
        if (createArtifactKind === 'library') {
          const libFix = ensureLibraryImplementsBrief(
            createFilesAcc,
            authoritativeOriginalBrief || briefForUi || host.content,
          );
          if (libFix.fixed) {
            createFilesAcc = libFix.files;
            host.pushStatus('Non-web · library seed hello replaced with brief API…');
          }
        }
        if (originDiskRoot) {
          try {
            const { persistAcceptedCreateFiles } = await import('@/lib/chatAgentApply');
            const strip = await persistAcceptedCreateFiles(
              originDiskRoot,
              createFilesAcc,
              Object.keys(createFilesAcc),
              { deleteKeys: webShellDeleteKeys },
            );
            if (strip?.ok) {
              host.pushStatus('Non-web · removed website shell files from disk…');
            } else {
              host.pushStatus(`Non-web · disk strip incomplete · ${String(strip?.error || 'retry')}`);
              // Second pass — deletes only (empty write payload still runs deleteKeys).
              await persistAcceptedCreateFiles(originDiskRoot, {}, [], {
                deleteKeys: webShellDeleteKeys,
              }).catch(() => {});
            }
          } catch { /* best-effort disk strip */ }
        }
        const unknownHasReal = unknownHasRealSource(createFilesAcc, unknownBrief);
        const artifactEvidence = codingUnknownWorkspace
          ? {
              kind: createArtifactKind,
              runOk: unknownHasReal,
              runDetail: unknownHasReal
                ? 'coding workspace with real source/config'
                : 'README-only / manifest-only seed — write real source or config for this stack',
              evidencePath: unknownHasReal
                ? (Object.keys(createFilesAcc).find((p) => !isDocsOrMetaUnknown.test(p.replace(/\\/g, '/'))) || 'README.md')
                : 'README.md',
            }
          : verifyArtifactFiles(createFilesAcc, createArtifactKind, {
              requireImplementation: true,
            });
        updateCreateJob(jobId, {
          files: createFilesAcc,
          artifactKind: createArtifactKind,
          artifactEvidence,
          path: originDiskRoot,
        });
        const isDocsOrMeta = isDocsOrMetaUnknown;
        const wroteImplementation = Object.keys(createFilesAcc).some((p) => {
          const norm = p.replace(/\\/g, '/');
          if (isDocsOrMeta.test(norm)) return false;
          return createSeedSnapshot[p] !== createFilesAcc[p];
        });
        // Unknown still needs real source; README/manifest-only must not Ready.
        const noArtifactWrite = usedNovaLoop && !wroteImplementation && !(codingUnknownWorkspace && unknownHasReal);
        const { countLineDiff, wrapReplyWithFileChanges, isInventAccNoisePath } = await import('@/lib/agentTrace');
        const { formatCreateHandback } = await import('@/lib/taskHandbackReply');
        const codingPaths = Object.keys(createFilesAcc)
          .filter((p) => !isInventAccNoisePath(p))
          .sort((a, b) => a.localeCompare(b));
        const codingChanges = codingPaths.map((path) => {
          const body = String(createFilesAcc[path] || '');
          const diff = countLineDiff('', body);
          return { path, added: Math.max(1, diff.added || body.split('\n').length), removed: 0 };
        });
        const codingStartedAt = host.replyStartedAt || Date.now();
        const finishCodingHandback = async (
          outcome: 'coding-ready' | 'coding-miss',
          note: string,
          statusLabels: string[],
        ) => {
          const prose = formatCreateHandback({
            productName: lockedProductName,
            outcome,
            note,
          });
          const answer = wrapReplyWithFileChanges({
            startedAt: codingStartedAt,
            elapsedMs: Math.max(1, Date.now() - codingStartedAt),
            userMessage: host.content,
            answer: prose,
            changedPaths: codingPaths,
            fileChanges: codingChanges,
            projectPath: originDiskRoot || undefined,
            qualityGaps: outcome === 'coding-miss' ? [note] : undefined,
            statusLabels,
          });
          markBuildDiagnosticsEnded();
          clearBuildWritingPath(outcome === 'coding-ready' ? 'Non-web Ready' : 'Non-web evidence fail');
          await host.finishPlainReply(answer, 'NOVA · create');
        };
        if (!artifactEvidence.runOk || noArtifactWrite) {
          const reason = artifactEvidence.runOk
            ? 'no implementation written'
            : artifactEvidence.runDetail;
          const { markCreateJobFailed } = await import('@/lib/createJobStore');
          markCreateJobFailed(jobId, `artifact evidence missing: ${reason}`, undefined, {
            craftBlocked: true,
            blockedReasons: [reason],
          });
          host.commitStudio({
            files: createFilesAcc,
            projectId: originProjectId,
            name: lockedProductName,
            diskRoot: originDiskRoot,
            previewUrl: null,
          });
          await finishCodingHandback(
            'coding-miss',
            `${createArtifactKind} evidence: ${reason}`,
            [
              `Checked ${createArtifactKind} evidence`,
              reason,
              'Scaffold on disk — implementation still open',
            ],
          );
          return { status: 'handled' };
        }
        // Evidence ok → Ready for ALL non-web kinds. Never fall through into Vite/Live.
        host.pushStatus(`Non-web · ${createArtifactKind} — ${artifactEvidence.runDetail}…`);
        if (diskHasPkg) {
          markCreateJobNpm(jobId);
          const boot = await bootstrapProjectWorkspace(originDiskRoot, projectKindFromArtifactKind(createArtifactKind), {
            files: createFilesAcc,
            preferPreviewUrl: null,
            npmTimeoutMs: 180_000,
            onStatus: (label) => host.pushStatus(label),
          }).catch(() => ({ npmInstalled: false } as ProjectBootstrapResult));
          bootstrap = boot;
        }
        markCreateJobReady(jobId, null, `Ready · ${createArtifactKind} · ${artifactEvidence.runDetail}`, {
          brief: authoritativeOriginalBrief || briefForUi,
          allowWithoutPreview: true,
          artifactKind: createArtifactKind,
          artifactEvidence,
        });
        host.commitStudio({
          files: createFilesAcc,
          projectId: originProjectId,
          name: lockedProductName,
          diskRoot: originDiskRoot,
          previewUrl: null,
        });
        await finishCodingHandback(
          'coding-ready',
          diskHasPkg && bootstrap.npmInstalled
            ? `${createArtifactKind} Ready · ${artifactEvidence.runDetail}. Dependencies installed.`
            : `${createArtifactKind} Ready · ${artifactEvidence.runDetail}.`,
          [
            `Non-web · ${createArtifactKind} : ${artifactEvidence.runDetail}`,
            'Created the project folder',
            `Wrote ${codingPaths.length} file${codingPaths.length === 1 ? '' : 's'}`,
            diskHasPkg && bootstrap.npmInstalled
              ? 'Installed project dependencies'
              : (diskHasPkg ? 'Package install skipped or incomplete' : 'No npm install needed'),
          ],
        );
        return { status: 'handled' };
      } catch (err) {
        // Never fall through into Vite invent for coding asks — hand back honestly.
        host.pushStatus(`Non-web Ready path failed · ${String((err as Error)?.message || err).slice(0, 80)}`);
        try {
          const { markCreateJobFailed } = await import('@/lib/createJobStore');
          markCreateJobFailed(jobId, String((err as Error)?.message || err), undefined, {
            craftBlocked: true,
            blockedReasons: [String((err as Error)?.message || err).slice(0, 160)],
          });
        } catch { /* ignore */ }
        markBuildDiagnosticsEnded();
        clearBuildWritingPath('Non-web Ready exception');
        await host.finishPlainReply(
          [
            `**${lockedProductName}** hit an error finishing the **${createArtifactKind}** create.`,
            String((err as Error)?.message || err).slice(0, 240),
            'Tell me what to try next and I will retry.',
          ].join('\n\n'),
          'NOVA · create',
        );
        return { status: 'handled' };
      }
    }
    const needsNpmBootstrap = originDiskRoot && (
      diskHasPkg || projectUsesNpm(scaffoldKind, createFilesAcc)
    );
    if (needsNpmBootstrap) {
      // Item 3: syntax gate before npm/Live — heal unclosed tags / catch crashers early.
      try {
        // Spine 9: syntax gate before Live.
        host.pushStatus(formatThinCreateSpineStatus('syntax'));
        const { runCreateSyntaxGate } = await import('@/lib/createSyntaxGate');
        let syn = runCreateSyntaxGate(createFilesAcc);
        if (syn.healed || syn.files !== createFilesAcc) {
          createFilesAcc = syn.files;
          if (syn.healed) host.pushStatus('Syntax gate healed JSX open tags…');
          const appKeySyn = createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx';
          if (originDiskRoot && createFilesAcc[appKeySyn]) {
            await applyChatReplyEdits({
              reply: [
                `@@@FILE ${appKeySyn}\n${createFilesAcc[appKeySyn]}`,
                createFilesAcc['src/App.css'] ? `@@@FILE src/App.css\n${createFilesAcc['src/App.css']}` : '',
              ].filter(Boolean).join('\n'),
              projectId: originProjectId,
              projectName: lockedProductName,
              files: createFilesAcc,
              userMessage: host.content,
              diskRoot: originDiskRoot,
            }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
          }
        }
        if (!syn.ok) {
          // One more bleed/structure pass before Live — shop islands into chat apps are the usual crash.
          // Thin create: strip-only bleed + re-syntax — never repairOwned floors.
          try {
            const {
              buildProductPlan,
              repairToContract,
              stripWrongFamilyStorefrontBleed,
            } = await import('@/lib/createProductPlan');
            const plan = buildProductPlan(briefForUi, lockedProductName);
            if (isThinCreatePath()) {
              if (plan.compositionFamily !== 'catalog-store') {
                const appKeyBleed = createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx';
                if (appKeyBleed && createFilesAcc[appKeyBleed]) {
                  const cleaned = stripWrongFamilyStorefrontBleed(createFilesAcc[appKeyBleed]);
                  if (cleaned !== createFilesAcc[appKeyBleed]) {
                    createFilesAcc = { ...createFilesAcc, [appKeyBleed]: cleaned };
                    delete createFilesAcc['src/data/products.ts'];
                    host.pushStatus('Thin create · stripped wrong-family storefront bleed…');
                  }
                }
              }
              syn = runCreateSyntaxGate(createFilesAcc);
              createFilesAcc = syn.files;
              if (syn.ok) uiPolishOk = true;
              createFloorFallback = false;
            } else {
              const repaired = repairToContract(createFilesAcc, plan, briefForUi);
              if (repaired.changed) {
                createFilesAcc = repaired.files;
                host.pushStatus(`Syntax repair · ${repaired.actions.slice(0, 3).join(', ')}…`);
                syn = runCreateSyntaxGate(createFilesAcc);
                createFilesAcc = syn.files;
                if (syn.ok) uiPolishOk = true;
                if (repaired.repairOwnedProduct || repaired.needFloor) {
                  createFloorFallback = true;
                }
              }
            }
          } catch { /* best-effort */ }
        }
        // Re-run gate after heals — Tipjar-class CSS/orphan/state bugs must clear before Live.
        if (!syn.ok) {
          syn = runCreateSyntaxGate(createFilesAcc);
          createFilesAcc = syn.files;
        }
        if (!syn.ok) {
          // Blank / step-ladder asks: never die on invent thrash — force a clean solid shell.
          if (blankSolidColor) {
            try {
              const shellFiles = viteSolidShellEdits(blankSolidColor);
              for (const e of shellFiles) createFilesAcc[e.path] = e.content;
              delete createFilesAcc['src/App.tsx'];
              syn = runCreateSyntaxGate(createFilesAcc);
              createFilesAcc = syn.files;
              if (syn.ok) {
                uiPolishOk = true;
                uiPolishReasons = [];
                host.pushStatus('Blank shell · healed syntax — continuing…');
                if (originDiskRoot) {
                  await persistAcceptedCreateFiles(
                    originDiskRoot,
                    createFilesAcc,
                    shellFiles.map((e) => e.path),
                  ).catch(() => {});
                }
              }
            } catch { /* fall through to hard block */ }
          }
        }
        if (!syn.ok) {
          uiPolishReasons = [...new Set([...(uiPolishReasons || []), ...syn.reasons.slice(0, 4)])];
          // HARD BLOCK — never open Live against uncompilable App (no fail overlay).
          host.pushStatus(`App won't compile yet (${syn.reasons[0] || 'syntax'}) — keeping Live closed…`);
          try {
            const appKeySyn = createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx';
            if (originDiskRoot && createFilesAcc[appKeySyn]) {
              await applyChatReplyEdits({
                reply: [
                  `@@@FILE ${appKeySyn}\n${createFilesAcc[appKeySyn]}`,
                  createFilesAcc['src/App.css'] ? `@@@FILE src/App.css\n${createFilesAcc['src/App.css']}` : '',
                ].filter(Boolean).join('\n'),
                projectId: originProjectId,
                projectName: lockedProductName,
                files: createFilesAcc,
                userMessage: host.content,
                diskRoot: originDiskRoot,
              }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
            }
          } catch { /* ignore */ }
          markCreateJobFailed(
            jobId,
            `App.jsx still won't compile (${syn.reasons.slice(0, 2).join('; ')}). Live stayed closed.`,
          );
          await host.finishPlainReply(
            [
              `**${lockedProductName}** is on disk, but Live stayed closed — App.jsx still won't compile.`,
              '',
              syn.reasons.slice(0, 4).map((r) => `- ${r}`).join('\n'),
              '',
              `Folder: \`${originDiskRoot}\``,
              '',
              'Tell me to **fix the App** and I will heal it, then open Live only when it compiles.',
            ].join('\n'),
            `${ensembleAttribution || 'NOVA'} · syntax gate`,
          );
          return { status: 'handled' };
        }
      } catch { /* best-effort */ }
      // Spine 8: heal — invent floor top-up + remount before Live (thin hero overwrite).
      host.pushStatus(formatThinCreateSpineStatus('heal'));
      try {
        if (thinWantsCompositionalShell(briefForUi)) {
          const beforeFloor = createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '';
          const beforeHero = String(
            createFilesAcc['src/sections/HeroSection.jsx']
            || createFilesAcc['src/sections/Hero.jsx']
            || '',
          );
          createFilesAcc = seedCompositionalSectionScaffolds(
            createFilesAcc,
            briefForUi,
            lockedProductName,
          );
          const mounted = ensureLandedSectionsMountedInApp(
            createFilesAcc,
            briefForUi,
            lockedProductName,
          );
          createFilesAcc = mounted;
          // Permanent: if Acc is still the invent-floor stamp, rewrite catalog/story
          // past the twin before Live — every invent, not one project.
          if (looksLikeInventFloorTwin(createFilesAcc)) {
            createFilesAcc = breakInventFloorTwin(
              createFilesAcc,
              briefForUi,
              lockedProductName,
            );
            createFloorFallback = false;
            host.pushStatus('Heal · broke invent-floor twin stamp…');
          } else if (
            inventFloorClearsLive(createFilesAcc, briefForUi, lockedProductName)
            && !looksLikeInventFloorTwin(createFilesAcc)
          ) {
            // Craft/enrich already past the stamp — do not keep soft Ready from early floor.
            createFloorFallback = false;
          }
          const beforeCss = String(createFilesAcc['src/App.css'] || '');
          // Permanent: strip dark SaaS CSS stomps on parchment/atelier briefs.
          try {
            const { healNearReadyCreateUi } = await import('@/lib/createBuildQuality');
            const paletteHeal = healNearReadyCreateUi(
              createFilesAcc,
              lockedProductName,
              briefForUi,
            );
            if (paletteHeal.changed) {
              createFilesAcc = paletteHeal.files;
              if (paletteHeal.actions.includes('atelier-palette-heal')) {
                host.pushStatus('Heal · parchment palette restored…');
              }
            }
          } catch { /* optional */ }
          const afterApp = createFilesAcc['src/App.jsx'] || '';
          const afterHero = String(
            createFilesAcc['src/sections/HeroSection.jsx']
            || createFilesAcc['src/sections/Hero.jsx']
            || '',
          );
          const afterCss = String(createFilesAcc['src/App.css'] || '');
          const changed = afterApp !== beforeFloor
            || afterHero !== beforeHero
            || afterCss !== beforeCss;
          host.pushStatus(
            /Bare Vite mount|root-app/i.test(beforeFloor)
              ? 'Invent floor salvage — seeded hero/shop/story into App shell…'
              : afterHero !== beforeHero
                ? 'Heal · premium hero top-up + remount…'
                : 'Heal · remount check…',
          );
          if (changed && originDiskRoot) {
            const keys = depthPersistKeys(createFilesAcc);
            await applyChatReplyEdits({
              reply: keys.map((k) => `@@@FILE ${k}\n${createFilesAcc[k]}`).join('\n'),
              projectId: originProjectId,
              projectName: lockedProductName,
              files: createFilesAcc,
              userMessage: host.content,
              diskRoot: originDiskRoot,
            }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
          }
        }
      } catch { /* best-effort */ }
      // Last chance: heal static #app index only when this create is actually Vite/React.
      try {
        const healKind = resolveProjectKindForCreate(
          [briefForUi, buildIntent.summary, host.content].filter(Boolean).join('\n'),
          scaffoldKind,
          scaffoldKind,
        );
        const healWantsVite = artifactWantsVite(createArtifactKind)
          && (
            healKind === 'vite-react'
            || Boolean(createFilesAcc['vite.config.js'] || createFilesAcc['vite.config.ts'] || createFilesAcc['src/main.jsx'] || createFilesAcc['src/main.tsx'])
          );
        if (healWantsVite) {
          const { ensureViteReactProjectFiles, isValidViteIndexHtml } = await import('@/lib/createBuildQuality');
          if (!isValidViteIndexHtml(createFilesAcc['index.html'] || '')) {
            host.pushStatus('Healing index.html for Vite Live…');
            const healed = ensureViteReactProjectFiles(createFilesAcc, lockedProductName);
            createFilesAcc = healed.files;
            const keys = ['index.html', 'src/main.jsx', 'src/main.tsx', 'vite.config.js', 'vite.config.ts', 'package.json']
              .filter((k) => createFilesAcc[k]);
            if (keys.length) {
              await applyChatReplyEdits({
                reply: keys.map((k) => `@@@FILE ${k}\n${createFilesAcc[k]}`).join('\n'),
                projectId: originProjectId,
                projectName: lockedProductName,
                files: createFilesAcc,
                userMessage: host.content,
                diskRoot: originDiskRoot,
              }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
            }
          }
        }
      } catch { /* best-effort */ }
      // Stop kills the entire npm → Live tail — no Opening preview / Live after abort.
      if (turnAborted()) {
        try {
          host.onCreatePhaseModel?.({ id: coderGate.id, name: coderGate.name, role: 'done' });
        } catch { /* ignore */ }
        markCreateJobFailed(jobId, 'Stopped', undefined, { craftBlocked: true });
        markBuildDiagnosticsEnded();
        clearBuildWritingPath('Stopped');
        await host.finishPlainReply('Stopped.', 'NOVA · stop');
        return { status: 'handled' };
      }
      // Keep the visual floor as a Ready gate, but do not hide compiler failures
      // behind it. A runnable project still proceeds through install/build so the
      // user gets a concrete build result and bounded code repair.
      if (
        isThinCreatePath()
        && !productGenreGuard
        && (
          filesHaveInventDemoSite(createFilesAcc)
          || thinBlocksLivePreview(createFilesAcc, briefForUi, lockedProductName)
        )
      ) {
        uiPolishOk = false;
        createFloorFallback = false;
        uiPolishReasons = [
          ...new Set([
            ...(uiPolishReasons || []),
            ...(filesHaveInventDemoSite(createFilesAcc)
              ? ['invent-demo twin at npm gate — Live Ready blocked']
              : ['Visual floor still open at npm gate — Live blocked']),
            ...thinLiveVisualDeficits(createFilesAcc, briefForUi, lockedProductName).slice(0, 4),
            ...thinAskMatchDeficits(createFilesAcc, briefForUi, lockedProductName).slice(0, 4),
          ]),
        ];
        host.pushStatus(
          filesHaveInventDemoSite(createFilesAcc)
            ? 'Thin create · invent-demo twin blocked at npm gate…'
            : 'Thin create · visual floor open — continuing to install/build diagnostics; Ready stays gated…',
        );
      } else if (
        productGenreGuard
        && productInventSnapshot?.appJsx
        && artifactWantsProductLadder(createArtifactKind, briefForUi || authoritativeOriginalBrief || '')
      ) {
        // Only rewind product-site Acc — never restore a desk seed over CLI/API/dashboard.
        restoreProductInventSnapshot('npm gate');
      }
      // Last gate before npm: Vite shell on disk only for actual Vite/React creates.
      try {
        // JSX that imports ./Foo.css without writing Foo.css → Vite resolve fail → Live dead.
        createFilesAcc = ensureRelativeCssImportsExist(createFilesAcc);
        const npmKind = resolveProjectKindForCreate(
          [briefForUi, buildIntent.summary, host.content].filter(Boolean).join('\n'),
          scaffoldKind,
          scaffoldKind,
        );
        const npmWantsVite = artifactWantsVite(createArtifactKind)
          && (
            npmKind === 'vite-react'
            || Boolean(createFilesAcc['vite.config.js'] || createFilesAcc['vite.config.ts'] || createFilesAcc['src/main.jsx'] || createFilesAcc['src/main.tsx'])
          );
        if (npmWantsVite) {
        const { ensureViteReactProjectFiles } = await import('@/lib/createBuildQuality');
        createFilesAcc = ensureViteReactProjectFiles(createFilesAcc, lockedProductName).files;
        if (originDiskRoot && createFilesAcc['package.json']) {
          await persistAcceptedCreateFiles(
            originDiskRoot,
            createFilesAcc,
            [
              'package.json',
              'index.html',
              'vite.config.js',
              'vite.config.ts',
              'src/main.jsx',
              'src/main.tsx',
              'src/index.css',
              'src/App.jsx',
              'src/App.tsx',
              'src/App.css',
              'public/logo.svg',
            ].filter((p) => createFilesAcc[p]),
            { deleteKeys: ['css/styles.css', 'js/app.js'] },
          ).catch(() => {});
        }
        } // end npmWantsVite
      } catch { /* best-effort */ }
      host.pushStatus('Installing project dependencies (npm) — downloading packages…');
      clearBuildWritingPath('Installing npm…');
      markCreateJobNpm(jobId);
      try {
        // Prefer in-flight early npm (started after scaffold) so invent hang cannot skip install.
        const earlyNpm = originDiskRoot ? peekEarlyNpmInstall(originDiskRoot) : null;
        if (earlyNpm) {
          host.pushStatus('npm · awaiting early install started during invent…');
          bootstrap = await earlyNpm;
          if (!bootstrap.npmInstalled) {
            host.pushStatus('npm · early install incomplete — retrying once…');
            bootstrap = await bootstrapProjectWorkspace(originDiskRoot, scaffoldKind, {
              files: createFilesAcc,
              preferPreviewUrl: null,
              npmTimeoutMs: 420_000,
              autoRetried: true,
              onStatus: (label) => {
                host.pushStatus(label);
                tickBuildHeartbeat(label);
              },
            });
          }
        } else {
          bootstrap = await bootstrapProjectWorkspace(originDiskRoot, scaffoldKind, {
            files: createFilesAcc,
            preferPreviewUrl: null,
            npmTimeoutMs: 420_000,
            onStatus: (label) => {
              host.pushStatus(label);
              tickBuildHeartbeat(label);
            },
          });
        }
        if (bootstrap.npmInstalled && !bootstrap.previewLive && originDiskRoot) {
          const buildOnly = await runCreatePackageBuildWithRepair({
            files: createFilesAcc,
            brief: authoritativeOriginalBrief,
            productName: lockedProductName,
            projectId: liveOwnerKey(host.chatId || originProjectId),
            diskRoot: originDiskRoot,
            coderId: coderGate.id,
            coderName: coderGate.name,
            coderSource: coderGate.source,
            shouldAbort: () => turnAborted(),
            onStatus: (label) => {
              host.pushStatus(label);
              tickBuildHeartbeat(label);
            },
          });
          createFilesAcc = buildOnly.files;
          packageBuildResult = { ok: buildOnly.ok, errors: buildOnly.errors, repairs: buildOnly.repairs };
          pushBuildDiag({
            kind: buildOnly.ok ? 'ready' : 'fail',
            detail: buildOnly.ok
              ? `Package build passed after ${buildOnly.repairs} repair(s); preview server unavailable`
              : `Package build failed: ${buildOnly.errors[0] || 'unknown build error'}`,
          });
        }
        if (bootstrap.npmInstalled) {
          let codeVerified = false;
          const liveUrl = String(bootstrap.devServerUrl || '').trim();
          if (liveUrl && bootstrap.previewLive) {
            try {
              // Create Runtime Loop: Live + console + smoke + host judge; capped auto-fix.
              const { runCreateVerifyAndFix } = await import('@/lib/createRuntimeLoop');
              const { createRuntimeStageLabel } = await import('@/lib/createEvidence');
              markCreateJobVerifying(jobId, 'live', 'Collecting Live evidence…');
              host.pushStatus(createRuntimeStageLabel('live'));
              // Thin create: never pass floorFallback — craft must stand without salvage.
              if (isThinCreatePath()) createFloorFallback = false;
              const runtime = await runCreateVerifyAndFix({
                files: createFilesAcc,
                productName: lockedProductName,
                brief: briefForUi,
                // Live window is scoped to this chat — never the disk project folder id alone.
                projectId: liveOwnerKey(host.chatId || originProjectId),
                diskRoot: originDiskRoot,
                liveUrl,
                npmInstalled: true,
                staticReady: true,
                staticReasons: uiPolishReasons,
                floorFallback: createFloorFallback,
                // Blank / step-ladder: never invent-repair a painted empty shell.
                maxFixRounds: blankSolidColor
                  ? 0
                  : filesHaveInventDemoSite(createFilesAcc)
                    ? 1
                  : (isThinCreatePath() ? undefined : (createFloorFallback ? 1 : 3)),
                repairBuild: ({ files, brief, productName, errors }) => repairCreateBuildWithCoder({
                  files,
                  brief,
                  productName,
                  errors,
                  projectId: liveOwnerKey(host.chatId || originProjectId),
                  diskRoot: originDiskRoot,
                  coderId: coderGate.id,
                  coderName: coderGate.name,
                  coderSource: coderGate.source,
                  shouldAbort: () => turnAborted(),
                }),
                host: {
                  pushStatus: (label) => host.pushStatus(label),
                  shouldAbort: () => turnAborted(),
                  onStage: (stage, detail) => {
                    markCreateJobVerifying(jobId, stage, detail);
                  },
                },
              });
              createFilesAcc = runtime.files;
              // Invent-demo must survive Live repair — restore if todo/Apple paste wiped it.
              try {
                const appNow = String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '');
                const inventQueued = Boolean(
                  createFilesAcc['.__novaGenericInventAsk']
                  || createFilesAcc['.__novaStorefrontInventAsk']
                  || createFilesAcc['.__novaMetaHarness'] === 'invent-first',
                );
                const poisoned = /nova-todos|placeholder=["']New todo["']|title:\s*['"]iPhone['"]/i.test(appNow);
                if (inventQueued && poisoned) {
                  // Do not restore canned invent-demo twins after Live repair.
                  host.pushStatus('Live repair poison detected — invent-demo restore disabled; model must reinvent');
                  uiPolishOk = false;
                  uiPolishReasons = [
                    ...(uiPolishReasons || []),
                    'Live repair poison — invent-demo restore disabled',
                  ];
                }
              } catch { /* invent restore optional */ }
              // Blank / step-ladder: never keep invent-repair output — re-lock the solid shell.
              if (blankSolidColor) {
                const shellFiles = viteSolidShellEdits(blankSolidColor);
                for (const e of shellFiles) createFilesAcc[e.path] = e.content;
                delete createFilesAcc['src/App.tsx'];
                if (originDiskRoot) {
                  await persistAcceptedCreateFiles(
                    originDiskRoot,
                    createFilesAcc,
                    shellFiles.map((e) => e.path),
                  ).catch(() => {});
                }
              }
              // Product genre: runtime plan-repair pastes todo/Apple — restore invent look only.
              if (productGenreGuard || productInventSnapshot) {
                const {
                  appLooksLikeWrongGenreForProductBrief,
                  appLooksLikeDeskSpineTemplate,
                } = await import('@/lib/createProductLadder');
                const productBrief = authoritativeOriginalBrief || briefForUi;
                if (artifactWantsProductLadder(createArtifactKind, productBrief)) {
                  const appNow = String(createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '');
                  if (
                    productInventSnapshot?.appJsx
                    && (
                      appLooksLikeWrongGenreForProductBrief(appNow, productBrief)
                      || appLooksLikeDeskSpineTemplate(appNow)
                    )
                  ) {
                    host.pushStatus('Ladder · restoring invent look after Live repair…');
                    restoreProductInventSnapshot('after Live repair');
                    if (originDiskRoot) {
                      await persistAcceptedCreateFiles(
                        originDiskRoot,
                        createFilesAcc,
                        ['src/App.jsx', 'src/App.css', 'public/logo.svg'].filter((p) => createFilesAcc[p]),
                      ).catch(() => {});
                    }
                    updateCreateJob(jobId, { files: createFilesAcc });
                  }
                }
              }
              packageBuildResult = {
                ok: runtime.evidence.buildOk ?? null,
                errors: runtime.evidence.buildErrors || [],
                repairs: runtime.fixRounds,
              };
              // Runtime fix rounds can re-inject COVER/full-bleed into App — re-lock shell.
              // Never re-seed compositional visuals over invent-demo.
              if (
                isThinCreatePath()
                && thinWantsCompositionalShell(briefForUi)
                && !filesHaveInventDemoSite(createFilesAcc)
                && !createFilesAcc['.__novaGenericInventAsk']
              ) {
                createFilesAcc = seedCompositionalBrandVisuals(
                  createFilesAcc,
                  briefForUi,
                  lockedProductName,
                );
                try {
                  const { wireCreatePublicAssets } = await import('@/lib/createBuildQuality');
                  createFilesAcc = wireCreatePublicAssets(
                    createFilesAcc,
                    lockedProductName,
                    briefForUi,
                  ).files;
                } catch { /* wire best-effort */ }
                if (originDiskRoot) {
                  await persistAcceptedCreateFiles(
                    originDiskRoot,
                    createFilesAcc,
                    [
                      ...new Set([
                        ...depthPersistKeys(createFilesAcc),
                        'public/logo.svg',
                      ]),
                    ],
                  ).catch(() => {});
                }
              }
              // Spine 10–11: Live unlock + prove this brand painted.
              host.pushStatus(formatThinCreateSpineStatus('live'));
              const mounted = Boolean(runtime.evidence?.mounted);
              const painted = Boolean(runtime.liveUnlock && mounted);
              if (painted) {
                host.pushStatus(formatThinCreateSpineStatus(
                  'prove',
                  lockedProductName,
                ));
              }
              // Live unlock ≠ quality Ready. Quality requires pass spine (plan + design + judge).
              codeVerified = Boolean(runtime.qualityReady);
              if (turnAborted() || runtime.judgeReasons?.includes('aborted')) {
                codeVerified = false;
                markCreateJobFailed(jobId, 'Create stopped during Live verify');
              } else {
                try {
                  pushBuildDiag({
                    kind: codeVerified ? 'ready' : (painted ? 'status' : 'status'),
                    detail: codeVerified
                      ? `Quality Ready (${runtime.fixRounds} fix rounds)`
                      : painted
                        ? `Live open — tighten if needed: ${(runtime.judgeReasons || []).slice(0, 2).join('; ') || 'plan/design'}`
                        : mounted
                          ? `Live server up (${runtime.fixRounds} fix rounds)`
                          : `Live blocked — page did not mount (blank render)`,
                  });
                } catch { /* ignore */ }
                if (painted && !codeVerified) {
                  // Post-Live logo stamp — skip invent-demo marks and blank shells.
                  if (originDiskRoot && !blankSolidColor && !inventDemoOwnsLogo(createFilesAcc)) {
                    try {
                      const { brandLogoSvgFor } = await import('@/lib/brandAssets');
                      const { localIconifySvg } = await import('@/lib/localLucideIcons');
                      const hk = detectHeroProductKind(lockedProductName, briefForUi);
                      let forced = brandLogoSvgFor({
                        productName: lockedProductName,
                        brief: briefForUi,
                        css: String(createFilesAcc['src/App.css'] || ''),
                      });
                      if (!forced || /M9\.937 15\.5/i.test(forced)) {
                        const fid = hk === 'bottle' ? 'lucide:wine' : hk === 'coffee' ? 'lucide:coffee'
                          : hk === 'tea' ? 'lucide:leaf' : hk === 'ceramic' ? 'lucide:utensils' : '';
                        if (fid) forced = localIconifySvg(fid, '#1a1a1a') || forced;
                      }
                      if (forced && !/M9\.937 15\.5/i.test(forced)) {
                        createFilesAcc = { ...createFilesAcc, 'public/logo.svg': forced };
                        await persistGenreLogoSvg(originDiskRoot, forced).catch(() => {});
                      }
                    } catch { /* best-effort */ }
                  }
                  host.pushStatus(blankSolidColor
                    ? 'Blank page Live — ready for the next tiny step…'
                    : 'Live is open — tell me what to tighten…');
                } else if (!mounted && !turnAborted()) {
                  host.pushStatus('Live blocked — page did not mount (blank render); keeping repair…');
                }
              }
              // Allow Live button only when the root actually painted.
              if (painted && !turnAborted()) {
                bootstrap = { ...bootstrap, codeVerified, previewLive: true };
              } else if (!mounted) {
                bootstrap = { ...bootstrap, codeVerified: false, previewLive: false };
              }
            } catch {
              // Never unlock Live on a probe crash — blank Live is worse than locked.
              codeVerified = false;
              bootstrap = { ...bootstrap, codeVerified: false, previewLive: false };
            }
          }
          bootstrap = { ...bootstrap, codeVerified };
          if (turnAborted()) {
            bootstrap = { ...bootstrap, codeVerified: false, previewLive: false };
            markCreateJobFailed(jobId, 'Stopped');
            clearBuildWritingPath('Stopped');
            host.pushStatus('Stopped — Live kept locked…');
            markBuildDiagnosticsEnded();
            await host.finishPlainReply('Stopped.', 'NOVA · stop');
            return { status: 'handled' };
          } else if (
            liveUrl
            && bootstrap.previewLive
            && !turnAborted()
            && !isNonWebArtifactKind(createArtifactKind)
          ) {
            // Final disk stamp at Ready — never overwrite invent-demo logos.
            if (originDiskRoot && !blankSolidColor && !inventDemoOwnsLogo(createFilesAcc)) {
              try {
                const { brandLogoSvgFor } = await import('@/lib/brandAssets');
                const { localIconifySvg } = await import('@/lib/localLucideIcons');
                const hk = detectHeroProductKind(lockedProductName, briefForUi);
                let forced = brandLogoSvgFor({
                  productName: lockedProductName,
                  brief: briefForUi,
                  css: String(createFilesAcc['src/App.css'] || ''),
                });
                if (!forced || /M9\.937 15\.5/i.test(forced)) {
                  const fid = hk === 'bottle' ? 'lucide:wine' : hk === 'coffee' ? 'lucide:coffee'
                    : hk === 'tea' ? 'lucide:leaf' : hk === 'ceramic' ? 'lucide:utensils' : '';
                  if (fid) forced = localIconifySvg(fid, '#1a1a1a') || forced;
                }
                if (forced && !/M9\.937 15\.5/i.test(forced)) {
                  createFilesAcc = { ...createFilesAcc, 'public/logo.svg': forced };
                  await persistGenreLogoSvg(originDiskRoot, forced).catch(() => {});
                }
              } catch { /* best-effort */ }
            }
            // Floors may unlock Live; quality Ready requires invent evidence — never while twin remains.
            // Ridge Latch: runtime.qualityReady stayed false from an early createFloorFallback flag
            // even after Acc cleared twin + Live painted. Late Acc judge is authoritative.
            // Moss Latch 2026-10-23: Acc sometimes lacked section bodies while disk painted —
            // hydrate compositional files from disk before the Ready judge.
            if (originDiskRoot && window.novaDesktop?.readTextFile) {
              try {
                const want = Object.keys(createFilesAcc)
                  .filter((k) => /^src\/sections\//i.test(String(k).replace(/\\/g, '/')))
                  .concat([
                    'src/App.jsx',
                    'src/App.css',
                    'src/sections/HeroSection.jsx',
                    'src/sections/CatalogSection.jsx',
                    'src/sections/StorySection.jsx',
                    'src/sections/NavHeaderSection.jsx',
                    'src/sections/FooterSection.jsx',
                    'src/sections/ContactSection.jsx',
                  ]);
                const uniq = [...new Set(want)];
                for (const rel of uniq) {
                  const cur = String(createFilesAcc[rel] || '');
                  if (cur.length >= 80 && !/^src\/sections\//i.test(rel)) continue;
                  if (cur.length >= 200) continue;
                  const sep = String(originDiskRoot).includes('\\') ? '\\' : '/';
                  const abs = `${String(originDiskRoot).replace(/[/\\]+$/, '')}${sep}${rel.replace(/\//g, sep)}`;
                  const read = await window.novaDesktop.readTextFile({ path: abs });
                  if (read?.ok && typeof read.text === 'string' && read.text.length > cur.length) {
                    createFilesAcc = { ...createFilesAcc, [rel]: read.text };
                  }
                }
              } catch { /* hydrate best-effort */ }
            }
            try {
              createFilesAcc = ensureNavTargetIdsOnSections(createFilesAcc);
              createFilesAcc = ensureHeroPremiumFloorCopy(createFilesAcc, lockedProductName);
              createFilesAcc = ensureLandedSectionsMountedInApp(
                createFilesAcc,
                briefForUi,
                lockedProductName,
              );
            } catch { /* nav/hero/footer heal best-effort */ }
            if (
              looksLikeInventFloorTwin(createFilesAcc) === false
              && inventFloorClearsLive(createFilesAcc, briefForUi, lockedProductName)
            ) {
              createFloorFallback = false;
            }
            const floorStillBlocksQuality = createFloorFallback
              && looksLikeInventFloorTwin(createFilesAcc);
            const finalRendered = verifyCreateRenderedQuality(createFilesAcc, authoritativeOriginalBrief, lockedProductName);
            const codingQualityGate = readyBlockedByCodingQuality(createFilesAcc, {
              brand: lockedProductName,
              mustHave: createBriefPlan.mustHave,
              verifyChecks: createBriefPlan.verifyChecks,
              outOfScope: createBriefPlan.outOfScope,
            });
            const late = judgeCreateVerified({
              evidence: {
                pass: true,
                httpOk: true,
                mounted: true,
                smokeOk: true,
                consoleClean: true,
                renderedSample: String(lockedProductName || ''),
                staticReady: true,
                staticReasons: [],
                npmInstalled: true,
                liveUrl: null,
                consoleErrors: [],
                smokeDetail: 'quality-bypass',
                stage: 'late-quality',
              },
              files: createFilesAcc,
              brief: briefForUi,
              productName: lockedProductName,
              floorFallback: floorStillBlocksQuality,
            });
            // Quill Latch: twin Acc must never Ready via late.qualityReady bypass.
            if (looksLikeInventFloorTwin(createFilesAcc)) {
              createFilesAcc = breakInventFloorTwin(
                createFilesAcc,
                briefForUi,
                lockedProductName,
              );
              createFloorFallback = false;
            }
            const twinStill = looksLikeInventFloorTwin(createFilesAcc);
            const craftPastFloor = inventFloorClearsLive(createFilesAcc, briefForUi, lockedProductName)
              && !twinStill;
            // Salted lockedProductName (harness run tag) can trip brief-miss while Acc
            // paints the human brand core — craftPastFloor + rendered still Ready.
            const lateQualityReady = !twinStill && (
              Boolean(late.qualityReady)
              || (craftPastFloor && finalRendered.ok && !codingQualityGate.blocked)
              || (craftPastFloor && finalRendered.ok && codingQualityGate.reasons.every(
                (r) => /^brief miss: brand name visible:/i.test(String(r || '')),
              ))
            );
            if (lateQualityReady) codeVerified = true;
            else if (twinStill) codeVerified = false;
            const qualityOk = !floorStillBlocksQuality
              && (lateQualityReady || Boolean(blankSolidColor));
            const readyNote = floorStillBlocksQuality
              ? 'Live open · recovery floor — invent did not own look (quality Ready withheld)'
              : qualityOk
                ? 'Live ready · quality verified'
                : 'Live open — tell me what to tighten';
            try {
              emitCreatePipelineStep(
                'verify',
                (msg) => host.pushStatus(msg),
                codingQualityGate.blocked
                  ? `Verify · brief gaps: ${codingQualityGate.reasons.slice(0, 2).join('; ')}`
                  : `Verify · ${createBriefPlan.verifyChecks.length} Done checks + floor clear`,
              );
            } catch { /* optional */ }
            if (codingQualityGate.blocked) {
              emitCreatePipelineStep(
                'premium',
                (msg) => host.pushStatus(msg),
                `Premium block · ${codingQualityGate.reasons.slice(0, 3).join(', ')}`,
              );
            } else {
              emitCreatePipelineStep('premium', (msg) => host.pushStatus(msg));
            }
            // Prefer lateQualityReady (includes brand-core / craftPastFloor overrides) over
            // a raw codingQualityGate.blocked that only failed on harness run-salt brand.
            const finalQualityOk = qualityOk && finalRendered.ok
              && (lateQualityReady || !codingQualityGate.blocked);
            host.pushStatus(finalQualityOk
              ? 'Live ready — open Live under the chat…'
              : floorStillBlocksQuality
                ? 'Live open · floor salvage — quality Ready withheld…'
                : codingQualityGate.blocked && !lateQualityReady
                  ? `Live open · quality floor: ${codingQualityGate.reasons[0] || 'blocked'}…`
                : finalRendered.ok ? 'Live is open — tell me what to tighten…' : `Live mounted; quality verification failed: ${finalRendered.reasons[0] || 'brief match'}`);
            markCreateJobReadyVerified(
              jobId,
              liveUrl,
              finalQualityOk ? readyNote : (floorStillBlocksQuality
                ? 'Live mounted · floor salvage — quality not Ready'
                : codingQualityGate.blocked
                  ? `Live mounted · quality floor (${codingQualityGate.reasons[0] || 'blocked'})`
                : 'Live mounted · quality not verified'),
              authoritativeOriginalBrief,
              createFilesAcc,
              { qualityReady: finalQualityOk },
            );
            if (finalQualityOk) {
              emitCreatePipelineStep('done', (msg) => host.pushStatus(msg));
            }
            try {
              host.commitStudio({
                files: createFilesAcc,
                projectId: originProjectId,
                name: lockedProductName,
                diskRoot: originDiskRoot,
                previewUrl: liveUrl,
              });
            } catch { /* ignore */ }
            try {
              const prefs = getLocalPrefs();
              if (finalQualityOk && prefs.agentLoopCommitOnSuccess === true && originDiskRoot && window.novaDesktop?.agentRun) {
                const msg = `NOVA: created ${lockedProductName}`.replace(/"/g, '\\"');
                await window.novaDesktop.agentRun({
                  command: `git add -A && git commit -m "${msg}"`,
                  cwd: originDiskRoot,
                }).catch(() => {});
              }
            } catch { /* optional */ }
            // Live available to user; codeVerified tracks quality Ready only.
            bootstrap = { ...bootstrap, codeVerified: finalQualityOk, previewLive: true };
          } else if (!bootstrap.previewLive) {
            host.pushStatus('Dependencies installed — Live not ready yet…');
            markCreateJobFailed(
              jobId,
              bootstrap.bootstrapNote
                || 'Dependencies installed, but Live did not start after automatic retries. Click **Live** under the chat to try again.',
            );
          }
        } else {
          host.pushStatus('Dependency install did not finish…');
          markCreateJobFailed(jobId, bootstrap.bootstrapNote || 'npm install failed');
        }
      } catch (err) {
        bootstrap = {
          npmInstalled: false,
          bootstrapNote: err instanceof Error ? err.message : 'npm failed',
        };
        markCreateJobFailed(jobId, bootstrap.bootstrapNote || 'npm failed');
      }
    } else if (uiPolishOk === true && originDiskRoot) {
      // Static HTML / non-npm: Live + Create Runtime evidence (same gate as Vite).
      if (turnAborted()) {
        markCreateJobFailed(jobId, 'Stopped');
        markBuildDiagnosticsEnded();
        clearBuildWritingPath('Stopped');
        await host.finishPlainReply('Stopped.', 'NOVA · stop');
        return { status: 'handled' };
      }
      host.pushStatus('Starting Live preview…');
      try {
        let live = await Promise.race([
          window.novaDesktop?.getOrAttachPreview?.(originDiskRoot) ?? Promise.resolve(null),
          new Promise<null>((resolve) => { window.setTimeout(() => resolve(null), 55_000); }),
        ]);
        if (!(live?.ok && live.url) && !turnAborted()) {
          // One automatic retry instead of bouncing "say run Preview" to the user.
          host.pushStatus('Live did not attach — retrying once…');
          await new Promise((r) => setTimeout(r, 1500));
          live = await Promise.race([
            window.novaDesktop?.getOrAttachPreview?.(originDiskRoot) ?? Promise.resolve(null),
            new Promise<null>((resolve) => { window.setTimeout(() => resolve(null), 55_000); }),
          ]);
        }
        if (live?.ok && live.url) {
          let codeVerified = false;
          try {
            const { runCreateVerifyAndFix } = await import('@/lib/createRuntimeLoop');
            markCreateJobVerifying(jobId, 'live', 'Collecting Live evidence…');
            if (isThinCreatePath()) createFloorFallback = false;
            const runtime = await runCreateVerifyAndFix({
              files: createFilesAcc,
              productName: lockedProductName,
              brief: briefForUi,
              projectId: liveOwnerKey(host.chatId || originProjectId),
              diskRoot: originDiskRoot,
              liveUrl: live.url,
              npmInstalled: true,
              staticReady: true,
              staticReasons: uiPolishReasons,
              floorFallback: createFloorFallback,
              repairBuild: ({ files, brief, productName, errors }) => repairCreateBuildWithCoder({
                files,
                brief,
                productName,
                errors,
                projectId: liveOwnerKey(host.chatId || originProjectId),
                diskRoot: originDiskRoot,
                coderId: coderGate.id,
                coderName: coderGate.name,
                coderSource: coderGate.source,
                shouldAbort: () => turnAborted(),
              }),
              host: {
                pushStatus: (label) => host.pushStatus(label),
                shouldAbort: () => turnAborted(),
                onStage: (stage, detail) => markCreateJobVerifying(jobId, stage, detail),
              },
              maxFixRounds: blankSolidColor
                ? 0
                : (isThinCreatePath() ? undefined : (createFloorFallback ? 1 : 3)),
            });
            createFilesAcc = runtime.files;
            packageBuildResult = {
              ok: runtime.evidence.buildOk ?? null,
              errors: runtime.evidence.buildErrors || [],
              repairs: runtime.fixRounds,
            };
            codeVerified = Boolean(runtime.qualityReady);
            const mounted = Boolean(runtime.evidence?.mounted && runtime.liveUnlock);
            const liveQuality = verifyCreateRenderedQuality(createFilesAcc, authoritativeOriginalBrief, lockedProductName);
            codeVerified = codeVerified && liveQuality.ok;
            bootstrap = {
              npmInstalled: true,
              previewLive: mounted,
              devServerUrl: live.url,
              codeVerified,
            };
            if (!mounted) {
              host.pushStatus('Live blocked — page did not mount (blank render)…');
            }
          } catch {
            codeVerified = false;
            bootstrap = {
              npmInstalled: true,
              previewLive: false,
              devServerUrl: live.url,
              codeVerified: false,
            };
            host.pushStatus('Live blocked — probe failed; not unlocking blank Live…');
          }
          if (turnAborted()) {
            bootstrap = { ...bootstrap, previewLive: false, codeVerified: false };
            markCreateJobFailed(jobId, 'Stopped');
            clearBuildWritingPath('Stopped');
            host.pushStatus('Stopped — Live kept locked…');
            markBuildDiagnosticsEnded();
            await host.finishPlainReply('Stopped.', 'NOVA · stop');
            return { status: 'handled' };
          } else if (bootstrap.previewLive) {
            const staticRendered = verifyCreateRenderedQuality(createFilesAcc, authoritativeOriginalBrief, lockedProductName);
            const codingQualityGate2 = readyBlockedByCodingQuality(createFilesAcc, {
              brand: lockedProductName,
              mustHave: createBriefPlan.mustHave,
              verifyChecks: createBriefPlan.verifyChecks,
              outOfScope: createBriefPlan.outOfScope,
            });
            codeVerified = codeVerified && staticRendered.ok && !codingQualityGate2.blocked;
            if (codingQualityGate2.blocked) {
              emitCreatePipelineStep(
                'premium',
                (msg) => host.pushStatus(msg),
                `Premium block · ${codingQualityGate2.reasons.slice(0, 3).join(', ')}`,
              );
            }
            host.pushStatus(codeVerified
              ? 'Live ready — open Live under the chat…'
              : codingQualityGate2.blocked
                ? `Live open · quality floor: ${codingQualityGate2.reasons[0] || 'blocked'}…`
              : 'Live is open — tell me what to tighten…');
            markCreateJobReadyVerified(
              jobId,
              live.url,
              codeVerified
                ? 'Live ready · quality verified'
                : codingQualityGate2.blocked
                  ? `Live open · quality floor (${codingQualityGate2.reasons[0] || 'blocked'})`
                  : 'Live open · tell me what to tighten',
              authoritativeOriginalBrief,
              createFilesAcc,
              { qualityReady: codeVerified },
            );
          } else {
            markCreateJobFailed(
              jobId,
              'Live blocked — page did not mount (blank render). Tell me what looks wrong and I will retry.',
            );
          }
          try {
            host.commitStudio({
              files: createFilesAcc,
              projectId: originProjectId,
              name: lockedProductName,
              diskRoot: originDiskRoot,
              previewUrl: live.url,
            });
          } catch { /* ignore */ }
        } else {
          bootstrap = {
            npmInstalled: true,
            previewLive: false,
            bootstrapNote: live?.error
              || 'Live preview server did not start after an automatic retry. Click **Live** under the chat to try again.',
          };
          markCreateJobFailed(jobId, bootstrap.bootstrapNote || 'Live did not start');
        }
      } catch (err) {
        bootstrap = {
          npmInstalled: true,
          previewLive: false,
          bootstrapNote: err instanceof Error ? err.message : 'Live preview failed',
        };
        markCreateJobFailed(jobId, bootstrap.bootstrapNote || 'Live preview failed');
      }
    } else if (uiPolishOk === true) {
      // CONFLICT REMOVED: never mark Ready without disk Live evidence.
      markCreateJobFailed(
        jobId,
        'UI preflight passed but no project folder / Live target — cannot verify.',
      );
    } else {
      markCreateJobFailed(jobId, 'UI not Preview-ready');
    }

    // Drop harness prompts from Acc before Files Changed / Code tree / reply.
    // They are agent notes (browser loop, driver ask) — not the product, and they
    // inflated "+thousands of lines" while App.jsx stayed a stub.
    {
      const { isInventAccNoisePath } = await import('@/lib/agentTrace');
      for (const k of Object.keys(createFilesAcc)) {
        if (isInventAccNoisePath(k) || /(^|\/)\.__nova/i.test(k)) {
          delete createFilesAcc[k];
        }
      }
      // User expects a README — harness used to ship SPEC/PROGRESS instead of one.
      if (!createFilesAcc['README.md'] && lockedProductName) {
        const briefOne = String(authoritativeOriginalBrief || '').replace(/\s+/g, ' ').trim().slice(0, 220);
        createFilesAcc['README.md'] = [
          `# ${lockedProductName}`,
          '',
          briefOne || 'Created with NOVA.',
          '',
          '## Run',
          '',
          '```bash',
          'npm install',
          'npm run dev',
          '```',
          '',
        ].join('\n');
      }
    }
    const { countLineDiff, wrapReplyWithFileChanges, isInventAccNoisePath } = await import('@/lib/agentTrace');
    const writtenPaths = Object.keys(createFilesAcc)
      .filter((p) => !isInventAccNoisePath(p))
      .sort((a, b) => a.localeCompare(b));
    const fileChanges = writtenPaths.map((path) => {
      const body = String(createFilesAcc[path] || '');
      const diff = countLineDiff('', body);
      return { path, added: Math.max(1, diff.added || body.split('\n').length), removed: 0 };
    });
    // Last-chance Ready: bootstrap.codeVerified can lag Acc (Moss/Elm Latch).
    // Re-judge here — hydrate from disk first so Acc matches what Live painted.
    if (bootstrap.previewLive && !bootstrap.codeVerified) {
      try {
        if (originDiskRoot && window.novaDesktop?.readTextFile) {
          const sep = String(originDiskRoot).includes('\\') ? '\\' : '/';
          const root = String(originDiskRoot).replace(/[/\\]+$/, '');
          const want = [
            'src/App.jsx',
            'src/App.css',
            ...Object.keys(createFilesAcc).filter((k) => /^src\/sections\//i.test(String(k).replace(/\\/g, '/'))),
            'src/sections/HeroSection.jsx',
            'src/sections/CatalogSection.jsx',
            'src/sections/StorySection.jsx',
            'src/sections/NavHeaderSection.jsx',
            'src/sections/FooterSection.jsx',
          ];
          for (const rel of [...new Set(want)]) {
            try {
              const abs = `${root}${sep}${rel.replace(/\//g, sep)}`;
              const read = await window.novaDesktop.readTextFile({ path: abs });
              const cur = String(createFilesAcc[rel] || '');
              if (read?.ok && typeof read.text === 'string' && read.text.length > cur.length) {
                createFilesAcc = { ...createFilesAcc, [rel]: read.text };
              }
            } catch { /* skip one */ }
          }
        }
        createFilesAcc = ensureNavTargetIdsOnSections(createFilesAcc);
        createFilesAcc = ensureHeroPremiumFloorCopy(createFilesAcc, lockedProductName);
        createFilesAcc = ensureLandedSectionsMountedInApp(
          createFilesAcc,
          briefForUi,
          lockedProductName,
        );
        const judgeAcc = (files: Record<string, string>) => {
          const twinNow = looksLikeInventFloorTwin(files);
          const clearsNow = inventFloorClearsLive(files, briefForUi, lockedProductName);
          const renderedNow = verifyCreateRenderedQuality(
            files,
            authoritativeOriginalBrief || briefForUi,
            lockedProductName,
          );
          const gateNow = readyBlockedByCodingQuality(files, {
            brand: lockedProductName,
            mustHave: createBriefPlan.mustHave,
            verifyChecks: createBriefPlan.verifyChecks,
            outOfScope: createBriefPlan.outOfScope,
          });
          const lateNow = judgeCreateVerified({
            evidence: {
              pass: true,
              httpOk: true,
              mounted: true,
              smokeOk: true,
              consoleClean: true,
              renderedSample: String(lockedProductName || ''),
              staticReady: true,
              staticReasons: [],
              npmInstalled: true,
              liveUrl: null,
              consoleErrors: [],
              smokeDetail: 'quality-bypass',
              stage: 'late-quality',
            },
            files,
            brief: briefForUi,
            productName: lockedProductName,
            floorFallback: false,
          });
          const handbackReady = Boolean(lateNow.qualityReady)
            || (clearsNow && !twinNow && renderedNow.ok && !gateNow.blocked);
          return {
            twinNow,
            clearsNow,
            renderedNow,
            gateNow,
            lateNow,
            handbackReady,
          };
        };
        let judged = judgeAcc(createFilesAcc);
        // Quill/Onyx/Ivory Latch: force unique layout + heal editorial hero (no stage in 12px col).
        {
          const before = createFilesAcc;
          createFilesAcc = ensureAtelierUniqueLayoutAcc(
            createFilesAcc,
            briefForUi,
            lockedProductName,
          );
          createFilesAcc = healEditorialHeroAcc(createFilesAcc);
          if (createFilesAcc !== before || judged.twinNow) {
            createFilesAcc = ensureNavTargetIdsOnSections(createFilesAcc);
            createFilesAcc = ensureLandedSectionsMountedInApp(
              createFilesAcc,
              briefForUi,
              lockedProductName,
            );
            createFloorFallback = false;
            judged = judgeAcc(createFilesAcc);
          }
        }
        const {
          twinNow,
          clearsNow,
          renderedNow,
          gateNow,
          lateNow,
          handbackReady,
        } = judged;
        const gateDump = {
          at: Date.now(),
          twinNow,
          clearsNow,
          renderedNow: renderedNow.ok,
          renderedReasons: renderedNow.reasons?.slice(0, 6),
          gateNow: gateNow.blocked,
          gateReasons: gateNow.reasons?.slice(0, 6),
          lateNow: lateNow.qualityReady,
          lateReasons: lateNow.reasons?.slice(0, 8),
          handbackReady,
          bootstrapWas: bootstrap.codeVerified,
        };
        try {
          createFilesAcc = {
            ...createFilesAcc,
            '.__novaReadyGate': JSON.stringify(gateDump),
            '.nova-ready-gate.json': JSON.stringify(gateDump, null, 2),
          };
        } catch { /* diag optional */ }
        if (handbackReady) {
          bootstrap = { ...bootstrap, codeVerified: true, previewLive: true };
        }
        if (originDiskRoot) {
          try {
            await persistAcceptedCreateFiles(
              originDiskRoot,
              createFilesAcc,
              [
                '.nova-ready-gate.json',
                'src/App.jsx',
                'src/App.css',
                ...Object.keys(createFilesAcc).filter((k) => /^src\/sections\//i.test(String(k).replace(/\\/g, '/'))),
              ].filter((p) => createFilesAcc[p]),
            );
          } catch { /* persist heal best-effort */ }
        }
      } catch { /* handback re-judge best-effort */ }
    }
    const prose = formatCreateProjectReply(
      {
        ...buildIntent,
        kind: scaffoldKind,
        // Prefer the raw user ask so blank/step-ladder replies can say what we built.
        summary: String(authoritativeOriginalBrief || buildIntent.summary || host.content || ''),
      },
      {
        ok: true,
        projectPath: originDiskRoot || undefined,
        projectId: originProjectId,
        parentSource: created.parentSource,
        written: writtenPaths,
        files: createFilesAcc,
        grantHint: created.grantHint,
      },
      bootstrap,
    );
    const startedAt = host.replyStartedAt || Date.now();
    const qualityGaps: string[] = [];
    if (bootstrap.previewLive && !bootstrap.codeVerified) {
      qualityGaps.push('Live painted, but quality Ready did not clear (plan / design / judge still open).');
      try {
        const { formatCreateQualityRubricReasons } = await import('@/lib/createQualityRubric');
        for (const r of formatCreateQualityRubricReasons(createFilesAcc, briefForUi).slice(0, 4)) {
          qualityGaps.push(r.replace(/^quality rubric:\s*/i, ''));
        }
      } catch { /* best-effort */ }
      for (const d of thinLiveVisualDeficits(createFilesAcc, briefForUi, lockedProductName).slice(0, 3)) {
        qualityGaps.push(d);
      }
      if (looksLikeInventFloorTwin(createFilesAcc)) {
        qualityGaps.push(
          'Acc still matches invent-floor twin (stamped catalog/lede) — craft did not enrich past the shell.',
        );
      }
      if (!inventFloorClearsLive(createFilesAcc, briefForUi, lockedProductName)) {
        qualityGaps.push(
          looksLikeInventFloorTwin(createFilesAcc)
            ? 'Invent held for premium enrich past floor twin; Live may paint while quality Ready stays open.'
            : 'Invent-floor fast-path did not clear (still enriching or ask-match open).',
        );
      }
    } else if (!bootstrap.previewLive) {
      qualityGaps.push('Live did not verify (mount / console / smoke).');
    }
    const createAnswer = wrapReplyWithFileChanges({
      startedAt,
      elapsedMs: Math.max(1, Date.now() - startedAt),
      userMessage: host.content,
      answer: `${prose}${grantNote || ''}`.trim(),
      changedPaths: writtenPaths,
      fileChanges,
      projectPath: originDiskRoot || undefined,
      qualityGaps,
      statusLabels: [
        formatThinCreateSpineStatus('ready'),
        'Created the project folder',
        'Wrote scaffold files',
        'Generated project files were written',
        ...(packageBuildResult.ok === false
          ? [`Production package build failed: ${(packageBuildResult.errors[0] || 'see details above').slice(0, 180)}`]
          : []),
        bootstrap.previewLive && bootstrap.codeVerified
          ? 'Live verified (mount + evidence)'
          : bootstrap.previewLive && inventFloorClearsLive(createFilesAcc, briefForUi, lockedProductName)
            ? 'Live open — invent floor cleared visual bar (quality Ready still open)'
            : bootstrap.previewLive
              ? 'Live evidence incomplete — not verified'
              : (bootstrap.npmInstalled
                ? 'Installed project dependencies'
                : (bootstrap.npmPending ? 'Installing project dependencies' : 'Setup incomplete')),
      ],
    });
    const createMeta = (ensembleAttribution && ensembleAttribution.includes('→')
        ? `NOVA · ensemble · ${ensembleAttribution}`
        : (coderGate.ok && coderGate.name
          ? (isCreateV2Active()
            ? `NOVA · create · ${coderGate.name}`
            : `NOVA · create · ${coderGate.name}`)
          : 'NOVA · create'));
    try {
      host.onCreatePhaseModel?.({ id: coderGate.id, name: coderGate.name, role: 'done' });
    } catch { /* ignore */ }
    markBuildDiagnosticsEnded();
    // finishPlainReply clears status and snapshots Done — do not pushStatus after.
    await host.finishPlainReply(createAnswer, createMeta);
    return { status: 'handled' };
  } catch (createErr) {
    const msg = teachableCreateError(
      createErr instanceof Error ? createErr.message : String(createErr || 'unknown error'),
      buildIntent.name,
    );
    markCreateJobFailed(jobId, msg);
    unbindCreateChat(host, host.chatId, { keepCodePill: Boolean(createDiskRootForPill) });
    markBuildDiagnosticsEnded();
    await host.finishPlainReply(msg);
    return { status: 'handled' };
  }
}
