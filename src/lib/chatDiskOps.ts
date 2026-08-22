/**
 * Add / delete single files on disk from Chat.
 */

import {
  cleanDiskTargetName,
  namesRoughlyMatch,
  normalizeDiskFileName,
} from './projectNames';
import { resolveNamedFolderOnDisk, resolveDesktopProjectsFolderOnDisk } from './deleteProjectFlow';
import { DESKTOP_PROJECTS_PARENT } from './chatDiskIntent';
import type { LastListedFolder } from './chatStudioStore';

function joinPath(root: string, name: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[/\\]+$/, '')}${sep}${name}`;
}

async function pathStat(targetPath: string) {
  return window.arkDesktop?.pathStat?.(targetPath);
}

export type DeleteFileChatOutcome =
  | { kind: 'not-delete' }
  | { kind: 'reply'; text: string }
  | { kind: 'prompt'; fileName: string; filePath: string; projectId: string | null }
  | {
      kind: 'folder_mismatch';
      folderName: string;
      folderPath: string;
      projectId: string | null;
    };

export async function handleDeleteFileChatRequest(opts: {
  fileName: string | null;
  parentHint?: string;
  workspaceDiskRoot?: string | null;
  workspaceProjectId?: string | null;
  workspaceFiles?: Record<string, string>;
  stickyTarget?: { path: string; name: string; kind: 'file' | 'folder' } | null;
}): Promise<DeleteFileChatOutcome> {
  const {
    fileName,
    parentHint,
    workspaceDiskRoot,
    workspaceProjectId,
    workspaceFiles = {},
    stickyTarget,
  } = opts;

  let wantFile = fileName ? normalizeDiskFileName(fileName) : null;
  if (!wantFile && stickyTarget?.kind === 'file') {
    wantFile = stickyTarget.name;
  }
  if (!wantFile) {
    return {
      kind: 'reply',
      text: 'Which file should I delete? Say e.g. *delete the file readme.md* or *delete the file called notes.txt in Starbucks*.',
    };
  }

  const fileKeys = Object.keys(workspaceFiles);
  const relHit = fileKeys.find(k => namesRoughlyMatch(k, wantFile!) || k.endsWith(`/${wantFile}`));
  if (relHit && workspaceProjectId) {
    const stat = workspaceDiskRoot
      ? await pathStat(joinPath(workspaceDiskRoot, relHit))
      : null;
    if (!stat?.ok || stat.isFile) {
      return {
        kind: 'prompt',
        fileName: relHit.split(/[/\\]/).pop() || wantFile,
        filePath: workspaceDiskRoot ? joinPath(workspaceDiskRoot, relHit) : relHit,
        projectId: workspaceProjectId,
      };
    }
  }

  let parentPath = workspaceDiskRoot || null;
  if (parentHint) {
    const resolved = await resolveNamedFolderOnDisk(parentHint);
    if (resolved?.path) parentPath = resolved.path;
  }
  if (!parentPath && parentHint) {
    const resolved = await resolveNamedFolderOnDisk(parentHint);
    parentPath = resolved?.path || null;
  }
  if (!parentPath && stickyTarget?.kind === 'folder') {
    parentPath = stickyTarget.path;
  }

  const candidatePath = parentPath ? joinPath(parentPath, wantFile) : wantFile;
  const stat = await pathStat(candidatePath);
  if (!stat?.ok) {
    return {
      kind: 'reply',
      text: `Couldn't find a file named **${wantFile}**${parentPath ? ` in \`${parentPath}\`` : ''}. Check the name in File Explorer.`,
    };
  }

  if (stat.isDirectory) {
    return {
      kind: 'folder_mismatch',
      folderName: stat.name || wantFile,
      folderPath: stat.path || candidatePath,
      projectId: workspaceProjectId || null,
    };
  }

  return {
    kind: 'prompt',
    fileName: stat.name || wantFile,
    filePath: stat.path || candidatePath,
    projectId: workspaceProjectId || null,
  };
}

export async function deleteFileOnDisk(opts: {
  filePath: string;
  projectId?: string | null;
  relPath?: string | null;
}): Promise<{ ok: boolean; path?: string; error?: string }> {
  if (opts.projectId && opts.relPath && window.arkDesktop?.workspaceDeletePath) {
    const viaWorkspace = await window.arkDesktop.workspaceDeletePath({
      projectId: opts.projectId,
      relPath: opts.relPath,
    });
    if (viaWorkspace.ok) return viaWorkspace;
  }
  if (window.arkDesktop?.workspaceDeleteFolder) {
    return window.arkDesktop.workspaceDeleteFolder({ targetPath: opts.filePath });
  }
  return { ok: false, error: 'Delete is only available in the desktop app.' };
}

export type AddFileChatOutcome =
  | { kind: 'not-add' }
  | { kind: 'reply'; text: string }
  | { kind: 'done'; fileName: string; filePath: string };

async function resolveAddFileParentPath(opts: {
  parentHint?: string;
  workspaceDiskRoot?: string | null;
  workspaceName?: string | null;
  stickyTarget?: { path: string; name: string; kind: 'file' | 'folder' } | null;
  lastListedFolder?: LastListedFolder | null;
}): Promise<string | null> {
  const {
    parentHint,
    workspaceDiskRoot,
    workspaceName,
    stickyTarget,
    lastListedFolder,
  } = opts;

  const hint = String(parentHint || '').trim();
  if (hint === DESKTOP_PROJECTS_PARENT || /^projects?$/i.test(hint)) {
    const container = await resolveDesktopProjectsFolderOnDisk();
    if (container?.path) return container.path;
  }

  if (hint && hint !== DESKTOP_PROJECTS_PARENT) {
    const resolved = await resolveNamedFolderOnDisk(hint);
    if (resolved?.path) return resolved.path;
  }

  if (lastListedFolder?.path) {
    const stat = await pathStat(lastListedFolder.path);
    if (stat?.ok && stat.isDirectory) return lastListedFolder.path;
  }

  if (stickyTarget?.kind === 'folder') return stickyTarget.path;
  if (workspaceDiskRoot) return workspaceDiskRoot;

  if (workspaceName) {
    const resolved = await resolveNamedFolderOnDisk(workspaceName);
    if (resolved?.path) return resolved.path;
  }

  return null;
}

export async function handleAddFileChatRequest(opts: {
  fileName: string;
  parentHint?: string;
  workspaceDiskRoot?: string | null;
  workspaceProjectId?: string | null;
  workspaceName?: string | null;
  stickyTarget?: { path: string; name: string; kind: 'file' | 'folder' } | null;
  lastListedFolder?: LastListedFolder | null;
}): Promise<AddFileChatOutcome> {
  const {
    fileName,
    parentHint,
    workspaceDiskRoot,
    workspaceProjectId,
    workspaceName,
    stickyTarget,
    lastListedFolder,
  } = opts;
  const wantFile = normalizeDiskFileName(fileName);
  if (!wantFile) {
    return { kind: 'reply', text: 'What should the file be called?' };
  }

  const parentPath = await resolveAddFileParentPath({
    parentHint,
    workspaceDiskRoot,
    workspaceName,
    stickyTarget,
    lastListedFolder,
  });

  if (!parentPath) {
    return {
      kind: 'reply',
      text: 'Where should this file go?\n\nSay e.g. *add it to Desktop\\Projects* or *inside DeBloat* — or open a project folder first.',
    };
  }

  const fullPath = joinPath(parentPath, wantFile);
  const existing = await pathStat(fullPath);
  if (existing?.ok && existing.isDirectory) {
    return {
      kind: 'reply',
      text: `**${wantFile}** is already a folder at \`${fullPath}\`. Say *create a project* if you want a new app scaffold, or pick a different file name.`,
    };
  }

  if (!window.arkDesktop?.workspaceWriteFile) {
    return { kind: 'reply', text: 'File create is only available in the desktop app.' };
  }

  const written = await window.arkDesktop.workspaceWriteFile({
    targetPath: fullPath,
    content: '',
  });
  if (!written.ok) {
    return { kind: 'reply', text: written.error || `Could not create \`${wantFile}\`.` };
  }

  if (workspaceProjectId && window.arkDesktop?.projectWrite) {
    await window.arkDesktop.projectWrite({
      projectId: workspaceProjectId,
      projectName: workspaceName || undefined,
      files: { [wantFile]: '' },
    });
  }

  return { kind: 'done', fileName: wantFile, filePath: written.path || fullPath };
}
