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
import {
  markCreateJobFailed,
  markCreateJobNpm,
  markCreateJobReady,
  startCreateJob,
  updateCreateJob,
} from '@/lib/createJobStore';
import { getLocalPrefs } from '@/lib/localPrefs';
import { clearChatStudio, clearLastDiskTarget } from '@/lib/chatStudioStore';
import type { CreateSuccess } from '@/lib/productContract';
import {
  resetBuildDiagnostics,
  pushBuildDiag,
  noteBuildContext,
  noteBuildGateResult,
  noteBuildFail,
  getBuildDiagnostics,
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
  // Throttle React file-tree + editor paints during scaffold/polish streams.
  // Early scaffolds have ≤4 files — never force every write (that freezes the desktop).
  const key = String(host.chatId || opts.projectId || 'create');
  const now = Date.now();
  const last = softBindLastAt.get(key) || 0;
  const count = softBindCount.get(key) || 0;
  // Hard cap: at most ~1 paint / 900ms; after first bind require 1.6s unless force.
  if (!opts.force && now - last < 900) return;
  if (!opts.force && count >= 1 && now - last < 1600) return;
  if (!opts.force && count > 24) return;
  softBindLastAt.set(key, now);
  softBindCount.set(key, count + 1);
  try {
    pushBuildDiag({
      kind: 'soft-bind',
      detail: `Studio paint #${count + 1} (${Object.keys(opts.files).length} files)`,
    });
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
 * Sequential multi-model create (plan→craft→verify) — one GGUF at a time.
 * Always allowed when a coder is ready; does NOT require dual-load 32GB RAM.
 * Legacy `multiModelCreate` pref still gates the older parallel-style path only.
 */
export async function assertCreateMultiModelOk(): Promise<{ ok: boolean; reason?: string }> {
  // Sequential ensemble is the default path — hardware dual-load gate is separate.
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
  const { getLocalPrefs } = await import('@/lib/localPrefs');

  const profile = await getBrainProfile();
  const prefs = getLocalPrefs();
  // Never use chat sticky "Instruct" as the display name for a coder id.
  const nameHint = undefined;

  const explicitIds = [
    host.stickyModelId,
    host.preferredModelId,
    host.modelId,
    prefs.activeCoderId,
    prefs.defaultCodeModelId,
    getActiveBrainId('coder'),
  ]
    .map((s) => String(s || '').trim())
    .filter((id) => id && id !== 'NOVA-auto' && !isWeakCoderId(id) && isCoderEngineId(id));

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
    if (!clean || clean === 'NOVA-auto' || isWeakCoderId(clean) || !isCoderEngineId(clean) || seen.has(clean)) return;
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

  return {
    id: 'NOVA-auto',
    name: 'NOVA Auto',
    source: 'auto',
    ok: false,
    reason: profile.maxCoderParamsB <= 0
      ? (profile.reason || 'No suitable coder for UI polish')
      : 'No local coder GGUF ready — install any coder that fits this PC (7B / 14B / 32B) from Models',
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
  const richestBrief = [pending?.summary, userBrief, bestBrief, intent.summary]
    .filter((x): x is string => Boolean(x && String(x).trim()))
    .sort((a, b) => b.length - a.length)[0] || intent.summary;

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
  const lockedProductName = cleanProductTitle(
    brandFromBrief || lockedFromAsk || intent.name || pending?.name || intent.name || 'New App',
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
  {
    const origPush = host.pushStatus;
    host.pushStatus = (label: string, writingPath?: string | null) => {
      const text = String(label || '').slice(0, 220);
      pushBuildDiag({ kind: 'status', detail: text, path: writingPath ?? null });
      if (/hop|ensemble|Spec|Design|Copy|Craft|Critic|Verify|Contract floor|Build team/i.test(text)) {
        const hops = getBuildDiagnostics().snap.ensembleHops;
        noteBuildContext({ ensembleHops: [...hops, text].slice(-12) });
      }
      noteBuildContext({ lastStatus: text, writingPath: writingPath ?? null, phase: text.slice(0, 80) });
      return origPush(label, writingPath);
    };
  }

  // Optional Plan → approve gate (Settings). Default off — one-shot create stays free & fast.
  {
    const prefs = getLocalPrefs();
    if (prefs.planApproveGate) {
      const {
        isBuildApprovePhrase,
        loadPendingBuildPlan,
        savePendingBuildPlan,
        clearPendingBuildPlan,
        buildPlanFromBrief,
        formatBuildPlanReply,
        modeStatusLabel,
      } = await import('@/lib/novaStudioModes');
      const approving = isBuildApprovePhrase(host.content);
      const pendingPlan = loadPendingBuildPlan(host.chatId);
      if (!approving) {
        host.pushStatus(modeStatusLabel('plan', lockedProductName));
        const { createBriefSpecFromAsk } = await import('@/lib/createIdentity');
        const spec = createBriefSpecFromAsk(lockedProductName, String(buildIntent.summary || host.content));
        const plan = buildPlanFromBrief({
          chatId: host.chatId,
          productName: lockedProductName,
          brief: String(buildIntent.summary || host.content),
          mustHaves: spec.mustHave || [],
        });
        savePendingBuildPlan(plan);
        await host.finishPlainReply(formatBuildPlanReply(plan), 'NOVA · plan');
        return { status: 'handled' };
      }
      if (pendingPlan) {
        buildIntent.summary = pendingPlan.summary || buildIntent.summary;
        buildIntent.name = pendingPlan.productName || buildIntent.name;
        clearPendingBuildPlan(host.chatId);
      }
    }
  }

  // Gate BEFORE scaffolding: switch to a ready coder (or stop with a clear next step).
  const coderGate = await resolveCreateUiPolishCoder(host);
  if (!coderGate.ok) {
    await host.finishPlainReply(
      [
        `**Cannot start building yet** — no local **coder** model is ready for this create.`,
        '',
        coderGate.reason || 'Install a coder GGUF that fits this PC under **Models**, then say **ok start building** again.',
        '',
        'Nova is free — no paywall. Chat models can plan with you. Building the UI needs a coder (for example a 7B+ coder GGUF on this PC, or a cloud key you already own).',
      ].join('\n'),
      'NOVA · create',
    );
    return { status: 'handled' };
  }
  try {
    host.onCoderPinned?.({ id: coderGate.id, name: coderGate.name });
  } catch { /* ignore */ }
  try {
    const { announceCreatePhase } = await import('@/lib/createStatus');
    await announceCreatePhase(host, 'craft', { id: coderGate.id, name: coderGate.name });
  } catch {
    host.pushStatus(`Craft · **${coderGate.name}**…`);
  }

  // Team readiness — warn when Chat/Design missing before scaffold (coder-only = lower quality).
  try {
    const { getEngineStatus } = await import('@/lib/novaEngine');
    const { getBrainProfile } = await import('@/lib/brainProfile');
    const {
      assessEnsembleReadiness,
      formatTeamReadinessMarkdown,
      userAcceptedCoderOnlyCreate,
      setUserAcceptedCoderOnlyCreate,
      looksLikeBuildAnywayAsk,
    } = await import('@/lib/ensembleReadiness');
    const profile = await getBrainProfile();
    const status = await getEngineStatus();
    const teamReady = assessEnsembleReadiness(status.models, {
      ramGb: profile.ramGB,
      maxCoderParamsB: profile.maxCoderParamsB,
    });
    if (looksLikeBuildAnywayAsk(host.content)) {
      setUserAcceptedCoderOnlyCreate(true);
    }
    if (teamReady.warnBeforeCreate && !userAcceptedCoderOnlyCreate()) {
      await host.finishPlainReply(
        [
          formatTeamReadinessMarkdown(teamReady),
          '',
          `When ready, say **build anyway** to create **${lockedProductName}** with the coder only, or install the missing brains and say **ok start building** again.`,
        ].join('\n'),
        'NOVA · team',
      );
      return { status: 'handled' };
    }
    if (teamReady.teamScore === 'craft-only') {
      host.pushStatus('Coder-only team — Layout Contract uses genre defaults…');
    } else {
      host.pushStatus(`Build team: ${teamReady.teamScore}…`);
    }
  } catch { /* readiness best-effort */ }

  host.pushStatus(`Build uses **${coderGate.name}** for craft (plan/copy may use Instruct)…`);

  // Sequential ensemble: floors first, LLM refine only when distinct brains exist.
  let ensemblePlanText = '';
  let ensembleAttribution = coderGate.name;
  let ensembleSpec: import('@/lib/createLayoutContract').ProductSpec | null = null;
  let ensembleContract: import('@/lib/createLayoutContract').LayoutContract | null = null;
  let ensembleCopy: import('@/lib/createLayoutContract').CopyPack | null = null;
  let ensembleContractBlock = '';
  try {
    const { getEngineStatus, setEngineModel } = await import('@/lib/novaEngine');
    const { getBrainProfile } = await import('@/lib/brainProfile');
    const {
      resolveCreateEnsembleTeam,
      ensembleMember,
      runCreateDesignHop,
      runCreateCopyHop,
      assertSequentialEnsembleOk,
    } = await import('@/lib/createEnsemble');
    const {
      formatEnsembleBriefBlock,
      buildProductSpec,
      genreFloor,
      defaultCopyPack,
    } = await import('@/lib/createLayoutContract');
    const { saveChatBuildMemory } = await import('@/lib/chatBuildMemory');
    const profile = await getBrainProfile();
    const status = await getEngineStatus();
    const briefSeed = buildIntent.summary || host.content;
    // Deterministic floors immediately — never wait on LLM for Spec/Contract.
    ensembleSpec = buildProductSpec({ brief: briefSeed, productName: lockedProductName });
    ensembleContract = genreFloor(ensembleSpec.genre);
    try {
      const { applyLayoutReference } = await import('@/lib/createLayoutContract');
      ensembleContract = applyLayoutReference(
        `${buildIntent.summary || ''}\n${host.content || ''}`,
        ensembleContract,
      );
    } catch { /* keep floor */ }
    ensembleCopy = defaultCopyPack(ensembleSpec, ensembleContract);
    ensembleContractBlock = formatEnsembleBriefBlock(ensembleSpec, ensembleContract, ensembleCopy);
    host.pushStatus(`Contract floor · ${ensembleSpec.genre}…`);

    const team = resolveCreateEnsembleTeam(status.models, {
      ramGb: profile.ramGB,
      maxCoderParamsB: profile.maxCoderParamsB,
      craftId: coderGate.id,
    });
    const ensGate = assertSequentialEnsembleOk(team);
    if (ensGate.ok && team.multiHop) {
      ensembleAttribution = team.attribution;
      const designer = ensembleMember(team, 'design');
      const copyBrain = ensembleMember(team, 'copy') || ensembleMember(team, 'plan');
      // LLM refine only when Design is a distinct brain (not the coder).
      if (designer && designer.id !== coderGate.id && ensembleSpec) {
        try {
          const { announceCreatePhase } = await import('@/lib/createStatus');
          await announceCreatePhase(host, 'design', { id: designer.id, name: designer.name });
        } catch {
          host.pushStatus(`Design · **${designer.name}**…`);
        }
        const designed = await runCreateDesignHop({
          brief: briefSeed,
          productName: lockedProductName,
          spec: ensembleSpec,
          modelId: designer.id,
          modelName: designer.name,
          shouldAbort: () => Boolean(host.shouldAbort?.()),
        });
        ensembleContract = designed.contract;
        // Warm craft GGUF while we still hold design results.
        try {
          const { announceCreatePhase } = await import('@/lib/createStatus');
          await announceCreatePhase(host, 'craft', { id: coderGate.id, name: coderGate.name });
        } catch {
          void setEngineModel?.(coderGate.id);
        }
      }
      if (
        copyBrain
        && copyBrain.id !== coderGate.id
        && ensembleSpec
        && ensembleContract
        && copyBrain.id !== designer?.id
      ) {
        try {
          const { announceCreatePhase } = await import('@/lib/createStatus');
          await announceCreatePhase(host, 'copy', { id: copyBrain.id, name: copyBrain.name });
        } catch {
          host.pushStatus(`Copy · **${copyBrain.name}** (words, not code)…`);
        }
        const copied = await runCreateCopyHop({
          brief: briefSeed,
          productName: lockedProductName,
          spec: ensembleSpec,
          contract: ensembleContract,
          modelId: copyBrain.id,
          modelName: copyBrain.name,
          shouldAbort: () => Boolean(host.shouldAbort?.()),
        });
        ensembleCopy = copied.copy;
        try {
          const { announceCreatePhase } = await import('@/lib/createStatus');
          await announceCreatePhase(host, 'craft', { id: coderGate.id, name: coderGate.name });
        } catch {
          void setEngineModel?.(coderGate.id);
        }
      } else if (ensembleSpec && ensembleContract) {
        ensembleCopy = defaultCopyPack(ensembleSpec, ensembleContract);
      }
      if (ensembleSpec && ensembleContract && ensembleCopy) {
        ensembleContractBlock = formatEnsembleBriefBlock(ensembleSpec, ensembleContract, ensembleCopy);
        host.pushStatus(`Contract locked · ${ensembleSpec.genre}…`);
      }
    }
    if (ensembleSpec && ensembleContract && ensembleCopy) {
      saveChatBuildMemory({
        chatId: host.chatId,
        spec: ensembleSpec,
        contract: ensembleContract,
        copy: ensembleCopy,
        lastPhase: 'contract',
        projectId: null,
        updatedAt: Date.now(),
      });
    }
  } catch {
    /* ensemble is best-effort — never block create */
  }
  if (!ensembleSpec) {
    try {
      const { buildProductSpec, genreFloor, defaultCopyPack, formatEnsembleBriefBlock } = await import('@/lib/createLayoutContract');
      ensembleSpec = buildProductSpec({
        brief: buildIntent.summary || host.content,
        productName: lockedProductName,
      });
      ensembleContract = genreFloor(ensembleSpec.genre);
      try {
        const { applyLayoutReference } = await import('@/lib/createLayoutContract');
        ensembleContract = applyLayoutReference(
          `${buildIntent.summary || ''}\n${host.content || ''}`,
          ensembleContract,
        );
      } catch { /* keep floor */ }
      ensembleCopy = defaultCopyPack(ensembleSpec, ensembleContract);
      ensembleContractBlock = formatEnsembleBriefBlock(ensembleSpec, ensembleContract, ensembleCopy);
    } catch { /* ignore */ }
  }
  // Create: auto-open Code so the user can watch files write live (follow path).
  try {
    window.dispatchEvent(new CustomEvent('NOVA:open-code-overlay', {
      detail: { openOverlay: true, name: lockedProductName },
    }));
  } catch { /* ignore */ }

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
        // Never park Code live-follow on .gitignore (scaffold last-write trap).
        const followPath = /\.gitignore$/i.test(path) ? undefined : path;
        host.pushStatus(createFileBuildLabel(path, 'Building'), followPath);
        softBindCreateStudio(host, {
          files: scaffoldAcc,
          projectId: newProjectId,
          name: lockedProductName,
          diskRoot: null,
        });
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
    try {
      const { mergeBriefNpmDependencies } = await import('@/lib/projectScaffolds');
      createFilesAcc = mergeBriefNpmDependencies(
        createFilesAcc,
        [buildIntent.summary, richestBrief, host.content].filter(Boolean).join('\n'),
      );
    } catch { /* optional */ }
    // Apple.com / arcade briefs: seed a real floor BEFORE craft so Live never
    // shows Band-N stubs or title-only shells while the coder is still thrashing.
    try {
      const { briefLooksLikeAppleStyleHomepage } = await import('@/lib/createBuildQuality');
      const { looksLikePlayableCanvasGame, looksLikeFpsGame } = await import('@/lib/freshSpaFromBrief');
      const briefForSeed = [buildIntent.summary, richestBrief, host.content].filter(Boolean).join('\n');
      const seedArcade = looksLikePlayableCanvasGame(briefForSeed) || looksLikeFpsGame(briefForSeed);
      if (briefLooksLikeAppleStyleHomepage(briefForSeed) || seedArcade) {
        const { realizeBriefUi } = await import('@/lib/createRealize');
        const seeded = realizeBriefUi(createFilesAcc, lockedProductName, briefForSeed);
        if (seeded.changed) {
          createFilesAcc = seeded.files;
          host.pushStatus(seedArcade
            ? 'Seeded playable canvas game loop…'
            : 'Seeded apple.com-style product bands…');
          if (originDiskRoot) {
            const appKey = createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx';
            await applyChatReplyEdits({
              reply: [
                createFilesAcc[appKey] ? `@@@FILE ${appKey}\n${createFilesAcc[appKey]}` : '',
                createFilesAcc['src/App.css'] ? `@@@FILE src/App.css\n${createFilesAcc['src/App.css']}` : '',
              ].filter(Boolean).join('\n'),
              projectId: originProjectId,
              projectName: lockedProductName,
              files: createFilesAcc,
              userMessage: briefForSeed,
              diskRoot: originDiskRoot,
            }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
          }
        }
      }
    } catch { /* seed best-effort */ }
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
      briefRequiresInteractiveApp,
      isPreviewReady,
      looksLikeFillerStubAppSource,
      isEmptyOrStubAppSource,
    } = await import('@/lib/createBuildQuality');
    let blankSolidColor: string | null = null;
    try {
      const { blankSolidColorFromAsk, reactSurgicalMicroAskEdits } = await import('@/lib/webProjectCanon');
      blankSolidColor = blankSolidColorFromAsk(briefForUi);
      // Never run micro surgical (center-word / cream rails) on rich marketing / chat creates —
      // that path mangles long product briefs into a one-line stub.
      const skipSurgical = briefNeedsCreateUiPolish(briefForUi)
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
      } else if (blankSolidColor && !briefNeedsCreateUiPolish(briefForUi) && !briefLooksLikeMarketingLanding(briefForUi)) {
        host.pushStatus(`Painting solid ${blankSolidColor} shell…`);
        const blankApplied = await applyChatReplyEdits({
          reply: '',
          projectId: originProjectId,
          projectName: buildIntent.name,
          files: createFilesAcc,
          userMessage: briefForUi,
          diskRoot: originDiskRoot,
        });
        if (blankApplied.ok && blankApplied.updated.length) {
          createFilesAcc = blankApplied.files;
        }
      }
    } catch { /* best-effort */ }

    /** null = skipped (scaffold-only OK); true = Preview-ready UI applied; false = fail-closed */
    let uiPolishOk: boolean | null = null;
    let uiPolishReasons: string[] = [];
    // Every real create must leave a working UI — never claim success on the Vite title splash.
    // Marketing / quiet-luxury briefs always polish even if blank-solid heuristics misfire.
    const needsUiPolish = !blankSolidColor || briefNeedsCreateUiPolish(briefForUi)
      || briefLooksLikeMarketingLanding(briefForUi);
    const {
      createBriefSpecFromAsk,
      polishPromptLinesFromBrief,
      ensureStylesLinked,
      briefCreateMisses,
    } = await import('@/lib/createIdentity');
    const briefSpec = createBriefSpecFromAsk(lockedProductName, briefForUi);
    const chatAppBrief = briefLooksLikeChatApp(briefForUi);

    // Do not apply pre-baked Discord/marketing/interactive shells — real UI must come from the coder.

    if (needsUiPolish && uiPolishOk !== true) {
      // One craft owner: tool loop when enabled; legacy dump only when loop is off.
      let usedNovaLoop = false;
      let loopAttempted = false;
      try {
        const { shouldUseNovaCreateBuildLoop, runNovaCreateBuildLoop } = await import('@/lib/novaBuildLoop');
        const { modeStatusLabel } = await import('@/lib/novaStudioModes');
        if (shouldUseNovaCreateBuildLoop() && coderGate.ok) {
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

      // Dump polish when loop is off, or when the tool loop stalled / failed Ready (handoff).
      if (uiPolishOk !== true && (!usedNovaLoop || (loopAttempted && uiPolishOk === false))) {
      let polishSnapshot = { ...createFilesAcc };
      // Don't pin Code to App until bytes actually grow — empty shell ≠ stall.
      host.pushStatus(
        usedNovaLoop
          ? `Full UI polish · **${coderGate.ok ? coderGate.name : 'coder'}**…`
          : 'Planning UI from your brief…',
        null,
      );
      try {
        const { setEngineModel } = await import('@/lib/novaEngine');
        if (coderGate.ok) void setEngineModel?.(coderGate.id);
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
          const { startProgressHeartbeat, POLISH_ALMOST_DONE_LABEL, POLISH_FINAL_PASS_LABEL } = await import('@/lib/createProgressCopy');
          const stopPolishBeat = startProgressHeartbeat(host.pushStatus, 'polish', 5500);
          try {
          const preferTs = Boolean(
            createFilesAcc['src/App.tsx'] && !createFilesAcc['src/App.jsx'],
          );
          const appPath = preferTs ? 'src/App.tsx' : 'src/App.jsx';
          const basePromptLines = polishPromptLinesFromBrief(briefSpec, appPath, briefForUi);
          const polishStarted = Date.now();
          const polishBudgetMs = 480_000;
          const polishTotalBudgetMs = 900_000;
          /** No byte growth for this long → cancel GGUF and retry that file. */
          const POLISH_STALL_ABORT_MS = 18_000;
          let modelReply = '';
          let lastError = '';
          let streamBuf = '';
          let stalledPathHint = '';
          // Ready means stop — at most 2 craft attempts.
          const maxPolishAttempts = 2;
          for (let attempt = 0; attempt < maxPolishAttempts; attempt++) {
            const enrichPass = attempt > 0 && !stalledPathHint;
            const stallRetry = Boolean(stalledPathHint);
            const elapsedSoFar = Date.now() - polishStarted;
            if (elapsedSoFar > polishTotalBudgetMs) {
              lastError = 'UI polish budget exceeded';
              break;
            }
            const prompt = attempt === 0
              ? basePromptLines.join('\n')
              : stallRetry
                ? [
                    `STALL RETRY: the previous pass froze while writing ${stalledPathHint}.`,
                    `Rewrite ONLY ${stalledPathHint} from scratch for THIS brief — finish every tag/brace.`,
                    'Keep other project files as-is. Output @@@FILE for that path (and App.css if needed).',
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
              host.pushStatus(`Retrying stalled write: ${stalledPathHint}…`, stalledPathHint);
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
            let stallAbort = false;
            let stallAbortPath = '';
            let stallCancelFired = false;
            const { extractStreamingFileEdits } = await import('@/lib/projectCodeEdit');
            const result = await answerStudio(
              {
                userMessage: prompt,
                files: createFilesAcc,
                projectName: lockedProductName,
                mode: 'code',
                preferredModelId: coder.id,
                preferredModelName: coder.name,
                preferredSource: coder.source,
                stickyModelId: host.stickyModelId || undefined,
                stickyModelName: host.stickyModelName || undefined,
                stickyPinnedSource: host.stickyModelId ? 'local' : undefined,
                allowFileEdits: true,
                shouldAbort: () =>
                  stallAbort
                  || Boolean(host.shouldAbort?.())
                  || Date.now() - attemptStarted > polishBudgetMs
                  || Date.now() - polishStarted > polishTotalBudgetMs,
              },
              (delta) => {
                streamBuf = String(delta || '');
                let focusPath = '';
                try {
                  // Prefer the in-progress @@@FILE (last header), not the last completed extract.
                  const active = streamBuf.lastIndexOf('@@@FILE');
                  if (active >= 0) {
                    const hdr = streamBuf.slice(active).match(/^@@@FILE\s+([^\n\r]+)/);
                    if (hdr?.[1]) {
                      focusPath = String(hdr[1]).replace(/\\/g, '/').replace(/^\.\//, '').trim();
                    }
                  }
                  const streamed = extractStreamingFileEdits(streamBuf);
                  if (streamed.length) {
                    const merged = { ...createFilesAcc };
                    for (const e of streamed) {
                      const rel = String(e.path || '').replace(/\\/g, '/').replace(/^\.\//, '');
                      if (!rel || !e.content) continue;
                      merged[rel] = e.content;
                      if (!focusPath) focusPath = rel;
                    }
                    createFilesAcc = merged;
                    const now = Date.now();
                    const focusLen = focusPath
                      ? String(createFilesAcc[focusPath] || '').length
                      : 0;
                    const pathChanged = Boolean(focusPath && !seenCodingPaths.has(focusPath));
                    const contentGrew = Boolean(focusPath)
                      && focusPath === lastFocusPath
                      && focusLen > lastFocusLen;
                    if (pathChanged) {
                      lastFocusPath = focusPath;
                      lastFocusLen = focusLen;
                      lastGrowthAt = now;
                      seenCodingPaths.add(focusPath);
                    } else if (contentGrew) {
                      lastFocusLen = focusLen;
                      lastGrowthAt = now;
                    }
                    const stalled = Boolean(focusPath) && now - lastGrowthAt > 12_000;
                    // Hard stall: cancel the GGUF turn and retry just this file on the next attempt.
                    if (
                      focusPath
                      && now - lastGrowthAt > POLISH_STALL_ABORT_MS
                      && !stallAbort
                    ) {
                      stallAbort = true;
                      stallAbortPath = focusPath;
                      if (!stallCancelFired) {
                        stallCancelFired = true;
                        void import('@/lib/novaEngine')
                          .then(({ engineGenerateCancel }) => engineGenerateCancel())
                          .catch(() => {});
                      }
                    }
                    // Paint on path switch / growth (throttled) or honest stall notice (status only).
                    if (focusPath && (pathChanged || contentGrew || stalled) && now - lastStudioPaint > 220) {
                      lastStudioPaint = now;
                      const base = focusPath.split('/').pop() || focusPath;
                      host.pushStatus(
                        stallAbort
                          ? `Stalled on ${base} — cancelling to retry that file…`
                          : stalled && !contentGrew && !pathChanged
                            ? `Still waiting on the coder for ${base}…`
                            : createFileBuildLabel(focusPath, 'Coding'),
                        focusPath,
                      );
                      if (pathChanged || contentGrew) {
                        softBindCreateStudio(host, {
                          files: createFilesAcc,
                          projectId: originProjectId,
                          name: lockedProductName,
                          diskRoot: originDiskRoot,
                        });
                      }
                    }
                  }
                } catch { /* ignore stream paint */ }
              },
            );
            if (stallAbort && stallAbortPath) {
              stalledPathHint = stallAbortPath;
              lastError = `Coder stalled on ${stallAbortPath}`;
              host.pushStatus(`Retrying ${stallAbortPath} after stall…`, stallAbortPath);
              // Keep partial bytes; next pass rewrites just this path.
              continue;
            }
            if (await host.stopIfSuperseded()) {
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
            const { looksLikeTruncatedUiSource } = await import('@/lib/freshSpaFromBrief');
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
            const appProbe = createFilesAcc['src/App.tsx'] || createFilesAcc['src/App.jsx'] || '';
            const cssProbe = createFilesAcc['src/App.css'] || '';
            const appKeyProbe = createFilesAcc['src/App.tsx'] && !createFilesAcc['src/App.jsx']
              ? 'src/App.tsx'
              : (createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx');
            const truncatedApp = looksLikeTruncatedUiSource(appProbe);
            const truncatedCss = looksLikeTruncatedUiSource(cssProbe);
            const truncated = truncatedApp || truncatedCss;
            if (missing.length || truncated) {
              const badPath = truncatedCss
                ? 'src/App.css'
                : appKeyProbe;
              host.pushStatus(createFileReEditLabel(badPath), badPath);
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
            const { previewReadyForBrief } = await import('@/lib/createBuildQuality');
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
              // Fail-closed for this attempt — one enrich retry max, then stop.
              uiPolishOk = false;
              uiPolishReasons = [
                ...(ready.reasons || []),
                ...briefMisses,
                ...(filler ? ['App is still a filler stub (sample/placeholder text)'] : []),
                ...(lastError ? [lastError] : []),
              ];
              if (attempt < maxPolishAttempts - 1) {
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
        const tryMaterialize = !isArcadeBrief && (
          uiPolishOk === true
          || briefLooksLikeMarketingLanding(briefForUi)
          || briefNeedsCreateUiPolish(briefForUi)
        );
        if (isArcadeBrief) {
          host.pushStatus('Skipping hero fetch for playable game…');
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
        const wired = wireCreatePublicAssets(createFilesAcc, lockedProductName);
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
          const recheck = isPreviewReady(createFilesAcc, {
            productName: lockedProductName,
            brief: briefForUi,
            requireInteractive: chatAppBrief
              || briefRequiresInteractiveApp(briefForUi)
              || (
                !briefLooksLikeMarketingLanding(briefForUi)
                && briefSpec.mustHave.some((m) => /book|slot|confirm|cart|checkout|messag|borrow/i.test(m))
              ),
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

    // Style hop — contract tokens + constrained CSS (no cream-bias dump).
    if (needsUiPolish) {
      try {
        const cssNow = createFilesAcc['src/App.css'] || '';
        const cssThin = cssNow.replace(/\s+/g, '').length < 900
          || (/#0f1419/.test(cssNow) && cssNow.length < 1200)
          || !/NOVA layout contract tokens/.test(cssNow);
        if (cssThin) {
          const { getEngineStatus } = await import('@/lib/novaEngine');
          const { getBrainProfile } = await import('@/lib/brainProfile');
          const {
            resolveCreateEnsembleTeam,
            ensembleMember,
            runCreateStyleHop,
          } = await import('@/lib/createEnsemble');
          const profile = await getBrainProfile();
          const status = await getEngineStatus();
          const team = resolveCreateEnsembleTeam(status.models, {
            ramGb: profile.ramGB,
            maxCoderParamsB: profile.maxCoderParamsB,
            craftId: coderGate.id,
          });
          const styler = ensembleMember(team, 'style')
            || ensembleMember(team, 'design')
            || ensembleMember(team, 'craft');
          if (styler) {
            host.pushStatus(`Style hop · **${styler.name}** (contract tokens)…`);
            const appSrc = createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '';
            const styled = await runCreateStyleHop({
              brief: briefForUi,
              productName: lockedProductName,
              appSource: appSrc,
              cssSource: cssNow,
              modelId: styler.id,
              modelName: styler.name,
              contract: ensembleContract,
              shouldAbort: () => Boolean(host.shouldAbort?.()),
            });
            if (styled.css && styled.css.length >= cssNow.length) {
              createFilesAcc = { ...createFilesAcc, 'src/App.css': styled.css };
              await applyChatReplyEdits({
                reply: `@@@FILE src/App.css\n${styled.css}`,
                projectId: originProjectId,
                projectName: buildIntent.name,
                files: createFilesAcc,
                userMessage: briefForUi,
                diskRoot: originDiskRoot,
              }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
              host.pushStatus('Style hop applied…');
            }
            // Warm craft coder again — style may have loaded UIGEN / chat.
            if (coderGate.ok) {
              try {
                const { setEngineModel } = await import('@/lib/novaEngine');
                void setEngineModel?.(coderGate.id);
              } catch { /* ignore */ }
            }
          }
        }
      } catch {
        /* style hop best-effort */
      }
    }

    // Verify hop: craft coder reviews App/CSS (never chat Instruct).
    if (needsUiPolish && ensembleAttribution.includes('→')) {
      try {
        const { getEngineStatus, setEngineModel } = await import('@/lib/novaEngine');
        const { getBrainProfile } = await import('@/lib/brainProfile');
        const {
          resolveCreateEnsembleTeam,
          ensembleMember,
          runCreateVerifyHop,
        } = await import('@/lib/createEnsemble');
        const profile = await getBrainProfile();
        const status = await getEngineStatus();
        const team = resolveCreateEnsembleTeam(status.models, {
          ramGb: profile.ramGB,
          maxCoderParamsB: profile.maxCoderParamsB,
          craftId: coderGate.id,
        });
        const verifier = ensembleMember(team, 'verify')
          || (coderGate.ok ? { id: coderGate.id, name: coderGate.name, role: 'verify' as const, source: 'local' as const } : null);
        if (verifier) {
          try { void setEngineModel?.(verifier.id); } catch { /* ignore */ }
          host.pushStatus(`Verify · **${verifier.name}**…`);
          const appSrc = createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '';
          const cssSrc = createFilesAcc['src/App.css'] || '';
          const verified = await runCreateVerifyHop({
            brief: briefForUi,
            productName: lockedProductName,
            appSource: appSrc,
            cssSource: cssSrc,
            modelId: verifier.id,
            modelName: verifier.name,
            contract: ensembleContract,
            shouldAbort: () => Boolean(host.shouldAbort?.()),
          });
          if (verified.issues.length) {
            // Ignore nitpicks free chat models often invent (imports, createRoot folklore).
            const appForVerify = `${createFilesAcc['src/App.jsx'] || ''}\n${createFilesAcc['src/App.tsx'] || ''}`;
            const actionable = verified.issues.filter((issue) => {
              if (/\b(?:react\s+import|import\s+react|createroot|document\.getelementbyid|plain\s+javascript|not\s+needed|unnecessary)\b/i.test(issue)) {
                return false;
              }
              const claimedMissing = issue.match(/does not have (?:a |an )?([^.]{3,60})/i)?.[1] || '';
              const words = claimedMissing.split(/\s+/).filter((w) => w.length > 3);
              if (words.length && words.every((w) => new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(appForVerify))) {
                return false;
              }
              return true;
            });
            if (actionable.length && uiPolishOk === true) {
              // Advisory only — do not demote Ready without a craft rewrite.
              host.pushStatus(`Verify notes (${actionable.length}): ${actionable[0].slice(0, 60)}…`);
            }
          }
          // Keep craft GGUF warm after verify.
          if (coderGate.ok && verifier.id !== coderGate.id) {
            try { void setEngineModel?.(coderGate.id); } catch { /* ignore */ }
          }
        }
      } catch {
        /* verify best-effort */
      }
    }

    // Critic hop — vision/text grades against LayoutContract (one fail can block Ready).
    if (needsUiPolish && ensembleContract) {
      try {
        const { getEngineStatus } = await import('@/lib/novaEngine');
        const { getBrainProfile } = await import('@/lib/brainProfile');
        const {
          resolveCreateEnsembleTeam,
          ensembleMember,
          runCreateCriticHop,
        } = await import('@/lib/createEnsemble');
        const { scoreLayoutQuality, scoreFunctionalReady, shipReadyLabel } = await import('@/lib/createLayoutContract');
        const layoutScore = scoreLayoutQuality(createFilesAcc, {
          brief: briefForUi,
          spec: ensembleSpec,
          contract: ensembleContract,
        });
        const funcScore = scoreFunctionalReady(createFilesAcc, {
          brief: briefForUi,
          spec: ensembleSpec,
        });
        if (!layoutScore.ok || !funcScore.ok) {
          uiPolishOk = false;
          uiPolishReasons = [
            ...uiPolishReasons,
            ...layoutScore.reasons,
            ...funcScore.reasons,
            shipReadyLabel(layoutScore, funcScore),
          ];
          host.pushStatus(`Quality gates blocked Ready (${layoutScore.score}/${funcScore.score})…`);
        } else {
          const profile = await getBrainProfile();
          const status = await getEngineStatus();
          const team = resolveCreateEnsembleTeam(status.models, {
            ramGb: profile.ramGB,
            maxCoderParamsB: profile.maxCoderParamsB,
            craftId: coderGate.id,
          });
          const critic = ensembleMember(team, 'critic') || ensembleMember(team, 'verify');
          let shot: string | null = null;
          try {
            const api = (window as unknown as {
              novaDesktop?: { previewCaptureLive?: () => Promise<{ ok?: boolean; dataUrl?: string }> };
            }).novaDesktop;
            const cap = await api?.previewCaptureLive?.();
            if (cap?.ok && cap.dataUrl) shot = cap.dataUrl;
          } catch { /* no live window yet */ }
          if (critic) {
            host.pushStatus(`Critic hop · **${critic.name}**…`);
            const appSrc = createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '';
            const cssSrc = createFilesAcc['src/App.css'] || '';
            const critiqued = await runCreateCriticHop({
              brief: briefForUi,
              productName: lockedProductName,
              contract: ensembleContract,
              appSource: appSrc,
              cssSource: cssSrc,
              modelId: critic.id,
              modelName: critic.name,
              screenshotDataUrl: shot,
              shouldAbort: () => Boolean(host.shouldAbort?.()),
            });
            if (!critiqued.pass && critiqued.issues.length) {
              // LLM critic is advisory — deterministic layout/functional gates already ran.
              host.pushStatus(`Critic notes: ${critiqued.issues[0].slice(0, 72)}…`);
            } else if (layoutScore.ok && funcScore.ok) {
              host.pushStatus('Ready to ship — layout + functional gates passed…');
            }
          }
        }
      } catch {
        /* critic best-effort */
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
      // Empty Vite shell must never ship as success — even if an earlier Ready check lied.
      const finalApp = createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '';
      if (uiPolishOk === true && (
        isEmptyOrStubAppSource(finalApp)
        || /return\s*\(\s*<div\s+className=["']app["']\s*\/>\s*\)/i.test(finalApp)
        || finalApp.length < 200
      )) {
        uiPolishOk = false;
        uiPolishReasons = ['App is still an empty Vite shell — UI polish did not build the page'];
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

    // Fail-closed: keep folder + code pills (files exist) but never Ready / Live.
    if (uiPolishOk === false) {
      // Floors:
      // - Apple: replace shells missing Mac/iPad/Watch/AirPods (generic "Band 1"
      //   multi-section craft is NOT finished apple.com — realizeBriefUi owns that).
      // - Other: only when App is truly empty/broken — never tablet-stub overwrite
      //   of a real multi-section craft.
      try {
        const appBody = createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '';
        const hasStructure = /<(?:section|nav|main|header|footer)\b/i.test(appBody)
          && (appBody.match(/<(?:section|main)\b/gi) || []).length >= 2;
        const trulyEmpty = looksLikeFillerStubAppSource(appBody)
          || isEmptyOrStubAppSource(appBody)
          || appBody.replace(/\s+/g, '').length < 900;
        const {
          buildBriefInteractiveFloor,
          previewReadyForBrief,
          briefLooksLikeAppleStyleHomepage: appleBrief,
          appleHomepageHasProductBands,
        } = await import('@/lib/createBuildQuality');
        const isApple = appleBrief(briefForUi);
        const appleMissingBands = isApple && (
          !appleHomepageHasProductBands(appBody)
          || /\bBuilt for general users\b/i.test(appBody)
          || /\bBand\s*[1-4]\b/i.test(appBody)
          || /selectedProduct\s*===\s*['"]/.test(appBody)
          || (appBody.length < 3200 && !/<img\b/i.test(appBody))
        );
        if (appleMissingBands || (trulyEmpty && !hasStructure)) {
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
            const isGameFloor = looksLikePlayableCanvasGame(briefForUi) || looksLikeFpsGame(briefForUi);
            if (isGameFloor) {
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
            } else {
            host.pushStatus('Materializing brief floor from empty stub…');
            const floor = buildBriefInteractiveFloor(lockedProductName, briefForUi);
            const appKey = createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx';
            createFilesAcc = {
              ...createFilesAcc,
              [appKey]: floor.app,
              'src/App.css': floor.css,
            };
            if (originDiskRoot) {
              await applyChatReplyEdits({
                reply: `@@@FILE ${appKey}\n${floor.app}\n@@@FILE src/App.css\n${floor.css}`,
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
              host.pushStatus('Brief floor cleared Preview Ready…');
            } else {
              uiPolishReasons = [...uiPolishReasons, ...(gate.reasons || []).slice(0, 4)];
            }
            }
          }
        }
      } catch {
        /* floor best-effort */
      }
    }

    if (uiPolishOk === false) {
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
            '2. Switch the chat model to that coder (or leave Multimodal: NOVA will pin it).',
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
              '1. Say **rebuild the UI** to fix Preview Ready on this folder.',
              '2. Or open the **Code** / **Folder** pills to continue editing.',
            ];
      const failAnswer = [
        `**Created ${displayName}**: folder on disk, Preview Ready failed`,
        '',
        originDiskRoot ? `**Where:** \`${originDiskRoot}\`` : '',
        created.parentSource ? `**Location:** ${created.parentSource}` : '',
        '',
        '**Failed at:** UI polish (Preview Ready gate)',
        '**Why:**',
        reasonLines,
        '',
        ...nextSteps,
        '',
        'Folder and Code are available in this chat. Live unlocks after Preview Ready.',
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
      await host.finishPlainReply(`${failAnswer}${grantNote}`, `${ensembleAttribution || 'NOVA'} · scaffold`);
      return { status: 'handled' };
    }

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
    if (originDiskRoot && projectUsesNpm(scaffoldKind)) {
      host.pushStatus('Installing project dependencies (npm)…');
      markCreateJobNpm(jobId);
      try {
        bootstrap = await bootstrapProjectWorkspace(originDiskRoot, scaffoldKind, {
          files: createFilesAcc,
          preferPreviewUrl: null,
        });
        if (bootstrap.npmInstalled && uiPolishOk === true) {
          bootstrap = { ...bootstrap, codeVerified: true };
          host.pushStatus(
            bootstrap.previewLive
              ? 'Dependencies installed — code scan passed, Live verified…'
              : 'Dependencies installed — verifying Live…',
          );
          markCreateJobReady(jobId, bootstrap.devServerUrl || null);
        } else if (!bootstrap.npmInstalled) {
          host.pushStatus('Dependency install did not finish…');
          markCreateJobFailed(jobId, bootstrap.bootstrapNote || 'npm install failed');
        } else {
          markCreateJobFailed(jobId, 'UI not Preview-ready');
        }
      } catch (err) {
        bootstrap = {
          npmInstalled: false,
          bootstrapNote: err instanceof Error ? err.message : 'npm failed',
        };
        markCreateJobFailed(jobId, bootstrap.bootstrapNote || 'npm failed');
      }
    } else if (uiPolishOk === true) {
      markCreateJobReady(jobId, null);
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
          ? 'Code scan passed — Live verified'
          : bootstrap.previewLive
            ? 'Live server started'
            : (bootstrap.npmInstalled
              ? 'Installed project dependencies'
              : (bootstrap.npmPending ? 'Installing project dependencies' : 'Setup incomplete')),
      ],
    });
    const createMeta = ensembleAttribution && ensembleAttribution.includes('→')
      ? `NOVA · ensemble · ${ensembleAttribution}`
      : (coderGate.ok && coderGate.name
        ? `NOVA · create · ${coderGate.name}`
        : 'NOVA · create');
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
    await host.finishPlainReply(msg);
    return { status: 'handled' };
  }
}
