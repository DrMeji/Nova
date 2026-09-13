/**
 * Create project from Chat. resolve path → mkdir → bind → scaffold write.
 */

import type { NewProjectIntent } from '@/lib/createProjectIntent';
import { resolveProjectKindForCreate } from '@/lib/projectKind';
import { buildScaffoldFiles, projectUsesNpm } from '@/lib/projectScaffolds';
import { grantsFromPrefs, hasFolderAccessGrant, syncWorkspaceGrantsFromPrefs } from '@/lib/workspaceGrants';
import { safeProjectWrite } from '@/lib/projectWriteSafe';
import { runAgentCommand } from '@/lib/chatAgentExec';
import { cleanProductTitle } from '@/lib/freshSpaFromBrief';
import { slugifyProjectName } from '@/lib/projectNames';

export type ProjectBootstrapResult = {
  npmInstalled: boolean;
  /** Install kicked off in background — not a failure. */
  npmPending?: boolean;
  /** Set only when the Vite/dev server answered HTTP (localhost live). */
  devServerUrl?: string;
  bootstrapNote?: string;
  /** True when a localhost Preview probe succeeded for this create. */
  previewLive?: boolean;
};

export type CreateProjectResult = {
  ok: boolean;
  projectPath?: string;
  projectId?: string;
  parentSource?: string;
  written: string[];
  files: Record<string, string>;
  error?: string;
  grantHint?: string;
};

function joinPath(root: string, name: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[/\\]+$/, '')}${sep}${name}`;
}

export async function resolveNewProjectParent(
  intent: NewProjectIntent,
): Promise<{ parentPath: string; source: string; grantHint?: string }> {
  await syncWorkspaceGrantsFromPrefs();
  const grants = grantsFromPrefs();

  // Honor Settings → Projects → Default project location when it looks like a real path
  // AND folder grants allow writing there. Never force Documents/Desktop without grants
  // (that produced instant "Path is outside an approved NOVA workspace" on create).
  try {
    const { getLocalPrefs } = await import('@/lib/localPrefs');
    const locRaw = String(getLocalPrefs().projectLocation || '').trim();
    let loc = locRaw;
    if (loc.startsWith('~/') || loc === '~') {
      const roots = await window.arkDesktop?.browseRoots?.();
      const docs = roots?.roots?.find(r => r.id === 'documents')?.path;
      const desk = roots?.roots?.find(r => r.id === 'desktop')?.path;
      const base = (grants.documents && docs) || (grants.desktop && desk) || '';
      if (base) {
        const rest = loc === '~' ? 'NOVA Projects' : loc.replace(/^~[/\\]?/, '');
        loc = joinPath(base, rest.replace(/^NOVA\/Projects$/i, 'NOVA Projects'));
      } else {
        loc = '';
      }
    }
    if (
      loc
      && !loc.startsWith('~')
      && (/^[A-Za-z]:[\\/]/.test(loc) || loc.startsWith('/'))
      && (grants.fullPc || grants.documents || grants.desktop || hasFolderAccessGrant())
    ) {
      const parentPath = joinPath(loc.replace(/[/\\]+$/, ''), intent.slug);
      return { parentPath, source: loc };
    }
  } catch {
    /* fall through */
  }

  if (intent.explicitPath) {
    const parent = intent.explicitPath.replace(/[/\\][^/\\]+$/, '');
    return { parentPath: joinPath(parent, intent.slug), source: intent.explicitPath };
  }

  const roots = await window.arkDesktop?.browseRoots?.();
  const desktop = roots?.roots?.find(r => r.id === 'desktop')?.path;
  const documents = roots?.roots?.find(r => r.id === 'documents')?.path;

  // Prefer NOVA's own projects folder (not Desktop\Projects).
  if (grants.documents && documents) {
    const arkDir = joinPath(documents, 'NOVA Projects');
    await window.arkDesktop?.workspaceMkdir?.({ targetPath: arkDir });
    return { parentPath: joinPath(arkDir, intent.slug), source: 'Documents\\NOVA Projects' };
  }

  if (grants.desktop && desktop) {
    const arkDir = joinPath(desktop, 'NOVA Projects');
    await window.arkDesktop?.workspaceMkdir?.({ targetPath: arkDir });
    return { parentPath: joinPath(arkDir, intent.slug), source: 'Desktop\\NOVA Projects' };
  }

  // First create with grants never touched: enable Documents so mkdir is not blocked.
  if (documents && !grants.documents && !grants.desktop && !grants.fullPc) {
    try {
      const { setLocalPrefs } = await import('@/lib/localPrefs');
      setLocalPrefs({ allowDocumentsFolderAccess: true });
      await window.arkDesktop?.workspaceSetGrants?.({
        desktop: false,
        documents: true,
        fullPc: false,
        executionMode: grants.executionMode || 'allowlist',
      });
      const arkDir = joinPath(documents, 'NOVA Projects');
      const mkdir = await window.arkDesktop?.workspaceMkdir?.({ targetPath: arkDir });
      if (mkdir?.ok !== false) {
        return { parentPath: joinPath(arkDir, intent.slug), source: 'Documents\\NOVA Projects' };
      }
    } catch {
      /* fall through to sandbox */
    }
  }

  const sandbox = await window.arkDesktop?.workspaceSandboxRoot?.();
  if (sandbox?.ok && sandbox.path) {
    return {
      parentPath: joinPath(sandbox.path, intent.slug),
      source: 'NOVA Projects folder',
      grantHint: !hasFolderAccessGrant()
        ? 'Folder access is off. created inside NOVA storage. Enable **Settings → Security → Documents** (or Desktop) to use **NOVA Projects** next time.'
        : undefined,
    };
  }

  return {
    parentPath: '',
    source: '',
    grantHint: 'Turn on **Documents** or **Desktop** folder access in Settings → Security so NOVA can create projects in **NOVA Projects**.',
  };
}

export async function runCreateProjectFlow(
  intent: NewProjectIntent,
  projectId: string,
): Promise<CreateProjectResult> {
  const name = cleanProductTitle(intent.name);
  const cleaned: NewProjectIntent = {
    ...intent,
    name,
    slug: slugifyProjectName(name),
  };
  const { parentPath, source, grantHint } = await resolveNewProjectParent(cleaned);
  if (!parentPath) {
    return {
      ok: false,
      written: [],
      files: {},
      error: grantHint || 'Could not resolve a folder to create the project.',
      grantHint,
    };
  }

  // If the preferred name is taken, pick My 2 / Northline 3 — never block on a leftover folder.
  const parentDir = parentPath.replace(/[/\\][^/\\]+$/, '');
  let finalPath = parentPath;
  let finalName = cleaned.name;
  let finalSlug = cleaned.slug;
  let mkdir: { ok?: boolean; error?: string; path?: string; existed?: boolean; created?: boolean } | undefined;
  for (let i = 0; i < 24; i++) {
    const trySlug = i === 0 ? cleaned.slug : `${cleaned.slug}-${i + 1}`;
    const tryName = i === 0 ? cleaned.name : `${cleaned.name} ${i + 1}`;
    const tryPath = i === 0 ? parentPath : joinPath(parentDir, trySlug);
    mkdir = await window.arkDesktop?.workspaceMkdir?.({ targetPath: tryPath });
    if (mkdir?.ok) {
      finalPath = tryPath;
      finalName = tryName;
      finalSlug = trySlug;
      break;
    }
    if (mkdir?.error === 'exists_nonempty') continue;
    return {
      ok: false,
      written: [],
      files: {},
      error: mkdir?.error || 'Could not create project folder.',
      grantHint,
    };
  }
  if (!mkdir?.ok) {
    return {
      ok: false,
      written: [],
      files: {},
      error: `Could not find a free folder name near “${cleaned.name}”. Remove an old project in Projects, or pick another name.`,
      grantHint,
    };
  }

  const bind = await window.arkDesktop?.workspaceOpenRoot?.({
    projectId,
    projectName: finalName,
    sourceDir: finalPath,
    catalogOnly: true,
  });

  if (!bind?.ok || !bind.root) {
    return {
      ok: false,
      written: [],
      files: {},
      error: bind?.error || 'Could not open the new project folder.',
      grantHint,
    };
  }

  cleaned.name = finalName;
  cleaned.slug = finalSlug;

  const scaffoldKind = resolveProjectKindForCreate(cleaned.summary, cleaned.kind, cleaned.kind);
  // Skills are for LLM prompts only — never bake "NOVA design skills" copy into App.jsx.
  let preferredLanguage = 'TypeScript';
  try {
    const { getLocalPrefs } = await import('@/lib/localPrefs');
    preferredLanguage = getLocalPrefs().preferredLanguage || preferredLanguage;
  } catch { /* defaults */ }
  const scaffold = buildScaffoldFiles(scaffoldKind, {
    name: cleaned.name,
    summary: cleaned.summary,
    preferredLanguage,
  });
  const fileMap = Object.fromEntries(scaffold.map(f => [f.path.replace(/\\/g, '/'), f.content]));

  const write = await safeProjectWrite({
    projectId,
    projectName: cleaned.name,
    files: fileMap,
  });

  if (!write.ok) {
    return {
      ok: false,
      projectPath: bind.root,
      projectId,
      parentSource: source,
      written: [],
      files: {},
      error: write.error || 'Scaffold write failed.',
      grantHint,
    };
  }

  const written = write.files || Object.keys(fileMap);
  return {
    ok: true,
    projectPath: bind.root,
    projectId,
    parentSource: source,
    written,
    files: fileMap,
    grantHint,
  };
}

/** True when cwd has a package.json (async disk check). */
async function folderHasPackageJson(projectPath: string): Promise<boolean> {
  const sep = projectPath.includes('\\') ? '\\' : '/';
  const pkg = `${projectPath.replace(/[/\\]+$/, '')}${sep}package.json`;
  try {
    const st = await window.arkDesktop?.workspaceStatPath?.(pkg);
    if (st?.ok && st.isFile) return true;
  } catch {
    /* fall through */
  }
  try {
    // Avoid node -e (blocked). Presence via directory listing is enough.
    const listed = await window.arkDesktop?.agentRun?.({
      command: 'npm --version',
      cwd: projectPath,
      skipConfirm: true,
      userConfirmed: true,
    });
    if (listed?.ok) {
      const st2 = await window.arkDesktop?.workspaceStatPath?.(pkg);
      if (st2?.ok && st2.isFile) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function sanitizeBootstrapNote(raw: string | undefined): string | undefined {
  const t = String(raw || '').trim();
  if (!t) return undefined;
  // Drop raw stack / path dumps; keep a short human line when possible.
  if (/at\s+\S+\s+\(|node:internal\/|Error:\s*ENOENT:.*\\/i.test(t) && t.length > 180) {
    if (/node|npm|not recognized|not found|eresolve|peer dep/i.test(t)) {
      return 'npm install failed (Node/npm missing or dependency conflict).';
    }
    return undefined;
  }
  return t.replace(/\s+/g, ' ').slice(0, 280);
}

function npmInstallLooksFailed(outcome: { ok?: boolean; reply?: string; handled?: boolean }): boolean {
  // Prefer the shell exit flag from runAgentCommand.
  if (outcome.ok === true) return false;
  if (outcome.ok === false) return true;
  if (!outcome.handled) return true;
  const r = String(outcome.reply || '');
  if (/could not run|ENOENT|npm\s*err|ERESOLVE|not recognized|is not recognized|command failed/i.test(r)) {
    return true;
  }
  if (/dependencies installed successfully|added \d+ package|up to date|audited \d+ package/i.test(r)) {
    return false;
  }
  // Unknown outcome without ok:true — treat as failed so we never fake Ready.
  return true;
}

/** npm install + dev server. only when the project actually uses npm. */
export async function bootstrapProjectWorkspace(
  projectPath: string,
  kind: NewProjectIntent['kind'],
  opts?: { files?: Record<string, string> },
): Promise<ProjectBootstrapResult> {
  if (!projectPath) {
    return { npmInstalled: true };
  }

  const filesHavePkg = Boolean(
    opts?.files
    && Object.keys(opts.files).some(p => /(^|\/)package\.json$/i.test(p.replace(/\\/g, '/'))),
  );
  const diskHasPkg = filesHavePkg || (await folderHasPackageJson(projectPath));

  // Static HTML/CSS/JS scaffolds (calculator, landings, etc.) must never run npm.
  if (!diskHasPkg || !projectUsesNpm(kind)) {
    return { npmInstalled: true };
  }

  const install = await runAgentCommand({
    command: 'npm install',
    cwd: projectPath,
    skipConfirm: true,
  });

  if (npmInstallLooksFailed(install)) {
    // No winget — tell the user once. Background hammer freezes weak PCs.
    const nodeOk = await window.arkDesktop?.agentRun?.({
      command: 'node -v',
      cwd: undefined,
      skipConfirm: true,
      userConfirmed: true,
    });
    if (!nodeOk?.ok) {
      return {
        npmInstalled: false,
        previewLive: false,
        bootstrapNote: 'Node.js is not installed. Install Node.js LTS, then say **install npm dependencies** or **run Preview**.',
      };
    }
    return {
      npmInstalled: false,
      previewLive: false,
      bootstrapNote: sanitizeBootstrapNote(install.reply)
        || 'Could not install npm dependencies automatically. Say **install npm dependencies** to retry, or open the folder and run `npm install` once.',
    };
  }

  // depsReady: skip a second npm install — double install was freezing the whole PC.
  const dev = await window.arkDesktop?.agentStartDevServer?.({
    cwd: projectPath,
    depsReady: true,
  });
  if (dev?.ok && dev.url) {
    return { npmInstalled: true, devServerUrl: dev.url, previewLive: true };
  }

  return {
    npmInstalled: true,
    previewLive: false,
    bootstrapNote: sanitizeBootstrapNote(
      dev?.error
        ? `Dependencies installed. Dev server did not start (${dev.error}). Say **run Preview** or **run dev server**.`
        : 'Dependencies installed, but the live Preview server did not respond yet. Say **run Preview** to retry.',
    ),
  };
}

export function formatCreateProjectReply(
  intent: NewProjectIntent,
  result: CreateProjectResult,
  bootstrap?: ProjectBootstrapResult,
): string {
  if (!result.ok) {
    return result.error || 'Could not create the project.';
  }

  const displayName = cleanProductTitle(intent.name);
  const hasPackageJson = Boolean(
    result.files && Object.keys(result.files).some(p => /package\.json$/i.test(p.replace(/\\/g, '/'))),
  );
  const isStatic = intent.kind === 'static-web'
    || (!hasPackageJson && intent.kind !== 'vite-react' && intent.kind !== 'python');
  const livePreview = Boolean(bootstrap?.previewLive && bootstrap?.devServerUrl);

  let statusLine: string;
  if (bootstrap?.npmPending) {
    statusLine = [
      '**Files written.** Dependencies install in the background.',
      bootstrap.bootstrapNote || 'Click **Preview** in a moment, or say **make it richer** to expand the UI.',
    ].join('\n');
  } else if (bootstrap?.npmInstalled === false) {
    statusLine = [
      '**Not Ready yet.** **npm install failed.**',
      bootstrap.bootstrapNote || 'Dependencies need a one-time install before Preview can run.',
      '',
      'Say **install npm dependencies** to retry (or install Node.js LTS, then retry).',
    ].join('\n');
  } else if (intent.kind === 'python') {
    statusLine = '**Ready**. edit `app/main.py` and say what to build next.';
  } else if (isStatic) {
    statusLine = '**Ready**. use **Preview** under the chat box to open the site, or **Code** to edit files. Tell me what to add.';
  } else if (livePreview) {
    statusLine = `**Ready**. Live Preview is up at **${bootstrap!.devServerUrl}**. Click **Preview** under the chat box to open it.\n\nTell me what to build next (layout, pages, features) and I will edit the files here.`;
  } else if (hasPackageJson || projectUsesNpm(intent.kind)) {
    // Vite / npm projects must not claim Ready without a responding localhost.
    statusLine = `**Not Ready yet.** Files are on disk, but live Preview did not start.${
      bootstrap?.bootstrapNote ? `\n\n${bootstrap.bootstrapNote}` : ''
    }\n\nSay **run Preview** after Node/npm is working, or **keep building** if the UI still needs work.`;
  } else {
    statusLine = '**Ready**. use **Preview** under the chat box, or **Code** to edit files.';
  }

  const lines = [
    `**Created ${displayName}**`,
    '',
    `**Path:** \`${result.projectPath}\``,
    result.parentSource ? `**Location:** ${result.parentSource}` : '',
    '',
    `**Files written (${result.written.length}):**`,
    ...result.written.slice(0, 12).map(p => `- \`${p}\``),
    result.written.length > 12 ? `- …and ${result.written.length - 12} more` : '',
    '',
    statusLine,
    bootstrap?.bootstrapNote && bootstrap.npmInstalled && livePreview
      ? `\n${bootstrap.bootstrapNote}`
      : '',
    '',
    'This chat is bound to that folder.',
    result.grantHint || '',
  ].filter(Boolean);

  return lines.join('\n');
}

