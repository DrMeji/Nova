/**
 * Hands-free project debug: user describes a bug + where the project lives.
 * NOVA should open that folder, scan code, diagnose, and patch — not just explain.
 */

import { parseFolderPathAsk, type FolderPathRef } from '@/lib/folderPathAsk';
import { extractDiskParentHintFromText } from '@/lib/diskPathResolve';
import { isExplainAsk, isInspectAsk } from '@/lib/projectInspect';

const PROBLEM_RE =
  /\b(?:not working|won't work|doesn't work|doesnt work|broken|bug|bugs|issue|issues|problems?|crash|crashes|error|errors|fix|debug|find why|figure out why|having trouble|having (?:a )?problem|having issues|something wrong|fails|failing|stopped working|won't save|doesn't save|nothing happens|doesn't respond|stuck on|can't (?:switch|open|save|load|login|log in)|find (?:all |the )?(?:problems?|bugs?|issues?))\b/i;

const HELP_WITH_PROBLEM_RE =
  /\b(?:help me out|can you help|could you help)\b/i;

const PROJECT_RE =
  /\b(?:app|application|project|code|codebase|website|site|program|repo|repository|source)\b/i;

/** UI / feature nouns — enough to diagnose without saying “project”. */
const FEATURE_AREA_RE =
  /\b(?:settings?|profile|account|login|sign[\s-]?in|search|nav(?:igation)?|sidebar|header|footer|dashboard|button|screen|page|tab|modal|form|menu|routing|switch(?:ing)?)\b/i;

/** User wants a plain “what is this project?” answer — never diagnose / clinic. */
export function looksLikeProjectOverviewAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (isExplainAsk(t)) return true;
  // Follow-ups that stay on the bound folder (not the public web).
  if (/\b(?:this|the|my|our)\s+(?:project|folder|app|codebase|code)\b/i.test(t)
    && /\b(?:about|overview|summary|explain|information|details?|tell me|what is|more|report)\b/i.test(t)
    && !/\b(?:github|pull request|\bprs?\b|clone|oauth)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:full\s+)?report\s+on\s+(?:this|the|my|our)\s+(?:project|folder|app)\b/i.test(t)) return true;
  if (/\bmore\s+(?:info|information|details?)\s+(?:on|about)\s+(?:this|the|my|our)\s+(?:project|folder|app)\b/i.test(t)) {
    return true;
  }
  if (/\bgive me\s+(?:more\s+)?(?:info|information|details?|a\s+(?:full\s+)?report)\b/i.test(t)
    && /\b(?:this|the|my|our)\s+(?:project|folder|app)\b/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * Ask is about the bound on-disk project — never hijack to GitHub catalog, plugins, or web search.
 */
export function looksLikeBoundProjectAsk(text: string): boolean {
  return looksLikeProjectOverviewAsk(text) || looksLikeProjectDebugAsk(text);
}

/** User wants NOVA to find/fix a problem in a real project on disk. */
export function looksLikeProjectDebugAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  // Overview / “what is this about” is never a diagnose pass.
  if (looksLikeProjectOverviewAsk(t)) return false;
  // Chat-thread recap is never a disk-debug request.
  if (/\b(?:summarize|summary|recap)\b/i.test(t) && /\b(?:chat|conversation|thread)\b/i.test(t)) {
    return false;
  }
  if (/\bwhat\s+did\s+we\s+(?:just\s+)?(?:talk|discuss|cover|say)\b/i.test(t)) return false;
  // Pure knowledge / explain asks (e.g. "atmosphere error" in a GPS lesson) are not disk debug.
  if (
    /\b(?:explain\s+how|how\s+does|what\s+is|describe\s+how|be\s+thorough)\b/i.test(t)
    && !/\b(?:my|this|the)\s+(?:app|project|code|site|website|repo)\b/i.test(t)
    && !FEATURE_AREA_RE.test(t)
    && !parseFolderPathAsk(t)
    && !extractDiskParentHintFromText(t)
  ) {
    return false;
  }
  if (/\b(?:can you|could you|help me)\s+(?:edit|read|write)\s+files?\b/i.test(t) && !PROBLEM_RE.test(t)) {
    return false;
  }
  // Real problem language only — do NOT treat every inspect/explain ask as debug.
  const hasProblem = PROBLEM_RE.test(t)
    || (HELP_WITH_PROBLEM_RE.test(t) && (FEATURE_AREA_RE.test(t) || PROJECT_RE.test(t)))
    || (isInspectAsk(t) && PROBLEM_RE.test(t));
  if (!hasProblem) return false;
  if (parseProjectDebugTarget(t)) return true;
  return PROJECT_RE.test(t) || FEATURE_AREA_RE.test(t);
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
