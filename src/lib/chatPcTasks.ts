/**
 * PC system tasks from Chat. restore points, read file on disk, safe PowerShell.
 */

import { extractDiskParentHintFromText } from './diskPathResolve';
import { extractNamedDiskTarget, normalizeDiskFileName } from './projectNames';
import { parseDeleteFileTarget } from './chatDiskIntent';
import { shouldRouteReadFile } from './chatRouteGuards';

export function looksLikeRestorePointAsk(text: string): boolean {
  const t = String(text || '').trim();
  return (
    /\b(?:create|make|set\s+up|add)\s+(?:a\s+)?(?:system\s+)?restore\s+point\b/i.test(t)
    || /\brestore\s+point\s+(?:for\s+)?(?:today|now|this)\b/i.test(t)
    || /\bneed\s+(?:a\s+)?restore\s+point\b/i.test(t)
  );
}

export function buildRestorePointCommand(label?: string): string {
  const desc = (label || `NOVA ${new Date().toISOString().slice(0, 10)}`).replace(/'/g, "''");
  return `Checkpoint-Computer -Description '${desc}' -RestorePointType MODIFY_SETTINGS`;
}

export function looksLikeReadFileAsk(text: string): boolean {
  return shouldRouteReadFile(text);
}

export function parseReadFileTarget(text: string): { fileName: string | null; parentHint?: string } {
  const t = String(text || '').trim();

  const quoted = t.match(/["“']([A-Za-z]:\\[^"”']+)["”']/);
  if (quoted?.[1]) {
    return { fileName: quoted[1].replace(/[.,;:]+$/g, ''), parentHint: undefined };
  }

  const readAbs = t.match(/\bread\s+(?:the\s+(?:file\s+)?)?([A-Za-z]:\\(?:[^\s"'<>|]+\\)*[^\s"'<>|]+)/i);
  if (readAbs?.[1]) {
    let path = readAbs[1].trim().replace(/[.,;:]+$/g, '');
    // "C:\...\folder file.ext" pasted from Explorer — prefer the last path segment as file.
    if (/\s+\S+\.\w+$/.test(path) && !/\\\s/.test(path)) {
      const lastSpace = path.lastIndexOf(' ');
      const tail = path.slice(lastSpace + 1);
      if (/^[^\s\\/]+\.\w+$/.test(tail)) {
        path = `${path.slice(0, lastSpace)}\\${tail}`.replace(/\\+/g, '\\');
      }
    }
    return { fileName: path, parentHint: undefined };
  }

  const winPath = t.match(/\b([A-Za-z]:\\(?:[^\s"'<>|]+\\)*[^\s"'<>|]+)\b/);
  if (winPath?.[1]) {
    const path = winPath[1].replace(/[.,;:]+$/g, '');
    const fileInFolder = t.match(
      /\b(?:file\s+)?(?:called|named)\s+["'`]?([A-Za-z0-9._-]+)["'`]?/i,
    ) || t.match(
      /\b(?:read|show|open)\s+(?:me\s+)?(?:the\s+)?(?:file\s+)?["'`]?([A-Za-z0-9._-]+(?:\.[A-Za-z0-9]{1,12})?)["'`]?/i,
    );
    if (fileInFolder?.[1] && !/\.[A-Za-z0-9]{1,6}$/i.test(path)) {
      return { fileName: normalizeDiskFileName(fileInFolder[1]), parentHint: path };
    }
    return { fileName: path, parentHint: undefined };
  }

  const fromDeleteParse = parseDeleteFileTarget(t.replace(/\b(?:read|open|show)\b/i, 'delete'));
  if (fromDeleteParse.fileName) {
    return { fileName: fromDeleteParse.fileName, parentHint: fromDeleteParse.parentHint };
  }

  const patterns = [
    /\bfile\s+(?:called|named)\s+["“']?([A-Za-z0-9 _./\\-]{1,120})["”']?/i,
    /\bread\s+(?:the\s+)?file\s+["“']?([A-Za-z0-9 _./\\-]{1,120})["”']?/i,
    /\b([A-Za-z0-9_./\\-]+\.[A-Za-z0-9]{1,12})\b/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) return { fileName: normalizeDiskFileName(m[1]), parentHint: extractDiskParentHintFromText(t) };
  }

  const named = extractNamedDiskTarget(t);
  if (named) {
    return { fileName: normalizeDiskFileName(named), parentHint: extractDiskParentHintFromText(t) };
  }

  return { fileName: null, parentHint: extractDiskParentHintFromText(t) };
}

export function extractWriteFileContent(text: string): string | null {
  const t = String(text || '').trim();
  if (!t) return null;
  // Prefer a markdown fence when the user pastes code/notes to put in the file.
  const fence = t.match(/```[^\n]*\n([\s\S]*?)```/);
  if (fence?.[1] != null) {
    const body = fence[1].replace(/\s+$/, '');
    if (body.trim()) return `${body}\n`;
  }
  const patterns = [
    /\bcontent\s+["“']([^"”']+)["”']/i,
    /\bwith\s+(?:the\s+)?(?:content|text)\s+["“']([^"”']+)["”']/i,
    /\bsay(?:ing)?\s+["“']([^"”']+)["”']/i,
    /\bcontaining\s+["“']([^"”']+)["”']/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}
