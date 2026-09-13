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

export { pendingCreateBootstrap } from './createBootstrap';

export type CreateTurnOutcome =
  | { status: 'handled' }
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
  finishPlainReply: (text: string, provider?: string) => Promise<void>;
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
  setLastDiskTarget: (chatId: string, target: { path: string; name: string; kind: 'folder' }) => void;
  clearPending: (chatId: string) => void;
  getPending: (chatId: string) => {
    name?: string;
    slug?: string;
    kind?: string;
    summary?: string;
  } | null;
  previewFromText: (text: string) => string | undefined;
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
      'Install Node.js LTS, then say **install npm dependencies** or click **Preview**.',
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
  const lockedProductName = cleanProductTitle(
    lockedFromAsk || intent.name || pending?.name || intent.name || 'New App',
  );
  const safeName = (/^(my|new|app|project)$/i.test(lockedProductName) && lockedFromAsk)
    ? cleanProductTitle(lockedFromAsk)
    : lockedProductName;

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
    host.pushStatus('Writing project files…');
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

    const created = await runCreateProjectFlow(buildIntent, newProjectId);
    if (await host.stopIfSuperseded()) return { status: 'handled' };

    if (!created.ok) {
      const msg = teachableCreateError(created.error, buildIntent.name);
      markCreateJobFailed(jobId, msg);
      await host.finishPlainReply(msg);
      return { status: 'handled' };
    }

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
    if (originDiskRoot) {
      host.setLastDiskTarget(host.chatId, {
        path: originDiskRoot,
        name: lockedProductName,
        kind: 'folder',
      });
    }

    try {
      const { blankSolidColorFromAsk, reactSurgicalMicroAskEdits } = await import('@/lib/webProjectCanon');
      const surgicalCreate = reactSurgicalMicroAskEdits(createFilesAcc, buildIntent.summary || host.content);
      if (surgicalCreate.length) {
        host.pushStatus('Applying UI patch…');
        const surgicalReply = surgicalCreate.map((e) => `@@@FILE ${e.path}\n${e.content}`).join('\n');
        const surgicalApplied = await applyChatReplyEdits({
          reply: surgicalReply,
          projectId: originProjectId,
          projectName: buildIntent.name,
          files: createFilesAcc,
          userMessage: buildIntent.summary || host.content,
          diskRoot: originDiskRoot,
        });
        if (surgicalApplied.ok && surgicalApplied.updated.length) {
          createFilesAcc = surgicalApplied.files;
        }
      } else {
        const blankSolidColor = blankSolidColorFromAsk(buildIntent.summary || host.content);
        if (blankSolidColor) {
          host.pushStatus(`Painting solid ${blankSolidColor} shell…`);
          const blankApplied = await applyChatReplyEdits({
            reply: '',
            projectId: originProjectId,
            projectName: buildIntent.name,
            files: createFilesAcc,
            userMessage: buildIntent.summary || host.content,
            diskRoot: originDiskRoot,
          });
          if (blankApplied.ok && blankApplied.updated.length) {
            createFilesAcc = blankApplied.files;
          }
        }
      }
    } catch { /* best-effort */ }

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
    if (originDiskRoot && projectUsesNpm(scaffoldKind)) {
      host.pushStatus('Installing dependencies in the background…');
      markCreateJobNpm(jobId);
      void bootstrapProjectWorkspace(originDiskRoot, scaffoldKind, {
        files: createFilesAcc,
      }).then((boot: ProjectBootstrapResult) => {
        if (boot.npmInstalled && boot.previewLive) {
          markCreateJobReady(jobId, boot.devServerUrl || null);
        } else if (boot.npmInstalled) {
          markCreateJobReady(jobId, boot.devServerUrl || null);
        } else {
          markCreateJobFailed(jobId, boot.bootstrapNote || 'npm install failed');
        }
      }).catch((err) => {
        markCreateJobFailed(jobId, err instanceof Error ? err.message : 'npm failed');
      });
    } else {
      markCreateJobReady(jobId, null);
    }

    const grantNote = created.grantHint ? `\n\n_${created.grantHint}_` : '';
    const createAnswer = `${formatCreateProjectReply(
      { ...buildIntent, kind: scaffoldKind },
      {
        ok: true,
        projectPath: originDiskRoot || undefined,
        projectId: originProjectId,
        parentSource: created.parentSource,
        written: Object.keys(createFilesAcc),
        files: createFilesAcc,
        grantHint: created.grantHint,
      },
      pendingCreateBootstrap(
        'Click **Preview** shortly, or say **make it richer** to expand the UI.',
      ),
    )}${grantNote}`;
    await host.finishPlainReply(createAnswer, 'NOVA · scaffold');
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
