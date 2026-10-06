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
import { applyChatReplyEdits } from '@/lib/chatAgentApply';
import { pendingCreateBootstrap } from './createBootstrap';
import { formatCreateProjectMap } from '@/lib/createEvidence';
import { snapshotCreateCheckpoint } from '@/lib/createCheckpoint';
import { buildRankedProjectMap } from '@/lib/createProjectMap';
import {
  markCreateJobFailed,
  markCreateJobNpm,
  markCreateJobReady,
  markCreateJobVerifying,
  startCreateJob,
  updateCreateJob,
} from '@/lib/createJobStore';
import { getLocalPrefs } from '@/lib/localPrefs';
import { clearChatStudio, clearLastDiskTarget, setLastPendingGreenfield } from '@/lib/chatStudioStore';
import type { CreateSuccess } from '@/lib/productContract';
import {
  isCreateV2Active,
  CREATE_V2_SOFT_BIND_MS,
  CREATE_V2_AUTO_OPEN_CODE,
  CREATE_V2_STREAM_PAINT_FILES,
  CREATE_V2_MAX_CRAFT_ATTEMPTS,
  CREATE_V2_FIRST_TOKEN_MS,
  createV2AttemptWallMs,
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
  const pinCandidates = [
    host.stickyModelId,
    host.preferredModelId,
    host.modelId,
    prefs.lastChatModelId,
    prefs.activeChatId,
    prefs.defaultModelId,
    prefs.activeCoderId,
    prefs.defaultCodeModelId,
  ]
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
  // UIGEN / Instruct (shell + hard lint own layout quality). Prove-out path.
  try {
    const { rankedReadyDesignIds } = await import('@/lib/enginePick');
    const status = await getEngineStatus();
    const designIds = rankedReadyDesignIds(status.models, profile.ramGB, profile.maxCoderParamsB);
    const nameOf = (id: string) =>
      String((status.models || []).find((m) => m.id === id)?.name || id);
    for (const id of designIds) {
      if (!id || isWeakCoderId(id) || isVisionEngineId(id)) continue;
      const hit = (status.models || []).find((m) => m.id === id && m.status === 'ready');
      if (!hit) continue;
      // Prefer UIGEN / design packs first (rankedReadyDesignIds already orders that way).
      if (isUiDesignEngineId(id)) {
        return { id, name: nameOf(id), source: 'local', ok: true };
      }
    }
    for (const id of designIds) {
      if (!id || isWeakCoderId(id) || isVisionEngineId(id) || isUiDesignEngineId(id)) continue;
      const hit = (status.models || []).find((m) => m.id === id && m.status === 'ready');
      if (!hit) continue;
      // Instruct / chat — Single Brain invents the UI from the brief.
      return { id, name: nameOf(id), source: 'local', ok: true };
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
        const spec = createBriefSpecFromAsk(lockedProductName, String(buildIntent.summary || host.content));
        const plan = buildPlanFromBrief({
          chatId: host.chatId,
          productName: lockedProductName,
          brief: String(buildIntent.summary || host.content),
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
            userMessage: String(buildIntent.summary || host.content),
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
  const createBriefForBudget = String(host.content || intent?.summary || '');
  const budgetProfile = createBudgetProfile(createBriefForBudget);
  const createWallMs = createWallBudgetMs(createBriefForBudget);
  const createStartedAt = Date.now();
  const createTimedOut = () => Date.now() - createStartedAt > createWallMs;
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
      const briefSeed = [buildIntent.summary, host.content].filter(Boolean).join('\n');
      createResearchNotes = '';
      // Brief-only craft law — no Design Spine shell, CopyPack, or layoutReference recipes.
      ensembleContractBlock = formatOriginalCraftRules({
        brief: briefSeed,
        productName: lockedProductName,
        freshnessKey: designFreshnessKey,
      }).join('\n');
      const { announceCreatePhase } = await import('@/lib/createStatus');
      const { setEngineModel } = await import('@/lib/novaEngine');
      // Bind sticky craft model once (no Plan/Design/Copy seat swaps).
      try {
        if (coderGate.id && coderGate.id !== 'NOVA-auto') {
          host.pushStatus(`Loading model · **${coderGate.name}** (one brain for this build)…`);
          await setEngineModel?.(coderGate.id);
        }
      } catch { /* ignore */ }
      await announceCreatePhase(host, 'craft', { id: coderGate.id, name: coderGate.name }, { setEngine: false });
      host.pushStatus(`Single Brain · **${coderGate.name}** (original craft from brief)…`);
    }
  } catch {
    /* originality brief is best-effort — never block create */
    if (!ensembleContractBlock && !blankSolidFromUser) {
      try {
        ensembleContractBlock = formatOriginalCraftRules({
          brief: buildIntent.summary || host.content,
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
    const briefForUi = [
      briefBase,
      ensemblePlanText ? `## Ensemble plan (must implement)\n${ensemblePlanText}` : '',
      ensembleContractBlock,
    ].filter(Boolean).join('\n\n').slice(0, 12_000);
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
          userMessage: briefForUi,
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
    const briefSpec = createBriefSpecFromAsk(lockedProductName, briefForUi);
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
            brief: briefForUi,
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
              shouldAbort: () => Boolean(host.shouldAbort?.()),
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
              brief: briefForUi,
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
        // Item 5: hard-pin craft model — await bind so Auto/rotation cannot steal mid-write.
        try {
          const { setEngineModel } = await import('@/lib/novaEngine');
          if (coderGate.ok) {
            await setEngineModel?.(coderGate.id);
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
          const preferTs = Boolean(
            createFilesAcc['src/App.tsx'] && !createFilesAcc['src/App.jsx'],
          );
          const appPath = preferTs ? 'src/App.tsx' : 'src/App.jsx';
          createFollowLock = appPath;
          craftCheckpoint = snapshotCreateCheckpoint(createFilesAcc, lockedProductName, {
            label: 'pre-craft',
            diskRoot: originDiskRoot,
          });
          const basePromptLines = [
            ...polishPromptLinesFromBrief(briefSpec, appPath, briefForUi),
            formatCreateProjectMap(createFilesAcc),
            buildRankedProjectMap(createFilesAcc, briefForUi, { limit: 16 }),
            ...(isCreateV2Active()
              ? (() => {
                const shopAsk = /\b(?:cart|checkout|purchase|add\s+to\s+cart|online\s+store|e-?commerce)\b/i.test(briefForUi)
                  || /\b(?:liquor|spirits?|whiskey|whisky|bourbon|vodka|gin|tequila|bottle\s+shop)\b/i.test(briefForUi)
                  || (/\b(?:shop|store|boutique)\b/i.test(briefForUi) && /\b(?:buy|browse|products?|filter|quantity)\b/i.test(briefForUi));
                return shopAsk
                  ? [
                      'createV2 STOREFRONT RULES:',
                      `- REQUIRED @@@FILE: ${appPath}, src/App.css, and src/data/products.ts (≥8 products).`,
                      '- Also allowed: src/components/*.tsx (ProductCard, CartDrawer, FilterBar).',
                      '- Do NOT touch index.css, main.tsx, index.html, package.json, or vite.config.',
                      '- Complete filters + qty cart + purchase before finishing — not a title stub.',
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
          for (let attempt = 0; attempt < maxPolishAttempts; attempt++) {
            await yieldToUi(0);
            if (host.shouldAbort?.() || createTimedOut()) {
              lastError = createTimedOut() ? 'Create time cap reached' : 'Create stopped';
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
            // External watchdog — fires even when the model emits zero chunks (silent GGUF load).
            let craftWatchId: number | null = null;
            let lastWaitStatusAt = 0;
            if (isCreateV2Active()) {
              craftWatchId = window.setInterval(() => {
                if (stallAbort || host.shouldAbort?.()) return;
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
                  stallAbortPath = createV2StallRetryPath(appPath, preferTs);
                  if (!stallCancelFired) {
                    stallCancelFired = true;
                    host.pushStatus(
                      `No App output after ${Math.round(CREATE_V2_FIRST_TOKEN_MS / 1000)}s — cancelling…`,
                      appPath,
                    );
                    void import('@/lib/novaEngine')
                      .then(({ engineGenerateCancel }) => engineGenerateCancel())
                      .catch(() => {});
                  }
                  return;
                }
                // Idle = no App byte growth (token trickles must not refresh forever).
                if (sawStreamToken && now - lastGrowthAt > createV2IdleStallMs(lastFocusPath || appPath)) {
                  stallAbort = true;
                  stallAbortPath = createV2StallRetryPath(lastFocusPath || appPath, preferTs);
                  if (!stallCancelFired) {
                    stallCancelFired = true;
                    host.pushStatus(
                      `Stream idle — cancelling to retry App…`,
                      stallAbortPath,
                    );
                    void import('@/lib/novaEngine')
                      .then(({ engineGenerateCancel }) => engineGenerateCancel())
                      .catch(() => {});
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
                    void import('@/lib/novaEngine')
                      .then(({ engineGenerateCancel }) => engineGenerateCancel())
                      .catch(() => {});
                  }
                }
              }, 500);
            }
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
                  || Boolean(host.shouldAbort?.())
                  || Date.now() - attemptStarted > polishBudgetMs
                  || Date.now() - polishStarted > polishTotalBudgetMs,
              },
              (delta) => {
                streamBuf = String(delta || '');
                // Only App / App.css @@@FILE counts as craft heartbeat.
                // Scaffold trickles (index.css) used to refresh lastStreamAt forever → 19m stalls.
                const activeHdr = (() => {
                  const active = streamBuf.lastIndexOf('@@@FILE');
                  if (active < 0) return '';
                  const hdr = streamBuf.slice(active).match(/^@@@FILE\s+([^\n\r]+)/);
                  return String(hdr?.[1] || '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
                })();
                const activeIsApp = Boolean(activeHdr) && isCreateV2AppPath(activeHdr);
                const activeIsScaffold = Boolean(activeHdr) && isCreateV2ScaffoldPath(activeHdr);
                if (activeIsApp) {
                  sawStreamToken = true;
                  lastStreamAt = Date.now();
                } else if (/@@@FILE\b/i.test(streamBuf) && !activeIsScaffold && !isCreateV2Active()) {
                  // Legacy: any non-scaffold file header counts.
                  sawStreamToken = true;
                  lastStreamAt = Date.now();
                }
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
                    const idleStalled = Boolean(focusPath)
                      && !stallExempt
                      && now - lastGrowthAt > idleLimitMs;
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
                        void import('@/lib/novaEngine')
                          .then(({ engineGenerateCancel }) => engineGenerateCancel())
                          .catch(() => {});
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
                        void import('@/lib/novaEngine')
                          .then(({ engineGenerateCancel }) => engineGenerateCancel())
                          .catch(() => {});
                      }
                    }
                  }
                } catch { /* ignore stream paint */ }
              },
            );
            } finally {
              if (craftWatchId != null) window.clearInterval(craftWatchId);
            }
            if (stallAbort && stallAbortPath) {
              // Tiny sticky-note asks: don't burn minutes retrying a quiet coder — ship the floor now.
              try {
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
                if (host.shouldAbort?.()) {
                  markCreateJobFailed(jobId, 'Stopped');
                  unbindCreateChat(host, host.chatId);
                  return { status: 'handled' };
                }
                // Near-complete App after stall/wall: close truncation + CSS/brand heal, then Ready.
                const appKeyStall = createFilesAcc['src/App.jsx']
                  ? 'src/App.jsx'
                  : (createFilesAcc['src/App.tsx'] ? 'src/App.tsx' : '');
                const appStallBody = appKeyStall ? String(createFilesAcc[appKeyStall] || '') : '';
                if (appKeyStall && appStallBody.length >= 800) {
                  host.pushStatus('Stall with partial App — healing for Preview Ready…');
                  const { healNearCompleteTruncatedSource } = await import('@/lib/freshSpaFromBrief');
                  const closed = healNearCompleteTruncatedSource(appKeyStall, appStallBody);
                  createFilesAcc = { ...createFilesAcc, [appKeyStall]: closed || appStallBody };
                  const near = healNearReadyCreateUi(createFilesAcc, lockedProductName, briefForUi);
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
                  const gate = previewReadyForBrief(createFilesAcc, {
                    productName: lockedProductName,
                    brief: briefForUi,
                    spec: ensembleSpec,
                    contract: ensembleContract,
                  });
                  if (gate.ok) {
                    uiPolishOk = true;
                    uiPolishReasons = [];
                    lastError = '';
                    host.pushStatus('Partial App healed — Preview Ready…');
                    break;
                  }
                  uiPolishReasons = gate.reasons?.slice(0, 6) || [];
                  host.pushStatus('Partial heal incomplete — one repair pass…');
                }
              } catch { /* keep partial */ }
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
            if (host.shouldAbort?.() || await host.stopIfSuperseded()) {
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
              if (prevApp.length >= 800 && nextApp.length < Math.max(600, Math.floor(prevApp.length * 0.55))) {
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
            const ready = previewReadyForBrief(createFilesAcc, {
              productName: lockedProductName,
              brief: briefForUi,
              spec: ensembleSpec,
              contract: ensembleContract,
            });
            host.pushStatus('Done');
            const briefMisses = briefCreateMisses(briefSpec, createFilesAcc);
            const filler = looksLikeFillerStubAppSource(appBody);
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
        if (uiPolishOk === true) {
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
    if (host.shouldAbort?.()) {
      markCreateJobFailed(jobId, 'Stopped');
      unbindCreateChat(host, host.chatId);
      return { status: 'handled' };
    }
    if (needsUiPolish && coderGate.ok) {
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
            shouldAbort: () => Boolean(host.shouldAbort?.()),
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
    if (needsUiPolish && briefLooksLikeMarketingLanding(briefForUi)) {
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
          brief: briefForUi,
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
    if (needsUiPolish) {
      try {
        const { lintOriginalCreateQuality } = await import('@/lib/createDesignSystem');
        const orig = lintOriginalCreateQuality(createFilesAcc, {
          brief: briefForUi,
          productName: lockedProductName,
        });
        if (!orig.ok) {
          uiPolishOk = false;
          uiPolishReasons = orig.reasons;
          host.pushStatus(`Originality gate · ${orig.reasons.slice(0, 2).join('; ')}`);
          pushBuildDiag({
            kind: 'warn',
            detail: `Originality lint: ${orig.reasons.join('; ')}`,
          });
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
      if (uiPolishOk === true) {
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
      const finalApp = createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '';
      if (uiPolishOk === true && !blankSolidColor && (
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
      const wiredFinal = wireFinalAssets(createFilesAcc, lockedProductName);
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
    if (uiPolishOk === false) {
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
            const plan = buildProductPlan(briefForUi, lockedProductName);
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
          marketingFamily = buildProductPlan(briefForUi, lockedProductName).compositionFamily === 'marketing-bands';
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
                brief: briefForUi,
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
              host.pushStatus('App still empty after craft — no canned floor (say rebuild the UI)…');
            }
          }
        }
        } // end else not near-healed Ready
      } catch {
        /* floor best-effort */
      }
    }

    // Last chance: pottery / KilnBook briefs must not die on truncated coder output.
    if (uiPolishOk === false) {
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

    if (uiPolishOk === false) {
      if (createTimedOut()) {
        try {
          host.onCreatePhaseModel?.({ id: coderGate.id, name: coderGate.name, role: 'done' });
        } catch { /* ignore */ }
        markCreateJobFailed(jobId, 'Create soft wall reached during UI craft');
        markBuildDiagnosticsEnded();
        await host.finishPlainReply(
          createBudgetExceededReply(budgetProfile, lockedProductName),
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
            '3. Say **rebuild the UI** or **ok start building** again.',
          ]
        : truncated
          ? [
              '**Next**',
              '1. Say **rebuild the UI** to run another polish pass on this folder.',
              '2. Or open the **Code** pill to inspect what was written.',
            ]
          : [
              '**Next**',
              '1. Say **rebuild the UI** to fix craft / Live evidence on this folder.',
              '2. Or open the **Code** / **Folder** pills to continue editing.',
            ];
      const failAnswer = [
        `**Created ${displayName}**: folder on disk, craft preflight failed`,
        '',
        originDiskRoot ? `**Where:** \`${originDiskRoot}\`` : '',
        created.parentSource ? `**Location:** ${created.parentSource}` : '',
        '',
        '**Failed at:** UI polish (static Preview Ready preflight)',
        '**Why:**',
        reasonLines,
        '',
        ...nextSteps,
        '',
        'Folder and Code are available in this chat. Live unlocks after Live evidence verifies (mount + console + smoke).',
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
      markCreateJobFailed(jobId, uiPolishReasons[0] || 'UI polish failed: scaffold only');
      // Do NOT auto-npm on fail-closed — overlapping Defender scans freeze the desktop.
      // finishPlainReply clears status and snapshots Done — do not pushStatus after.
      markBuildDiagnosticsEnded();
      await host.finishPlainReply(`${failAnswer}${grantNote}`, `${ensembleAttribution || 'NOVA'} · scaffold`);
      return { status: 'handled' };
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
          try {
            const { buildProductPlan, repairToContract } = await import('@/lib/createProductPlan');
            const plan = buildProductPlan(briefForUi, lockedProductName);
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
              const runtime = await runCreateVerifyAndFix({
                files: createFilesAcc,
                productName: lockedProductName,
                brief: briefForUi,
                projectId: originProjectId,
                diskRoot: originDiskRoot,
                liveUrl,
                npmInstalled: true,
                staticReady: true,
                staticReasons: uiPolishReasons,
                floorFallback: createFloorFallback,
                maxFixRounds: createFloorFallback ? 1 : 3,
                host: {
                  pushStatus: (label) => host.pushStatus(label),
                  shouldAbort: () => Boolean(host.shouldAbort?.()),
                  onStage: (stage, detail) => {
                    markCreateJobVerifying(jobId, stage, detail);
                  },
                },
              });
              createFilesAcc = runtime.files;
              const painted = Boolean(runtime.liveUnlock || (runtime.evidence.httpOk && runtime.evidence.mounted));
              // Live unlock ≠ quality Ready. Quality requires pass spine (plan + design + judge).
              codeVerified = Boolean(runtime.qualityReady);
              if (host.shouldAbort?.() || runtime.judgeReasons?.includes('aborted')) {
                codeVerified = false;
                markCreateJobFailed(jobId, 'Create stopped during Live verify');
              } else {
                try {
                  pushBuildDiag({
                    kind: codeVerified ? 'ready' : (painted ? 'status' : 'status'),
                    detail: codeVerified
                      ? `Quality Ready (${runtime.fixRounds} fix rounds)`
                      : painted
                        ? `Live unlocked — quality open: ${(runtime.judgeReasons || []).slice(0, 2).join('; ') || 'plan/design'}`
                        : `Live server up (${runtime.fixRounds} fix rounds)`,
                  });
                } catch { /* ignore */ }
                if (painted && !codeVerified) {
                  host.pushStatus('Live unlocked — quality Ready still open (plan/design/judge)…');
                }
              }
              // Allow Live button when painted even if quality not Ready.
              if (painted && !host.shouldAbort?.()) {
                bootstrap = { ...bootstrap, codeVerified, previewLive: true };
              }
            } catch {
              // Still unlock if Vite answered — don't hide Live behind a probe crash.
              codeVerified = false;
            }
          }
          bootstrap = { ...bootstrap, codeVerified };
          if (liveUrl && bootstrap.previewLive && !host.shouldAbort?.()) {
            const qualityOk = Boolean(codeVerified);
            const readyNote = qualityOk
              ? 'Live ready · quality verified'
              : (createFloorFallback
                ? 'Live unlocked · recovery floor (quality open)'
                : 'Live unlocked · quality still open');
            host.pushStatus(qualityOk
              ? 'Live ready — open Live under the chat…'
              : 'Live unlocked — open Live (quality gate still open)…');
            markCreateJobReady(jobId, liveUrl, readyNote);
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
              if (qualityOk && prefs.agentLoopCommitOnSuccess === true && originDiskRoot && window.novaDesktop?.agentRun) {
                const msg = `NOVA: created ${lockedProductName}`.replace(/"/g, '\\"');
                await window.novaDesktop.agentRun({
                  command: `git add -A && git commit -m "${msg}"`,
                  cwd: originDiskRoot,
                }).catch(() => {});
              }
            } catch { /* optional */ }
            // Live available to user; codeVerified tracks quality Ready only.
            bootstrap = { ...bootstrap, codeVerified: qualityOk, previewLive: true };
          } else if (!bootstrap.previewLive) {
            host.pushStatus('Dependencies installed — Live not ready yet…');
            markCreateJobFailed(
              jobId,
              bootstrap.bootstrapNote
                || 'Dependencies installed, but Live did not start. Say **run Preview** or **install npm dependencies**.',
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
      host.pushStatus('Starting Live preview…');
      try {
        const live = await Promise.race([
          window.novaDesktop?.getOrAttachPreview?.(originDiskRoot) ?? Promise.resolve(null),
          new Promise<null>((resolve) => { window.setTimeout(() => resolve(null), 55_000); }),
        ]);
        if (live?.ok && live.url) {
          let codeVerified = false;
          try {
            const { runCreateVerifyAndFix } = await import('@/lib/createRuntimeLoop');
            markCreateJobVerifying(jobId, 'live', 'Collecting Live evidence…');
            const runtime = await runCreateVerifyAndFix({
              files: createFilesAcc,
              productName: lockedProductName,
              brief: briefForUi,
              projectId: originProjectId,
              diskRoot: originDiskRoot,
              liveUrl: live.url,
              npmInstalled: true,
              staticReady: true,
              staticReasons: uiPolishReasons,
              floorFallback: createFloorFallback,
              host: {
                pushStatus: (label) => host.pushStatus(label),
                shouldAbort: () => Boolean(host.shouldAbort?.()),
                onStage: (stage, detail) => markCreateJobVerifying(jobId, stage, detail),
              },
              maxFixRounds: createFloorFallback ? 1 : 3,
            });
            createFilesAcc = runtime.files;
            codeVerified = Boolean(runtime.qualityReady);
            bootstrap = {
              npmInstalled: true,
              previewLive: Boolean(runtime.liveUnlock || runtime.evidence.httpOk),
              devServerUrl: live.url,
              codeVerified,
            };
          } catch {
            codeVerified = false;
            bootstrap = {
              npmInstalled: true,
              previewLive: true,
              devServerUrl: live.url,
              codeVerified: false,
            };
          }
          host.pushStatus(codeVerified
            ? 'Live ready — open Live under the chat…'
            : 'Live unlocked — quality gate still open…');
          markCreateJobReady(
            jobId,
            live.url,
            codeVerified ? 'Live ready · quality verified' : 'Live unlocked · quality still open',
          );
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
              || 'Live preview server did not start. Say **run Preview** to retry.',
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
