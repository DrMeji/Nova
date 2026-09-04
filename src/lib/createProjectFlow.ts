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
  devServerUrl?: string;
  bootstrapNote?: string;
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

  if (intent.explicitPath) {
    const parent = intent.explicitPath.replace(/[/\\][^/\\]+$/, '');
    return { parentPath: joinPath(parent, intent.slug), source: intent.explicitPath };
  }

  const roots = await window.arkDesktop?.browseRoots?.();
  const desktop = roots?.roots?.find(r => r.id === 'desktop')?.path;
  const documents = roots?.roots?.find(r => r.id === 'documents')?.path;

  // Prefer ARK's own projects folder (not Desktop\Projects).
  if (grants.documents && documents) {
    const arkDir = joinPath(documents, 'ARK Projects');
    await window.arkDesktop?.workspaceMkdir?.({ targetPath: arkDir });
    return { parentPath: joinPath(arkDir, intent.slug), source: 'Documents\\ARK Projects' };
  }

  if (grants.desktop && desktop) {
    const arkDir = joinPath(desktop, 'ARK Projects');
    await window.arkDesktop?.workspaceMkdir?.({ targetPath: arkDir });
    return { parentPath: joinPath(arkDir, intent.slug), source: 'Desktop\\ARK Projects' };
  }

  const sandbox = await window.arkDesktop?.workspaceSandboxRoot?.();
  if (sandbox?.ok && sandbox.path) {
    return {
      parentPath: joinPath(sandbox.path, intent.slug),
      source: 'ARK projects folder',
      grantHint: !hasFolderAccessGrant()
        ? 'Folder access is off. created inside ARK storage. Enable **Settings → Security → Documents** (or Desktop) to use **ARK Projects** next time.'
        : undefined,
    };
  }

  return {
    parentPath: '',
    source: '',
    grantHint: 'Turn on **Documents** or **Desktop** folder access in Settings → Security so ARK can create projects in **ARK Projects**.',
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
  // Skills are for LLM prompts only — never bake "ARK design skills" copy into App.jsx.
  const scaffold = buildScaffoldFiles(scaffoldKind, { name: cleaned.name, summary: cleaned.summary });
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
  // Never surface raw npm ENOENT / stack dumps to end users.
  if (/ENOENT|package\.json|npm error|could not run\s*`?npm install/i.test(t)) {
    return undefined;
  }
  return t.slice(0, 280);
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

  if (!install.handled || (install.reply && /could not run|ENOENT|npm error/i.test(install.reply))) {
    return {
      npmInstalled: false,
      bootstrapNote: sanitizeBootstrapNote(install.reply)
        || 'Could not install npm dependencies automatically. Say **install npm dependencies** to retry, or open the folder and run `npm install` once.',
    };
  }

  const dev = await window.arkDesktop?.agentStartDevServer?.({ cwd: projectPath });
  if (dev?.ok && dev.url) {
    return { npmInstalled: true, devServerUrl: dev.url };
  }

  return {
    npmInstalled: true,
    bootstrapNote: sanitizeBootstrapNote(
      dev?.error
        ? `Dependencies installed. Dev server did not start (${dev.error}). say **run dev server** or use **Preview**.`
        : undefined,
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
  const isStatic = intent.kind === 'static-web'
    || (!bootstrap?.devServerUrl && result.files && !Object.keys(result.files).some(p => /package\.json$/i.test(p)));

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
    bootstrap?.npmInstalled === false
      ? `**Setup:** ${bootstrap.bootstrapNote || 'Dependencies need a one-time install.'}`
      : intent.kind === 'python'
        ? '**Ready**. edit `app/main.py` and say what to build next.'
        : isStatic || intent.kind === 'static-web'
          ? '**Ready**. use **Preview** under the chat box to open the site, or **Code** to edit files. Tell me what to add.'
          : bootstrap?.devServerUrl
            ? `**Ready**. dependencies installed. Dev server is at **${bootstrap.devServerUrl}**. click **Localhost** under the chat box to open it.\n\nTell me what to build (layout, pages, features) and I will edit the files here.`
            : '**Ready**. dependencies installed. Tell me what to build and I will edit the files here.',
    bootstrap?.bootstrapNote && bootstrap.npmInstalled ? `\n${bootstrap.bootstrapNote}` : '',
    '',
    'This chat is bound to that folder.',
    result.grantHint || '',
  ].filter(Boolean);

  return lines.join('\n');
}
