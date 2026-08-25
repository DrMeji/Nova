/**
 * Disk intent classifier. create project vs add file vs delete file vs delete folder.
 * Depends only on projectNames (zero-dep leaf).
 */

import {
  cleanDiskTargetName,
  extractNamedDiskTarget,
  isBlockedDiskTargetName,
  normalizeDiskFileName,
} from './projectNames';
import {
  DESKTOP_PROJECTS_PARENT,
  extractDiskParentHintFromText,
} from './diskPathResolve';
import { isProjectCreateBrief } from './chatCreateBrief';

export { DESKTOP_PROJECTS_PARENT } from './diskPathResolve';

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
  if (isProjectCreateBrief(t)) return false;
  if (/\b(?:real|full|actual|component)\s+files\b/i.test(t)) return false;
  if (/\bwith\s+real\s+files\b/i.test(t)) return false;
  if (/\bedit files\b/i.test(t) && !/\b(?:add|create|make|write|put)\s+(?:a\s+|the\s+|new\s+)?files?\b/i.test(t)) {
    return false;
  }
  if (/\b(?:add|create|make|write|put)\b[\s\S]{0,48}\b(?:a\s+|the\s+|new\s+)?file\b/i.test(t)) return true;
  if (/\bput\s+the\s+file\b/i.test(t)) return true;
  // "create notes.md" / "write a readme" / "make a markdown file"
  if (/\b(?:add|create|make|write|put|save)\b[\s\S]{0,64}\b(?:readme|markdown|\.md\b)/i.test(t)) return true;
  if (
    /\b(?:add|create|make|write|put|save)\b[\s\S]{0,40}\b[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,12}\b/i.test(t)
    && !/\b(?:app|website|site|project|folder)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

function defaultNameFromAddAsk(text: string): string | null {
  const t = String(text || '').trim();
  if (/\breadme\b/i.test(t)) return 'README.md';
  if (/\bmarkdown\b|\.md\b/i.test(t)) return 'notes.md';
  return null;
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
    || /\b(that|this)\s+(?:file|folder)\b/i.test(t)
    || /^(yes\s+)?delete\b/i.test(t)
    || /\bgo ahead and delete\b/i.test(t)
    || /\bjust\s+delete\b/i.test(t)
    || /\bi\s+want\s+you\s+to\s+(?:go\s+ahead\s+and\s+)?delete\b/i.test(t)
  );
}

/** "delete Starbucks in pictures". no "file" word required. */
function extractDeleteNamedTarget(text: string): string | null {
  const t = String(text || '').trim();
  const patterns = [
    /\bdelete\s+(?:the\s+)?([A-Za-z][A-Za-z0-9 _.-]{1,48})\s+(?:inside|in|from|within)\s+(?:the\s+)?(?:a\s+)?/i,
    /\b(?:go\s+ahead\s+and\s+)?delete\s+(?:the\s+)?([A-Za-z][A-Za-z0-9 _.-]{1,48})\s+(?:inside|in|from|within)\b/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const raw = cleanDiskTargetName(m[1]);
      if (!raw || isBlockedDiskTargetName(raw)) continue;
      if (/^(picture|pictures|photo|photos|folder|file|project)$/i.test(raw)) continue;
      return normalizeDiskFileName(raw);
    }
  }
  return null;
}

function looksLikeDeleteNamedItemAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!DELETE_RE.test(t)) return false;
  if (looksLikeDeleteFileAsk(t) || looksLikeDeleteProjectAsk(t)) return false;
  return Boolean(extractDeleteNamedTarget(t));
}

function extractFileName(text: string): string | null {
  const t = String(text || '').trim();
  const patterns = [
    /\bcall\s+it\s+([A-Za-z][A-Za-z0-9 _.-]{1,48})/i,
    /\bfile\s+(?:called|named)\s+["\u201c']([^"\u201d']+)["\u201d']/i,
    /\bfile\s+(?:called|named)\s+([A-Za-z0-9 _.-]{1,64})/i,
    /\bdelete\s+(?:the\s+)?file\s+["\u201c']([^"\u201d']+)["\u201d']/i,
    /\bdelete\s+(?:the\s+)?(?:file\s+)?([A-Za-z0-9_./\\-]+\.[A-Za-z0-9]{1,12})\b/i,
    /\b(?:add|create)\s+(?:a\s+)?file\s+(?:called|named)\s+["\u201c']?([A-Za-z0-9 _.-]{1,64})["\u201d']?/i,
    // "create notes.md" / "write todo.md"
    /\b(?:add|create|make|write|put|save)\b[\s\S]{0,40}\b([A-Za-z0-9_-]+\.[A-Za-z0-9]{1,12})\b/i,
    /\b([A-Za-z0-9_-]+\.(?:md|txt|json|csv|html|css|js|ts|py))\b/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const raw = m[1].trim();
      if (isBlockedDiskTargetName(raw)) continue;
      if (/^(file|files|folder|project|app|website)$/i.test(raw)) continue;
      return normalizeDiskFileName(raw);
    }
  }
  const named = extractNamedDiskTarget(t);
  if (named && /\.[A-Za-z0-9]{1,12}$/.test(named)) return named;
  return null;
}

/** Parse delete-file asks. disambiguate file name vs project folder name. */
export function parseDeleteFileTarget(text: string): {
  fileName: string | null;
  parentHint?: string;
} {
  const t = String(text || '').trim();
  if (!t) return { fileName: null };

  // "delete the file … in (the) project folder called Starbucks" → file Starbucks, parent Desktop\\Projects
  const fileInProjectsContainer = t.match(
    /\bfiles?\b[\s\S]*?\b(?:desktop\s+)?project\s+folder\b[\s\S]*?\b(?:called|named)\s+["\u201c']?([A-Za-z][A-Za-z0-9 _.-]{1,48})["\u201d']?/i,
  );
  if (fileInProjectsContainer?.[1]) {
    const name = cleanDiskTargetName(fileInProjectsContainer[1]);
    if (name) {
      return { fileName: normalizeDiskFileName(name), parentHint: DESKTOP_PROJECTS_PARENT };
    }
  }

  // "file called X … project folder" (no subfolder name after called)
  const namedFileInProjects = t.match(
    /\bfiles?\s+(?:called|named)\s+["\u201c']?([A-Za-z][A-Za-z0-9 _.-]{1,48})["\u201d']?[\s\S]*?\bproject\s+folder\b/i,
  );
  if (namedFileInProjects?.[1]) {
    const name = cleanDiskTargetName(namedFileInProjects[1]);
    if (name) {
      return { fileName: normalizeDiskFileName(name), parentHint: DESKTOP_PROJECTS_PARENT };
    }
  }

  const fileName = extractFileName(t) || (() => {
    const named = extractNamedDiskTarget(t);
    if (named && !isBlockedDiskTargetName(named)) return normalizeDiskFileName(named);
    return null;
  })();

  let parentHint = extractDeleteFileParentHint(t);

  // "project folder called X" with a file ask. X is the file, not a subfolder
  if (
    fileName
    && parentHint
    && parentHint !== DESKTOP_PROJECTS_PARENT
    && fileName.replace(/\.[A-Za-z0-9]{1,12}$/, '').toLowerCase() === parentHint.toLowerCase()
  ) {
    parentHint = DESKTOP_PROJECTS_PARENT;
  }

  if (!parentHint) {
    const legacy = extractParentHint(t);
    if (legacy && fileName && legacy.toLowerCase() === fileName.replace(/\.[A-Za-z0-9]{1,12}$/, '').toLowerCase()) {
      parentHint = DESKTOP_PROJECTS_PARENT;
    } else if (legacy && !fileName) {
      parentHint = legacy;
    } else if (legacy && fileName) {
      parentHint = legacy;
    }
  }

  return { fileName, parentHint };
}

export function extractDeleteFileParentHint(text: string): string | undefined {
  return extractDiskParentHintFromText(text);
}

function extractParentHint(text: string): string | undefined {
  return extractDiskParentHintFromText(text);
}

export function extractAddFileParentHint(text: string): string | undefined {
  return extractDiskParentHintFromText(text);
}

export function looksLikeAddFileDestinationClarify(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  // UI / layout asks that mention "desktop" are not file destinations.
  if (/\b(?:into|to)\s+(?:a\s+|the\s+)?desktop\s+(?:app|application|layout|window|ui)\b/i.test(t)) {
    return false;
  }
  if (/\b(title\s*bar|sidebar|note\s*list|main\s+editor|localStorage|dark\s+theme)\b/i.test(t)) {
    return false;
  }
  if (looksLikeAddFileAsk(t)) return true;
  if (/\b(?:go\s+ahead\s+and\s+)?(?:put|place|save|add)\s+(?:it|the\s+file)\s+(?:to|in|into|inside)\b/i.test(t)) return true;
  if (/\b(?:should|needs to|needs)\s+go\s+(?:in|into|inside)\b/i.test(t)) return true;
  if (/\bit\s+should\s+go\s+(?:in|into|inside)?\b/i.test(t)) return true;
  if (/^\s*(?:the\s+)?projects?\s+folder\s*$/i.test(t)) return true;
  if (extractDiskParentHintFromText(t)) return true;
  if (/\b(?:in|into|inside|to)\s+(?:the\s+)?(?:my\s+)?(pictures?|photos?|desktop|documents?|downloads?)\b/i.test(t)) {
    return true;
  }
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
    const hasFileNoun = /\bfiles?\b/i.test(line);
    const hasFileVerb = /\b(?:add|create|make|write|put)\b/i.test(line);
    if (!hasFileNoun && !/\bput\s+the\s+file\b/i.test(line)) continue;
    if (!hasFileVerb && !hasFileNoun) continue;
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

export function shouldRouteDeleteToStickyFile(
  message: string,
  sticky?: { kind: 'file' | 'folder' } | null,
): boolean {
  if (sticky?.kind !== 'file') return false;
  const t = String(message || '').trim();
  if (!DELETE_RE.test(t)) return false;
  if (
    /\bdelete\s+(?:the\s+)?(?:project|workspace)\s+(?:named|called)\s+/i.test(t)
    || /\bdelete\s+(?:the\s+)?[A-Za-z][\w-]+\s+project\b/i.test(t)
  ) {
    return false;
  }
  return looksLikeDeleteFollowUp(t) || looksLikeDeleteNamedItemAsk(t);
}

export function classifyDiskIntent(
  message: string,
  opts?: {
    recentUserMessages?: string[];
    pendingAddFile?: string | null;
    stickyDiskTarget?: { path: string; name: string; kind: 'file' | 'folder' } | null;
  },
): DiskIntent {
  const t = String(message || '').trim();
  if (isProjectCreateBrief(t)) return { type: 'none' };
  const recent = opts?.recentUserMessages || [];
  const pendingAddFile = opts?.pendingAddFile || null;
  const stickyDiskTarget = opts?.stickyDiskTarget || null;

  if (looksLikeDeleteFileAsk(t)) {
    const parsed = parseDeleteFileTarget(t);
    const name = parsed.fileName
      || (looksLikeDeleteFollowUp(t) ? nameFromThread(recent, true) : null);
    return {
      type: 'delete_file',
      name,
      parentHint: parsed.parentHint || extractDeleteFileParentHint(t),
    };
  }

  // "delete Starbucks in picture folder". location + name, no "file" word
  if (looksLikeDeleteNamedItemAsk(t)) {
    const parsed = parseDeleteFileTarget(t);
    const name = parsed.fileName || extractDeleteNamedTarget(t);
    return {
      type: 'delete_file',
      name,
      parentHint: parsed.parentHint || extractDeleteFileParentHint(t),
    };
  }

  // After creating/touching a file: "delete it", "delete that folder" → delete the file
  if (
    DELETE_RE.test(t)
    && stickyDiskTarget?.kind === 'file'
    && looksLikeDeleteFollowUp(t)
  ) {
    const parsed = parseDeleteFileTarget(t);
    return {
      type: 'delete_file',
      name: parsed.fileName || stickyDiskTarget.name || nameFromThread(recent, true),
      parentHint: parsed.parentHint || extractDeleteFileParentHint(t),
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
    // Only continue an add-file flow when we already asked where to put a file.
    const allLines = [...recent, t];
    const fileName = pendingAddFile || fileNameFromAddFileThread(allLines);
    if (fileName && pendingAddFile) {
      return {
        type: 'add_file',
        name: fileName,
        parentHint: extractAddFileParentHint(t) || extractDiskParentHintFromText(t),
      };
    }
  }

  if (looksLikeAddFileAsk(t)) {
    const name = extractFileName(t)
      || extractNamedDiskTarget(t)
      || fileNameFromAddFileThread([...recent, t])
      || pendingAddFile
      || defaultNameFromAddAsk(t);
    if (!name) {
      // Clear create-file intent — ask for a name instead of letting the LLM fake a write.
      return { type: 'add_file', name: '', parentHint: extractAddFileParentHint(t) || extractDiskParentHintFromText(t) };
    }
    return {
      type: 'add_file',
      name: normalizeDiskFileName(name),
      parentHint: extractAddFileParentHint(t) || extractDiskParentHintFromText(t),
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
