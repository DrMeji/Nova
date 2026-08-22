/**
 * Create project from Chat — resolve path → mkdir → bind → scaffold write.
 */

import type { NewProjectIntent } from '@/lib/createProjectIntent';
import { buildScaffoldFiles, projectUsesNpm } from '@/lib/projectScaffolds';
import { grantsFromPrefs, hasFolderAccessGrant, syncWorkspaceGrantsFromPrefs } from '@/lib/workspaceGrants';
import { safeProjectWrite } from '@/lib/projectWriteSafe';
import { runAgentCommand } from '@/lib/chatAgentExec';

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

  if (grants.desktop && desktop) {
    const projectsDir = joinPath(desktop, 'Projects');
    await window.arkDesktop?.workspaceMkdir?.({ targetPath: projectsDir });
    return { parentPath: joinPath(projectsDir, intent.slug), source: 'Desktop\\Projects' };
  }

  if (grants.documents && documents) {
    const arkDir = joinPath(documents, 'ARK Projects');
    await window.arkDesktop?.workspaceMkdir?.({ targetPath: arkDir });
    return { parentPath: joinPath(arkDir, intent.slug), source: 'Documents\\ARK Projects' };
  }

  const sandbox = await window.arkDesktop?.workspaceSandboxRoot?.();
  if (sandbox?.ok && sandbox.path) {
    return {
      parentPath: joinPath(sandbox.path, intent.slug),
      source: 'ARK projects folder',
      grantHint: !hasFolderAccessGrant()
        ? 'Desktop access is off — created inside ARK storage. Enable **Settings → Security → Desktop** to use Desktop\\Projects next time.'
        : undefined,
    };
  }

  return {
    parentPath: '',
    source: '',
    grantHint: 'Turn on **Desktop folder access** in Settings → Security to create projects on your Desktop.',
  };
}

export async function runCreateProjectFlow(
  intent: NewProjectIntent,
  projectId: string,
): Promise<CreateProjectResult> {
  const { parentPath, source, grantHint } = await resolveNewProjectParent(intent);
  if (!parentPath) {
    return {
      ok: false,
      written: [],
      files: {},
      error: grantHint || 'Could not resolve a folder to create the project.',
      grantHint,
    };
  }

  const mkdir = await window.arkDesktop?.workspaceMkdir?.({ targetPath: parentPath });
  if (!mkdir?.ok) {
    if (mkdir?.error === 'exists_nonempty') {
      return {
        ok: false,
        written: [],
        files: {},
        error: `Folder already exists and is not empty:\n\`${parentPath}\`\n\nSay **“use existing folder ${intent.name}”** or pick another name.`,
        grantHint,
      };
    }
    return {
      ok: false,
      written: [],
      files: {},
      error: mkdir?.error || 'Could not create project folder.',
      grantHint,
    };
  }

  const bind = await window.arkDesktop?.workspaceOpenRoot?.({
    projectId,
    projectName: intent.name,
    sourceDir: parentPath,
    catalogOnly: true,
  });

  if (!bind?.ok || !bind.root) {
    return {
      ok: false,
      written: [],
      files: {},
      error: bind?.error || 'Created folder but could not bind workspace.',
      grantHint,
    };
  }

  const scaffold = buildScaffoldFiles(intent.kind, { name: intent.name, summary: intent.summary });
  const fileMap = Object.fromEntries(scaffold.map(f => [f.path.replace(/\\/g, '/'), f.content]));

  const write = await safeProjectWrite({
    projectId,
    projectName: intent.name,
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

/** npm install + dev server — runs automatically after create (no extra user step). */
export async function bootstrapProjectWorkspace(
  projectPath: string,
  kind: NewProjectIntent['kind'],
): Promise<ProjectBootstrapResult> {
  if (!projectPath || !projectUsesNpm(kind)) {
    return { npmInstalled: true };
  }

  const install = await runAgentCommand({
    command: 'npm install',
    cwd: projectPath,
    skipConfirm: true,
  });

  if (!install.handled || (install.reply && /could not run/i.test(install.reply))) {
    return {
      npmInstalled: false,
      bootstrapNote: install.reply || 'npm install did not complete — say **install npm dependencies** to retry.',
    };
  }

  const dev = await window.arkDesktop?.agentStartDevServer?.({ cwd: projectPath });
  if (dev?.ok && dev.url) {
    return { npmInstalled: true, devServerUrl: dev.url };
  }

  return {
    npmInstalled: true,
    bootstrapNote: dev?.error
      ? `Dependencies installed. Dev server did not start (${dev.error}) — say **run dev server** or open \`index.html\`.`
      : undefined,
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

  const lines = [
    `**Created ${intent.name}**`,
    '',
    `**Path:** \`${result.projectPath}\``,
    result.parentSource ? `**Location:** ${result.parentSource}` : '',
    '',
    `**Files written (${result.written.length}):**`,
    ...result.written.slice(0, 12).map(p => `- \`${p}\``),
    result.written.length > 12 ? `- …and ${result.written.length - 12} more` : '',
    '',
    bootstrap?.npmInstalled === false
      ? `**Setup:** ${bootstrap.bootstrapNote || 'Run npm install manually.'}`
      : intent.kind === 'python'
        ? '**Ready** — edit `app/main.py` and say what to build next.'
        : intent.kind === 'static-web'
          ? '**Ready** — open `index.html` in your browser and tell me what to add.'
          : bootstrap?.devServerUrl
            ? `**Ready** — dependencies installed, dev server running at **${bootstrap.devServerUrl}**.\n\nOpen that URL in your browser. Tell me what to build (layout, pages, features) and I will edit the files here.`
            : '**Ready** — dependencies installed. Tell me what to build and I will edit the files here.',
    bootstrap?.bootstrapNote && bootstrap.npmInstalled ? `\n${bootstrap.bootstrapNote}` : '',
    '',
    'This chat is bound to that folder.',
    result.grantHint || '',
  ].filter(Boolean);

  return lines.join('\n');
}
