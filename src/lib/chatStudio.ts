/**
 * New Chat studio loop: inspect uploads in chat, then hand off to Code to build.
 */

import {
  formatLocalFindings,
  isInspectAsk,
  isPatchAsk,
  scanProjectFindings,
  stripFileBlocks,
  wantsInspectOnly,
  type InspectFinding,
} from '@/lib/projectInspect';
import { looksLikeCodeAsk } from '@/lib/chatIntent';
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

/** Stay in New Chat and inspect — do not jump to Code yet. */
export function shouldInspectInChat(
  message: string,
  hasFiles: boolean,
  composerDebug: boolean,
): boolean {
  if (!hasFiles) return false;
  return wantsInspectOnly(message, composerDebug) || isInspectAsk(message) || composerDebug;
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
): string {
  const local = formatLocalFindings(findings);
  const body = [stripFileBlocks(spoken), !spoken.includes('`') && local ? local : '']
    .filter(Boolean)
    .join('\n\n')
    || local
    || `I looked at ${fileNames.slice(0, 6).join(', ') || 'the attached files'}.`;
  const ask = /would you like|open (this )?in code|fix it/i.test(body)
    ? ''
    : '\n\nI found the issue(s) above. **Would you like me to open this in Code and fix it?** You can also add, remove, or upgrade from there.';
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
