import type { ProjectBootstrapResult } from '@/lib/createProjectFlow';
import {
  formatCreateProjectReply,
  runCreateProjectFlow,
  bootstrapProjectWorkspace,
} from '@/lib/createProjectFlow';
import {
  extractProjectName,
  fallbackCreateProjectName,
  findBestProductBrief,
  parseNewProjectIntent,
  recoverOriginalUserBrief,
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
import {
  markCreateJobFailed,
  markCreateJobNpm,
  markCreateJobReady,
  markCreateJobReadyVerified,
  shouldAbortCreateJob,
  markCreateJobVerifying,
  startCreateJob,
  updateCreateJob,
} from '@/lib/createJobStore';
import { getLocalPrefs } from '@/lib/localPrefs';
import { clearChatStudio, clearLastDiskTarget, setLastPendingGreenfield } from '@/lib/chatStudioStore';
import type { CreateSuccess } from '@/lib/productContract';
import {
  isThinCreatePath,
  thinCraftMayContinue,
  thinAppNeedsFinishPass,
  thinNeedsDepthPass,
  thinBlocksLivePreview,
  thinLiveVisualDeficits,
  thinDepthReplyGrew,
  thinDepthDeficits,
  countThinLandmarks,
  thinDepthSameRejectStalled,
  readThinDepthLedger,
  formatThinDepthLedger,
  thinAppLooksTruncated,
  formatFinishAppPrompt,
  formatDepthContinuePrompt,
  THIN_CREATE_APP_PATH,
  thinCreateLocksAppJsx,
  thinCreatePrimaryAppPath,
  thinCoerceLockedAppJsx,
  thinMergeDepthAppFiles,
  makeThinDepthStreamGuards,
  THIN_DEPTH_CONTINUE_MAX,
  THIN_DEPTH_MIN_SECTIONS,
  THIN_DEPTH_SAME_REJECT_BAIL,
  THIN_DEPTH_ZERO_GAIN_BAIL,
  thinWantsCompositionalShell,
  applyCompositionalDepthMerge,
  assembleCompositionalAppShell,
  seedCompositionalBrandVisuals,
  appLooksLikeCompositionalShell,
  replyHasCompositionalSectionBlock,
  pickThinDepthFiles,
  depthPersistKeys,
  genreLockPersistKeys,
  thinGenreSeedClearsLive,
  thinAskMatchDeficits,
  nextCompositionalDepthTarget,
  compositionalDepthDropsDeliveredMarkers,
  formatCompositionalDepthDropReason,
} from '@/lib/createThinPath';
import { detectHeroProductKind } from '@/lib/createIdentity';
import { liveOwnerKey } from '@/lib/liveOwnerKey';
import {
  isCreateV2Active,
  CREATE_V2_SOFT_BIND_MS,
  CREATE_V2_AUTO_OPEN_CODE,
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

/** Unbind chat from a partial create — folder may exist on disk, but chat is not a successful product. */
function unbindCreateChat(
  host: Pick<CreateTurnHost, 'commitStudio' | 'setChatCodePill'>,
  chatId: string,
): void {
  try {
    host.commitStudio({
      files: {},
      projectId: '',
      name: '',
      diskRoot: null,
      previewUrl: null,
    });
  } catch { /* ignore */ }
  try { host.setChatCodePill(chatId, false); } catch { /* ignore */ }
  try { clearLastDiskTarget(chatId); } catch { /* ignore */ }
  try { clearChatStudio(chatId); } catch { /* ignore */ }
}

/** Soft-bind folder + code pills without Live (previewUrl stays null; job not Ready). */
const softBindLastAt = new Map<string, number>();
const softBindCount = new Map<string, number>();
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
  const count = softBindCount.get(key) || 0;
  const minGap = v2 ? CREATE_V2_SOFT_BIND_MS : 900;
  const secondGap = v2 ? CREATE_V2_SOFT_BIND_MS : 1600;
  if (!opts.force && now - last < minGap) return;
  if (!opts.force && count >= 1 && now - last < secondGap) return;
  // createV2: allow many paints so Code grows line-by-line (old cap of 8 froze mid-craft).
  if (!opts.force && count > (v2 ? 400 : 24)) return;
  softBindLastAt.set(key, now);
  softBindCount.set(key, count + 1);
  try {
    pushBuildDiag({
      kind: 'soft-bind',
      detail: `Studio paint #${count + 1} (${Object.keys(opts.files).length} files)`,
    });
    tickBuildHeartbeat(`Studio · ${Object.keys(opts.files).length} files`);
  } catch { /* ignore */ }
  try {
    host.commitStudio({
      files: opts.files,
      projectId: opts.projectId,
      name: opts.name,
      diskRoot: opts.diskRoot,
      previewUrl: null,
    });
  } catch { /* ignore */ }
  try { host.setChatCodePill(host.chatId, true); } catch { /* ignore */ }
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
}): Promise<{
  id: string;
  name: string;
  source: 'local' | 'auto';
  ok: boolean;
  reason?: string;
}> {
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
      kind: (pendingSeed?.kind as ProjectKind) || 'react',
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
    || host.content.match(/\b(?:called|named|name\s+it|call\s+it)\s+[\"“']?([A-Z][A-Za-z0-9][A-Za-z0-9 _-]{1,40})/i)?.[1]
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
        || /\b(?:create|build|scaffold)\b[\s\S]{0,80}\bon\s+disk\b/i.test(ask);
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
  let coderGate: CoderGate;
  coderGate = await resolveCreateUiPolishCoder(host);
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
  const createStartedAt = Date.now();
  const createTimedOut = () => Date.now() - createStartedAt > createWallMs;
  const turnAborted = () => Boolean(createTimedOut() || host.shouldAbort?.() || shouldAbortCreateJob(jobId, host.routeChatId));
  if (isVisionEngineId(coderGate.id)) {
    // Explicit chat pin / ladder may stress-test VL on create. Auto never picks VL for craft.
    host.pushStatus(`Craft on pinned vision model **${coderGate.name}**…`);
  }
  host.pushStatus(`Build uses **${coderGate.name}** · ${budgetProfile} budget…`);
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

  let ensemblePlanText = '';
  let ensembleAttribution = coderGate.name;
  let ensembleSpec: import('@/lib/createLayoutContract').ProductSpec | null = null;
  let ensembleContract: import('@/lib/createLayoutContract').LayoutContract | null = null;
  let ensembleCopy: import('@/lib/createLayoutContract').CopyPack | null = null;
  let ensembleContractBlock = '';
  /** Web research notes for craft — hoisted so polish prompts can see them after the ensemble try. */
  let createResearchNotes = '';
  /** One salt per create job — rebuilds must invent a new look. */
  const { newDesignFreshnessKey, formatOriginalCraftRules } = await import('@/lib/createDesignSystem');
  const designFreshnessKey = newDesignFreshnessKey();
  try {
    if (blankSolidFromUser) {
      /* blank pages are a solid shell, not a product story */
    } else {
      const briefSeed = originalBrief;
      createResearchNotes = '';
      // Brief-only craft law — no Design Spine shell, CopyPack, or layoutReference recipes.
      host.pushStatus('Writing originality craft law…');
      await yieldToUi(0);
      ensembleContractBlock = formatOriginalCraftRules({
        brief: originalBrief,
        productName: lockedProductName,
        freshnessKey: designFreshnessKey,
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
        }).join('\n');
      } catch { /* ignore */ }
    }
  }
  // createV2: do not auto-open Code mid-craft (tree+editor freezes the shell).
  if (CREATE_V2_AUTO_OPEN_CODE || !isCreateV2Active()) {
    try {
      window.dispatchEvent(new CustomEvent('NOVA:open-code-overlay', {
        detail: { openOverlay: true, name: lockedProductName },
      }));
    } catch { /* ignore */ }
  }

  const jobId = `create-${crypto.randomUUID().slice(0, 8)}`;
  host.pushStatus(`Creating folder in NOVA Projects (${buildIntent.slug})…`);
  pushBuildDiag({ kind: 'phase', detail: `Scaffold ${lockedProductName} (${buildIntent.slug})` });
  noteBuildContext({ productName: lockedProductName, phase: 'scaffold' });
  try {
    await host.syncGrants();
    host.pushStatus('Writing project files one by one…');
    const newProjectId = `proj-${crypto.randomUUID().slice(0, 8)}`;
    startCreateJob({
      id: jobId,
      chatId: host.chatId,
      path: '',
      projectId: newProjectId,
      name: lockedProductName,
      files: {},
      status: 'writing',
      // Align with preamble: started on this chat → may continue after leave.
      backgroundAllowed: Boolean(host.routeChatId && host.routeChatId === host.chatId),
      routeChatIdAtStart: host.routeChatId || null,
    });

    const { createFileBuildLabel } = await import('@/lib/createProgressCopy');
    let scaffoldAcc: Record<string, string> = {};
    const created = await runCreateProjectFlow(buildIntent, newProjectId, {
      onFileWrite: (rel, content) => {
        const path = String(rel || '').replace(/\\/g, '/');
        if (content != null) scaffoldAcc = { ...scaffoldAcc, [path]: content };
        const followPath = /\.gitignore$/i.test(path) ? undefined : path;
        host.pushStatus(createFileBuildLabel(path, 'Building'), followPath);
        // createV2: status only during scaffold; paint studio once after scaffold completes.
        if (!isCreateV2Active()) {
          softBindCreateStudio(host, {
            files: scaffoldAcc,
            projectId: newProjectId,
            name: lockedProductName,
            diskRoot: null,
          });
        }
      },
    });
    if (await host.stopIfSuperseded()) {
      markCreateJobFailed(jobId, 'Stopped');
      unbindCreateChat(host, host.chatId);
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
    const originProjectId = created.projectId || newProjectId;
    let createFilesAcc: Record<string, string> = { ...created.files };
    let craftCheckpoint = snapshotCreateCheckpoint(createFilesAcc, lockedProductName, {
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
    // createV2 D: scaffold must always include a complete Vite shell before craft.
    // Flush ALL repaired entry files (index.html/#root, main, vite.config) — package.json alone
    // left static index.html on disk and blanked Live.
    try {
      const { ensureViteReactProjectFiles } = await import('@/lib/createBuildQuality');
      const repaired = ensureViteReactProjectFiles(createFilesAcc, lockedProductName);
      createFilesAcc = repaired.files;
      if (repaired.repaired.length) {
        host.pushStatus('Scaffold · Vite entry files verified…');
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
      }
    } catch { /* best-effort */ }
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

    // Soft-bind so Folder + Code pills appear during polish (Live stays off until Ready).
    softBindCreateStudio(host, {
      files: createFilesAcc,
      projectId: originProjectId,
      name: lockedProductName,
      diskRoot: originDiskRoot,
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
    const {
      briefNeedsCreateUiPolish,
      briefLooksLikeMarketingLanding,
      briefLooksLikeChatApp,
      briefLooksLikeMicroWebToy,
      briefRequiresInteractiveApp,
      isPreviewReady,
      looksLikeFillerStubAppSource,
      isEmptyOrStubAppSource,
    } = await import('@/lib/createBuildQuality');
    // Prefer the raw user ask — ensemble fluff in briefForUi used to kill blank-solid detection.
    let blankSolidColor: string | null = blankSolidFromUser || blankSolidColorFromAsk(String(host.content || ''));
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
        }
      }
    } catch { /* best-effort */ }

    /** null = skipped (scaffold-only OK); true = Preview-ready UI applied; false = fail-closed */
    let uiPolishOk: boolean | null = null;
    let uiPolishReasons: string[] = [];
    /** Recovery floor used — Live may unlock; quality Ready must still fail (pass spine). */
    let createFloorFallback = false;
    /** Invent-from-brief depth continues already ran this turn (avoid early+late double). */
    let thinDepthRan = false;
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

    // createV2: single-coder craft only — never enter the tool-loop → handoff → polish thrash.
    if (needsUiPolish && uiPolishOk !== true) {
      let usedNovaLoop = false;
      let loopAttempted = false;
      const skipLegacyLoop = isCreateV2Active();
      try {
        const { shouldUseNovaCreateBuildLoop, runNovaCreateBuildLoop } = await import('@/lib/novaBuildLoop');
        const { modeStatusLabel } = await import('@/lib/novaStudioModes');
        if (!skipLegacyLoop && shouldUseNovaCreateBuildLoop() && coderGate.ok) {
          loopAttempted = true;
          usedNovaLoop = true;
          try {
            const { announceCreatePhase } = await import('@/lib/createStatus');
            await announceCreatePhase(host, 'craft', { id: coderGate.id, name: coderGate.name });
          } catch { /* ignore */ }
          host.pushStatus(modeStatusLabel('build', `Craft · ${coderGate.name}`));
          const loopRes = await runNovaCreateBuildLoop({
            brief: authoritativeOriginalBrief,
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
          softBindCreateStudio(host, {
            files: createFilesAcc,
            projectId: originProjectId,
            name: lockedProductName,
            diskRoot: originDiskRoot,
          });
          if (loopRes.ok) {
            // Re-verify with the brief gate — never trust the loop alone on rich briefs.
            const { previewReadyForBrief } = await import('@/lib/createBuildQuality');
            const gate = previewReadyForBrief(createFilesAcc, {
              productName: lockedProductName,
              brief: originalBrief,
              spec: ensembleSpec,
              contract: ensembleContract,
            });
            if (gate.ok) {
              uiPolishOk = true;
              uiPolishReasons = [];
            } else {
              uiPolishOk = false;
              uiPolishReasons = gate.reasons || ['Tool loop Ready did not hold'];
              host.pushStatus('Tool loop finished — Ready still blocked; handing off to full UI polish…');
            }
          } else {
            uiPolishReasons = loopRes.reasons || [];
            uiPolishOk = false;
            host.pushStatus('Tool loop did not clear Ready — handing off to full UI polish…');
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

      // createV2 / loop-off: one craft owner writes App via stream (no loop handoff).
      if (uiPolishOk !== true && (!usedNovaLoop || (loopAttempted && uiPolishOk === false))) {
      let polishSnapshot = { ...createFilesAcc };
      host.pushStatus(
        isCreateV2Active()
          ? createV2StatusCraft(coderGate.ok ? coderGate.name : 'coder')
          : usedNovaLoop
            ? `Full UI polish · **${coderGate.ok ? coderGate.name : 'coder'}**…`
            : 'Planning UI from your brief…',
        // Clear leftover scaffold follow (index.css) so Code does not show a fake stall.
        isCreateV2Active()
          ? (createFilesAcc['src/App.tsx'] && !createFilesAcc['src/App.jsx'] ? 'src/App.tsx' : 'src/App.jsx')
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
          craftCheckpoint = snapshotCreateCheckpoint(createFilesAcc, lockedProductName, {
            label: 'pre-craft',
            diskRoot: originDiskRoot,
          });
          const basePromptLines = [
            `AUTHORITATIVE USER BRIEF — implement every requested item; do not let plan notes replace it:\n${authoritativeOriginalBrief}`,
            ...polishPromptLinesFromBrief(briefSpec, appPath, briefForUi),
            formatCreateProjectMap(createFilesAcc),
            buildRankedProjectMap(createFilesAcc, briefForUi, { limit: 16 }),
            ...(isCreateV2Active()
              ? (() => {
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
                        createV2StagedWriteInstructions(preferTs),
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
          const attemptWallMs = isCreateV2Active()
            ? createV2AttemptWallMs(budgetProfile)
            : createPolishAttemptBudgetMs(briefForUi);
          const polishBudgetMs = attemptWallMs;
          const polishTotalBudgetMs = isCreateV2Active()
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
          // createV2: craft + one stall retry. Legacy: simple=1, else 2.
          const maxPolishAttempts = isCreateV2Active()
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
            let lastGrowthAt = Date.now();
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
                  host.pushStatus(
                    waited < 20_000
                      ? `Loading model · waiting for first tokens… (${Math.round(waited / 1000)}s)`
                      : `Still loading · will cancel if quiet past ${Math.round(CREATE_V2_FIRST_TOKEN_MS / 1000)}s… (${Math.round(waited / 1000)}s)`,
                    null,
                  );
                }
              }
              if (!sawStreamToken && now - attemptStarted > CREATE_V2_FIRST_TOKEN_MS) {
                stallAbort = true;
                zeroTokenAbort = true;
                stallAbortPath = createV2StallRetryPath(appPath, preferTs);
                if (!stallCancelFired) {
                  stallCancelFired = true;
                  host.pushStatus(
                    `No App output after ${Math.round(CREATE_V2_FIRST_TOKEN_MS / 1000)}s — cancelling…`,
                    appPath,
                  );
                  cancelCraftJob();
                }
                return;
              }
              // Idle = no token flow at all (any chunk resets lastStreamAt). Never cancel while emitting.
              if (sawStreamToken && now - lastStreamAt > createV2IdleStallMs(lastFocusPath || appPath)) {
                stallAbort = true;
                stallAbortPath = createV2StallRetryPath(lastFocusPath || appPath, preferTs);
                if (!stallCancelFired) {
                  stallCancelFired = true;
                  host.pushStatus(
                    `Stream idle — cancelling to retry App…`,
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
                  lastGrowthAt = lastStreamAt;
                }
                const activeHdr = (() => {
                  const active = streamBuf.lastIndexOf('@@@FILE');
                  if (active < 0) return '';
                  const hdr = streamBuf.slice(active).match(/^@@@FILE\s+([^\n\r]+)/);
                  return String(hdr?.[1] || '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
                })();
                const activeIsScaffold = Boolean(activeHdr) && isCreateV2ScaffoldPath(activeHdr);
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
                      lastGrowthAt = now;
                      // Stay on one App-family clock when hopping App.jsx ↔ App.css.
                      if (!appFamilyHop) pathFocusedAt = now;
                      if (isCreateV2AppPath(focusPath) && !appFamilyStartedAt) {
                        appFamilyStartedAt = now;
                      }
                      seenCodingPaths.add(focusPath);
                    } else if (contentGrew) {
                      lastFocusLen = focusLen;
                      lastGrowthAt = now;
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
                    // createV2: status + heartbeat only mid-stream — never soft-bind full files map.
                    if (focusPath && (pathChanged || contentGrew || stalled) && now - lastStudioPaint > 32) {
                      lastStudioPaint = now;
                      const base = focusPath.split('/').pop() || focusPath;
                      host.pushStatus(
                        stallAbort
                          ? `Stalled on ${base} — cancelling to retry App…`
                          : stalled && !contentGrew && !pathChanged
                            ? `Still waiting on the coder for ${base}…`
                            : createFileBuildLabel(focusPath, 'Coding'),
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
                      lastGrowthAt = now;
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
              lastError = `Coder produced no tokens in ${Math.round(CREATE_V2_FIRST_TOKEN_MS / 1000)}s`;
              host.pushStatus(
                `Coder produced no tokens in ${Math.round(CREATE_V2_FIRST_TOKEN_MS / 1000)}s — create stopped; retry with a smaller coder.`,
              );
              uiPolishOk = false;
              break;
            }
            if (stallAbort && stallAbortPath) {
              // Thin create: truncation heal only (never paste utility/kiln/sticky floors).
              // Non-thin: may still ship utility floors below.
              try {
              if (!isThinCreatePath()) {
                const {
                  briefLooksLikeStickyNotePage,
                  briefLooksLikeFiringJournal,
                  stickyNotePageApp,
                  stickyNotePageCss,
                  buildUtilityFloorFromBrief,
                  healNearReadyCreateUi,
                  previewReadyForBrief,
                } = await import('@/lib/createBuildQuality');
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
                  markCreateJobFailed(jobId, 'Stopped');
                  unbindCreateChat(host, host.chatId);
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
                  if (gate.ok && !isThinCreatePath()) {
                    uiPolishOk = true;
                    uiPolishReasons = [];
                    lastError = '';
                    host.pushStatus('Partial App healed — Preview Ready…');
                    break;
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
              break;
            }
            if (turnAborted() || await host.stopIfSuperseded()) {
              markCreateJobFailed(jobId, 'Stopped');
              unbindCreateChat(host, host.chatId);
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
              lastError = applied.error || 'Could not apply UI file edits';
              continue;
            }
            createFilesAcc = applied.files;
            if (
              thinCreateLocksAppJsx(briefForUi, lockedProductName)
              && thinWantsCompositionalShell(briefForUi)
            ) {
              createFilesAcc = applyCompositionalDepthMerge(
                createFilesAcc,
                briefForUi,
                lockedProductName,
              );
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
                const healed = healMissingLocalImports(createFilesAcc, lockedProductName);
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

    // Brand assets + public wiring — always run when we have a disk project (even if Ready failed).
    // Otherwise fail-closed builds keep broken /logo.svg and /heroes/*.jpg forever.
    // Arcade / canvas games: skip hero image materialize (was hanging ~20m on "landing"
    // negation in briefs like "Not a website landing page").
    if (originDiskRoot && !blankSolidColor && needsUiPolish) {
      try {
        const { planBrandAssets, materializeBrandAssets } = await import('@/lib/brandAssets');
        const { looksLikePlayableCanvasGame, looksLikeFpsGame } = await import('@/lib/freshSpaFromBrief');
        const { wireCreatePublicAssets } = await import('@/lib/createBuildQuality');
        const isArcadeBrief = looksLikePlayableCanvasGame(briefForUi) || looksLikeFpsGame(briefForUi);
        // Skip hero fetch on short/simple creates — research-driven utility UIs don't need stock photos.
        const isUtilityToy = briefLooksLikeMicroWebToy(briefForUi) || budgetProfile === 'simple';
        const tryMaterialize = !isArcadeBrief && !isUtilityToy && (
          uiPolishOk === true
          || briefLooksLikeMarketingLanding(briefForUi)
          || briefNeedsCreateUiPolish(briefForUi)
        );
        if (isArcadeBrief) {
          host.pushStatus('Skipping hero fetch for playable game…');
        } else if (isUtilityToy) {
          host.pushStatus('Skipping hero fetch for simple utility UI…');
        } else if (uiPolishOk === true) {
          host.pushStatus('Fetching images for this brief…');
        } else {
          host.pushStatus(tryMaterialize
            ? 'Fetching images + wiring hero fallbacks…'
            : 'Wiring local icons and hero fallbacks…');
        }
        const plan = planBrandAssets(briefForUi, lockedProductName);
        if (tryMaterialize) {
          const mat = await materializeBrandAssets({
            diskRoot: originDiskRoot,
            files: createFilesAcc,
            plan,
            brief: briefForUi,
            projectName: lockedProductName,
          });
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
        // Thin compositional shells keep landmarks in section files — App-only
        // previewReady would false-fail nav/hero and demote a seed-ready Live.
        if (uiPolishOk === true && !isThinCreatePath()) {
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

    // Style polish on the SAME sticky craft model (never swap GGUFs).
    // Thin create: skip style hop — keep craft CSS as written.
    if (turnAborted()) {
      markCreateJobFailed(jobId, 'Stopped');
      unbindCreateChat(host, host.chatId);
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
        if (cssThin || needsMotion || marketingStyle) {
          const { runCreateStyleHop } = await import('@/lib/createEnsemble');
          host.pushStatus(`Style · **${coderGate.name}** (same brain · CSS polish)…`);
          const appSrc = createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '';
          const styled = await runCreateStyleHop({
            brief: briefForUi,
            productName: lockedProductName,
            appSource: appSrc,
            cssSource: cssNow,
            modelId: coderGate.id,
            modelName: coderGate.name,
            contract: ensembleContract,
            shouldAbort: () => turnAborted(),
          });
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
    if (isThinCreatePath() && needsUiPolish && uiPolishOk !== true) {
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
          // When seed already clears Live + genre ask, skip invent thrash (was stuck 2/8 × 12).
          if (
            !thinDepthRan
            && thinNeedsDepthPass(createFilesAcc, briefForUi)
            && !thinGenreSeedClearsLive(createFilesAcc, briefForUi, lockedProductName)
            // F&B: seed owns bottle/bag/tin — invent depth only burns the soft wall + clobbers logos.
            && !/^(?:bottle|coffee|tea|lotion|chocolate|ceramic)$/.test(
              detectHeroProductKind(lockedProductName, briefForUi),
            )
            && coderGate.ok
            && !turnAborted()
          ) {
            thinDepthRan = true;
            /** Why depth stopped — pushed to status + build diag so the exit is provable. */
            let depthSummary = 'no depth attempts recorded';
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
              if (thinWantsCompositionalShell(briefForUi)) {
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
              let lastSectionTarget = '';
              /** Rejected section paths stay retired for the whole depth session (Freebuff C2). */
              const retiredSectionPaths = new Set<string>();
              let depthAttemptsUsed = 0;
              const depthAttemptMax = THIN_DEPTH_CONTINUE_MAX + 4;
              const sameRejectState = { key: '', bytes: -1, count: 0 };
              let depthStall = 0;
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
                if (!thinNeedsDepthPass(createFilesAcc, briefForUi)) break;
                if (grewPasses >= THIN_DEPTH_CONTINUE_MAX) break;
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
                const compositionalDepth = thinWantsCompositionalShell(briefForUi);
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
                  lastSectionTarget = '';
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
                    lastSectionTarget = depthAskTarget.filePath;
                    retiredSectionPaths.add(depthAskTarget.filePath.replace(/\\/g, '/'));
                  }
                  noteDepthReject(reason);
                  host.pushStatus(
                    `Depth ${pass}/${THIN_DEPTH_CONTINUE_MAX} · attempt ${attempt}/${depthAttemptMax} · ${statusDetail}`,
                  );
                  depthStall += 1;
                  // Compositional: never abort invent early — 7B needs the full attempt budget.
                  // Advancing avoidPath is still progress; only stop at depthAttemptMax.
                  if (!compositionalDepth && depthStall >= THIN_DEPTH_ZERO_GAIN_BAIL) {
                    host.pushStatus(
                      `Depth stalled — ${depthStall} passes with zero ledger gain — stopping retry, keeping prior`,
                    );
                    return true;
                  }
                  if (compositionalDepth && depthStall >= THIN_DEPTH_ZERO_GAIN_BAIL) {
                    host.pushStatus(
                      `Depth · ${depthStall} zero-gain — advancing section target, still inventing…`,
                    );
                    depthStall = 0;
                  }
                  if (sameRejectState.count >= THIN_DEPTH_SAME_REJECT_BAIL) {
                    host.pushStatus(
                      `Depth stalled — same thin shell ${sameRejectState.count} times — keeping prior, retry…`,
                    );
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
                    } else if (bumpDepthNoGain('applyChatReplyEdits failed', 'apply failed — keeping prior, retry…')) {
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
                  } else if (bumpDepthNoGain('applyChatReplyEdits failed', 'apply failed — keeping prior, retry…')) {
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
                  } else if (bumpDepthNoGain('applyChatReplyEdits failed', 'apply failed — keeping prior, retry…')) {
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
              if (thinWantsCompositionalShell(briefForUi)) {
                createFilesAcc = assembleCompositionalAppShell(
                  createFilesAcc,
                  briefForUi,
                  lockedProductName,
                );
              }
              depthSummary = `grew ${grewPasses}/${THIN_DEPTH_CONTINUE_MAX} in ${depthAttemptsUsed}/${depthAttemptMax} attempts${lastDepthReject ? ` · last: ${lastDepthReject}` : ' · all passes landed'}`;
              host.pushStatus(`Depth pass · ${depthSummary}`);
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
                !synEarly.ok
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
                    if (thinWantsCompositionalShell(briefForUi)) {
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
              if (thinBlocksLivePreview(createFilesAcc, briefForUi)) {
                uiPolishOk = false;
                createFloorFallback = false;
                uiPolishReasons = [
                  `Visual floor still open after depth (${depthSummary})`,
                  ...thinLiveVisualDeficits(createFilesAcc, briefForUi).slice(0, 4),
                ];
                host.pushStatus(`Thin create · visual floor open (${depthSummary}) — not Ready yet…`);
              } else {
                uiPolishOk = true;
                uiPolishReasons = [];
                host.pushStatus(`Thin create · visual floor cleared (${depthSummary}) — continuing…`);
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
            || thinNeedsDepthPass(createFilesAcc, briefForUi)) {
            // Depth never entered — still try visual seed before blocking Live.
            createFloorFallback = false;
            if (thinWantsCompositionalShell(briefForUi)) {
              createFilesAcc = seedCompositionalBrandVisuals(
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
            }
            if (thinBlocksLivePreview(createFilesAcc, briefForUi)) {
              uiPolishOk = false;
              uiPolishReasons = [
                'Visual floor still open — Live blocked',
                ...thinLiveVisualDeficits(createFilesAcc, briefForUi).slice(0, 4),
              ];
              host.pushStatus('Thin create · visual floor still open — not Ready yet…');
            } else {
              uiPolishOk = true;
              uiPolishReasons = [];
              host.pushStatus('Thin create · visual seed cleared Live floor — continuing…');
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
      if (uiPolishOk === true) {
        const {
          briefLooksLikeCommerceStore,
          appHasCommerceCart,
        } = await import('@/lib/createBuildQuality');
        if (briefLooksLikeCommerceStore(briefForUi) && !appHasCommerceCart(createFilesAcc)) {
          uiPolishOk = false;
          uiPolishReasons = ['Storefront missing cart + purchase UI (icon-only shell is not enough)'];
        }
      }
      // apple.com-style briefs must keep product bands always visible — never a click-gated shell.
      if (uiPolishOk === true) {
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
    if (originDiskRoot && (createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'])) {
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
    }

    // Bind studio only when Preview-ready — fail-closed leaves chat unbound.
    updateCreateJob(jobId, { files: createFilesAcc });

    const scaffoldKind = resolveProjectKindForCreate(
      buildIntent.summary || host.content,
      buildIntent.kind,
      buildIntent.kind,
    );
    const grantNote = created.grantHint ? `\n\n_${created.grantHint}_` : '';
    const displayName = cleanProductTitle(buildIntent.name);

    // Fail-closed recovery: keep folder + code pills; try heals/floors before giving up.
    // Thin create: never rewrite App with genre/marketing floors — syntax + honest fail only.
    if (uiPolishOk === false && !isThinCreatePath()) {
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
              createFilesAcc = ensureViteReactProjectFiles(createFilesAcc, lockedProductName).files;
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
              createFilesAcc = ensureViteReactProjectFiles(createFilesAcc, lockedProductName).files;
              await writePolishFiles();
              const cleared = await recheckPolishGate('Storefront repair cleared Preview Ready…');
              if (cleared || repaired.contractOk) {
                uiPolishOk = true;
                uiPolishReasons = [];
                polishBlocked = false;
                host.pushStatus('Storefront contract closed by repair — continuing to Live…');
              }
            }
            // Last-resort recovery floor only when repair cannot close the contract.
            if (polishBlocked && (repaired.needFloor || !repaired.contractOk)) {
              host.pushStatus('Storefront recovery floor (last resort — craft/repair incomplete)…');
              const floor = buildBriefInteractiveFloor(lockedProductName, briefForUi);
              const appKey = createFilesAcc['src/App.jsx']
                ? 'src/App.jsx'
                : (createFilesAcc['src/App.tsx'] ? 'src/App.tsx' : 'src/App.jsx');
              createFilesAcc = {
                ...createFilesAcc,
                ...(floor.files || {}),
                [appKey]: floor.app,
                'src/App.css': floor.css,
              };
              createFilesAcc = ensureViteReactProjectFiles(createFilesAcc, lockedProductName).files;
              const wired = wireCreatePublicAssets(createFilesAcc, lockedProductName, briefForUi);
              if (wired.changed.length) createFilesAcc = wired.files;
              await writePolishFiles();
              createFloorFallback = true;
              uiPolishOk = true;
              uiPolishReasons = ['storefront recovery floor — not original craft'];
              polishBlocked = false;
              host.pushStatus('Recovery floor shipped — Live unlock only (quality Ready still gated)…');
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
          host.pushStatus('Materializing product marketing floor (thin shell · last resort)…');
          try {
            const floor = buildBriefInteractiveFloor(lockedProductName, briefForUi);
            const appKey = createFilesAcc['src/App.jsx']
              ? 'src/App.jsx'
              : (createFilesAcc['src/App.tsx'] ? 'src/App.tsx' : 'src/App.jsx');
            createFilesAcc = {
              ...createFilesAcc,
              ...(floor.files || {}),
              [appKey]: floor.app,
              'src/App.css': floor.css,
            };
            createFilesAcc = ensureViteReactProjectFiles(createFilesAcc, lockedProductName).files;
            const wired = wireCreatePublicAssets(createFilesAcc, lockedProductName, briefForUi);
            if (wired.changed.length) createFilesAcc = wired.files;
            await writePolishFiles();
            const cleared = await recheckPolishGate('Product marketing floor cleared Preview Ready…');
            if (cleared) {
              createFloorFallback = true;
              polishBlocked = false;
            } else {
              const appLen = (createFilesAcc[appKey] || '').replace(/\s+/g, '').length;
              if (appLen >= 800 && /<footer\b|className=["'][^"']*\bfoot/i.test(createFilesAcc[appKey] || '')) {
                createFloorFallback = true;
                uiPolishOk = true;
                uiPolishReasons = ['marketing recovery floor — not original craft'];
                polishBlocked = false;
                host.pushStatus('Marketing floor shipped — Live unlock only (quality Ready gated)…');
              }
            }
          } catch {
            /* floor best-effort */
          }
        }

        if (!polishBlocked) {
          /* healed — skip empty/apple floors */
        } else {
        const appBody = createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '';
        const hasStructure = /<(?:section|nav|main|header|footer)\b/i.test(appBody)
          && (appBody.match(/<(?:section|main)\b/gi) || []).length >= 2;
        const thinProduct = isThinProductMarketingShell(createFilesAcc, briefForUi);
        const trulyEmpty = looksLikeFillerStubAppSource(appBody)
          || isEmptyOrStubAppSource(appBody)
          || appBody.replace(/\s+/g, '').length < 900
          || thinProduct;
        const { isBrokenReactAppSource } = await import('@/lib/freshSpaFromBrief');
        const reasonBlob = (uiPolishReasons || []).join(' | ');
        const appBroken = isBrokenReactAppSource(appBody)
          || /broken or incomplete|truncat|TypeScript syntax|undeclared img|Coder stalled|stalled on|incomplete|thin App|filler stub|still show|still a |empty shell|no JSX|Preview Ready|missing brand|too thin|icon-rail/i.test(reasonBlob);
        // Small utility crafts ONLY when the ask is tip/todo/coffee — never from “Forbidden: tip…”.
        const { briefWantsUtilityFloorKind: wantsUtil } = await import('@/lib/createBuildQuality');
        const utilityOrSimpleLanding = wantsUtil(briefForUi, 'tip')
          || wantsUtil(briefForUi, 'todo')
          || wantsUtil(briefForUi, 'coffee');
        if (utilityOrSimpleLanding && !appleBrief(briefForUi) && (appBroken || reasonBlob.length > 0)) {
          host.pushStatus('Materializing utility UI floor (broken/truncated craft)…');
          try {
            const { buildUtilityFloorFromBrief, ensureViteReactProjectFiles } = await import('@/lib/createBuildQuality');
            const floor = buildUtilityFloorFromBrief(lockedProductName, briefForUi);
            if (!floor.app || floor.kind === 'none') {
              throw new Error('no-utility-floor-for-brief');
            }
            const appKey = createFilesAcc['src/App.jsx']
              ? 'src/App.jsx'
              : (createFilesAcc['src/App.tsx'] ? 'src/App.tsx' : 'src/App.jsx');
            createFilesAcc = {
              ...createFilesAcc,
              [appKey]: floor.app,
              'src/App.css': floor.css,
            };
            createFilesAcc = ensureViteReactProjectFiles(createFilesAcc, lockedProductName).files;
            const healed = healNearReadyCreateUi(createFilesAcc, lockedProductName, briefForUi);
            if (healed.changed) createFilesAcc = healed.files;
            if (originDiskRoot) {
              await applyChatReplyEdits({
                reply: [
                  `@@@FILE ${appKey}\n${createFilesAcc[appKey]}`,
                  `@@@FILE src/App.css\n${createFilesAcc['src/App.css']}`,
                  createFilesAcc['index.html'] ? `@@@FILE index.html\n${createFilesAcc['index.html']}` : '',
                  createFilesAcc['src/main.jsx'] ? `@@@FILE src/main.jsx\n${createFilesAcc['src/main.jsx']}` : '',
                  createFilesAcc['src/main.tsx'] ? `@@@FILE src/main.tsx\n${createFilesAcc['src/main.tsx']}` : '',
                ].filter(Boolean).join('\n'),
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
              host.pushStatus(`Utility floor (${floor.kind}) cleared Preview Ready…`);
            } else {
              const floorApp = createFilesAcc[appKey] || '';
              if (floorApp.length >= 200 && !isBrokenReactAppSource(floorApp)) {
                uiPolishOk = true;
                uiPolishReasons = [];
                host.pushStatus(`Utility floor (${floor.kind}) applied — continuing to Live…`);
              } else {
                uiPolishReasons = [...uiPolishReasons, ...(gate.reasons || []).slice(0, 4)];
              }
            }
          } catch {
            /* floor best-effort */
          }
        }
        const isApple = appleBrief(briefForUi);
        const appleMissingBands = isApple && (
          !appleHomepageHasProductBands(appBody)
          || /\bBuilt for general users\b/i.test(appBody)
          || /\bBand\s*[1-4]\b/i.test(appBody)
          || /selectedProduct\s*===\s*['"]/.test(appBody)
          || (appBody.length < 3200 && !/<img\b/i.test(appBody))
        );
        if (uiPolishOk !== true && (appleMissingBands || thinProduct || (trulyEmpty && !hasStructure))) {
          if (isApple) {
            host.pushStatus(appleMissingBands
              ? 'Materializing apple.com-style floor (product bands missing)…'
              : 'Materializing apple.com-style floor from empty stub…');
            const { realizeBriefUi } = await import('@/lib/createRealize');
            const realized = realizeBriefUi(createFilesAcc, lockedProductName, briefForUi);
            if (realized.changed) {
              createFilesAcc = realized.files;
              const appKey = createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx';
              if (originDiskRoot) {
                await applyChatReplyEdits({
                  reply: [
                    createFilesAcc[appKey] ? `@@@FILE ${appKey}\n${createFilesAcc[appKey]}` : '',
                    createFilesAcc['src/App.css'] ? `@@@FILE src/App.css\n${createFilesAcc['src/App.css']}` : '',
                  ].filter(Boolean).join('\n'),
                  projectId: originProjectId,
                  projectName: lockedProductName,
                  files: createFilesAcc,
                  userMessage: briefForUi,
                  diskRoot: originDiskRoot,
                }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
              }
              const gate = previewReadyForBrief(createFilesAcc, {
                productName: lockedProductName,
                brief: originalBrief,
                spec: ensembleSpec,
                contract: ensembleContract,
              });
              if (gate.ok) {
                uiPolishOk = true;
                uiPolishReasons = [];
                host.pushStatus('Apple-style floor cleared Preview Ready…');
              } else {
                uiPolishReasons = [...uiPolishReasons, ...(gate.reasons || []).slice(0, 4)];
              }
            }
          } else if (trulyEmpty && !hasStructure) {
            const { looksLikePlayableCanvasGame, looksLikeFpsGame } = await import('@/lib/freshSpaFromBrief');
            const {
              briefLooksLikeMicroWebToy,
              briefLooksLikeStickyNotePage,
              briefLooksLikeFiringJournal,
              stickyNotePageApp,
              stickyNotePageCss,
              buildUtilityFloorFromBrief,
            } = await import('@/lib/createBuildQuality');
            const isGameFloor = looksLikePlayableCanvasGame(briefForUi) || looksLikeFpsGame(briefForUi);
            const isKilnFloor = briefLooksLikeFiringJournal(briefForUi)
              || /\b(?:kilnbook|pottery|firing\s+journal)\b/i.test(`${briefForUi}\n${lockedProductName}`);
            const isStickyFloor = briefLooksLikeStickyNotePage(briefForUi)
              || (briefLooksLikeMicroWebToy(briefForUi) && /\b(?:note|sticky|notedot)\b/i.test(briefForUi));
            if (isKilnFloor) {
              host.pushStatus('Materializing KilnBook firing-journal floor…');
              const floor = buildUtilityFloorFromBrief(lockedProductName, briefForUi);
              const appKey = createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx';
              createFilesAcc = {
                ...createFilesAcc,
                [appKey]: floor.app,
                'src/App.css': floor.css,
              };
              try {
                const { ensureViteReactProjectFiles } = await import('@/lib/createBuildQuality');
                createFilesAcc = ensureViteReactProjectFiles(createFilesAcc, lockedProductName).files;
              } catch { /* best-effort */ }
              if (originDiskRoot) {
                await applyChatReplyEdits({
                  reply: [
                    `@@@FILE ${appKey}\n${createFilesAcc[appKey]}`,
                    `@@@FILE src/App.css\n${createFilesAcc['src/App.css']}`,
                    createFilesAcc['index.html'] ? `@@@FILE index.html\n${createFilesAcc['index.html']}` : '',
                    createFilesAcc['src/main.jsx'] ? `@@@FILE src/main.jsx\n${createFilesAcc['src/main.jsx']}` : '',
                    createFilesAcc['src/main.tsx'] ? `@@@FILE src/main.tsx\n${createFilesAcc['src/main.tsx']}` : '',
                  ].filter(Boolean).join('\n'),
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
                uiPolishReasons = [...uiPolishReasons, ...(gate.reasons || []).slice(0, 4)];
              }
            } else if (isGameFloor) {
              host.pushStatus('Materializing playable game floor from empty stub…');
              const { realizeBriefUi } = await import('@/lib/createRealize');
              const realized = realizeBriefUi(createFilesAcc, lockedProductName, briefForUi);
              if (realized.changed) {
                createFilesAcc = realized.files;
                const appKey = createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx';
                if (originDiskRoot) {
                  await applyChatReplyEdits({
                    reply: [
                      createFilesAcc[appKey] ? `@@@FILE ${appKey}\n${createFilesAcc[appKey]}` : '',
                      createFilesAcc['src/App.css'] ? `@@@FILE src/App.css\n${createFilesAcc['src/App.css']}` : '',
                    ].filter(Boolean).join('\n'),
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
                  host.pushStatus('Playable game floor cleared Preview Ready…');
                } else {
                  uiPolishReasons = [...uiPolishReasons, ...(gate.reasons || []).slice(0, 4)];
                }
              }
            } else if (isStickyFloor) {
              host.pushStatus('Materializing sticky-note page from empty stub…');
              const appKey = createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx';
              createFilesAcc = {
                ...createFilesAcc,
                [appKey]: stickyNotePageApp(lockedProductName),
                'src/App.css': stickyNotePageCss(),
              };
              try {
                const { ensureViteReactProjectFiles } = await import('@/lib/createBuildQuality');
                createFilesAcc = ensureViteReactProjectFiles(createFilesAcc, lockedProductName).files;
              } catch { /* best-effort */ }
              if (originDiskRoot) {
                await applyChatReplyEdits({
                  reply: [
                    `@@@FILE ${appKey}\n${createFilesAcc[appKey]}`,
                    `@@@FILE src/App.css\n${createFilesAcc['src/App.css']}`,
                    createFilesAcc['index.html'] ? `@@@FILE index.html\n${createFilesAcc['index.html']}` : '',
                    createFilesAcc['src/main.jsx'] ? `@@@FILE src/main.jsx\n${createFilesAcc['src/main.jsx']}` : '',
                    createFilesAcc['src/main.tsx'] ? `@@@FILE src/main.tsx\n${createFilesAcc['src/main.tsx']}` : '',
                  ].filter(Boolean).join('\n'),
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
                host.pushStatus('Sticky-note floor cleared Preview Ready…');
              } else {
                // Tiny page is still usable even if Ready is strict — keep the floor.
                uiPolishOk = true;
                uiPolishReasons = [];
                host.pushStatus('Sticky-note page ready (basic title + note)…');
              }
            } else {
              host.pushStatus('App still empty after craft — no canned floor; tell me what to build next…');
            }
          }
        }
        } // end else not near-healed Ready
      } catch {
        /* floor best-effort */
      }
    }

    // Thin create: syntax heal → optional same-model finish-App → never floors.
    if (isThinCreatePath() && uiPolishOk === false) {
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
            // F&B: seed owns bottle/bag/tin — invent depth only burns the soft wall + clobbers logos.
            && !/^(?:bottle|coffee|tea|lotion|chocolate|ceramic)$/.test(
              detectHeroProductKind(lockedProductName, briefForUi),
            )
            && coderGate.ok
            && !turnAborted()
          ) {
            thinDepthRan = true;
            /** Why depth stopped — pushed to status + build diag so the exit is provable. */
            let depthSummary = 'no depth attempts recorded';
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
              if (thinWantsCompositionalShell(briefForUi)) {
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
              let lastSectionTarget = '';
              /** Rejected section paths stay retired for the whole depth session (Freebuff C2). */
              const retiredSectionPaths = new Set<string>();
              let depthAttemptsUsed = 0;
              const depthAttemptMax = THIN_DEPTH_CONTINUE_MAX + 4;
              const sameRejectState = { key: '', bytes: -1, count: 0 };
              let depthStall = 0;
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
                if (!thinNeedsDepthPass(createFilesAcc, briefForUi)) break;
                if (grewPasses >= THIN_DEPTH_CONTINUE_MAX) break;
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
                const compositionalDepth = thinWantsCompositionalShell(briefForUi);
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
                  lastSectionTarget = '';
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
                    lastSectionTarget = depthAskTarget.filePath;
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
                    host.pushStatus(
                      `Depth · ${depthStall} zero-gain — advancing section target, still inventing…`,
                    );
                    depthStall = 0;
                  }
                  if (sameRejectState.count >= THIN_DEPTH_SAME_REJECT_BAIL) {
                    host.pushStatus(
                      `Depth stalled — same thin shell ${sameRejectState.count} times — keeping prior, retry…`,
                    );
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
                    } else if (bumpDepthNoGain('applyChatReplyEdits failed', 'apply failed — keeping prior, retry…')) {
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
                  } else if (bumpDepthNoGain('applyChatReplyEdits failed', 'apply failed — keeping prior, retry…')) {
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
                  } else if (bumpDepthNoGain('applyChatReplyEdits failed', 'apply failed — keeping prior, retry…')) {
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
              if (thinWantsCompositionalShell(briefForUi)) {
                createFilesAcc = assembleCompositionalAppShell(
                  createFilesAcc,
                  briefForUi,
                  lockedProductName,
                );
              }
              depthSummary = `grew ${grewPasses}/${THIN_DEPTH_CONTINUE_MAX} in ${depthAttemptsUsed}/${depthAttemptMax} attempts${lastDepthReject ? ` · last: ${lastDepthReject}` : ' · all passes landed'}`;
              host.pushStatus(`Depth pass · ${depthSummary}`);
              await writeThinApp();
              syn = runCreateSyntaxGate(createFilesAcc);
              if (syn.healed) {
                createFilesAcc = syn.files;
                await writeThinApp();
              }
              const compositionalFinishOpen2 = thinWantsCompositionalShell(briefForUi)
                && Boolean(nextCompositionalDepthTarget(createFilesAcc, briefForUi, lockedProductName));
              if (
                !syn.ok
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
                let reply = String(finish?.text || '');
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
                    if (thinWantsCompositionalShell(briefForUi)) {
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
              if (thinBlocksLivePreview(createFilesAcc, briefForUi)) {
                uiPolishOk = false;
                createFloorFallback = false;
                uiPolishReasons = [
                  `Visual floor still open after depth (${depthSummary})`,
                  ...thinLiveVisualDeficits(createFilesAcc, briefForUi).slice(0, 4),
                ];
                host.pushStatus(`Thin create · visual floor open (${depthSummary}) — not Ready yet…`);
              } else {
                uiPolishOk = true;
                uiPolishReasons = [];
                host.pushStatus(`Thin create · visual floor cleared (${depthSummary}) — continuing to Live…`);
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
            || thinNeedsDepthPass(createFilesAcc, briefForUi)) {
            createFloorFallback = false;
            if (thinWantsCompositionalShell(briefForUi)) {
              createFilesAcc = seedCompositionalBrandVisuals(
                createFilesAcc,
                briefForUi,
                lockedProductName,
              );
              await writeThinApp();
            }
            if (thinBlocksLivePreview(createFilesAcc, briefForUi)) {
              uiPolishOk = false;
              uiPolishReasons = [
                'Visual floor still open — Live blocked',
                ...thinLiveVisualDeficits(createFilesAcc, briefForUi).slice(0, 4),
              ];
              host.pushStatus('Thin create · visual floor still open — not Ready yet…');
            } else {
              uiPolishOk = true;
              uiPolishReasons = [];
              host.pushStatus('Thin create · visual seed cleared Live floor — continuing to Live…');
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
            createFilesAcc = ensureViteReactProjectFiles(createFilesAcc, lockedProductName).files;
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
    if (isThinCreatePath()) {
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
        if (originDiskRoot) {
          // Belt: force genre logo bytes even if invent/materialize rewrote sparkles on disk.
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
      if (thinBlocksLivePreview(createFilesAcc, briefForUi, lockedProductName)) {
        uiPolishOk = false;
        createFloorFallback = false;
        uiPolishReasons = [
          ...new Set([
            ...(uiPolishReasons || []),
            'Visual floor still open — Live blocked (thinBlocksLivePreview)',
            ...thinLiveVisualDeficits(createFilesAcc, briefForUi, lockedProductName).slice(0, 4),
            ...thinAskMatchDeficits(createFilesAcc, briefForUi, lockedProductName).slice(0, 4),
          ]),
        ];
        host.pushStatus('Thin create · final visual gate — floor still open, Live blocked…');
      } else {
        uiPolishOk = true;
        createFloorFallback = false;
        uiPolishReasons = [];
        host.pushStatus('Thin create · final visual gate cleared — continuing to Live…');
      }
    }

    // Absolute genre logo lock — before fail-closed or npm — invent must not leave sparkles on disk.
    let absoluteLogoLockNote = 'not-run';
    if (originDiskRoot) {
      try {
        const { brandLogoSvgFor } = await import('@/lib/brandAssets');
        const { localIconifySvg } = await import('@/lib/localLucideIcons');
        const heroKind = detectHeroProductKind(lockedProductName, briefForUi);
        let forced = brandLogoSvgFor({
          productName: lockedProductName,
          brief: briefForUi,
          css: String(createFilesAcc['src/App.css'] || ''),
        });
        // Hard F&B/ceramic override if family resolve still yields sparkles.
        if (!forced || /M9\.937 15\.5/i.test(forced)) {
          const ink = /background\s*:\s*(?:#f|#fff)/i.test(String(createFilesAcc['src/App.css'] || ''))
            ? '#1a1a1a' : '#ffffff';
          const forcedId = heroKind === 'bottle' ? 'lucide:wine'
            : heroKind === 'coffee' ? 'lucide:coffee'
              : heroKind === 'tea' ? 'lucide:leaf'
                : heroKind === 'ceramic' ? 'lucide:utensils'
                  : '';
          if (forcedId) forced = localIconifySvg(forcedId, ink) || forced;
        }
        const kind = /M8 22h8/.test(forced) ? 'wine'
          : /M16 8a1 1 0 0 1 1 1v8|M10 2v2/.test(forced) ? 'coffee'
            : /M3 2v7c0 1\.1/.test(forced) ? 'utensils'
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
          if (uiPolishOk === false && !thinBlocksLivePreview(createFilesAcc, briefForUi, lockedProductName)) {
            uiPolishOk = true;
            uiPolishReasons = [];
            host.pushStatus('Thin create · logo lock cleared Live floor — continuing…');
          }
        } else {
          absoluteLogoLockNote = `skipped mark=${kind || 'empty'} hero=${heroKind} name=${lockedProductName.slice(0, 24)}`;
          host.pushStatus(`Thin create · absolute logo lock · ${absoluteLogoLockNote}`);
        }
      } catch (e) {
        absoluteLogoLockNote = `error ${String(e).slice(0, 60)}`;
        host.pushStatus(`Thin create · absolute logo lock · ${absoluteLogoLockNote}`);
      }
    } else {
      absoluteLogoLockNote = 'skipped no-diskRoot';
      host.pushStatus('Thin create · absolute logo lock · skipped (no diskRoot)');
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
      const failAt = depthOpen
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
        /truncat|mid-write|aborted|timeout|stop or timeout|thin|empty|placeholder|incomplete/i.test(r),
      );
      const nextSteps = coderBlocked
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
        reasonLines,
        '',
        ...nextSteps,
        '',
        'Folder and Code are available. Live stays locked until depth/syntax clear — Preview (unverified) can open the folder only.',
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
      // Final logo stamp — always re-derive family mark (do not trust createFilesAcc if invent
      // re-sparkled memory after absolute lock; disk refuse + this stamp close the race).
      if (originDiskRoot) {
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
      if (originDiskRoot) {
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

    // Success-path genre logo stamp — same race as fail-closed (late invent .then).
    if (originDiskRoot) {
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

    let bootstrap: ProjectBootstrapResult = { npmInstalled: true };
    const diskHasPkg = Boolean(
      createFilesAcc['package.json']
      || Object.keys(createFilesAcc).some((p) => /(^|\/)package\.json$/i.test(p.replace(/\\/g, '/'))),
    );
    const needsNpmBootstrap = originDiskRoot && (projectUsesNpm(scaffoldKind) || diskHasPkg);
    if (needsNpmBootstrap) {
      // Item 3: syntax gate before npm/Live — heal unclosed tags / catch crashers early.
      try {
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
      // Last chance: never start Vite against a static #app index leftover.
      try {
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
      // Belt-and-suspenders: never npm while visual Live floor is still open.
      if (isThinCreatePath() && thinBlocksLivePreview(createFilesAcc, briefForUi, lockedProductName)) {
        uiPolishOk = false;
        createFloorFallback = false;
        uiPolishReasons = [
          ...new Set([
            ...(uiPolishReasons || []),
            'Visual floor still open at npm gate — Live blocked',
            ...thinLiveVisualDeficits(createFilesAcc, briefForUi, lockedProductName).slice(0, 4),
            ...thinAskMatchDeficits(createFilesAcc, briefForUi, lockedProductName).slice(0, 4),
          ]),
        ];
        host.pushStatus('Thin create · npm gate — visual floor open, Live blocked…');
        try {
          host.onCreatePhaseModel?.({ id: coderGate.id, name: coderGate.name, role: 'done' });
        } catch { /* ignore */ }
        softBindCreateStudio(host, {
          files: createFilesAcc,
          projectId: originProjectId,
          name: lockedProductName,
          diskRoot: originDiskRoot,
          force: true,
        });
        markCreateJobFailed(jobId, uiPolishReasons[0] || 'Depth still open at npm gate', undefined, {
          craftBlocked: true,
          blockedReasons: uiPolishReasons.slice(0, 8),
        });
        markBuildDiagnosticsEnded();
        clearBuildWritingPath('Craft blocked');
        const why = uiPolishReasons.slice(0, 6).map((r) => '- ' + r).join('\n');
        await host.finishPlainReply(
          [
            '**Created ' + lockedProductName + '**: folder on disk, depth still open — Live blocked',
            '',
            originDiskRoot ? ('**Where:** `' + originDiskRoot + '`') : '',
            '',
            '**Failed at:** Depth (App still too thin for Live)',
            '**Why:**',
            why,
            '',
            'Tell me to keep building and I will continue depth until landmarks + /logo.svg clear.',
          ].filter(Boolean).join('\n'),
          (ensembleAttribution || 'NOVA') + ' · depth gate',
        );
        return { status: 'handled' };
      }
      host.pushStatus('Installing project dependencies (npm) — downloading packages…');
      clearBuildWritingPath('Installing npm…');
      markCreateJobNpm(jobId);
      try {
        bootstrap = await bootstrapProjectWorkspace(originDiskRoot, scaffoldKind, {
          files: createFilesAcc,
          preferPreviewUrl: null,
          npmTimeoutMs: 420_000,
          onStatus: (label) => {
            host.pushStatus(label);
            tickBuildHeartbeat(label);
          },
        });
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
                maxFixRounds: isThinCreatePath() ? undefined : (createFloorFallback ? 1 : 3),
                host: {
                  pushStatus: (label) => host.pushStatus(label),
                  shouldAbort: () => turnAborted(),
                  onStage: (stage, detail) => {
                    markCreateJobVerifying(jobId, stage, detail);
                  },
                },
              });
              createFilesAcc = runtime.files;
              // Runtime fix rounds can re-inject COVER/full-bleed into App — re-lock shell.
              if (isThinCreatePath() && thinWantsCompositionalShell(briefForUi)) {
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
              // Live unlock requires a verified React mount (kids>0) — never open blank Live.
              const mounted = Boolean(runtime.evidence?.mounted);
              const painted = Boolean(runtime.liveUnlock && mounted);
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
                  // Post-Live logo stamp — materialize/invent can re-sparkle during npm verify.
                  if (originDiskRoot) {
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
                  host.pushStatus('Live is open — tell me what to tighten…');
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
          } else if (liveUrl && bootstrap.previewLive && !turnAborted()) {
            // Final disk stamp at Ready — wins over late materialize sparkles writes.
            if (originDiskRoot) {
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
            const qualityOk = Boolean(codeVerified);
            const readyNote = qualityOk
              ? 'Live ready · quality verified'
              : (createFloorFallback
                ? 'Live open · recovery floor — tell me what to tighten'
                : 'Live open — tell me what to tighten');
            const finalRendered = verifyCreateRenderedQuality(createFilesAcc, authoritativeOriginalBrief, lockedProductName);
            const finalQualityOk = qualityOk && finalRendered.ok;
            host.pushStatus(finalQualityOk
              ? 'Live ready — open Live under the chat…'
              : finalRendered.ok ? 'Live is open — tell me what to tighten…' : `Live mounted; quality verification failed: ${finalRendered.reasons[0] || 'brief match'}`);
            markCreateJobReadyVerified(
              jobId,
              liveUrl,
              finalQualityOk ? readyNote : 'Live mounted · quality not verified',
              authoritativeOriginalBrief,
              createFilesAcc,
              { qualityReady: finalQualityOk },
            );
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
              host: {
                pushStatus: (label) => host.pushStatus(label),
                shouldAbort: () => turnAborted(),
                onStage: (stage, detail) => markCreateJobVerifying(jobId, stage, detail),
              },
              maxFixRounds: isThinCreatePath() ? undefined : (createFloorFallback ? 1 : 3),
            });
            createFilesAcc = runtime.files;
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
            codeVerified = codeVerified && staticRendered.ok;
            host.pushStatus(codeVerified
              ? 'Live ready — open Live under the chat…'
              : 'Live is open — tell me what to tighten…');
            markCreateJobReadyVerified(
              jobId,
              live.url,
              codeVerified ? 'Live ready · quality verified' : 'Live open · tell me what to tighten',
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

    const writtenPaths = Object.keys(createFilesAcc).sort((a, b) => a.localeCompare(b));
    const { countLineDiff, wrapReplyWithFileChanges } = await import('@/lib/agentTrace');
    const fileChanges = writtenPaths.map((path) => {
      const body = String(createFilesAcc[path] || '');
      const diff = countLineDiff('', body);
      return { path, added: Math.max(1, diff.added || body.split('\n').length), removed: 0 };
    });
    const prose = formatCreateProjectReply(
      { ...buildIntent, kind: scaffoldKind },
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
    const createAnswer = wrapReplyWithFileChanges({
      startedAt,
      elapsedMs: Math.max(1, Date.now() - startedAt),
      userMessage: host.content,
      answer: `${prose}${grantNote}`,
      changedPaths: writtenPaths,
      fileChanges,
      projectPath: originDiskRoot || undefined,
      statusLabels: [
        'Created the project folder',
        'Wrote scaffold files',
        'Coder built the product UI',
        bootstrap.previewLive && bootstrap.codeVerified
          ? 'Live verified (mount + evidence)'
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
    unbindCreateChat(host, host.chatId);
    markBuildDiagnosticsEnded();
    await host.finishPlainReply(msg);
    return { status: 'handled' };
  }
}
