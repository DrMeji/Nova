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
  const desc = (label || `ARK ${new Date().toISOString().slice(0, 10)}`).replace(/'/g, "''");
  return `Checkpoint-Computer -Description '${desc}' -RestorePointType MODIFY_SETTINGS`;
}

export function looksLikeReadFileAsk(text: string): boolean {
  return shouldRouteReadFile(text);
}

export function parseReadFileTarget(text: string): { fileName: string | null; parentHint?: string } {
  const t = String(text || '').trim();
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
