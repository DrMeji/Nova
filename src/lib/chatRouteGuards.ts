/**
 * Mutually-exclusive chat route guards. single source of truth.
 *
 * Any handler that lists folders, reads files, or explores the PC must call
 * `isProjectCreateBrief` first so build briefs are never misrouted.
 */

import { isProjectCreateBrief, normalizeChatIntentText } from './chatCreateBrief';
import { looksLikeCreateProjectBrief } from './createProjectIntent';

export { isProjectCreateBrief, normalizeChatIntentText } from './chatCreateBrief';

/** User wants to CREATE / BUILD / SCAFFOLD. includes parsed create intents. */
export function isAnyCreateBrief(text: string): boolean {
  const t = normalizeChatIntentText(text);
  if (!t) return false;
  return isProjectCreateBrief(t) || looksLikeCreateProjectBrief(t);
}

/** Read a file from disk. never for create/build briefs. */
export function shouldRouteReadFile(text: string): boolean {
  const t = normalizeChatIntentText(text);
  if (!t) return false;
  if (isAnyCreateBrief(t)) return false;
  if (/\b(delete|remove|trash)\b/i.test(t)) return false;
  if (/\bopen\s+(?:them|it|this|files?)\s+in\s+code\b/i.test(t)) return false;
  // Attached-file follow-ups ("read these four files") — let the brain + attach context handle it.
  if (/\b(?:these|those|attached|all)\b[\s\S]{0,32}\bfiles?\b/i.test(t)) return false;
  if (/\b(?:summarize|summary|read)\b[\s\S]{0,48}\b(?:attached|uploaded)\b/i.test(t)) return false;
  if (/\b(?:summarize|summary)\b/i.test(t) && /\bfiles?\b/i.test(t) && !/[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,12}\b/.test(t)) {
    return false;
  }
  // MCP / tool catalog asks ("break down ark.project.read") — not disk read.
  if (/\bark\.[a-z0-9_-]+\.[a-z0-9_-]+\b/i.test(t)) return false;
  if (/\b(?:break down|explain|describe)\b/i.test(t) && /\b(?:ark\.|mcp\b|tools?)\b/i.test(t)) return false;

  const readVerb = (
    /\b(?:read|show\s+me|display|what(?:'s| is)\s+in)\b/i.test(t)
    || /\bopen\s+(?:the\s+)?file\b/i.test(t)
    || /\bopen\s+[A-Za-z0-9_.-]+\.[A-Za-z0-9]{1,12}\b/i.test(t)
  );
  if (!readVerb) return false;
  if (/\b(?:real|full|actual)\s+files\b/i.test(t) && !/\b(?:read|open\s+the\s+file)\b/i.test(t)) return false;
  return /\.[A-Za-z0-9]{1,12}\b/.test(t) || (/\bfiles?\b/i.test(t) && /\b(?:read|open\s+the)\b/i.test(t));
}

/** Folder catalog / project inventory. never for create/build briefs. */
export function shouldRouteFolderCatalog(text: string): boolean {
  return !isAnyCreateBrief(text);
}

/** PC explore (games, desktop, installed apps). never for create/build briefs. */
export function shouldRoutePcExplore(text: string): boolean {
  return !isAnyCreateBrief(text);
}

/** Natural-language folder path open. never for create/build briefs. */
export function shouldRouteFolderPath(text: string): boolean {
  return !isAnyCreateBrief(text);
}
