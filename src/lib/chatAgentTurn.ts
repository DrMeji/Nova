/**
 * Chat agent turn helpers — workspace gates, Ask/Plan/Agent modes, edit/exec policy.
 */

import { looksLikeBuildStart } from '@/lib/chatStudio';
import { looksLikeImplementGo, isPlanPrefixedMessage } from '@/lib/chatPlanMode';
import { looksLikePromptEcho } from '@/lib/chatHistory';

export const NO_WORKSPACE_MSG =
  'No workspace yet. Use **+ → Open folder** or name a folder on your Desktop (turn on access in **Settings → Security**).\n\nOr describe a **new** app and say **Create project YourName** to scaffold one.';

export type ComposerAgentMode = 'ask' | 'plan' | 'agent' | 'debug' | 'multitask' | null;

export function hasActiveWorkspace(opts: {
  files: Record<string, string>;
  projectId: string | null;
  diskRoot: string | null;
}): boolean {
  return Boolean(
    opts.projectId
    || opts.diskRoot
    || Object.keys(opts.files).length > 0,
  );
}

export function normalizeComposerMode(mode: ComposerAgentMode): 'ask' | 'plan' | 'agent' {
  if (mode === 'plan') return 'plan';
  if (mode === 'ask') return 'ask';
  if (mode === 'agent' || mode === 'debug') return 'agent';
  // Default chat (no chip) and Tasks: allow code edits when the user asks to change code.
  return 'agent';
}

const PLAN_PREFIX = 'Plan this out step by step, then we can build:\n\n';
const AGENT_PREFIX = 'Agent mode — edit files and run approved tools in this workspace:\n\n';
const DEBUG_PREFIX = 'Debug this — find the issue and propose a fix:\n\n';
const TASKS_PREFIX = 'Break this into parallel tasks and tackle them clearly:\n\n';

export function stripComposerPrefix(text: string): string {
  return String(text || '')
    .replace(PLAN_PREFIX, '')
    .replace(AGENT_PREFIX, '')
    .replace(DEBUG_PREFIX, '')
    .replace(TASKS_PREFIX, '')
    .replace(/^[\[](?:Plan|Ask|Debug|Tasks)[\]]\s*/i, '')
    .trim();
}

export function isChatPlanTurn(content: string): boolean {
  return content.startsWith(PLAN_PREFIX) || isPlanPrefixedMessage(content);
}

export function isChatAgentTurn(content: string, composerMode: ComposerAgentMode): boolean {
  if (composerMode === 'agent' || composerMode === 'debug') return true;
  return content.startsWith(AGENT_PREFIX) || looksLikeImplementGo(content);
}

export function modeBlocksFileWrites(mode: 'ask' | 'plan' | 'agent', content: string): boolean {
  if (mode === 'ask') return true;
  if (mode === 'plan') return !looksLikeImplementGo(content);
  return false;
}

export function modeBlocksExec(mode: 'ask' | 'plan' | 'agent'): boolean {
  return mode === 'ask' || mode === 'plan';
}

/** User wants Chat to change code/UI in the open workspace (Codex-style). */
export function looksLikeCodeEditAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (looksLikeImplementGo(t) || looksLikeBuildStart(t)) return true;
  if (
    /\b(add|put|place|move|insert|create)\b[\s\S]{0,100}\b(button|icon|logo|header|footer|nav|navbar|search|settings|sidebar|menu|title|page|tab|modal|form|input|link|preference)\b/i.test(t)
  ) {
    return true;
  }
  if (
    /\b(change|update|set|make|edit|fix|rename|restyle)\b[\s\S]{0,100}\b(background|color|colour|font|title|text|layout|style|css|button|icon|logo|header|copy|wording)\b/i.test(t)
  ) {
    return true;
  }
  if (
    /\b(add|implement|build|create|write)\b[\s\S]{0,100}\b(settings|preferences|search|login|profile|dashboard|page|component|feature|section)\b/i.test(t)
  ) {
    return true;
  }
  if (/\b(refactor|extract|wire(?:\s+up)?|hook up)\b/i.test(t)) return true;
  if (/\b(top right|top left|bottom right|bottom left|center|middle)\b/i.test(t)
    && /\b(add|put|place|move|put)\b/i.test(t)) {
    return true;
  }
  return false;
}

export function chatTurnAllowsFileEdits(content: string, composerMode: ComposerAgentMode): boolean {
  const mode = normalizeComposerMode(composerMode);
  if (modeBlocksFileWrites(mode, content)) return false;
  if (looksLikePromptEcho(content)) return false;
  if (looksLikeImplementGo(content) || looksLikeBuildStart(content) || looksLikeCodeEditAsk(content)) {
    return true;
  }
  if (mode === 'agent') {
    return /\b(create|add|edit|write|implement|build|fix|change|update|delete|remove)\b/i.test(content);
  }
  return false;
}

export function chatTurnAllowsExec(content: string, composerMode: ComposerAgentMode): boolean {
  const mode = normalizeComposerMode(composerMode);
  if (modeBlocksExec(mode)) return false;
  return isChatAgentTurn(content, composerMode)
    || /\b(install|npm|pip|git|run|execute|winget|choco|restore\s+point|checkpoint)\b/i.test(content);
}

export function workspacePathLabel(opts: {
  diskRoot: string | null;
  name?: string | null;
}): string | null {
  if (opts.diskRoot) return opts.diskRoot;
  if (opts.name) return opts.name;
  return null;
}
