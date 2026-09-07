/**
 * Hands-free project debug: user describes a bug + where the project lives.
 * NOVA should open that folder, scan code, diagnose, and patch — not just explain.
 */

import { parseFolderPathAsk, type FolderPathRef } from '@/lib/folderPathAsk';
import { extractDiskParentHintFromText } from '@/lib/diskPathResolve';
import { isInspectAsk } from '@/lib/projectInspect';

const PROBLEM_RE =
  /\b(?:not working|won't work|doesn't work|doesnt work|broken|bug|bugs|issue|issues|crash|crashes|error|errors|fix|debug|find why|figure out why|having trouble|having problem|having issues|something wrong|fails|failing|stopped working|won't save|doesn't save|nothing happens|doesn't respond)\b/i;

const PROJECT_RE =
  /\b(?:app|application|project|code|codebase|website|site|program|repo|repository|source)\b/i;

/** User wants NOVA to find/fix a problem in a real project on disk. */
export function looksLikeProjectDebugAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  // Chat-thread recap is never a disk-debug request.
  if (/\b(?:summarize|summary|recap)\b/i.test(t) && /\b(?:chat|conversation|thread)\b/i.test(t)) {
    return false;
  }
  if (/\bwhat\s+did\s+we\s+(?:just\s+)?(?:talk|discuss|cover|say)\b/i.test(t)) return false;
  if (/\b(?:can you|could you|help me)\s+(?:edit|read|write)\s+files?\b/i.test(t) && !PROBLEM_RE.test(t)) {
    return false;
  }
  const hasProblem = PROBLEM_RE.test(t) || isInspectAsk(t);
  if (!hasProblem) return false;
  if (parseProjectDebugTarget(t)) return true;
  return PROJECT_RE.test(t);
}

export type ProjectDebugTarget =
  | { kind: 'folder'; folderRef: FolderPathRef }
  | { kind: 'hint'; parentHint: string };

export function parseProjectDebugTarget(text: string): ProjectDebugTarget | null {
  const t = String(text || '').trim();
  const folderRef = parseFolderPathAsk(t);
  if (folderRef) return { kind: 'folder', folderRef };

  const parentHint = extractDiskParentHintFromText(t);
  if (parentHint) return { kind: 'hint', parentHint };

  const appIn = t.match(
    /\b(?:app|project|code|site|website)\s+(?:is\s+)?(?:in|at|under)\s+([A-Za-z]:\\[^\s"'<>|,]+)/i,
  );
  if (appIn?.[1]) {
    const rawPath = appIn[1].replace(/[.,;:]+$/g, '');
    return {
      kind: 'folder',
      folderRef: {
        scope: 'absolute',
        name: rawPath.split(/[/\\]/).pop() || rawPath,
        rawPath,
      },
    };
  }

  return null;
}

/** Prefer folder path when an absolute path might point at a file. */
export function folderPathFromDebugTarget(target: ProjectDebugTarget): string | null {
  if (target.kind === 'hint') return null;
  const ref = target.folderRef;
  if (ref.scope === 'absolute' && ref.rawPath) return ref.rawPath;
  return null;
}
