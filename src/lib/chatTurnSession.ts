/**
 * Per-turn studio binding — hydrate disk/files before edit/chat handlers.
 */

import {
  loadChatStudio,
  resolveChatProjectRoot,
  getBoundStudio,
  type BoundStudio,
} from '@/lib/chatStudioStore';

export type { BoundStudio };

export type TurnCtx = {
  content: string;
  chatId: string;
  mode: string;
  diskRoot: string | null;
  files: Record<string, string>;
  projectId: string | null;
  name?: string;
};

export { getBoundStudio };

const KEY_FILES = [
  'src/App.jsx',
  'src/App.tsx',
  'App.tsx',
  'App.jsx',
  'App.css',
  'src/App.css',
  'index.html',
  'package.json',
] as const;

function joinRoot(root: string, rel: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[/\\]+$/, '')}${sep}${rel.replace(/^[/\\]+/, '').replace(/\//g, sep)}`;
}

async function loadKeyFilesFromDisk(
  diskRoot: string,
  existing: Record<string, string>,
): Promise<Record<string, string>> {
  if (Object.keys(existing).length > 0) return existing;
  const read = window.novaDesktop?.readTextFile;
  if (!read) return existing;
  const files: Record<string, string> = { ...existing };
  for (const rel of KEY_FILES) {
    if (files[rel]) continue;
    try {
      const full = joinRoot(diskRoot, rel);
      const res = await read(full);
      if (res?.ok && typeof res.text === 'string' && res.text.length) {
        files[rel] = res.text;
      }
    } catch {
      /* ignore missing */
    }
  }
  return files;
}

export async function hydrateStudio(opts: {
  chatId: string;
  chatTitle?: string | null;
  content?: string;
  mode?: string;
  fallbackFiles?: Record<string, string>;
  fallbackProjectId?: string | null;
  fallbackDiskRoot?: string | null;
  fallbackName?: string;
}): Promise<TurnCtx> {
  const chatId = String(opts.chatId || '').trim();
  const content = String(opts.content || '');
  const mode = String(opts.mode || 'general');

  let bound = chatId ? getBoundStudio(chatId) : null;
  let diskRoot = bound?.diskRoot || opts.fallbackDiskRoot || null;
  let files = { ...(bound?.files || opts.fallbackFiles || {}) };
  let projectId = bound?.projectId ?? opts.fallbackProjectId ?? null;
  let name = bound?.name || opts.fallbackName;

  if (chatId && !diskRoot) {
    try {
      const resolved = await resolveChatProjectRoot({
        chatId,
        chatTitle: opts.chatTitle,
      });
      if (resolved.diskRoot) diskRoot = resolved.diskRoot;
      if (!Object.keys(files).length && resolved.files) files = { ...resolved.files };
      if (projectId == null && resolved.projectId) projectId = resolved.projectId;
      if (!name && resolved.name) name = resolved.name;
    } catch {
      /* keep fallbacks */
    }
  }

  if (diskRoot && Object.keys(files).length === 0) {
    files = await loadKeyFilesFromDisk(diskRoot, files);
  }

  return {
    content,
    chatId,
    mode,
    diskRoot,
    files,
    projectId,
    name,
  };
}
