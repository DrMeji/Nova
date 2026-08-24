/**
 * Apply @@@FILE edits from Chat to the sticky workspace (Step 3).
 * Falls back to deterministic React/web micro-patches when the model only describes changes.
 * Also falls back to absolute disk writes when projectId write fails but diskRoot is known.
 */

import {
  applyFileEdits,
  buildFileTreeFromPaths,
  extractChatStyleFileEdits,
  formatCodeChatReply,
  parseFileEdits,
  scaffoldFallbackEdits,
  stripFileBlocks,
  type ProjectFileMap,
} from '@/lib/projectCodeEdit';
import { finalizeWebEdits, reactUiMicroAskEdits } from '@/lib/webProjectCanon';
import { safeProjectWrite } from '@/lib/projectWriteSafe';
import { skillPromptAppendix } from '@/lib/arkSkills';
import { detectProjectKind } from '@/lib/projectKind';

export type ChatApplyResult = {
  ok: boolean;
  updated: string[];
  deleted: string[];
  files: ProjectFileMap;
  reply: string;
  error?: string;
};

function joinDisk(root: string, rel: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  const cleanRoot = root.replace(/[/\\]+$/, '');
  let cleanRel = rel.replace(/^[/\\]+/, '').replace(/\//g, sep);
  // Guard against Folder\\Folder nesting when studio keys were prefixed with the folder name.
  const base = cleanRoot.split(/[/\\]/).filter(Boolean).pop() || '';
  if (base) {
    const prefix = `${base}${sep}`;
    const prefixAlt = `${base}/`;
    if (cleanRel === base || cleanRel.startsWith(prefix) || cleanRel.startsWith(prefixAlt)) {
      cleanRel = cleanRel.slice(base.length).replace(/^[/\\]+/, '');
    }
  }
  return cleanRel ? `${cleanRoot}${sep}${cleanRel}` : cleanRoot;
}

async function writeViaDiskRoot(
  diskRoot: string,
  files: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  if (!window.arkDesktop?.workspaceWriteFile) {
    return { ok: false, error: 'Project write unavailable' };
  }
  for (const [rel, content] of Object.entries(files)) {
    const targetPath = joinDisk(diskRoot, rel);
    const written = await window.arkDesktop.workspaceWriteFile({
      targetPath,
      content,
    });
    if (!written.ok) {
      return { ok: false, error: written.error || `Could not write ${rel}` };
    }
  }
  return { ok: true };
}

async function hydrateFilesFromDiskRoot(diskRoot: string): Promise<ProjectFileMap> {
  if (!window.arkDesktop?.readTextFile) return {};
  const rels = [
    'src/App.jsx', 'src/App.tsx', 'src/App.css', 'src/index.css',
    'index.html', 'css/styles.css', 'js/app.js', 'package.json',
  ];
  const out: ProjectFileMap = {};
  for (const rel of rels) {
    try {
      const read = await window.arkDesktop.readTextFile({ path: joinDisk(diskRoot, rel) });
      if (read?.ok && typeof read.text === 'string') out[rel] = read.text;
    } catch {
      /* missing */
    }
  }
  return out;
}

/** Strip accidental Folder/Folder prefixes from in-memory studio keys. */
function normalizeStudioFileKeys(files: ProjectFileMap, diskRoot?: string | null): ProjectFileMap {
  if (!diskRoot || !Object.keys(files).length) return files;
  const base = diskRoot.split(/[/\\]/).filter(Boolean).pop() || '';
  if (!base) return files;
  const out: ProjectFileMap = {};
  for (const [rel, content] of Object.entries(files)) {
    let key = String(rel).replace(/\\/g, '/').replace(/^\/+/, '');
    if (key.startsWith(`${base}/`)) key = key.slice(base.length + 1);
    // Collapse TaskRail/TaskRail/src → src when bound to outer root.
    while (key.startsWith(`${base}/`)) key = key.slice(base.length + 1);
    if (!out[key]) out[key] = content;
  }
  return out;
}

export async function applyChatReplyEdits(opts: {
  reply: string;
  projectId: string | null;
  projectName?: string;
  files: ProjectFileMap;
  userMessage?: string;
  diskRoot?: string | null;
}): Promise<ChatApplyResult> {
  const rawUser = opts.userMessage || '';
  const kind = detectProjectKind(rawUser);
  const appendix = skillPromptAppendix(rawUser, kind, {
    isEdit: Object.keys(opts.files || {}).length > 0,
    hasReferenceImage: /unsplash|https?:\/\/\S+\.(?:png|jpe?g|webp)|ark-media:/i.test(rawUser),
  });
  const userMessage = appendix && !rawUser.includes('ARK design skills')
    ? `${rawUser}\n\n${appendix}`
    : rawUser;
  let baseFiles = normalizeStudioFileKeys(opts.files, opts.diskRoot);
  if (Object.keys(baseFiles).length === 0 && opts.diskRoot) {
    baseFiles = await hydrateFilesFromDiskRoot(opts.diskRoot);
  }
  let edits = parseFileEdits(opts.reply);
  if (!edits.length) {
    edits = extractChatStyleFileEdits(opts.reply, userMessage, baseFiles);
  }

  // Prefer deterministic React/web patches for common UI asks. models often describe without writing.
  const finalized = finalizeWebEdits(baseFiles, userMessage, edits, { projectName: opts.projectName });
  if (finalized.length) {
    edits = finalized;
  } else if (!edits.length) {
    const react = reactUiMicroAskEdits(baseFiles, userMessage, { projectName: opts.projectName });
    if (react.length) edits = react;
    else edits = scaffoldFallbackEdits(userMessage, baseFiles, { projectName: opts.projectName });
  }

  if (!edits.length) {
    return {
      ok: false,
      updated: [],
      deleted: [],
      files: baseFiles,
      reply: '',
      error: 'no_edits',
    };
  }

  const tree = buildFileTreeFromPaths(baseFiles);
  const applied = applyFileEdits(baseFiles, tree, edits);
  const changed = applied.changedPaths;
  if (!changed.length) {
    return {
      ok: false,
      updated: [],
      deleted: [],
      files: baseFiles,
      reply: 'No file changes could be applied from that reply.',
      error: 'no_changes',
    };
  }

  const next = applied.files;
  const payloadFiles = Object.fromEntries(changed.map((p: string) => [p, next[p]]));

  let wroteOk = false;
  let writeError: string | undefined;

  // Prefer the live disk folder when bound. projectId sandbox alone can "succeed"
  // while Desktop\Projects\… never changes (Localhost then looks unchanged).
  if (opts.diskRoot) {
    const disk = await writeViaDiskRoot(opts.diskRoot, payloadFiles);
    if (!disk.ok) {
      return {
        ok: false,
        updated: [],
        deleted: [],
        files: baseFiles,
        reply: disk.error || `Could not write into ${opts.diskRoot}`,
        error: disk.error || 'disk_write_failed',
      };
    }
    wroteOk = true;
    if (opts.projectId) {
      void safeProjectWrite({
        projectId: opts.projectId,
        projectName: opts.projectName,
        files: payloadFiles,
      });
    }
  } else if (opts.projectId) {
    const write = await safeProjectWrite({
      projectId: opts.projectId,
      projectName: opts.projectName,
      files: payloadFiles,
    });
    wroteOk = write.ok;
    writeError = write.error;
  }

  if (!wroteOk) {
    return {
      ok: false,
      updated: [],
      deleted: [],
      files: baseFiles,
      reply: writeError || (!opts.projectId && !opts.diskRoot ? 'No project bound' : 'Write failed.'),
      error: writeError || (!opts.projectId ? 'no_project' : 'write_failed'),
    };
  }

  const spoken = formatCodeChatReply(
    userMessage,
    changed,
    stripFileBlocks(opts.reply),
    { surface: 'chat' },
  );
  return {
    ok: true,
    updated: changed,
    deleted: [],
    files: next,
    reply: spoken,
  };
}

export async function deleteChatWorkspacePath(opts: {
  projectId: string;
  relPath: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!window.arkDesktop?.workspaceDeletePath) {
    return { ok: false, error: 'Delete is only available in the desktop app.' };
  }
  return window.arkDesktop.workspaceDeletePath({
    projectId: opts.projectId,
    relPath: opts.relPath,
  });
}

export function parseDeleteTargetFromMessage(message: string): string | null {
  const t = String(message || '').trim();
  const quoted = t.match(/(?:delete|remove|trash)\s+(?:file|folder)?\s*["\u201c']([^"\u201d']+)["\u201d']/i);
  if (quoted?.[1]) return quoted[1].trim();
  const bare = t.match(/(?:delete|remove)\s+(?:the\s+)?(?:file\s+)?([A-Za-z0-9_./\\-]+\.[A-Za-z0-9]+)/i);
  return bare?.[1]?.trim() || null;
}
