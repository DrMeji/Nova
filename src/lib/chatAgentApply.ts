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
  const cleanRel = rel.replace(/^[/\\]+/, '').replace(/\//g, sep);
  return `${cleanRoot}${sep}${cleanRel}`;
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

export async function applyChatReplyEdits(opts: {
  reply: string;
  projectId: string | null;
  projectName?: string;
  files: ProjectFileMap;
  userMessage?: string;
  diskRoot?: string | null;
}): Promise<ChatApplyResult> {
  const userMessage = opts.userMessage || '';
  let edits = parseFileEdits(opts.reply);
  if (!edits.length) {
    edits = extractChatStyleFileEdits(opts.reply, userMessage, opts.files);
  }

  // Prefer deterministic React/web patches for common UI asks — models often describe without writing.
  const finalized = finalizeWebEdits(opts.files, userMessage, edits, { projectName: opts.projectName });
  if (finalized.length) {
    edits = finalized;
  } else if (!edits.length) {
    const react = reactUiMicroAskEdits(opts.files, userMessage, { projectName: opts.projectName });
    if (react.length) edits = react;
    else edits = scaffoldFallbackEdits(userMessage, opts.files, { projectName: opts.projectName });
  }

  if (!edits.length) {
    return {
      ok: false,
      updated: [],
      deleted: [],
      files: opts.files,
      reply: '',
      error: 'no_edits',
    };
  }

  const tree = buildFileTreeFromPaths(opts.files);
  const applied = applyFileEdits(opts.files, tree, edits);
  const changed = applied.changedPaths;
  if (!changed.length) {
    return {
      ok: false,
      updated: [],
      deleted: [],
      files: opts.files,
      reply: 'No file changes could be applied from that reply.',
      error: 'no_changes',
    };
  }

  const next = applied.files;
  const payloadFiles = Object.fromEntries(changed.map((p: string) => [p, next[p]]));

  let wroteOk = false;
  let writeError: string | undefined;

  if (opts.projectId) {
    const write = await safeProjectWrite({
      projectId: opts.projectId,
      projectName: opts.projectName,
      files: payloadFiles,
    });
    wroteOk = write.ok;
    writeError = write.error;
  }

  if (!wroteOk && opts.diskRoot) {
    const disk = await writeViaDiskRoot(opts.diskRoot, payloadFiles);
    wroteOk = disk.ok;
    writeError = disk.error;
  }

  if (!wroteOk) {
    return {
      ok: false,
      updated: [],
      deleted: [],
      files: opts.files,
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
