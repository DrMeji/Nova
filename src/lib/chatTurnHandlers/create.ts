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
import type { CreateSuccess } from '@/lib/productContract';

export { pendingCreateBootstrap };

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
  pushStatus: (label: string) => void;
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
      || fallbackCreateProjectName(host.content)
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
    buildIntent.summary = richestBrief.length >= 20
      ? richestBrief
      : `Build ${safeName} — a simple starter site.`;
    buildIntent.name = safeName || 'App';
    buildIntent.slug = slugifyProjectName(buildIntent.name) || 'app';
  }

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
    const created = await runCreateProjectFlow(buildIntent, newProjectId, {
      onFileWrite: (rel) => {
        host.pushStatus(createFileBuildLabel(rel, 'Building'));
      },
    });
    if (await host.stopIfSuperseded()) return { status: 'handled' };

    if (!created.ok) {
      const msg = teachableCreateError(created.error, buildIntent.name);
      markCreateJobFailed(jobId, msg);
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
    host.renameChat(host.chatId, cleanProductTitle(buildIntent.name));
    host.addChat({
      id: host.chatId,
      mode: host.mode,
      title: cleanProductTitle(buildIntent.name),
      updatedAt: new Date().toISOString(),
      preview: host.previewFromText(host.content),
    });
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

    // Prefer the longest brief: thin intent.summary must not hide host.content / thread brief.
    const briefForUi = [buildIntent.summary, richestBrief, host.content]
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0] || String(host.content || '');
    const {
      briefNeedsCreateUiPolish,
      briefLooksLikeMarketingLanding,
      briefLooksLikeChatApp,
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
    const { createIdentityFromBrief, polishPromptLinesFromIdentity, ensureStylesLinked, identityCreateMisses, healFilesToIdentity } = await import('@/lib/createIdentity');
    const createIdentity = createIdentityFromBrief(lockedProductName, briefForUi);
    const chatAppBrief = createIdentity.layout === 'chat-shell' || briefLooksLikeChatApp(briefForUi);
    const marketingBrief = !chatAppBrief && (
      briefLooksLikeMarketingLanding(briefForUi)
      || createIdentity.layout === 'warm-shop'
      || createIdentity.layout === 'catalog-grid'
      || createIdentity.layout === 'editorial-dark'
    );

    // Do not apply pre-baked Discord/marketing/interactive shells — real UI must come from the coder.

    if (needsUiPolish && uiPolishOk !== true) {
      const polishSnapshot = { ...createFilesAcc };
      host.pushStatus(`Planning identity (${createIdentity.category} / ${createIdentity.mood})…`);
      try {
        const coder = await resolveCreateUiPolishCoder(host);
        if (!coder.ok) {
          uiPolishOk = false;
          uiPolishReasons = [coder.reason || 'No suitable coder for UI polish'];
        } else {
          const { answerStudio } = await import('@/lib/studioAnswerEngine');
          const { startProgressHeartbeat } = await import('@/lib/createProgressCopy');
          const stopPolishBeat = startProgressHeartbeat(host.pushStatus, 'polish', 5000);
          try {
          const preferTs = Boolean(
            createFilesAcc['src/App.tsx'] && !createFilesAcc['src/App.jsx'],
          );
          const appPath = preferTs ? 'src/App.tsx' : 'src/App.jsx';
          const basePromptLines = polishPromptLinesFromIdentity(createIdentity, appPath, briefForUi);
          const polishStarted = Date.now();
          const polishBudgetMs = 300_000;
          const polishTotalBudgetMs = 600_000;
          let modelReply = '';
          let lastError = '';
          for (let attempt = 0; attempt < 2; attempt++) {
            const prompt = attempt === 0
              ? basePromptLines.join('\n')
              : [
                  chatAppBrief
                    ? 'RETRY — previous UI was incomplete. Put the ENTIRE Discord-like shell in a single App file + App.css.'
                    : 'RETRY — previous UI was incomplete (missing components and/or truncated mid-write).',
                  chatAppBrief
                    ? 'Include server rail, channel list, chat pane, and working send. No marketing hero.'
                    : 'Put the ENTIRE landing page in a single App file + App.css.',
                  'No imports from ./components. No separate component files.',
                  'Finish every CSS rule and JSX tag — do not stop mid-file.',
                  ...basePromptLines.slice(1),
                ].join('\n');
            const attemptStarted = Date.now();
            const seenCodingPaths = new Set<string>();
            const result = await answerStudio(
              {
                userMessage: prompt,
                files: attempt === 0 ? createFilesAcc : polishSnapshot,
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
                for (const m of String(delta || '').matchAll(/@@@FILE\s+([^\s\n]+)/g)) {
                  const rel = String(m[1] || '').replace(/\\/g, '/').replace(/^\.\//, '');
                  if (!rel || seenCodingPaths.has(rel)) continue;
                  seenCodingPaths.add(rel);
                  host.pushStatus(createFileBuildLabel(rel, 'Coding'));
                }
              },
            );
            if (await host.stopIfSuperseded()) return { status: 'handled' };
            modelReply = String(result.text || '').trim();
            if (!modelReply) {
              lastError = result.error
                || (result.meta ? `UI model returned an empty reply (${result.meta})` : null)
                || 'UI model returned an empty reply';
              continue;
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
              files: attempt === 0 ? createFilesAcc : { ...polishSnapshot },
              userMessage: briefForUi,
              diskRoot: originDiskRoot,
            });
            if (!applied.ok || !applied.updated.length) {
              lastError = applied.error || 'Could not apply UI file edits';
              continue;
            }
            createFilesAcc = applied.files;
            const {
              appLooksLikeStructuredLanding,
              sanitizeCreatePolishPlaceholders,
              buildMarketingCompanionCss,
              cssBlobIsThin,
              createPolishMissingLocalImports,
            } = await import('@/lib/createBuildQuality');
            const { looksLikeTruncatedUiSource } = await import('@/lib/freshSpaFromBrief');
            const missing = createPolishMissingLocalImports(createFilesAcc);
            const appProbe = createFilesAcc['src/App.tsx'] || createFilesAcc['src/App.jsx'] || '';
            const cssProbe = createFilesAcc['src/App.css'] || '';
            const truncated = looksLikeTruncatedUiSource(appProbe) || looksLikeTruncatedUiSource(cssProbe);
            if ((missing.length || truncated) && attempt === 0) {
              host.pushStatus(truncated
                ? 'Rebuilding — previous UI was cut off mid-write…'
                : 'Rebuilding UI in a single App file…');
              createFilesAcc = { ...polishSnapshot };
              lastError = missing.length
                ? `App imports missing modules: ${missing.slice(0, 6).join(', ')}`
                : 'App/CSS source looks truncated mid-write';
              continue;
            }
            if (missing.length) {
              lastError = `App imports missing modules: ${missing.slice(0, 6).join(', ')}`;
              break;
            }
            const preferTsApp = Boolean(
              createFilesAcc['src/App.tsx'] && !createFilesAcc['src/App.jsx'],
            );
            const appKey = preferTsApp ? 'src/App.tsx' : (createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx');
            let appBody = createFilesAcc[appKey] || createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '';
            const cleaned = sanitizeCreatePolishPlaceholders(appBody);
            if (cleaned !== appBody) {
              const cleanApplied = await applyChatReplyEdits({
                reply: `@@@FILE ${appKey}\n${cleaned}`,
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
            if (appLooksLikeStructuredLanding(appBody) && cssBlobIsThin(createFilesAcc, 1500) && !chatAppBrief) {
              host.pushStatus('Finishing landing styles with this brand’s identity palette…');
              const cssApplied = await applyChatReplyEdits({
                reply: `@@@FILE src/App.css\n${buildMarketingCompanionCss(lockedProductName, briefForUi, createIdentity)}`,
                projectId: originProjectId,
                projectName: buildIntent.name,
                files: createFilesAcc,
                userMessage: briefForUi,
                diskRoot: originDiskRoot,
              });
              if (cssApplied.ok) createFilesAcc = cssApplied.files;
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
            // Rewrite generic /heroes/hero.jpg to identity slug path when present.
            {
              const appKey = createFilesAcc['src/App.tsx'] && !createFilesAcc['src/App.jsx']
                ? 'src/App.tsx'
                : (createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx');
              let body = createFilesAcc[appKey] || '';
              if (body && /\/heroes\/hero\.jpg/i.test(body) && createIdentity.heroHref) {
                body = body.replace(/\/heroes\/hero\.jpg/gi, createIdentity.heroHref);
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
            // Heal forbidden hex / missing CSS import before ready check.
            {
              let idMissesProbe = identityCreateMisses(createIdentity, createFilesAcc);
              if (idMissesProbe.length) {
                host.pushStatus(`Fixing hero/CSS to match ${createIdentity.category}…`);
                const healed = healFilesToIdentity(
                  createIdentity,
                  createFilesAcc,
                  (id) => buildMarketingCompanionCss(id.name, briefForUi, id),
                );
                createFilesAcc = healed.files;
                const healBlocks = [
                  createFilesAcc['src/App.css'] ? `@@@FILE src/App.css\n${createFilesAcc['src/App.css']}` : '',
                  createFilesAcc['src/App.jsx'] ? `@@@FILE src/App.jsx\n${createFilesAcc['src/App.jsx']}` : '',
                  createFilesAcc['src/App.tsx'] ? `@@@FILE src/App.tsx\n${createFilesAcc['src/App.tsx']}` : '',
                  createFilesAcc['src/main.jsx'] ? `@@@FILE src/main.jsx\n${createFilesAcc['src/main.jsx']}` : '',
                  createFilesAcc['src/main.tsx'] ? `@@@FILE src/main.tsx\n${createFilesAcc['src/main.tsx']}` : '',
                ].filter(Boolean).join('\n');
                if (healBlocks) {
                  await applyChatReplyEdits({
                    reply: healBlocks,
                    projectId: originProjectId,
                    projectName: buildIntent.name,
                    files: createFilesAcc,
                    userMessage: briefForUi,
                    diskRoot: originDiskRoot,
                  }).then((r) => { if (r.ok) createFilesAcc = r.files; }).catch(() => {});
                }
              }
            }
            appBody = createFilesAcc['src/App.jsx'] || createFilesAcc['src/App.tsx'] || '';
            const ready = isPreviewReady(createFilesAcc, {
              productName: lockedProductName,
              brief: briefForUi,
              requireInteractive: chatAppBrief,
            });
            const idMisses = identityCreateMisses(createIdentity, createFilesAcc);
            const filler = looksLikeFillerStubAppSource(appBody);
            if (!ready.ok || filler || idMisses.length) {
              const structuredKeep = appLooksLikeStructuredLanding(appBody) && !filler && !idMisses.length;
              uiPolishOk = false;
              uiPolishReasons = [
                ...(ready.reasons || []),
                ...idMisses,
                ...(filler ? ['App is still a filler stub (sample/placeholder text)'] : []),
                ...(lastError ? [lastError] : []),
              ];
              if (!structuredKeep && !idMisses.length) {
                const revertBlocks = Object.keys(polishSnapshot)
                  .filter((p) => /(?:^|\/)src\/App\.(?:jsx|tsx|css)$/i.test(p.replace(/\\/g, '/'))
                    || /(?:^|\/)src\/index\.css$/i.test(p.replace(/\\/g, '/')))
                  .filter((p) => polishSnapshot[p] != null && polishSnapshot[p] !== createFilesAcc[p])
                  .map((p) => `@@@FILE ${p}\n${polishSnapshot[p]}`)
                  .join('\n');
                if (revertBlocks) {
                  const reverted = await applyChatReplyEdits({
                    reply: revertBlocks,
                    projectId: originProjectId,
                    projectName: buildIntent.name,
                    files: createFilesAcc,
                    userMessage: briefForUi,
                    diskRoot: originDiskRoot,
                  });
                  if (reverted.ok) createFilesAcc = reverted.files;
                  else createFilesAcc = { ...polishSnapshot };
                } else {
                  createFilesAcc = { ...polishSnapshot };
                }
              }
              // Identity misses: keep healed files on disk but never claim Ready/success.
            } else {
              uiPolishOk = true;
            }
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
        createFilesAcc = { ...polishSnapshot };
      }
    }

    // Image model / Brand Assets: generate or fetch product photos into public/heroes.
    if (uiPolishOk === true && originDiskRoot && marketingBrief) {
      try {
        const { planBrandAssets, materializeBrandAssets } = await import('@/lib/brandAssets');
        host.pushStatus(`Fetching ${createIdentity.category} hero…`);
        const plan = planBrandAssets(briefForUi, lockedProductName);
        const mat = await materializeBrandAssets({
          diskRoot: originDiskRoot,
          files: createFilesAcc,
          plan,
          brief: briefForUi,
          projectName: lockedProductName,
        });
        createFilesAcc = mat.files;
        const linkedAfterHero = ensureStylesLinked(createFilesAcc);
        createFilesAcc = linkedAfterHero.files;
        if (mat.saved.length || linkedAfterHero.changed.length) {
          host.pushStatus(mat.saved.length
            ? `Saved ${mat.saved.length} product image${mat.saved.length === 1 ? '' : 's'}…`
            : 'Linking App.css…');
          const appKey = createFilesAcc['src/App.tsx'] && !createFilesAcc['src/App.jsx']
            ? 'src/App.tsx'
            : (createFilesAcc['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx');
          await applyChatReplyEdits({
            reply: [
              createFilesAcc[appKey] ? `@@@FILE ${appKey}\n${createFilesAcc[appKey]}` : '',
              createFilesAcc['src/main.jsx'] ? `@@@FILE src/main.jsx\n${createFilesAcc['src/main.jsx']}` : '',
              createFilesAcc['src/main.tsx'] ? `@@@FILE src/main.tsx\n${createFilesAcc['src/main.tsx']}` : '',
              createFilesAcc['src/App.css'] ? `@@@FILE src/App.css\n${createFilesAcc['src/App.css']}` : '',
            ].filter(Boolean).join('\n'),
            projectId: originProjectId,
            projectName: buildIntent.name,
            files: createFilesAcc,
            userMessage: briefForUi,
            diskRoot: originDiskRoot,
          }).then((wired) => {
            if (wired.ok && wired.updated.length) createFilesAcc = wired.files;
          }).catch(() => { /* disk already has heroes via materialize */ });
        } else {
          host.pushStatus('Using identity color hero fallback…');
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

    host.commitStudio({
      files: createFilesAcc,
      projectId: originProjectId,
      name: lockedProductName,
      diskRoot: originDiskRoot,
    });
    updateCreateJob(jobId, { files: createFilesAcc });

    const scaffoldKind = resolveProjectKindForCreate(
      buildIntent.summary || host.content,
      buildIntent.kind,
      buildIntent.kind,
    );
    const grantNote = created.grantHint ? `\n\n_${created.grantHint}_` : '';
    const displayName = cleanProductTitle(buildIntent.name);

    // Fail-closed: never mark the create job Ready when polish was required and did not pass.
    if (uiPolishOk === false) {
      const reasonLines = (uiPolishReasons.length ? uiPolishReasons : ['UI not Preview-ready'])
        .slice(0, 8)
        .map((r) => `- ${r}`)
        .join('\n');
      const failAnswer = [
        `**Created ${displayName}** (folder only — UI not Preview-ready)`,
        '',
        originDiskRoot ? `**Path:** \`${originDiskRoot}\`` : '',
        created.parentSource ? `**Location:** ${created.parentSource}` : '',
        '',
        'The first UI pass did not clear Preview Ready — this is **not** a finished app:',
        reasonLines,
        '',
        'Install a local **coder** GGUF (e.g. qwen25-coder-7b) under Models, or ask again to rebuild the UI.',
        'This chat is bound to that folder.',
        created.grantHint || '',
      ].filter(Boolean).join('\n');
      markCreateJobFailed(jobId, uiPolishReasons[0] || 'UI polish failed — scaffold only');
      // Still install deps in the background so a later UI rebuild can Preview — but never Ready.
      if (originDiskRoot && projectUsesNpm(scaffoldKind)) {
        host.pushStatus('Installing dependencies in the background…');
        void bootstrapProjectWorkspace(originDiskRoot, scaffoldKind, {
          files: createFilesAcc,
          preferPreviewUrl: null,
        }).catch(() => { /* best-effort */ });
      }
      await host.finishPlainReply(`${failAnswer}${grantNote}`, 'NOVA · scaffold');
      return { status: 'handled' };
    }

    if (originDiskRoot && projectUsesNpm(scaffoldKind)) {
      host.pushStatus('Installing dependencies in the background…');
      host.pushStatus('Starting Live preview…');
      markCreateJobNpm(jobId);
      void bootstrapProjectWorkspace(originDiskRoot, scaffoldKind, {
        files: createFilesAcc,
        preferPreviewUrl: null,
      }).then((boot: ProjectBootstrapResult) => {
        // Only mark Ready when we already verified a real UI — never Ready on a title splash.
        if (boot.npmInstalled && uiPolishOk === true) {
          markCreateJobReady(jobId, boot.devServerUrl || null);
        } else if (!boot.npmInstalled) {
          markCreateJobFailed(jobId, boot.bootstrapNote || 'npm install failed');
        } else {
          markCreateJobFailed(jobId, 'UI not Preview-ready');
        }
      }).catch((err) => {
        markCreateJobFailed(jobId, err instanceof Error ? err.message : 'npm failed');
      });
    } else if (uiPolishOk === true) {
      markCreateJobReady(jobId, null);
    } else {
      markCreateJobFailed(jobId, 'UI not Preview-ready');
    }

    const bootstrapNote = chatAppBrief
      ? 'Discord-like UI is ready for Live.'
      : marketingBrief
        ? 'Product store UI is ready for Live.'
        : 'Starter UI is ready for Live.';
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
      pendingCreateBootstrap(bootstrapNote),
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
        bootstrapNote,
      ],
    });
    await host.finishPlainReply(createAnswer, 'NOVA · create');
    return { status: 'handled' };
  } catch (createErr) {
    const msg = teachableCreateError(
      createErr instanceof Error ? createErr.message : String(createErr || 'unknown error'),
      buildIntent.name,
    );
    markCreateJobFailed(jobId, msg);
    await host.finishPlainReply(msg);
    return { status: 'handled' };
  }
}
