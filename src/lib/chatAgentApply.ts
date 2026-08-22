/**
 * Apply @@@FILE edits from Chat to the sticky workspace (Step 3).
 */

import {
  applyFileEdits,
  buildFileTreeFromPaths,
  parseFileEdits,
  type ProjectFileMap,
} from '@/lib/projectCodeEdit';
import { safeProjectWrite } from '@/lib/projectWriteSafe';

export type ChatApplyResult = {
  ok: boolean;
  updated: string[];
  deleted: string[];
  files: ProjectFileMap;
  reply: string;
  error?: string;
};

export async function applyChatReplyEdits(opts: {
  reply: string;
  projectId: string;
  projectName?: string;
  files: ProjectFileMap;
}): Promise<ChatApplyResult> {
  const edits = parseFileEdits(opts.reply);
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
  const write = await safeProjectWrite({
    projectId: opts.projectId,
    projectName: opts.projectName,
    files: Object.fromEntries(changed.map((p: string) => [p, next[p]])),
  });

  if (!write.ok) {
    return {
      ok: false,
      updated: [],
      deleted: [],
      files: opts.files,
      reply: write.error || 'Write failed.',
      error: write.error,
    };
  }

  const lines = changed.slice(0, 8).map((p: string) => `- \`${p}\``);
  const more = changed.length > 8 ? `\n- …and ${changed.length - 8} more` : '';
  return {
    ok: true,
    updated: changed,
    deleted: [],
    files: next,
    reply: `Updated **${changed.length}** file${changed.length === 1 ? '' : 's'} on disk:\n${lines.join('\n')}${more}`,
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
  const quoted = t.match(/(?:delete|remove|trash)\s+(?:file|folder)?\s*["“']([^"”']+)["”']/i);
  if (quoted?.[1]) return quoted[1].trim();
  const bare = t.match(/(?:delete|remove)\s+(?:the\s+)?(?:file\s+)?([A-Za-z0-9_./\\-]+\.[A-Za-z0-9]+)/i);
  return bare?.[1]?.trim() || null;
}
