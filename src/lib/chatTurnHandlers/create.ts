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
function softBindCreateStudio(
  host: CreateTurnHost,
  opts: {
    files: Record<string, string>;
    projectId: string;
    name: string;
    diskRoot: string | null;
  },
): void {
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
 * Stage-2 multi-model polish only when pref is on AND this PC can hold two locals.
 * Call before any multi-model create path; scaffold create itself never needs this.
 */
export async function assertCreateMultiModelOk(): Promise<{ ok: boolean; reason?: string }> {
  if (!getLocalPrefs().multiModelCreate) {
    return { ok: false, reason: 'multiModelCreate pref is off' };
  }
  const { getBrainProfile, assertMultiModelAllowed } = await import('@/lib/brainProfile');
  const gate = assertMultiModelAllowed(await getBrainProfile());
  return gate.ok ? { ok: true } : { ok: false, reason: gate.reason };
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
  if (/IPC|arkDesktop|is not a function|undefined/i.test(e)) {
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
  const { getEngineStatus } = await import('@/lib/arkEngine');
  const { pickReadyCreatePolishCoder, isCoderEngineId } = await import('@/lib/enginePick');
  const { getLocalPrefs } = await import('@/lib/localPrefs');

  const profile = await getBrainProfile();
  const prefs = getLocalPrefs();
  const nameHint = host.stickyModelName || host.preferredModelName || host.modelName || undefined;

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
    if (pendingBrief.length >= 40) {
      buildIntent.summary = pendingBrief;
      buildIntent.name = safeName || pending?.name || buildIntent.name;
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
  host.pushStatus(`Using **${coderGate.name}** for this build…`);
  // Create must not auto-open Code — keep overlay closed until the user clicks the pill.
  try { window.dispatchEvent(new Event('NOVA:close-code-overlay')); } catch { /* ignore */ }

  const jobId = `create-${crypto.randomUUID().slice(0, 8)}`;
  host.pushStatus(`Creating folder in NOVA Projects (${buildIntent.slug})…`);
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
    const briefForUi = [buildIntent.summary, richestBrief, host.content]
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0] || String(host.content || '');
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
      } else if (blankSolidColor) {
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
    const needsUiPolish = !blankSolidColor;
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
      // Nova tool loop + Ready/assets verify (original). Legacy dump polish only if loop is off or App stays thin.
      let usedNovaLoop = false;
      try {
        const { shouldUseNovaCreateBuildLoop, runNovaCreateBuildLoop } = await import('@/lib/novaBuildLoop');
        const { modeStatusLabel } = await import('@/lib/novaStudioModes');
        if (shouldUseNovaCreateBuildLoop() && coderGate.ok) {
          usedNovaLoop = true;
          host.pushStatus(modeStatusLabel('build', 'Nova tool loop'));
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
            maxFixRounds: 2,
          });
          createFilesAcc = loopRes.files;
          softBindCreateStudio(host, {
            files: createFilesAcc,
            projectId: originProjectId,
            name: lockedProductName,
            diskRoot: originDiskRoot,
          });
          if (loopRes.ok) {
            uiPolishOk = true;
            uiPolishReasons = [];
          } else {
            uiPolishReasons = loopRes.reasons || [];
            const appLen = String(
              createFilesAcc['src/App.tsx'] || createFilesAcc['src/App.jsx'] || '',
            ).length;
            if (appLen >= 1200) {
              uiPolishOk = false;
            } else {
              usedNovaLoop = false;
              host.pushStatus(modeStatusLabel('build', 'Continuing with full UI polish…'));
            }
          }
        }
      } catch (loopErr) {
        usedNovaLoop = false;
        host.pushStatus(
          `Tool loop skipped — ${loopErr instanceof Error ? loopErr.message.slice(0, 72) : 'fallback'}…`,
        );
      }

      if (!usedNovaLoop && uiPolishOk !== true) {
      let polishSnapshot = { ...createFilesAcc };
      host.pushStatus('Planning UI from your brief…', 'src/App.tsx');
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
          // 14B+ local coders often need >5 min for a full App+CSS dump.
          const polishBudgetMs = 480_000;
          const polishTotalBudgetMs = 900_000;
          /** Soft floor so polish isn't a 30s stub — quality gates still decide Ready. */
          const CREATE_POLISH_MIN_MS = 300_000;
          let modelReply = '';
          let lastError = '';
          let streamBuf = '';
          let successfulPasses = 0;
          for (let attempt = 0; attempt < 4; attempt++) {
            const enrichPass = attempt > 0;
            const prompt = attempt === 0
              ? basePromptLines.join('\n')
              : [
                  enrichPass
                    ? 'ENRICH PASS: deepen THIS product from the brief. Add missing must-haves. Raise visual premium depth (atmosphere, type, spacing). Match the brief’s real flows — do NOT invent a generic time-slot booking UI unless the brief asks for appointments. Do NOT ship title + two static cards. NEVER use via.placeholder.com or remote placeholder image hosts. NEVER add paywalls or upgrade CTAs — Nova products stay free to use.'
                    : 'RETRY: put the ENTIRE product UI for THIS brief in a single App + App.css. No ./components. Finish every tag. No remote placeholder images. No paywalls.',
                  ...basePromptLines.slice(1),
                ].join('\n');
            if (enrichPass) {
              host.pushStatus('Deepening the product UI: flows, confirmation, and premium layout…');
            }
            const attemptStarted = Date.now();
            const seenCodingPaths = new Set<string>();
            streamBuf = '';
            let lastStudioPaint = 0;
            let lastFocusPath = '';
            let lastFocusLen = 0;
            let lastGrowthAt = Date.now();
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
                  Boolean(host.shouldAbort?.())
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
                    // Paint on path switch / growth (throttled) or honest stall notice (status only).
                    if (focusPath && (pathChanged || contentGrew || stalled) && now - lastStudioPaint > 220) {
                      lastStudioPaint = now;
                      const base = focusPath.split('/').pop() || focusPath;
                      host.pushStatus(
                        stalled && !contentGrew && !pathChanged
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
                : (truncatedApp ? appKeyProbe : 'src/App.tsx');
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
            host.pushStatus(POLISH_ALMOST_DONE_LABEL);
            await new Promise((r) => setTimeout(r, 120));
            host.pushStatus(POLISH_FINAL_PASS_LABEL);
            const needsInteractive = chatAppBrief
              || briefRequiresInteractiveApp(briefForUi)
              || briefSpec.mustHave.some((m) => /book|slot|confirm|cart|checkout|search|messag/i.test(m));
            const ready = isPreviewReady(createFilesAcc, {
              productName: lockedProductName,
              brief: briefForUi,
              requireInteractive: needsInteractive,
            });
            const briefMisses = briefCreateMisses(briefSpec, createFilesAcc);
            const filler = looksLikeFillerStubAppSource(appBody);
            if (!ready.ok || filler || briefMisses.length) {
              // Fail-closed for this attempt — keep last model UI on disk; try enrich pass.
              uiPolishOk = false;
              uiPolishReasons = [
                ...(ready.reasons || []),
                ...briefMisses,
                ...(filler ? ['App is still a filler stub (sample/placeholder text)'] : []),
                ...(lastError ? [lastError] : []),
              ];
              if (attempt < 3) {
                const missHint = (briefMisses[0] || ready.reasons?.[0] || 'UI depth')
                  .replace(/^missing\s+/i, '');
                host.pushStatus(
                  `Re-editing the UI: adding ${missHint.slice(0, 72)}…`,
                  'src/App.tsx',
                );
                continue;
              }
              break;
            }
            successfulPasses += 1;
            const elapsed = Date.now() - polishStarted;
            // Soft Ready too early → force at least one enrich pass and a 5-minute floor.
            if (elapsed < CREATE_POLISH_MIN_MS || successfulPasses < 2) {
              host.pushStatus(
                elapsed < CREATE_POLISH_MIN_MS
                  ? 'Still building: enriching the product UI and visual polish…'
                  : 'Second pass: deepening layout and real product flows…',
              );
              uiPolishOk = false;
              uiPolishReasons = ['Enrichment pass required for premium product depth'];
              if (attempt < 3) continue;
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
      } // end legacy dump polish (!usedNovaLoop)
    }

    // Image model / Brand Assets: generate or fetch product photos into public/heroes.
    if (uiPolishOk === true && originDiskRoot && !blankSolidColor) {
      try {
        const { planBrandAssets, materializeBrandAssets } = await import('@/lib/brandAssets');
        const { wireCreatePublicAssets } = await import('@/lib/createBuildQuality');
        host.pushStatus('Fetching images for this brief…');
        const plan = planBrandAssets(briefForUi, lockedProductName);
        const mat = await materializeBrandAssets({
          diskRoot: originDiskRoot,
          files: createFilesAcc,
          plan,
          brief: briefForUi,
          projectName: lockedProductName,
        });
        createFilesAcc = mat.files;
        // Binary JPGs must still appear as file keys so Ready + wire see real covers.
        for (const rel of mat.saved || []) {
          const norm = String(rel || '').replace(/\\/g, '/');
          if (/^public\/heroes\//i.test(norm) && createFilesAcc[norm] == null) {
            createFilesAcc[norm] = '';
          }
        }
        const linkedAfterHero = ensureStylesLinked(createFilesAcc);
        createFilesAcc = linkedAfterHero.files;
        const wired = wireCreatePublicAssets(createFilesAcc, lockedProductName);
        createFilesAcc = wired.files;
        if (mat.saved.length || linkedAfterHero.changed.length || wired.changed.length) {
          host.pushStatus(mat.saved.length
            ? `Saved ${mat.saved.length} product image${mat.saved.length === 1 ? '' : 's'}…`
            : (wired.changed.length ? 'Wiring logo and icons into the UI…' : 'Linking App.css…'));
          const appKey = createFilesAcc['src/App.tsx'] && !createFilesAcc['src/App.jsx']
            ? 'src/App.tsx'
            : (createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx');
          await applyChatReplyEdits({
            reply: [
              createFilesAcc[appKey] ? `@@@FILE ${appKey}\n${createFilesAcc[appKey]}` : '',
              createFilesAcc['src/main.jsx'] ? `@@@FILE src/main.jsx\n${createFilesAcc['src/main.jsx']}` : '',
              createFilesAcc['src/main.tsx'] ? `@@@FILE src/main.tsx\n${createFilesAcc['src/main.tsx']}` : '',
              createFilesAcc['src/App.css'] ? `@@@FILE src/App.css\n${createFilesAcc['src/App.css']}` : '',
              // Never @@@FILE binary heroes/photos — that overwrote real JPGs with empty/marker text.
              ...Object.keys(createFilesAcc)
                .filter((p) => {
                  const norm = p.replace(/\\/g, '/');
                  if (!/^public\//i.test(norm)) return false;
                  if (/\.(?:jpe?g|png|webp|gif|avif|ico|woff2?|ttf|otf)$/i.test(norm)) return false;
                  const body = String(createFilesAcc[p] || '');
                  if (!body.trim()) return false;
                  return true;
                })
                .slice(0, 12)
                .map((p) => `@@@FILE ${p}\n${createFilesAcc[p]}`),
            ].filter(Boolean).join('\n'),
            projectId: originProjectId,
            projectName: buildIntent.name,
            files: createFilesAcc,
            userMessage: briefForUi,
            diskRoot: originDiskRoot,
          }).then((applied) => {
            if (applied.ok && applied.updated.length) createFilesAcc = applied.files;
          }).catch(() => { /* disk already has heroes via materialize */ });
        }
        // Re-verify after asset wire — logo-as-cover / unwired icons must fail closed.
        const recheck = isPreviewReady(createFilesAcc, {
          productName: lockedProductName,
          brief: briefForUi,
          requireInteractive: chatAppBrief
            || briefRequiresInteractiveApp(briefForUi)
            || briefSpec.mustHave.some((m) => /book|slot|confirm|cart|checkout|search|messag|borrow/i.test(m)),
        });
        if (!recheck.ok) {
          uiPolishOk = false;
          uiPolishReasons = recheck.reasons || ['Asset wire failed Preview Ready'];
        }
      } catch {
        host.pushStatus('Continuing without generated images…');
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
      const { ensureReactImportForNamespace, appUsesReactNamespaceWithoutImport } = await import('@/lib/createBuildQuality');
      const appKey = createFilesAcc['src/App.tsx'] && !createFilesAcc['src/App.jsx']
        ? 'src/App.tsx'
        : (createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx');
      const beforeFinal = createFilesAcc[appKey] || '';
      const healedFinal = ensureReactImportForNamespace(beforeFinal);
      if (healedFinal !== beforeFinal) {
        createFilesAcc = { ...createFilesAcc, [appKey]: healedFinal };
        if (originDiskRoot) {
          await applyChatReplyEdits({
            reply: `@@@FILE ${appKey}\n${healedFinal}`,
            projectId: originProjectId,
            projectName: buildIntent.name,
            files: createFilesAcc,
            userMessage: host.content,
            diskRoot: originDiskRoot,
          }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
        }
      }
      const appBody = createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '';
      if (uiPolishOk === true && (
        looksLikeFillerStubAppSource(appBody)
        || isEmptyOrStubAppSource(appBody)
        || appUsesReactNamespaceWithoutImport(appBody)
      )) {
        uiPolishOk = false;
        uiPolishReasons = appUsesReactNamespaceWithoutImport(appBody)
          ? ['App uses React.* without importing React (would blank Live)']
          : ['App is still a blank placeholder splash'];
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
      softBindCreateStudio(host, {
        files: createFilesAcc,
        projectId: originProjectId,
        name: lockedProductName,
        diskRoot: originDiskRoot,
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
        created.grantHint || '',
      ].filter(Boolean).join('\n');
      markCreateJobFailed(jobId, uiPolishReasons[0] || 'UI polish failed: scaffold only');
      // Do NOT auto-npm on fail-closed — overlapping Defender scans freeze the desktop.
      await host.finishPlainReply(`${failAnswer}${grantNote}`, 'NOVA · scaffold');
      return { status: 'handled' };
    }

    host.commitStudio({
      files: createFilesAcc,
      projectId: originProjectId,
      name: lockedProductName,
      diskRoot: originDiskRoot,
      previewUrl: null,
    });
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
          host.pushStatus(
            bootstrap.previewLive
              ? 'Dependencies installed — Live preview verified…'
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
        bootstrap.previewLive
          ? 'Verified Live preview'
          : (bootstrap.npmInstalled
            ? 'Installed project dependencies'
            : (bootstrap.npmPending ? 'Installing project dependencies' : 'Setup incomplete')),
      ],
    });
    const createMeta = coderGate.ok && coderGate.name
      ? `NOVA · create · ${coderGate.name}`
      : 'NOVA · create';
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
