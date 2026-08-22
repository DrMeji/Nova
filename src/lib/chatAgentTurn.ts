/**
 * Chat agent turn helpers — workspace gates, Ask/Plan/Agent modes, edit/exec policy.
 */

import { looksLikeBuildStart } from '@/lib/chatStudio';
import { looksLikeImplementGo, isPlanPrefixedMessage } from '@/lib/chatPlanMode';
import { looksLikePromptEcho } from '@/lib/chatHistory';

export const NO_WORKSPACE_MSG =
  'No workspace yet. Use **+ → Open folder** or name a folder on your Desktop (turn on access in **Settings → Security**).';

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
  if (mode === 'agent' || mode === 'debug') return 'agent';
  return 'ask';
}

const PLAN_PREFIX = 'Plan this out step by step, then we can build:\n\n';
const AGENT_PREFIX = 'Agent mode — edit files and run approved tools in this workspace:\n\n';

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

export function chatTurnAllowsFileEdits(content: string, composerMode: ComposerAgentMode): boolean {
  const mode = normalizeComposerMode(composerMode);
  if (modeBlocksFileWrites(mode, content)) return false;
  if (looksLikePromptEcho(content)) return false;
  if (looksLikeImplementGo(content) || looksLikeBuildStart(content)) return true;
  if (mode === 'agent') {
    return /\b(create|add|edit|write|implement|build|fix|change|update|delete|remove)\b/i.test(content);
  }
  return false;
}

export function chatTurnAllowsExec(content: string, composerMode: ComposerAgentMode): boolean {
  const mode = normalizeComposerMode(composerMode);
  if (modeBlocksExec(mode)) return false;
  return isChatAgentTurn(content, composerMode)
    || /\b(install|npm|pip|git|run|execute|winget|choco)\b/i.test(content);
}

export function workspacePathLabel(opts: {
  diskRoot: string | null;
  name?: string | null;
}): string | null {
  if (opts.diskRoot) return opts.diskRoot;
  if (opts.name) return opts.name;
  return null;
}
