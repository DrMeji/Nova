/**
 * New Chat studio loop: inspect uploads in chat, then hand off to Code to build.
 */

import {
  formatLocalFindings,
  isInspectAsk,
  isPatchAsk,
  stripFileBlocks,
  wantsInspectOnly,
  type InspectFinding,
} from '@/lib/projectInspect';
import { looksLikeCodeAsk } from '@/lib/chatIntent';
import { looksLikeFolderCatalogAsk } from '@/lib/folderCatalog';
import { listGitHubRepos, type GitHubRepo } from '@/lib/github';
import { parseGithubRepoRef } from '@/lib/arkGitClient';

export type ChatStudioFiles = Record<string, string>;

export function looksLikeBuildStart(message: string): boolean {
  const t = String(message || '');
  if (wantsInspectOnly(t, false) && !/\b(build|create|make)\b/i.test(t)) return false;
  return (
    /\b(build|create|make|scaffold|start)\b[\s\S]{0,90}\b(app|website|site|page|tool|dashboard|ui|chat\s*gpt|blank page|iphone|ipad|ios|android)\b/i.test(t)
    || (/\b(iphone|ipad|ios|android|app store|play store)\b/i.test(t)
      && /\b(build|create|make|start|want|need|app)\b/i.test(t))
    || /\b(let'?s|lets)\s+(build|make|create|start)\b/i.test(t)
    || /\bstart with a blank\b/i.test(t)
    || /\banother chat\s*gpt\b/i.test(t)
  );
}

export function looksLikeExpandAsk(message: string): boolean {
  return /\b(add|remove|delete|upgrade|rewrite|replace|extend|implement|drop|strip out)\b/i.test(
    message,
  );
}

export type StudioAskKind =
  | 'catalog'
  | 'overview'
  | 'file-detail'
  | 'problems'
  | 'debug'
  | 'security'
  | 'ui'
  | 'security-ui'
  | 'wider'
  | 'fix'
  | 'recommend'
  | 'freeform';

const SMALLTALK_RE =
  /^(hi|hello|hey|yo|sup|howdy|thanks|thank you|ok|okay|cool|nice|sure)[.!\s]*$/i;

/** “How can we fix” / “tell me how we can fix” — always debug, never overview. */
export const STUDIO_FIX_ASK_RE =
  /\b(how (can|do|should|to) (we|i|you) fix|how (we|i) can fix|tell me how (we|to|i) (can )?fix|can you (tell me how|help .+)?\s*fix|fix (it|this|them|all|the problems?)|how to fix|fix all)\b/i;

/** Bigger / wider scan — never fall through to overview. */
export const STUDIO_WIDER_RE =
  /\b(bigger scan|wider scan|deeper scan|full(er)? scan|scan (more|again|everything)|find more (issues|problems|bugs)|more issues|more problems)\b/i;

const STUDIO_CONTINUE_RE = /^(fix|how|yes|go on|go deeper|continue|ok|okay)\b/i;

function cleanStudioAsk(message: string): string {
  return String(message || '')
    .replace(/<!--ark-attach:[\s\S]*?-->/g, '')
    .replace(/<!--ark-auto-read-->/g, '')
    .replace(/^\[(?:Plan|Ask|Debug|Tasks)\]\s*/i, '')
    .trim();
}

/**
 * After security/debug/problems, short “how can we fix” stays on that track.
 * “Bigger scan / find more issues” → wider (checked before generic “more”).
 */
export function continueStudioIntent(
  message: string,
  lastIntent: StudioAskKind | null,
): StudioAskKind | null {
  const ask = cleanStudioAsk(message);
  if (!ask || !lastIntent) return null;
  const prior = lastIntent === 'security' || lastIntent === 'security-ui'
    || lastIntent === 'debug' || lastIntent === 'problems' || lastIntent === 'ui'
    || lastIntent === 'wider' || lastIntent === 'fix' || lastIntent === 'recommend'
    || lastIntent === 'freeform';
  if (!prior) return null;
  if (STUDIO_WIDER_RE.test(ask)) return 'wider';
  if (/\b(i want (some |a )?recommendations?|recommendations?\b|what (do you |would you )?recommend|where (should|do) (we|i) start|where (do you think )?(we|i) should start|what first)\b/i.test(ask)) {
    return 'recommend';
  }
  if (STUDIO_FIX_ASK_RE.test(ask) || STUDIO_CONTINUE_RE.test(ask) || ask.length < 48 && /\bfix\b/i.test(ask)) {
    return 'fix';
  }
  return null;
}

/**
 * Route attached-folder asks by intent.
 * Fix / how-to-fix / wider always win over default overview.
 */
export function classifyStudioAsk(message: string, hasFiles = false): StudioAskKind | null {
  const ask = cleanStudioAsk(message);
  if (!ask) return null;
  if (SMALLTALK_RE.test(ask) && ask.length < 24) return null;

  if (looksLikeFolderCatalogAsk(ask)) return 'catalog';

  if (STUDIO_WIDER_RE.test(ask)) return 'wider';

  if (/\b(i want (some |a )?recommendations?|recommendations?\b|what (do you |would you )?recommend|where (should|do|to) (we|i|you) start|where (do you think )?(we|i) should start|what (should|do) (we|i) (do )?first|recommend(ed)? (next|first)|next step)\b/i.test(ask)) {
    return 'recommend';
  }

  // Fix-how questions — “Can you tell me how we can fix” must never become overview.
  if (STUDIO_FIX_ASK_RE.test(ask) || /^(fix|how)\??$/i.test(ask) || /\bfix\s*#?\s*\d+\b/i.test(ask)) {
    return 'fix';
  }

  const hasSecurity = /\b(security|securit|vulnerab|xss|injection|secret|secrets|malware|eval\b|exploit|cve)\b/i.test(ask);
  const hasUi = /\b(ui|ux|user interface|layout|screen|button|design|looks?)\b/i.test(ask)
    && /\b(problem|issue|bug|broken|wrong|risk|fix|improve|bad)\b/i.test(ask);

  if (hasSecurity && hasUi) return 'security-ui';
  if (hasSecurity) return 'security';
  if (hasUi) return 'ui';

  if (
    /^go into more detail about this project/i.test(ask)
    || /\bwhat the main files do and how they connect\b/i.test(ask)
    || (
      /\b(more details?|go deeper|full details?)\b/i.test(ask)
      && !/\b(security|fix|problem|bug|issue|scan)\b/i.test(ask)
      && !STUDIO_FIX_ASK_RE.test(ask)
      && !STUDIO_WIDER_RE.test(ask)
    )
  ) {
    return 'file-detail';
  }

  if (
    /\blist the most likely problems\b/i.test(ask)
    || (
      /\bfind (the )?most likely problems\b/i.test(ask)
      && !/\bhow to fix\b/i.test(ask)
      && !/\bpropose a (concrete )?fix\b/i.test(ask)
      && !/\bfind bugs, risky code\b/i.test(ask)
    )
  ) {
    return 'problems';
  }

  if (
    /\bpropose a concrete fix for each\b/i.test(ask)
    || /\bfind the issue and propose a fix\b/i.test(ask)
    || /\bfind bugs, risky code\b/i.test(ask)
    || (/\bmost likely problems\b/i.test(ask) && /\bhow to fix\b/i.test(ask))
    || /^\[debug\]/i.test(String(message || '').trim())
    || (/\bdebug this\b/i.test(ask) && ask.length < 180)
    || (/\bdebug\b/i.test(ask) && /\b(folder|project|this|code|app)\b/i.test(ask))
    || (
      /\b(fix|fixes?)\b/i.test(ask)
      && /\b(problem|problems|bug|bugs|issue|issues|these|them|it|all)\b/i.test(ask)
    )
    || /\bfix all the problems\b/i.test(ask)
  ) {
    return 'debug';
  }

  if (
    /\b(what (is|are) this (project|folder|app)|what.?s this (project|folder)|tell me about this (project|folder)|whole (folder|project)|all about)\b/i.test(ask)
    || /\bwhat (am i|i'?m|im) (trying to )?build\b/i.test(ask)
    || /\b(can you |do you )?see (exactly )?what (i'?m|im|i am|i) (trying to )?build\b/i.test(ask)
    || /\b(can you |do you )?see (exactly )?what i'?m\b/i.test(ask)
  ) {
    return 'overview';
  }

  if (
    /\b(main files|how they connect|file by file|each file|go deeper into (the )?files)\b/i.test(ask)
  ) {
    return 'file-detail';
  }

  if (
    /\b(find (bugs|problems|issues)|any (bugs|problems|issues)|most likely problems|risky code|broken paths)\b/i.test(ask)
  ) {
    return 'problems';
  }

  // Sticky files: unclear ask → freeform (never bare chat; not forced overview).
  if (hasFiles) return 'freeform';
  return null;
}

export function isStudioFollowUpAsk(message: string, hasFiles = false): boolean {
  return classifyStudioAsk(message, hasFiles) != null;
}

/**
 * Sticky project context: if files are attached, every non-smalltalk ask uses them.
 */
export function shouldInspectInChat(
  message: string,
  hasFiles: boolean,
  composerDebug = false,
): boolean {
  const t = String(message || '');
  if (t.includes('<!--ark-attach:') || t.includes('<!--ark-auto-read-->')) return true;
  const kind = classifyStudioAsk(t, hasFiles);
  if (kind === 'catalog') return false;
  if (kind != null) return true;
  if (!hasFiles) return false;
  const ask = cleanStudioAsk(t).replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim();
  if (!ask || (SMALLTALK_RE.test(ask) && ask.length < 24)) return false;
  if (composerDebug) return true;
  return true;
}

/** Jump to Code and start/continue work (build, add, remove, upgrade, or apply a fix). */
export function shouldHandoffToCode(
  message: string,
  hasFiles: boolean,
  composerDebug: boolean,
): boolean {
  if (shouldInspectInChat(message, hasFiles, composerDebug)) return false;
  if (isPatchAsk(message) && hasFiles) return true;
  if (looksLikeBuildStart(message)) return true;
  if (hasFiles && looksLikeExpandAsk(message)) return true;
  if (hasFiles && looksLikeCodeAsk(message) && !isInspectAsk(message)) return true;
  return false;
}

export function isGithubPullAsk(message: string): boolean {
  const t = message.toLowerCase();
  if (/\b(pull request|\bprs?\b|issues?)\b/.test(t) && !/\b(clone|pull in|bring in|open .{0,20}repo)\b/.test(t)) {
    return wantsGithubCatalog(message);
  }
  if (/\b(clone|pull in|bring in)\b/.test(t) && (/github|repo/.test(t) || parseGithubRepoRef(message))) {
    return true;
  }
  if (/\bopen\b/.test(t) && (parseGithubRepoRef(message) || /\b(github )?repos?\b/.test(t))) {
    return true;
  }
  if (/\bwork on\b/.test(t) && parseGithubRepoRef(message)) return true;
  return wantsGithubCatalog(message) || /\b(my github|i have (a |something on )?github)\b/i.test(message);
}

export function wantsGithubCatalog(message: string): boolean {
  const t = message.toLowerCase();
  if (parseGithubRepoRef(message) && /\b(clone|open|pull|work on|bring in)\b/.test(t)) return false;
  return (
    /\b(my (github|repos?|repositor)|list (my )?repos?|what repos? do i have|i have (a |something on )?github)\b/i.test(t)
    && !/\b(clone|pull in|open|work on)\s+[\w.-]+\/[\w.-]+/i.test(t)
  );
}

export function pickGithubRepo(repos: GitHubRepo[], message: string): GitHubRepo | null {
  if (!repos.length) return null;
  const named = parseGithubRepoRef(message);
  if (named) {
    const hit = repos.find(
      r => r.full_name.toLowerCase() === `${named.owner}/${named.repo}`.toLowerCase()
        || r.name.toLowerCase() === named.repo.toLowerCase(),
    );
    if (hit) return hit;
  }
  const t = message.toLowerCase();
  if (/\b(empty|blank|new|fresh)\b/.test(t)) {
    const empty = repos.filter(r => (r.size ?? 1) === 0);
    if (empty.length) return empty[0];
  }
  if (/\b(latest|recent|last)\b/.test(t)) return repos[0];
  const word = message.match(/repo(?:sitory)?\s+(?:named|called)\s+([\w.-]+)/i)?.[1];
  if (word) {
    const hit = repos.find(r => r.name.toLowerCase() === word.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

export async function listAccountRepos(token: string) {
  return listGitHubRepos(token, 20);
}

export function formatRepoCatalog(repos: GitHubRepo[], login: string): string {
  if (!repos.length) {
    return `GitHub · @${login}\n\nNo repositories yet. Create one on GitHub (even empty), then say “open owner/repo in Code”.`;
  }
  return [
    `I recognize your GitHub (@${login}). Here are recent repos:`,
    '',
    ...repos.slice(0, 12).map((r) => {
      const vis = r.private ? 'private' : 'public';
      const empty = (r.size ?? 1) === 0 ? ' · empty' : '';
      return `• ${r.full_name} — ${vis}${empty}\n  ${r.html_url}`;
    }),
    '',
    'Say **open owner/repo in Code** (or “pull in the empty one”) and I will clone it into Code so we can add, remove, or upgrade files there.',
  ].join('\n');
}

export function formatChatInspectReply(
  spoken: string,
  findings: InspectFinding[],
  fileNames: string[],
  mode: 'debug' | 'explain' | 'improve' = 'explain',
): string {
  const local = formatLocalFindings(findings);
  const body = [stripFileBlocks(spoken), mode === 'debug' && !spoken.includes('`') && local ? local : '']
    .filter(Boolean)
    .join('\n\n')
    || local
    || `I looked at ${fileNames.slice(0, 6).join(', ') || 'the attached files'}.`;
  if (/would you like|what (would|do) you want|switch to code|keep (working|chatting)|edit in code|want me to|local scan of the files/i.test(body)) {
    return body.trim();
  }
  const ask = mode === 'debug'
    ? '\n\nWhat would you like to do next? Dig deeper here in Chat, or **Edit in Code**.'
    : '\n\nWhat would you like to do next? Keep chatting here, or **Edit in Code** when you want to change files.';
  return `${body.trim()}${ask}`;
}

export function handoffPrompt(userText: string, inspectReply?: string): string {
  const ask = userText.trim();
  if (isPatchAsk(ask) || /fix/i.test(ask)) {
    return inspectReply
      ? `Apply the fix we found in chat:\n${inspectReply.slice(0, 1200)}\n\nUser: ${ask}`
      : ask;
  }
  return ask;
}
