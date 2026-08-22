/**
 * Disk intent classifier — create project vs add file vs delete file vs delete folder.
 * Depends only on projectNames (zero-dep leaf).
 */

import {
  cleanDiskTargetName,
  extractNamedDiskTarget,
  isBlockedDiskTargetName,
  normalizeDiskFileName,
} from './projectNames';

export type ProjectKind = 'static-web' | 'vite-react' | 'python' | 'node-cli' | 'unknown';

export type DiskIntent =
  | { type: 'create_project'; name: string; kind: ProjectKind }
  | { type: 'add_file'; name: string; parentHint?: string }
  | { type: 'delete_project'; name: string | null }
  | { type: 'delete_file'; name: string | null; parentHint?: string }
  | { type: 'catalog_or_explore' }
  | { type: 'none' };

const DELETE_RE = /\b(delete|remove|trash|wipe|get rid of)\b/i;
const FILE_RE = /\b(files?)\b/i;
const PROJECT_FOLDER_RE = /\b(projects?|workspaces?|repos?|repositories|folders?|directories)\b/i;

function detectProjectKind(text: string): ProjectKind {
  const t = String(text || '').toLowerCase();
  if (/\b(python|flask|fastapi|pip|\.py)\b/.test(t)) return 'python';
  if (/\b(html|landing\s+page|static\s+site)\b/.test(t)) return 'static-web';
  if (/\b(node\s+cli|cli\s+tool)\b/.test(t)) return 'node-cli';
  if (/\b(react|vite|web\s+app|website|site)\b/.test(t)) return 'vite-react';
  return 'vite-react';
}

function looksLikeAddFileAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!/\b(add|create|make|write|put)\b/i.test(t)) return false;
  return /\bfiles?\b/i.test(t);
}

function looksLikeCreateProjectAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (looksLikeAddFileAsk(t)) return false;
  const isCreate = /\b(?:create|scaffold|build\s+me|make\s+(?:a\s+)?new|start\s+(?:a\s+)?new|spin\s+up)\b/i.test(t);
  const hasNoun = /\b(?:web\s+)?(?:app|application|project|website|site|webapp)\b/i.test(t);
  return isCreate && hasNoun;
}

function looksLikeDeleteFileAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!DELETE_RE.test(t)) return false;
  if (!FILE_RE.test(t)) return false;
  if (/\bdelete\s+(?:the\s+)?(?:project|workspace|folder|directory)\b/i.test(t) && !FILE_RE.test(t)) {
    return false;
  }
  return true;
}

function looksLikeDeleteProjectAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!DELETE_RE.test(t)) return false;
  if (looksLikeDeleteFileAsk(t)) return false;
  return (
    /\b(projects?|workspaces?|repos?|repositories)\b/i.test(t)
    || (/\b(folders?|directories)\b/i.test(t) && /\b(named|called|project)\b/i.test(t))
    || /\bdelete\s+(?:the\s+)?(?:project|workspace|folder|directory)\b/i.test(t)
  );
}

function looksLikeDeleteFollowUp(text: string): boolean {
  const t = String(text || '').trim();
  if (!DELETE_RE.test(t)) return false;
  if (looksLikeDeleteProjectAsk(t) || looksLikeDeleteFileAsk(t)) return false;
  return (
    /\b(it|this|that)\b/i.test(t)
    || /^(yes\s+)?delete\b/i.test(t)
    || /\bgo ahead and delete\b/i.test(t)
    || /\bjust\s+delete\b/i.test(t)
  );
}

function extractFileName(text: string): string | null {
  const t = String(text || '').trim();
  const patterns = [
    /\bcall\s+it\s+([A-Za-z][A-Za-z0-9 _.-]{1,48})/i,
    /\bfile\s+(?:called|named)\s+["“']([^"”']+)["”']/i,
    /\bfile\s+(?:called|named)\s+([A-Za-z0-9 _.-]{1,64})/i,
    /\bdelete\s+(?:the\s+)?file\s+["“']([^"”']+)["”']/i,
    /\bdelete\s+(?:the\s+)?(?:file\s+)?([A-Za-z0-9_./\\-]+\.[A-Za-z0-9]{1,12})\b/i,
    /\b(?:add|create)\s+(?:a\s+)?file\s+(?:called|named)\s+["“']?([A-Za-z0-9 _.-]{1,64})["”']?/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const raw = m[1].trim();
      if (isBlockedDiskTargetName(raw)) continue;
      return normalizeDiskFileName(raw);
    }
  }
  const named = extractNamedDiskTarget(t);
  if (named && /\.[A-Za-z0-9]{1,12}$/.test(named)) return named;
  return null;
}

function extractParentHint(text: string): string | undefined {
  const t = String(text || '').trim();
  const patterns = [
    /\bproject\s+folder\s+(?:called|named)\s+([A-Za-z][A-Za-z0-9 _-]{1,48})/i,
    /\b(?:in|inside|within|to)\s+(?:the\s+)?(?:project\s+)?(?:folder\s+)?(?:called|named)\s+([A-Za-z][A-Za-z0-9 _-]{1,48})/i,
    /\b(?:project|folder)\s+(?:called|named)\s+([A-Za-z][A-Za-z0-9 _-]{1,48})/i,
    /\bin\s+([A-Za-z][A-Za-z0-9 _-]{1,48})\s*$/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const cleaned = cleanDiskTargetName(m[1]);
      if (cleaned) return cleaned;
    }
  }
  return undefined;
}

/** Desktop\\Projects container — not a subfolder named Projects inside another project. */
export const DESKTOP_PROJECTS_PARENT = '__desktop_projects__';

export function extractAddFileParentHint(text: string): string | undefined {
  const t = String(text || '').trim();
  if (!t) return undefined;

  const namedSub = extractParentHint(t);
  if (namedSub) return namedSub;

  if (
    /\b(?:desktop\s+)?projects?\s+folder\b/i.test(t)
    || /\bproject\s+folder\b/i.test(t)
    || /\b(?:add|put|place|save)\s+it\s+(?:to|in|inside)\s+(?:the\s+)?(?:desktop\s+)?projects?\b/i.test(t)
    || /\binside\s+(?:of\s+)?(?:the\s+)?project\s+folder\b/i.test(t)
    || /^\s*(?:the\s+)?projects?\s+folder\s*$/i.test(t)
    || (/\b(?:on|in)\s+(?:my\s+)?desktop\b/i.test(t) && /\bprojects?\b/i.test(t))
  ) {
    return DESKTOP_PROJECTS_PARENT;
  }

  return undefined;
}

export function looksLikeAddFileDestinationClarify(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (looksLikeAddFileAsk(t)) return true;
  if (/\b(?:add|put|place|save)\s+it\s+(?:to|in|inside)\b/i.test(t)) return true;
  if (/^\s*(?:the\s+)?projects?\s+folder\s*$/i.test(t)) return true;
  if (extractAddFileParentHint(t)) return true;
  if (/\bproject\s+folder\b/i.test(t) && !/\b(?:what|list|show|tell|which|delete|remove)\b/i.test(t)) {
    return true;
  }
  return false;
}

function looksLikeAddFileLocationFollowUp(text: string): boolean {
  const t = String(text || '').trim();
  if (looksLikeAddFileAsk(t)) return false;
  return looksLikeAddFileDestinationClarify(t);
}

function fileNameFromAddFileThread(userMessages: string[]): string | null {
  for (let i = userMessages.length - 1; i >= 0; i--) {
    const line = String(userMessages[i] || '').trim();
    if (!/\b(?:add|create|make|write|put)\b/i.test(line) || !/\bfiles?\b/i.test(line)) continue;
    const file = extractFileName(line);
    if (file) return file;
    const named = extractNamedDiskTarget(line);
    if (named && !isBlockedDiskTargetName(named)) return normalizeDiskFileName(named);
  }
  return nameFromThread(userMessages, true);
}

function extractProjectName(text: string): string | null {
  const named = extractNamedDiskTarget(text);
  if (named) return named;
  const t = String(text || '').trim();
  const m = t.match(/\bdelete\s+(?:the\s+)?([A-Za-z][A-Za-z0-9 _-]{2,48})\s+project\b/i);
  if (m?.[1]) return cleanDiskTargetName(m[1]);
  return null;
}

function nameFromThread(userMessages: string[], preferFile: boolean): string | null {
  for (let i = userMessages.length - 1; i >= 0; i--) {
    const line = String(userMessages[i] || '').trim();
    const named = extractNamedDiskTarget(line);
    if (named) return named;
    if (preferFile) {
      const file = extractFileName(line);
      if (file) return file;
    } else {
      const project = extractProjectName(line);
      if (project) return project;
    }
  }
  return null;
}

export function classifyDiskIntent(
  message: string,
  opts?: { recentUserMessages?: string[] },
): DiskIntent {
  const t = String(message || '').trim();
  const recent = opts?.recentUserMessages || [];

  if (looksLikeDeleteFileAsk(t)) {
    const name = extractFileName(t) || (looksLikeDeleteFollowUp(t) ? nameFromThread(recent, true) : null);
    return {
      type: 'delete_file',
      name: name || (looksLikeDeleteFollowUp(t) ? null : extractNamedDiskTarget(t)),
      parentHint: extractParentHint(t),
    };
  }

  if (looksLikeDeleteProjectAsk(t) || looksLikeDeleteFollowUp(t)) {
    if (looksLikeDeleteFollowUp(t) && !looksLikeDeleteProjectAsk(t)) {
      const fromMsg = extractNamedDiskTarget(t) || extractProjectName(t);
      const fromThread = nameFromThread(recent, false);
      return { type: 'delete_project', name: fromMsg || fromThread };
    }
    const name = extractProjectName(t) || extractNamedDiskTarget(t);
    if (looksLikeDeleteFollowUp(t) && !name) {
      return { type: 'delete_project', name: nameFromThread(recent, false) };
    }
    return { type: 'delete_project', name: name || null };
  }

  if (looksLikeAddFileLocationFollowUp(t)) {
    const allLines = [...recent, t];
    const fileName = fileNameFromAddFileThread(allLines);
    if (fileName) {
      return {
        type: 'add_file',
        name: fileName,
        parentHint: extractAddFileParentHint(t) || extractParentHint(t),
      };
    }
  }

  if (looksLikeAddFileAsk(t)) {
    const name = extractFileName(t) || extractNamedDiskTarget(t);
    if (!name) return { type: 'none' };
    return {
      type: 'add_file',
      name: normalizeDiskFileName(name),
      parentHint: extractAddFileParentHint(t) || extractParentHint(t),
    };
  }

  if (looksLikeCreateProjectAsk(t)) {
    const name = extractNamedDiskTarget(t);
    if (!name) return { type: 'none' };
    return { type: 'create_project', name, kind: detectProjectKind(t) };
  }

  if (
    /\b(?:what'?s|what is|list|show|tell me)\b/i.test(t)
    && PROJECT_FOLDER_RE.test(t)
    && !looksLikeAddFileAsk(t)
  ) {
    return { type: 'catalog_or_explore' };
  }

  return { type: 'none' };
}

export function looksLikeCatalogOrExploreOnly(message: string): boolean {
  return classifyDiskIntent(message).type === 'catalog_or_explore';
}
